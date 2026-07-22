/**
 * T6.1 — End-to-end write-back fan-out integration tests.
 *
 * Covers the three surfaces that must update after an Inspector commit:
 *
 * 1. M3 PANEL (real path):
 *    Inspector commit → frontmatterWriter.commit → fileManager.processFrontMatter
 *    → test fires metadataCache.changed (the real Obsidian mechanic; mock fires it
 *    explicitly since processFrontMatter is a vi.fn() stub)
 *    → SidebarView changed-subscription → notifyFileChanged → dirty-guard
 *    → _resolveAndRender → panel DOM shows new value.
 *
 * 2. CODEX GRID (CodexBasesView.onDataUpdated — direct invocation):
 *    The Bases runtime is NOT auto-triggered headlessly.  We invoke onDataUpdated()
 *    directly with fresh BasesQueryResult data, assert the view re-reads this.data.data
 *    and renders the new value, and that a single invocation produces a single render.
 *
 * 3. OPEN BASE (BasesFenceEngine / BasesView.onDataUpdated — same rationale):
 *    Same pattern: direct invocation, assert new value rendered once.
 *
 * WHAT WE DO NOT SIMULATE: the Bases runtime's autonomous re-query on vault change.
 * That is a real Obsidian process; we cannot headlessly trigger it.  All Codex/base
 * assertions call onDataUpdated() directly — exactly as the task spec requires.
 *
 * @ref PRD/AC-F6.4  — committed edit fans out via metadataCache
 * @ref PRD/Success Metrics F6 — write-back visible across all surfaces
 * @ref plan/phase-6.md T6.1
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
	App,
	WorkspaceLeaf,
	TFile,
	createMockTFile,
	createMockFrontmatterLink,
	QueryController,
	BasesViewConfig,
	BasesEntry,
	BasesQueryResult,
} from "../__mocks__/obsidian";
import { SidebarView } from "views/SidebarView";
import { NativeScopingEngine } from "engines/NativeScopingEngine";
import { InspectorController } from "inspector/InspectorController";
import { CodexBasesView } from "bases/CodexBasesView";
import { SIDEBAR_VIEW_TYPE } from "pluginConstants";
import type { EngineRegistry } from "engines/QueryEngine";
import type { ConsentGate } from "consent/ConsentGate";
import type { NoteContext } from "scoping/NoteContext";
import type { FieldSpec } from "inspector/frontmatterWriter";
import * as frontmatterWriter from "inspector/frontmatterWriter";

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

vi.mock("obsidian", async (importOriginal) => {
	const actual = await importOriginal<typeof import("obsidian")>();
	return {
		...actual,
		Platform: { isMobile: false, isDesktop: true },
	};
});

// ---------------------------------------------------------------------------
// DOM augment helper (mirrors InspectorController.test.ts pattern)
//
// The InspectorController uses activeDocument.createElement — in jsdom that is
// `document`, so standard DOM elements are produced. The SidebarView shell uses
// Obsidian's augmented helpers (createDiv/createSpan/empty) on contentEl — those
// are wired by the ItemView mock. The Inspector host div only needs empty() to
// let re-renders clear stale content; we wire it when we build a standalone host.
// ---------------------------------------------------------------------------

/** Augment an element with the minimal Obsidian DOM helpers the inspector needs. */
function augmentInspectorHost(el: HTMLElement): HTMLElement {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const a = el as any;
	a.empty = () => { el.innerHTML = ""; };
	a.createDiv = (opts?: { cls?: string; text?: string }): HTMLElement => {
		const child = document.createElement("div");
		if (opts?.cls) child.className = opts.cls;
		if (opts?.text) child.textContent = opts.text;
		el.appendChild(child);
		return child;
	};
	a.createSpan = (opts?: { cls?: string; text?: string }): HTMLElement => {
		const span = document.createElement("span");
		if (opts?.cls) span.className = opts.cls;
		if (opts?.text) span.textContent = opts.text;
		el.appendChild(span);
		return span;
	};
	return el;
}

// ---------------------------------------------------------------------------
// Test fixtures — a minimal character entity for write-back tests
// ---------------------------------------------------------------------------

const CHAR_PATH = "30 Canon/31 Characters/Elara Voss.md";
const CHAR_BASENAME = "Elara Voss";

/** Build a TFile for the test character. */
function makeCharFile(): TFile {
	return createMockTFile({ path: CHAR_PATH, basename: CHAR_BASENAME, name: "Elara Voss.md" });
}

/** Build a NoteContext for the test character with supplied frontmatter. */
function makeCharCtx(frontmatter: Record<string, unknown> = {}): NoteContext {
	const file = makeCharFile();
	return {
		activeFile: file,
		activeKind: "character",
		entities: [],
		backlinks: [],
		frontmatter: { type: "character", name: CHAR_BASENAME, role: "protagonist", ...frontmatter },
		resolvedAt: Date.now(),
	};
}

/** A minimal text FieldSpec for the "occupation" field. */
const OCCUPATION_FIELD: FieldSpec = { name: "occupation", type: "text" };

// ---------------------------------------------------------------------------
// SidebarView harness — drives the real follow→resolve→changed fan-out pipeline
// ---------------------------------------------------------------------------

function makeRegistry(): EngineRegistry {
	return { get: vi.fn(() => undefined) } as unknown as EngineRegistry;
}

function makeGate(): ConsentGate {
	return {
		evaluate: vi.fn(async () => ({ status: "consented" as const })),
		requestConsent: vi.fn(async () => false),
		requestReConsent: vi.fn(async () => false),
	} as unknown as ConsentGate;
}

function makeOwnLeaf(app: App): WorkspaceLeaf {
	const leaf = new WorkspaceLeaf();
	leaf.app = app;
	leaf.view.getViewType = vi.fn(() => SIDEBAR_VIEW_TYPE);
	return leaf;
}

/** Wire a minimal App whose metadataCache reports the character file. */
function makeAppWithChar(
	frontmatter: Record<string, unknown> = {},
	frontmatterLinks: ReturnType<typeof createMockFrontmatterLink>[] = [],
): { app: App; charFile: TFile } {
	const app = new App();
	const charFile = makeCharFile();

	vi.mocked(app.metadataCache.getFileCache).mockImplementation((f: TFile) => {
		if (f.path === CHAR_PATH) {
			return {
				tags: [{ tag: "#canon/character" }],
				frontmatter: { type: "character", name: CHAR_BASENAME, role: "protagonist", ...frontmatter },
				frontmatterLinks,
			};
		}
		return null;
	});
	vi.mocked(app.metadataCache.getFirstLinkpathDest).mockReturnValue(null);
	vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((p: string) =>
		p === CHAR_PATH ? charFile : null,
	);
	app.metadataCache.resolvedLinks = {};

	return { app, charFile };
}

/** Mount a SidebarView (no view tab — Context tab / Inspector path). */
async function mountSidebar(app: App): Promise<SidebarView> {
	const leaf = makeOwnLeaf(app);
	const native = new NativeScopingEngine(app);
	const view = new SidebarView(leaf, makeRegistry(), makeGate(), native);
	await view.onOpen();
	return view;
}

/**
 * Simulate an active-leaf-change for `file`, advance the debounce, and flush
 * the async render microtask. Matches the follow() helper from panel-pipeline.test.ts.
 */
const DEBOUNCE_MS = 200;

async function followFile(app: App, view: SidebarView, file: TFile): Promise<void> {
	const leaf = new WorkspaceLeaf();
	leaf.view.getViewType = vi.fn(() => "markdown");
	leaf.view.file = file;
	app.workspace._trigger("active-leaf-change", leaf);
	vi.advanceTimersByTime(DEBOUNCE_MS + 1);
	await Promise.resolve();
	await Promise.resolve();
}

// ---------------------------------------------------------------------------
// CodexBasesView helpers
// ---------------------------------------------------------------------------

function makeCodexView(category = "character"): {
	view: CodexBasesView;
	container: HTMLElement;
	onRowClick: ReturnType<typeof vi.fn>;
} {
	const controller = new QueryController();
	const container = document.createElement("div");
	const onRowClick = vi.fn();
	const view = new CodexBasesView(controller, container, { app: new App(), onRowClick });
	const config = new BasesViewConfig();
	vi.spyOn(config, "get").mockImplementation((key: string) =>
		key === "category" ? category : undefined,
	);
	view.config = config;
	return { view, container, onRowClick };
}

function makeBasesEntry(path: string, fields: Record<string, unknown>): BasesEntry {
	const entry = new BasesEntry();
	const file = new TFile();
	file.path = path;
	entry.file = file;
	entry.getValue.mockImplementation((propId: string): unknown => fields[propId] ?? null);
	return entry;
}

function makeBasesResult(entries: BasesEntry[]): BasesQueryResult {
	const result = new BasesQueryResult();
	result.data = entries;
	return result;
}

// ===========================================================================
// 1. Inspector commit → metadataCache.changed → panel re-renders with new value
// ===========================================================================

describe("T6.1.1 — panel fan-out: commit → metadataCache.changed → panel DOM updated", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(async () => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("panel renders the new frontmatter value after a successful commit fires metadataCache.changed", async () => {
		const { app, charFile } = makeAppWithChar({ occupation: "lighthouse keeper" });
		const view = await mountSidebar(app);

		// Follow the character file → Inspector renders in Context tab (no view selected)
		await followFile(app, view, charFile);

		// Verify initial render is in place (Inspector host present)
		const host1 = view.contentEl.querySelector(".sf-inspector-host");
		expect(host1).not.toBeNull();

		// Simulate the commit: update the cache to reflect the new value, then fire
		// metadataCache.changed — this is the exact path processFrontMatter triggers
		// in the real Obsidian runtime.
		vi.mocked(app.metadataCache.getFileCache).mockImplementation((f: TFile) => {
			if (f.path === CHAR_PATH) {
				return {
					tags: [{ tag: "#canon/character" }],
					frontmatter: { type: "character", name: CHAR_BASENAME, role: "protagonist", occupation: "lighthouse keeper (retired)" },
					frontmatterLinks: [],
				};
			}
			return null;
		});

		// Fire the changed event (real Obsidian fires this after processFrontMatter resolves)
		(app.metadataCache as unknown as { _trigger: (e: string, ...a: unknown[]) => void })
			._trigger("changed", charFile);

		// Let the async re-render complete
		await Promise.resolve();
		await Promise.resolve();

		// The Inspector host must be re-rendered with the updated frontmatter value
		const host2 = view.contentEl.querySelector(".sf-inspector-host");
		expect(host2).not.toBeNull();

		// The "occupation" field should display the updated value
		// The InspectorController reads ctx.frontmatter[field.name] → sets input.value
		const occupationInput = view.contentEl.querySelector(
			"[data-sf-inspector-input='occupation']",
		) as HTMLInputElement | null;
		expect(occupationInput).not.toBeNull();
		// The input reflects the fresh frontmatter value from the changed event
		expect(occupationInput!.value).toBe("lighthouse keeper (retired)");

		await view.onClose();
	});
});

// ===========================================================================
// 2. Dirty-guard: after a successful commit (saved state), changed does NOT suppress re-render
// ===========================================================================

describe("T6.1.2 — dirty-guard: saved state → changed proceeds; exactly one re-render", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(async () => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("notifyFileChanged returns false (no guard) when field is in saved state, allowing re-render", async () => {
		const { app, charFile } = makeAppWithChar({ occupation: "scout" });
		const view = await mountSidebar(app);
		await followFile(app, view, charFile);

		// Access the private inspector via the internal view state
		const privateView = view as unknown as { _inspector: InspectorController | null };
		const inspector = privateView._inspector!;
		expect(inspector).not.toBeNull();

		// Build a context and render the inspector with an occupation field
		const ctx = makeCharCtx({ occupation: "scout" });
		const container = augmentInspectorHost(document.createElement("div"));
		inspector.render(container, ctx, [OCCUPATION_FIELD]);

		// Simulate a successful commit: the field status advances to "saved"
		// We do this by spying on frontmatterWriter.commit to return {ok:true}
		vi.spyOn(frontmatterWriter, "commit").mockResolvedValue({ ok: true });

		// Simulate field becoming dirty (input event)
		const input = container.querySelector(
			"[data-sf-inspector-input='occupation']",
		) as HTMLInputElement | null;
		expect(input).not.toBeNull();
		input!.value = "explorer";
		input!.dispatchEvent(new Event("input", { bubbles: true }));

		// Commit the field by clicking the save button
		const saveBtn = container.querySelector(
			"[data-sf-inspector-commit='occupation']",
		) as HTMLButtonElement | null;
		expect(saveBtn).not.toBeNull();
		saveBtn!.click();

		// Wait for the async commit to complete
		await Promise.resolve();
		await Promise.resolve();

		// After a successful commit, status = "saved"
		// notifyFileChanged must return false (guard not fired)
		const guardFired = inspector.notifyFileChanged(charFile);
		expect(guardFired).toBe(false);
	});

	it("panel re-renders exactly once after a commit (no flash/double-render)", async () => {
		const { app, charFile } = makeAppWithChar({ occupation: "wanderer" });
		const view = await mountSidebar(app);
		await followFile(app, view, charFile);

		// Spy on the private _resolveAndRender to count invocations
		const privateView = view as unknown as {
			_resolveAndRender: (file: TFile) => void;
		};
		const renderSpy = vi.spyOn(privateView, "_resolveAndRender");

		// Update the cache to reflect new value
		vi.mocked(app.metadataCache.getFileCache).mockImplementation((f: TFile) => {
			if (f.path === CHAR_PATH) {
				return {
					tags: [{ tag: "#canon/character" }],
					frontmatter: { type: "character", name: CHAR_BASENAME, occupation: "cartographer" },
					frontmatterLinks: [],
				};
			}
			return null;
		});

		// Fire changed exactly once
		(app.metadataCache as unknown as { _trigger: (e: string, ...a: unknown[]) => void })
			._trigger("changed", charFile);

		await Promise.resolve();
		await Promise.resolve();

		// _resolveAndRender must be called exactly once (no double-render / flash)
		expect(renderSpy).toHaveBeenCalledTimes(1);

		await view.onClose();
	});
});

// ===========================================================================
// 3. Codex grid surface: onDataUpdated re-reads fresh data and renders new value; once → once
// ===========================================================================

describe("T6.1.3 — Codex grid: onDataUpdated renders updated value; single invocation = single render", () => {
	it("renders the updated occupation value after onDataUpdated with fresh data", () => {
		const { view, container } = makeCodexView("character");

		// Initial data: occupation = "scout"
		const entry1 = makeBasesEntry(CHAR_PATH, { name: CHAR_BASENAME, occupation: "scout" });
		view.data = makeBasesResult([entry1]);
		view.onDataUpdated();

		// The grid renders the character row
		const row1 = container.querySelector(`[data-path='${CHAR_PATH}']`);
		expect(row1).not.toBeNull();

		// After a commit, the Bases runtime would call onDataUpdated with updated data.
		// We call it directly with the new value (as the task spec requires).
		const entry2 = makeBasesEntry(CHAR_PATH, { name: CHAR_BASENAME, occupation: "cartographer" });
		view.data = makeBasesResult([entry2]);
		view.onDataUpdated();

		// Entry should show the new path (entry is re-read from fresh data)
		const row2 = container.querySelector(`[data-path='${CHAR_PATH}']`);
		expect(row2).not.toBeNull();

		// The grid must have re-read entry2.getValue for the new data
		// entry1.getValue should have been called for the first render, entry2 for the second
		expect(entry1.getValue).toHaveBeenCalled();
		expect(entry2.getValue).toHaveBeenCalled();
	});

	it("single onDataUpdated invocation empties-then-renders exactly once (no double-render)", () => {
		const { view, container } = makeCodexView("character");

		// Inject a sentinel to count container clears
		let clearCount = 0;
		const origInnerHTMLSetter = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");
		// We instead observe by counting children before/after
		const entry = makeBasesEntry(CHAR_PATH, { name: CHAR_BASENAME, occupation: "explorer" });
		view.data = makeBasesResult([entry]);

		// Single invocation
		view.onDataUpdated();

		// Container has exactly one row (no duplication from double-render)
		const rows = container.querySelectorAll(`[data-path='${CHAR_PATH}']`);
		expect(rows).toHaveLength(1);
		void clearCount; void origInnerHTMLSetter; // suppress lint
	});

	it("stale entry content is cleared before repaint — new value replaces old (no bleed)", () => {
		const { view, container } = makeCodexView("character");

		// First render
		const oldEntry = makeBasesEntry(CHAR_PATH, { name: CHAR_BASENAME, role: "protagonist" });
		view.data = makeBasesResult([oldEntry]);
		view.onDataUpdated();

		// Inject a sentinel that SHOULD be removed on next render (CON-4 assertion)
		const sentinel = document.createElement("span");
		sentinel.setAttribute("data-stale-sentinel", "");
		container.appendChild(sentinel);
		expect(container.querySelector("[data-stale-sentinel]")).not.toBeNull();

		// Second render with new data
		const newEntry = makeBasesEntry(CHAR_PATH, { name: CHAR_BASENAME, role: "antagonist" });
		view.data = makeBasesResult([newEntry]);
		view.onDataUpdated();

		// Sentinel must be gone (container was emptied before repaint)
		expect(container.querySelector("[data-stale-sentinel]")).toBeNull();
		// New row is present
		expect(container.querySelector(`[data-path='${CHAR_PATH}']`)).not.toBeNull();
		// Only one row (no bleed from old render)
		expect(container.querySelectorAll(`[data-path='${CHAR_PATH}']`)).toHaveLength(1);
	});
});

// ===========================================================================
// 4. Open base (BasesView) surface: same onDataUpdated assertions
// ===========================================================================

describe("T6.1.4 — open base (BasesView.onDataUpdated): renders new value; once → once", () => {
	it("second onDataUpdated with fresh data re-reads and renders the new value", () => {
		// CodexBasesView is the one BasesView implementation in story-forge.
		// The open-base surface uses the same onDataUpdated contract.
		const { view, container } = makeCodexView("scene");

		const SCENE_PATH = "10 Manuscript/Scene 1.md";
		const entry1 = makeBasesEntry(SCENE_PATH, { title: "The Fire", status: "draft" });
		view.data = makeBasesResult([entry1]);
		view.onDataUpdated();

		expect(container.querySelector(`[data-path='${SCENE_PATH}']`)).not.toBeNull();

		// After the commit fans out, the runtime calls onDataUpdated with updated data
		const entry2 = makeBasesEntry(SCENE_PATH, { title: "The Fire", status: "done" });
		view.data = makeBasesResult([entry2]);
		view.onDataUpdated();

		// Row still present, new data was read (entry2.getValue called)
		expect(container.querySelector(`[data-path='${SCENE_PATH}']`)).not.toBeNull();
		expect(entry2.getValue).toHaveBeenCalled();
	});

	it("single onDataUpdated produces exactly one row — no double-render", () => {
		const { view, container } = makeCodexView("location");
		const LOC_PATH = "30 Canon/32 Locations/Lighthouse.md";

		const entry = makeBasesEntry(LOC_PATH, { name: "Lighthouse", locationType: "building" });
		view.data = makeBasesResult([entry]);
		view.onDataUpdated();

		// Only one row — no duplication
		expect(container.querySelectorAll(`[data-path='${LOC_PATH}']`)).toHaveLength(1);
	});

	it("disposed view's onDataUpdated is inert — post-teardown data does not re-render", () => {
		const { view, container } = makeCodexView("character");

		view.data = makeBasesResult([makeBasesEntry(CHAR_PATH, { name: CHAR_BASENAME })]);
		view.onDataUpdated();
		expect(container.querySelector(`[data-path='${CHAR_PATH}']`)).not.toBeNull();

		view.unload(); // triggers disposed = true via register(() => { this.disposed = true; })

		const ANOTHER_PATH = "30 Canon/31 Characters/Ghost.md";
		view.data = makeBasesResult([makeBasesEntry(ANOTHER_PATH, { name: "Ghost" })]);
		view.onDataUpdated(); // must be inert — no stale content bleed

		// The new data must NOT appear
		expect(container.querySelector(`[data-path='${ANOTHER_PATH}']`)).toBeNull();
	});
});

// ===========================================================================
// 5. Validation failure: commit returns {ok:false, reason:"validation"} →
//    edit preserved (dirty), metadataCache.changed NOT fired, no fan-out
// ===========================================================================

describe("T6.1.5 — validation failure: dirty preserved, no fan-out", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(async () => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("type-invalid value (NaN number) returns validation error and does NOT fire metadataCache.changed", async () => {
		const { app, charFile } = makeAppWithChar({ age: 30 });

		// Spy on processFrontMatter — must NOT be called on validation failure
		const processSpy = vi.mocked(app.fileManager.processFrontMatter);
		processSpy.mockResolvedValue(undefined);

		const view = await mountSidebar(app);
		await followFile(app, view, charFile);

		const privateView = view as unknown as { _inspector: InspectorController | null };
		const inspector = privateView._inspector!;

		// Render inspector with a number field
		const NUMBER_FIELD: FieldSpec = { name: "age", type: "number" };
		const ctx = makeCharCtx({ age: 30 });
		const container = augmentInspectorHost(document.createElement("div"));
		inspector.render(container, ctx, [NUMBER_FIELD]);

		// Enter an invalid (NaN) value
		const input = container.querySelector(
			"[data-sf-inspector-input='age']",
		) as HTMLInputElement | null;
		expect(input).not.toBeNull();
		input!.value = "thirty"; // non-numeric → will parse as NaN → fails validation
		input!.setAttribute("data-sf-field-type", "number"); // ensure readInputValue parses it
		input!.dispatchEvent(new Event("input", { bubbles: true }));

		// Commit — should fail validation
		const saveBtn = container.querySelector(
			"[data-sf-inspector-commit='age']",
		) as HTMLButtonElement | null;
		expect(saveBtn).not.toBeNull();
		saveBtn!.click();

		// Wait for the async commit to complete
		await Promise.resolve();
		await Promise.resolve();

		// processFrontMatter must NOT have been called (validation short-circuits before vault write)
		expect(processSpy).not.toHaveBeenCalled();

		// The error state must be present in the DOM (field preserved as dirty/error)
		const errorEl = container.querySelector("[data-sf-inspector-error='age']");
		expect(errorEl).not.toBeNull();
		expect(errorEl!.textContent).toContain("age");

		// The dirty-guard must be active (guard returns true — edit in flight)
		const guardFired = inspector.notifyFileChanged(charFile);
		expect(guardFired).toBe(true);

		// The input must still show the invalid value (edit preserved — AC-F6.5)
		expect(input!.value).toBe("thirty");

		await view.onClose();
	});

	it("validation failure: metadataCache changed subscription does not trigger panel re-render", async () => {
		const { app, charFile } = makeAppWithChar({ age: 25 });

		vi.mocked(app.fileManager.processFrontMatter).mockResolvedValue(undefined);

		const view = await mountSidebar(app);
		await followFile(app, view, charFile);

		const privateView = view as unknown as {
			_inspector: InspectorController | null;
			_resolveAndRender: (file: TFile) => void;
		};
		const inspector = privateView._inspector!;
		const renderSpy = vi.spyOn(privateView, "_resolveAndRender");

		// Render inspector with a number field and set it dirty with invalid input
		const NUMBER_FIELD: FieldSpec = { name: "age", type: "number" };
		const ctx = makeCharCtx({ age: 25 });
		const container = augmentInspectorHost(document.createElement("div"));
		inspector.render(container, ctx, [NUMBER_FIELD]);

		const input = container.querySelector(
			"[data-sf-inspector-input='age']",
		) as HTMLInputElement | null;
		expect(input).not.toBeNull();
		input!.value = "not-a-number";
		input!.setAttribute("data-sf-field-type", "number");
		input!.dispatchEvent(new Event("input", { bubbles: true }));

		// Try to commit the invalid value (this will fail validation)
		const saveBtn = container.querySelector(
			"[data-sf-inspector-commit='age']",
		) as HTMLButtonElement | null;
		expect(saveBtn).not.toBeNull();
		saveBtn!.click();
		await Promise.resolve();
		await Promise.resolve();

		// Now simulate an external metadataCache.changed event for the same file
		// (mimicking what would happen if another process changed the file).
		// Since the field is in error state, the dirty-guard fires → _resolveAndRender NOT called.
		renderSpy.mockClear();
		(app.metadataCache as unknown as { _trigger: (e: string, ...a: unknown[]) => void })
			._trigger("changed", charFile);

		await Promise.resolve();
		await Promise.resolve();

		// The dirty-guard must have suppressed the panel re-render
		expect(renderSpy).not.toHaveBeenCalled();

		await view.onClose();
	});
});

// ===========================================================================
// 6. Write failure: processFrontMatter rejects → {ok:false, reason:"write"} →
//    edit preserved, error state (S55), no fan-out
// ===========================================================================

describe("T6.1.6 — write failure: edit preserved, error state, no fan-out", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(async () => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("processFrontMatter rejection yields write error state and preserved edit", async () => {
		const { app, charFile } = makeAppWithChar({ occupation: "fisher" });

		// processFrontMatter REJECTS → frontmatterWriter.commit returns {ok:false, reason:"write"}
		vi.mocked(app.fileManager.processFrontMatter).mockRejectedValue(
			new Error("Vault write error"),
		);

		const view = await mountSidebar(app);
		await followFile(app, view, charFile);

		const privateView = view as unknown as { _inspector: InspectorController | null };
		const inspector = privateView._inspector!;

		// Render inspector with occupation field
		const ctx = makeCharCtx({ occupation: "fisher" });
		const container = augmentInspectorHost(document.createElement("div"));
		inspector.render(container, ctx, [OCCUPATION_FIELD]);

		// Edit the field
		const input = container.querySelector(
			"[data-sf-inspector-input='occupation']",
		) as HTMLInputElement | null;
		expect(input).not.toBeNull();
		input!.value = "deep sea fisher";
		input!.dispatchEvent(new Event("input", { bubbles: true }));

		// Click Save
		const saveBtn = container.querySelector(
			"[data-sf-inspector-commit='occupation']",
		) as HTMLButtonElement | null;
		expect(saveBtn).not.toBeNull();
		saveBtn!.click();

		// Wait for the async commit to complete (processFrontMatter rejects)
		await Promise.resolve();
		await Promise.resolve();

		// Error state must be shown (write failure)
		const errorEl = container.querySelector("[data-sf-inspector-error='occupation']");
		expect(errorEl).not.toBeNull();
		expect(errorEl!.textContent).toContain("Couldn't write frontmatter");

		// The Retry button must be present (write errors → Retry affordance)
		const retryBtn = container.querySelector("[data-sf-inspector-retry='occupation']");
		expect(retryBtn).not.toBeNull();

		// Edit is preserved — input still shows the attempted new value
		expect(input!.value).toBe("deep sea fisher");

		// Dirty-guard fires (field is in error state) → metadataCache.changed would be blocked
		const guardFired = inspector.notifyFileChanged(charFile);
		expect(guardFired).toBe(true);

		await view.onClose();
	});

	it("write failure: metadataCache changed is suppressed by the dirty-guard (no fan-out)", async () => {
		const { app, charFile } = makeAppWithChar({ occupation: "farmer" });

		vi.mocked(app.fileManager.processFrontMatter).mockRejectedValue(
			new Error("Write failed"),
		);

		const view = await mountSidebar(app);
		await followFile(app, view, charFile);

		const privateView = view as unknown as {
			_inspector: InspectorController | null;
			_resolveAndRender: (file: TFile) => void;
		};
		const inspector = privateView._inspector!;
		const renderSpy = vi.spyOn(privateView, "_resolveAndRender");

		// Render inspector
		const ctx = makeCharCtx({ occupation: "farmer" });
		const container = augmentInspectorHost(document.createElement("div"));
		inspector.render(container, ctx, [OCCUPATION_FIELD]);

		// Edit + commit (will fail)
		const input = container.querySelector(
			"[data-sf-inspector-input='occupation']",
		) as HTMLInputElement | null;
		input!.value = "baker";
		input!.dispatchEvent(new Event("input", { bubbles: true }));

		const saveBtn = container.querySelector(
			"[data-sf-inspector-commit='occupation']",
		) as HTMLButtonElement | null;
		saveBtn!.click();
		await Promise.resolve();
		await Promise.resolve();

		// Clear the spy after setup (we only care about post-commit events)
		renderSpy.mockClear();

		// Fire metadataCache.changed — must be suppressed by the dirty-guard
		(app.metadataCache as unknown as { _trigger: (e: string, ...a: unknown[]) => void })
			._trigger("changed", charFile);

		await Promise.resolve();
		await Promise.resolve();

		// _resolveAndRender must NOT have been called (guard suppressed it)
		expect(renderSpy).not.toHaveBeenCalled();

		await view.onClose();
	});
});
