/**
 * renderTimeline.swimlane.test.ts — swimlane COLUMNS grid (M6 rework, mockup M2).
 *
 * Swimlane is a CSS grid: COLUMNS per group value (lane per POV/location/plotline
 * + neutral + unresolved), ROWS per scene grouped by act with full-width act
 * dividers. A scene's mini-card sits in its group column(s) (fan-out for plotline);
 * other cells empty. Sequence axis in col 1. Read-only (drill only, no writes).
 * Rail-mode tests live in renderTimeline.test.ts and must stay green.
 *
 * @ref docs/XDD/specs/007-interactive-views/solution.md — ADR-20
 */

import { describe, it, expect } from "vitest";
import { augmentEl, createMockTFile } from "../__mocks__/obsidian";
import { swimlaneGrid, type SceneRow, type LinkResolver } from "workspace/workspaceModel";
import { renderTimeline } from "workspace/renderTimeline";

function host(): HTMLElement {
	return augmentEl(document.createElement("div"));
}

function row(o: Partial<SceneRow> & { title: string }): SceneRow {
	return {
		file: createMockTFile({ basename: o.title, path: `${o.title}.md` }),
		title: o.title,
		act: o.act ?? null,
		order: o.order ?? null,
		storyDay: o.storyDay ?? null,
		when: o.when ?? "",
		status: o.status ?? "",
		pov: o.pov ?? null,
		location: o.location ?? null,
		characters: o.characters ?? [],
		plotline: o.plotline ?? null,
		plotlines: o.plotlines ?? [],
		beat: o.beat ?? "",
		beatName: o.beatName ?? "",
		beatPath: o.beatPath ?? "",
		wordcount: o.wordcount ?? null,
	};
}

const expanded = { isCollapsed: () => false };

/** Render swimlane grid mode with the grid derived from rows. */
function renderGrid(el: HTMLElement, rows: SceneRow[], key: Parameters<typeof swimlaneGrid>[1], resolve?: LinkResolver): void {
	renderTimeline(el, [], expanded, "swimlane", { swimlane: swimlaneGrid(rows, key, resolve) });
}

describe("renderTimeline (swimlane columns grid)", () => {
	it("does not throw for an empty grid", () => {
		const el = host();
		expect(() => renderGrid(el, [], "pov")).not.toThrow();
	});

	it("renders an empty-state when there are no scenes", () => {
		const el = host();
		renderGrid(el, [], "pov");
		expect(el.querySelector(".sf-emptyline")).not.toBeNull();
	});

	it("renders a grid with one column per group value (pov) as sticky lane headers", () => {
		const el = host();
		const rows = [
			row({ title: "S1", act: 1, order: 10, pov: { name: "Alice", path: "Alice.md" } }),
			row({ title: "S2", act: 1, order: 20, pov: { name: "Bob", path: "Bob.md" } }),
		];
		renderGrid(el, rows, "pov");

		const grid = el.querySelector(".sf-sw-grid") as HTMLElement | null;
		expect(grid).not.toBeNull();
		// Column template (seq axis + 2 lanes) driven via the --sf-sw-cols custom prop.
		expect(grid!.style.getPropertyValue("--sf-sw-cols")).toContain("repeat(2,");

		const heads = [...el.querySelectorAll(".sf-sw-lanehead")].map((h) => h.textContent);
		expect(heads).toEqual(["Alice", "Bob"]);
		// A sticky corner cell.
		expect(el.querySelector(".sf-sw-corner")).not.toBeNull();
	});

	it("renders one row per scene with a sequence cell", () => {
		const el = host();
		const rows = [
			row({ title: "S1", act: 1, order: 10, storyDay: 1, pov: { name: "Alice", path: "Alice.md" } }),
			row({ title: "S2", act: 1, order: 20, storyDay: 2, pov: { name: "Alice", path: "Alice.md" } }),
		];
		renderGrid(el, rows, "pov");
		const seqCells = el.querySelectorAll(".sf-sw-seq");
		expect(seqCells.length).toBe(2);
		// First sequence cell shows index 1 and a storyDay badge.
		expect(el.querySelector(".sf-sw-seqn")?.textContent).toBe("1");
		expect(el.querySelector(".sf-sw-seqwhen")?.textContent).toBe("D1");
	});

	it("places a scene's mini-card in its group column (drill link present)", () => {
		const el = host();
		const rows = [row({ title: "TheScene", act: 1, pov: { name: "Alice", path: "Alice.md" } })];
		renderGrid(el, rows, "pov");

		const mini = el.querySelector(".sf-sw-mini") as HTMLElement | null;
		expect(mini).not.toBeNull();
		const link = mini!.querySelector(".sf-sw-mini-title") as HTMLElement | null;
		expect(link!.getAttribute("data-sf-link")).toBe("TheScene.md");
		expect(link!.getAttribute("role")).toBe("link");

		// One lane => one filled cell, no empty cells besides the (single) lane.
		expect(el.querySelectorAll(".sf-sw-mini").length).toBe(1);
	});

	it("fans a multi-plotline scene into each plotline column", () => {
		const el = host();
		const scene = row({ title: "FanScene", act: 1, plotlines: ["PlotA", "PlotB"] });
		const resolve: LinkResolver = (t) => (["PlotA", "PlotB"].includes(t) ? { basename: t } : null);
		renderGrid(el, [scene], "plotline", resolve);

		const heads = [...el.querySelectorAll(".sf-sw-lanehead")].map((h) => h.textContent);
		expect(heads).toContain("PlotA");
		expect(heads).toContain("PlotB");
		// The mini-card appears in BOTH plotline columns.
		expect(el.querySelectorAll(".sf-sw-mini").length).toBe(2);

		// Positional check: the grid has 2 lanes (PlotA col 0, PlotB col 1 after
		// name-ascending sort). Children: [0] corner, [1] PlotA-head, [2] PlotB-head,
		// [3] act-divider, [4] seq-cell, [5] PlotA-cell, [6] PlotB-cell.
		// Both PlotA and PlotB cells must contain a mini-card; no other cell type
		// receives one.
		const grid = el.querySelector(".sf-sw-grid")!;
		const kids = [...grid.children];
		const plotACell = kids[5]!;
		const plotBCell = kids[6]!;
		expect(plotACell.querySelector(".sf-sw-mini")).not.toBeNull();
		expect(plotBCell.querySelector(".sf-sw-mini")).not.toBeNull();
	});

	it("leaves other lane cells empty (no mini-card) for a single-lane scene", () => {
		const el = host();
		// Alice (col 0) and Bob (col 1) — swimlaneModel sorts by name ascending.
		const alice = row({ title: "S1", act: 1, order: 10, pov: { name: "Alice", path: "Alice.md" } });
		const bob   = row({ title: "S2", act: 1, order: 20, pov: { name: "Bob",   path: "Bob.md"   } });
		renderGrid(el, [alice, bob], "pov");

		// Overall counts are unchanged.
		expect(el.querySelectorAll(".sf-sw-cell").length).toBe(4);
		expect(el.querySelectorAll(".sf-sw-mini").length).toBe(2);

		// Grid children order (all direct children of .sf-sw-grid):
		//   [0] corner, [1] Alice-head, [2] Bob-head,
		//   [3] act-divider,
		//   [4] seq-S1, [5] S1-cell-Alice, [6] S1-cell-Bob,
		//   [7] seq-S2, [8] S2-cell-Alice, [9] S2-cell-Bob.
		const grid = el.querySelector(".sf-sw-grid")!;
		const kids = [...grid.children];

		// Alice's scene (S1) occupies Alice's column cell → has a mini-card.
		const s1AliceCell = kids[5]!;
		expect(s1AliceCell.querySelector(".sf-sw-mini")).not.toBeNull();
		// Bob's column cell for S1's row → empty.
		const s1BobCell = kids[6]!;
		expect(s1BobCell.querySelector(".sf-sw-mini")).toBeNull();

		// Bob's scene (S2) occupies Bob's column cell → has a mini-card.
		const s2BobCell = kids[9]!;
		expect(s2BobCell.querySelector(".sf-sw-mini")).not.toBeNull();
		// Alice's column cell for S2's row → empty.
		const s2AliceCell = kids[8]!;
		expect(s2AliceCell.querySelector(".sf-sw-mini")).toBeNull();
	});

	it("renders full-width act-divider rows spanning all columns", () => {
		const el = host();
		const rows = [
			row({ title: "S1", act: 1, order: 10, beatName: "Setup", beatPath: "Setup.md", pov: { name: "A", path: "A.md" } }),
			row({ title: "S2", act: 2, order: 20, pov: { name: "A", path: "A.md" } }),
		];
		renderGrid(el, rows, "pov");

		const dividers = [...el.querySelectorAll(".sf-sw-actrow")] as HTMLElement[];
		expect(dividers.length).toBe(2);
		// Full-width span comes from the .sf-sw-actrow class (grid-column: 1 / -1).
		expect(dividers[0]!.classList.contains("sf-sw-actrow")).toBe(true);
		expect(dividers[0]!.textContent).toContain("Act 1");
		// Beat-resolved act label drills.
		expect(dividers[0]!.getAttribute("data-sf-link")).toBe("Setup.md");
	});

	it("renders a neutral column for scenes with no POV", () => {
		const el = host();
		const rows = [row({ title: "NoPov", act: 1, pov: null })];
		renderGrid(el, rows, "pov");
		const heads = [...el.querySelectorAll(".sf-sw-lanehead")].map((h) => h.textContent);
		expect(heads).toContain("No POV");
		expect(el.querySelector(".sf-sw-lanehead--neutral")).not.toBeNull();
		expect(el.querySelector(".sf-sw-mini-title")?.getAttribute("data-sf-link")).toBe("NoPov.md");
	});

	it("flags an unresolved plotline column", () => {
		const el = host();
		const resolve: LinkResolver = (t) => (t === "Known" ? { basename: "Known" } : null);
		const rows = [row({ title: "S1", act: 1, plotlines: ["Ghost"] })];
		renderGrid(el, rows, "plotline", resolve);
		const unres = el.querySelector(".sf-sw-lanehead--unresolved");
		expect(unres).not.toBeNull();
		expect(unres!.textContent).toBe("Ghost");
	});

	it("renders status badge inside the mini-card", () => {
		const el = host();
		const rows = [row({ title: "Sc", act: 1, status: "draft", when: "Night 1", pov: { name: "X", path: "X.md" } })];
		renderGrid(el, rows, "pov");
		expect(el.querySelector(".sf-tl-st--draft")).not.toBeNull();
		expect(el.querySelector(".sf-sw-mini-when")?.textContent).toBe("Night 1");
	});

	it("is read-only: drill links only, no buttons or inputs", () => {
		const el = host();
		const rows = [row({ title: "S1", act: 1, pov: { name: "A", path: "A.md" } })];
		renderGrid(el, rows, "pov");
		const link = el.querySelector(".sf-sw-mini-title");
		expect(link!.getAttribute("role")).toBe("link");
		expect(el.querySelector("button")).toBeNull();
		expect(el.querySelector("input")).toBeNull();
	});
});
