/**
 * T-S2.6 — SidebarView in-panel consent CTA buttons (S12 / S17)
 *
 * The static S12 (not-consented) and S17 (drift) panels gain a real button
 * that triggers the consent / re-consent modal via the injected ConsentGate.
 *
 * The button is rendered ONLY when BOTH a ConsentGate is injected AND a view
 * tab is selected (selectedViewId non-null). No gate / Context tab → text-only.
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

function makeViewRecord(overrides?: Partial<ViewRecord>): ViewRecord {
	return {
		provenance: "imported",
		enabled: true,
		okayed: { version: 1, checksum: "sha256:abc123" },
		source: "_forge/views/test-view.md",
		engine: "dataviewjs",
		command: false,
		commandName: "Test View",
		...overrides,
	};
}

function makeMockEngine(kind: QueryEngine["kind"] = "dataviewjs"): QueryEngine {
	return {
		kind,
		teardown: vi.fn(),
		render: vi.fn(async () => {}),
	};
}

function makeMockNativeEngine(): NativeScopingEngine {
	return {
		kind: "native" as const,
		teardown: vi.fn(),
		render: vi.fn(async () => {}),
	} as unknown as NativeScopingEngine;
}

function makeMockRegistry(engine?: QueryEngine): EngineRegistry {
	return {
		get: vi.fn(() => engine),
	} as unknown as EngineRegistry;
}

function makeMockConsentGate(decision: ConsentDecision): ConsentGate & {
	requestConsent: ReturnType<typeof vi.fn>;
	requestReConsent: ReturnType<typeof vi.fn>;
} {
	return {
		evaluate: vi.fn(async () => decision),
		requestConsent: vi.fn(async () => false),
		requestReConsent: vi.fn(async () => false),
	} as unknown as ConsentGate & {
		requestConsent: ReturnType<typeof vi.fn>;
		requestReConsent: ReturnType<typeof vi.fn>;
	};
}

function getBody(view: SidebarView): HTMLElement {
	return view.contentEl.querySelector(".sf-body") as HTMLElement;
}

type PrivateView = {
	selectedViewId: string | null;
	currentRecord: ViewRecord | null;
	_renderResolved(body: HTMLElement, ctx: NoteContext): Promise<void>;
};

// ---------------------------------------------------------------------------
// S12 — not-consented CTA
// ---------------------------------------------------------------------------

describe("SidebarView: S12 consent CTA button", () => {
	let app: App;
	let leaf: WorkspaceLeaf;
	let view: SidebarView;

	beforeEach(() => {
		app = makeApp();
		leaf = makeOwnLeaf(app);
	});

	afterEach(async () => {
		if (view) await view.onClose();
		vi.restoreAllMocks();
	});

	it("renders a clickable button that calls requestConsent(selectedViewId, view) exactly once", async () => {
		const engine = makeMockEngine("dataviewjs");
		const registry = makeMockRegistry(engine);
		const gate = makeMockConsentGate({ status: "not-consented" });

		view = new SidebarView(leaf, registry, gate, makeMockNativeEngine());
		await view.onOpen();

		const record = makeViewRecord();
		const pv = view as unknown as PrivateView;
		pv.selectedViewId = "view-123";
		pv.currentRecord = record;

		const body = getBody(view);
		await pv._renderResolved(body, makeNoteContext(makeMdFile()));

		const btn = body.querySelector<HTMLButtonElement>(".sf-consent-required .sf-cta-btn");
		expect(btn).not.toBeNull();

		btn!.click();

		expect(gate.requestConsent).toHaveBeenCalledTimes(1);
		expect(gate.requestConsent).toHaveBeenCalledWith("view-123", record);
		expect(gate.requestReConsent).not.toHaveBeenCalled();
	});

	it("renders NO button when selectedViewId is null (Context tab)", async () => {
		const engine = makeMockEngine("dataviewjs");
		const registry = makeMockRegistry(engine);
		const gate = makeMockConsentGate({ status: "not-consented" });

		view = new SidebarView(leaf, registry, gate, makeMockNativeEngine());
		await view.onOpen();

		const record = makeViewRecord();
		const pv = view as unknown as PrivateView;
		pv.selectedViewId = null; // Context tab
		pv.currentRecord = record;

		const body = getBody(view);
		await pv._renderResolved(body, makeNoteContext(makeMdFile()));

		// The consent-required panel still renders, but without a button.
		expect(body.querySelector(".sf-consent-required")).not.toBeNull();
		expect(body.querySelector(".sf-consent-required .sf-cta-btn")).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// S17 — drift (re-consent) CTA
// ---------------------------------------------------------------------------

describe("SidebarView: S17 re-consent CTA button", () => {
	let app: App;
	let leaf: WorkspaceLeaf;
	let view: SidebarView;

	beforeEach(() => {
		app = makeApp();
		leaf = makeOwnLeaf(app);
	});

	afterEach(async () => {
		if (view) await view.onClose();
		vi.restoreAllMocks();
	});

	it("renders a clickable button that calls requestReConsent(selectedViewId, view) exactly once", async () => {
		const engine = makeMockEngine("dataviewjs");
		const registry = makeMockRegistry(engine);
		const gate = makeMockConsentGate({ status: "drift", reason: "checksum" });

		view = new SidebarView(leaf, registry, gate, makeMockNativeEngine());
		await view.onOpen();

		const record = makeViewRecord();
		const pv = view as unknown as PrivateView;
		pv.selectedViewId = "view-777";
		pv.currentRecord = record;

		const body = getBody(view);
		await pv._renderResolved(body, makeNoteContext(makeMdFile()));

		const btn = body.querySelector<HTMLButtonElement>(".sf-reconsent-required .sf-cta-btn");
		expect(btn).not.toBeNull();

		btn!.click();

		expect(gate.requestReConsent).toHaveBeenCalledTimes(1);
		expect(gate.requestReConsent).toHaveBeenCalledWith("view-777", record);
		expect(gate.requestConsent).not.toHaveBeenCalled();
	});

	it("renders NO button when selectedViewId is null (Context tab)", async () => {
		const engine = makeMockEngine("dataviewjs");
		const registry = makeMockRegistry(engine);
		const gate = makeMockConsentGate({ status: "drift", reason: "version" });

		view = new SidebarView(leaf, registry, gate, makeMockNativeEngine());
		await view.onOpen();

		const record = makeViewRecord();
		const pv = view as unknown as PrivateView;
		pv.selectedViewId = null;
		pv.currentRecord = record;

		const body = getBody(view);
		await pv._renderResolved(body, makeNoteContext(makeMdFile()));

		expect(body.querySelector(".sf-reconsent-required")).not.toBeNull();
		expect(body.querySelector(".sf-reconsent-required .sf-cta-btn")).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Backward compat — no gate injected → private renderers add no button
// ---------------------------------------------------------------------------

describe("SidebarView: consent CTA absent without a ConsentGate", () => {
	it("S12 renderer adds no button when consentGate is null", async () => {
		const app = makeApp();
		const leaf = makeOwnLeaf(app);
		const view = new SidebarView(leaf); // no injected gate
		await view.onOpen();

		const body = getBody(view);
		const pv = view as unknown as {
			selectedViewId: string | null;
			_renderConsentRequired(body: HTMLElement, view: ViewRecord): void;
		};
		pv.selectedViewId = "view-xyz"; // a tab is selected, but no gate exists
		pv._renderConsentRequired(body, makeViewRecord());

		expect(body.querySelector(".sf-consent-required")).not.toBeNull();
		expect(body.querySelector(".sf-consent-required .sf-cta-btn")).toBeNull();

		await view.onClose();
	});

	it("S17 renderer adds no button when consentGate is null", async () => {
		const app = makeApp();
		const leaf = makeOwnLeaf(app);
		const view = new SidebarView(leaf);
		await view.onOpen();

		const body = getBody(view);
		const pv = view as unknown as {
			selectedViewId: string | null;
			_renderReconsentRequired(body: HTMLElement, view: ViewRecord): void;
		};
		pv.selectedViewId = "view-xyz";
		pv._renderReconsentRequired(body, makeViewRecord());

		expect(body.querySelector(".sf-reconsent-required")).not.toBeNull();
		expect(body.querySelector(".sf-reconsent-required .sf-cta-btn")).toBeNull();

		await view.onClose();
	});
});
