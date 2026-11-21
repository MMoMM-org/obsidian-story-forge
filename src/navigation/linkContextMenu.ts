/**
 * linkContextMenu — right-click on a link shows Obsidian's own file menu.
 *
 * One delegated `contextmenu` handler per surface (Anvil, Workbench, a
 * standalone `.base` Card grid). The menu is not ours: we build an empty
 * `Menu`, let the workspace fill it through the standard `file-menu` event
 * (so core and third-party items appear exactly as in a file explorer) and
 * show it. We add no items.
 *
 * A link is any element carrying `data-sf-link`. The nearest one wins (the
 * same walk the click router uses). If the host cannot resolve its target to
 * a file, nothing happens at all — no menu, no error, and the native menu is
 * left alone (`preventDefault` only when a menu is shown).
 *
 * @ref docs/XDD/specs/008-codex-surface/solution.md — ADR-28
 */

import { Menu, type App, type TFile, type WorkspaceLeaf } from "obsidian";
import { walkTargetMarkers } from "./domTargetWalk";
import { isHtmlElement } from "./keyboardRouting";

/** `source` argument of the `file-menu` event: who is asking for the menu. */
const MENU_SOURCE = "story-forge";

const isLink = (el: HTMLElement): "name" | null => (el.hasAttribute("data-sf-link") ? "name" : null);

/**
 * Build the delegated handler for `root`. `resolve` receives the nearest
 * `data-sf-link` element and returns its file, or `null` when it names none.
 */
export function linkContextMenuHandler(
	app: App,
	root: HTMLElement,
	resolve: (link: HTMLElement) => TFile | null,
	leaf?: WorkspaceLeaf,
): (event: MouseEvent) => void {
	return (event: MouseEvent): void => {
		// Cross-window check: in a popout the target is of that window's realm (#50).
		if (!isHtmlElement(event.target)) return;
		const { nearest } = walkTargetMarkers(event.target, root, isLink);
		const file = nearest ? resolve(nearest) : null;
		if (!file) return;

		event.preventDefault();
		const menu = new Menu();
		app.workspace.trigger("file-menu", menu, file, MENU_SOURCE, leaf);
		menu.showAtMouseEvent(event);
	};
}
