import { afterEach, describe, expect, it } from "vitest";
import { Platform } from "obsidian";
import { formatValue, modKeyName, outcomeNotice, stepLabel, summariseStep } from "../../src/undo/stepLabel";
import type { ConflictReport, FieldChange, Slot, Step, UndoOutcome } from "../../src/undo/journalTypes";

const present = (value: unknown): Slot => ({ present: true, value });
const ABSENT: Slot = { present: false };
const MARA = "20 Characters/Mara Stoneway.md";
const SCENE4 = "30 Scenes/Scene 4.md";
const SCENE5 = "30 Scenes/Scene 5.md";

const change = (key: string, before: Slot = present("a"), after: Slot = present("b")): FieldChange => ({ key, before, after });
const step = (files: Array<[string, FieldChange[]]>): Step => ({
	id: "u-1-0",
	at: 1,
	persist: true,
	files: files.map(([path, changes]) => ({ path, changes })),
});
const statusStep = (): Step => step([[MARA, [change("status")]]]);
const conflict = (key: string, path = MARA, written: Slot = present("dead"), found: Slot = present("missing")): ConflictReport => ({
	path, key, expected: present("alive"), found, written,
});
const applied = (over: Partial<Extract<UndoOutcome, { kind: "applied" }>> = {}): UndoOutcome => ({
	kind: "applied", direction: "undo", step: statusStep(), conflicts: [], failedPaths: [], vanishedPaths: [], ...over,
});

const setMac = (on: boolean): void => {
	(Platform as { isMacOS: boolean }).isMacOS = on;
};
afterEach(() => setMac(false));

describe("stepLabel", () => {
	it("names the field and the note for one change", () => {
		expect(stepLabel(statusStep())).toBe("status in Mara Stoneway");
	});

	it("counts the changes for several fields in one note", () => {
		const s = step([[MARA, [change("status"), change("aliases"), change("order")]]]);
		expect(stepLabel(s)).toBe("3 changes in Mara Stoneway");
	});

	it("counts changes and notes for a step across notes", () => {
		const s = step([
			[MARA, [change("status")]],
			[SCENE4, [change("order"), change("status")]],
			[SCENE5, [change("order")]],
		]);
		expect(stepLabel(s)).toBe("4 changes in 3 notes");
	});

	it("drops only a trailing .md and the folders from the note name", () => {
		const s = step([["a/b.md/Mara.md.md", [change("status")]]]);
		expect(stepLabel(s)).toBe("status in Mara.md");
	});
});

describe("summariseStep", () => {
	it("reports the label and both counts", () => {
		const s = step([[MARA, [change("status")]], [SCENE4, [change("order"), change("status")]]]);
		expect(summariseStep(s)).toEqual({ label: "3 changes in 2 notes", fieldCount: 3, noteCount: 2 });
	});
});

describe("formatValue", () => {
	it("quotes a string", () => {
		expect(formatValue(present("dead"))).toBe("'dead'");
	});

	it("shows an absent key as not set", () => {
		expect(formatValue(ABSENT)).toBe("not set");
	});

	it("shows an empty string as two quotes", () => {
		expect(formatValue(present(""))).toBe("''");
	});

	it("shows null as empty", () => {
		expect(formatValue(present(null))).toBe("empty");
	});

	it("joins a list with commas", () => {
		expect(formatValue(present(["Mara", "Stone", 3]))).toBe("Mara, Stone, 3");
	});

	it("shows an empty list as an empty list", () => {
		expect(formatValue(present([]))).toBe("empty list");
	});

	it("prints numbers and booleans plainly", () => {
		expect(formatValue(present(30))).toBe("30");
		expect(formatValue(present(false))).toBe("false");
	});

	it("keeps a string of exactly 40 characters whole", () => {
		const forty = "x".repeat(40);
		expect(formatValue(present(forty))).toBe(`'${forty}'`);
	});

	it("truncates a string over 40 characters with an ellipsis", () => {
		expect(formatValue(present("x".repeat(41)))).toBe(`'${"x".repeat(40)}…'`);
	});

	it("truncates a long list", () => {
		const text = formatValue(present(["y".repeat(30), "z".repeat(30)]));
		expect(text).toBe(`${"y".repeat(30)}, ${"z".repeat(8)}…`);
	});

	it("prints a map inside a list as JSON", () => {
		expect(formatValue(present(["a", { b: 1 }]))).toBe('a, {"b":1}');
	});

	it("truncates a long map", () => {
		const text = formatValue(present({ key: "m".repeat(60) }));
		expect(text).toHaveLength(41);
		expect(text.endsWith("…")).toBe(true);
	});

	it("prints a map as JSON", () => {
		expect(formatValue(present({ a: 1 }))).toBe('{"a":1}');
	});
});

describe("modKeyName", () => {
	it("is Cmd on macOS", () => {
		setMac(true);
		expect(modKeyName()).toBe("Cmd");
	});

	it("is Ctrl elsewhere", () => {
		setMac(false);
		expect(modKeyName()).toBe("Ctrl");
	});
});

describe("outcomeNotice", () => {
	it("says nothing to undo or redo for an empty stack", () => {
		expect(outcomeNotice({ kind: "empty", direction: "undo" })).toBe("Nothing to undo");
		expect(outcomeNotice({ kind: "empty", direction: "redo" })).toBe("Nothing to redo");
	});

	it("prefixes the step label for a clean undo and redo", () => {
		expect(outcomeNotice(applied())).toBe("Undo: status in Mara Stoneway");
		expect(outcomeNotice(applied({ direction: "redo" }))).toBe("Redo: status in Mara Stoneway");
	});

	it("asks the user to save or discard, naming the note, for a draft or a write in flight", () => {
		const base = { kind: "refused", direction: "undo", path: MARA } as const;
		expect(outcomeNotice({ ...base, reason: "draft" })).toBe("Save or discard your edit first (Mara Stoneway)");
		expect(outcomeNotice({ ...base, reason: "write" })).toBe("Save or discard your edit first (Mara Stoneway)");
	});

	it("explains a single conflict and names the key that redoes it, on macOS", () => {
		setMac(true);
		expect(outcomeNotice(applied({ conflicts: [conflict("status")] }))).toBe(
			"Undo: status in Mara Stoneway is 'dead' again. It had changed to 'missing'; Cmd+Shift+Z restores it.",
		);
	});

	it("uses Ctrl off macOS", () => {
		setMac(false);
		expect(outcomeNotice(applied({ conflicts: [conflict("status")] }))).toContain("Ctrl+Shift+Z restores it.");
	});

	it("points a redo conflict back at the plain undo key", () => {
		setMac(true);
		const text = outcomeNotice(applied({ direction: "redo", conflicts: [conflict("status")] }));
		expect(text).toBe("Redo: status in Mara Stoneway is 'dead' again. It had changed to 'missing'; Cmd+Z restores it.");
	});

	it("shows an absent found value as not set", () => {
		const text = outcomeNotice(applied({ conflicts: [conflict("status", MARA, present("dead"), ABSENT)] }));
		expect(text).toContain("It had changed to not set;");
	});

	it("names up to three conflicts", () => {
		setMac(true);
		const conflicts = [conflict("status"), conflict("aliases"), conflict("order", SCENE4)];
		expect(outcomeNotice(applied({ conflicts }))).toBe(
			"Undo: status in Mara Stoneway, aliases in Mara Stoneway and order in Scene 4 had changed since; Cmd+Shift+Z restores them.",
		);
	});

	it("names three and counts the rest", () => {
		setMac(true);
		const conflicts = ["a", "b", "c", "d", "e"].map(k => conflict(k));
		expect(outcomeNotice(applied({ conflicts }))).toBe(
			"Undo: a in Mara Stoneway, b in Mara Stoneway, c in Mara Stoneway and 2 more had changed since; Cmd+Shift+Z restores them.",
		);
	});

	it("names two conflicts without a comma", () => {
		const conflicts = [conflict("status"), conflict("order", SCENE4)];
		expect(outcomeNotice(applied({ conflicts }))).toContain("status in Mara Stoneway and order in Scene 4 had changed since;");
	});

	it("reports the files that failed in a partial undo and where the change stays", () => {
		const s = step([[MARA, [change("a"), change("b")]]]);
		expect(outcomeNotice(applied({ step: s, failedPaths: [SCENE4] }))).toBe(
			"Undo: 2 changes in Mara Stoneway. Couldn't write Scene 4; its change stays on the undo stack.",
		);
	});

	it("uses the redo stack and plural wording for several failed files in a redo", () => {
		const text = outcomeNotice(applied({ direction: "redo", failedPaths: [SCENE4, SCENE5] }));
		expect(text).toBe(
			"Redo: status in Mara Stoneway. Couldn't write Scene 4 and Scene 5; their changes stay on the redo stack.",
		);
	});

	it("reports vanished files after an applied undo", () => {
		expect(outcomeNotice(applied({ vanishedPaths: [SCENE4] }))).toBe(
			"Undo: status in Mara Stoneway. Scene 4 no longer exists; its change was removed from the undo history.",
		);
	});

	it("combines a conflict with failed and vanished files, one sentence each", () => {
		setMac(true);
		const text = outcomeNotice(applied({ conflicts: [conflict("status")], failedPaths: [SCENE4], vanishedPaths: [SCENE5] }));
		expect(text).toBe(
			"Undo: status in Mara Stoneway is 'dead' again. It had changed to 'missing'; Cmd+Shift+Z restores it. " +
				"Couldn't write Scene 4; its change stays on the undo stack. " +
				"Scene 5 no longer exists; its change was removed from the undo history.",
		);
	});

	it("says the step stays on the stack when every write failed", () => {
		expect(outcomeNotice({ kind: "failed", direction: "undo", step: statusStep() })).toBe(
			"Couldn't undo the change in Mara Stoneway. It stays on the undo stack; try again.",
		);
	});

	it("describes a failed multi-note redo", () => {
		const s = step([[MARA, [change("status")]], [SCENE4, [change("order")]]]);
		expect(outcomeNotice({ kind: "failed", direction: "redo", step: s })).toBe(
			"Couldn't redo the changes in 2 notes. It stays on the redo stack; try again.",
		);
	});

	it("describes a failed step with several changes in one note", () => {
		const s = step([[MARA, [change("status"), change("order")]]]);
		expect(outcomeNotice({ kind: "failed", direction: "undo", step: s })).toContain("the changes in Mara Stoneway.");
	});

	it("says a vanished note's change was removed", () => {
		expect(outcomeNotice({ kind: "vanished", direction: "undo", paths: [SCENE4] })).toBe(
			"Scene 4 no longer exists; its change was removed from the undo history.",
		);
		expect(outcomeNotice({ kind: "vanished", direction: "redo", paths: [SCENE4, SCENE5] })).toBe(
			"Scene 4 and Scene 5 no longer exist; their changes were removed from the undo history.",
		);
	});
});
