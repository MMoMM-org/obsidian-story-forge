/**
 * renderTimeline — read-only rail render of act-grouped scenes (mockup S62).
 *
 * A vertical rail per act: a non-collapsible act-divider pill (label already beat-derived
 * by `actLabel`) then scene cards, each with a plotline-colored rail node, a clickable
 * title (drill via the stamped `data-sf-link`), POV/location, a status badge, wordcount,
 * and character chips. Swimlane mode is reserved for M6 (ADR-13).
 *
 * @ref docs/XDD/specs/006-declarative-views/solution.md — ADR-8, ADR-13
 */

import { stampLinkEl, emptyLine } from "../panel/components";
import type { Group } from "./workspaceModel";
import { appendDot, appendStatusBadge, rowColor } from "./renderShared";

export type TimelineMode = "rail" | "swimlane";

export function renderTimeline(host: HTMLElement, groups: Group[], mode: TimelineMode = "rail"): void {
	if (mode !== "rail") {
		throw new Error(`Timeline "${mode}" mode arrives in M6; M5 renders "rail" only.`);
	}

	if (groups.length === 0) {
		emptyLine(host, "No scenes to place.");
		return;
	}

	for (const group of groups) {
		host.createEl("div", { cls: "sf-tl-actpill", text: group.label });
		const rail = host.createEl("div", { cls: "sf-tl-rail" });

		for (const scene of group.scenes) {
			const item = rail.createEl("div", { cls: "sf-tl-item" });
			appendDot(item, "sf-tl-node", rowColor(scene));

			const card = item.createEl("div", { cls: "sf-tl-card" });
			card.createEl("div", { cls: "sf-tl-ct" }).appendChild(stampLinkEl(scene.title, scene.file.path));

			const cm = card.createEl("div", { cls: "sf-tl-cm" });
			if (scene.pov !== "") cm.createEl("span", { cls: "sf-tl-pov", text: `POV: ${scene.pov}` });
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
