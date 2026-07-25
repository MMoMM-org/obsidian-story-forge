/**
 * renderTimeline — read-only rail render of act-grouped scenes (mockup S62/S63),
 * and swimlane mode (M6 / T4.2, mockup S76).
 *
 * Rail mode: each act is a collapsible `section()`; its label drills the act's beat note.
 * The body is a rail: a `when` gutter, a plotline-coloured node (hover = plotline name,
 * click = drill the plotline), and a scene card. The whole card drills the scene; the
 * card's fields (POV, location, characters) are individual drill/open links, with the
 * POV character's chip highlighted.
 *
 * Swimlane mode: one collapsible lane per Group (caller passes groups from swimlaneModel).
 * Both modes share the same card-render helper — no card DOM duplication.
 *
 * Both modes are strictly read-only: no writes, no imports of interactionHandler.
 *
 * @ref docs/XDD/specs/006-declarative-views/solution.md — ADR-8, ADR-13
 * @ref docs/XDD/specs/007-interactive-views/solution.md — ADR-20
 */

import { section, emptyLine } from "../panel/components";
import { actBeatLink, type Group, type SceneRow } from "./workspaceModel";
import { appendDot, appendStatusBadge, rowColor } from "./renderShared";

export type TimelineMode = "rail" | "swimlane";

export interface TimelineDeps {
	isCollapsed: (groupKey: string) => boolean;
}

/** Append a drill link span; a "" path renders as plain (non-clickable) text. */
function fieldLink(parent: HTMLElement, cls: string, name: string, path: string): HTMLElement {
	const el = parent.createEl("span", { cls, text: name });
	if (path !== "") {
		el.setAttribute("data-sf-link", path);
		el.setAttribute("role", "link");
		el.setAttribute("tabindex", "0");
	}
	return el;
}

/**
 * Render a single scene card into a rail container.
 * Used by both rail and swimlane modes — no DOM duplication.
 */
function renderSceneCard(rail: HTMLElement, scene: SceneRow): void {
	const item = rail.createEl("div", { cls: "sf-tl-item" });
	item.createEl("div", { cls: "sf-tl-when", text: scene.when !== "" ? scene.when : "—" });

	// Rail node: plotline colour + hover name + drill the plotline.
	const dot = appendDot(item, "sf-tl-node", rowColor(scene));
	if (scene.plotline) {
		dot.setAttribute("title", scene.plotline.name);
		if (scene.plotline.path !== "") {
			dot.setAttribute("data-sf-link", scene.plotline.path);
			dot.setAttribute("role", "link");
			dot.setAttribute("tabindex", "0");
		}
	}

	// The whole card drills the scene; its fields drill their own notes.
	const card = item.createEl("div", { cls: "sf-tl-card" });
	card.setAttribute("data-sf-link", scene.file.path);
	card.setAttribute("role", "link");
	card.setAttribute("tabindex", "0");
	card.createEl("div", { cls: "sf-tl-ct", text: scene.title });

	const cm = card.createEl("div", { cls: "sf-tl-cm" });
	if (scene.pov) {
		const pov = cm.createEl("span", { cls: "sf-tl-pov" });
		// eslint-disable-next-line obsidianmd/ui/sentence-case -- "POV" is an acronym
		pov.createEl("span", { cls: "sf-tl-pov-k", text: "POV: " });
		fieldLink(pov, "sf-tl-flink", scene.pov.name, scene.pov.path);
	}
	if (scene.location) {
		const loc = cm.createEl("span", { cls: "sf-tl-loc" });
		fieldLink(loc, "sf-tl-flink", scene.location.name, scene.location.path);
	}

	const meta = card.createEl("div", { cls: "sf-tl-meta" });
	appendStatusBadge(meta, scene.status);
	if (scene.wordcount !== null) {
		meta.createEl("span", { cls: "sf-tl-words", text: `${scene.wordcount} words` });
	}

	if (scene.characters.length > 0) {
		const chips = card.createEl("div", { cls: "sf-tl-chips" });
		for (const c of scene.characters) {
			const chip = fieldLink(chips, "sf-tl-chip", c.name, c.path);
			const isPov =
				scene.pov !== null &&
				(scene.pov.path !== "" ? c.path === scene.pov.path : c.name === scene.pov.name);
			if (isPov) chip.classList.add("sf-tl-chip--pov");
		}
	}
}

export function renderTimeline(
	host: HTMLElement,
	groups: Group[],
	deps: TimelineDeps = { isCollapsed: () => false },
	mode: TimelineMode = "rail",
): void {
	if (groups.length === 0) {
		emptyLine(host, "No scenes to place.");
		return;
	}

	if (mode === "rail") {
		renderRail(host, groups, deps);
	} else {
		renderSwimlane(host, groups, deps);
	}
}

/** Rail mode: act-grouped sections with the timeline rail layout. */
function renderRail(host: HTMLElement, groups: Group[], deps: TimelineDeps): void {
	for (const group of groups) {
		const { sectionEl, bodyEl } = section(host, group.label, {
			collapsed: deps.isCollapsed(group.key),
			count: group.scenes.length,
		});
		const head = sectionEl.querySelector(".sf-sec-head");
		if (head instanceof HTMLElement) {
			head.setAttribute("data-sf-group-key", group.key);
			head.classList.add("sf-tl-acthead");
			// The act label drills its shared beat note (when resolved).
			const beat = actBeatLink(group.scenes);
			const label = head.querySelector(".sf-sec-label");
			if (beat && beat.path !== "" && label instanceof HTMLElement) {
				label.setAttribute("data-sf-link", beat.path);
				label.setAttribute("role", "link");
			}
		}

		const rail = bodyEl.createEl("div", { cls: "sf-tl-rail" });
		for (const scene of group.scenes) {
			renderSceneCard(rail, scene);
		}
	}
}

/**
 * Swimlane mode: one lane per Group (from swimlaneModel). Each lane is a collapsible
 * section; collapse persists per (surface, scope, group) via the deps.isCollapsed seam.
 */
function renderSwimlane(host: HTMLElement, groups: Group[], deps: TimelineDeps): void {
	const lanesEl = host.createEl("div", { cls: "sf-sw-lanes" });

	for (const group of groups) {
		const laneKindCls =
			group.kind === "unresolved"
				? "sf-sw-lane sf-sw-lane--unresolved"
				: group.kind === "unassigned"
					? "sf-sw-lane sf-sw-lane--neutral"
					: "sf-sw-lane";

		const laneEl = lanesEl.createEl("div", { cls: laneKindCls });

		const { sectionEl, bodyEl } = section(laneEl, group.label, {
			collapsed: deps.isCollapsed(group.key),
			count: group.scenes.length,
		});

		const head = sectionEl.querySelector(".sf-sec-head");
		if (head instanceof HTMLElement) {
			head.setAttribute("data-sf-group-key", group.key);
		}

		const rail = bodyEl.createEl("div", { cls: "sf-tl-rail" });
		for (const scene of group.scenes) {
			renderSceneCard(rail, scene);
		}
	}
}
