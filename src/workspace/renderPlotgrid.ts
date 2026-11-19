/**
 * renderPlotgrid — read-only Scene × Plotline coverage matrix (M6 rework).
 *
 * Renders a grid where ROWS = ALL in-scope scenes, COLUMNS = ALL in-scope plotlines.
 * Columns are persistent: they come from the full plotline scope (resolvePlotlineScope),
 * so the grid NEVER collapses even when a plotline has zero scene memberships or when a
 * scene has zero plotlines.
 *
 * This surface is READ-ONLY. There is NO click/keydown write path, no commit, no
 * processFrontMatter call, no InteractionHandler. Cells are purely informational.
 *
 * Row header (col 1):  scene order index + title as a [data-sf-link] drill span.
 * Column headers:      plotline name, colour-coded via plotlineColor(name).
 *                      Unresolved plotline (path === "") columns are flagged/muted.
 *
 * Filled cell (has(sceneIdx, plotline) === true):
 *   Shows compact indicator: status badge + `when` field ("Draft · Night 1").
 *
 * Cell DOM (read-only):
 *   [role="cell"].sf-pg-cell
 *   [data-sf-scene=<file.path>][data-sf-plotline=<plotline.name>]
 *   - Filled cells: class sf-pg-cell--filled, aria-label with status+when
 *   - Unresolved column cells: [aria-disabled="true"]
 *
 * Table DOM:
 *   [role="table"].sf-pg-table
 *     .sf-pg-thead > .sf-pg-tr
 *       [role="columnheader"].sf-pg-corner          (top-left corner)
 *       [role="columnheader"].sf-pg-col-head        (one per plotline, colour-coded)
 *     .sf-pg-tbody > .sf-pg-tr                      (one per scene)
 *       [role="rowheader"].sf-pg-row-head           (scene order + title)
 *       [role="cell"].sf-pg-cell                    (one per plotline, read-only)
 *
 * @ref docs/XDD/specs/007-interactive-views/plan/ — M6 rework
 * @ref docs/XDD/specs/007-interactive-views/solution.md — ADR-14
 */

import { emptyLine } from "../panel/components";
import {
	type PlotgridModel,
	plotlineColor,
	type SceneRow,
} from "./workspaceModel";
import { statusSlug } from "./renderShared";

// ---------------------------------------------------------------------------
// Main render (read-only)
// ---------------------------------------------------------------------------

/**
 * Render a read-only Scene × Plotline coverage matrix into `host`.
 *
 * Columns = all in-scope plotlines (persistent — never collapses).
 * Rows = all in-scope scenes (including 0-plotline scenes).
 *
 * @param host  Host element to render into
 * @param model Output of plotgridModelFromScope()
 */
export function renderPlotgrid(
	host: HTMLElement,
	model: PlotgridModel,
): void {
	if (model.scenes.length === 0) {
		emptyLine(host, "No scenes in scope.");
		return;
	}

	// Build the grid table
	const tableEl = host.createEl("div", { cls: "sf-pg-table" });
	tableEl.setAttribute("role", "table");
	tableEl.setAttribute("aria-label", "Plotgrid: scenes by plotline");

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
		renderSceneRow(tbodyEl, scene, sceneIdx, model);
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

	// One read-only cell per plotline column
	for (const plotline of model.plotlines) {
		const isUnresolved = plotline.path === "";
		const isFilled = model.has(sceneIdx, plotline);

		const cellEl = rowEl.createEl("div", {
			cls: isFilled
				? "sf-pg-cell sf-pg-cell--filled"
				: "sf-pg-cell",
		});
		// Read-only: role="cell" (not gridcell — no interactivity)
		cellEl.setAttribute("role", "cell");
		cellEl.setAttribute("data-sf-scene", scene.file.path);
		cellEl.setAttribute("data-sf-plotline", plotline.name);

		if (isUnresolved) {
			cellEl.setAttribute("aria-disabled", "true");
		} else {
			cellEl.style.setProperty("--sf-pg-col-color", plotlineColor(plotline.name));
		}

		if (isFilled) {
			renderFilledContent(cellEl, scene);
		}
		// No event listeners — read-only.
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
