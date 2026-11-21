/**
 * renderNavigator — read-only sidebar Navigator (mockup S59).
 *
 * A compact scene browser: a filter box, a collapsible plotline filter list (colored dot +
 * name + count, with an "All" row), collapsible act-grouped scene rows (dot + order +
 * clickable title + `when`), and a status-tally progress bar. Scene titles carry the drill
 * `data-sf-link`; filter rows carry `data-sf-plotline`; collapsible headers carry
 * `data-sf-group-key`. The host (SidebarView tab) routes those in P4.
 *
 * @ref docs/XDD/specs/006-declarative-views/solution.md — ADR-8, ADR-10
 */

import { section, stampLinkEl, emptyLine } from "../panel/components";
import { plotlineColor, type Group, type GroupKind } from "./workspaceModel";
import { NEUTRAL_DOT_COLOR, appendDot, rowColor } from "./renderShared";

export interface NavigatorData {
	actGroups: Group[];
	plotlineGroups: Group[];
	tally: Record<string, number>;
}

export interface NavigatorState {
	plotlineFilter: string | null;
}

export interface NavigatorDeps {
	isCollapsed: (groupKey: string) => boolean;
}

/** Statuses that count as "done" for the progress bar. */
const WRITTEN = new Set(["written", "final", "revised", "done"]);

function dotColor(kind: GroupKind, label: string): string {
	if (kind === "plotline") return plotlineColor(label);
	if (kind === "unresolved") return "var(--text-muted)";
	return NEUTRAL_DOT_COLOR;
}

function stampGroupKey(sectionEl: HTMLElement, key: string): void {
	const head = sectionEl.querySelector(".sf-sec-head");
	if (head?.instanceOf(HTMLElement)) head.setAttribute("data-sf-group-key", key);
}

export function renderNavigator(
	host: HTMLElement,
	data: NavigatorData,
	state: NavigatorState,
	deps: NavigatorDeps,
): void {
	host.createEl("div", { cls: "sf-nav-filter", text: "Filter scenes…" });

	if (data.actGroups.length === 0) {
		emptyLine(host, "No scenes in scope.");
		return;
	}

	const total = Object.values(data.tally).reduce((a, b) => a + b, 0);

	// Plotline filter list (collapsible).
	const pl = section(host, "Plotlines", {
		collapsed: deps.isCollapsed("nav:plotlines"),
		count: data.plotlineGroups.length,
	});
	stampGroupKey(pl.sectionEl, "nav:plotlines");

	const addFilterRow = (label: string, count: number, color: string, plotline: string): void => {
		const r = pl.bodyEl.createEl("div", { cls: "sf-nav-pl-row" });
		r.setAttribute("data-sf-plotline", plotline);
		if (state.plotlineFilter === (plotline === "" ? null : plotline)) r.classList.add("sf-nav-pl-row--sel");
		appendDot(r, "sf-nav-dot", color);
		r.createEl("span", { cls: "sf-nav-pl-name", text: label });
		r.createEl("span", { cls: "sf-nav-pl-count", text: String(count) });
	};

	addFilterRow("All", total, NEUTRAL_DOT_COLOR, "");
	for (const g of data.plotlineGroups) addFilterRow(g.label, g.scenes.length, dotColor(g.kind, g.label), g.label);

	// Act-grouped scene rows.
	for (const group of data.actGroups) {
		const { sectionEl, bodyEl } = section(host, group.label, {
			collapsed: deps.isCollapsed(group.key),
			count: group.scenes.length,
		});
		stampGroupKey(sectionEl, group.key);
		for (const scene of group.scenes) {
			const rowEl = bodyEl.createEl("div", { cls: "sf-nav-sc-row" });
			appendDot(rowEl, "sf-nav-dot", rowColor(scene));
			if (scene.order !== null) rowEl.createEl("span", { cls: "sf-nav-idx", text: String(scene.order) });
			rowEl.appendChild(stampLinkEl(scene.title, scene.file.path));
			if (scene.when !== "") rowEl.createEl("span", { cls: "sf-nav-when", text: scene.when });
		}
	}

	// Progress bar from the status tally.
	const prog = host.createEl("div", { cls: "sf-nav-prog" });
	const fill = prog.createEl("div", { cls: "sf-nav-prog-bar" }).createEl("i");
	const done = Object.entries(data.tally)
		.filter(([k]) => WRITTEN.has(k))
		.reduce((a, [, v]) => a + v, 0);
	fill.setCssProps({ "--sf-nav-progress": `${total > 0 ? Math.round((done / total) * 100) : 0}%` });
	const summary = Object.entries(data.tally)
		.filter(([k]) => k !== "")
		.map(([k, v]) => `${k} ${v}`)
		.join(" · ");
	prog.createEl("span", { cls: "sf-nav-prog-label", text: summary === "" ? `${total} scenes` : summary });
}
