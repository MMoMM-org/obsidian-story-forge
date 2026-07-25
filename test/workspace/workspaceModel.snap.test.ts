/**
 * workspaceModel.snap.test.ts — RED tests for T1.3 (M6 Phase 1)
 *
 * Covers snapStoryDay: maps a 0..1 drop ratio across day-sorted scenes to
 * a whole story day. Always returns an integer ≥ 1; clamps to maxDay+1.
 * No DOM, no Obsidian runtime beyond a mock TFile.
 *
 * @ref docs/XDD/specs/007-interactive-views/plan/phase-1.md — T1.3
 * @ref docs/XDD/specs/007-interactive-views/solution.md — snapStoryDay / ADR-18
 */

import { describe, it, expect } from "vitest";
import { createMockTFile } from "../__mocks__/obsidian";
import { snapStoryDay, type SceneRow } from "workspace/workspaceModel";

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

// ---------------------------------------------------------------------------
// snapStoryDay
// ---------------------------------------------------------------------------

describe("snapStoryDay", () => {
	it("maps ratio 0.0 to the minimum story day", () => {
		const rows = [
			row({ title: "S1", storyDay: 3 }),
			row({ title: "S2", storyDay: 5 }),
			row({ title: "S3", storyDay: 7 }),
		];
		// ratio 0 → clamp(round(3 + 0*(7-3)), 1, 8) = clamp(3, 1, 8) = 3
		expect(snapStoryDay(rows, 0)).toBe(3);
	});

	it("ratio exactly 1.0 → maxDay (last scene's day)", () => {
		// raw = minDay + 1.0 * (maxDay - minDay) = maxDay; round(maxDay) = maxDay; clamp = maxDay
		const rows = [
			row({ title: "S1", storyDay: 1 }),
			row({ title: "S2", storyDay: 5 }),
		];
		// raw = 1 + 1*(5-1) = 5 = maxDay; clamp(5, 1, 6) = 5
		expect(snapStoryDay(rows, 1.0)).toBe(5);
	});

	it("ratio > 1.0 (past the end) → maxDay+1", () => {
		const rows = [
			row({ title: "S1", storyDay: 1 }),
			row({ title: "S2", storyDay: 5 }),
		];
		// raw = 1 + 2*(5-1) = 9; clamp(9, 1, 6) = 6 = maxDay+1
		expect(snapStoryDay(rows, 2.0)).toBe(6);
	});

	it("always returns an integer", () => {
		const rows = [
			row({ title: "A", storyDay: 1 }),
			row({ title: "B", storyDay: 10 }),
		];
		for (const ratio of [0, 0.1, 0.3, 0.5, 0.7, 0.9, 1.0]) {
			const result = snapStoryDay(rows, ratio);
			expect(Number.isInteger(result)).toBe(true);
		}
	});

	it("never returns a value below 1", () => {
		const rows = [
			row({ title: "A", storyDay: 5 }),
			row({ title: "B", storyDay: 10 }),
		];
		// ratio -0.5 (out of bounds) → clamp to ≥ 1
		const result = snapStoryDay(rows, -0.5);
		expect(result).toBeGreaterThanOrEqual(1);
	});

	it("never returns a value above maxDay+1", () => {
		const rows = [
			row({ title: "A", storyDay: 1 }),
			row({ title: "B", storyDay: 5 }),
		];
		// ratio 2.0 (out of bounds) → clamp to ≤ maxDay+1 = 6
		const result = snapStoryDay(rows, 2.0);
		expect(result).toBeLessThanOrEqual(6);
	});

	it("returns 1 for empty rows (no storyDay data)", () => {
		expect(snapStoryDay([], 0.5)).toBe(1);
	});

	it("returns an integer when all scenes have null storyDay", () => {
		const rows = [
			row({ title: "A", storyDay: null, order: 1 }),
			row({ title: "B", storyDay: null, order: 2 }),
		];
		const result = snapStoryDay(rows, 0.5);
		expect(Number.isInteger(result)).toBe(true);
		expect(result).toBeGreaterThanOrEqual(1);
	});

	it("uses only non-null storyDay values to build the day axis", () => {
		const rows = [
			row({ title: "A", storyDay: 1 }),
			row({ title: "B", storyDay: null, order: 99 }), // no storyDay → excluded from axis
			row({ title: "C", storyDay: 3 }),
		];
		// axis is [1, 3]; ratio 0.5 → round(1 + 0.5*2) = round(2) = 2
		expect(snapStoryDay(rows, 0.5)).toBe(2);
	});

	it("ratio 0.5 snaps to the midpoint day (rounded)", () => {
		const rows = [
			row({ title: "A", storyDay: 1 }),
			row({ title: "B", storyDay: 9 }),
		];
		// raw = 1 + 0.5 * (9 - 1) = 5; round(5) = 5
		expect(snapStoryDay(rows, 0.5)).toBe(5);
	});

	it("handles a single scene with storyDay — ratio 0 → that day, ratio 1 → day+1", () => {
		const rows = [row({ title: "Only", storyDay: 7 })];
		expect(snapStoryDay(rows, 0)).toBe(7);
		expect(snapStoryDay(rows, 1)).toBe(8); // maxDay+1
	});

	it("result is never fractional — only whole numbers", () => {
		const rows = [
			row({ title: "A", storyDay: 1 }),
			row({ title: "B", storyDay: 4 }),
			row({ title: "C", storyDay: 7 }),
		];
		for (let i = 0; i <= 10; i++) {
			const ratio = i / 10;
			const result = snapStoryDay(rows, ratio);
			expect(result % 1).toBe(0); // no fractional part
		}
	});

	// Fix 4: single-day lower clamp — storyDay:0 → result ≥ 1
	it("single-day scene at storyDay 0: result is ≥ 1 (lower clamp applied)", () => {
		// minDay=maxDay=0; raw = 0 + 0*dropRatio = 0; Math.max(1, ...) = 1
		const rows = [row({ title: "Zero", storyDay: 0 })];
		const result = snapStoryDay(rows, 0);
		expect(result).toBeGreaterThanOrEqual(1);
	});

	it("does not return an order value — only a storyDay integer", () => {
		// Confirm the function returns a plausible day number, not the order field.
		const rows = [
			row({ title: "A", storyDay: 2, order: 100 }),
			row({ title: "B", storyDay: 4, order: 200 }),
		];
		// ratio 0.5 → round(2 + 0.5*(4-2)) = round(3) = 3; NOT 150 (which would be order-based)
		const result = snapStoryDay(rows, 0.5);
		expect(result).toBe(3);
		expect(result).not.toBe(150);
	});
});

