/**
 * renderPlotgrid — F2: Plotline × scene matrix with click-toggle write-back.
 *
 * Renders a grid where rows=plotlines, columns=scenes. Each cell shows whether
 * the scene belongs to that plotline. Clicking a cell toggles the plotline in
 * the scene's `plotlines` frontmatter list.
 *
 * Design Clarification 2: This surface uses a click/keyboard toggle, NOT the
 * drag machine (InteractionHandler). The toggle writes via the single write
 * seam: commit(app, file, "plotlines", newArray, {name:"plotlines",type:"list"}).
 *
 * Listeners are registered via component.registerDomEvent so cleanup is owned
 * by the Obsidian Component lifecycle (CON-4).
 *
 * Cell DOM:
 *   [role="gridcell"][aria-checked][tabindex="0"]
 *   [data-sf-scene=<file.path>][data-sf-plotline=<plotline.name>]
 *   - Resolved plotline: interactive (click/Space/Enter toggles)
 *   - Unresolved plotline: [aria-disabled="true"], no listeners
 *
 * Table DOM:
 *   [role="table"].sf-pg-table
 *     .sf-pg-thead > .sf-pg-tr > [role="columnheader"].sf-pg-th  (per scene)
 *     .sf-pg-tbody > .sf-pg-tr > [role="rowheader"]+[role="gridcell"]  (per plotline)
 *
 * @ref docs/XDD/specs/007-interactive-views/plan/phase-5.md — T5.2
 * @ref docs/XDD/specs/007-interactive-views/solution.md — ADR-14, AC-3/AC-4
 */

import type { App, Component, TFile } from "obsidian";
import { emptyLine } from "../panel/components";
import { commit } from "../inspector/frontmatterWriter";
import { type PlotgridModel, stripLink, type Link } from "./workspaceModel";

// ---------------------------------------------------------------------------
// Field spec for plotlines (list type)
// ---------------------------------------------------------------------------

const PLOTLINES_FIELD = {
	name: "plotlines",
	type: "list" as const,
};

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Dependencies injected into renderPlotgrid. */
export interface PlotgridDeps {
	/** Obsidian App — used by commit() to call processFrontMatter. */
	app: App;
	/**
	 * Obsidian Component (or host view) whose lifecycle owns the DOM listeners.
	 * All click/keydown listeners are registered via component.registerDomEvent
	 * so they are cleaned up on unload (CON-4).
	 */
	component: Component;
	/** Called after a successful write — triggers optimistic re-render (ADR-22). */
	onAfter: (file: TFile) => void;
}

// ---------------------------------------------------------------------------
// Main render
// ---------------------------------------------------------------------------

/**
 * Render a Plotline × Scene matrix into `host`.
 *
 * @param host  Host element to render into
 * @param model Output of plotgridModel()
 * @param deps  App + Component + onAfter callback
 */
export function renderPlotgrid(
	host: HTMLElement,
	model: PlotgridModel,
	deps: PlotgridDeps,
): void {
	if (model.plotlines.length === 0 || model.scenes.length === 0) {
		emptyLine(host, "No plotlines or scenes in scope.");
		return;
	}

	// Build the grid table
	const tableEl = host.createEl("div", { cls: "sf-pg-table" });
	tableEl.setAttribute("role", "table");
	tableEl.setAttribute("aria-label", "Plotgrid: plotlines × scenes");

	// Header row: one column header per scene
	const theadEl = tableEl.createEl("div", { cls: "sf-pg-thead" });
	const headRowEl = theadEl.createEl("div", { cls: "sf-pg-tr" });
	// Corner cell (plotline label column)
	headRowEl.createEl("div", { cls: "sf-pg-th sf-pg-corner" }).setAttribute("role", "columnheader");

	for (const scene of model.scenes) {
		const thEl = headRowEl.createEl("div", { cls: "sf-pg-th" });
		thEl.setAttribute("role", "columnheader");
		thEl.setAttribute("aria-label", scene.title);
		thEl.setAttribute("title", scene.title);
		// Scene header as drill link
		const titleSpan = thEl.createEl("span", { cls: "sf-pg-scene-title", text: scene.title });
		titleSpan.setAttribute("data-sf-link", scene.file.path);
		titleSpan.setAttribute("role", "link");
		titleSpan.setAttribute("tabindex", "0");
	}

	// Body rows: one row per plotline
	const tbodyEl = tableEl.createEl("div", { cls: "sf-pg-tbody" });

	for (const plotline of model.plotlines) {
		const isUnresolved = plotline.path === "";
		renderPlotlineRow(tbodyEl, plotline, model, deps, isUnresolved);
	}
}

// ---------------------------------------------------------------------------
// Row rendering
// ---------------------------------------------------------------------------

function renderPlotlineRow(
	tbody: HTMLElement,
	plotline: Link,
	model: PlotgridModel,
	deps: PlotgridDeps,
	isUnresolved: boolean,
): void {
	const rowEl = tbody.createEl("div", { cls: "sf-pg-tr" });
	rowEl.setAttribute("role", "row");

	// Row header: plotline name
	const rhEl = rowEl.createEl("div", { cls: "sf-pg-row-head" });
	rhEl.setAttribute("role", "rowheader");
	if (isUnresolved) {
		rhEl.classList.add("sf-pg-row-head--unresolved");
		rhEl.setAttribute("title", "Unresolved plotline link");
	}
	const labelEl = rhEl.createEl("span", {
		cls: "sf-pg-plotline-label",
		text: plotline.name,
	});
	// Resolved plotlines are drillable
	if (!isUnresolved) {
		labelEl.setAttribute("data-sf-link", plotline.path);
		labelEl.setAttribute("role", "link");
		labelEl.setAttribute("tabindex", "0");
	}

	// Cells: one per scene
	for (let sceneIdx = 0; sceneIdx < model.scenes.length; sceneIdx++) {
		const scene = model.scenes[sceneIdx]!;
		const isFilled = model.has(sceneIdx, plotline);

		const cellEl = rowEl.createEl("div", { cls: "sf-pg-cell" });
		cellEl.setAttribute("role", "gridcell");
		cellEl.setAttribute("aria-checked", String(isFilled));
		cellEl.setAttribute("data-sf-scene", scene.file.path);
		cellEl.setAttribute("data-sf-plotline", plotline.name);
		if (isFilled) cellEl.classList.add("sf-pg-cell--filled");

		if (isUnresolved) {
			// Non-interactive: no listeners, aria-disabled
			cellEl.setAttribute("aria-disabled", "true");
		} else {
			// Interactive: tabindex + click + Space/Enter keyboard
			cellEl.setAttribute("tabindex", "0");
			bindCellToggle(cellEl, scene.file, plotline, scene.plotlines, deps);
		}
	}
}

// ---------------------------------------------------------------------------
// Cell toggle binding
// ---------------------------------------------------------------------------

/**
 * Bind click and keydown (Space/Enter) to toggle `plotline` in the scene's
 * `plotlines` list. All listeners are registered via component.registerDomEvent
 * for CON-4 lifecycle cleanup.
 *
 * @param cell          The gridcell element
 * @param file          The scene's TFile
 * @param plotline      The plotline link to toggle
 * @param rawPlotlines  Raw `plotlines` array from the SceneRow (original strings)
 * @param deps          App + Component + onAfter
 */
function bindCellToggle(
	cell: HTMLElement,
	file: TFile,
	plotline: Link,
	rawPlotlines: string[],
	deps: PlotgridDeps,
): void {
	const toggle = (): void => {
		void performToggle(cell, file, plotline, rawPlotlines, deps);
	};

	deps.component.registerDomEvent(cell, "click", toggle);
	deps.component.registerDomEvent(cell, "keydown", (e: KeyboardEvent): void => {
		if (e.key === " " || e.key === "Enter") {
			e.preventDefault();
			toggle();
		}
	});
}

// ---------------------------------------------------------------------------
// Toggle write
// ---------------------------------------------------------------------------

/**
 * Compute the new `plotlines` array (append or order-preserving remove),
 * write it via commit() (the single writer seam), and call onAfter on success.
 *
 * Optimistic cell update: flip aria-checked immediately; reconcile via onAfter
 * which triggers a re-render from metadataCache (ADR-22).
 */
async function performToggle(
	cell: HTMLElement,
	file: TFile,
	plotline: Link,
	rawPlotlines: string[],
	deps: PlotgridDeps,
): Promise<void> {
	const wasFilled = cell.getAttribute("aria-checked") === "true";

	// Compute new plotlines array
	let newPlotlines: string[];
	if (wasFilled) {
		// Remove plotline: filter out entries that match by stripped name
		newPlotlines = rawPlotlines.filter((raw) => {
			const stripped = stripLink(raw);
			return stripped !== plotline.name;
		});
	} else {
		// Append plotline: use [[Name]] wikilink format
		newPlotlines = [...rawPlotlines, `[[${plotline.name}]]`];
	}

	// Optimistic update — flip the cell immediately
	const newFilled = !wasFilled;
	cell.setAttribute("aria-checked", String(newFilled));
	if (newFilled) {
		cell.classList.add("sf-pg-cell--filled");
	} else {
		cell.classList.remove("sf-pg-cell--filled");
	}

	// Write via the single write seam (CON-2, ADR-14)
	const result = await commit(deps.app, file, "plotlines", newPlotlines, PLOTLINES_FIELD);

	if (result.ok) {
		deps.onAfter(file);
	} else {
		// Roll back the optimistic update on failure
		cell.setAttribute("aria-checked", String(wasFilled));
		if (wasFilled) {
			cell.classList.add("sf-pg-cell--filled");
		} else {
			cell.classList.remove("sf-pg-cell--filled");
		}
	}
}
