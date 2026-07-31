/**
 * anvilTabs.ts — the Anvil's tab strip: registry + DOM construction (T2.2, spec 008).
 *
 * The five tabs are a fixed, ordered list per the signed-off mockup (S91: Codex · Timeline ·
 * Plotgrid · Plotlines · Board — CON-10). This module is the one place that order and the
 * display label live, so `AnvilView`'s DOM construction and its `[data-ws-layout]` type guard
 * both read from the same registry instead of drifting apart.
 *
 * The Kanban layout displays as **Board** (S91) — a display-only rename. Its internal
 * `AnvilLayout` value and `data-ws-layout` hook stay `"kanban"` (ADR-27: renaming a surface
 * changes its display name, never any id/value saved workspace layouts or tests key off).
 *
 * @ref docs/mockups/anvil-workbench-codex.html — S91, S94
 * @ref docs/XDD/specs/008-codex-surface/requirements.md — Feature F1
 * @ref docs/XDD/specs/008-codex-surface/solution.md — ADR-27, Directory Map
 */

import type { AnvilLayout } from "./AnvilView";

/** Tab order, exactly as shown in the signed-off mockup (S91/S94). */
export const ANVIL_TABS: readonly AnvilLayout[] = ["codex", "timeline", "plotgrid", "plotlines", "kanban"];

/** Sentence-case display label per tab (obsidianmd UI-text rule). */
export const ANVIL_TAB_LABEL: Record<AnvilLayout, string> = {
	codex: "Codex",
	timeline: "Timeline",
	plotgrid: "Plotgrid",
	plotlines: "Plotlines",
	kanban: "Board",
};

/** Narrows an unknown `data-ws-layout` value to a registered tab. */
export function isAnvilTab(v: unknown): v is AnvilLayout {
	return typeof v === "string" && (ANVIL_TABS as readonly string[]).includes(v);
}

/**
 * Builds the tab strip into `host`: one `.sf-ws-mode` pill per registry tab, in order,
 * each carrying the `data-ws-layout` hook the delegated click router matches on.
 */
export function buildAnvilTabStrip(host: HTMLElement): HTMLElement {
	const strip = host.createDiv({ cls: "sf-ws-toggle" });
	for (const tab of ANVIL_TABS) {
		strip
			.createEl("span", { cls: "sf-ws-mode", text: ANVIL_TAB_LABEL[tab] })
			.setAttribute("data-ws-layout", tab);
	}
	return strip;
}
