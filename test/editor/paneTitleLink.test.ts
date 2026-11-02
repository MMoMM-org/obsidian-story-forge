/**
 * paneTitleLink.test.ts — the name in the editor pane's header is a link.
 *
 * A click opens the pane's note in a NEW tab, in every dock, whatever
 * `cardTitleOpensNote` says and with or without a modifier. It writes nothing,
 * and a field's pending commit still lands.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App, WorkspaceLeaf, createMockCachedMetadata, createMockTFile, type TFile } from "obsidian";
import { AnvilView } from "anvil/AnvilView";
import type { EditorDock } from "editor/editorPane";
import { walkTargetMarkers } from "navigation/domTargetWalk";
import { ANVIL_MARKERS, createMarkerKindOf } from "navigation/markerVocabulary";

const mara = createMockTFile({ basename: "Mara Stoneway", path: "30 Canon/31 Characters/Mara Stoneway.md" });
const mounted: HTMLElement[] = [];
afterEach(() => {
	while (mounted.length > 0) mounted.pop()?.remove();
});

async function openPane(dock: EditorDock, titleSetting = true) {
	const app = new App();
	app.fileManager._setFrontmatter(mara.path, { tags: ["canon/character"], name: "Mara" });
	vi.mocked(app.metadataCache.getFileCache).mockImplementation((f) =>
		createMockCachedMetadata({ frontmatter: app.fileManager._getFrontmatter(f.path) }),
	);
	vi.mocked(app.vault.getMarkdownFiles).mockReturnValue([mara]);
	vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((p) => (p === mara.path ? mara : null));
	app.workspace.getActiveFile = vi.fn(() => null);
	app.workspace.openLinkText = vi.fn(async () => {});
	const leaf = new WorkspaceLeaf();
	(leaf as unknown as { app: App }).app = app;
	const drilled: TFile[] = [];
	const view: AnvilView = new AnvilView(leaf, {
		settings: { getCardTitleOpensNote: () => titleSetting },
		drill: (f) => { drilled.push(f); view.inspect(f); },
		editor: { getDock: () => dock },
	});
	await view.onOpen();
	view.setLayout("codex");
	document.body.appendChild(view.contentEl);
	mounted.push(view.contentEl);
	view.inspect(mara);
	drilled.length = 0;
	const title = view.contentEl.querySelector<HTMLElement>(".sf-ed-title");
	if (!title) throw new Error("no pane title");
	return { app, view, drilled, title };
}

const docks: EditorDock[] = ["bottom", "right"];

describe("pane title is a link", () => {
	it("carries link semantics and the link marker for the pane's note", async () => {
		const { title } = await openPane("bottom");
		expect(title.getAttribute("role")).toBe("link");
		expect(title.getAttribute("tabindex")).toBe("0");
		expect(title.getAttribute("data-sf-link")).toBe(mara.path);
		expect(title.textContent).toBe("Mara Stoneway");
	});

	it("classifies as its own kind through the real walk, nearest first", async () => {
		const { view, title } = await openPane("bottom");
		const { markers } = walkTargetMarkers(title, view.contentEl, createMarkerKindOf(ANVIL_MARKERS));
		expect(markers[0]).toBe("paneTitle");
	});

	it.each(docks)("%s dock: a plain click opens a new tab, not the pane again", async (dock) => {
		const { app, drilled, title } = await openPane(dock);
		title.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		expect(app.workspace.openLinkText).toHaveBeenCalledWith(mara.path, "", true);
		expect(drilled).toEqual([]);
	});

	it("ignores cardTitleOpensNote: still a new tab when it is off", async () => {
		const { app, title } = await openPane("bottom", false);
		title.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		expect(app.workspace.openLinkText).toHaveBeenCalledWith(mara.path, "", true);
	});

	it("a modifier click does the same as a plain click", async () => {
		const { app, drilled, title } = await openPane("bottom");
		title.dispatchEvent(new MouseEvent("click", { bubbles: true, metaKey: true }));
		expect(app.workspace.openLinkText).toHaveBeenCalledTimes(1);
		expect(app.workspace.openLinkText).toHaveBeenCalledWith(mara.path, "", true);
		expect(drilled).toEqual([]);
	});

	it.each(["Enter", " "])("key %j activates once", async (key) => {
		const { app, title } = await openPane("bottom");
		title.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
		expect(app.workspace.openLinkText).toHaveBeenCalledTimes(1);
		expect(app.workspace.openLinkText).toHaveBeenCalledWith(mara.path, "", true);
	});

	it("other keys do nothing", async () => {
		const { app, title } = await openPane("bottom");
		title.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
		expect(app.workspace.openLinkText).not.toHaveBeenCalled();
	});

	it("right-click shows the file menu for the note", async () => {
		const { app, view, title } = await openPane("bottom");
		const evt = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
		title.dispatchEvent(evt);
		const call = vi.mocked(app.workspace.trigger).mock.calls[0]!;
		expect(call[0]).toBe("file-menu");
		expect(call[2]).toBe(mara);
		expect(call[4]).toBe(view.leaf);
		expect(evt.defaultPrevented).toBe(true);
	});

	it("a click writes nothing", async () => {
		const { app, title } = await openPane("bottom");
		title.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		expect(app.fileManager.processFrontMatter).not.toHaveBeenCalled();
		expect(app.vault.modify).not.toHaveBeenCalled();
	});
});

describe("pane title click and a pending field commit", () => {
	function nameInput(view: AnvilView): HTMLInputElement {
		const input = view.contentEl.querySelector<HTMLInputElement>('[data-sf-ed-field="name"] input');
		if (!input) throw new Error("no name input");
		return input;
	}
	function type(input: HTMLInputElement): void {
		input.value = "Mara S.";
		input.dispatchEvent(new Event("input", { bubbles: true }));
	}

	it("blur-then-click (the browser's order): the edit lands exactly once", async () => {
		const { app, view, title } = await openPane("bottom");
		const input = nameInput(view);
		type(input);
		input.dispatchEvent(new Event("change", { bubbles: true }));
		title.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		await vi.waitFor(() => expect(app.fileManager.processFrontMatter).toHaveBeenCalledTimes(1));
		expect(app.fileManager._getFrontmatter(mara.path)["name"]).toBe("Mara S.");
	});

	it("click-before-change: the click does not discard the pending edit", async () => {
		const { app, view, title } = await openPane("bottom");
		const input = nameInput(view);
		type(input);
		title.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		// A browser never fires blur/change on a removed input, so a click that
		// rebuilt the pane would lose the edit. The box must still be the live one.
		expect(input.isConnected).toBe(true);
		expect(nameInput(view)).toBe(input);
		input.dispatchEvent(new Event("change", { bubbles: true }));
		await vi.waitFor(() => expect(app.fileManager._getFrontmatter(mara.path)["name"]).toBe("Mara S."));
		expect(app.fileManager.processFrontMatter).toHaveBeenCalledTimes(1);
	});
});

describe("pane title hover", () => {
	const css = readFileSync(path.resolve(__dirname, "../../styles.css"), "utf8");

	it("has the link pills' pointer and accent hover", () => {
		expect(css).toMatch(/\.sf-ed-title\[data-sf-link\][^{]*\{[^}]*cursor:\s*pointer/);
		expect(css).toMatch(/\.sf-ed-title\[data-sf-link\]:hover[^{]*\{[^}]*color:\s*var\(--text-accent\)/);
	});
});
