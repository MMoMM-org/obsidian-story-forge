/**
 * T3.2 – storyFilesNotice: the pure composition of the "Set up story files" result notice
 * (mockups.html S5a–S5d, D10, O6).
 *
 * @ref PRD/F2.7
 */

import { describe, expect, it } from "vitest";
import type { ArtifactSet } from "../../src/artifacts/artifactTypes";
import type { ExecutePlanResult, PlanOutcome } from "../../src/artifacts/executePlan";
import { MAX_NOTICE_LINES, composeNotice, damagedRefusal, type PlannedWrite } from "../../src/artifacts/storyFilesNotice";

const out = (path: string, reason = `Not installed: ${path} already exists.`): PlanOutcome => ({ path, reason });
const result = (r: Partial<ExecutePlanResult>): ExecutePlanResult => ({ written: [], skipped: [], failed: [], ...r });
const none: ReadonlyMap<string, PlannedWrite> = new Map();
/** Planned writes by path; `update` defaults to false, `folder` to the path's parent. */
const planned = (rows: Record<string, { set?: ArtifactSet; update?: boolean; folder?: string }>): ReadonlyMap<string, PlannedWrite> =>
	new Map(
		Object.entries(rows).map(([path, r]) => [
			path,
			{ set: r.set ?? "templates", update: r.update ?? false, folder: r.folder ?? path.slice(0, Math.max(0, path.lastIndexOf("/"))) },
		]),
	);

describe("composeNotice — first line", () => {
	it("counts creates", () => {
		expect(composeNotice(result({ written: ["a", "b"] }), none, []).head).toBe("Set up 2 story files.");
		expect(composeNotice(result({ written: ["a"] }), none, []).head).toBe("Set up 1 story file.");
	});

	it("counts updates by the update paths", () => {
		expect(composeNotice(result({ written: ["a"] }), planned({ a: { update: true } }), []).head).toBe("Updated 1 story file.");
		expect(composeNotice(result({ written: ["a", "b", "c"] }), planned({ c: { update: true } }), []).head).toBe("Set up 2 and updated 1 story file.");
	});

	it("says nothing was written", () => {
		expect(composeNotice(result({ failed: [out("a")] }), none, []).head).toBe("No story files written.");
	});
});

describe("composeNotice — set lines (R2)", () => {
	it("adds one line per set that was written, with the folder, in set order", () => {
		const written = ["S/Schema/a.md", "S/Templates/t1.md", "S/Schema/b.md", "S/Templates/t2.md"];
		const n = composeNotice(
			result({ written }),
			planned({
				"S/Schema/a.md": { set: "schema" },
				"S/Schema/b.md": { set: "schema" },
				"S/Templates/t1.md": { set: "templates" },
				"S/Templates/t2.md": { set: "templates" },
			}),
			[],
		);
		expect(n.head).toBe("Set up 4 story files.");
		expect(n.setLines).toEqual(["2 templates in S/Templates", "2 schema reference notes in S/Schema"]);
	});

	it("names updates, and a set with both says set up and updated", () => {
		const written = ["M/FileClasses/a.md", "M/FileClasses/b.md", "S/Templates/t1.md", "S/Templates/t2.md", "S/Templates/t3.md"];
		const n = composeNotice(
			result({ written }),
			planned({
				"M/FileClasses/a.md": { set: "fileclasses", update: true },
				"M/FileClasses/b.md": { set: "fileclasses", update: true },
				"S/Templates/t1.md": { set: "templates" },
				"S/Templates/t2.md": { set: "templates" },
				"S/Templates/t3.md": { set: "templates", update: true },
			}),
			[],
		);
		expect(n.setLines).toEqual(["2 FileClasses updated in M/FileClasses", "2 templates set up in S/Templates · 1 updated"]);
	});

	it("uses the singular forms", () => {
		const n = composeNotice(
			result({ written: ["F/a.md", "T/a.md", "S/a.md", "F2/b.md"] }),
			planned({
				"F/a.md": { set: "fileclasses" },
				"T/a.md": { set: "templates" },
				"S/a.md": { set: "schema" },
				"F2/b.md": { set: "fileclasses", update: true },
			}),
			[],
		);
		expect(n.setLines).toEqual(["1 FileClass in F", "1 FileClass updated in F2", "1 template in T", "1 schema reference note in S"]);
	});

	it("writes one line per folder when a set's files went to several folders", () => {
		const n = composeNotice(
			result({ written: ["Old/T/a.md", "New/T/b.md", "New/T/c.md"] }),
			planned({
				"Old/T/a.md": { folder: "Old/T", update: true },
				"New/T/b.md": { folder: "New/T" },
				"New/T/c.md": { folder: "New/T" },
			}),
			[],
		);
		expect(n.setLines).toEqual(["1 template updated in Old/T", "2 templates in New/T"]);
	});

	it("uses the planned folder, not the path's parent", () => {
		const n = composeNotice(result({ written: ["R/T/sub/a.md"] }), planned({ "R/T/sub/a.md": { folder: "R/T" } }), []);
		expect(n.setLines).toEqual(["1 template in R/T"]);
	});

	it("leaves out files that were planned but not written", () => {
		const n = composeNotice(
			result({ written: ["T/a.md"], failed: [out("T/b.md")] }),
			planned({ "T/a.md": {}, "T/b.md": {} }),
			[],
		);
		expect(n.setLines).toEqual(["1 template in T"]);
	});

	it("has no set lines when nothing was written", () => {
		expect(composeNotice(result({ failed: [out("T/a.md")] }), planned({ "T/a.md": {} }), []).setLines).toEqual([]);
	});

	it("does not count set lines against the line budget for file lines", () => {
		const written = ["F/a.md", "T/a.md", "S/a.md"];
		const skipped = ["1", "2", "3", "4", "5", "6"].map((p) => out(p));
		const n = composeNotice(
			result({ written }),
			planned({ "F/a.md": { set: "fileclasses" }, "T/a.md": { set: "templates" }, "S/a.md": { set: "schema" } }),
			skipped,
		);
		expect(n.setLines).toHaveLength(3);
		expect(n.sections.flatMap((x) => x.lines)).toHaveLength(MAX_NOTICE_LINES);
		expect(n.tail).toBe("and 1 more. Open Set up story files again to see each file.");
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
