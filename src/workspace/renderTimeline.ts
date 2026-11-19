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
 * Swimlane mode (M6 rework): a CSS grid — COLUMNS per group value (one per lane),
 * ROWS per scene grouped by act. The caller passes a `SwimlaneGrid` (from `swimlaneGrid()`);
 * each scene's compact mini-card sits in its lane column(s) via `laneOf()`; other cells
 * are empty. Uses `renderMiniCard` as the card helper (no rail card duplication).
 *
 * Both modes are strictly read-only: no writes, no imports of interactionHandler.
 *
 * @ref docs/XDD/specs/006-declarative-views/solution.md — ADR-8, ADR-13
 * @ref docs/XDD/specs/007-interactive-views/solution.md — ADR-20
 */

import { section, emptyLine } from "../panel/components";
import { actBeatLink, type Group, type SceneRow, type SwimlaneGrid } from "./workspaceModel";
import { appendDot, appendStatusBadge, rowColor } from "./renderShared";

export type TimelineMode = "rail" | "swimlane";

export interface TimelineDeps {
	isCollapsed: (groupKey: string) => boolean;
}

/** Extra render inputs. `swimlane` supplies the columns-per-value grid (mockup M2). */
export interface TimelineOptions {
	/** The swimlane grid (lanes + act rows + laneOf). Required for swimlane mode. */
	swimlane?: SwimlaneGrid;
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
	opts: TimelineOptions = {},
): void {
	if (mode === "swimlane") {
		renderSwimlane(host, opts.swimlane);
		return;
	}

	if (groups.length === 0) {
		emptyLine(host, "No scenes to place.");
		return;
	}
	renderRail(host, groups, deps);
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

/** Sequence-axis column width + minimum lane column width (matches styles.css). */
const SW_SEQ_W = "80px";
const SW_LANE_MIN = "minmax(180px, 1fr)";

/**
 * Swimlane mode (mockup M2): a CSS grid of COLUMNS per group value and ROWS per
 * scene. Column 1 is the sequence axis (sticky left); the header row shows lane
 * values (sticky top); each scene is one row with its compact mini-card in its
 * group column(s) (empty cells elsewhere, fanning out across plotline columns);
 * act dividers are full-width rows spanning all columns. Strictly read-only.
 */
function renderSwimlane(host: HTMLElement, grid: SwimlaneGrid | undefined): void {
	if (!grid || (grid.actRows.length === 0 && grid.lanes.length === 0)) {
		emptyLine(host, "No scenes to place.");
		return;
	}

	const { lanes, actRows } = grid;
	const gridEl = host.createEl("div", { cls: "sf-sw-grid" });
	// Drive the (dynamic) column template via a custom property; CSS reads it.
	gridEl.style.setProperty(
		"--sf-sw-cols",
		`${SW_SEQ_W} repeat(${lanes.length}, ${SW_LANE_MIN})`,
	);

	// Header row: sticky corner ("#") + one sticky header per lane.
	const corner = gridEl.createEl("div", { cls: "sf-sw-corner", text: "#" });
	corner.setAttribute("role", "columnheader");
	for (const lane of lanes) {
		const laneCls =
			lane.kind === "unresolved"
				? "sf-sw-lanehead sf-sw-lanehead--unresolved"
				: lane.kind === "unassigned"
					? "sf-sw-lanehead sf-sw-lanehead--neutral"
					: "sf-sw-lanehead";
		const h = gridEl.createEl("div", { cls: laneCls, text: lane.label });
		h.setAttribute("role", "columnheader");
	}

	// Body: act-divider rows (full width) + one row per scene.
	let seq = 0;
	for (const actRow of actRows) {
		const divider = gridEl.createEl("div", { cls: "sf-sw-actrow", text: actRow.label });
		// The act label drills its shared beat note (when resolved).
		const beat = actBeatLink(actRow.scenes);
		if (beat && beat.path !== "") {
			divider.setAttribute("data-sf-link", beat.path);
			divider.setAttribute("role", "link");
		}

		for (const scene of actRow.scenes) {
			seq += 1;
			renderSeqCell(gridEl, scene, seq);
			const keys = new Set(grid.laneOf(scene));
			for (const lane of lanes) {
				const cell = gridEl.createEl("div", { cls: "sf-sw-cell" });
				if (keys.has(lane.key)) {
					renderMiniCard(cell, scene);
				}
			}
		}
	}
}

/** Sequence cell (grid col 1): order index + a storyDay/when badge. */
function renderSeqCell(gridEl: HTMLElement, scene: SceneRow, seq: number): void {
	const cell = gridEl.createEl("div", { cls: "sf-sw-seq" });
	cell.createEl("span", { cls: "sf-sw-seqn", text: String(seq) });
	const badge =
		scene.storyDay !== null ? `D${scene.storyDay}` : scene.when !== "" ? scene.when : "";
	if (badge !== "") {
		cell.createEl("span", { cls: "sf-sw-seqwhen", text: badge });
	}
}

/**
 * Compact mini-card for a swimlane cell: a plotline-colour dot + title (drill span)
 * + a small status·when line. Read-only — the title carries data-sf-link only.
 */
function renderMiniCard(cell: HTMLElement, scene: SceneRow): void {
	const card = cell.createEl("div", { cls: "sf-sw-mini" });
	appendDot(card, "sf-sw-mini-dot", rowColor(scene));

	const title = card.createEl("span", { cls: "sf-sw-mini-title", text: scene.title });
	title.setAttribute("data-sf-link", scene.file.path);
	title.setAttribute("role", "link");
	title.setAttribute("tabindex", "0");

	const meta = card.createEl("div", { cls: "sf-sw-mini-meta" });
	appendStatusBadge(meta, scene.status);
	if (scene.when !== "") {
		meta.createEl("span", { cls: "sf-sw-mini-when", text: scene.when });
	}
}
