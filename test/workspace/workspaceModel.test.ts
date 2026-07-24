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
import {
	timelineModel,
	plotlineModel,
	actLabel,
	actBeatLink,
	plotlineColor,
	statusTally,
	type SceneRow,
} from "workspace/workspaceModel";

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

	it("labels an act with the beat name shared by its scenes (ADR-11)", () => {
		const rows = [
			row({ title: "S1", act: 1, order: 1, beatName: "The Failing Light" }),
			row({ title: "S2", act: 1, order: 2, beatName: "The Failing Light" }),
		];
		const groups = timelineModel(rows);
		expect(groups[0]!.label).toBe("Act 1 · The Failing Light");
	});

	it("falls back to 'Act N' when scenes in an act disagree on the beat", () => {
		const rows = [
			row({ title: "S1", act: 1, order: 1, beatName: "One" }),
			row({ title: "S2", act: 1, order: 2, beatName: "Two" }),
		];
		expect(timelineModel(rows)[0]!.label).toBe("Act 1");
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

// ---------------------------------------------------------------------------
// actLabel (ADR-11)
// ---------------------------------------------------------------------------

describe("actLabel", () => {
	it("appends the beat name when all scenes share one non-empty beat", () => {
		const scenes = [
			row({ title: "a", beatName: "The Gathering Dark" }),
			row({ title: "b", beatName: "The Gathering Dark" }),
		];
		expect(actLabel(2, scenes)).toBe("Act 2 · The Gathering Dark");
	});

	it("returns 'Act N' when scenes disagree on the beat", () => {
		const scenes = [row({ title: "a", beatName: "X" }), row({ title: "b", beatName: "Y" })];
		expect(actLabel(1, scenes)).toBe("Act 1");
	});

	it("returns 'Act N' when no scene has a beat", () => {
		expect(actLabel(3, [row({ title: "a" })])).toBe("Act 3");
	});

	it("ignores empty beat names when deriving the shared beat", () => {
		const scenes = [row({ title: "a", beatName: "Solo" }), row({ title: "b", beatName: "" })];
		expect(actLabel(1, scenes)).toBe("Act 1 · Solo");
	});

	it("returns 'No act' for a null act", () => {
		expect(actLabel(null, [])).toBe("No act");
	});
});

// ---------------------------------------------------------------------------
// actBeatLink
// ---------------------------------------------------------------------------

describe("actBeatLink", () => {
	it("returns the shared beat as a link", () => {
		const scenes = [
			row({ title: "a", beatName: "The Failing Light", beatPath: "The Failing Light.md" }),
			row({ title: "b", beatName: "The Failing Light", beatPath: "The Failing Light.md" }),
		];
		expect(actBeatLink(scenes)).toEqual({ name: "The Failing Light", path: "The Failing Light.md" });
	});

	it("returns a link with empty path when the shared beat is unresolved", () => {
		expect(actBeatLink([row({ title: "a", beatName: "Ghost Beat" })])).toEqual({ name: "Ghost Beat", path: "" });
	});

	it("returns null when scenes disagree on the beat or have none", () => {
		expect(actBeatLink([row({ title: "a", beatName: "X" }), row({ title: "b", beatName: "Y" })])).toBeNull();
		expect(actBeatLink([row({ title: "a" })])).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// plotlineColor (ADR-12)
// ---------------------------------------------------------------------------

describe("plotlineColor", () => {
	it("is deterministic — the same name always yields the same color", () => {
		expect(plotlineColor("The Dying Light")).toBe(plotlineColor("The Dying Light"));
	});

	it("returns a hex color string", () => {
		expect(plotlineColor("The Warden's Oath")).toMatch(/^#[0-9a-fA-F]{6}$/);
	});

	it("spreads distinct names across more than one color", () => {
		const names = ["The Dying Light", "The Warden's Oath", "Shadow Trade", "Broken Lens", "Homecoming"];
		const colors = new Set(names.map(plotlineColor));
		expect(colors.size).toBeGreaterThan(1);
	});
});

// ---------------------------------------------------------------------------
// statusTally
// ---------------------------------------------------------------------------

describe("statusTally", () => {
	it("counts scenes by status", () => {
		const rows = [
			row({ title: "a", status: "draft" }),
			row({ title: "b", status: "draft" }),
			row({ title: "c", status: "outline" }),
		];
		expect(statusTally(rows)).toEqual({ draft: 2, outline: 1 });
	});

	it("tolerates an empty status", () => {
		expect(statusTally([row({ title: "a", status: "" })])).toEqual({ "": 1 });
	});

	it("returns an empty tally for no rows", () => {
		expect(statusTally([])).toEqual({});
	});
});
