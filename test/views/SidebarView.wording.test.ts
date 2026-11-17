/**
 * Wording-only fixes: the Workbench states that still said "view" for a collection, the mobile
 * message that always named DataviewJS, and the empty state that forgot "book".
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { App, WorkspaceLeaf, Platform } from "obsidian";
import { SidebarView } from "views/SidebarView";
import { SIDEBAR_VIEW_TYPE } from "pluginConstants";
import type { ViewRecord } from "store/types";
import type { EngineRegistry } from "engines/QueryEngine";
import type { NativeScopingEngine } from "engines/NativeScopingEngine";

type Priv = {
	_renderState(s: unknown): void;
	_renderConsentRequired(b: HTMLElement, v: ViewRecord): void;
	_renderDisabled(b: HTMLElement): void;
	_renderReconsentRequired(b: HTMLElement, v: ViewRecord): void;
	_renderPlatformRestriction(b: HTMLElement, v: ViewRecord): void;
};

function record(engine: ViewRecord["engine"]): ViewRecord {
	return {
		provenance: "imported", enabled: true, okayed: null, source: "x.md", engine, command: false,
		commandName: "X", kind: "view", surfaces: { anvil: false, workbench: false },
	} as ViewRecord;
}

async function openView(): Promise<{ priv: Priv; body: HTMLElement }> {
	const app = new App();
	const leaf = new WorkspaceLeaf();
	leaf.app = app;
	leaf.view.getViewType = vi.fn(() => SIDEBAR_VIEW_TYPE);
	const registry = { get: vi.fn() } as unknown as EngineRegistry;
	const native = { kind: "native", teardown: vi.fn(), render: vi.fn() } as unknown as NativeScopingEngine;
	const view = new SidebarView(leaf, registry, undefined, native);
	await view.onOpen();
	const body = view.contentEl.querySelector(".sf-body") as HTMLElement;
	return { priv: view as unknown as Priv, body };
}

afterEach(() => {
	(Platform as { isMobile: boolean }).isMobile = false;
	document.body.innerHTML = "";
});

describe("Workbench non-entity state", () => {
	it("lists every kind the classifier tracks, book included", async () => {
		const { priv, body } = await openView();
		priv._renderState({ kind: "non-entity", file: { path: "a.md", basename: "a" }, activeKind: "unknown" });
		expect(body.textContent).toContain(
			"This note isn't a tracked character, location, object, lore, scene, plotline, or book.",
		);
	});
});

describe("Workbench collection wording", () => {
	it("consent required: Review and enable, collection wording", async () => {
		const { priv, body } = await openView();
		priv._renderConsentRequired(body, record("dataviewjs"));
		expect(body.querySelector(".sf-cta-title")?.textContent).toBe("Review and enable");
		expect(body.textContent).toContain("This collection runs DataviewJS");
		expect(body.textContent).not.toMatch(/Review & Enable|This view/);
	});

	it("disabled: collection wording", async () => {
		const { priv, body } = await openView();
		priv._renderDisabled(body);
		expect(body.textContent).toContain("Collection disabled");
		expect(body.textContent).toContain("Enable this collection in settings to run it.");
	});

	it("drift: collection wording", async () => {
		const { priv, body } = await openView();
		priv._renderReconsentRequired(body, record("dataviewjs"));
		expect(body.textContent).toContain("Query changed since you last enabled this collection.");
	});
});

describe("Workbench mobile restriction", () => {
	it.each([
		["bases", "Bases collections are not available on mobile devices."],
		["dataviewjs", "DataviewJS collections are not available on mobile devices."],
	] as const)("names %s", async (engine, text) => {
		const { priv, body } = await openView();
		priv._renderPlatformRestriction(body, record(engine));
		expect(body.textContent).toContain(text);
	});
});
