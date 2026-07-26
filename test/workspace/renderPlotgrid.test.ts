/**
 * renderPlotgrid.test.ts — T5.2 (M3 orientation: rows=scenes, columns=plotlines)
 *
 * Tests for renderPlotgrid: scenes×plotlines layout, click/Space/Enter toggle,
 * plotline colour coding, filled-cell status+when content, unresolved-column
 * non-interactive, sibling fields untouched, keyboard parity, rollback on
 * write failure.
 *
 * Design Clarification 2: Plotgrid uses a click-toggle (not the drag machine).
 * Writes via commit(app, file, "plotlines", newArray, {name:"plotlines",type:"list"}).
 * Listeners registered via registerDomEvent on a passed Component for lifecycle cleanup.
 *
 * @ref docs/XDD/specs/007-interactive-views/plan/phase-5.md — T5.2
 * @ref docs/XDD/specs/007-interactive-views/solution.md — AC-3/AC-4/AC-F2.*
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, Component, createMockTFile, augmentEl } from "../__mocks__/obsidian";
import { renderPlotgrid, type PlotgridDeps } from "workspace/renderPlotgrid";
import { plotgridModel } from "workspace/workspaceModel";
import type { SceneRow, LinkResolver } from "workspace/workspaceModel";

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

/** Resolver that resolves plotline text to a basename if it's in the known set. */
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

describe("renderPlotgrid", () => {
	let app: App;
	let host: HTMLElement;
	let component: Component;
	let onAfter: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		app = new App();
		host = makeHost();
		component = new Component();
		onAfter = vi.fn();
	});

	afterEach(() => {
		component.unload();
		if (host.parentNode) host.parentNode.removeChild(host);
	});

	// -------------------------------------------------------------------------
	// T5.2-1: Scenes are rows, plotlines are columns (role=table / columnheader /
	//          rowheader / gridcell / aria-checked)
	// -------------------------------------------------------------------------
	it("renders scene rows × plotline columns: rowheaders are scenes, columnheaders are plotlines", () => {
		const s1 = makeSceneRow({ title: "S1", plotlines: ["[[Alpha]]"] });
		const s2 = makeSceneRow({ title: "S2", plotlines: ["[[Beta]]"] });
		const resolver = makeResolver(["Alpha", "Beta"]);
		const model = plotgridModel([s1, s2], resolver);
		const deps: PlotgridDeps = { app, component, onAfter };

		renderPlotgrid(host, model, deps);

		// role=table must be present
		const table = host.querySelector("[role='table']");
		expect(table).not.toBeNull();

		// Column headers: one per plotline (Alpha, Beta) + corner
		const colHeaders = host.querySelectorAll("[role='columnheader']");
		// corner + Alpha + Beta = 3
		expect(colHeaders.length).toBe(3);

		// Row headers: one per scene (S1, S2)
		const rowHeaders = host.querySelectorAll("[role='rowheader']");
		expect(rowHeaders.length).toBe(2);

		// Column headers should contain plotline names
		const colHeaderTexts = Array.from(colHeaders).map((el) => el.textContent ?? "");
		expect(colHeaderTexts.some((t) => t.includes("Alpha"))).toBe(true);
		expect(colHeaderTexts.some((t) => t.includes("Beta"))).toBe(true);

		// Row headers should contain scene titles
		const rowHeaderTexts = Array.from(rowHeaders).map((el) => el.textContent ?? "");
		expect(rowHeaderTexts.some((t) => t.includes("S1"))).toBe(true);
		expect(rowHeaderTexts.some((t) => t.includes("S2"))).toBe(true);

		// gridcell elements: 2 scenes × 2 plotlines = 4 cells
		const cells = host.querySelectorAll("[role='gridcell']");
		expect(cells.length).toBe(4);

		// aria-checked on cells
		const checkedCells = host.querySelectorAll("[aria-checked='true']");
		expect(checkedCells.length).toBeGreaterThan(0);
	});

	// -------------------------------------------------------------------------
	// T5.2-2: Structural position — S1×Alpha is filled, S1×Beta is empty
	// -------------------------------------------------------------------------
	it("correctly marks filled vs empty cells for scene×plotline membership", () => {
		// S1 is on Alpha only; S2 is on Beta only
		const s1 = makeSceneRow({ title: "S1", plotlines: ["[[Alpha]]"] });
		const s2 = makeSceneRow({ title: "S2", plotlines: ["[[Beta]]"] });
		const resolver = makeResolver(["Alpha", "Beta"]);
		const model = plotgridModel([s1, s2], resolver);
		const deps: PlotgridDeps = { app, component, onAfter };

		renderPlotgrid(host, model, deps);

		// S1×Alpha: filled
		const s1Alpha = host.querySelector(
			"[role='gridcell'][data-sf-scene='scenes/S1.md'][data-sf-plotline='Alpha']",
		) as HTMLElement;
		expect(s1Alpha).not.toBeNull();
		expect(s1Alpha.getAttribute("aria-checked")).toBe("true");
		expect(s1Alpha.classList.contains("sf-pg-cell--filled")).toBe(true);

		// S1×Beta: empty
		const s1Beta = host.querySelector(
			"[role='gridcell'][data-sf-scene='scenes/S1.md'][data-sf-plotline='Beta']",
		) as HTMLElement;
		expect(s1Beta).not.toBeNull();
		expect(s1Beta.getAttribute("aria-checked")).toBe("false");
		expect(s1Beta.classList.contains("sf-pg-cell--filled")).toBe(false);

		// S2×Alpha: empty
		const s2Alpha = host.querySelector(
			"[role='gridcell'][data-sf-scene='scenes/S2.md'][data-sf-plotline='Alpha']",
		) as HTMLElement;
		expect(s2Alpha).not.toBeNull();
		expect(s2Alpha.getAttribute("aria-checked")).toBe("false");

		// S2×Beta: filled
		const s2Beta = host.querySelector(
			"[role='gridcell'][data-sf-scene='scenes/S2.md'][data-sf-plotline='Beta']",
		) as HTMLElement;
		expect(s2Beta).not.toBeNull();
		expect(s2Beta.getAttribute("aria-checked")).toBe("true");
	});

	// -------------------------------------------------------------------------
	// T5.2-3: Filled cell shows status + when content
	// -------------------------------------------------------------------------
	it("filled cell contains status and when text", () => {
		const s1 = makeSceneRow({
			title: "S1",
			plotlines: ["[[Alpha]]"],
			status: "Draft",
			when: "Night 1",
		});
		const resolver = makeResolver(["Alpha"]);
		const model = plotgridModel([s1], resolver);
		const deps: PlotgridDeps = { app, component, onAfter };

		renderPlotgrid(host, model, deps);

		const filledCell = host.querySelector(
			"[role='gridcell'][aria-checked='true'][data-sf-scene='scenes/S1.md'][data-sf-plotline='Alpha']",
		) as HTMLElement;
		expect(filledCell).not.toBeNull();

		// Should contain status text somewhere inside
		expect(filledCell.textContent).toContain("Draft");
		// Should contain when text somewhere inside
		expect(filledCell.textContent).toContain("Night 1");
	});

	// -------------------------------------------------------------------------
	// T5.2-4: Plotline column headers are colour-coded
	// -------------------------------------------------------------------------
	it("plotline column headers have a colour dot (data-driven colour)", () => {
		const s1 = makeSceneRow({ title: "S1", plotlines: ["[[Alpha]]"] });
		const resolver = makeResolver(["Alpha"]);
		const model = plotgridModel([s1], resolver);
		const deps: PlotgridDeps = { app, component, onAfter };

		renderPlotgrid(host, model, deps);

		// The column header for Alpha should have a colour dot element
		const colDot = host.querySelector(".sf-pg-col-dot") as HTMLElement;
		expect(colDot).not.toBeNull();
		// The dot should have an inline background color
		expect(colDot.style.background).not.toBe("");
	});

	// -------------------------------------------------------------------------
	// T5.2-5: Row header contains scene order + title as drill link
	// -------------------------------------------------------------------------
	it("row header shows scene title as a drill link (data-sf-link)", () => {
		const s1 = makeSceneRow({ title: "S1", order: 3, plotlines: ["[[Alpha]]"] });
		const resolver = makeResolver(["Alpha"]);
		const model = plotgridModel([s1], resolver);
		const deps: PlotgridDeps = { app, component, onAfter };

		renderPlotgrid(host, model, deps);

		const drillSpan = host.querySelector("[role='rowheader'] [data-sf-link]") as HTMLElement;
		expect(drillSpan).not.toBeNull();
		expect(drillSpan.getAttribute("data-sf-link")).toBe("scenes/S1.md");
		expect(drillSpan.textContent).toContain("S1");
		// order=3 should appear in the label
		expect(drillSpan.textContent).toContain("3");
	});

	// -------------------------------------------------------------------------
	// T5.2-6: Empty cell click → appends plotline to scene's plotlines
	// -------------------------------------------------------------------------
	it("clicking an empty cell appends the plotline to scene plotlines", async () => {
		const s1 = makeSceneRow({ title: "S1", plotlines: [] });
		const resolver = makeResolver(["Alpha"]);

		const s1file = createMockTFile({ path: "scenes/S1.md", basename: "S1" });
		app.fileManager._setFrontmatter("scenes/S1.md", {
			plotlines: [],
			status: "draft",
			storyDay: 3,
		});

		// S2 carries Alpha so the plotline appears in the model's axis
		const s2 = makeSceneRow({ title: "S2", plotlines: ["[[Alpha]]"] });
		const s2file = createMockTFile({ path: "scenes/S2.md", basename: "S2" });
		app.fileManager._setFrontmatter("scenes/S2.md", { plotlines: ["[[Alpha]]"] });

		const model = plotgridModel(
			[{ ...s1, file: s1file }, { ...s2, file: s2file }],
			resolver,
		);

		const deps: PlotgridDeps = { app, component, onAfter };
		renderPlotgrid(host, model, deps);

		// Find the empty cell for S1×Alpha
		const emptyCell = host.querySelector(
			"[role='gridcell'][aria-checked='false'][data-sf-scene='scenes/S1.md'][data-sf-plotline='Alpha']",
		) as HTMLElement;
		expect(emptyCell).not.toBeNull();

		emptyCell.click();
		await Promise.resolve();

		// Frontmatter should now include Alpha
		const fm = app.fileManager._getFrontmatter("scenes/S1.md");
		const plotlines = fm["plotlines"] as string[];
		expect(plotlines).toBeDefined();
		expect(plotlines.some((pl: string) => pl.includes("Alpha"))).toBe(true);
	});

	// -------------------------------------------------------------------------
	// T5.2-7: Filled cell click → removes plotline preserving order
	// -------------------------------------------------------------------------
	it("clicking a filled cell removes the plotline preserving remaining order", async () => {
		const s1 = makeSceneRow({
			title: "S1",
			plotlines: ["[[Alpha]]", "[[Beta]]"],
		});
		const s1file = createMockTFile({ path: "scenes/S1.md", basename: "S1" });
		app.fileManager._setFrontmatter("scenes/S1.md", {
			plotlines: ["[[Alpha]]", "[[Beta]]"],
			status: "draft",
		});

		const resolver = makeResolver(["Alpha", "Beta"]);
		const model = plotgridModel([{ ...s1, file: s1file }], resolver);
		const deps: PlotgridDeps = { app, component, onAfter };
		renderPlotgrid(host, model, deps);

		// Click the filled Alpha cell
		const filledCell = host.querySelector(
			"[role='gridcell'][aria-checked='true'][data-sf-scene='scenes/S1.md'][data-sf-plotline='Alpha']",
		) as HTMLElement;
		expect(filledCell).not.toBeNull();

		filledCell.click();
		await Promise.resolve();

		// Alpha removed, Beta remains
		const fm = app.fileManager._getFrontmatter("scenes/S1.md");
		const plotlines = fm["plotlines"] as string[];
		expect(plotlines.some((pl: string) => pl.includes("Alpha"))).toBe(false);
		expect(plotlines.some((pl: string) => pl.includes("Beta"))).toBe(true);
	});

	// -------------------------------------------------------------------------
	// T5.2-8: Unresolved plotline column — cells are non-interactive
	// -------------------------------------------------------------------------
	it("unresolved plotline column cells are aria-disabled and do not write on click", async () => {
		// Resolver resolves nothing → all plotlines unresolved
		const resolver: LinkResolver = (_text) => null;
		const s1 = makeSceneRow({ title: "S1", plotlines: ["[[Unknown]]"] });
		const s1file = createMockTFile({ path: "scenes/S1.md", basename: "S1" });
		app.fileManager._setFrontmatter("scenes/S1.md", { plotlines: ["[[Unknown]]"] });

		const model = plotgridModel([{ ...s1, file: s1file }], resolver);
		const deps: PlotgridDeps = { app, component, onAfter };
		renderPlotgrid(host, model, deps);

		// Cells in unresolved columns have aria-disabled
		const unresolvedCell = host.querySelector(
			"[data-sf-plotline='Unknown']",
		) as HTMLElement;
		expect(unresolvedCell).not.toBeNull();
		expect(unresolvedCell.getAttribute("aria-disabled")).toBe("true");

		// Click should NOT trigger a write
		unresolvedCell.click();
		await Promise.resolve();

		expect(vi.mocked(app.fileManager.processFrontMatter)).not.toHaveBeenCalled();
	});

	// -------------------------------------------------------------------------
	// T5.2-9: Keyboard Space key toggle — same as click
	// -------------------------------------------------------------------------
	it("Space key on a filled cell removes the plotline (keyboard parity)", async () => {
		const s1 = makeSceneRow({ title: "S1", plotlines: ["[[Alpha]]"] });
		const s1file = createMockTFile({ path: "scenes/S1.md", basename: "S1" });
		app.fileManager._setFrontmatter("scenes/S1.md", {
			plotlines: ["[[Alpha]]"],
		});

		const resolver = makeResolver(["Alpha"]);
		const model = plotgridModel([{ ...s1, file: s1file }], resolver);
		const deps: PlotgridDeps = { app, component, onAfter };
		renderPlotgrid(host, model, deps);

		const filledCell = host.querySelector(
			"[role='gridcell'][aria-checked='true'][data-sf-scene='scenes/S1.md'][data-sf-plotline='Alpha']",
		) as HTMLElement;
		expect(filledCell).not.toBeNull();

		filledCell.dispatchEvent(new KeyboardEvent("keydown", {
			key: " ",
			bubbles: true,
			cancelable: true,
		}));
		await Promise.resolve();

		// Alpha removed
		const fm = app.fileManager._getFrontmatter("scenes/S1.md");
		const plotlines = fm["plotlines"] as string[];
		expect(plotlines.some((pl: string) => pl.includes("Alpha"))).toBe(false);
	});

	// -------------------------------------------------------------------------
	// T5.2-10: Keyboard Enter toggle — same as click
	// -------------------------------------------------------------------------
	it("Enter key on an empty cell appends the plotline (keyboard parity)", async () => {
		const s1 = makeSceneRow({ title: "S1", plotlines: [] });
		const s2 = makeSceneRow({ title: "S2", plotlines: ["[[Alpha]]"] });
		const s1file = createMockTFile({ path: "scenes/S1.md", basename: "S1" });
		const s2file = createMockTFile({ path: "scenes/S2.md", basename: "S2" });
		app.fileManager._setFrontmatter("scenes/S1.md", { plotlines: [] });
		app.fileManager._setFrontmatter("scenes/S2.md", { plotlines: ["[[Alpha]]"] });

		const resolver = makeResolver(["Alpha"]);
		const model = plotgridModel(
			[{ ...s1, file: s1file }, { ...s2, file: s2file }],
			resolver,
		);
		const deps: PlotgridDeps = { app, component, onAfter };
		renderPlotgrid(host, model, deps);

		const emptyCell = host.querySelector(
			"[role='gridcell'][aria-checked='false'][data-sf-scene='scenes/S1.md'][data-sf-plotline='Alpha']",
		) as HTMLElement;
		expect(emptyCell).not.toBeNull();

		emptyCell.dispatchEvent(new KeyboardEvent("keydown", {
			key: "Enter",
			bubbles: true,
			cancelable: true,
		}));
		await Promise.resolve();

		const fm = app.fileManager._getFrontmatter("scenes/S1.md");
		const plotlines = fm["plotlines"] as string[];
		expect(plotlines.some((pl: string) => pl.includes("Alpha"))).toBe(true);
	});

	// -------------------------------------------------------------------------
	// T5.2-11: Sibling fields untouched (status, storyDay unchanged)
	// -------------------------------------------------------------------------
	it("only plotlines field changes on toggle — sibling fields untouched", async () => {
		const s1 = makeSceneRow({ title: "S1", plotlines: ["[[Alpha]]"] });
		const s1file = createMockTFile({ path: "scenes/S1.md", basename: "S1" });
		app.fileManager._setFrontmatter("scenes/S1.md", {
			plotlines: ["[[Alpha]]"],
			status: "done",
			storyDay: 7,
			pov: "[[Hero]]",
		});

		const resolver = makeResolver(["Alpha"]);
		const model = plotgridModel([{ ...s1, file: s1file }], resolver);
		const deps: PlotgridDeps = { app, component, onAfter };
		renderPlotgrid(host, model, deps);

		// Click the filled Alpha cell to remove it
		const filledCell = host.querySelector(
			"[role='gridcell'][aria-checked='true'][data-sf-scene='scenes/S1.md'][data-sf-plotline='Alpha']",
		) as HTMLElement;
		filledCell.click();
		await Promise.resolve();

		const fm = app.fileManager._getFrontmatter("scenes/S1.md");
		// Only plotlines should change
		expect(fm["status"]).toBe("done");
		expect(fm["storyDay"]).toBe(7);
		expect(fm["pov"]).toBe("[[Hero]]");
		// plotlines should now be empty (Alpha removed)
		expect((fm["plotlines"] as string[]).some((pl: string) => pl.includes("Alpha"))).toBe(false);
	});

	// -------------------------------------------------------------------------
	// T5.2-12: Toggle to zero plotlines works (scene can have empty plotlines)
	// -------------------------------------------------------------------------
	it("toggling last plotline off results in empty plotlines array (no crash)", async () => {
		const s1 = makeSceneRow({ title: "S1", plotlines: ["[[Alpha]]"] });
		const s1file = createMockTFile({ path: "scenes/S1.md", basename: "S1" });
		app.fileManager._setFrontmatter("scenes/S1.md", { plotlines: ["[[Alpha]]"] });

		const resolver = makeResolver(["Alpha"]);
		const model = plotgridModel([{ ...s1, file: s1file }], resolver);
		const deps: PlotgridDeps = { app, component, onAfter };
		renderPlotgrid(host, model, deps);

		const filledCell = host.querySelector(
			"[role='gridcell'][aria-checked='true'][data-sf-scene='scenes/S1.md'][data-sf-plotline='Alpha']",
		) as HTMLElement;
		expect(filledCell).not.toBeNull();
		filledCell.click();
		await Promise.resolve();

		const fm = app.fileManager._getFrontmatter("scenes/S1.md");
		const plotlines = fm["plotlines"] as string[];
		expect(Array.isArray(plotlines)).toBe(true);
		expect(plotlines.length).toBe(0);
	});

	// -------------------------------------------------------------------------
	// T5.2-13: onAfter is called after a successful write
	// -------------------------------------------------------------------------
	it("onAfter is called after a successful toggle write", async () => {
		const s1 = makeSceneRow({ title: "S1", plotlines: ["[[Alpha]]"] });
		const s1file = createMockTFile({ path: "scenes/S1.md", basename: "S1" });
		app.fileManager._setFrontmatter("scenes/S1.md", { plotlines: ["[[Alpha]]"] });

		const resolver = makeResolver(["Alpha"]);
		const model = plotgridModel([{ ...s1, file: s1file }], resolver);
		const deps: PlotgridDeps = { app, component, onAfter };
		renderPlotgrid(host, model, deps);

		const filledCell = host.querySelector(
			"[role='gridcell'][aria-checked='true']",
		) as HTMLElement;
		filledCell.click();

		// commit() is async (processFrontMatter → promise chain). Drain microtasks.
		await new Promise<void>((resolve) => setTimeout(resolve, 0));

		expect(onAfter).toHaveBeenCalledOnce();
	});

	// -------------------------------------------------------------------------
	// T5.2-14: Empty scope → empty-state
	// -------------------------------------------------------------------------
	it("empty model → renders empty-state message", () => {
		const resolver = makeResolver([]);
		const model = plotgridModel([], resolver);
		const deps: PlotgridDeps = { app, component, onAfter };
		renderPlotgrid(host, model, deps);

		const emptyLine = host.querySelector(".sf-emptyline");
		expect(emptyLine).not.toBeNull();
	});

	// -------------------------------------------------------------------------
	// T5.2-15: processFrontMatter is the write path (single writer seam)
	// -------------------------------------------------------------------------
	it("uses processFrontMatter as the single write path — not raw DOM mutations", async () => {
		const s1 = makeSceneRow({ title: "S1", plotlines: ["[[Alpha]]"] });
		const s1file = createMockTFile({ path: "scenes/S1.md", basename: "S1" });
		app.fileManager._setFrontmatter("scenes/S1.md", { plotlines: ["[[Alpha]]"] });

		const resolver = makeResolver(["Alpha"]);
		const model = plotgridModel([{ ...s1, file: s1file }], resolver);
		const deps: PlotgridDeps = { app, component, onAfter };
		renderPlotgrid(host, model, deps);

		const filledCell = host.querySelector(
			"[role='gridcell'][aria-checked='true']",
		) as HTMLElement;
		filledCell.click();
		await Promise.resolve();

		// commit() calls processFrontMatter exactly once
		expect(vi.mocked(app.fileManager.processFrontMatter)).toHaveBeenCalledOnce();
	});

	// -------------------------------------------------------------------------
	// T5.2-16: Interactive cells have tabindex=0 for keyboard reachability (a11y)
	// -------------------------------------------------------------------------
	it("interactive cells have tabindex='0' for keyboard accessibility", () => {
		const s1 = makeSceneRow({ title: "S1", plotlines: ["[[Alpha]]"] });
		const resolver = makeResolver(["Alpha"]);
		const model = plotgridModel([s1], resolver);
		const deps: PlotgridDeps = { app, component, onAfter };
		renderPlotgrid(host, model, deps);

		const cells = host.querySelectorAll("[role='gridcell']");
		const interactiveCells = Array.from(cells).filter(
			(c) => c.getAttribute("aria-disabled") !== "true",
		);
		expect(interactiveCells.length).toBeGreaterThan(0);
		for (const cell of interactiveCells) {
			expect(cell.getAttribute("tabindex")).toBe("0");
		}
	});

	// -------------------------------------------------------------------------
	// T5.2-17: Rollback on write failure — optimistic flip is reverted
	// -------------------------------------------------------------------------
	it("rolls back the optimistic cell flip when the write fails", async () => {
		const s1 = makeSceneRow({ title: "S1", plotlines: ["[[Alpha]]"] });
		const s1file = createMockTFile({ path: "scenes/S1.md", basename: "S1" });
		app.fileManager._setFrontmatter("scenes/S1.md", { plotlines: ["[[Alpha]]"] });

		// Make processFrontMatter reject to simulate write failure
		vi.mocked(app.fileManager.processFrontMatter).mockRejectedValueOnce(
			new Error("simulated write failure"),
		);

		const resolver = makeResolver(["Alpha"]);
		const model = plotgridModel([{ ...s1, file: s1file }], resolver);
		const deps: PlotgridDeps = { app, component, onAfter };
		renderPlotgrid(host, model, deps);

		// Find the filled Alpha cell (aria-checked=true, sf-pg-cell--filled)
		const filledCell = host.querySelector(
			"[role='gridcell'][aria-checked='true'][data-sf-scene='scenes/S1.md'][data-sf-plotline='Alpha']",
		) as HTMLElement;
		expect(filledCell).not.toBeNull();
		expect(filledCell.classList.contains("sf-pg-cell--filled")).toBe(true);

		// Record pre-click state
		const priorChecked = filledCell.getAttribute("aria-checked");
		const priorFilled = filledCell.classList.contains("sf-pg-cell--filled");

		// Click — triggers optimistic flip then async write failure
		filledCell.click();

		// Let the optimistic flip happen (sync), then drain the rejected promise
		await new Promise<void>((resolve) => setTimeout(resolve, 0));

		// After failure, aria-checked and class must revert to their pre-click values
		expect(filledCell.getAttribute("aria-checked")).toBe(priorChecked);
		expect(filledCell.classList.contains("sf-pg-cell--filled")).toBe(priorFilled);

		// onAfter must NOT have been called (write did not succeed)
		expect(onAfter).not.toHaveBeenCalled();
	});

	// -------------------------------------------------------------------------
	// T5.2-18: Corner cell is labelled "Plotgrid"
	// -------------------------------------------------------------------------
	it("corner cell contains 'Plotgrid' label", () => {
		const s1 = makeSceneRow({ title: "S1", plotlines: ["[[Alpha]]"] });
		const resolver = makeResolver(["Alpha"]);
		const model = plotgridModel([s1], resolver);
		const deps: PlotgridDeps = { app, component, onAfter };

		renderPlotgrid(host, model, deps);

		const corner = host.querySelector(".sf-pg-corner");
		expect(corner).not.toBeNull();
		expect(corner?.textContent).toContain("Plotgrid");
	});

	// -------------------------------------------------------------------------
	// T5.2-19: Unresolved column header is muted/flagged
	// -------------------------------------------------------------------------
	it("unresolved plotline column header has the unresolved modifier class", () => {
		const resolver: LinkResolver = (_text) => null;
		const s1 = makeSceneRow({ title: "S1", plotlines: ["[[Phantom]]"] });
		const model = plotgridModel([s1], resolver);
		const deps: PlotgridDeps = { app, component, onAfter };

		renderPlotgrid(host, model, deps);

		// Header for the unresolved plotline should have the --unresolved class
		const unresolvedHeader = host.querySelector(".sf-pg-col-head--unresolved");
		expect(unresolvedHeader).not.toBeNull();
		expect(unresolvedHeader?.getAttribute("data-sf-plotline-col")).toBe("Phantom");
	});
});
