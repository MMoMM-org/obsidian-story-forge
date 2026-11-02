/**
 * AnvilView.linkContextMenu.test.ts — right-click on a link shows the file menu;
 * a card relation pill drills into the editor pane on a plain click, with no
 * pane open yet.
 */

import { describe, expect, it, vi } from "vitest";
import { App, WorkspaceLeaf, type TFile } from "obsidian";
import { createMockCachedMetadata, createMockTFile, type CachedMetadata } from "../__mocks__/obsidian";
import { AnvilView } from "anvil/AnvilView";

const mara = createMockTFile({ basename: "Mara Stoneway", path: "30 Canon/31 Characters/Mara Stoneway.md" });
const tobias = createMockTFile({ basename: "Tobias Ferro", path: "30 Canon/31 Characters/Tobias Ferro.md" });

function seed(app: App): void {
	const maraCache: CachedMetadata = createMockCachedMetadata({
		frontmatter: { tags: ["canon/character"], allies: ["[[Tobias Ferro]]", "[[Nobody]]", "shortblade"] },
	});
	const plain: CachedMetadata = createMockCachedMetadata({ frontmatter: { tags: ["canon/character"] } });
	vi.mocked(app.metadataCache.getFileCache).mockImplementation((f) => (f === mara ? maraCache : f === tobias ? plain : null));
	vi.mocked(app.metadataCache.getFirstLinkpathDest).mockImplementation((l) => (l === "Tobias Ferro" ? tobias : null));
	vi.mocked(app.vault.getMarkdownFiles).mockReturnValue([mara, tobias] as TFile[]);
	vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((p) =>
		p === mara.path ? mara : p === tobias.path ? tobias : null,
	);
	app.workspace.getActiveFile = vi.fn(() => null);
	app.workspace.openLinkText = vi.fn(async () => {});
}

async function openCodex(): Promise<{ app: App; view: AnvilView; drilled: TFile[] }> {
	const app = new App();
	seed(app);
	const leaf = new WorkspaceLeaf();
	(leaf as unknown as { app: App }).app = app;
	const drilled: TFile[] = [];
	const view: AnvilView = new AnvilView(leaf, {
		settings: { getLinkClickAction: () => "drill" },
		drill: (f) => { drilled.push(f); view.inspect(f); },
	});
	await view.onOpen();
	view.setLayout("codex");
	document.body.appendChild(view.contentEl);
	return { app, view, drilled };
}

function pills(view: AnvilView): HTMLElement[] {
	return Array.from(view.contentEl.querySelectorAll<HTMLElement>(".sf-cx-card .sf-cx-relpill"));
}

function pillFor(view: AnvilView, target: string): HTMLElement {
	const el = pills(view).find((p) => p.getAttribute("data-sf-link") === target);
	if (!el) throw new Error(`no pill linking ${target}`);
	return el;
}

describe("AnvilView — card relation pills", () => {
	it("a plain click on a link pill opens the editor pane on that note, with no pane open before", async () => {
		const { view, drilled } = await openCodex();
		expect(view.contentEl.querySelector(".sf-ed")).toBeNull();

		pillFor(view, "Tobias Ferro").dispatchEvent(new MouseEvent("click", { bubbles: true }));

		expect(drilled.map((f) => f.path)).toEqual([tobias.path]);
		expect(view.contentEl.querySelector(".sf-ed")).not.toBeNull();
		view.contentEl.remove();
	});

	it("writes nothing", async () => {
		const { app, view } = await openCodex();
		pillFor(view, "Tobias Ferro").dispatchEvent(new MouseEvent("click", { bubbles: true }));
		expect(app.fileManager.processFrontMatter).not.toHaveBeenCalled();
		expect(app.vault.modify).not.toHaveBeenCalled();
		view.contentEl.remove();
	});

	it("a modifier click opens the pill's note via the workspace", async () => {
		const { app, view, drilled } = await openCodex();
		pillFor(view, "Tobias Ferro").dispatchEvent(new MouseEvent("click", { bubbles: true, metaKey: true }));
		expect(drilled).toEqual([]);
		expect(app.workspace.openLinkText).toHaveBeenCalledWith(tobias.path, "", false);
		view.contentEl.remove();
	});

	it("an unresolved link pill neither drills nor opens the card's note", async () => {
		const { view, drilled } = await openCodex();
		pillFor(view, "Nobody").dispatchEvent(new MouseEvent("click", { bubbles: true }));
		expect(drilled).toEqual([]);
		view.contentEl.remove();
	});
});

describe("AnvilView — right-click on a link", () => {
	it("shows the file menu for a pill's file", async () => {
		const { app, view } = await openCodex();
		const evt = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
		pillFor(view, "Tobias Ferro").dispatchEvent(evt);

		const call = vi.mocked(app.workspace.trigger).mock.calls[0]!;
		expect(call[0]).toBe("file-menu");
		expect(call[2]).toBe(tobias);
		expect(call[4]).toBe(view.leaf);
		expect(evt.defaultPrevented).toBe(true);
		view.contentEl.remove();
	});

	it("shows the file menu for a card's name too", async () => {
		const { app, view } = await openCodex();
		view.contentEl
			.querySelector(`.sf-cx-name[data-sf-link="${mara.path}"]`)!
			.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
		expect(vi.mocked(app.workspace.trigger).mock.calls[0]![2]).toBe(mara);
		view.contentEl.remove();
	});

	it("leaves an unresolved pill's native menu alone", async () => {
		const { app, view } = await openCodex();
		const evt = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
		pillFor(view, "Nobody").dispatchEvent(evt);
		expect(app.workspace.trigger).not.toHaveBeenCalled();
		expect(evt.defaultPrevented).toBe(false);
		view.contentEl.remove();
	});

	it("is released when the view unloads", async () => {
		const { app, view } = await openCodex();
		view.unload();
		pillFor(view, "Tobias Ferro").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
		expect(app.workspace.trigger).not.toHaveBeenCalled();
		view.contentEl.remove();
	});
});
