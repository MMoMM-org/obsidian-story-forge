/**
 * workspaceModel.swimlane.test.ts — RED tests for T1.4 (M6 Phase 1)
 *
 * Covers swimlaneModel (group by pov | location | plotline) and SwimlaneKey.
 * No DOM, no Obsidian runtime beyond a mock TFile.
 *
 * @ref docs/XDD/specs/007-interactive-views/plan/phase-1.md — T1.4
 * @ref docs/XDD/specs/007-interactive-views/solution.md — swimlaneModel / SwimlaneKey / ADR-20
 */

import { describe, it, expect } from "vitest";
import { createMockTFile } from "../__mocks__/obsidian";
import {
	swimlaneModel,
	type SwimlaneKey,
	type SceneRow,
	type Group,
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

function link(name: string, resolved = true): { name: string; path: string } {
	return { name, path: resolved ? name : "" };
}

function titles(scenes: SceneRow[]): string[] {
	return scenes.map((s) => s.title);
}

function groupLabels(groups: Group[]): string[] {
	return groups.map((g) => g.label);
}

// ---------------------------------------------------------------------------
// swimlaneModel — "pov" key
// ---------------------------------------------------------------------------

describe('swimlaneModel("pov")', () => {
	it("creates one lane per distinct resolved POV", () => {
		const rows = [
			row({ title: "S1", pov: link("Alice"), storyDay: 1 }),
			row({ title: "S2", pov: link("Bob"), storyDay: 2 }),
			row({ title: "S3", pov: link("Alice"), storyDay: 3 }),
		];
		const groups = swimlaneModel(rows, "pov");
		const labels = groupLabels(groups);
		expect(labels).toContain("Alice");
		expect(labels).toContain("Bob");
		// Alice lane has 2 scenes, Bob has 1
		const alice = groups.find((g) => g.label === "Alice")!;
		expect(alice.scenes).toHaveLength(2);
	});

	it("puts scenes with null pov in a trailing 'No POV' bucket", () => {
		const rows = [
			row({ title: "S1", pov: link("Alice"), storyDay: 1 }),
			row({ title: "S2", pov: null, storyDay: 2 }),
		];
		const groups = swimlaneModel(rows, "pov");
		const neutral = groups[groups.length - 1]!;
		expect(neutral.label).toBe("No POV");
		expect(neutral.kind).toBe("unassigned");
		expect(titles(neutral.scenes)).toContain("S2");
	});

	it("neutral 'No POV' is always the last group", () => {
		const rows = [
			row({ title: "S1", pov: null, storyDay: 1 }),
			row({ title: "S2", pov: link("Zara"), storyDay: 2 }),
		];
		const groups = swimlaneModel(rows, "pov");
		expect(groups[groups.length - 1]!.label).toBe("No POV");
	});

	it("omits the neutral bucket when all scenes have a pov", () => {
		const rows = [
			row({ title: "S1", pov: link("Alice"), storyDay: 1 }),
			row({ title: "S2", pov: link("Bob"), storyDay: 2 }),
		];
		const groups = swimlaneModel(rows, "pov");
		expect(groups.find((g) => g.label === "No POV")).toBeUndefined();
	});

	it("unresolved pov link gets its own flagged lane (kind 'unresolved')", () => {
		const rows = [
			row({ title: "S1", pov: link("Ghost", false), storyDay: 1 }),
		];
		const groups = swimlaneModel(rows, "pov");
		const ghostLane = groups.find((g) => g.label === "Ghost");
		expect(ghostLane).toBeDefined();
		expect(ghostLane!.kind).toBe("unresolved");
	});

	it("named lanes are sorted by label before the neutral bucket", () => {
		const rows = [
			row({ title: "S1", pov: link("Zara"), storyDay: 1 }),
			row({ title: "S2", pov: link("Alice"), storyDay: 2 }),
			row({ title: "S3", pov: null, storyDay: 3 }),
		];
		const groups = swimlaneModel(rows, "pov");
		const labels = groupLabels(groups);
		expect(labels[0]).toBe("Alice");
		expect(labels[1]).toBe("Zara");
		expect(labels[labels.length - 1]).toBe("No POV");
	});

	it("sorts scenes within a lane by storyDay ascending", () => {
		const rows = [
			row({ title: "Later", pov: link("Alice"), storyDay: 5 }),
			row({ title: "Earlier", pov: link("Alice"), storyDay: 2 }),
		];
		const groups = swimlaneModel(rows, "pov");
		const alice = groups.find((g) => g.label === "Alice")!;
		expect(titles(alice.scenes)).toEqual(["Earlier", "Later"]);
	});

	it("falls back to order when storyDay is null, within-lane sort", () => {
		const rows = [
			row({ title: "OrderLast", pov: link("Alice"), storyDay: null, order: 20 }),
			row({ title: "OrderFirst", pov: link("Alice"), storyDay: null, order: 10 }),
		];
		const groups = swimlaneModel(rows, "pov");
		const alice = groups.find((g) => g.label === "Alice")!;
		expect(titles(alice.scenes)).toEqual(["OrderFirst", "OrderLast"]);
	});

	it("returns empty array for empty input", () => {
		expect(swimlaneModel([], "pov")).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// swimlaneModel — "location" key
// ---------------------------------------------------------------------------

describe('swimlaneModel("location")', () => {
	it("creates one lane per distinct resolved location", () => {
		const rows = [
			row({ title: "S1", location: link("Forest"), storyDay: 1 }),
			row({ title: "S2", location: link("Castle"), storyDay: 2 }),
		];
		const groups = swimlaneModel(rows, "location");
		const labels = groupLabels(groups);
		expect(labels).toContain("Forest");
		expect(labels).toContain("Castle");
	});

	it("puts scenes with null location in a trailing 'No location' bucket", () => {
		const rows = [
			row({ title: "S1", location: null, storyDay: 1 }),
			row({ title: "S2", location: link("Forest"), storyDay: 2 }),
		];
		const groups = swimlaneModel(rows, "location");
		const neutral = groups[groups.length - 1]!;
		expect(neutral.label).toBe("No location");
		expect(neutral.kind).toBe("unassigned");
	});

	it("unresolved location link → flagged lane (kind 'unresolved')", () => {
		const rows = [
			row({ title: "S1", location: link("Ruins", false), storyDay: 1 }),
		];
		const groups = swimlaneModel(rows, "location");
		const ruinsLane = groups.find((g) => g.label === "Ruins");
		expect(ruinsLane).toBeDefined();
		expect(ruinsLane!.kind).toBe("unresolved");
	});

	it("lanes sorted by label, neutral last", () => {
		const rows = [
			row({ title: "S1", location: link("Zephyr"), storyDay: 1 }),
			row({ title: "S2", location: link("Abyss"), storyDay: 2 }),
			row({ title: "S3", location: null, storyDay: 3 }),
		];
		const groups = swimlaneModel(rows, "location");
		const labels = groupLabels(groups);
		expect(labels[0]).toBe("Abyss");
		expect(labels[1]).toBe("Zephyr");
		expect(labels[labels.length - 1]).toBe("No location");
	});
});

// ---------------------------------------------------------------------------
// swimlaneModel — "plotline" key
// ---------------------------------------------------------------------------

describe('swimlaneModel("plotline")', () => {
	it("creates one lane per distinct plotline (raw stripped text)", () => {
		const rows = [
			row({ title: "S1", plotlines: ["[[Alpha]]"], storyDay: 1 }),
			row({ title: "S2", plotlines: ["[[Beta]]"], storyDay: 2 }),
		];
		const groups = swimlaneModel(rows, "plotline");
		const labels = groupLabels(groups).filter((l) => l !== "Unassigned");
		expect(labels).toContain("Alpha");
		expect(labels).toContain("Beta");
	});

	it("a multi-plotline scene appears in EACH of its plotline lanes", () => {
		const rows = [
			row({ title: "Cross", plotlines: ["[[Alpha]]", "[[Beta]]"], storyDay: 1 }),
		];
		const groups = swimlaneModel(rows, "plotline");
		const alpha = groups.find((g) => g.label === "Alpha");
		const beta = groups.find((g) => g.label === "Beta");
		expect(alpha).toBeDefined();
		expect(beta).toBeDefined();
		expect(titles(alpha!.scenes)).toContain("Cross");
		expect(titles(beta!.scenes)).toContain("Cross");
	});

	it("scenes with no plotlines go in an 'Unassigned' trailing bucket", () => {
		const rows = [
			row({ title: "S1", plotlines: ["[[Alpha]]"], storyDay: 1 }),
			row({ title: "S2", plotlines: [], storyDay: 2 }),
		];
		const groups = swimlaneModel(rows, "plotline");
		const neutral = groups[groups.length - 1]!;
		expect(neutral.label).toBe("Unassigned");
		expect(neutral.kind).toBe("unassigned");
		expect(titles(neutral.scenes)).toContain("S2");
	});

	it("'Unassigned' is always last even when named lanes are sorted", () => {
		const rows = [
			row({ title: "S1", plotlines: ["[[Zeta]]"], storyDay: 1 }),
			row({ title: "S2", plotlines: [], storyDay: 2 }),
			row({ title: "S3", plotlines: ["[[Alpha]]"], storyDay: 3 }),
		];
		const groups = swimlaneModel(rows, "plotline");
		expect(groups[groups.length - 1]!.label).toBe("Unassigned");
		// Named lanes sorted: Alpha before Zeta
		expect(groups[0]!.label).toBe("Alpha");
		expect(groups[1]!.label).toBe("Zeta");
	});

	it("strips [[ ]] from plotline text for the lane label", () => {
		const rows = [
			row({ title: "S1", plotlines: ["[[The Main Arc]]"], storyDay: 1 }),
		];
		const groups = swimlaneModel(rows, "plotline");
		const names = groupLabels(groups);
		expect(names).toContain("The Main Arc");
		expect(names.some((n) => n.includes("[["))).toBe(false);
	});

	it("within-lane sort: storyDay asc, fallback to order", () => {
		const rows = [
			row({ title: "Late", plotlines: ["[[Alpha]]"], storyDay: 10 }),
			row({ title: "Early", plotlines: ["[[Alpha]]"], storyDay: 2 }),
		];
		const groups = swimlaneModel(rows, "plotline");
		const alpha = groups.find((g) => g.label === "Alpha")!;
		expect(titles(alpha.scenes)).toEqual(["Early", "Late"]);
	});

	it("omits 'Unassigned' when all scenes have at least one plotline", () => {
		const rows = [
			row({ title: "S1", plotlines: ["[[Alpha]]"], storyDay: 1 }),
		];
		const groups = swimlaneModel(rows, "plotline");
		expect(groups.find((g) => g.label === "Unassigned")).toBeUndefined();
	});

	it("returns empty array for empty input", () => {
		expect(swimlaneModel([], "plotline")).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// SwimlaneKey type
// ---------------------------------------------------------------------------

describe("SwimlaneKey", () => {
	it("accepts all three valid keys without type error", () => {
		const keys: SwimlaneKey[] = ["pov", "location", "plotline"];
		for (const k of keys) {
			expect(() => swimlaneModel([], k)).not.toThrow();
		}
	});
});
