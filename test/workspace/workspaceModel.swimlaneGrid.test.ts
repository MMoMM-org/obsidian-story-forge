/**
 * workspaceModel.swimlaneGrid.test.ts — RED tests for the swimlane COLUMNS grid (M6 rework, M2).
 *
 * swimlaneGrid(rows, key, resolve) returns:
 *  - lanes:   {key,label,kind}[] — the group VALUES as columns, in swimlaneModel order
 *  - actRows: {act,label,scenes}[] — scenes grouped by act in timeline order (timelineModel)
 *  - laneOf(scene): string[] — the lane key(s) a scene belongs to (fan-out for plotline)
 *
 * Pure model; no DOM. Reuses swimlaneModel (lanes) + timelineModel (act ordering).
 *
 * @ref docs/XDD/specs/007-interactive-views/solution.md — ADR-20
 */

import { describe, it, expect } from "vitest";
import { createMockTFile } from "../__mocks__/obsidian";
import { swimlaneGrid, type SceneRow, type LinkResolver } from "workspace/workspaceModel";

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

const resolveAll: LinkResolver = (t) => ({ basename: t });

describe("swimlaneGrid", () => {
	it("lanes = the group values as columns (pov), in swimlaneModel order", () => {
		const rows = [
			row({ title: "S1", act: 1, order: 10, pov: { name: "Bob", path: "Bob.md" } }),
			row({ title: "S2", act: 1, order: 20, pov: { name: "Alice", path: "Alice.md" } }),
		];
		const grid = swimlaneGrid(rows, "pov");
		expect(grid.lanes.map((l) => l.label)).toEqual(["Alice", "Bob"]);
		expect(grid.lanes.map((l) => l.key)).toEqual(["pov:Alice", "pov:Bob"]);
	});

	it("actRows = scenes grouped by act in timeline order with act labels", () => {
		const rows = [
			row({ title: "S2", act: 2, order: 30, storyDay: 3, pov: { name: "Alice", path: "Alice.md" } }),
			row({ title: "S1", act: 1, order: 10, storyDay: 1, pov: { name: "Alice", path: "Alice.md" } }),
		];
		const grid = swimlaneGrid(rows, "pov");
		expect(grid.actRows.map((a) => a.act)).toEqual([1, 2]);
		expect(grid.actRows[0]!.label).toContain("Act 1");
		expect(grid.actRows[0]!.scenes.map((s) => s.title)).toEqual(["S1"]);
		expect(grid.actRows[1]!.scenes.map((s) => s.title)).toEqual(["S2"]);
	});

	it("laneOf returns the single lane for pov/location scenes", () => {
		const s = row({ title: "S1", act: 1, pov: { name: "Alice", path: "Alice.md" } });
		const grid = swimlaneGrid([s], "pov");
		expect(grid.laneOf(s)).toEqual(["pov:Alice"]);
	});

	it("laneOf fans a multi-plotline scene across each plotline lane", () => {
		const s = row({ title: "S1", act: 1, plotlines: ["PlotA", "PlotB"] });
		const grid = swimlaneGrid([s], "plotline", resolveAll);
		expect(grid.lanes.map((l) => l.label)).toEqual(["PlotA", "PlotB"]);
		expect(grid.laneOf(s).sort()).toEqual(["plotline:PlotA", "plotline:PlotB"]);
	});

	it("neutral scenes (no pov) map to the neutral lane", () => {
		const s = row({ title: "S1", act: 1 }); // pov null
		const grid = swimlaneGrid([s], "pov");
		expect(grid.lanes.some((l) => l.label === "No POV")).toBe(true);
		expect(grid.laneOf(s)).toEqual(["neutral"]);
	});

	it("unresolved plotline lanes are flagged and laneOf points to them", () => {
		const resolve: LinkResolver = (t) => (t === "Known" ? { basename: "Known" } : null);
		const s = row({ title: "S1", act: 1, plotlines: ["Ghost"] });
		const grid = swimlaneGrid([s], "plotline", resolve);
		const lane = grid.lanes.find((l) => l.label === "Ghost");
		expect(lane?.kind).toBe("unresolved");
		expect(grid.laneOf(s)).toEqual(["unresolved:Ghost"]);
	});

	it("scenes with no act collect in a trailing 'No act' row", () => {
		const rows = [
			row({ title: "S1", act: 1, order: 10, pov: { name: "A", path: "A.md" } }),
			row({ title: "S2", act: null, order: 20, pov: { name: "A", path: "A.md" } }),
		];
		const grid = swimlaneGrid(rows, "pov");
		const last = grid.actRows[grid.actRows.length - 1]!;
		expect(last.act).toBeNull();
		expect(last.label).toBe("No act");
		expect(last.scenes.map((s) => s.title)).toEqual(["S2"]);
	});

	it("laneOf returns unresolved:<name> for a scene whose pov.path is empty (unresolved link)", () => {
		// pov.path === "" means the wikilink could not be resolved to a vault file.
		const s = row({ title: "S1", act: 1, pov: { name: "Ghost", path: "" } });
		const grid = swimlaneGrid([s], "pov");
		// The lane key must be unresolved:<name>, not pov:<name>.
		const laneKey = grid.laneOf(s)[0];
		expect(laneKey).toBe("unresolved:Ghost");
		expect(laneKey).not.toContain("pov:");
		// The lane in the grid must carry kind "unresolved".
		const lane = grid.lanes.find((l) => l.key === "unresolved:Ghost");
		expect(lane?.kind).toBe("unresolved");
	});

	it("laneOf returns unresolved:<name> for a scene whose location.path is empty (unresolved link)", () => {
		const s = row({ title: "S1", act: 1, location: { name: "Limbo", path: "" } });
		const grid = swimlaneGrid([s], "location");
		const laneKey = grid.laneOf(s)[0];
		expect(laneKey).toBe("unresolved:Limbo");
		expect(laneKey).not.toContain("location:");
		const lane = grid.lanes.find((l) => l.key === "unresolved:Limbo");
		expect(lane?.kind).toBe("unresolved");
	});
});
