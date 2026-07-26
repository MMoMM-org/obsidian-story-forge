/**
 * renderPlotgrid — F2: Scene × Plotline matrix with click-toggle write-back.
 *
 * Renders a grid where ROWS = scenes, COLUMNS = plotlines (M3 orientation).
 * Each cell shows whether the scene belongs to that plotline. Clicking a cell
 * toggles the plotline in the scene's `plotlines` frontmatter list.
 *
 * Design Clarification 2: This surface uses a click/keyboard toggle, NOT the
 * drag machine (InteractionHandler). The toggle writes via the single write
 * seam: commit(app, file, "plotlines", newArray, {name:"plotlines",type:"list"}).
 *
 * Listeners are registered via component.registerDomEvent so cleanup is owned
 * by the Obsidian Component lifecycle (CON-4).
 *
 * Row header (col 1):  scene order index + title as a [data-sf-link] drill span.
 * Column headers:      plotline name, colour-coded via plotlineColor(name).
 *                      Unresolved plotline (path === "") columns are flagged/muted.
 *
 * Filled cell (has(sceneIdx, plotline) === true):
 *   Shows compact indicator: status badge + `when` field ("Draft · Night 1").
 *
 * Cell DOM:
 *   [role="gridcell"][aria-checked][tabindex="0"]
 *   [data-sf-scene=<file.path>][data-sf-plotline=<plotline.name>]
 *   - Resolved plotline column: interactive (click/Space/Enter toggles)
 *   - Unresolved plotline column: [aria-disabled="true"], no listeners
 *
 * Table DOM:
 *   [role="table"].sf-pg-table
 *     .sf-pg-thead > .sf-pg-tr
 *       [role="columnheader"].sf-pg-corner          (top-left corner)
 *       [role="columnheader"].sf-pg-col-head        (one per plotline, colour-coded)
 *     .sf-pg-tbody > .sf-pg-tr                      (one per scene)
 *       [role="rowheader"].sf-pg-row-head           (scene order + title)
 *       [role="gridcell"].sf-pg-cell                (one per plotline)
 *
 * @ref docs/XDD/specs/007-interactive-views/plan/phase-5.md — T5.2
 * @ref docs/XDD/specs/007-interactive-views/solution.md — ADR-14, AC-3/AC-4
 */

import type { App, Component, TFile } from "obsidian";
import { emptyLine } from "../panel/components";
import { commit } from "../inspector/frontmatterWriter";
import {
	type PlotgridModel,
	stripLink,
	type Link,
	plotlineColor,
	type SceneRow,
} from "./workspaceModel";
import { statusSlug } from "./renderShared";

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
 * Render a Scene × Plotline matrix into `host` (M3 orientation).
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
	tableEl.setAttribute("aria-label", "Plotgrid: scenes × plotlines");

	// Header row: corner + one column header per plotline
	const theadEl = tableEl.createEl("div", { cls: "sf-pg-thead" });
	const headRowEl = theadEl.createEl("div", { cls: "sf-pg-tr" });

	// Corner cell (top-left)
	const cornerEl = headRowEl.createEl("div", { cls: "sf-pg-th sf-pg-corner" });
	cornerEl.setAttribute("role", "columnheader");
	cornerEl.textContent = "Plotgrid";

	// One column header per plotline, colour-coded
	for (const plotline of model.plotlines) {
		const isUnresolved = plotline.path === "";
		const thEl = headRowEl.createEl("div", {
			cls: isUnresolved
				? "sf-pg-th sf-pg-col-head sf-pg-col-head--unresolved"
				: "sf-pg-th sf-pg-col-head",
		});
		thEl.setAttribute("role", "columnheader");
		thEl.setAttribute("aria-label", plotline.name);
		thEl.setAttribute("title", isUnresolved ? `${plotline.name} (unresolved)` : plotline.name);
		thEl.setAttribute("data-sf-plotline-col", plotline.name);

		// Colour dot + name
		if (!isUnresolved) {
			const color = plotlineColor(plotline.name);
			const dotEl = thEl.createEl("span", { cls: "sf-pg-col-dot" });
			dotEl.style.background = color;
			thEl.style.setProperty("--sf-pg-col-color", color);
		}

		const nameSpan = thEl.createEl("span", {
			cls: "sf-pg-col-name",
			text: plotline.name,
		});
		if (!isUnresolved) {
			nameSpan.setAttribute("data-sf-link", plotline.path);
			nameSpan.setAttribute("role", "link");
			nameSpan.setAttribute("tabindex", "0");
		}
	}

	// Body rows: one row per scene
	const tbodyEl = tableEl.createEl("div", { cls: "sf-pg-tbody" });

	for (let sceneIdx = 0; sceneIdx < model.scenes.length; sceneIdx++) {
		const scene = model.scenes[sceneIdx]!;
		renderSceneRow(tbodyEl, scene, sceneIdx, model, deps);
	}
}

// ---------------------------------------------------------------------------
// Row rendering
// ---------------------------------------------------------------------------

function renderSceneRow(
	tbody: HTMLElement,
	scene: SceneRow,
	sceneIdx: number,
	model: PlotgridModel,
	deps: PlotgridDeps,
): void {
	const rowEl = tbody.createEl("div", { cls: "sf-pg-tr" });
	rowEl.setAttribute("role", "row");

	// Row header: scene order index + title as drill link
	const rhEl = rowEl.createEl("div", { cls: "sf-pg-row-head" });
	rhEl.setAttribute("role", "rowheader");

	const orderLabel = scene.order !== null ? `${scene.order}. ` : "";
	const titleSpan = rhEl.createEl("span", {
		cls: "sf-pg-scene-title",
		text: `${orderLabel}${scene.title}`,
	});
	titleSpan.setAttribute("data-sf-link", scene.file.path);
	titleSpan.setAttribute("role", "link");
	titleSpan.setAttribute("tabindex", "0");

	// One cell per plotline column
	for (const plotline of model.plotlines) {
		const isUnresolved = plotline.path === "";
		const isFilled = model.has(sceneIdx, plotline);

		const cellEl = rowEl.createEl("div", {
			cls: isFilled
				? "sf-pg-cell sf-pg-cell--filled"
				: "sf-pg-cell",
		});
		cellEl.setAttribute("role", "gridcell");
		cellEl.setAttribute("aria-checked", String(isFilled));
		cellEl.setAttribute("data-sf-scene", scene.file.path);
		cellEl.setAttribute("data-sf-plotline", plotline.name);

		if (isUnresolved) {
			// Non-interactive: no listeners, aria-disabled
			cellEl.setAttribute("aria-disabled", "true");
		} else {
			// Interactive: tabindex + click + Space/Enter keyboard
			cellEl.setAttribute("tabindex", "0");

			// Set column accent color on the cell (for filled indicator)
			const color = plotlineColor(plotline.name);
			cellEl.style.setProperty("--sf-pg-col-color", color);

			if (isFilled) {
				renderFilledContent(cellEl, scene);
			}

			bindCellToggle(cellEl, scene.file, plotline, scene.plotlines, deps);
		}
	}
}

// ---------------------------------------------------------------------------
// Filled cell content
// ---------------------------------------------------------------------------

/**
 * Render the compact indicator inside a filled cell:
 * status badge + when field (e.g. "Draft · Night 1").
 */
function renderFilledContent(cell: HTMLElement, scene: SceneRow): void {
	const innerEl = cell.createEl("span", { cls: "sf-pg-cell-inner" });

	// Status badge (skips if empty)
	if (scene.status !== "") {
		innerEl.createEl("span", {
			cls: `sf-pg-cell-status sf-pg-cell-status--${statusSlug(scene.status)}`,
			text: scene.status,
		});
	}

	// When field
	if (scene.when !== "") {
		innerEl.createEl("span", {
			cls: "sf-pg-cell-when",
			text: scene.when,
		});
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
