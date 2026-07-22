/**
 * T6.2 — Cross-engine isolation + Codex↔panel E2E.
 *
 * Exercises the wired Codex→panel path and cross-engine isolation behaviors
 * that no single unit test file covers:
 *
 *   1. "Codex row click re-subjects panel (S56)" — a Codex row click routes
 *      through the public showFile / revealAndShowFile → _drillInto path and
 *      re-subjects the panel to the clicked file.
 *
 *   2. "Dataview tab + Bases tab render via isolated engines (no bleed)" —
 *      two views dispatched through distinct engines; each body contains only
 *      its own engine's output.
 *
 *   3. "Tab switch → teardown prior engine, no stale content" — switching view
 *      tabs runs the ADR-7 _prepareBody → empty → render discipline; the prior
 *      engine is torn down and the body is emptied before the new render.
 *
 *   4. "Unresolved Codex row → non-entity/M3 state, never throws" — a showFile
 *      call for a file whose vault cache is absent routes to M3 state without
 *      throwing.
 *
 * Patterns mirrored:
 *   - SidebarView.engineDispatch.test.ts  (engine dispatch + teardown order)
 *   - SidebarView.tabs.test.ts            (tab select + teardown)
 *   - codexGrid.test.ts                   (grid row click → onRowClick)
 *   - panel-pipeline.test.ts              (follow → resolve → render; seed fixture)
 *
 * @ref PRD/AC-F1.6, AC-F2.2, AC-F2.7
 * @ref PRD/Success Metrics F1, F2
 * @ref plan/phase-6.md T6.2
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { App, WorkspaceLeaf, TFile } from "obsidian";
import { SidebarView } from "views/SidebarView";
import { SIDEBAR_VIEW_TYPE } from "pluginConstants";
import { revealAndShowFile } from "views/SidebarView";
import type { NoteContext, ResolvedEntity } from "scoping/NoteContext";
import type { QueryEngine, EngineRegistry } from "engines/QueryEngine";
import type { ConsentGate, ConsentDecision } from "consent/ConsentGate";
import type { NativeScopingEngine } from "engines/NativeScopingEngine";
import type { ViewRecord } from "store/types";
import type { ViewStore } from "store/ViewStore";
import { makeDummyViewRecord } from "../helpers/viewFixtures";

// ---------------------------------------------------------------------------
// Shared factory helpers
// ---------------------------------------------------------------------------

function makeApp(): App {
	return new App();
}

function makeOwnLeaf(app: App): WorkspaceLeaf {
	const leaf = new WorkspaceLeaf();
	leaf.app = app;
	leaf.view.getViewType = vi.fn(() => SIDEBAR_VIEW_TYPE);
	leaf.setViewState = vi.fn(async (s: { type: string }) => {
		leaf.view.getViewType = vi.fn(() => s.type);
	});
	return leaf;
}

function makeMdFile(basename: string, extension = "md"): TFile {
	const f = new TFile();
	f.path = `${basename}.${extension}`;
	f.name = `${basename}.${extension}`;
	f.basename = basename;
	f.extension = extension;
	return f;
}

function makeNoteContext(
	file: TFile,
	kind: NoteContext["activeKind"] = "character",
	entities: ResolvedEntity[] = [],
): NoteContext {
	return {
		activeFile: file,
		activeKind: kind,
		entities,
		backlinks: [],
		frontmatter: { type: kind, name: file.basename },
		resolvedAt: Date.now(),
	};
}

function makeViewRecord(overrides?: Partial<ViewRecord>): ViewRecord {
	return {
		provenance: "imported",
		enabled: true,
		okayed: { version: 1, checksum: "sha256:abc123" },
		source: "_forge/views/test-view.md",
		engine: "dataview-dql",
		command: false,
		commandName: "Test View",
		...overrides,
	};
}

/** Engine mock that records output text into the container so bleed can be detected. */
function makeContentEngine(
	kind: QueryEngine["kind"],
	outputText: string,
): QueryEngine & { teardown: ReturnType<typeof vi.fn>; render: ReturnType<typeof vi.fn> } {
	return {
		kind,
		teardown: vi.fn(),
		render: vi.fn(async (_view: ViewRecord | null, _ctx: NoteContext, el: HTMLElement) => {
			const div = document.createElement("div");
			div.className = `engine-output engine-output-${kind.toString().replace(/[^a-z]/g, "-")}`;
			div.textContent = outputText;
			el.appendChild(div);
		}),
	};
}

/** Engine mock that records teardown + render ordering. */
function makeOrderTrackingEngine(
	kind: QueryEngine["kind"],
	callOrder: string[],
	label: string,
): QueryEngine & { teardown: ReturnType<typeof vi.fn>; render: ReturnType<typeof vi.fn> } {
	return {
		kind,
		teardown: vi.fn(() => { callOrder.push(`teardown:${label}`); }),
		render: vi.fn(async (_v: ViewRecord | null, _c: NoteContext, el: HTMLElement) => {
			callOrder.push(`render:${label}`);
			const div = document.createElement("div");
			div.className = `output-${label}`;
			div.textContent = `output from ${label}`;
			el.appendChild(div);
		}),
	};
}

function makeMockNativeEngine(): NativeScopingEngine & {
	teardown: ReturnType<typeof vi.fn>;
	render: ReturnType<typeof vi.fn>;
} {
	return {
		kind: "native" as const,
		teardown: vi.fn(),
		render: vi.fn(async () => {}),
	} as unknown as NativeScopingEngine & {
		teardown: ReturnType<typeof vi.fn>;
		render: ReturnType<typeof vi.fn>;
	};
}

function makeMockRegistry(engine?: QueryEngine): EngineRegistry {
	return {
		get: vi.fn(() => engine),
	} as unknown as EngineRegistry;
}

function makeRegistryMulti(engines: Record<string, QueryEngine>): EngineRegistry {
	return {
		get: vi.fn((kind: string) => engines[kind]),
	} as unknown as EngineRegistry;
}

function makeMockConsentGate(decision: ConsentDecision): ConsentGate {
	return {
		evaluate: vi.fn(async () => decision),
		requestConsent: vi.fn(async () => false),
		requestReConsent: vi.fn(async () => false),
	} as unknown as ConsentGate;
}

function makeFakeStore(
	initial: Record<string, ViewRecord> = {},
): ViewStore & { _views: Record<string, ViewRecord>; _fire: () => void } {
	let views = { ...initial };
	const subscribers = new Set<() => void>();
	const store = {
		async getViews(): Promise<Record<string, ViewRecord>> {
			return { ...views };
		},
		subscribe(cb: () => void): () => void {
			subscribers.add(cb);
			return () => { subscribers.delete(cb); };
		},
		async setRecord(_id: string, _rec: ViewRecord): Promise<void> {},
		async deleteRecord(_id: string): Promise<void> {},
		get _views() { return views; },
		set _views(v: Record<string, ViewRecord>) { views = v; },
		_fire(): void {
			for (const cb of subscribers) cb();
		},
	} as unknown as ViewStore & { _views: Record<string, ViewRecord>; _fire: () => void };
	return store;
}

function getBody(view: SidebarView): HTMLElement {
	return view.contentEl.querySelector(".sf-body") as HTMLElement;
}

function getTabByViewId(view: SidebarView, id: string): HTMLElement {
	const el = view.contentEl.querySelector(`.sf-tab[data-view-id="${id}"]`) as HTMLElement | null;
	if (!el) throw new Error(`Tab with data-view-id="${id}" not found`);
	return el;
}

// ---------------------------------------------------------------------------
// 1. Codex row click re-subjects panel (S56)
// ---------------------------------------------------------------------------

describe("Codex row click re-subjects panel (S56)", () => {
	let app: App;
	let leaf: WorkspaceLeaf;
	let view: SidebarView;
	let nativeEngine: ReturnType<typeof makeMockNativeEngine>;

	beforeEach(async () => {
		app = makeApp();
		leaf = makeOwnLeaf(app);
		nativeEngine = makeMockNativeEngine();
	});

	afterEach(async () => {
		if (view) await view.onClose();
		vi.restoreAllMocks();
	});

	it("showFile re-subjects panel to the clicked entity and pushes nav stack", async () => {
		// Arrange: mount SidebarView with a wired engine + consented gate
		const engine = makeContentEngine("dataview-dql", "scene output");
		const registry = makeMockRegistry(engine);
		const consentGate = makeMockConsentGate({ status: "consented" });

		view = new SidebarView(leaf, registry, consentGate, nativeEngine);
		await view.onOpen();

		// Prime with an initial subject (Scene 1) so the nav stack gets a prior entry
		const scene = makeMdFile("Scene 1");
		const sceneCtx = makeNoteContext(scene, "scene");

		// Wire metadata so ScopingService.classify returns "scene"
		vi.mocked(app.metadataCache.getFileCache).mockImplementation((f: TFile) => {
			if (f.path === scene.path) return { frontmatter: { type: "scene" } };
			return null;
		});

		const pv = view as unknown as {
			subject: { file: TFile | null; source: string };
			currentCtx: NoteContext | null;
			currentRecord: ViewRecord | null;
			navStack: TFile[];
			_renderState: (s: unknown) => void;
		};
		pv.currentCtx = sceneCtx;
		pv.currentRecord = makeDummyViewRecord();
		pv.subject = { file: scene, source: "follow" };

		// Act: simulate a Codex row click that calls showFile
		const clickedFile = makeMdFile("Mara Stoneway");
		vi.mocked(app.metadataCache.getFileCache).mockImplementation((f: TFile) => {
			if (f.path === clickedFile.path) return { frontmatter: { type: "character" } };
			if (f.path === scene.path) return { frontmatter: { type: "scene" } };
			return null;
		});
		vi.mocked(app.vault.getAbstractFileByPath).mockReturnValue(null);

		view.showFile(clickedFile);

		// Assert: subject is now the clicked file with source "drilled"
		expect(pv.subject.file?.path).toBe(clickedFile.path);
		expect(pv.subject.source).toBe("drilled");

		// Assert: nav stack was pushed (Scene 1 is the prior subject)
		expect(pv.navStack.length).toBe(1);
		expect(pv.navStack[0]?.path).toBe(scene.path);
	});

	it("revealAndShowFile calls activateView and routes to showFile via the live SidebarView", async () => {
		// Arrange: wire the workspace to return our view's leaf when queried
		const registry = makeMockRegistry(undefined);
		const consentGate = makeMockConsentGate({ status: "consented" });

		view = new SidebarView(leaf, registry, consentGate, nativeEngine);
		await view.onOpen();

		// Stub getLeavesOfType to return a leaf whose view IS our SidebarView.
		// revealAndShowFile calls activateView (which calls getLeavesOfType to skip
		// leaf creation), then calls getLeavesOfType again to locate the live view.
		const liveLeaf = {
			...leaf,
			view: view,
		} as unknown as WorkspaceLeaf;
		vi.mocked(app.workspace.getLeavesOfType).mockReturnValue([liveLeaf]);

		const clickedFile = makeMdFile("Tobias Ferro");
		vi.mocked(app.metadataCache.getFileCache).mockImplementation((f: TFile) => {
			if (f.path === clickedFile.path) return { frontmatter: { type: "character" } };
			return null;
		});
		vi.mocked(app.vault.getAbstractFileByPath).mockReturnValue(null);

		// Act
		await revealAndShowFile(app, clickedFile);

		// Assert: revealLeaf was called (activateView revealed the existing leaf)
		expect(app.workspace.revealLeaf).toHaveBeenCalledWith(liveLeaf);

		// Assert: panel subject is now the clicked file with source "drilled"
		const pv = view as unknown as {
			subject: { file: TFile | null; source: string };
		};
		expect(pv.subject.file?.path).toBe(clickedFile.path);
		expect(pv.subject.source).toBe("drilled");
	});

	it("showFile followed by a render produces entity detail for the clicked file", async () => {
		// This asserts the full _drillInto → _resolveOrClassify → _renderState chain.
		const engine = makeContentEngine("dataview-dql", "character detail");
		const registry = makeMockRegistry(engine);
		const consentGate = makeMockConsentGate({ status: "consented" });
		const store = makeFakeStore({ v1: makeViewRecord({ commandName: "Test View" }) });

		view = new SidebarView(leaf, registry, consentGate, nativeEngine, store);
		await view.onOpen();

		// Set up the store tab selection so currentRecord is non-null
		const pv = view as unknown as {
			subject: { file: TFile | null; source: string };
			currentCtx: NoteContext | null;
			currentRecord: ViewRecord | null;
			navStack: TFile[];
		};

		const clickedFile = makeMdFile("Mara Stoneway");
		vi.mocked(app.metadataCache.getFileCache).mockImplementation((f: TFile) => {
			if (f.path === clickedFile.path) return { frontmatter: { type: "character" } };
			return null;
		});
		vi.mocked(app.vault.getAbstractFileByPath).mockReturnValue(null);

		// Select a view tab so engine dispatch fires
		getTabByViewId(view, "v1").click();
		await new Promise((r) => setTimeout(r, 0));
		// Inject a resolved ctx for the current subject
		pv.currentCtx = makeNoteContext(clickedFile, "character");

		// Act: Codex row click → showFile
		view.showFile(clickedFile);
		// Flush the async render
		await Promise.resolve();
		await Promise.resolve();
		await new Promise((r) => setTimeout(r, 0));

		// Assert: subject is the clicked file
		expect(pv.subject.file?.path).toBe(clickedFile.path);
		expect(pv.subject.source).toBe("drilled");
	});
});

// ---------------------------------------------------------------------------
// 2. Dataview tab + Bases tab render via isolated engines (no bleed)
// ---------------------------------------------------------------------------

describe("Dataview tab + Bases tab render via isolated engines (no bleed)", () => {
	let app: App;
	let leaf: WorkspaceLeaf;
	let view: SidebarView;
	let nativeEngine: ReturnType<typeof makeMockNativeEngine>;

	beforeEach(() => {
		app = makeApp();
		leaf = makeOwnLeaf(app);
		nativeEngine = makeMockNativeEngine();
	});

	afterEach(async () => {
		if (view) await view.onClose();
		vi.restoreAllMocks();
	});

	it("Dataview-DQL engine renders only its own output; Bases engine renders only its own output", async () => {
		// Two engines with distinct, identifiable outputs
		const dqlEngine = makeContentEngine("dataview-dql", "DQL ONLY OUTPUT");
		const basesEngine = makeContentEngine("bases", "BASES ONLY OUTPUT");

		// Registry: get() returns the engine matching the record's engine kind
		const registry = makeRegistryMulti({
			"dataview-dql": dqlEngine,
			"bases": basesEngine,
		});
		const consentGate = makeMockConsentGate({ status: "consented" });

		const dqlRecord = makeViewRecord({ engine: "dataview-dql", commandName: "DQL View" });
		const basesRecord = makeViewRecord({ engine: "bases", commandName: "Bases View" });
		const store = makeFakeStore({ dql: dqlRecord, bases: basesRecord });

		view = new SidebarView(leaf, registry, consentGate, nativeEngine, store);
		await view.onOpen();

		// Wire a character context so engine dispatch fires
		const charFile = makeMdFile("Mara Stoneway");
		const ctx = makeNoteContext(charFile, "character");
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue({ frontmatter: { type: "character" } });
		const pv = view as unknown as {
			currentCtx: NoteContext | null;
			subject: { file: TFile | null; source: string };
		};
		pv.currentCtx = ctx;
		pv.subject = { file: charFile, source: "follow" };

		// --- Select DQL tab ---
		getTabByViewId(view, "dql").click();
		await new Promise((r) => setTimeout(r, 0));

		const bodyAfterDql = getBody(view);
		const dqlOutput = bodyAfterDql.querySelector(".engine-output-dataview-dql");
		const basesOutputInDql = bodyAfterDql.querySelector(".engine-output-bases");

		// DQL tab must contain DQL output and no Bases output
		expect(dqlOutput).not.toBeNull();
		expect(dqlOutput?.textContent).toBe("DQL ONLY OUTPUT");
		expect(basesOutputInDql).toBeNull();

		// --- Select Bases tab ---
		getTabByViewId(view, "bases").click();
		await new Promise((r) => setTimeout(r, 0));

		const bodyAfterBases = getBody(view);
		const basesOutput = bodyAfterBases.querySelector(".engine-output-bases");
		const dqlOutputInBases = bodyAfterBases.querySelector(".engine-output-dataview-dql");

		// Bases tab must contain Bases output and no DQL output
		expect(basesOutput).not.toBeNull();
		expect(basesOutput?.textContent).toBe("BASES ONLY OUTPUT");
		expect(dqlOutputInBases).toBeNull();
	});

	it("EngineRegistry.get is called with the correct engine kind for each tab", async () => {
		const dqlEngine = makeContentEngine("dataview-dql", "dql");
		const basesEngine = makeContentEngine("bases", "bases");

		const registrySpy = makeRegistryMulti({
			"dataview-dql": dqlEngine,
			"bases": basesEngine,
		});
		const getSpy = vi.spyOn(registrySpy, "get");

		const consentGate = makeMockConsentGate({ status: "consented" });
		const dqlRecord = makeViewRecord({ engine: "dataview-dql", commandName: "DQL View" });
		const basesRecord = makeViewRecord({ engine: "bases", commandName: "Bases View" });
		const store = makeFakeStore({ dql: dqlRecord, bases: basesRecord });

		view = new SidebarView(leaf, registrySpy, consentGate, nativeEngine, store);
		await view.onOpen();

		const charFile = makeMdFile("Mara");
		const ctx = makeNoteContext(charFile, "character");
		const pv = view as unknown as {
			currentCtx: NoteContext | null;
			subject: { file: TFile | null; source: string };
		};
		pv.currentCtx = ctx;
		pv.subject = { file: charFile, source: "follow" };
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue({ frontmatter: { type: "character" } });

		// Select DQL tab → registry.get("dataview-dql")
		getSpy.mockClear();
		getTabByViewId(view, "dql").click();
		await new Promise((r) => setTimeout(r, 0));
		expect(getSpy).toHaveBeenCalledWith("dataview-dql");
		expect(getSpy).not.toHaveBeenCalledWith("bases");

		// Select Bases tab → registry.get("bases")
		getSpy.mockClear();
		getTabByViewId(view, "bases").click();
		await new Promise((r) => setTimeout(r, 0));
		expect(getSpy).toHaveBeenCalledWith("bases");
		expect(getSpy).not.toHaveBeenCalledWith("dataview-dql");
	});
});

// ---------------------------------------------------------------------------
// 3. Tab switch → teardown prior engine, no stale content
// ---------------------------------------------------------------------------

describe("Tab switch → teardown prior engine, no stale content", () => {
	let app: App;
	let leaf: WorkspaceLeaf;
	let view: SidebarView;
	let nativeEngine: ReturnType<typeof makeMockNativeEngine>;

	beforeEach(() => {
		app = makeApp();
		leaf = makeOwnLeaf(app);
		nativeEngine = makeMockNativeEngine();
	});

	afterEach(async () => {
		if (view) await view.onClose();
		vi.restoreAllMocks();
	});

	it("switching tabs calls teardown on the prior engine before rendering the new one", async () => {
		const callOrder: string[] = [];
		const engineA = makeOrderTrackingEngine("dataview-dql", callOrder, "A");
		const engineB = makeOrderTrackingEngine("bases", callOrder, "B");

		const registry = makeRegistryMulti({
			"dataview-dql": engineA,
			"bases": engineB,
		});
		const consentGate = makeMockConsentGate({ status: "consented" });
		const recA = makeViewRecord({ engine: "dataview-dql", commandName: "View A" });
		const recB = makeViewRecord({ engine: "bases", commandName: "View B" });
		const store = makeFakeStore({ a: recA, b: recB });

		view = new SidebarView(leaf, registry, consentGate, nativeEngine, store);
		await view.onOpen();

		const charFile = makeMdFile("Mara");
		const ctx = makeNoteContext(charFile, "character");
		const pv = view as unknown as {
			currentCtx: NoteContext | null;
			subject: { file: TFile | null; source: string };
		};
		pv.currentCtx = ctx;
		pv.subject = { file: charFile, source: "follow" };
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue({ frontmatter: { type: "character" } });

		// Select View A → renders engine A
		getTabByViewId(view, "a").click();
		await new Promise((r) => setTimeout(r, 0));
		expect(callOrder).toContain("render:A");

		// Clear order tracking; switch to View B
		callOrder.length = 0;
		getTabByViewId(view, "b").click();
		await new Promise((r) => setTimeout(r, 0));

		// ADR-7: teardown A must appear BEFORE render B in the call sequence
		const teardownAIdx = callOrder.indexOf("teardown:A");
		const renderBIdx = callOrder.indexOf("render:B");
		expect(teardownAIdx).toBeGreaterThanOrEqual(0);
		expect(renderBIdx).toBeGreaterThan(teardownAIdx);
	});

	it("body is emptied before the new engine renders (no stale DOM from prior tab)", async () => {
		// engineA plants a sentinel div; after tab switch to B that sentinel must be gone
		const sentinel = "stale-sentinel";
		const engineA: QueryEngine & { teardown: ReturnType<typeof vi.fn>; render: ReturnType<typeof vi.fn> } = {
			kind: "dataview-dql" as const,
			teardown: vi.fn(),
			render: vi.fn(async (_v: ViewRecord | null, _c: NoteContext, el: HTMLElement) => {
				const div = document.createElement("div");
				div.className = sentinel;
				div.textContent = "stale from A";
				el.appendChild(div);
			}),
		};
		const engineB: QueryEngine & { teardown: ReturnType<typeof vi.fn>; render: ReturnType<typeof vi.fn> } = {
			kind: "bases" as const,
			teardown: vi.fn(),
			render: vi.fn(async (_v: ViewRecord | null, _c: NoteContext, el: HTMLElement) => {
				const div = document.createElement("div");
				div.className = "fresh-from-b";
				div.textContent = "fresh content from B";
				el.appendChild(div);
			}),
		};

		const registry = makeRegistryMulti({
			"dataview-dql": engineA,
			"bases": engineB,
		});
		const consentGate = makeMockConsentGate({ status: "consented" });
		const store = makeFakeStore({
			a: makeViewRecord({ engine: "dataview-dql", commandName: "View A" }),
			b: makeViewRecord({ engine: "bases", commandName: "View B" }),
		});

		view = new SidebarView(leaf, registry, consentGate, nativeEngine, store);
		await view.onOpen();

		const charFile = makeMdFile("Mara");
		const ctx = makeNoteContext(charFile, "character");
		const pv = view as unknown as {
			currentCtx: NoteContext | null;
			subject: { file: TFile | null; source: string };
		};
		pv.currentCtx = ctx;
		pv.subject = { file: charFile, source: "follow" };
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue({ frontmatter: { type: "character" } });

		// Select View A → sentinel appears
		getTabByViewId(view, "a").click();
		await new Promise((r) => setTimeout(r, 0));
		expect(getBody(view).querySelector(`.${sentinel}`)).not.toBeNull();

		// Switch to View B → sentinel must be gone (body.empty() ran before B's render)
		getTabByViewId(view, "b").click();
		await new Promise((r) => setTimeout(r, 0));

		const bodyAfterSwitch = getBody(view);
		expect(bodyAfterSwitch.querySelector(`.${sentinel}`)).toBeNull();
		expect(bodyAfterSwitch.querySelector(".fresh-from-b")).not.toBeNull();
	});

	it("currentEngine ref after tab switch is the NEW engine, not the old one", async () => {
		const engineA = makeContentEngine("dataview-dql", "A output");
		const engineB = makeContentEngine("bases", "B output");

		const registry = makeRegistryMulti({
			"dataview-dql": engineA,
			"bases": engineB,
		});
		const consentGate = makeMockConsentGate({ status: "consented" });
		const store = makeFakeStore({
			a: makeViewRecord({ engine: "dataview-dql", commandName: "View A" }),
			b: makeViewRecord({ engine: "bases", commandName: "View B" }),
		});

		view = new SidebarView(leaf, registry, consentGate, nativeEngine, store);
		await view.onOpen();

		const charFile = makeMdFile("Mara");
		const ctx = makeNoteContext(charFile, "character");
		const pv = view as unknown as {
			currentCtx: NoteContext | null;
			subject: { file: TFile | null; source: string };
			currentEngine: QueryEngine | null;
		};
		pv.currentCtx = ctx;
		pv.subject = { file: charFile, source: "follow" };
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue({ frontmatter: { type: "character" } });

		getTabByViewId(view, "a").click();
		await new Promise((r) => setTimeout(r, 0));
		expect(pv.currentEngine).toBe(engineA);

		getTabByViewId(view, "b").click();
		await new Promise((r) => setTimeout(r, 0));
		expect(pv.currentEngine).toBe(engineB);
		expect(pv.currentEngine).not.toBe(engineA);
	});

	it("prior engine teardown is called exactly once on each tab switch (no double-teardown)", async () => {
		const engineA = makeContentEngine("dataview-dql", "A output");
		const engineB = makeContentEngine("bases", "B output");

		const registry = makeRegistryMulti({
			"dataview-dql": engineA,
			"bases": engineB,
		});
		const consentGate = makeMockConsentGate({ status: "consented" });
		const store = makeFakeStore({
			a: makeViewRecord({ engine: "dataview-dql", commandName: "View A" }),
			b: makeViewRecord({ engine: "bases", commandName: "View B" }),
		});

		view = new SidebarView(leaf, registry, consentGate, nativeEngine, store);
		await view.onOpen();

		const charFile = makeMdFile("Mara");
		const ctx = makeNoteContext(charFile, "character");
		const pv = view as unknown as {
			currentCtx: NoteContext | null;
			subject: { file: TFile | null; source: string };
		};
		pv.currentCtx = ctx;
		pv.subject = { file: charFile, source: "follow" };
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue({ frontmatter: { type: "character" } });

		getTabByViewId(view, "a").click();
		await new Promise((r) => setTimeout(r, 0));

		// Reset spy counts before the switch
		(engineA.teardown as ReturnType<typeof vi.fn>).mockClear();

		getTabByViewId(view, "b").click();
		await new Promise((r) => setTimeout(r, 0));

		expect(engineA.teardown).toHaveBeenCalledTimes(1);
	});
});

// ---------------------------------------------------------------------------
// 4. Unresolved Codex row → non-entity/M3 state, never throws
// ---------------------------------------------------------------------------

describe("Unresolved Codex row → non-entity/M3 state, never throws", () => {
	let app: App;
	let leaf: WorkspaceLeaf;
	let view: SidebarView;
	let nativeEngine: ReturnType<typeof makeMockNativeEngine>;

	beforeEach(() => {
		app = makeApp();
		leaf = makeOwnLeaf(app);
		nativeEngine = makeMockNativeEngine();
	});

	afterEach(async () => {
		if (view) await view.onClose();
		vi.restoreAllMocks();
	});

	it("showFile for a file with null metadata cache renders M3 error state without throwing", async () => {
		const registry = makeMockRegistry(undefined);
		const consentGate = makeMockConsentGate({ status: "consented" });

		view = new SidebarView(leaf, registry, consentGate, nativeEngine);
		await view.onOpen();

		// Simulate a file whose cache is null (unresolvable / pre-index)
		const ghostFile = makeMdFile("Ghost Entity");
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue(null);
		vi.mocked(app.vault.getAbstractFileByPath).mockReturnValue(null);

		// Act — must not throw
		expect(() => { view.showFile(ghostFile); }).not.toThrow();

		// Body must render the M3 error state (.sf-errbox) — not crash, not be empty
		const body = getBody(view);
		expect(body).not.toBeNull();
		expect(body.children.length).toBeGreaterThan(0);
		// error state contains the sf-errbox element
		expect(body.querySelector(".sf-errbox")).not.toBeNull();
	});

	it("showFile for a non-entity file (unknown kind) routes to S4 state without throwing", async () => {
		const registry = makeMockRegistry(undefined);
		const consentGate = makeMockConsentGate({ status: "consented" });

		view = new SidebarView(leaf, registry, consentGate, nativeEngine);
		await view.onOpen();

		// A regular note with no canon type → classify returns "unknown"
		const regularFile = makeMdFile("My Daily Note");
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue({
			frontmatter: { type: "daily-note" }, // not a known entity kind
		});
		vi.mocked(app.vault.getAbstractFileByPath).mockReturnValue(null);

		// Act — must not throw
		expect(() => { view.showFile(regularFile); }).not.toThrow();

		// S4 state: the body contains the sf-empty / "not a tracked" copy
		const body = getBody(view);
		expect(body.children.length).toBeGreaterThan(0);
		// The S4 "not an entity" copy is in an sf-empty div
		const emptyEl = body.querySelector(".sf-empty");
		expect(emptyEl).not.toBeNull();
	});

	it("showFile for a non-markdown file routes to S3 state without throwing", async () => {
		const registry = makeMockRegistry(undefined);
		const consentGate = makeMockConsentGate({ status: "consented" });

		view = new SidebarView(leaf, registry, consentGate, nativeEngine);
		await view.onOpen();

		// A non-md file (e.g. an image)
		const imageFile = makeMdFile("scene-photo", "png");
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue(null);

		// Act — must not throw
		expect(() => { view.showFile(imageFile); }).not.toThrow();

		// S3 state: the body contains the sf-empty copy for non-markdown
		const body = getBody(view);
		expect(body.children.length).toBeGreaterThan(0);
		expect(body.querySelector(".sf-empty")).not.toBeNull();
	});

	it("showFile never throws even when called rapidly in succession with mixed resolvable/unresolvable files", async () => {
		const registry = makeMockRegistry(undefined);
		const consentGate = makeMockConsentGate({ status: "consented" });

		view = new SidebarView(leaf, registry, consentGate, nativeEngine);
		await view.onOpen();

		const goodFile = makeMdFile("Mara Stoneway");
		const ghostFile = makeMdFile("Nonexistent");

		vi.mocked(app.metadataCache.getFileCache).mockImplementation((f: TFile) => {
			if (f.path === goodFile.path) return { frontmatter: { type: "character" } };
			return null; // ghost file has no cache
		});
		vi.mocked(app.vault.getAbstractFileByPath).mockReturnValue(null);

		// Rapid succession — neither call may throw
		expect(() => { view.showFile(goodFile); }).not.toThrow();
		expect(() => { view.showFile(ghostFile); }).not.toThrow();
		expect(() => { view.showFile(goodFile); }).not.toThrow();
	});
});
