/**
 * SidebarView.linkContextMenu.test.ts — the Workbench shows the same file menu
 * as the other surfaces, so the three match.
 */

import { describe, expect, it, vi } from "vitest";
import { App, WorkspaceLeaf, TFile } from "obsidian";
import { SidebarView } from "views/SidebarView";
import { NativeScopingEngine } from "engines/NativeScopingEngine";
import { SIDEBAR_VIEW_TYPE } from "pluginConstants";
import type { EngineRegistry } from "engines/QueryEngine";
import type { ConsentGate } from "consent/ConsentGate";

function mdFile(basename: string): TFile {
	const f = new TFile();
	f.path = `${basename}.md`;
	f.name = `${basename}.md`;
	f.basename = basename;
	f.extension = "md";
	return f;
}

async function open(): Promise<{ app: App; view: SidebarView; body: HTMLElement; tobias: TFile }> {
	const app = new App();
	const tobias = mdFile("Tobias Ferro");
	vi.mocked(app.metadataCache.getFirstLinkpathDest).mockImplementation((l) => (l === "Tobias Ferro" ? tobias : null));
	const leaf = new WorkspaceLeaf();
	leaf.app = app;
	leaf.view.getViewType = vi.fn(() => SIDEBAR_VIEW_TYPE);
	const view = new SidebarView(
		leaf,
		{ get: vi.fn(() => undefined) } as unknown as EngineRegistry,
		{ evaluate: vi.fn(async () => ({ status: "consented" })) } as unknown as ConsentGate,
		new NativeScopingEngine(app),
		undefined,
		() => "drill",
	);
	await view.onOpen();
	return { app, view, body: view.contentEl.querySelector(".sf-body") as HTMLElement, tobias };
}

function linkIn(body: HTMLElement, target: string): HTMLElement {
	const el = document.createElement("span");
	el.setAttribute("data-sf-link", target);
	body.appendChild(el);
	return el;
}

describe("SidebarView — right-click on a link", () => {
	it("shows the file menu for a resolvable link", async () => {
		const { app, view, body, tobias } = await open();
		const evt = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
		linkIn(body, "Tobias Ferro").dispatchEvent(evt);

		const call = vi.mocked(app.workspace.trigger).mock.calls[0]!;
		expect(call[0]).toBe("file-menu");
		expect(call[2]).toBe(tobias);
		expect(call[4]).toBe(view.leaf);
		expect(evt.defaultPrevented).toBe(true);
	});

	it("does nothing for an unresolved link", async () => {
		const { app, body } = await open();
		const evt = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
		linkIn(body, "Nobody").dispatchEvent(evt);
		expect(app.workspace.trigger).not.toHaveBeenCalled();
		expect(evt.defaultPrevented).toBe(false);
	});

	it("is released when the view unloads", async () => {
		const { app, view, body } = await open();
		const el = linkIn(body, "Tobias Ferro");
		view.unload();
		el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
		expect(app.workspace.trigger).not.toHaveBeenCalled();
	});
});
