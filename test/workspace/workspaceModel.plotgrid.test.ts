/**
 * workspaceModel.plotgrid.test.ts — RED tests for T1.2 (M6 Phase 1)
 *
 * Covers plotgridModel (scene × plotline matrix) and PlotgridModel.has.
 * No DOM, no Obsidian runtime beyond a mock TFile.
 *
 * @ref docs/XDD/specs/007-interactive-views/plan/phase-1.md — T1.2
 * @ref docs/XDD/specs/007-interactive-views/solution.md — PlotgridModel / plotgridModel / ADR-7
 */

import { describe, it, expect } from "vitest";
import { createMockTFile } from "../__mocks__/obsidian";
import {
	plotgridModel,
	type PlotgridModel,
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

function resolverFor(known: string[]): (t: string) => { basename: string } | null {
	return (t) => (known.includes(t) ? { basename: t } : null);
}

// ---------------------------------------------------------------------------
// plotgridModel
// ---------------------------------------------------------------------------

describe("plotgridModel", () => {
	it("scenes axis preserves input order", () => {
		const rows = [
			row({ title: "S1", plotlines: ["[[Alpha]]"] }),
			row({ title: "S2", plotlines: ["[[Beta]]"] }),
			row({ title: "S3", plotlines: [] }),
		];
		const model = plotgridModel(rows, resolverFor(["Alpha", "Beta"]));
		expect(model.scenes.map((s) => s.title)).toEqual(["S1", "S2", "S3"]);
	});

	it("plotlines axis contains all distinct resolved plotlines, sorted by name", () => {
		const rows = [
			row({ title: "S1", plotlines: ["[[Beta]]", "[[Alpha]]"] }),
			row({ title: "S2", plotlines: ["[[Alpha]]"] }),
		];
		const model = plotgridModel(rows, resolverFor(["Alpha", "Beta"]));
		expect(model.plotlines.map((p) => p.name)).toEqual(["Alpha", "Beta"]);
	});

	it("has() returns true for a scene that belongs to the plotline", () => {
		const rows = [
			row({ title: "S1", plotlines: ["[[Alpha]]"] }),
			row({ title: "S2", plotlines: ["[[Beta]]"] }),
		];
		const model = plotgridModel(rows, resolverFor(["Alpha", "Beta"]));
		const alpha = model.plotlines.find((p) => p.name === "Alpha")!;
		const beta = model.plotlines.find((p) => p.name === "Beta")!;
		expect(model.has(0, alpha)).toBe(true);  // S1 ∈ Alpha
		expect(model.has(1, beta)).toBe(true);   // S2 ∈ Beta
		expect(model.has(0, beta)).toBe(false);  // S1 ∉ Beta
		expect(model.has(1, alpha)).toBe(false); // S2 ∉ Alpha
	});

	it("has() returns true for all plotlines of a multi-plotline scene", () => {
		const rows = [
			row({ title: "Crossover", plotlines: ["[[Alpha]]", "[[Beta]]", "[[Gamma]]"] }),
		];
		const model = plotgridModel(rows, resolverFor(["Alpha", "Beta", "Gamma"]));
		for (const pl of model.plotlines) {
			expect(model.has(0, pl)).toBe(true);
		}
	});

	it("unresolved plotline link appears in plotlines axis with path empty string", () => {
		const rows = [
			row({ title: "S1", plotlines: ["[[Ghost Arc]]"] }),
		];
		const model = plotgridModel(rows, resolverFor([])); // nothing resolves
		expect(model.plotlines).toHaveLength(1);
		expect(model.plotlines[0]!.name).toBe("Ghost Arc");
		expect(model.plotlines[0]!.path).toBe(""); // flagged: unresolved
	});

	it("has() works for unresolved plotline entries", () => {
		const rows = [
			row({ title: "S1", plotlines: ["[[Ghost Arc]]"] }),
		];
		const model = plotgridModel(rows, resolverFor([]));
		const ghost = model.plotlines[0]!;
		expect(model.has(0, ghost)).toBe(true);
	});

	it("resolved plotlines have path equal to their name (non-empty)", () => {
		const rows = [row({ title: "S1", plotlines: ["[[Alpha]]"] })];
		const model = plotgridModel(rows, resolverFor(["Alpha"]));
		expect(model.plotlines[0]!.path).toBe("Alpha");
		expect(model.plotlines[0]!.path).not.toBe("");
	});

	it("resolved plotlines appear before unresolved in the axis", () => {
		const rows = [
			row({ title: "S1", plotlines: ["[[Ghost]]", "[[Alpha]]"] }),
		];
		const model = plotgridModel(rows, resolverFor(["Alpha"])); // Ghost unresolved
		const names = model.plotlines.map((p) => p.name);
		expect(names.indexOf("Alpha")).toBeLessThan(names.indexOf("Ghost"));
	});

	it("strips [[ ]] from plotline link text before resolving", () => {
		const rows = [row({ title: "S1", plotlines: ["[[Wrapped]]"] })];
		const model = plotgridModel(rows, resolverFor(["Wrapped"]));
		// Should resolve — not appear as unresolved
		expect(model.plotlines[0]!.path).not.toBe("");
		expect(model.plotlines[0]!.name).toBe("Wrapped");
	});

	it("a scene with no plotlines is in scenes axis but does not contribute to plotlines axis", () => {
		const rows = [
			row({ title: "Tagged", plotlines: ["[[Alpha]]"] }),
			row({ title: "Loose", plotlines: [] }),
		];
		const model = plotgridModel(rows, resolverFor(["Alpha"]));
		expect(model.scenes).toHaveLength(2);
		expect(model.plotlines).toHaveLength(1); // only Alpha
		// has() returns false for both plotlines for the scene with no plotlines
		expect(model.has(1, model.plotlines[0]!)).toBe(false);
	});

	it("returns empty plotlines and scenes axes for empty input", () => {
		const model = plotgridModel([], resolverFor([]));
		expect(model.plotlines).toHaveLength(0);
		expect(model.scenes).toHaveLength(0);
	});

	it("has() returns false for an out-of-range sceneIdx", () => {
		const rows = [row({ title: "S1", plotlines: ["[[Alpha]]"] })];
		const model = plotgridModel(rows, resolverFor(["Alpha"]));
		expect(model.has(99, model.plotlines[0]!)).toBe(false);
	});

	it("deduplicates the same plotline across multiple scenes", () => {
		const rows = [
			row({ title: "S1", plotlines: ["[[Alpha]]"] }),
			row({ title: "S2", plotlines: ["[[Alpha]]"] }),
		];
		const model = plotgridModel(rows, resolverFor(["Alpha"]));
		expect(model.plotlines).toHaveLength(1);
	});
});

// ---------------------------------------------------------------------------
// Type-level check: PlotgridModel interface is exported correctly
// ---------------------------------------------------------------------------

describe("PlotgridModel interface", () => {
	it("is satisfied by plotgridModel return value", () => {
		const model: PlotgridModel = plotgridModel([], resolverFor([]));
		expect(Array.isArray(model.plotlines)).toBe(true);
		expect(Array.isArray(model.scenes)).toBe(true);
		expect(typeof model.has).toBe("function");
	});
});
