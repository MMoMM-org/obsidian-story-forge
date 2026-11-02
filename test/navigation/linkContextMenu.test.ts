/**
 * linkContextMenu.test.ts — right-clicking a link shows Obsidian's own file menu.
 *
 * The helper adds no items of its own: it asks the workspace for the standard
 * `file-menu` and shows it. Unresolved links get no menu and no error.
 */

import { describe, expect, it, vi } from "vitest";
import { App, Menu, WorkspaceLeaf, type TFile } from "obsidian";
import { createMockTFile } from "../__mocks__/obsidian";
import { linkContextMenuHandler } from "navigation/linkContextMenu";

const mara = createMockTFile({ basename: "Mara", path: "Characters/Mara.md" });

function setup(resolve: (el: HTMLElement) => TFile | null): {
	app: App;
	root: HTMLElement;
	link: HTMLElement;
	plain: HTMLElement;
	leaf: WorkspaceLeaf;
	fire: (el: HTMLElement) => MouseEvent;
} {
	const app = new App();
	const leaf = new WorkspaceLeaf();
	const root = document.createElement("div");
	root.innerHTML = `<span data-sf-link="Mara"><b>inner</b></span><i>plain</i>`;
	const handler = linkContextMenuHandler(app, root, resolve, leaf);
	root.addEventListener("contextmenu", handler);
	return {
		app,
		root,
		leaf,
		link: root.querySelector("b") as HTMLElement,
		plain: root.querySelector("i") as HTMLElement,
		fire(el) {
			const evt = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
			el.dispatchEvent(evt);
			return evt;
		},
	};
}

describe("linkContextMenuHandler", () => {
	it("triggers the standard file-menu for a resolved link and shows it at the event", () => {
		const show = vi.spyOn(Menu.prototype, "showAtMouseEvent");
		const { app, link, leaf, fire } = setup(() => mara);

		const evt = fire(link);

		expect(app.workspace.trigger).toHaveBeenCalledTimes(1);
		const [name, menu, file, source, passedLeaf] = vi.mocked(app.workspace.trigger).mock.calls[0]!;
		expect(name).toBe("file-menu");
		expect(menu).toBeInstanceOf(Menu);
		expect(file).toBe(mara);
		expect(source).toBe("story-forge");
		expect(passedLeaf).toBe(leaf);
		expect(show).toHaveBeenCalledWith(evt);
		expect(evt.defaultPrevented).toBe(true);
		show.mockRestore();
	});

	it("adds no items of its own", () => {
		const show = vi.spyOn(Menu.prototype, "showAtMouseEvent");
		const { link, fire } = setup(() => mara);
		fire(link);
		const menu = show.mock.contexts[0] as Menu;
		expect(menu._items).toHaveLength(0);
		show.mockRestore();
	});

	it("shows nothing and leaves the native menu alone when the link does not resolve", () => {
		const show = vi.spyOn(Menu.prototype, "showAtMouseEvent");
		const { app, link, fire } = setup(() => null);

		const evt = fire(link);

		expect(app.workspace.trigger).not.toHaveBeenCalled();
		expect(show).not.toHaveBeenCalled();
		expect(evt.defaultPrevented).toBe(false);
		show.mockRestore();
	});

	it("ignores a right-click that is not on a link", () => {
		const resolve = vi.fn(() => mara);
		const { app, plain, fire } = setup(resolve);

		const evt = fire(plain);

		expect(resolve).not.toHaveBeenCalled();
		expect(app.workspace.trigger).not.toHaveBeenCalled();
		expect(evt.defaultPrevented).toBe(false);
	});

	it("hands the resolver the marked element, not the click target inside it", () => {
		const resolve = vi.fn(() => mara);
		const { link, fire } = setup(resolve);
		fire(link);
		expect((resolve.mock.calls[0] as unknown as [HTMLElement])[0].getAttribute("data-sf-link")).toBe("Mara");
	});
});
