/**
 * M2 Integration tests — Phase 5 (T5.1)
 *
 * Cross-component integration tests exercising the full SDD runtime flows A–E.
 * All nine flows from the phase-5.md spec are covered here.
 *
 * Wire strategy:
 * - Real ConsentGate, ViewImporter, DataviewDqlEngine, DataviewJsEngine,
 *   EngineRegistry, ViewStore (backed by an in-memory port).
 * - Mock harness from test/__mocks__/obsidian.ts for App, TFile, Plugin, etc.
 * - vault.read is a vi.fn() stub returning fenced-block note content.
 * - metadataCache.getFileCache is a vi.fn() stub returning frontmatter.
 * - wireDataviewApi() wires the mock Dataview API onto the app's plugin slot.
 * - Modal button clicks: use vi.waitFor() to poll document.body for buttons
 *   (the same pattern as DisclosureModal.test.ts), since present() is async
 *   and the modal mounts during an awaited readFencedBlock microtask.
 * - _runCleanup() on a Plugin simulates unload and checks listener release.
 *
 * Notes on sf-engine frontmatter:
 * - The inferred engine for fence language "dataview" is "dataview-dql".
 * - If sf-engine is present it must equal the inferred engine exactly.
 * - Fixtures omit sf-engine (or use "dataviewjs") to avoid ENGINE_MISMATCH.
 *
 * @ref SDD/Runtime View — Flows A–E
 * @ref PRD/Success Metrics — Tracking Requirements
 * @ref PRD/AC-F2.4 (checksum re-consent on any byte change)
 * @ref SDD/ADR-2 (late-join listener auto-cleaned)
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
	App,
	TFile,
	augmentEl,
	createMockTFile,
	createMockDataviewApi,
	wireDataviewApi,
	WorkspaceLeaf,
} from "../__mocks__/obsidian";

import { ConsentGate } from "consent/ConsentGate";
import type { EngineRegistryLike, DvSettingsReader, ConsentDecision } from "consent/ConsentGate";
import { computeChecksum } from "consent/checksum";
import { ViewImporter, ImportError } from "import/ViewImporter";
import { ViewStore } from "store/ViewStore";
import { EngineRegistry } from "engines/QueryEngine";
import { buildEngineRegistry } from "engines/EngineRegistry";
import { DataviewDqlEngine } from "engines/DataviewDqlEngine";
import { DataviewJsEngine } from "engines/DataviewJsEngine";
import { NativeScopingEngine } from "engines/NativeScopingEngine";
import { SidebarView } from "views/SidebarView";
import { SIDEBAR_VIEW_TYPE } from "pluginConstants";
import type { ViewRecord } from "store/types";
import type { NoteContext } from "scoping/NoteContext";
import { inertConsentGateSeams } from "../helpers/viewFixtures";

// ---------------------------------------------------------------------------
// Platform mock (consistent with unit test pattern)
// ---------------------------------------------------------------------------

vi.mock("obsidian", async (importOriginal) => {
	const actual = await importOriginal<typeof import("obsidian")>();
	return {
		...actual,
		Platform: { isMobile: false, isDesktop: true },
	};
});

import { Platform } from "obsidian";

// ---------------------------------------------------------------------------
// Note content fixtures
//
// sf-engine is intentionally ABSENT in DQL fixtures: the inferred engine for
// fence language "dataview" is "dataview-dql", and sf-engine: "dataview" would
// cause ENGINE_MISMATCH (the cross-check compares sf-engine to the inferred
// value "dataview-dql", not the fence language tag).
// ---------------------------------------------------------------------------

const DVJS_BODY = "dv.paragraph('hello')\n";
const DVJS_CONTENT = [
	"---",
	"sf-view: true",
	"sf-version: 1",
	"sf-name: Scene Debug",
	"sf-engine: dataviewjs",
	"---",
	"",
	"```dataviewjs",
	DVJS_BODY.trimEnd(),
	"```",
	"",
].join("\n");

const DQL_BODY = "TABLE file.name FROM #canon\n";
// sf-engine absent — engine inferred from fence language "dataview" → "dataview-dql"
const DQL_CONTENT = [
	"---",
	"sf-view: true",
	"sf-version: 1",
	"sf-name: Characters in scene",
	"---",
	"",
	"```dataview",
	DQL_BODY.trimEnd(),
	"```",
	"",
].join("\n");

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

/** In-memory ViewStore backed by a plain JS object. */
function makeStore(): ViewStore {
	const data: Record<string, unknown> = {};
	const port = {
		load: vi.fn(async () => ({ ...data })),
		save: vi.fn(async (d: unknown) => {
			const typed = d as Record<string, unknown>;
			// Replace data in-place
			for (const k of Object.keys(data)) delete data[k];
			Object.assign(data, typed);
		}),
	};
	return new ViewStore(port);
}

/** Build a minimal NoteContext for render calls. */
function makeCtx(subjectPath = "notes/chapter-01.md"): NoteContext {
	const activeFile = createMockTFile({ path: subjectPath, basename: "chapter-01" });
	return {
		activeFile,
		activeKind: "scene",
		entities: [],
		backlinks: [],
		frontmatter: {},
		resolvedAt: Date.now(),
	};
}

/** Build an augmented div for use as a render target. */
function makeEl(): HTMLElement {
	return augmentEl(document.createElement("div"));
}

/** Build a DvSettingsReader with a fixed isDvJsEnabled result. */
function makeDvSettings(dvJsEnabled: boolean): DvSettingsReader {
	return { isDvJsEnabled: vi.fn(() => dvJsEnabled) };
}

/** Build a ConsentGate backed by a real registry + real store. */
function makeGate(
	app: App,
	registry: EngineRegistryLike,
	store: ViewStore,
	dvJsEnabled = true,
): ConsentGate {
	return new ConsentGate(app, registry, makeDvSettings(dvJsEnabled), store, ...inertConsentGateSeams());
}

/**
 * Wait until a button with the given label appears in document.body, then
 * return it. Uses vi.waitFor() to poll across async microtask boundaries.
 * This pattern mirrors DisclosureModal.test.ts.
 */
async function waitForButton(label: string): Promise<HTMLButtonElement> {
	return vi.waitFor(
		() => {
			const buttons = Array.from(document.body.querySelectorAll("button"));
			const btn = buttons.find((b) => b.textContent?.trim() === label);
			if (!btn) throw new Error(`Button "${label}" not found in document.body`);
			return btn as HTMLButtonElement;
		},
		{ timeout: 2000, interval: 10 },
	);
}

// ---------------------------------------------------------------------------
// FLOW 1 — DataviewJS full consent flow (SDD Flow C)
//
// import → evaluate = not-consented → requestConsent (full-disclosure modal)
// → Enable → okayed:{version,checksum} written → evaluate = consented
// → DataviewJsEngine.render() calls dvApi.executeJs with the SUBJECT PATH.
//
// Critical assertion: executeJs is NOT called at any point before okayed is
// written (call-order/spy assertion satisfying SDD Quality: Correctness/Security).
// ---------------------------------------------------------------------------

describe("Flow 1 — DataviewJS full consent flow (SDD Flow C)", () => {
	afterEach(() => {
		document.body.innerHTML = "";
	});

	it("executeJs is NOT called before okayed is written; after Enable it is called with subject path", async () => {
		(Platform as { isMobile: boolean }).isMobile = false;

		const app = new App();
		const file = new TFile();
		file.path = "views/scene-debug.md";
		file.basename = "scene-debug";
		vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((p) =>
			p === "views/scene-debug.md" ? file : null,
		);
		vi.mocked(app.vault.read).mockResolvedValue(DVJS_CONTENT);
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue({
			frontmatter: { "sf-view": true, "sf-version": 1, "sf-name": "Scene Debug", "sf-engine": "dataviewjs" },
		});

		const dvApi = createMockDataviewApi({ satisfies: true, enableDataviewJs: true });
		wireDataviewApi(app, dvApi);

		const registry = buildEngineRegistry(app);
		const store = makeStore();
		const gate = makeGate(app, registry, store, true);
		const engine = new DataviewJsEngine(app);
		const el = makeEl();
		const ctx = makeCtx("notes/chapter-01.md");

		// Step 1: import note into store
		const importer = new ViewImporter(app, store);
		const tfile = createMockTFile({ path: "views/scene-debug.md", basename: "scene-debug" });
		const def = await importer.parse(tfile);
		expect(def.engine).toBe("dataviewjs");
		const viewId = await importer.importToStore(def);

		// Step 2: imported record is not-consented (enabled:false by default)
		const views = await store.getViews();
		const record = views[viewId]!;
		expect(record.okayed).toBeNull();

		// Assert: executeJs not called yet (before any consent)
		expect(dvApi.executeJs).not.toHaveBeenCalled();

		// Step 3: enable the record and verify evaluate → not-consented
		const enabledRecord: ViewRecord = { ...record, enabled: true };
		await store.setRecord(viewId, enabledRecord);
		const decision1 = await gate.evaluate(enabledRecord);
		expect(decision1.status).toBe("not-consented");

		// Assert: still not called before consent modal interaction
		expect(dvApi.executeJs).not.toHaveBeenCalled();

		// Step 4: open consent modal, wait for Enable button, click it
		const consentPromise = gate.requestConsent(viewId, enabledRecord);
		const enableBtn = await waitForButton("Enable");

		// Assert: executeJs still not called while modal is open (before Enable click)
		expect(dvApi.executeJs).not.toHaveBeenCalled();

		enableBtn.click();
		const granted = await consentPromise;
		expect(granted).toBe(true);

		// Step 5: okayed must now be written
		const updatedViews = await store.getViews();
		const updatedRecord = updatedViews[viewId]!;
		expect(updatedRecord.okayed).not.toBeNull();
		expect(updatedRecord.okayed?.checksum).toMatch(/^sha256:[0-9a-f]{64}$/);
		expect(updatedRecord.enabled).toBe(true);

		// Step 6: evaluate → consented
		const decision2 = await gate.evaluate(updatedRecord);
		expect(decision2.status).toBe("consented");

		// Step 7: engine.render() calls dvApi.executeJs with the SUBJECT path
		await engine.render(updatedRecord, ctx, el);
		expect(dvApi.executeJs).toHaveBeenCalledTimes(1);
		const [, , , filePathArg] = vi.mocked(dvApi.executeJs).mock.calls[0]!;
		// ADR-3: filePath is the SUBJECT path, NOT the view source path
		expect(filePathArg).toBe("notes/chapter-01.md");
		expect(filePathArg).not.toBe("views/scene-debug.md");
	});
});

// ---------------------------------------------------------------------------
// FLOW 2 — DQL light-confirm consent flow
//
// import DQL note → evaluate = not-consented → requestConsent (light-confirm)
// → Enable → consented → DataviewDqlEngine.render() calls dvApi.execute with
// the SUBJECT path.
// ---------------------------------------------------------------------------

describe("Flow 2 — DQL light-confirm consent flow", () => {
	afterEach(() => {
		document.body.innerHTML = "";
	});

	it("DQL import → light-confirm Enable → consented → dvApi.execute called with subject path", async () => {
		(Platform as { isMobile: boolean }).isMobile = false;

		const app = new App();
		const file = new TFile();
		file.path = "views/chars.md";
		file.basename = "chars";
		vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((p) =>
			p === "views/chars.md" ? file : null,
		);
		vi.mocked(app.vault.read).mockResolvedValue(DQL_CONTENT);
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue({
			// sf-engine intentionally absent: inferred from fence language
			frontmatter: { "sf-view": true, "sf-version": 1, "sf-name": "Characters in scene" },
		});

		const dvApi = createMockDataviewApi({ satisfies: true, enableDataviewJs: false });
		wireDataviewApi(app, dvApi);

		const registry = buildEngineRegistry(app);
		const store = makeStore();
		const gate = makeGate(app, registry, store, false); // DQL doesn't need dvjs
		const engine = new DataviewDqlEngine(app);
		const el = makeEl();
		const ctx = makeCtx("notes/act1-scene2.md");

		// Import
		const importer = new ViewImporter(app, store);
		const tfile = createMockTFile({ path: "views/chars.md", basename: "chars" });
		const def = await importer.parse(tfile);
		expect(def.engine).toBe("dataview-dql");
		const viewId = await importer.importToStore(def);

		// Enable and verify not-consented
		const views = await store.getViews();
		const record = views[viewId]!;
		const enabledRecord: ViewRecord = { ...record, enabled: true };
		await store.setRecord(viewId, enabledRecord);

		const decision1 = await gate.evaluate(enabledRecord);
		expect(decision1.status).toBe("not-consented");

		// requestConsent opens light-confirm modal
		const consentPromise = gate.requestConsent(viewId, enabledRecord);
		const enableBtn = await waitForButton("Enable");
		enableBtn.click();

		const granted = await consentPromise;
		expect(granted).toBe(true);

		// okayed written
		const updatedViews = await store.getViews();
		const updatedRecord = updatedViews[viewId]!;
		expect(updatedRecord.okayed).not.toBeNull();

		// evaluate → consented
		const decision2 = await gate.evaluate(updatedRecord);
		expect(decision2.status).toBe("consented");

		// engine.render calls dvApi.execute with the SUBJECT path (ADR-3)
		await engine.render(updatedRecord, ctx, el);
		expect(dvApi.execute).toHaveBeenCalledTimes(1);
		const [, , , dqlFilePath] = vi.mocked(dvApi.execute).mock.calls[0]!;
		expect(dqlFilePath).toBe("notes/act1-scene2.md");
		expect(dqlFilePath).not.toBe("views/chars.md");
	});
});

// ---------------------------------------------------------------------------
// FLOW 3 — Native fallback when Dataview absent (SDD Flow E)
//
// buildEngineRegistry(app) with no Dataview → empty registry →
// NativeScopingEngine renders entity context without crash.
// ---------------------------------------------------------------------------

describe("Flow 3 — Native fallback when Dataview absent (SDD Flow E)", () => {
	it("buildEngineRegistry returns empty registry when Dataview absent", () => {
		const app = new App();
		// No Dataview wired
		const registry = buildEngineRegistry(app);
		expect(registry.get("dataview-dql")).toBeUndefined();
		expect(registry.get("dataviewjs")).toBeUndefined();
	});

	it("NativeScopingEngine.render() renders entity context without crash", async () => {
		const app = new App();
		const engine = new NativeScopingEngine(app);
		const el = makeEl();
		const entityFile = createMockTFile({ path: "notes/mara.md", basename: "mara" });
		const ctx: NoteContext = {
			activeFile: createMockTFile({ path: "notes/act1.md", basename: "act1" }),
			activeKind: "scene",
			entities: [
				{ field: "characters", file: entityFile, kind: "character", relation: "outgoing" },
			],
			backlinks: [],
			frontmatter: {},
			resolvedAt: Date.now(),
		};

		// Must not throw even with null view (engine-missing → native fallback)
		await expect(engine.render(null, ctx, el)).resolves.not.toThrow();
		// Entity content rendered into el (scene renderer shows entity basenames in Characters section)
		expect(el.textContent).toContain("mara");
	});

	it("NativeScopingEngine.teardown() is safe before render (no-op)", () => {
		const app = new App();
		const engine = new NativeScopingEngine(app);
		expect(() => engine.teardown()).not.toThrow();
	});

	it("ConsentGate returns engine-missing when registry is empty", async () => {
		const app = new App();
		const emptyRegistry = new EngineRegistry([]);
		const store = makeStore();
		const gate = makeGate(app, emptyRegistry, store);

		const record: ViewRecord = {
			provenance: "imported",
			enabled: true,
			okayed: { version: 1, checksum: "sha256:" + "a".repeat(64) },
			source: "views/chars.md",
			engine: "dataview-dql",
			command: false,
			kind: "view",
			surfaces: { anvil: false, workbench: false },
		};

		const decision = await gate.evaluate(record);
		expect(decision.status).toBe("engine-missing");
	});

	it("SidebarView with empty registry renders S11 engine-missing and calls nativeEngine.render (no crash)", async () => {
		// This is the integration test for SDD Flow E: the actual render pipeline,
		// not just individual components.
		//
		// Wire: real EngineRegistry (empty) + mock ConsentGate returning engine-missing
		// + mock NativeScopingEngine + real SidebarView constructor
		// (signature: leaf + registry + consentGate + nativeEngine — per T4.1)
		const app = new App();
		const leaf = new WorkspaceLeaf();
		leaf.app = app;
		// Mark the leaf as the view's own leaf type so _doFollow guards pass
		leaf.view.getViewType = vi.fn(() => SIDEBAR_VIEW_TYPE);

		const emptyRegistry = new EngineRegistry([]);
		const nativeEngine = {
			kind: "native" as const,
			teardown: vi.fn(),
			render: vi.fn(async () => {}),
		} as unknown as NativeScopingEngine;

		// mockGate is set up but NEVER called — the registry-miss short-circuit
		// in _renderResolved returns before reaching consentGate.evaluate().
		// This is the registry-miss branch (S11), not the consent engine-missing path.
		const mockGate = {
			evaluate: vi.fn(async (): Promise<ConsentDecision> => ({ status: "engine-missing" })),
			requestConsent: vi.fn(async () => false),
			requestReConsent: vi.fn(async () => false),
		} as unknown as ConsentGate;

		// Construct SidebarView with the injected deps (T4.1 constructor signature)
		const view = new SidebarView(leaf, emptyRegistry, mockGate, nativeEngine);
		await view.onOpen();

		// Set a currentRecord so the dispatch path reaches the engine lookup
		const record: ViewRecord = {
			provenance: "imported",
			enabled: true,
			okayed: { version: 1, checksum: "sha256:" + "a".repeat(64) },
			source: "views/chars.md",
			engine: "dataview-dql",
			command: false,
			kind: "view",
			surfaces: { anvil: false, workbench: false },
		};

		const ctx: NoteContext = {
			activeFile: createMockTFile({ path: "notes/scene1.md", basename: "scene1" }),
			activeKind: "scene",
			entities: [],
			backlinks: [],
			frontmatter: {},
			resolvedAt: Date.now(),
		};

		// Access the internal render entry point (same idiom as engineDispatch.test.ts)
		const privateView = view as unknown as {
			currentRecord: ViewRecord | null;
			_renderResolved(body: HTMLElement, ctx: NoteContext): Promise<void>;
		};
		privateView.currentRecord = record;

		const body = view.contentEl.querySelector(".sf-body") as HTMLElement;
		expect(body).not.toBeNull();

		// Drive the render pipeline — must not throw
		await expect(privateView._renderResolved(body, ctx)).resolves.not.toThrow();

		// consentGate.evaluate() is NEVER called — the registry-miss path short-circuits
		expect(mockGate.evaluate).not.toHaveBeenCalled();

		// (a) S11 engine-missing element is in the DOM
		expect(body.querySelector(".sf-engine-missing")).not.toBeNull();

		// (b) native fallback ran (nativeEngine.render was called)
		expect(nativeEngine.render).toHaveBeenCalled();

		await view.onClose();
	});
});

// ---------------------------------------------------------------------------
// FLOW 4 — Re-consent on checksum drift (SDD Flow D / PRD AC-F2.4)
//
// consented DVJS view → mutate fenced-block bytes (any byte change) →
// evaluate() = {status:"drift", reason:"checksum"} →
// requestReConsent() → Enable → evaluate() = consented again.
// ---------------------------------------------------------------------------

describe("Flow 4 — Re-consent on checksum drift (AC-F2.4)", () => {
	afterEach(() => {
		document.body.innerHTML = "";
	});

	it("evaluate returns drift/checksum after fenced block body changes; re-consent restores consented", async () => {
		(Platform as { isMobile: boolean }).isMobile = false;

		const originalBody = "dv.paragraph('original')\n";
		const checksum = await computeChecksum(originalBody);

		const app = new App();
		const file = new TFile();
		file.path = "views/scene-debug.md";
		vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((p) =>
			p === "views/scene-debug.md" ? file : null,
		);
		vi.mocked(app.vault.read).mockResolvedValue(
			"```dataviewjs\n" + originalBody + "```\n",
		);
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue({
			frontmatter: { "sf-version": 1 },
		});

		const dvApi = createMockDataviewApi({ satisfies: true, enableDataviewJs: true });
		wireDataviewApi(app, dvApi);

		const registry = buildEngineRegistry(app);
		const store = makeStore();
		const gate = makeGate(app, registry, store, true);

		// Seed a consented record with the known checksum
		const record: ViewRecord = {
			provenance: "imported",
			enabled: true,
			okayed: { version: 1, checksum },
			source: "views/scene-debug.md",
			engine: "dataviewjs",
			command: false,
			commandName: "Scene Debug",
			kind: "view",
			surfaces: { anvil: false, workbench: false },
		};
		const viewId = "view-drift-checksum";
		await store.setRecord(viewId, record);

		// Verify consented with original content
		const decision1 = await gate.evaluate(record);
		expect(decision1.status).toBe("consented");

		// Mutate fenced-block bytes — any byte change triggers drift (AC-F2.4)
		const mutatedBody = "dv.paragraph('mutated')\n";
		vi.mocked(app.vault.read).mockResolvedValue(
			"```dataviewjs\n" + mutatedBody + "```\n",
		);

		// evaluate → drift/checksum
		const decision2 = await gate.evaluate(record);
		expect(decision2.status).toBe("drift");
		expect(decision2.status === "drift" && decision2.reason).toBe("checksum");

		// requestReConsent → user clicks Enable
		const reConsentPromise = gate.requestReConsent(viewId, record);
		const enableBtn = await waitForButton("Enable");

		// Assert: dvApi.executeJs not called while modal is open
		expect(dvApi.executeJs).not.toHaveBeenCalled();

		enableBtn.click();
		const granted = await reConsentPromise;
		expect(granted).toBe(true);

		// okayed updated with new checksum
		const updatedViews = await store.getViews();
		const updatedRecord = updatedViews[viewId]!;
		expect(updatedRecord.okayed).not.toBeNull();
		const newChecksum = updatedRecord.okayed!.checksum;
		const expectedNewChecksum = await computeChecksum(mutatedBody);
		expect(newChecksum).toBe(expectedNewChecksum);
		expect(newChecksum).not.toBe(checksum); // different from original

		// evaluate → consented again
		const decision3 = await gate.evaluate(updatedRecord);
		expect(decision3.status).toBe("consented");
	});
});

// ---------------------------------------------------------------------------
// FLOW 5 — Re-consent on version drift
//
// consented DQL view → change sf-version in frontmatter (mock) →
// evaluate() = {status:"drift", reason:"version"} → light re-confirm → consented.
// ---------------------------------------------------------------------------

describe("Flow 5 — Re-consent on version drift", () => {
	afterEach(() => {
		document.body.innerHTML = "";
	});

	it("evaluate returns drift/version when sf-version increments; re-consent restores consented", async () => {
		(Platform as { isMobile: boolean }).isMobile = false;

		const originalBody = "TABLE file.name FROM #canon\n";
		const checksum = await computeChecksum(originalBody);

		const app = new App();
		const file = new TFile();
		file.path = "views/chars.md";
		vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((p) =>
			p === "views/chars.md" ? file : null,
		);
		vi.mocked(app.vault.read).mockResolvedValue(
			"```dataview\n" + originalBody + "```\n",
		);
		// Start with sf-version: 1
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue({
			frontmatter: { "sf-version": 1 },
		});

		const dvApi = createMockDataviewApi({ satisfies: true });
		wireDataviewApi(app, dvApi);
		const registry = buildEngineRegistry(app);
		const store = makeStore();
		const gate = makeGate(app, registry, store);

		const record: ViewRecord = {
			provenance: "imported",
			enabled: true,
			okayed: { version: 1, checksum },
			source: "views/chars.md",
			engine: "dataview-dql",
			command: false,
			kind: "view",
			surfaces: { anvil: false, workbench: false },
		};
		const viewId = "view-version-drift";
		await store.setRecord(viewId, record);

		// Pre-condition: consented with version 1
		const decision1 = await gate.evaluate(record);
		expect(decision1.status).toBe("consented");

		// Bump sf-version to 2 in the metadata cache (simulating frontmatter edit)
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue({
			frontmatter: { "sf-version": 2 },
		});

		// evaluate → drift/version (checksum is unchanged)
		const decision2 = await gate.evaluate(record);
		expect(decision2.status).toBe("drift");
		expect(decision2.status === "drift" && decision2.reason).toBe("version");

		// requestReConsent (DQL → light-confirm) → Enable
		const reConsentPromise = gate.requestReConsent(viewId, record);
		const enableBtn = await waitForButton("Enable");
		enableBtn.click();

		const granted = await reConsentPromise;
		expect(granted).toBe(true);

		// Updated record has version: 2, same checksum
		const updatedViews = await store.getViews();
		const updatedRecord = updatedViews[viewId]!;
		expect(updatedRecord.okayed?.version).toBe(2);
		expect(updatedRecord.okayed?.checksum).toBe(checksum);

		// evaluate → consented
		const decision3 = await gate.evaluate(updatedRecord);
		expect(decision3.status).toBe("consented");
	});
});

// ---------------------------------------------------------------------------
// FLOW 6 — Kill-switch preserves okayed
//
// consented view → store.setRecord(enabled:false) → okayed UNCHANGED →
// re-enable without drift → evaluate() = consented immediately, NO modal.
// ---------------------------------------------------------------------------

describe("Flow 6 — Kill-switch preserves okayed", () => {
	afterEach(() => {
		// Clear any stale modal DOM so button-count assertions start clean
		document.body.innerHTML = "";
	});

	it("disabling a consented view keeps okayed intact; re-enabling returns consented without modal", async () => {
		const originalBody = "LIST FROM #canon\n";
		const checksum = await computeChecksum(originalBody);

		const app = new App();
		const file = new TFile();
		file.path = "views/chars.md";
		vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((p) =>
			p === "views/chars.md" ? file : null,
		);
		vi.mocked(app.vault.read).mockResolvedValue("```dataview\n" + originalBody + "```\n");
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue({
			frontmatter: { "sf-version": 1 },
		});

		const dvApi = createMockDataviewApi({ satisfies: true });
		wireDataviewApi(app, dvApi);
		const registry = buildEngineRegistry(app);
		const store = makeStore();
		const gate = makeGate(app, registry, store);

		const consentedRecord: ViewRecord = {
			provenance: "imported",
			enabled: true,
			okayed: { version: 1, checksum },
			source: "views/chars.md",
			engine: "dataview-dql",
			command: false,
			kind: "view",
			surfaces: { anvil: false, workbench: false },
		};
		const viewId = "view-killswitch";
		await store.setRecord(viewId, consentedRecord);

		// Pre-condition: consented
		expect((await gate.evaluate(consentedRecord)).status).toBe("consented");

		// Disable via store write (kill-switch): enabled:false, okayed PRESERVED
		const disabledRecord: ViewRecord = { ...consentedRecord, enabled: false };
		await store.setRecord(viewId, disabledRecord);

		// evaluate → disabled
		const decision = await gate.evaluate(disabledRecord);
		expect(decision.status).toBe("disabled");

		// Verify okayed is still intact in the store
		const views = await store.getViews();
		expect(views[viewId]!.okayed).toEqual({ version: 1, checksum });

		// Re-enable without content change → evaluate = consented immediately
		// (no modal needed: okayed is still valid)
		const reenabledRecord: ViewRecord = { ...disabledRecord, enabled: true };
		await store.setRecord(viewId, reenabledRecord);

		const decisionAfterReenable = await gate.evaluate(reenabledRecord);
		// If okayed had been wiped, we'd get not-consented here — proving
		// the kill-switch preserved okayed and no re-consent is needed.
		expect(decisionAfterReenable.status).toBe("consented");

		// Explicit no-modal assertion: evaluate() alone sufficed — no DisclosureModal
		// was opened at any point. The DisclosureModal.open() mounts buttons into
		// document.body; zero buttons proves no modal was presented.
		// (afterEach clears body between tests so count is clean)
		expect(document.body.querySelectorAll("button").length).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// FLOW 7 — Duplicate import blocked
//
// importToStore same sourcePath twice → second throws ImportError(DUPLICATE)
// → ViewStore has exactly one record.
// ---------------------------------------------------------------------------

describe("Flow 7 — Duplicate import blocked", () => {
	it("second importToStore for same sourcePath throws DUPLICATE; store has exactly one record", async () => {
		const app = new App();
		const file = new TFile();
		file.path = "views/chars.md";
		file.basename = "chars";
		vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((p) =>
			p === "views/chars.md" ? file : null,
		);
		vi.mocked(app.vault.read).mockResolvedValue(DQL_CONTENT);
		// sf-engine intentionally absent in frontmatter (consistent with DQL_CONTENT)
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue({
			frontmatter: {
				"sf-view": true,
				"sf-version": 1,
				"sf-name": "Characters in scene",
			},
		});

		const store = makeStore();
		const importer = new ViewImporter(app, store);
		const tfile = createMockTFile({ path: "views/chars.md", basename: "chars" });

		// First import: succeeds
		const def = await importer.parse(tfile);
		const firstId = await importer.importToStore(def);
		expect(typeof firstId).toBe("string");

		// Second import: same sourcePath → DUPLICATE error (no new store write)
		const def2 = await importer.parse(tfile);
		await expect(importer.importToStore(def2)).rejects.toSatisfy(
			(e: unknown) => e instanceof ImportError && (e as ImportError).code === "DUPLICATE",
		);

		// Store has exactly one record
		const views = await store.getViews();
		expect(Object.keys(views)).toHaveLength(1);
		expect(Object.keys(views)[0]).toBe(firstId);
	});
});

// ---------------------------------------------------------------------------
// FLOW 8 — Source missing after import
//
// Import a view → simulate note deleted (vault returns null) →
// evaluate() = not-consented (source-missing variant — SDD step 6 in evaluate).
// ---------------------------------------------------------------------------

describe("Flow 8 — Source missing after import", () => {
	it("evaluate returns not-consented when source note is deleted after consent was granted", async () => {
		const originalBody = "LIST FROM #canon\n";
		const checksum = await computeChecksum(originalBody);

		const app = new App();
		const file = new TFile();
		file.path = "views/chars.md";
		vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((p) =>
			p === "views/chars.md" ? file : null,
		);
		vi.mocked(app.vault.read).mockResolvedValue("```dataview\n" + originalBody + "```\n");
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue({
			frontmatter: { "sf-version": 1 },
		});

		const dvApi = createMockDataviewApi({ satisfies: true });
		wireDataviewApi(app, dvApi);
		const registry = buildEngineRegistry(app);
		const store = makeStore();
		const gate = makeGate(app, registry, store);

		// Fully-consented record
		const record: ViewRecord = {
			provenance: "imported",
			enabled: true,
			okayed: { version: 1, checksum },
			source: "views/chars.md",
			engine: "dataview-dql",
			command: false,
			kind: "view",
			surfaces: { anvil: false, workbench: false },
		};
		const viewId = "view-source-missing";
		await store.setRecord(viewId, record);

		// Pre-condition: consented
		const decision1 = await gate.evaluate(record);
		expect(decision1.status).toBe("consented");

		// Simulate note deletion: getAbstractFileByPath returns null
		// (readFencedBlock calls getAbstractFileByPath to check if the TFile exists)
		vi.mocked(app.vault.getAbstractFileByPath).mockReturnValue(null);

		// evaluate → not-consented (source-missing path in ConsentGate.evaluate step 6)
		const decision2 = await gate.evaluate(record);
		expect(decision2.status).toBe("not-consented");
	});
});

// ---------------------------------------------------------------------------
// FLOW 9 — Late-join wiring (SDD Flow A / ADR-2)
//
// Plugin.onload registers the dataview:api-ready listener via registerEvent →
// _runCleanup() confirms it is removed on unload.
// ---------------------------------------------------------------------------

describe("Flow 9 — Late-join listener auto-cleaned (SDD Flow A / ADR-2)", () => {
	it("dataview:api-ready listener is registered via registerEvent and released on _runCleanup", async () => {
		const { default: StoryForgePlugin } = await import("main");
		const app = new App();
		const plugin = new StoryForgePlugin(app) as InstanceType<typeof StoryForgePlugin>;

		await plugin.onload();

		const mc = app.metadataCache as unknown as {
			_eventRegistrations: Map<string, unknown[]>;
		};

		// Listener must be registered after onload (SDD Flow A: late-join wiring)
		const handlersBefore = mc._eventRegistrations.get("dataview:api-ready") ?? [];
		expect(handlersBefore.length).toBeGreaterThan(0);

		// Simulate plugin unload — Component._unload() runs all registered cleanup fns
		// (registered via registerEvent → queued as cleanup → released on _unload)
		plugin._runCleanup();

		// Listener must be released (no dangling handler post-unload — ADR-2)
		const handlersAfter = mc._eventRegistrations.get("dataview:api-ready") ?? [];
		expect(handlersAfter.length).toBe(0);
	});

	it("late-join listener populates the registry when dataview:api-ready fires", async () => {
		const { default: StoryForgePlugin } = await import("main");
		const app = new App();
		const plugin = new StoryForgePlugin(app) as InstanceType<typeof StoryForgePlugin>;

		// Start with Dataview absent
		await plugin.onload();

		// Wire Dataview and fire the late-join event
		const dvApi = createMockDataviewApi({ satisfies: true });
		wireDataviewApi(app, dvApi);

		const mc = app.metadataCache as unknown as {
			_trigger(event: string, ...args: unknown[]): void;
		};
		mc._trigger("dataview:api-ready");

		// Access the shared EngineRegistry from the SidebarView factory closure
		const factoryCall = plugin.registerView.mock.calls.find(
			(c: unknown[]) => c[0] === SIDEBAR_VIEW_TYPE,
		);
		expect(factoryCall).toBeDefined();

		const leaf = new WorkspaceLeaf();
		leaf.app = app;
		const factory = factoryCall![1] as (leaf: WorkspaceLeaf) => import("views/SidebarView").SidebarView;
		const view = factory(leaf);
		const tv = view as unknown as { registry: EngineRegistry };

		// Registry must be populated after late-join handler fires
		expect(tv.registry.get("dataview-dql")).toBeDefined();
		expect(tv.registry.get("dataviewjs")).toBeDefined();
	});
});
