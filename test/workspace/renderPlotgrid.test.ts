/**
 * renderPlotgrid.test.ts — read-only Scene × Plotline coverage matrix (M6 rework).
 *
 * The Plotgrid is now a READ-ONLY coverage view. Tests assert:
 *   - ALL scope plotlines are columns (persistent — including 0-scene plotlines,
 *     grid never collapses)
 *   - ALL in-scope scenes are rows (including 0-plotline scenes)
 *   - Filled cell shows status·when content
 *   - Colour-coded column headers
 *   - Unresolved column muted (aria-disabled)
 *   - Row-header drill links present
 *   - NO write path: no processFrontMatter/commit called on any interaction,
 *     clicking a cell does nothing
 *
 * Old toggle/rollback/keyboard-write tests are removed (surface is now read-only).
 *
 * @ref docs/XDD/specs/007-interactive-views/ — M6 rework
 * @ref docs/XDD/specs/007-interactive-views/solution.md — ADR-14
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, createMockTFile, augmentEl } from "../__mocks__/obsidian";
import { renderPlotgrid } from "workspace/renderPlotgrid";
import { plotgridModelFromScope } from "workspace/workspaceModel";
import type { SceneRow, Link, LinkResolver } from "workspace/workspaceModel";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSceneRow(
	o: Partial<SceneRow> & { title: string },
): SceneRow {
	const file = createMockTFile({ path: `scenes/${o.title}.md`, basename: o.title });
	return {
		file,
		title: o.title,
		act: null,
		order: o.order ?? null,
		storyDay: null,
		when: o.when ?? "",
		status: o.status ?? "",
		pov: null,
		location: null,
		characters: [],
		plotline: null,
		plotlines: o.plotlines ?? [],
		beat: "",
		beatName: "",
		beatPath: "",
		wordcount: null,
	};
}

function makeHost(): HTMLElement {
	const host = augmentEl(document.createElement("div"));
	document.body.appendChild(host);
	return host;
}

/** Make a scope plotline Link (resolved — has a non-empty path). */
function scopeLink(name: string): Link {
	return { name, path: `20 Planning/${name}.md` };
}

/** Resolver that resolves stripped text to a basename if it's in the known set. */
function makeResolver(known: string[]): LinkResolver {
	return (text: string) => {
		const stripped = text.replace(/^\[\[|\]\]$/g, "").trim();
		if (known.includes(stripped)) return { basename: stripped };
		return null;
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("renderPlotgrid (read-only coverage view)", () => {
	let app: App;
	let host: HTMLElement;

	beforeEach(() => {
		app = new App();
		host = makeHost();
	});

	afterEach(() => {
		if (host.parentNode) host.parentNode.removeChild(host);
	});

	// -------------------------------------------------------------------------
	// PG-RO-1: All scope plotlines are columns — persistent, never collapses
	// -------------------------------------------------------------------------
	it("all scope plotlines appear as columns, including a 0-scene plotline", () => {
		// Three scope plotlines; only Alpha and Beta are referenced by any scene.
		// Gamma has zero scenes but must still appear as a column.
		const allPlotlines = [scopeLink("Alpha"), scopeLink("Beta"), scopeLink("Gamma")];
		const resolve = makeResolver(["Alpha", "Beta", "Gamma"]);

		const s1 = makeSceneRow({ title: "S1", plotlines: ["[[Alpha]]"] });
		const s2 = makeSceneRow({ title: "S2", plotlines: ["[[Beta]]"] });
		const model = plotgridModelFromScope([s1, s2], allPlotlines, resolve);

		renderPlotgrid(host, model);

		// role=table must be present
		const table = host.querySelector("[role='table']");
		expect(table).not.toBeNull();

		// Column headers: corner + Alpha + Beta + Gamma = 4
		const colHeaders = host.querySelectorAll("[role='columnheader']");
		expect(colHeaders.length).toBe(4);

		const colTexts = Array.from(colHeaders).map((el) => el.textContent ?? "");
		expect(colTexts.some((t) => t.includes("Alpha"))).toBe(true);
		expect(colTexts.some((t) => t.includes("Beta"))).toBe(true);
		// Gamma (0-scene plotline) still appears as a column
		expect(colTexts.some((t) => t.includes("Gamma"))).toBe(true);
	});

	// -------------------------------------------------------------------------
	// PG-RO-2: All in-scope scenes are rows, including 0-plotline scenes
	// -------------------------------------------------------------------------
	it("all scenes are rows, including a scene with zero plotlines", () => {
		const allPlotlines = [scopeLink("Alpha")];
		const resolve = makeResolver(["Alpha"]);

		const s1 = makeSceneRow({ title: "S1", plotlines: ["[[Alpha]]"] });
		// S2 has zero plotlines — must still appear as a row
		const s2 = makeSceneRow({ title: "S2", plotlines: [] });
		const model = plotgridModelFromScope([s1, s2], allPlotlines, resolve);

		renderPlotgrid(host, model);

		const rowHeaders = host.querySelectorAll("[role='rowheader']");
		expect(rowHeaders.length).toBe(2);

		const rowTexts = Array.from(rowHeaders).map((el) => el.textContent ?? "");
		expect(rowTexts.some((t) => t.includes("S1"))).toBe(true);
		// S2 (0-plotline) is still a row
		expect(rowTexts.some((t) => t.includes("S2"))).toBe(true);

		// S2's cells in the Alpha column are empty (not filled)
		const s2AlphaCell = host.querySelector(
			"[data-sf-scene='scenes/S2.md'][data-sf-plotline='Alpha']",
		) as HTMLElement;
		expect(s2AlphaCell).not.toBeNull();
		expect(s2AlphaCell.classList.contains("sf-pg-cell--filled")).toBe(false);
	});

	// -------------------------------------------------------------------------
	// PG-RO-3: Correct scenes × plotlines layout (filled vs empty)
	// -------------------------------------------------------------------------
	it("correctly marks filled vs empty cells for scene×plotline membership", () => {
		const allPlotlines = [scopeLink("Alpha"), scopeLink("Beta")];
		const resolve = makeResolver(["Alpha", "Beta"]);

		// S1 is on Alpha only; S2 is on Beta only
		const s1 = makeSceneRow({ title: "S1", plotlines: ["[[Alpha]]"] });
		const s2 = makeSceneRow({ title: "S2", plotlines: ["[[Beta]]"] });
		const model = plotgridModelFromScope([s1, s2], allPlotlines, resolve);

		renderPlotgrid(host, model);

		// S1×Alpha: filled
		const s1Alpha = host.querySelector(
			"[data-sf-scene='scenes/S1.md'][data-sf-plotline='Alpha']",
		) as HTMLElement;
		expect(s1Alpha).not.toBeNull();
		expect(s1Alpha.classList.contains("sf-pg-cell--filled")).toBe(true);

		// S1×Beta: empty
		const s1Beta = host.querySelector(
			"[data-sf-scene='scenes/S1.md'][data-sf-plotline='Beta']",
		) as HTMLElement;
		expect(s1Beta).not.toBeNull();
		expect(s1Beta.classList.contains("sf-pg-cell--filled")).toBe(false);

		// S2×Alpha: empty
		const s2Alpha = host.querySelector(
			"[data-sf-scene='scenes/S2.md'][data-sf-plotline='Alpha']",
		) as HTMLElement;
		expect(s2Alpha).not.toBeNull();
		expect(s2Alpha.classList.contains("sf-pg-cell--filled")).toBe(false);

		// S2×Beta: filled
		const s2Beta = host.querySelector(
			"[data-sf-scene='scenes/S2.md'][data-sf-plotline='Beta']",
		) as HTMLElement;
		expect(s2Beta).not.toBeNull();
		expect(s2Beta.classList.contains("sf-pg-cell--filled")).toBe(true);
	});

	// -------------------------------------------------------------------------
	// PG-RO-4: Filled cell shows status and when text
	// -------------------------------------------------------------------------
	it("filled cell contains status and when text", () => {
		const allPlotlines = [scopeLink("Alpha")];
		const resolve = makeResolver(["Alpha"]);
		const s1 = makeSceneRow({ title: "S1", plotlines: ["[[Alpha]]"], status: "Draft", when: "Night 1" });
		const model = plotgridModelFromScope([s1], allPlotlines, resolve);

		renderPlotgrid(host, model);

		const filledCell = host.querySelector(
			"[data-sf-scene='scenes/S1.md'][data-sf-plotline='Alpha'].sf-pg-cell--filled",
		) as HTMLElement;
		expect(filledCell).not.toBeNull();
		expect(filledCell.textContent).toContain("Draft");
		expect(filledCell.textContent).toContain("Night 1");
	});

	// -------------------------------------------------------------------------
	// PG-RO-5: Plotline column headers are colour-coded
	// -------------------------------------------------------------------------
	it("plotline column headers have a colour dot (data-driven colour)", () => {
		const allPlotlines = [scopeLink("Alpha")];
		const resolve = makeResolver(["Alpha"]);
		const s1 = makeSceneRow({ title: "S1", plotlines: ["[[Alpha]]"] });
		const model = plotgridModelFromScope([s1], allPlotlines, resolve);

		renderPlotgrid(host, model);

		const colDot = host.querySelector(".sf-pg-col-dot") as HTMLElement;
		expect(colDot).not.toBeNull();
		expect(colDot.style.getPropertyValue("--sf-dot-color")).not.toBe("");
		expect(colDot.style.background).toBe("");
	});

	// -------------------------------------------------------------------------
	// PG-RO-6: Resolved col-head carries --sf-pg-col-color custom property
	// -------------------------------------------------------------------------
	it("resolved plotline column header has a non-empty --sf-pg-col-color custom property", () => {
		const allPlotlines = [scopeLink("Alpha")];
		const resolve = makeResolver(["Alpha"]);
		const s1 = makeSceneRow({ title: "S1", plotlines: ["[[Alpha]]"] });
		const model = plotgridModelFromScope([s1], allPlotlines, resolve);

		renderPlotgrid(host, model);

		const colHead = host.querySelector(
			".sf-pg-col-head[data-sf-plotline-col='Alpha']",
		) as HTMLElement;
		expect(colHead).not.toBeNull();
		expect(colHead.style.getPropertyValue("--sf-pg-col-color")).not.toBe("");
	});

	// -------------------------------------------------------------------------
	// PG-RO-7: Row header contains scene order + title as drill link
	// -------------------------------------------------------------------------
	it("row header shows scene title as a drill link (data-sf-link)", () => {
		const allPlotlines = [scopeLink("Alpha")];
		const resolve = makeResolver(["Alpha"]);
		const s1 = makeSceneRow({ title: "S1", order: 3, plotlines: ["[[Alpha]]"] });
		const model = plotgridModelFromScope([s1], allPlotlines, resolve);

		renderPlotgrid(host, model);

		const drillSpan = host.querySelector("[role='rowheader'] [data-sf-link]") as HTMLElement;
		expect(drillSpan).not.toBeNull();
		expect(drillSpan.getAttribute("data-sf-link")).toBe("scenes/S1.md");
		expect(drillSpan.textContent).toContain("S1");
		expect(drillSpan.textContent).toContain("3");
	});

	// -------------------------------------------------------------------------
	// PG-RO-8: Row-header drill span has tabindex="0" for keyboard reachability
	// -------------------------------------------------------------------------
	it("row-header scene-title drill span has tabindex='0'", () => {
		const allPlotlines = [scopeLink("Alpha")];
		const resolve = makeResolver(["Alpha"]);
		const s1 = makeSceneRow({ title: "S1", plotlines: ["[[Alpha]]"] });
		const model = plotgridModelFromScope([s1], allPlotlines, resolve);

		renderPlotgrid(host, model);

		const drillSpan = host.querySelector("[role='rowheader'] [data-sf-link]") as HTMLElement;
		expect(drillSpan).not.toBeNull();
		expect(drillSpan.getAttribute("tabindex")).toBe("0");
	});

	// -------------------------------------------------------------------------
	// PG-RO-9: Resolved col-head name span has tabindex="0" (keyboard-reachable)
	// -------------------------------------------------------------------------
	it("resolved column-header name span has tabindex='0'", () => {
		const allPlotlines = [scopeLink("Alpha")];
		const resolve = makeResolver(["Alpha"]);
		const s1 = makeSceneRow({ title: "S1", plotlines: ["[[Alpha]]"] });
		const model = plotgridModelFromScope([s1], allPlotlines, resolve);

		renderPlotgrid(host, model);

		const nameSpan = host.querySelector(
			".sf-pg-col-head[data-sf-plotline-col='Alpha'] .sf-pg-col-name[data-sf-link]",
		) as HTMLElement;
		expect(nameSpan).not.toBeNull();
		expect(nameSpan.getAttribute("tabindex")).toBe("0");
	});

	// -------------------------------------------------------------------------
	// PG-RO-10: Unresolved column (scene-referenced plotline not in scope) — muted
	// -------------------------------------------------------------------------
	it("unresolved plotline column (out-of-scope reference) has the unresolved modifier class", () => {
		// Scope has no plotlines; scene references one → appears as unresolved extra
		const resolver: LinkResolver = (_text) => null;
		const s1 = makeSceneRow({ title: "S1", plotlines: ["[[Phantom]]"] });
		const model = plotgridModelFromScope([s1], [], resolver);

		renderPlotgrid(host, model);

		const unresolvedHeader = host.querySelector(".sf-pg-col-head--unresolved");
		expect(unresolvedHeader).not.toBeNull();
		expect(unresolvedHeader?.getAttribute("data-sf-plotline-col")).toBe("Phantom");
	});

	// -------------------------------------------------------------------------
	// PG-RO-11: Unresolved column cells have aria-disabled
	// -------------------------------------------------------------------------
	it("unresolved plotline column cells are aria-disabled", () => {
		const resolver: LinkResolver = (_text) => null;
		const s1 = makeSceneRow({ title: "S1", plotlines: ["[[Unknown]]"] });
		const model = plotgridModelFromScope([s1], [], resolver);

		renderPlotgrid(host, model);

		const unresolvedCell = host.querySelector("[data-sf-plotline='Unknown']") as HTMLElement;
		expect(unresolvedCell).not.toBeNull();
		expect(unresolvedCell.getAttribute("aria-disabled")).toBe("true");
	});

	// -------------------------------------------------------------------------
	// PG-RO-12: Corner cell is labelled "Plotgrid"
	// -------------------------------------------------------------------------
	it("corner cell contains 'Plotgrid' label", () => {
		const allPlotlines = [scopeLink("Alpha")];
		const resolve = makeResolver(["Alpha"]);
		const s1 = makeSceneRow({ title: "S1", plotlines: ["[[Alpha]]"] });
		const model = plotgridModelFromScope([s1], allPlotlines, resolve);

		renderPlotgrid(host, model);

		const corner = host.querySelector(".sf-pg-corner");
		expect(corner).not.toBeNull();
		expect(corner?.textContent).toContain("Plotgrid");
	});

	// -------------------------------------------------------------------------
	// PG-RO-13: Empty scenes scope → empty-state message
	// -------------------------------------------------------------------------
	it("empty scenes → renders empty-state message", () => {
		const allPlotlines = [scopeLink("Alpha")];
		const resolve = makeResolver(["Alpha"]);
		const model = plotgridModelFromScope([], allPlotlines, resolve);

		renderPlotgrid(host, model);

		const emptyEl = host.querySelector(".sf-emptyline");
		expect(emptyEl).not.toBeNull();
	});

	// -------------------------------------------------------------------------
	// PG-RO-13b: Empty plotlines scope + scenes with no plotline refs → no crash
	// -------------------------------------------------------------------------
	it("empty allPlotlines + scenes with no plotline refs → renders corner + row-headers, no column headers, no crash", () => {
		// Symmetric to the empty-scenes guard (PG-RO-13): now the OTHER axis is empty.
		const resolver: LinkResolver = (_text) => null;
		const s1 = makeSceneRow({ title: "S1", plotlines: [] });
		const s2 = makeSceneRow({ title: "S2", plotlines: [] });
		const model = plotgridModelFromScope([s1, s2], [], resolver);

		// Must not throw.
		renderPlotgrid(host, model);

		// The table renders (scenes exist).
		const table = host.querySelector("[role='table']");
		expect(table).not.toBeNull();

		// Only the corner — no plotline column headers.
		const colHeaders = host.querySelectorAll("[role='columnheader']");
		expect(colHeaders.length).toBe(1);
		expect(colHeaders[0]?.classList.contains("sf-pg-corner")).toBe(true);

		// Both scene rows are present.
		const rowHeaders = host.querySelectorAll("[role='rowheader']");
		expect(rowHeaders.length).toBe(2);
		const texts = Array.from(rowHeaders).map((el) => el.textContent ?? "");
		expect(texts.some((t) => t.includes("S1"))).toBe(true);
		expect(texts.some((t) => t.includes("S2"))).toBe(true);
	});

	// -------------------------------------------------------------------------
	// PG-RO-14: NO write path — clicking a cell does NOT call processFrontMatter
	// -------------------------------------------------------------------------
	it("clicking a filled cell does NOT call processFrontMatter (no write path)", async () => {
		const allPlotlines = [scopeLink("Alpha")];
		const resolve = makeResolver(["Alpha"]);
		const s1 = makeSceneRow({ title: "S1", plotlines: ["[[Alpha]]"] });
		const model = plotgridModelFromScope([s1], allPlotlines, resolve);

		renderPlotgrid(host, model);

		const filledCell = host.querySelector(
			"[data-sf-scene='scenes/S1.md'][data-sf-plotline='Alpha'].sf-pg-cell--filled",
		) as HTMLElement;
		expect(filledCell).not.toBeNull();

		filledCell.click();
		await new Promise<void>((resolve) => setTimeout(resolve, 0));

		expect(vi.mocked(app.fileManager.processFrontMatter)).not.toHaveBeenCalled();
	});

	// -------------------------------------------------------------------------
	// PG-RO-15: NO write path — clicking an empty cell does NOT call processFrontMatter
	// -------------------------------------------------------------------------
	it("clicking an empty cell does NOT call processFrontMatter (no write path)", async () => {
		const allPlotlines = [scopeLink("Alpha"), scopeLink("Beta")];
		const resolve = makeResolver(["Alpha", "Beta"]);
		// S1 is on Alpha only — S1×Beta is empty
		const s1 = makeSceneRow({ title: "S1", plotlines: ["[[Alpha]]"] });
		const model = plotgridModelFromScope([s1], allPlotlines, resolve);

		renderPlotgrid(host, model);

		const emptyCell = host.querySelector(
			"[data-sf-scene='scenes/S1.md'][data-sf-plotline='Beta']:not(.sf-pg-cell--filled)",
		) as HTMLElement;
		expect(emptyCell).not.toBeNull();

		emptyCell.click();
		await new Promise<void>((resolve) => setTimeout(resolve, 0));

		expect(vi.mocked(app.fileManager.processFrontMatter)).not.toHaveBeenCalled();
	});

	// -------------------------------------------------------------------------
	// PG-RO-16: Persistent column — scope plotline with 0 scenes never collapses grid
	// -------------------------------------------------------------------------
	it("scope plotline with 0 scene memberships still has a column (grid never collapses)", () => {
		// Gamma has zero scenes; if it weren't in scope, the old model would lose it.
		const allPlotlines = [scopeLink("Alpha"), scopeLink("Gamma")];
		const resolve = makeResolver(["Alpha", "Gamma"]);

		// Only S1 references Alpha (not Gamma)
		const s1 = makeSceneRow({ title: "S1", plotlines: ["[[Alpha]]"] });
		const model = plotgridModelFromScope([s1], allPlotlines, resolve);

		renderPlotgrid(host, model);

		// Gamma column must be present even though no scene references it
		const gammaHeader = host.querySelector("[data-sf-plotline-col='Gamma']");
		expect(gammaHeader).not.toBeNull();

		// The cell for S1×Gamma must exist and be empty
		const s1GammaCell = host.querySelector(
			"[data-sf-scene='scenes/S1.md'][data-sf-plotline='Gamma']",
		) as HTMLElement;
		expect(s1GammaCell).not.toBeNull();
		expect(s1GammaCell.classList.contains("sf-pg-cell--filled")).toBe(false);
	});

	// -------------------------------------------------------------------------
	// PG-RO-17: Cells do NOT have role="gridcell" (read-only — no interactive semantics)
	// -------------------------------------------------------------------------
	it("cells have role='cell' (read-only), not 'gridcell' (interactive)", () => {
		const allPlotlines = [scopeLink("Alpha")];
		const resolve = makeResolver(["Alpha"]);
		const s1 = makeSceneRow({ title: "S1", plotlines: ["[[Alpha]]"] });
		const model = plotgridModelFromScope([s1], allPlotlines, resolve);

		renderPlotgrid(host, model);

		// No gridcell roles (that implies interactive toggle semantics)
		const gridcells = host.querySelectorAll("[role='gridcell']");
		expect(gridcells.length).toBe(0);

		// Cells have role='cell'
		const cells = host.querySelectorAll("[role='cell']");
		expect(cells.length).toBeGreaterThan(0);
	});

	// -------------------------------------------------------------------------
	// PG-RO-18: No aria-checked on cells (read-only — no toggle semantics)
	// -------------------------------------------------------------------------
	it("cells do NOT have aria-checked (no toggle semantics in read-only view)", () => {
		const allPlotlines = [scopeLink("Alpha")];
		const resolve = makeResolver(["Alpha"]);
		const s1 = makeSceneRow({ title: "S1", plotlines: ["[[Alpha]]"] });
		const model = plotgridModelFromScope([s1], allPlotlines, resolve);

		renderPlotgrid(host, model);

		const ariaCheckedCells = host.querySelectorAll("[aria-checked]");
		expect(ariaCheckedCells.length).toBe(0);
	});
});
