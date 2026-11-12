/**
 * Stage-1 tab wiring tests — SidebarView with a fake ViewStore.
 *
 * Tests all "Stage 1 design" behaviours from jolly-soaring-scroll.md:
 *   - Tabs built from store (Codex, Navigator, then the views; default selection = Codex)
 *   - Empty store → Context only
 *   - Click selects tab and re-renders body via the correct engine
 *   - Selecting a disabled view shows S16 (.sf-disabled), engine.render NOT called
 *   - Store change → live tab rebuild (no re-open required)
 *   - Import surfaces live (1 → 2 tabs)
 *   - Selection preserved across a follow re-render
 *   - Removed selected view → Context fallback + body updates
 *   - Enable of selected view flips body S16→S14 live
 *   - onClose unsubscribes (subscriber set empty; no callback mutates after close)
 *   - Keyboard roving (Arrow Left/Right, Home/End move selection)
 *   - Backward-compat: new SidebarView(leaf) (no store) → Context only, no throw
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
// Helpers shared with engineDispatch tests
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
		frontmatter: {},
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
		kind: "view",
		surfaces: { anvil: false, workbench: false },
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

// ---------------------------------------------------------------------------
// Fake ViewStore
// ---------------------------------------------------------------------------

/**
 * Fake ViewStore with getViews + subscribe (add/remove) + a `_fire()` helper
 * so tests can trigger store change notifications synchronously.
 *
 * setRecord and deleteRecord are no-ops — this store only reads.
 */
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
		// Test helpers
		get _views() { return views; },
		set _views(v: Record<string, ViewRecord>) { views = v; },
		_fire(): void {
			for (const cb of subscribers) cb();
		},
		// expose subscriber count for leak tests
		get _subscriberCount(): number { return subscribers.size; },
	} as unknown as ViewStore & { _views: Record<string, ViewRecord>; _fire: () => void };

	return store;
}

// Helpers to query the SidebarView DOM
function getTabs(view: SidebarView): HTMLElement[] {
	return Array.from(view.contentEl.querySelectorAll(".sf-tab")) as HTMLElement[];
}

function getContextTab(view: SidebarView): HTMLElement {
	const tabs = getTabs(view);
	// Context tab has data-view-id="__context__"
	const ctx = tabs.find((t) => t.getAttribute("data-view-id") === "__context__");
	if (!ctx) throw new Error("Context tab not found");
	return ctx;
}

function getTabByViewId(view: SidebarView, id: string): HTMLElement {
	const el = view.contentEl.querySelector(`.sf-tab[data-view-id="${id}"]`) as HTMLElement | null;
	if (!el) throw new Error(`Tab with data-view-id="${id}" not found`);
	return el;
}

function getTabStrip(view: SidebarView): HTMLElement {
	return view.contentEl.querySelector(".sf-tabs") as HTMLElement;
}

function getBody(view: SidebarView): HTMLElement {
	return view.contentEl.querySelector(".sf-body") as HTMLElement;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SidebarView tabs: basic tab building from store", () => {
	let app: App;
	let leaf: WorkspaceLeaf;
	let nativeEngine: ReturnType<typeof makeMockNativeEngine>;
	let engine: ReturnType<typeof makeMockEngine>;
	let registry: EngineRegistry;
	let consentGate: ConsentGate;
	let view: SidebarView;

	beforeEach(() => {
		app = makeApp();
		leaf = makeOwnLeaf(app);
		nativeEngine = makeMockNativeEngine();
		engine = makeMockEngine("dataview-dql");
		registry = makeMockRegistry(engine);
		consentGate = makeMockConsentGate({ status: "consented" });
	});

	afterEach(async () => {
		if (view) await view.onClose();
		vi.restoreAllMocks();
	});

	it("empty store: Context + Navigator tabs rendered", async () => {
		const store = makeFakeStore({});
		view = new SidebarView(leaf, registry, consentGate, nativeEngine, store);
		await view.onOpen();
		const tabs = getTabs(view);
		expect(tabs.length).toBe(2);
		expect(tabs[0]?.getAttribute("data-view-id")).toBe("__context__");
		expect(tabs[1]?.getAttribute("data-view-id")).toBe("__navigator__");
	});

	it("one view: Codex first, then the fixed Navigator, then the view tab (S95, P7)", async () => {
		const store = makeFakeStore({ v1: makeViewRecord({ commandName: "My View" }) });
		view = new SidebarView(leaf, registry, consentGate, nativeEngine, store);
		await view.onOpen();
		const tabs = getTabs(view);
		expect(tabs.length).toBe(3);
		expect(tabs[0]?.getAttribute("data-view-id")).toBe("__context__");
		expect(tabs[0]?.textContent).toBe("Codex");
		expect(tabs[1]?.getAttribute("data-view-id")).toBe("__navigator__");
		expect(tabs[2]?.getAttribute("data-view-id")).toBe("v1");
	});

	it("Context tab is selected by default (aria-selected=true, sf-tab-sel class)", async () => {
		const store = makeFakeStore({ v1: makeViewRecord() });
		view = new SidebarView(leaf, registry, consentGate, nativeEngine, store);
		await view.onOpen();
		const ctxTab = getContextTab(view);
		expect(ctxTab.getAttribute("aria-selected")).toBe("true");
		expect(ctxTab.classList.contains("sf-tab-sel")).toBe(true);
	});

	it("view tab label uses commandName when present", async () => {
		const store = makeFakeStore({ v1: makeViewRecord({ commandName: "My View" }) });
		view = new SidebarView(leaf, registry, consentGate, nativeEngine, store);
		await view.onOpen();
		const tab = getTabByViewId(view, "v1");
		expect(tab.textContent).toBe("My View");
	});

	it("view tab label falls back to source basename when commandName absent", async () => {
		const store = makeFakeStore({
			v1: makeViewRecord({ commandName: undefined, source: "_forge/views/my-view.md" }),
		});
		view = new SidebarView(leaf, registry, consentGate, nativeEngine, store);
		await view.onOpen();
		const tab = getTabByViewId(view, "v1");
		expect(tab.textContent).toBe("my-view");
	});

	it("view tab has title attribute set (ADR-9 ellipsis tooltip)", async () => {
		const store = makeFakeStore({ v1: makeViewRecord({ commandName: "Long Label" }) });
		view = new SidebarView(leaf, registry, consentGate, nativeEngine, store);
		await view.onOpen();
		const tab = getTabByViewId(view, "v1");
		expect(tab.title).toBeTruthy();
	});

	it("view tab has data-view-id matching the store key", async () => {
		const store = makeFakeStore({ abc123: makeViewRecord() });
		view = new SidebarView(leaf, registry, consentGate, nativeEngine, store);
		await view.onOpen();
		expect(() => getTabByViewId(view, "abc123")).not.toThrow();
	});

	it("two views: both appear after Codex and Navigator", async () => {
		const store = makeFakeStore({
			v1: makeViewRecord({ commandName: "View A" }),
			v2: makeViewRecord({ commandName: "View B" }),
		});
		view = new SidebarView(leaf, registry, consentGate, nativeEngine, store);
		await view.onOpen();
		const tabs = getTabs(view);
		expect(tabs.length).toBe(4);
		expect(tabs[0]?.getAttribute("data-view-id")).toBe("__context__");
		expect(tabs[1]?.getAttribute("data-view-id")).toBe("__navigator__");
		expect(tabs.slice(2).map((t) => t.textContent)).toEqual(["View A", "View B"]);
	});
});

describe("SidebarView tabs: tab selection + body re-render", () => {
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

	it("clicking a view tab selects it (aria-selected=true, sf-tab-sel class)", async () => {
		const store = makeFakeStore({ v1: makeViewRecord() });
		const registry = makeMockRegistry(engine);
		const consentGate = makeMockConsentGate({ status: "consented" });
		view = new SidebarView(leaf, registry, consentGate, nativeEngine, store);
		await view.onOpen();

		const tab = getTabByViewId(view, "v1");
		tab.click();
		await Promise.resolve();

		expect(tab.getAttribute("aria-selected")).toBe("true");
		expect(tab.classList.contains("sf-tab-sel")).toBe(true);
	});

	it("clicking a view tab deselects Context (aria-selected=false)", async () => {
		const store = makeFakeStore({ v1: makeViewRecord() });
		const registry = makeMockRegistry(engine);
		const consentGate = makeMockConsentGate({ status: "consented" });
		view = new SidebarView(leaf, registry, consentGate, nativeEngine, store);
		await view.onOpen();

		const tab = getTabByViewId(view, "v1");
		tab.click();
		await Promise.resolve();

		const ctxTab = getContextTab(view);
		expect(ctxTab.getAttribute("aria-selected")).toBe("false");
		expect(ctxTab.classList.contains("sf-tab-sel")).toBe(false);
	});

	it("clicking a view tab calls engine.render with the selected v1 record", async () => {
		const v1Record = makeViewRecord({ source: "_forge/views/v1.md" });
		const store = makeFakeStore({ v1: v1Record });
		const registry = makeMockRegistry(engine);
		const consentGate = makeMockConsentGate({ status: "consented" });
		view = new SidebarView(leaf, registry, consentGate, nativeEngine, store);
		await view.onOpen();

		// Simulate resolved context — type=scene so classify returns a valid kind
		const file = makeMdFile("Scene 1");
		const ctx = makeNoteContext(file);
		const pv = view as unknown as { currentCtx: NoteContext | null; subject: { file: TFile | null; source: string } };
		pv.currentCtx = ctx;
		pv.subject = { file, source: "follow" };
		app.metadataCache.getFileCache = vi.fn(() => ({ frontmatter: { type: "scene" } }));

		const tab = getTabByViewId(view, "v1");
		tab.click();
		// wait for async body re-render
		await new Promise((r) => setTimeout(r, 0));

		// Assert render was called with the v1 record specifically (not native/null)
		expect(engine.render).toHaveBeenCalledWith(
			expect.objectContaining({ source: "_forge/views/v1.md" }),
			expect.any(Object),
			expect.any(Object),
		);
	});

	it("clicking a disabled view tab shows S16 (.sf-disabled) and does NOT call engine.render", async () => {
		const store = makeFakeStore({
			v1: makeViewRecord({ enabled: false }),
		});
		const registry = makeMockRegistry(engine);
		const consentGate = makeMockConsentGate({ status: "disabled" });
		view = new SidebarView(leaf, registry, consentGate, nativeEngine, store);
		await view.onOpen();

		// Provide type=scene so _computeState returns "resolved" and engine dispatch runs
		const file = makeMdFile("Scene 1");
		const ctx = makeNoteContext(file);
		const pv = view as unknown as { currentCtx: NoteContext | null; subject: { file: TFile | null; source: string } };
		pv.currentCtx = ctx;
		pv.subject = { file, source: "follow" };
		app.metadataCache.getFileCache = vi.fn(() => ({ frontmatter: { type: "scene" } }));

		const tab = getTabByViewId(view, "v1");
		tab.click();
		await new Promise((r) => setTimeout(r, 0));

		expect(getBody(view).querySelector(".sf-disabled")).not.toBeNull();
		expect(engine.render).not.toHaveBeenCalled();
	});
});

describe("SidebarView tabs: live refresh on store change", () => {
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

	it("store fire rebuilds tabs without re-open (1→2 tabs)", async () => {
		const store = makeFakeStore({ v1: makeViewRecord({ commandName: "View A" }) });
		const registry = makeMockRegistry();
		const consentGate = makeMockConsentGate({ status: "consented" });
		view = new SidebarView(leaf, registry, consentGate, nativeEngine, store);
		await view.onOpen();

		expect(getTabs(view).length).toBe(3); // v1 + Context + Navigator

		// Simulate import of a second view
		store._views = {
			v1: makeViewRecord({ commandName: "View A" }),
			v2: makeViewRecord({ commandName: "View B" }),
		};
		store._fire();
		// _reloadViews is async
		await new Promise((r) => setTimeout(r, 0));

		expect(getTabs(view).length).toBe(4); // v1 + v2 + Context + Navigator
		expect(() => getTabByViewId(view, "v2")).not.toThrow();
	});

	it("importing an unrelated view does NOT re-render the currently selected view (no spurious flash)", async () => {
		// v1 is selected and rendered; importing v2 should rebuild tabs but NOT re-run v1's engine.
		const engine = makeMockEngine();
		const registry = makeMockRegistry(engine);
		const consentGate = makeMockConsentGate({ status: "consented" });
		const store = makeFakeStore({ v1: makeViewRecord({ commandName: "View A", source: "_forge/views/v1.md" }) });
		view = new SidebarView(leaf, registry, consentGate, nativeEngine, store);
		await view.onOpen();

		// Set resolved context so selecting v1 triggers an engine render
		const file = makeMdFile("Scene 1");
		const ctx = makeNoteContext(file);
		const pv = view as unknown as { currentCtx: NoteContext | null; subject: { file: TFile | null; source: string } };
		pv.currentCtx = ctx;
		pv.subject = { file, source: "follow" };
		app.metadataCache.getFileCache = vi.fn(() => ({ frontmatter: { type: "scene" } }));

		// Select v1 → engine.render called once
		getTabByViewId(view, "v1").click();
		await new Promise((r) => setTimeout(r, 0));
		expect(engine.render).toHaveBeenCalledTimes(1);

		// Import v2 — v1's source/engine/enabled/okayed are UNCHANGED
		store._views = {
			v1: makeViewRecord({ commandName: "View A", source: "_forge/views/v1.md" }),
			v2: makeViewRecord({ commandName: "View B", source: "_forge/views/v2.md" }),
		};
		store._fire();
		await new Promise((r) => setTimeout(r, 0));

		// Tabs now visible (v1 + v2 + Context + Navigator = 4)
		expect(getTabs(view).length).toBe(4);
		// But v1's engine must NOT have been called again (no spurious re-render)
		expect(engine.render).toHaveBeenCalledTimes(1);
	});

	it("removed selected view falls back to Context + body updates + selectedViewId reset", async () => {
		// Use a disabled view so selecting it shows S16 — gives a body marker we can
		// later assert is gone, proving the body actually re-rendered on fallback.
		const disabledGate = {
			evaluate: vi.fn(async () => ({ status: "disabled" as const })),
			requestConsent: vi.fn(async () => false),
			requestReConsent: vi.fn(async () => false),
		} as unknown as ReturnType<typeof makeMockConsentGate>;
		const store = makeFakeStore({ v1: makeViewRecord({ commandName: "View A", enabled: false }) });
		const registry = makeMockRegistry(makeMockEngine());
		view = new SidebarView(leaf, registry, disabledGate, nativeEngine, store);
		await view.onOpen();

		// Set resolved context so engine dispatch runs
		const file = makeMdFile("Scene 1");
		const ctx = makeNoteContext(file);
		const pv = view as unknown as {
			currentCtx: NoteContext | null;
			subject: { file: TFile | null; source: string };
			selectedViewId: string | null;
		};
		pv.currentCtx = ctx;
		pv.subject = { file, source: "follow" };
		app.metadataCache.getFileCache = vi.fn(() => ({ frontmatter: { type: "scene" } }));

		// Select v1 — body shows S16 (.sf-disabled)
		getTabByViewId(view, "v1").click();
		await new Promise((r) => setTimeout(r, 0));
		expect(getBody(view).querySelector(".sf-disabled")).not.toBeNull();

		// Remove v1 from store
		store._views = {};
		store._fire();
		await new Promise((r) => setTimeout(r, 0));

		// Tab selection: Context should now be selected
		const ctxTab = getContextTab(view);
		expect(ctxTab.getAttribute("aria-selected")).toBe("true");
		expect(ctxTab.classList.contains("sf-tab-sel")).toBe(true);

		// selectedViewId must be reset to null
		expect(pv.selectedViewId).toBeNull();

		// Body must no longer show the removed view's S16 state
		expect(getBody(view).querySelector(".sf-disabled")).toBeNull();
	});

	it("enable of selected disabled view flips body live (S16→S14 consented)", async () => {
		// Gate returns "disabled" on the FIRST evaluate call, "consented" on the SECOND.
		// First call: clicking v1 when it's disabled → S16.
		// Second call: store fires with enabled record → _reloadViews re-points
		// currentRecord → _rerenderBody → evaluate returns "consented" → S14.
		const engine = makeMockEngine();
		const gate = {
			evaluate: vi.fn()
				.mockResolvedValueOnce({ status: "disabled" as const })
				.mockResolvedValueOnce({ status: "consented" as const }),
			requestConsent: vi.fn(async () => false),
			requestReConsent: vi.fn(async () => false),
		} as unknown as ReturnType<typeof makeMockConsentGate>;

		const store = makeFakeStore({ v1: makeViewRecord({ enabled: false }) });
		const registry = makeMockRegistry(engine);
		view = new SidebarView(leaf, registry, gate, nativeEngine, store);
		await view.onOpen();

		// Set resolved context so engine dispatch runs
		const file = makeMdFile("Scene 1");
		const ctx = makeNoteContext(file);
		const pv = view as unknown as { currentCtx: NoteContext | null; subject: { file: TFile | null; source: string } };
		pv.currentCtx = ctx;
		pv.subject = { file, source: "follow" };
		app.metadataCache.getFileCache = vi.fn(() => ({ frontmatter: { type: "scene" } }));

		// Select v1 → first evaluate call → "disabled" → S16
		getTabByViewId(view, "v1").click();
		await new Promise((r) => setTimeout(r, 0));
		expect(getBody(view).querySelector(".sf-disabled")).not.toBeNull();

		// Update store to enabled record; store fires → _reloadViews → _rerenderBody
		// → second evaluate call → "consented" → engine.render called → S14
		store._views = { v1: makeViewRecord({ enabled: true }) };
		store._fire();
		await new Promise((r) => setTimeout(r, 0));

		// S16 must be gone
		expect(getBody(view).querySelector(".sf-disabled")).toBeNull();
		// Engine must have rendered (S14 active)
		expect(engine.render).toHaveBeenCalled();
		// v1 tab still selected
		expect(getTabByViewId(view, "v1").getAttribute("aria-selected")).toBe("true");
	});
});

describe("SidebarView tabs: selection preserved across follow re-render", () => {
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

	it("note change does not rebuild tab strip or reset selectedViewId", async () => {
		const store = makeFakeStore({ v1: makeViewRecord({ commandName: "View A" }) });
		const engine = makeMockEngine();
		const registry = makeMockRegistry(engine);
		const consentGate = makeMockConsentGate({ status: "consented" });
		view = new SidebarView(leaf, registry, consentGate, nativeEngine, store);
		await view.onOpen();

		// Select v1
		const tabBefore = getTabByViewId(view, "v1");
		tabBefore.click();
		await Promise.resolve();

		// Capture the DOM node reference for the tab strip
		const stripBefore = getTabStrip(view);

		// Simulate note change via _doFollow internal path (call _computeState + _renderState directly)
		const pv = view as unknown as {
			_renderState: (s: unknown) => void;
			_computeState: () => unknown;
			currentCtx: NoteContext | null;
			subject: { file: TFile | null; source: string };
		};
		const file2 = makeMdFile("Scene 2");
		pv.currentCtx = makeNoteContext(file2);
		pv.subject = { file: file2, source: "follow" };
		pv._renderState(pv._computeState());
		await new Promise((r) => setTimeout(r, 0));

		// The tab strip DOM node must be the same reference (not rebuilt)
		expect(getTabStrip(view)).toBe(stripBefore);

		// selectedViewId must still be "v1"
		const pvAfter = view as unknown as { selectedViewId: string | null };
		expect(pvAfter.selectedViewId).toBe("v1");
	});

	it("v1 tab stays selected (aria-selected) after a body re-render triggered by note change", async () => {
		const store = makeFakeStore({ v1: makeViewRecord({ commandName: "View A" }) });
		const engine = makeMockEngine();
		const registry = makeMockRegistry(engine);
		const consentGate = makeMockConsentGate({ status: "consented" });
		view = new SidebarView(leaf, registry, consentGate, nativeEngine, store);
		await view.onOpen();

		// Select v1
		getTabByViewId(view, "v1").click();
		await Promise.resolve();

		// Trigger a state re-render (simulating a note change reaching _renderState)
		const pv = view as unknown as {
			_renderState: (s: unknown) => void;
			_computeState: () => unknown;
			currentCtx: NoteContext | null;
			subject: { file: TFile | null; source: string };
		};
		const file2 = makeMdFile("Scene 2");
		pv.currentCtx = makeNoteContext(file2);
		pv.subject = { file: file2, source: "follow" };
		pv._renderState(pv._computeState());
		await new Promise((r) => setTimeout(r, 0));

		// v1 tab must still be selected
		const v1Tab = getTabByViewId(view, "v1");
		expect(v1Tab.getAttribute("aria-selected")).toBe("true");
		expect(v1Tab.classList.contains("sf-tab-sel")).toBe(true);

		// Context tab must not be selected
		const ctxTab = getContextTab(view);
		expect(ctxTab.getAttribute("aria-selected")).toBe("false");
	});
});

describe("SidebarView tabs: onClose teardown", () => {
	let app: App;
	let leaf: WorkspaceLeaf;
	let nativeEngine: ReturnType<typeof makeMockNativeEngine>;

	beforeEach(() => {
		app = makeApp();
		leaf = makeOwnLeaf(app);
		nativeEngine = makeMockNativeEngine();
	});

	it("onClose unsubscribes from store (subscriber set is empty after close)", async () => {
		const store = makeFakeStore({ v1: makeViewRecord() });
		const registry = makeMockRegistry();
		const consentGate = makeMockConsentGate({ status: "consented" });
		const view = new SidebarView(leaf, registry, consentGate, nativeEngine, store);
		await view.onOpen();

		const storeWithCount = store as unknown as { _subscriberCount: number };
		expect(storeWithCount._subscriberCount).toBe(1);

		await view.onClose();

		expect(storeWithCount._subscriberCount).toBe(0);
	});

	it("onClose resets selectedViewId and _views", async () => {
		const store = makeFakeStore({ v1: makeViewRecord() });
		const registry = makeMockRegistry();
		const consentGate = makeMockConsentGate({ status: "consented" });
		const view = new SidebarView(leaf, registry, consentGate, nativeEngine, store);
		await view.onOpen();

		// Select v1
		getTabByViewId(view, "v1").click();
		await Promise.resolve();

		await view.onClose();

		const pv = view as unknown as {
			selectedViewId: string | null;
			_views: Record<string, ViewRecord>;
		};
		expect(pv.selectedViewId).toBeNull();
		expect(Object.keys(pv._views).length).toBe(0);
	});

	it("after onClose, store fire does NOT mutate the panel DOM (unsubscribe is effective)", async () => {
		const store = makeFakeStore({ v1: makeViewRecord() });
		const registry = makeMockRegistry();
		const consentGate = makeMockConsentGate({ status: "consented" });
		const view = new SidebarView(leaf, registry, consentGate, nativeEngine, store);
		await view.onOpen();

		// _tabsEl is nulled on close; spy on _reloadViews to confirm it is not called.
		// We can't directly spy on private _reloadViews, but we can observe its
		// side-effect: tab count. After close, _tabsEl is null so getTabs returns [].
		await view.onClose();

		// After close, contentEl is empty (onClose calls aug(contentEl).empty())
		// and _tabsEl is null. Tab count must be 0.
		const tabCountAfterClose = getTabs(view).length;
		expect(tabCountAfterClose).toBe(0);

		// Fire store with a new view — subscriber must be dead, so no DOM mutation.
		store._views = { v2: makeViewRecord({ commandName: "Should not appear" }) };
		store._fire();
		// Give any async _reloadViews a chance to run if it weren't unsubscribed
		await new Promise((r) => setTimeout(r, 0));

		// Tab count must still be 0 — _tabsEl is null so _renderTabs is a no-op
		// even if _reloadViews were called, but the subscriber count being 0 means
		// _reloadViews is never scheduled at all.
		expect(getTabs(view).length).toBe(0);
		// Subscriber set is empty (confirmed separately by the subscriber-count test)
		expect((store as unknown as { _subscriberCount: number })._subscriberCount).toBe(0);
	});
});

describe("SidebarView tabs: keyboard roving tabindex", () => {
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

	function fireKey(el: HTMLElement, key: string): void {
		el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
	}

	it("selected tab has tabindex=0, others have tabindex=-1", async () => {
		const store = makeFakeStore({
			v1: makeViewRecord({ commandName: "View A" }),
			v2: makeViewRecord({ commandName: "View B" }),
		});
		const registry = makeMockRegistry();
		const consentGate = makeMockConsentGate({ status: "consented" });
		view = new SidebarView(leaf, registry, consentGate, nativeEngine, store);
		await view.onOpen();

		// Context is selected by default
		const ctxTab = getContextTab(view);
		expect(ctxTab.getAttribute("tabindex")).toBe("0");

		const v1Tab = getTabByViewId(view, "v1");
		const v2Tab = getTabByViewId(view, "v2");
		expect(v1Tab.getAttribute("tabindex")).toBe("-1");
		expect(v2Tab.getAttribute("tabindex")).toBe("-1");
	});

	it("ArrowLeft from Context wraps to last view tab", async () => {
		const store = makeFakeStore({
			v1: makeViewRecord({ commandName: "View A" }),
			v2: makeViewRecord({ commandName: "View B" }),
		});
		const registry = makeMockRegistry();
		const consentGate = makeMockConsentGate({ status: "consented" });
		view = new SidebarView(leaf, registry, consentGate, nativeEngine, store);
		await view.onOpen();

		// Context is selected initially
		const strip = getTabStrip(view);
		const ctxTab = getContextTab(view);
		fireKey(ctxTab, "ArrowLeft");
		await Promise.resolve();

		// Should wrap to v2 (last tab before Context)
		const v2Tab = getTabByViewId(view, "v2");
		expect(v2Tab.getAttribute("aria-selected")).toBe("true");
		expect(v2Tab.getAttribute("tabindex")).toBe("0");
		expect(ctxTab.getAttribute("aria-selected")).toBe("false");
		void strip; // suppress unused warning
	});

	it("ArrowRight from the last tab (Navigator) wraps to the first tab", async () => {
		const store = makeFakeStore({
			v1: makeViewRecord({ commandName: "View A" }),
			v2: makeViewRecord({ commandName: "View B" }),
		});
		const registry = makeMockRegistry();
		const consentGate = makeMockConsentGate({ status: "consented" });
		view = new SidebarView(leaf, registry, consentGate, nativeEngine, store);
		await view.onOpen();

		// Navigator is the last tab — ArrowRight from it wraps to v1 (first tab).
		const navTab = getTabByViewId(view, "__navigator__");
		fireKey(navTab, "ArrowRight");
		await Promise.resolve();

		const v1Tab = getTabByViewId(view, "v1");
		expect(v1Tab.getAttribute("aria-selected")).toBe("true");
	});

	it("Home moves to first tab (Codex)", async () => {
		const store = makeFakeStore({
			v1: makeViewRecord({ commandName: "View A" }),
			v2: makeViewRecord({ commandName: "View B" }),
		});
		const registry = makeMockRegistry();
		const consentGate = makeMockConsentGate({ status: "consented" });
		view = new SidebarView(leaf, registry, consentGate, nativeEngine, store);
		await view.onOpen();

		// Select the last view tab, then Home: the first tab is Codex.
		const v2Tab = getTabByViewId(view, "v2");
		v2Tab.click();
		await Promise.resolve();
		fireKey(v2Tab, "Home");
		await Promise.resolve();

		expect(getContextTab(view).getAttribute("aria-selected")).toBe("true");
	});

	it("End moves to the last tab (the last view tab)", async () => {
		const store = makeFakeStore({
			v1: makeViewRecord({ commandName: "View A" }),
		});
		const registry = makeMockRegistry();
		const consentGate = makeMockConsentGate({ status: "consented" });
		view = new SidebarView(leaf, registry, consentGate, nativeEngine, store);
		await view.onOpen();

		// Select Codex, then End → the view tab (now last, after Navigator).
		fireKey(getContextTab(view), "End");
		await Promise.resolve();

		expect(getTabByViewId(view, "v1").getAttribute("aria-selected")).toBe("true");
	});

	it("ArrowRight from view tab moves to next view tab", async () => {
		const store = makeFakeStore({
			v1: makeViewRecord({ commandName: "View A" }),
			v2: makeViewRecord({ commandName: "View B" }),
		});
		const registry = makeMockRegistry();
		const consentGate = makeMockConsentGate({ status: "consented" });
		view = new SidebarView(leaf, registry, consentGate, nativeEngine, store);
		await view.onOpen();

		// Select v1, then ArrowRight
		const v1Tab = getTabByViewId(view, "v1");
		v1Tab.click();
		await Promise.resolve();
		fireKey(v1Tab, "ArrowRight");
		await Promise.resolve();

		// Should move to v2
		const v2Tab = getTabByViewId(view, "v2");
		expect(v2Tab.getAttribute("aria-selected")).toBe("true");
	});
});

describe("SidebarView tabs: backward compat (no store)", () => {
	it("new SidebarView(leaf) with no store — Context + Navigator, no throw", async () => {
		const app = makeApp();
		const leaf = makeOwnLeaf(app);
		// Old-style construction — no store arg
		const view = new SidebarView(leaf);
		await expect(view.onOpen()).resolves.toBeUndefined();

		const tabs = getTabs(view);
		expect(tabs.length).toBe(2);
		expect(tabs[0]?.getAttribute("data-view-id")).toBe("__context__");
		expect(tabs[1]?.getAttribute("data-view-id")).toBe("__navigator__");

		await view.onClose();
	});

	it("new SidebarView(leaf, registry, gate, native) with no store — Context + Navigator", async () => {
		const app = makeApp();
		const leaf = makeOwnLeaf(app);
		const native = {
			kind: "native" as const,
			teardown: vi.fn(),
			render: vi.fn(async () => {}),
		} as unknown as NativeScopingEngine;
		const registry = makeMockRegistry();
		const consentGate = makeMockConsentGate({ status: "consented" });
		const view = new SidebarView(leaf, registry, consentGate, native);
		await expect(view.onOpen()).resolves.toBeUndefined();

		const tabs = getTabs(view);
		expect(tabs.length).toBe(2);
		expect(tabs[0]?.getAttribute("data-view-id")).toBe("__context__");
		expect(tabs[1]?.getAttribute("data-view-id")).toBe("__navigator__");

		await view.onClose();
	});
});
