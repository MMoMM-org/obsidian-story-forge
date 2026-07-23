/**
 * workspaceModel.test.ts — Phase 1 (RED) for M5 declarative views.
 *
 * Pure model tests: timelineModel + plotlineModel. No DOM, no Obsidian runtime
 * beyond a mock TFile carried through. Field names verified against schema/scene.json.
 *
 * @ref docs/XDD/specs/006-declarative-views/plan/phase-1.md
 * @ref SDD/Interface Specifications; Implementation Examples
 */

import { describe, it, expect } from "vitest";
import { createMockTFile } from "../__mocks__/obsidian";
import { timelineModel, plotlineModel, type SceneRow } from "workspace/workspaceModel";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function row(o: Partial<SceneRow> & { title: string }): SceneRow {
	return {
		file: createMockTFile({ basename: o.title, path: `${o.title}.md` }),
		title: o.title,
		act: o.act ?? null,
		order: o.order ?? null,
		storyDay: o.storyDay ?? null,
		when: o.when ?? "",
		status: o.status ?? "",
		pov: o.pov ?? "",
		plotlines: o.plotlines ?? [],
	};
}

/** A link resolver over a name→basename map (mimics metadataCache.getFirstLinkpathDest). */
function resolverFor(known: string[]): (t: string) => { basename: string } | null {
	return (t) => (known.includes(t) ? { basename: t } : null);
}

function titles(scenes: SceneRow[]): string[] {
	return scenes.map((s) => s.title);
}

// ---------------------------------------------------------------------------
// timelineModel
// ---------------------------------------------------------------------------

describe("timelineModel", () => {
	it("orders by storyDay ascending, breaking ties by order", () => {
		const rows = [
			row({ title: "Scene 3", act: 1, order: 3, storyDay: 2 }),
			row({ title: "Scene 2", act: 1, order: 2, storyDay: 1 }),
			row({ title: "Scene 1", act: 1, order: 1, storyDay: 1 }),
		];
		const groups = timelineModel(rows);
		expect(groups).toHaveLength(1);
		expect(groups[0]!.label).toBe("Act 1");
		expect(groups[0]!.kind).toBe("act");
		expect(titles(groups[0]!.scenes)).toEqual(["Scene 1", "Scene 2", "Scene 3"]);
	});

	it("places a scene with no storyDay by its order", () => {
		const rows = [
			row({ title: "A", act: 1, storyDay: null, order: 5 }),
			row({ title: "B", act: 1, storyDay: 2, order: 1 }),
		];
		const groups = timelineModel(rows);
		// B key = 2, A key = 5 → B before A
		expect(titles(groups[0]!.scenes)).toEqual(["B", "A"]);
	});

	it("never drops a scene missing both storyDay and order (appended last)", () => {
		const rows = [
			row({ title: "Unplaced", act: 1, storyDay: null, order: null }),
			row({ title: "Placed", act: 1, storyDay: 1, order: 1 }),
		];
		const groups = timelineModel(rows);
		expect(titles(groups[0]!.scenes)).toEqual(["Placed", "Unplaced"]);
	});

	it("groups by act ascending", () => {
		const rows = [
			row({ title: "S2", act: 2, storyDay: 1, order: 1 }),
			row({ title: "S1", act: 1, storyDay: 1, order: 1 }),
		];
		const groups = timelineModel(rows);
		expect(groups.map((g) => g.label)).toEqual(["Act 1", "Act 2"]);
	});

	it("collects scenes with no act in a trailing 'No act' group", () => {
		const rows = [
			row({ title: "NoAct", act: null, storyDay: 1, order: 1 }),
			row({ title: "Act1", act: 1, storyDay: 1, order: 1 }),
		];
		const groups = timelineModel(rows);
		expect(groups.map((g) => g.label)).toEqual(["Act 1", "No act"]);
		expect(groups[1]!.kind).toBe("no-act");
	});

	it("does not let `when` affect ordering", () => {
		const rows = [
			row({ title: "Late", act: 1, storyDay: 1, order: 2, when: "Aardvark" }),
			row({ title: "Early", act: 1, storyDay: 1, order: 1, when: "Zulu" }),
		];
		const groups = timelineModel(rows);
		expect(titles(groups[0]!.scenes)).toEqual(["Early", "Late"]);
	});

	it("returns no groups for empty input", () => {
		expect(timelineModel([])).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// plotlineModel
// ---------------------------------------------------------------------------

describe("plotlineModel", () => {
	it("groups by plotline; a scene on two plotlines appears under each", () => {
		const rows = [row({ title: "X", plotlines: ["[[A]]", "[[B]]"] })];
		const groups = plotlineModel(rows, resolverFor(["A", "B"]));
		const byLabel = Object.fromEntries(groups.map((g) => [g.label, titles(g.scenes)]));
		expect(byLabel["A"]).toEqual(["X"]);
		expect(byLabel["B"]).toEqual(["X"]);
	});

	it("places scenes with no plotlines in a trailing 'Unassigned' group", () => {
		const rows = [
			row({ title: "Tagged", plotlines: ["[[A]]"] }),
			row({ title: "Loose", plotlines: [] }),
		];
		const groups = plotlineModel(rows, resolverFor(["A"]));
		const last = groups[groups.length - 1]!;
		expect(last.label).toBe("Unassigned");
		expect(last.kind).toBe("unassigned");
		expect(titles(last.scenes)).toEqual(["Loose"]);
	});

	it("puts an unresolved plotline link in its own flagged group (not Unassigned)", () => {
		const rows = [row({ title: "Z", plotlines: ["[[Ghost Arc]]"] })];
		const groups = plotlineModel(rows, resolverFor([])); // nothing resolves
		const ghost = groups.find((g) => g.label === "Ghost Arc");
		expect(ghost).toBeDefined();
		expect(ghost!.kind).toBe("unresolved");
		expect(groups.some((g) => g.kind === "unassigned")).toBe(false);
	});

	it("orders plotline groups (by name), then unresolved, then Unassigned last", () => {
		const rows = [
			row({ title: "u", plotlines: ["[[Zeta]]"] }),      // resolves
			row({ title: "g", plotlines: ["[[Broken]]"] }),    // unresolved
			row({ title: "a", plotlines: ["[[Alpha]]"] }),     // resolves
			row({ title: "n", plotlines: [] }),                // unassigned
		];
		const groups = plotlineModel(rows, resolverFor(["Alpha", "Zeta"]));
		expect(groups.map((g) => g.label)).toEqual(["Alpha", "Zeta", "Broken", "Unassigned"]);
	});

	it("returns no groups for empty input", () => {
		expect(plotlineModel([], resolverFor([]))).toEqual([]);
	});
});
