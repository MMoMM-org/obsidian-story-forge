/**
 * workspaceModel.kanban.test.ts — RED tests for T1.1 (M6 Phase 1)
 *
 * Covers kanbanModel (group by status) and insertOrder (sparse-int gap math).
 * No DOM, no Obsidian runtime beyond a mock TFile.
 *
 * @ref docs/XDD/specs/007-interactive-views/plan/phase-1.md — T1.1
 * @ref docs/XDD/specs/007-interactive-views/solution.md — kanbanModel / insertOrder / ADR-17
 * @ref schema/scene.json — status enum: idea | outline | draft | revised | done | final
 */

import { describe, it, expect } from "vitest";
import { createMockTFile } from "../__mocks__/obsidian";
import {
	kanbanModel,
	insertOrder,
	RENUMBER,
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

function titles(scenes: SceneRow[]): string[] {
	return scenes.map((s) => s.title);
}

// ---------------------------------------------------------------------------
// kanbanModel
// ---------------------------------------------------------------------------

const STATUS_VOCAB = ["idea", "outline", "draft", "revised", "done", "final"];

describe("kanbanModel", () => {
	it("returns one Group per status in the supplied statuses order", () => {
		const rows = [
			row({ title: "S1", status: "draft", order: 1 }),
			row({ title: "S2", status: "idea", order: 1 }),
		];
		const groups = kanbanModel(rows, STATUS_VOCAB);
		const labels = groups.filter((g) => g.scenes.length > 0).map((g) => g.label);
		// idea column appears before draft column
		expect(labels.indexOf("idea")).toBeLessThan(labels.indexOf("draft"));
	});

	it("produces a column for every status in the list, even if empty", () => {
		const rows = [row({ title: "A", status: "draft", order: 1 })];
		const groups = kanbanModel(rows, STATUS_VOCAB);
		// all 6 vocab statuses should appear as columns
		const keys = groups.map((g) => g.key);
		for (const s of STATUS_VOCAB) {
			expect(keys).toContain(`status:${s}`);
		}
	});

	it("sorts scenes within a column by order ascending", () => {
		const rows = [
			row({ title: "Second", status: "draft", order: 20 }),
			row({ title: "First", status: "draft", order: 10 }),
		];
		const groups = kanbanModel(rows, STATUS_VOCAB);
		const draftGroup = groups.find((g) => g.key === "status:draft")!;
		expect(titles(draftGroup.scenes)).toEqual(["First", "Second"]);
	});

	it("tiebreaks scenes with equal order by title", () => {
		const rows = [
			row({ title: "Zulu", status: "draft", order: 5 }),
			row({ title: "Alpha", status: "draft", order: 5 }),
		];
		const groups = kanbanModel(rows, STATUS_VOCAB);
		const draftGroup = groups.find((g) => g.key === "status:draft")!;
		expect(titles(draftGroup.scenes)).toEqual(["Alpha", "Zulu"]);
	});

	it("collects scenes with null order in a column (order treated as +∞ → sort last by title)", () => {
		const rows = [
			row({ title: "Unordered", status: "draft", order: null }),
			row({ title: "Ordered", status: "draft", order: 5 }),
		];
		const groups = kanbanModel(rows, STATUS_VOCAB);
		const draftGroup = groups.find((g) => g.key === "status:draft")!;
		// Ordered comes first (5 < ∞), Unordered last
		expect(titles(draftGroup.scenes)[0]).toBe("Ordered");
		expect(titles(draftGroup.scenes)[1]).toBe("Unordered");
	});

	it("never drops a scene with a status absent from the vocab", () => {
		const rows = [
			row({ title: "Known", status: "draft", order: 1 }),
			row({ title: "Unknown", status: "published", order: 2 }),
		];
		const groups = kanbanModel(rows, STATUS_VOCAB);
		const allScenes = groups.flatMap((g) => g.scenes);
		expect(titles(allScenes)).toContain("Unknown");
	});

	it("puts out-of-vocab scenes in a trailing neutral group with key 'no-status'", () => {
		const rows = [
			row({ title: "Orphan", status: "published", order: 1 }),
		];
		const groups = kanbanModel(rows, STATUS_VOCAB);
		const neutral = groups.find((g) => g.key === "no-status");
		expect(neutral).toBeDefined();
		expect(titles(neutral!.scenes)).toContain("Orphan");
		// neutral group must be last
		expect(groups[groups.length - 1]!.key).toBe("no-status");
	});

	it("puts scenes with empty status in the neutral group", () => {
		const rows = [row({ title: "NoStatus", status: "", order: 1 })];
		const groups = kanbanModel(rows, STATUS_VOCAB);
		const neutral = groups.find((g) => g.key === "no-status");
		expect(neutral).toBeDefined();
		expect(titles(neutral!.scenes)).toContain("NoStatus");
	});

	it("omits the neutral group when all scenes have a valid status", () => {
		const rows = [
			row({ title: "A", status: "idea", order: 1 }),
			row({ title: "B", status: "draft", order: 1 }),
		];
		const groups = kanbanModel(rows, STATUS_VOCAB);
		expect(groups.find((g) => g.key === "no-status")).toBeUndefined();
	});

	it("returns empty columns + no neutral group for an empty rows array", () => {
		const groups = kanbanModel([], STATUS_VOCAB);
		// All vocab columns present, no neutral
		expect(groups.length).toBe(STATUS_VOCAB.length);
		expect(groups.every((g) => g.scenes.length === 0)).toBe(true);
		expect(groups.find((g) => g.key === "no-status")).toBeUndefined();
	});

	it("columns have kind 'status' and neutral has kind 'unassigned'", () => {
		const rows = [row({ title: "X", status: "weird", order: 1 })];
		const groups = kanbanModel(rows, STATUS_VOCAB);
		const statusCols = groups.filter((g) => g.key.startsWith("status:"));
		expect(statusCols.every((g) => g.kind === "status")).toBe(true);
		const neutral = groups.find((g) => g.key === "no-status")!;
		expect(neutral.kind).toBe("unassigned");
	});
});

// ---------------------------------------------------------------------------
// insertOrder
// ---------------------------------------------------------------------------

describe("insertOrder", () => {
	it("returns the midpoint when both neighbours present with gap ≥ 2", () => {
		// floor((10 + 20) / 2) = 15
		expect(insertOrder(10, 20)).toBe(15);
	});

	it("returns before+10 for an open end (after is null)", () => {
		expect(insertOrder(30, null)).toBe(40);
	});

	it("returns after-10 for an open start (before is null)", () => {
		expect(insertOrder(null, 20)).toBe(10);
	});

	it("returns 10 when both are null (empty column)", () => {
		expect(insertOrder(null, null)).toBe(10);
	});

	it("returns RENUMBER sentinel when gap is exactly 1 (no integer between)", () => {
		const result = insertOrder(5, 6);
		expect(result).toBe(RENUMBER);
	});

	it("RENUMBER is exported and is null", () => {
		expect(RENUMBER).toBeNull();
	});

	it("returns an integer (floored) for non-integer-friendly neighbours", () => {
		// floor((10 + 13) / 2) = 11
		const result = insertOrder(10, 13);
		expect(result).toBe(11);
		// Should be an integer (or RENUMBER)
		if (result !== null) {
			expect(Number.isInteger(result)).toBe(true);
		}
	});

	it("returns RENUMBER when gap is exactly 1 (adjacent integers)", () => {
		expect(insertOrder(99, 100)).toBe(RENUMBER);
		expect(insertOrder(0, 1)).toBe(RENUMBER);
	});

	it("handles large numbers correctly", () => {
		// floor((1000 + 2000) / 2) = 1500
		expect(insertOrder(1000, 2000)).toBe(1500);
	});

	// Fix 2: insertOrder open-start clamp to 0
	it("clamps open-start result to 0 when after ≤ 10 (e.g. after=5 → max(0, 5-10)=0)", () => {
		expect(insertOrder(null, 5)).toBe(0);
	});

	// Fix 6: edge cases — gap=0 and inverted → RENUMBER sentinel
	it("returns RENUMBER when gap is 0 (before === after)", () => {
		expect(insertOrder(5, 5)).toBe(RENUMBER);
	});

	it("returns RENUMBER when inverted (before > after)", () => {
		expect(insertOrder(20, 10)).toBe(RENUMBER);
	});
});
