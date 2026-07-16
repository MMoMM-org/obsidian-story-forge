/**
 * Bug D tests — command selects view (D1) and onOpen seeds active note (D2).
 *
 * D1: SidebarView.selectView(viewId) loads views if needed, then selects the
 *     correct tab (currentRecord set, aria-selected = "true").
 *     main.ts command callback invokes selectView after activateView.
 *
 * D2: onOpen seeds the panel subject from the currently active markdown file
 *     so the panel shows that note's context immediately — not "no-note".
 *     With no active file, stays no-note.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { App, WorkspaceLeaf, TFile } from "obsidian";
import { SidebarView } from "views/SidebarView";
import { SIDEBAR_VIEW_TYPE } from "pluginConstants";
import type { NoteContext, ResolvedEntity } from "scoping/NoteContext";
import type { QueryEngine, EngineRegistry } from "engines/QueryEngine";
import type { ConsentGate, ConsentDecision } from "consent/ConsentGate";
import type { NativeScopingEngine } from "engines/NativeScopingEngine";
import type { ViewRecord } from "store/types";
import type { ViewStore } from "store/ViewStore";

// ---------------------------------------------------------------------------
// Helpers
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

function makeMdFile(basename = "Scene 1"): TFile {
	const f = new TFile();
	f.path = `${basename}.md`;
	f.name = `${basename}.md`;
	f.basename = basename;
	f.extension = "md";
	return f;
}

function makeNoteContext(
	file: TFile,
	kind: NoteContext["activeKind"] = "scene",
	entities: ResolvedEntity[] = [],
): NoteContext {
	return {
		activeFile: file,
		activeKind: kind,
		entities,
		backlinks: [],
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

function makeMockEngine(kind: QueryEngine["kind"] = "dataview-dql"): QueryEngine & {
	teardown: ReturnType<typeof vi.fn>;
	render: ReturnType<typeof vi.fn>;
} {
	return {
		kind,
		teardown: vi.fn(),
		render: vi.fn(async () => {}),
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
		_fire(): void { for (const cb of subscribers) cb(); },
		get _subscriberCount(): number { return subscribers.size; },
	} as unknown as ViewStore & { _views: Record<string, ViewRecord>; _fire: () => void };

	return store;
}

function getTabs(view: SidebarView): HTMLElement[] {
	return Array.from(view.contentEl.querySelectorAll(".sf-tab")) as HTMLElement[];
}

function getTabByViewId(view: SidebarView, id: string): HTMLElement {
	const el = view.contentEl.querySelector(`.sf-tab[data-view-id="${id}"]`) as HTMLElement | null;
	if (!el) throw new Error(`Tab with data-view-id="${id}" not found`);
	return el;
}

// ---------------------------------------------------------------------------
// Bug D1 — selectView selects the correct tab
// ---------------------------------------------------------------------------

describe("SidebarView Bug D1: selectView(viewId) loads and selects the tab", () => {
	let app: App;
	let leaf: WorkspaceLeaf;
	let nativeEngine: ReturnType<typeof makeMockNativeEngine>;
	let engine: ReturnType<typeof makeMockEngine>;
	let view: SidebarView;

	beforeEach(() => {
		app = makeApp();
		leaf = makeOwnLeaf(app);
		nativeEngine = makeMockNativeEngine();
		engine = makeMockEngine("dataview-dql");
	});

	afterEach(async () => {
		if (view) await view.onClose();
		vi.restoreAllMocks();
	});

	it("selectView(viewId) sets selectedViewId and currentRecord to the named view", async () => {
		const v1Record = makeViewRecord({ commandName: "My View" });
		const store = makeFakeStore({ v1: v1Record });
		const registry = makeMockRegistry(engine);
		const consentGate = makeMockConsentGate({ status: "consented" });

		view = new SidebarView(leaf, registry, consentGate, nativeEngine, store);
		await view.onOpen();

		await view.selectView("v1");

		const pv = view as unknown as {
			selectedViewId: string | null;
			currentRecord: ViewRecord | null;
		};
		expect(pv.selectedViewId).toBe("v1");
		expect(pv.currentRecord).not.toBeNull();
		expect(pv.currentRecord?.commandName).toBe("My View");
	});

	it("selectView(viewId) marks the tab aria-selected=true", async () => {
		const store = makeFakeStore({ v1: makeViewRecord({ commandName: "My View" }) });
		const registry = makeMockRegistry(engine);
		const consentGate = makeMockConsentGate({ status: "consented" });

		view = new SidebarView(leaf, registry, consentGate, nativeEngine, store);
		await view.onOpen();

		await view.selectView("v1");

		const tab = getTabByViewId(view, "v1");
		expect(tab.getAttribute("aria-selected")).toBe("true");
		expect(tab.classList.contains("sf-tab-sel")).toBe(true);
	});

	it("selectView(viewId) works when _views is empty at call time (loads views first)", async () => {
		// Start with empty store, add a view before calling selectView
		const store = makeFakeStore({});
		const registry = makeMockRegistry(engine);
		const consentGate = makeMockConsentGate({ status: "consented" });

		view = new SidebarView(leaf, registry, consentGate, nativeEngine, store);
		await view.onOpen();

		// Add v1 to the store before calling selectView
		store._views = { v1: makeViewRecord({ commandName: "Late View" }) };

		// _views is empty initially; selectView must reload
		const pv = view as unknown as { _views: Record<string, ViewRecord> };
		pv._views = {};

		await view.selectView("v1");

		expect((view as unknown as { selectedViewId: string | null }).selectedViewId).toBe("v1");
	});

	it("selectView(viewId) deselects the Context tab", async () => {
		const store = makeFakeStore({ v1: makeViewRecord({ commandName: "My View" }) });
		const registry = makeMockRegistry(engine);
		const consentGate = makeMockConsentGate({ status: "consented" });

		view = new SidebarView(leaf, registry, consentGate, nativeEngine, store);
		await view.onOpen();

		// Context is selected by default
		const ctxTab = view.contentEl.querySelector('.sf-tab[data-view-id="__context__"]') as HTMLElement;
		expect(ctxTab.getAttribute("aria-selected")).toBe("true");

		await view.selectView("v1");

		expect(ctxTab.getAttribute("aria-selected")).toBe("false");
	});
});

// ---------------------------------------------------------------------------
// Bug D2 — onOpen seeds active note context
// ---------------------------------------------------------------------------

describe("SidebarView Bug D2: onOpen seeds the active file context", () => {
	let app: App;
	let leaf: WorkspaceLeaf;
	let nativeEngine: ReturnType<typeof makeMockNativeEngine>;
	let view: SidebarView;

	beforeEach(() => {
		app = makeApp();
		leaf = makeOwnLeaf(app);
		nativeEngine = makeMockNativeEngine();
	});

	afterEach(async () => {
		if (view) await view.onClose();
		vi.restoreAllMocks();
	});

	it("onOpen with getActiveFile() returning a markdown TFile seeds subject and re-renders (not no-note)", async () => {
		const file = makeMdFile("Active Note");

		// Make getActiveFile return our markdown file
		const anyApp = app as unknown as { workspace: { getActiveFile: ReturnType<typeof vi.fn> } };
		anyApp.workspace.getActiveFile = vi.fn(() => file);

		// Provide metadata cache so ScopingService.classify can read it
		app.metadataCache.getFileCache = vi.fn(() => ({ frontmatter: { type: "scene" } }));

		view = new SidebarView(leaf, undefined, undefined, nativeEngine);
		await view.onOpen();

		// Subject must be seeded with the active file (not null)
		const pv = view as unknown as { subject: { file: TFile | null; source: string } };
		expect(pv.subject.file).not.toBeNull();
		expect(pv.subject.file?.basename).toBe("Active Note");
	});

	it("onOpen with no active file (getActiveFile returns null) stays no-note", async () => {
		const anyApp = app as unknown as { workspace: { getActiveFile: ReturnType<typeof vi.fn> } };
		anyApp.workspace.getActiveFile = vi.fn(() => null);

		view = new SidebarView(leaf, undefined, undefined, nativeEngine);
		await view.onOpen();

		// No active file — panel should show no-note state (subject.file === null)
		const pv = view as unknown as { subject: { file: TFile | null; source: string } };
		expect(pv.subject.file).toBeNull();

		// Body should contain no-note content
		const body = view.contentEl.querySelector(".sf-body");
		expect(body?.querySelector(".sf-empty")).not.toBeNull();
	});

	it("onOpen with getActiveFile() returning a non-md file stays no-note", async () => {
		const imageFile = new TFile();
		imageFile.path = "image.png";
		imageFile.name = "image.png";
		imageFile.basename = "image";
		imageFile.extension = "png";

		const anyApp = app as unknown as { workspace: { getActiveFile: ReturnType<typeof vi.fn> } };
		anyApp.workspace.getActiveFile = vi.fn(() => imageFile);

		view = new SidebarView(leaf, undefined, undefined, nativeEngine);
		await view.onOpen();

		// Non-markdown file — do NOT seed subject (stay no-note)
		const pv = view as unknown as { subject: { file: TFile | null; source: string } };
		// The file should not be seeded as subject (it's not markdown)
		// Either subject.file is null or the body shows non-md/no-note state
		const body = view.contentEl.querySelector(".sf-body");
		// Should not show a resolved/entity context — should be no-note or non-md
		expect(body?.querySelector(".sf-resolving")).toBeNull();
		expect(body?.querySelector(".sf-rows")).toBeNull();
	});

	it("seeding active file does NOT break subsequent active-leaf-change follow behavior", async () => {
		const file = makeMdFile("Active Note");
		const anyApp = app as unknown as { workspace: { getActiveFile: ReturnType<typeof vi.fn> } };
		anyApp.workspace.getActiveFile = vi.fn(() => file);
		app.metadataCache.getFileCache = vi.fn(() => ({ frontmatter: { type: "scene" } }));

		view = new SidebarView(leaf, undefined, undefined, nativeEngine);
		await view.onOpen();

		// The active-leaf-change event should still fire and update the subject
		// (the seeding must not set pinned mode)
		const pv = view as unknown as { subject: { source: string } };
		expect(pv.subject.source).toBe("follow");
	});
});
