/**
 * T3.2 – storyFilesNotice: the pure composition of the "Set up story files" result notice
 * (mockups.html S5a–S5d, D10, O6).
 *
 * @ref PRD/F2.7
 */

import { describe, expect, it } from "vitest";
import type { ExecutePlanResult, PlanOutcome } from "../../src/artifacts/executePlan";
import { MAX_NOTICE_LINES, composeNotice, damagedRefusal } from "../../src/artifacts/storyFilesNotice";

const out = (path: string, reason = `Not installed: ${path} already exists.`): PlanOutcome => ({ path, reason });
const result = (r: Partial<ExecutePlanResult>): ExecutePlanResult => ({ written: [], skipped: [], failed: [], ...r });
const none = new Set<string>();

describe("composeNotice — first line", () => {
	it("counts creates", () => {
		expect(composeNotice(result({ written: ["a", "b"] }), none, []).head).toBe("Set up 2 story files.");
		expect(composeNotice(result({ written: ["a"] }), none, []).head).toBe("Set up 1 story file.");
	});

	it("counts updates by the update paths", () => {
		expect(composeNotice(result({ written: ["a"] }), new Set(["a"]), []).head).toBe("Updated 1 story file.");
		expect(composeNotice(result({ written: ["a", "b", "c"] }), new Set(["c"]), []).head).toBe("Set up 2 and updated 1 story file.");
	});

	it("says nothing was written", () => {
		expect(composeNotice(result({ failed: [out("a")] }), none, []).head).toBe("No story files written.");
	});
});

describe("composeNotice — role and stickiness", () => {
	it("is a status that hides when nothing was skipped or failed", () => {
		const n = composeNotice(result({ written: ["a"] }), none, []);
		expect(n.role).toBe("status");
		expect(n.sticky).toBe(false);
		expect(n.sections).toEqual([]);
		expect(n.tail).toBeUndefined();
	});

	it("is a sticky alert when anything failed", () => {
		const n = composeNotice(result({ written: ["a"], failed: [out("b")] }), none, []);
		expect(n).toMatchObject({ role: "alert", sticky: true });
	});

	it("is a sticky alert when the plan skipped something", () => {
		expect(composeNotice(result({ written: ["a"] }), none, [out("b")])).toMatchObject({ role: "alert", sticky: true });
	});

	it("is a sticky alert when the re-check skipped something", () => {
		expect(composeNotice(result({ skipped: [out("b")] }), none, [])).toMatchObject({ role: "alert", sticky: true });
	});
});

describe("composeNotice — sections, budget and grouping", () => {
	it("lists Failed before Skipped, plan skips before re-check skips", () => {
		const n = composeNotice(result({ failed: [out("f")], skipped: [out("r")] }), none, [out("p")]);
		expect(n.sections).toEqual([
			{ heading: "Failed (1):", lines: [{ text: out("f").reason }] },
			{ heading: "Skipped (2):", lines: [{ text: out("p").reason }, { text: out("r").reason }] },
		]);
	});

	it(`shows at most ${MAX_NOTICE_LINES} lines, then the hidden file count`, () => {
		const skipped = ["a", "b", "c", "d", "e", "f", "g"].map((p) => out(p));
		const n = composeNotice(result({ failed: [out("x")] }), none, skipped);
		expect(n.sections.flatMap((s) => s.lines)).toHaveLength(MAX_NOTICE_LINES);
		expect(n.sections[1]!.heading).toBe("Skipped (7):");
		expect(n.tail).toBe("and 3 more. Open Set up story files again to see each file.");
	});

	it("drops a section whose lines are all past the budget, counting them as hidden", () => {
		const failed = ["a", "b", "c", "d", "e"].map((p) => out(p));
		const n = composeNotice(result({ failed }), none, [out("s1"), out("s2")]);
		expect(n.sections.map((s) => s.heading)).toEqual(["Failed (5):"]);
		expect(n.tail).toBe("and 2 more. Open Set up story files again to see each file.");
	});

	it("collapses identical reasons into one line plus the same-reason line, counting one budget line", () => {
		const reason = "Not installed: could not create folder W/Schema: permission denied";
		const failed = ["W/Schema/a.md", "W/Schema/b.md", "W/Schema/c.md"].map((p) => out(p, reason));
		const n = composeNotice(result({ failed }), none, ["1", "2", "3", "4", "5"].map((p) => out(p)));
		expect(n.sections[0]).toEqual({
			heading: "Failed (3):",
			lines: [{ text: reason, more: "The same reason for 2 more files in W/Schema." }],
		});
		expect(n.sections[1]!.lines).toHaveLength(4);
		expect(n.tail).toBe("and 1 more. Open Set up story files again to see each file.");
	});

	it("counts every file of a hidden grouped line", () => {
		const reason = "same";
		const skipped = [...["1", "2", "3", "4", "5"].map((p) => out(p)), out("x/a", reason), out("x/b", reason)];
		expect(composeNotice(result({}), none, skipped).tail).toBe("and 2 more. Open Set up story files again to see each file.");
	});

	it("says 1 more file in the singular", () => {
		const n = composeNotice(result({ failed: [out("d/a", "r"), out("d/b", "r")] }), none, []);
		expect(n.sections[0]!.lines[0]!.more).toBe("The same reason for 1 more file in d.");
	});
});

describe("composeNotice — debug lines", () => {
	it("logs every failed and skipped reason once, failed first", () => {
		const n = composeNotice(result({ failed: [out("f", "F")], skipped: [out("r", "R")] }), none, [out("p", "P")]);
		expect(n.debug).toEqual(["[StoryForge] F", "[StoryForge] P", "[StoryForge] R"]);
	});
});

describe("damagedRefusal", () => {
	it("uses the S3 wording", () => {
		expect(damagedRefusal("a.md")).toBe(
			"Not installed: the bundled copy of a.md is damaged, so nothing was written. Reinstalling Story Forge restores it.",
		);
	});
});
