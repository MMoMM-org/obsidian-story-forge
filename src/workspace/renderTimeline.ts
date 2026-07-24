/**
 * renderTimeline — read-only rail render of act-grouped scenes (mockup S62/S63).
 *
 * Each act is a collapsible `section()` (chevron + count, persisted via CollapseStore),
 * its body a vertical rail: a left `when` gutter, a plotline-coloured rail node, and a
 * scene card. The whole card drills (it carries `data-sf-link`). Swimlane mode is M6.
 *
 * @ref docs/XDD/specs/006-declarative-views/solution.md — ADR-8, ADR-13
 */

import { section, emptyLine } from "../panel/components";
import type { Group } from "./workspaceModel";
import { appendDot, appendStatusBadge, rowColor } from "./renderShared";

export type TimelineMode = "rail" | "swimlane";

export interface TimelineDeps {
	isCollapsed: (groupKey: string) => boolean;
}

export function renderTimeline(
	host: HTMLElement,
	groups: Group[],
	deps: TimelineDeps = { isCollapsed: () => false },
	mode: TimelineMode = "rail",
): void {
	if (mode !== "rail") {
		throw new Error(`Timeline "${mode}" mode arrives in M6; M5 renders "rail" only.`);
	}

	if (groups.length === 0) {
		emptyLine(host, "No scenes to place.");
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
			head.classList.add("sf-tl-acthead");
		}

		const rail = bodyEl.createEl("div", { cls: "sf-tl-rail" });
		for (const scene of group.scenes) {
			const item = rail.createEl("div", { cls: "sf-tl-item" });
			item.createEl("div", { cls: "sf-tl-when", text: scene.when !== "" ? scene.when : "—" });
			appendDot(item, "sf-tl-node", rowColor(scene));

			const card = item.createEl("div", { cls: "sf-tl-card" });
			card.setAttribute("data-sf-link", scene.file.path);
			card.setAttribute("role", "link");
			card.setAttribute("tabindex", "0");
			card.createEl("div", { cls: "sf-tl-ct", text: scene.title });

			const cm = card.createEl("div", { cls: "sf-tl-cm" });
			if (scene.pov !== "") cm.createEl("span", { cls: "sf-tl-pov", text: scene.pov });
			if (scene.location !== "") cm.createEl("span", { cls: "sf-tl-loc", text: scene.location });

			const meta = card.createEl("div", { cls: "sf-tl-meta" });
			appendStatusBadge(meta, scene.status);
			if (scene.wordcount !== null) {
				meta.createEl("span", { cls: "sf-tl-words", text: `${scene.wordcount} words` });
			}

			if (scene.characters.length > 0) {
				const chips = card.createEl("div", { cls: "sf-tl-chips" });
				for (const c of scene.characters) chips.createEl("span", { cls: "sf-tl-chip", text: c });
			}
		}
	}
}
