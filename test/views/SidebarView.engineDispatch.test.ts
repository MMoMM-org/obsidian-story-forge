/**
 * T4.1 — SidebarView engine dispatch + panel states (RED → GREEN)
 *
 * Tests the engine dispatch logic in _renderResolved after injecting
 * EngineRegistry, ConsentGate, and NativeScopingEngine into SidebarView.
 *
 * State matrix:
 *   "consented"          → teardown→empty→engine.render (order verified)
 *   "not-consented"      → S12 consent-required element
 *   "drift"              → S17 re-consent-required element
 *   "disabled"           → S16 disabled element
 *   "platform-restricted"→ S11 variant element
 *   "engine-missing"     → S11 element + nativeEngine.render() fallback
 *   "dvjs-off"           → S15 variant element
 *   missing engine       → native fallback renders
 *   loading              → S13 loading state during async render in-flight
 *   onClose              → currentEngine.teardown() called
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
		frontmatter: {},
		resolvedAt: Date.now(),
	};
}

function makeViewRecord(
	overrides?: Partial<ViewRecord>,
): ViewRecord {
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

/** Create a mock QueryEngine that records call order. */
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

/** Create a mock NativeScopingEngine. */
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

/** Create a mock EngineRegistry. */
function makeMockRegistry(engine?: QueryEngine): EngineRegistry {
	return {
		get: vi.fn(() => engine),
	} as unknown as EngineRegistry;
}

/** Create a mock ConsentGate that returns a specific decision. */
function makeMockConsentGate(decision: ConsentDecision): ConsentGate {
	return {
		evaluate: vi.fn(async () => decision),
		requestConsent: vi.fn(async () => false),
		requestReConsent: vi.fn(async () => false),
	} as unknown as ConsentGate;
}

/** Get the body element from a SidebarView's DOM. */
function getBody(view: SidebarView): HTMLElement {
	return view.contentEl.querySelector(".sf-body") as HTMLElement;
}

// ---------------------------------------------------------------------------
// Engine dispatch tests
// ---------------------------------------------------------------------------

describe("SidebarView: engine dispatch (_renderResolved)", () => {
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
		if (view) {
			await view.onClose();
		}
		vi.restoreAllMocks();
	});

	// -------------------------------------------------------------------------
	// "consented" — exact teardown→empty→render order
	// -------------------------------------------------------------------------

	it("consented: calls teardown then empty then engine.render in exact order", async () => {
		const engine = makeMockEngine("dataview-dql");
		const registry = makeMockRegistry(engine);
		const consentGate = makeMockConsentGate({ status: "consented" });

		view = new SidebarView(leaf, registry, consentGate, nativeEngine);
		await view.onOpen();

		const file = makeMdFile("Scene 1");
		const ctx = makeNoteContext(file);
		const record = makeViewRecord();

		const callOrder: string[] = [];
		engine.teardown.mockImplementation(() => { callOrder.push("teardown"); });
		engine.render.mockImplementation(async () => { callOrder.push("render"); });

		// Inject a previous engine (simulating a re-render)
		const privateView = view as unknown as {
			currentEngine: QueryEngine | null;
			currentRecord: ViewRecord | null;
			_renderResolved(body: HTMLElement, ctx: NoteContext): Promise<void>;
		};
		privateView.currentEngine = engine;
		privateView.currentRecord = record;

		const body = getBody(view);
		// Track empty() calls on body
		const bodyAugEl = body as unknown as { empty: () => void };
		const origEmpty = bodyAugEl.empty.bind(bodyAugEl);
		bodyAugEl.empty = vi.fn(() => {
			callOrder.push("empty");
			origEmpty();
		});

		await privateView._renderResolved(body, ctx);

		expect(callOrder).toEqual(["teardown", "empty", "render"]);
	});

	it("consented: engine.render is called with the view record, ctx, and body", async () => {
		const engine = makeMockEngine("dataview-dql");
		const registry = makeMockRegistry(engine);
		const consentGate = makeMockConsentGate({ status: "consented" });

		view = new SidebarView(leaf, registry, consentGate, nativeEngine);
		await view.onOpen();

		const file = makeMdFile("Scene 1");
		const ctx = makeNoteContext(file);
		const record = makeViewRecord();

		const privateView = view as unknown as {
			currentRecord: ViewRecord | null;
			_renderResolved(body: HTMLElement, ctx: NoteContext): Promise<void>;
		};
		privateView.currentRecord = record;

		const body = getBody(view);
		await privateView._renderResolved(body, ctx);

		expect(engine.render).toHaveBeenCalledWith(record, ctx, body);
	});

	// -------------------------------------------------------------------------
	// "not-consented" → S12 consent-required
	// -------------------------------------------------------------------------

	it("not-consented: renders S12 consent-required element", async () => {
		const engine = makeMockEngine("dataviewjs");
		const registry = makeMockRegistry(engine);
		const consentGate = makeMockConsentGate({ status: "not-consented" });

		view = new SidebarView(leaf, registry, consentGate, nativeEngine);
		await view.onOpen();

		const file = makeMdFile("Scene 1");
		const ctx = makeNoteContext(file);
		const record = makeViewRecord({ engine: "dataviewjs" });

		const privateView = view as unknown as {
			currentRecord: ViewRecord | null;
			_renderResolved(body: HTMLElement, ctx: NoteContext): Promise<void>;
		};
		privateView.currentRecord = record;

		const body = getBody(view);
		await privateView._renderResolved(body, ctx);

		expect(body.querySelector(".sf-consent-required")).not.toBeNull();
	});

	it("not-consented: does NOT call engine.render", async () => {
		const engine = makeMockEngine("dataviewjs");
		const registry = makeMockRegistry(engine);
		const consentGate = makeMockConsentGate({ status: "not-consented" });

		view = new SidebarView(leaf, registry, consentGate, nativeEngine);
		await view.onOpen();

		const file = makeMdFile("Scene 1");
		const ctx = makeNoteContext(file);
		const record = makeViewRecord({ engine: "dataviewjs" });

		const privateView = view as unknown as {
			currentRecord: ViewRecord | null;
			_renderResolved(body: HTMLElement, ctx: NoteContext): Promise<void>;
		};
		privateView.currentRecord = record;

		const body = getBody(view);
		await privateView._renderResolved(body, ctx);

		expect(engine.render).not.toHaveBeenCalled();
	});

	// -------------------------------------------------------------------------
	// "drift" → S17 re-consent required
	// -------------------------------------------------------------------------

	it("drift: renders S17 re-consent-required element", async () => {
		const engine = makeMockEngine("dataviewjs");
		const registry = makeMockRegistry(engine);
		const consentGate = makeMockConsentGate({ status: "drift", reason: "checksum" });

		view = new SidebarView(leaf, registry, consentGate, nativeEngine);
		await view.onOpen();

		const file = makeMdFile("Scene 1");
		const ctx = makeNoteContext(file);
		const record = makeViewRecord({ engine: "dataviewjs" });

		const privateView = view as unknown as {
			currentRecord: ViewRecord | null;
			_renderResolved(body: HTMLElement, ctx: NoteContext): Promise<void>;
		};
		privateView.currentRecord = record;

		const body = getBody(view);
		await privateView._renderResolved(body, ctx);

		expect(body.querySelector(".sf-reconsent-required")).not.toBeNull();
	});

	it("drift: does NOT call engine.render", async () => {
		const engine = makeMockEngine("dataviewjs");
		const registry = makeMockRegistry(engine);
		const consentGate = makeMockConsentGate({ status: "drift", reason: "checksum" });

		view = new SidebarView(leaf, registry, consentGate, nativeEngine);
		await view.onOpen();

		const file = makeMdFile("Scene 1");
		const ctx = makeNoteContext(file);
		const record = makeViewRecord({ engine: "dataviewjs" });

		const privateView = view as unknown as {
			currentRecord: ViewRecord | null;
			_renderResolved(body: HTMLElement, ctx: NoteContext): Promise<void>;
		};
		privateView.currentRecord = record;

		const body = getBody(view);
		await privateView._renderResolved(body, ctx);

		expect(engine.render).not.toHaveBeenCalled();
	});

	// -------------------------------------------------------------------------
	// "disabled" → S16
	// -------------------------------------------------------------------------

	it("disabled: renders S16 disabled element", async () => {
		const engine = makeMockEngine("dataview-dql");
		const registry = makeMockRegistry(engine);
		const consentGate = makeMockConsentGate({ status: "disabled" });

		view = new SidebarView(leaf, registry, consentGate, nativeEngine);
		await view.onOpen();

		const file = makeMdFile("Scene 1");
		const ctx = makeNoteContext(file);
		const record = makeViewRecord({ enabled: false });

		const privateView = view as unknown as {
			currentRecord: ViewRecord | null;
			_renderResolved(body: HTMLElement, ctx: NoteContext): Promise<void>;
		};
		privateView.currentRecord = record;

		const body = getBody(view);
		await privateView._renderResolved(body, ctx);

		expect(body.querySelector(".sf-disabled")).not.toBeNull();
	});

	// -------------------------------------------------------------------------
	// "platform-restricted" → S11 variant
	// -------------------------------------------------------------------------

	it("platform-restricted: renders S11 platform-restriction element", async () => {
		const engine = makeMockEngine("dataviewjs");
		const registry = makeMockRegistry(engine);
		const consentGate = makeMockConsentGate({ status: "platform-restricted" });

		view = new SidebarView(leaf, registry, consentGate, nativeEngine);
		await view.onOpen();

		const file = makeMdFile("Scene 1");
		const ctx = makeNoteContext(file);
		const record = makeViewRecord({ engine: "dataviewjs" });

		const privateView = view as unknown as {
			currentRecord: ViewRecord | null;
			_renderResolved(body: HTMLElement, ctx: NoteContext): Promise<void>;
		};
		privateView.currentRecord = record;

		const body = getBody(view);
		await privateView._renderResolved(body, ctx);

		expect(body.querySelector(".sf-platform-restricted")).not.toBeNull();
	});

	// -------------------------------------------------------------------------
	// "engine-missing" → S11 + native fallback renders
	// -------------------------------------------------------------------------

	it("engine-missing (via consent gate): renders S11 engine-missing element", async () => {
		const engine = makeMockEngine("dataview-dql");
		const registry = makeMockRegistry(engine);
		const consentGate = makeMockConsentGate({ status: "engine-missing" });

		view = new SidebarView(leaf, registry, consentGate, nativeEngine);
		await view.onOpen();

		const file = makeMdFile("Scene 1");
		const ctx = makeNoteContext(file);
		const record = makeViewRecord();

		const privateView = view as unknown as {
			currentRecord: ViewRecord | null;
			_renderResolved(body: HTMLElement, ctx: NoteContext): Promise<void>;
		};
		privateView.currentRecord = record;

		const body = getBody(view);
		await privateView._renderResolved(body, ctx);

		expect(body.querySelector(".sf-engine-missing")).not.toBeNull();
	});

	it("engine-missing (registry returns undefined): renders S11 element and calls nativeEngine.render", async () => {
		// Registry returns undefined → no wired engine → S11 + native fallback
		const registry = makeMockRegistry(undefined);
		const consentGate = makeMockConsentGate({ status: "consented" }); // won't reach consent check

		view = new SidebarView(leaf, registry, consentGate, nativeEngine);
		await view.onOpen();

		const file = makeMdFile("Scene 1");
		const ctx = makeNoteContext(file);
		const record = makeViewRecord();

		// Set a previous engine to verify teardown order (ADR-7)
		const previousEngine = makeMockEngine("dataview-dql");
		const callOrder: string[] = [];
		previousEngine.teardown.mockImplementation(() => { callOrder.push("teardown"); });
		nativeEngine.render.mockImplementation(async () => { callOrder.push("render"); });

		const privateView = view as unknown as {
			currentEngine: QueryEngine | null;
			currentRecord: ViewRecord | null;
			_renderResolved(body: HTMLElement, ctx: NoteContext): Promise<void>;
		};
		privateView.currentEngine = previousEngine;
		privateView.currentRecord = record;

		const body = getBody(view);
		const bodyAugEl = body as unknown as { empty: () => void };
		const origEmpty = bodyAugEl.empty.bind(bodyAugEl);
		bodyAugEl.empty = vi.fn(() => {
			callOrder.push("empty");
			origEmpty();
		});

		await privateView._renderResolved(body, ctx);

		// ADR-7: teardown → empty → render (enforced in native fallback branch too)
		expect(callOrder).toEqual(["teardown", "empty", "render"]);
		expect(body.querySelector(".sf-engine-missing")).not.toBeNull();
		expect(nativeEngine.render).toHaveBeenCalled();
	});

	// -------------------------------------------------------------------------
	// "dvjs-off" → S15 variant
	// -------------------------------------------------------------------------

	it("dvjs-off: renders S15 dvjs-off element", async () => {
		const engine = makeMockEngine("dataviewjs");
		const registry = makeMockRegistry(engine);
		const consentGate = makeMockConsentGate({ status: "dvjs-off" });

		view = new SidebarView(leaf, registry, consentGate, nativeEngine);
		await view.onOpen();

		const file = makeMdFile("Scene 1");
		const ctx = makeNoteContext(file);
		const record = makeViewRecord({ engine: "dataviewjs" });

		const privateView = view as unknown as {
			currentRecord: ViewRecord | null;
			_renderResolved(body: HTMLElement, ctx: NoteContext): Promise<void>;
		};
		privateView.currentRecord = record;

		const body = getBody(view);
		await privateView._renderResolved(body, ctx);

		expect(body.querySelector(".sf-dvjs-off")).not.toBeNull();
	});

	// -------------------------------------------------------------------------
	// No view record → native fallback (no currentRecord)
	// -------------------------------------------------------------------------

	it("no currentRecord: falls back to nativeEngine.render", async () => {
		const registry = makeMockRegistry(undefined);
		const consentGate = makeMockConsentGate({ status: "consented" });

		view = new SidebarView(leaf, registry, consentGate, nativeEngine);
		await view.onOpen();

		const file = makeMdFile("Scene 1");
		const ctx = makeNoteContext(file);

		const privateView = view as unknown as {
			currentRecord: ViewRecord | null;
			_renderResolved(body: HTMLElement, ctx: NoteContext): Promise<void>;
		};
		// currentRecord is null — no view selected
		privateView.currentRecord = null;

		const body = getBody(view);
		await privateView._renderResolved(body, ctx);

		expect(nativeEngine.render).toHaveBeenCalledWith(null, ctx, body);
	});

	it("no currentRecord: does not call registry.get", async () => {
		const registry = makeMockRegistry(undefined);
		const registryGetSpy = vi.spyOn(registry, "get");
		const consentGate = makeMockConsentGate({ status: "consented" });

		view = new SidebarView(leaf, registry, consentGate, nativeEngine);
		await view.onOpen();

		const file = makeMdFile("Scene 1");
		const ctx = makeNoteContext(file);

		const privateView = view as unknown as {
			currentRecord: ViewRecord | null;
			_renderResolved(body: HTMLElement, ctx: NoteContext): Promise<void>;
		};
		privateView.currentRecord = null;

		const body = getBody(view);
		await privateView._renderResolved(body, ctx);

		expect(registryGetSpy).not.toHaveBeenCalled();
	});

	// -------------------------------------------------------------------------
	// engine.render() rejection → error state (FIX 2)
	// -------------------------------------------------------------------------

	it("consented but engine.render rejects: shows engine-error element and nulls currentEngine", async () => {
		const failingEngine = {
			kind: "dataview-dql" as const,
			teardown: vi.fn(),
			render: vi.fn(async () => { throw new Error("boom"); }),
		} as unknown as QueryEngine;

		const registry = makeMockRegistry(failingEngine);
		const consentGate = makeMockConsentGate({ status: "consented" });

		view = new SidebarView(leaf, registry, consentGate, nativeEngine);
		await view.onOpen();

		const file = makeMdFile("Scene 1");
		const ctx = makeNoteContext(file);
		const record = makeViewRecord();

		const privateView = view as unknown as {
			currentEngine: QueryEngine | null;
			currentRecord: ViewRecord | null;
			_renderResolved(body: HTMLElement, ctx: NoteContext): Promise<void>;
		};
		privateView.currentRecord = record;

		const body = getBody(view);
		await privateView._renderResolved(body, ctx);

		expect(body.querySelector(".sf-engine-error")).not.toBeNull();
		expect(privateView.currentEngine).toBeNull();
	});

	// -------------------------------------------------------------------------
	// Generation guard: stale dispatch bails, second call wins (FIX 3)
	// -------------------------------------------------------------------------

	it("generation guard: second _renderResolved call wins; first stale dispatch does not clobber DOM", async () => {
		let resolveFirst!: () => void;
		let callCount = 0;
		const teardownSpy = vi.fn();
		const slowEngine = {
			kind: "dataview-dql" as const,
			teardown: teardownSpy,
			render: vi.fn(
				async (_view: ViewRecord | null, _ctx: NoteContext, _el: HTMLElement) => {
					callCount++;
					if (callCount === 1) {
						// First call blocks until we resolve it — by then a second call has fired
						await new Promise<void>((resolve) => { resolveFirst = resolve; });
					}
					// Second call completes immediately
				},
			),
		} as unknown as QueryEngine;

		const registry = makeMockRegistry(slowEngine);
		const consentGate = makeMockConsentGate({ status: "consented" });

		view = new SidebarView(leaf, registry, consentGate, nativeEngine);
		await view.onOpen();

		const file = makeMdFile("Scene 1");
		const ctx = makeNoteContext(file);
		const record = makeViewRecord();

		const privateView = view as unknown as {
			currentEngine: QueryEngine | null;
			currentRecord: ViewRecord | null;
			_renderGen: number;
			_renderResolved(body: HTMLElement, ctx: NoteContext): Promise<void>;
		};
		privateView.currentRecord = record;

		const body = getBody(view);

		// Fire first dispatch — suspends inside engine.render
		const first = privateView._renderResolved(body, ctx);

		// Flush microtasks so first dispatch reaches engine.render
		await Promise.resolve();
		await Promise.resolve();

		// Fire second dispatch while first is still in-flight
		const second = privateView._renderResolved(body, ctx);

		// Let the second dispatch complete fully
		await second;

		// Now resolve the first (stale) dispatch
		resolveFirst!();
		await first;

		// The first dispatch's post-await mutations must have bailed (generation mismatch).
		// currentEngine should reflect the second call's engine, not be clobbered to null
		// or set twice. slowEngine.teardown was called at least once (by _prepareBody),
		// but currentEngine should be slowEngine (set by the second dispatch).
		expect(privateView.currentEngine).toBe(slowEngine);
		// teardown should not have been called MORE times than dispatches (no double-teardown)
		expect(teardownSpy.mock.calls.length).toBeLessThanOrEqual(2);
	});

	// -------------------------------------------------------------------------
	// Loading state (S13) — rendered while engine.render is in-flight
	// -------------------------------------------------------------------------

	it("renders S13 loading state while engine.render is in-flight", async () => {
		let resolveRender!: () => void;
		const slowEngine = {
			kind: "dataview-dql" as const,
			teardown: vi.fn(),
			render: vi.fn(
				(_view: ViewRecord | null, _ctx: NoteContext, _el: HTMLElement) =>
					new Promise<void>((resolve) => {
						resolveRender = resolve;
						// engine does not add content — SidebarView should show loading state
					}),
			),
		} as unknown as QueryEngine;

		const registry = makeMockRegistry(slowEngine);
		const consentGate = makeMockConsentGate({ status: "consented" });

		view = new SidebarView(leaf, registry, consentGate, nativeEngine);
		await view.onOpen();

		const file = makeMdFile("Scene 1");
		const ctx = makeNoteContext(file);
		const record = makeViewRecord();

		const privateView = view as unknown as {
			currentRecord: ViewRecord | null;
			_renderResolved(body: HTMLElement, ctx: NoteContext): Promise<void>;
		};
		privateView.currentRecord = record;

		const body = getBody(view);
		const renderPromise = privateView._renderResolved(body, ctx);

		// Flush microtasks: let evaluate() resolve so we reach the engine.render call
		await Promise.resolve();
		await Promise.resolve();

		// After evaluate resolves and body.empty() + _renderLoading() run, loading is visible.
		// At this point engine.render's Promise is pending (not yet resolved).
		expect(body.querySelector(".sf-loading")).not.toBeNull();

		// Resolve the render and clean up
		resolveRender!();
		await renderPromise;
	});

	// -------------------------------------------------------------------------
	// Bug C — loading node removed after render resolves (success path)
	// -------------------------------------------------------------------------

	it("Bug C: .sf-loading is REMOVED from body after engine.render resolves (success)", async () => {
		const engine = makeMockEngine("dataview-dql");
		// engine.render is a no-op — just resolves, doesn't add DOM content
		const registry = makeMockRegistry(engine);
		const consentGate = makeMockConsentGate({ status: "consented" });

		view = new SidebarView(leaf, registry, consentGate, nativeEngine);
		await view.onOpen();

		const file = makeMdFile("Scene 1");
		const ctx = makeNoteContext(file);
		const record = makeViewRecord();

		const privateView = view as unknown as {
			currentRecord: ViewRecord | null;
			_renderResolved(body: HTMLElement, ctx: NoteContext): Promise<void>;
		};
		privateView.currentRecord = record;

		const body = getBody(view);
		await privateView._renderResolved(body, ctx);

		// Loading must be gone after render completes
		expect(body.querySelector(".sf-loading")).toBeNull();
	});

	it("Bug C: .sf-loading is REMOVED when engine.render rejects (error path)", async () => {
		const failEngine = {
			kind: "dataview-dql" as const,
			teardown: vi.fn(),
			render: vi.fn(async () => { throw new Error("render failed"); }),
		} as unknown as QueryEngine;

		const registry = makeMockRegistry(failEngine);
		const consentGate = makeMockConsentGate({ status: "consented" });

		view = new SidebarView(leaf, registry, consentGate, nativeEngine);
		await view.onOpen();

		const file = makeMdFile("Scene 1");
		const ctx = makeNoteContext(file);
		const record = makeViewRecord();

		const privateView = view as unknown as {
			currentRecord: ViewRecord | null;
			_renderResolved(body: HTMLElement, ctx: NoteContext): Promise<void>;
		};
		privateView.currentRecord = record;

		const body = getBody(view);
		await privateView._renderResolved(body, ctx);

		// Loading must be gone; error element must be present
		expect(body.querySelector(".sf-loading")).toBeNull();
		expect(body.querySelector(".sf-engine-error")).not.toBeNull();
	});

	it("Bug C: engine output coexists with no loading node after render (engine-appended content stays)", async () => {
		const engine = {
			kind: "dataview-dql" as const,
			teardown: vi.fn(),
			render: vi.fn(async (_view: ViewRecord | null, _ctx: NoteContext, el: HTMLElement) => {
				// Simulate engine appending output to the body
				const output = document.createElement("div");
				output.className = "engine-output";
				output.textContent = "query result";
				el.appendChild(output);
			}),
		} as unknown as QueryEngine;

		const registry = makeMockRegistry(engine);
		const consentGate = makeMockConsentGate({ status: "consented" });

		view = new SidebarView(leaf, registry, consentGate, nativeEngine);
		await view.onOpen();

		const file = makeMdFile("Scene 1");
		const ctx = makeNoteContext(file);
		const record = makeViewRecord();

		const privateView = view as unknown as {
			currentRecord: ViewRecord | null;
			_renderResolved(body: HTMLElement, ctx: NoteContext): Promise<void>;
		};
		privateView.currentRecord = record;

		const body = getBody(view);
		await privateView._renderResolved(body, ctx);

		// Loading gone; engine output remains
		expect(body.querySelector(".sf-loading")).toBeNull();
		expect(body.querySelector(".engine-output")).not.toBeNull();
		expect(body.querySelector(".engine-output")!.textContent).toBe("query result");
	});
});

// ---------------------------------------------------------------------------
// onClose teardown
// ---------------------------------------------------------------------------

describe("SidebarView: onClose calls currentEngine.teardown", () => {
	let app: App;
	let leaf: WorkspaceLeaf;
	let nativeEngine: ReturnType<typeof makeMockNativeEngine>;

	beforeEach(() => {
		app = makeApp();
		leaf = makeOwnLeaf(app);
		nativeEngine = makeMockNativeEngine();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("onClose: calls currentEngine.teardown() before closing", async () => {
		const engine = makeMockEngine("dataview-dql");
		const registry = makeMockRegistry(engine);
		const consentGate = makeMockConsentGate({ status: "consented" });

		const view = new SidebarView(leaf, registry, consentGate, nativeEngine);
		await view.onOpen();

		// Simulate that an engine has been made current
		const privateView = view as unknown as {
			currentEngine: QueryEngine | null;
		};
		privateView.currentEngine = engine;

		await view.onClose();

		expect(engine.teardown).toHaveBeenCalledTimes(1);
	});

	it("onClose: safe when currentEngine is null (no teardown call)", async () => {
		const registry = makeMockRegistry(undefined);
		const consentGate = makeMockConsentGate({ status: "consented" });

		const view = new SidebarView(leaf, registry, consentGate, nativeEngine);
		await view.onOpen();

		// Ensure no engine is set
		const privateView = view as unknown as {
			currentEngine: QueryEngine | null;
		};
		privateView.currentEngine = null;

		// Should not throw
		await expect(view.onClose()).resolves.toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// Backward compatibility: existing SidebarView constructor (0-arg injection)
// still builds and opens without injected dependencies
// ---------------------------------------------------------------------------

describe("SidebarView: backward compat — constructor without injected engines", () => {
	it("constructs and opens with no injection (old signature)", async () => {
		const app = makeApp();
		const leaf = makeOwnLeaf(app);
		// Old-style construction — no registry/consentGate/nativeEngine args
		const view = new SidebarView(leaf);
		await expect(view.onOpen()).resolves.toBeUndefined();
		await view.onClose();
	});
});
