/**
 * renderPlotlines — read-only list render of plotline groups (mockup S69).
 *
 * One collapsible `section` per plotline (colored dot + count), scene rows carrying the
 * drill `data-sf-link`. "Unassigned" comes last, "unresolved" groups are flagged — order
 * is produced by `plotlineModel`. The header carries `data-sf-group-key` so the host can
 * route collapse into the CollapseStore. Subway mode is reserved for M6 (ADR-13).
 *
 * @ref docs/XDD/specs/006-declarative-views/solution.md — ADR-7, ADR-8, ADR-13
 */

import { section, stampLinkEl, emptyLine } from "../panel/components";
import { plotlineColor, type Group, type GroupKind } from "./workspaceModel";
import { NEUTRAL_DOT_COLOR, appendDot, rowColor } from "./renderShared";

export type PlotlinesMode = "list" | "subway";

export interface PlotlinesDeps {
	isCollapsed: (groupKey: string) => boolean;
}

function dotColor(kind: GroupKind, label: string): string {
	if (kind === "plotline") return plotlineColor(label);
	if (kind === "unresolved") return "var(--text-muted)";
	return NEUTRAL_DOT_COLOR;
}

export function renderPlotlines(
	host: HTMLElement,
	groups: Group[],
	deps: PlotlinesDeps,
	mode: PlotlinesMode = "list",
): void {
	if (mode !== "list") {
		throw new Error(`Plotlines "${mode}" mode arrives in M6; M5 renders "list" only.`);
	}

	if (groups.length === 0) {
		emptyLine(host, "No scenes to group.");
		return;
	}

	for (const group of groups) {
		const { sectionEl, bodyEl } = section(host, group.label, {
			collapsed: deps.isCollapsed(group.key),
			count: group.scenes.length,
		});

		const head = sectionEl.querySelector(".sf-sec-head");
		if (head instanceof HTMLElement) {
			head.setAttribute("data-sf-group-key", group.key);
			if (group.kind === "unresolved") head.classList.add("sf-pl-unresolved");
			if (group.kind === "unassigned") head.classList.add("sf-pl-unassigned");
			const dot = appendDot(head, "sf-pl-dot", dotColor(group.kind, group.label));
			const label = head.querySelector(".sf-sec-label");
			if (label) head.insertBefore(dot, label);
		}

		for (const scene of group.scenes) {
			const rowEl = bodyEl.createEl("div", { cls: "sf-pl-row" });
			appendDot(rowEl, "sf-pl-rowdot", rowColor(scene));
			if (scene.order !== null) rowEl.createEl("span", { cls: "sf-pl-idx", text: String(scene.order) });
			rowEl.appendChild(stampLinkEl(scene.title, scene.file.path));
			if (scene.status !== "") rowEl.createEl("span", { cls: "sf-trail", text: scene.status });
		}
	}
}
