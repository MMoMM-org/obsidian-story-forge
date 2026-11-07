/**
 * UndoJournal — undo and redo (spec 009 T2.4).
 *
 * Undo writes `before` expecting `after`; redo writes `after` expecting
 * `before`; the moved step keeps what the write found, so a conflict is
 * written anyway and stays recoverable. Multi-file steps apply file by file,
 * failed files stay on top, vanished files are dropped, and every call runs
 * after the one before it. Around every test the harness checks that no body,
 * no unrelated key and no file changed.
 *
 * @ref SDD/ADR-46, Traced walkthrough 2, Error Handling —
 *      AC-F2.4–AC-F2.10, AC-F3.1–AC-F3.6, AC-F10.3, AC-F10.4
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TFile } from "../__mocks__/obsidian";
import type { RestoreFn } from "inspector/frontmatterWriter";
import { outcomeNotice } from "undo/stepLabel";
import type { FileChanges, UndoOutcome } from "undo/journalTypes";
import {
	ABSENT, MARA, SCENE_4, SCENE_5, UNRELATED, fakeStore, present, setup, stepOf, teardownAndCheckUntouched,
} from "./journalHarness";

afterEach(teardownAndCheckUntouched);

const change = (path: string, key: string, before: unknown, after: unknown): FileChanges =>
	({ path, changes: [{ key, before: present(before), after: present(after) }] });

/** A two-note step, as only a loaded journal can hold before groups (Phase 3) exist. */
function twoNoteSetup(opts: { wrapRestore?: (real: RestoreFn) => RestoreFn } = {}) {
	const step = stepOf("multi", [change(SCENE_4, "order", 10, 20), change(SCENE_5, "order", 11, 30)]);
	const h = setup({ [SCENE_4]: { order: 20 }, [SCENE_5]: { order: 30 } }, { ...opts, store: fakeStore({ undo: [step], redo: [] }) });
	return { h, step };
}

/** Fail the restore of one path; the others run for real. */
const failing = (path: string) => (real: RestoreFn): RestoreFn =>
	(file, ops) => (file.path === path ? Promise.reject(new Error("disk full")) : real(file, ops));

describe("UndoJournal — undo and redo", () => {
	it("undo writes `before` and redo writes `after`", async () => {
		const h = setup({ [MARA]: { status: "alive" } });
		await h.write(MARA, "status", "dead");
		const undone = await h.journal.undo();
		expect(h.fm(MARA)).toEqual({ ...UNRELATED, status: "alive" });
		expect(undone).toMatchObject({ kind: "applied", direction: "undo", conflicts: [], failedPaths: [], vanishedPaths: [] });
		const redone = await h.journal.redo();
		expect(h.fm(MARA)).toEqual({ ...UNRELATED, status: "dead" });
		expect(redone).toMatchObject({ kind: "applied", direction: "redo", conflicts: [] });
	});

	it("applies the files in recorded order, in both directions", async () => {
		const order: string[] = [];
		const { h } = twoNoteSetup({ wrapRestore: (real) => (file, ops) => (order.push(file.path), real(file, ops)) });
		await h.journal.load();
		await h.journal.undo();
		expect([h.fm(SCENE_4).order, h.fm(SCENE_5).order]).toEqual([10, 11]);
		await h.journal.redo();
		expect([h.fm(SCENE_4).order, h.fm(SCENE_5).order]).toEqual([20, 30]);
		expect(order).toEqual([SCENE_4, SCENE_5, SCENE_4, SCENE_5]);
	});

	it("neither undo nor redo records a new step", async () => {
		const h = setup({ [MARA]: { status: "alive" } });
		await h.write(MARA, "status", "dead");
		await h.journal.undo();
		expect([h.lastSave().undo.length, h.lastSave().redo.length]).toEqual([0, 1]);
		await h.journal.redo();
		expect([h.lastSave().undo.length, h.lastSave().redo.length]).toEqual([1, 0]);
	});

	it("an empty stack writes nothing and gives `empty`", async () => {
		const h = setup({ [MARA]: { status: "alive" } });
		expect(await h.journal.undo()).toEqual({ kind: "empty", direction: "undo" });
		expect(await h.journal.redo()).toEqual({ kind: "empty", direction: "redo" });
		expect(h.app.fileManager.processFrontMatter).not.toHaveBeenCalled();
		expect(h.store.saves).toHaveLength(0);
		expect(h.notices).toEqual(["Nothing to undo", "Nothing to redo"]);
	});
});

describe("UndoJournal — conflicts", () => {
	it("restores the earlier value and puts the overwritten one on redo", async () => {
		const h = setup({ [MARA]: { status: "dead" } });
		await h.write(MARA, "status", "alive");
		h.outsideEdit(MARA, { status: "missing" }); // a script
		const o = await h.journal.undo();
		expect(h.fm(MARA)).toEqual({ ...UNRELATED, status: "dead" });
		expect(o).toMatchObject({ kind: "applied", conflicts: [{
			path: MARA, key: "status", expected: present("alive"), found: present("missing"), written: present("dead"),
		}] });
		expect(h.lastSave().redo[0]!.files[0]!.changes).toEqual([{ key: "status", before: present("dead"), after: present("missing") }]);
		await h.journal.redo();
		expect(h.fm(MARA).status).toBe("missing"); // not "alive"
	});

	it("follows the rule on every apply of undo, redo, undo with outside edits between", async () => {
		const h = setup({ [MARA]: { status: "dead" } });
		await h.write(MARA, "status", "alive");
		h.outsideEdit(MARA, { status: "missing" });
		await h.journal.undo();
		const redo = await h.journal.redo();
		expect(redo).toMatchObject({ kind: "applied", conflicts: [] }); // found dead, expected dead
		expect(h.lastSave().undo[0]!.files[0]!.changes).toEqual([{ key: "status", before: present("dead"), after: present("missing") }]);
		h.outsideEdit(MARA, { status: "lost" });
		const undo = await h.journal.undo();
		expect(undo).toMatchObject({ conflicts: [{ expected: present("missing"), found: present("lost"), written: present("dead") }] });
		expect(h.fm(MARA).status).toBe("dead");
		expect(h.lastSave().redo[0]!.files[0]!.changes).toEqual([{ key: "status", before: present("dead"), after: present("lost") }]);
	});

	it("a conflict on redo is written too, and undo restores what redo overwrote", async () => {
		const h = setup({ [MARA]: { status: "dead" } });
		await h.write(MARA, "status", "alive");
		await h.journal.undo();
		h.outsideEdit(MARA, { status: "missing" });
		const o = await h.journal.redo();
		expect(o).toMatchObject({ conflicts: [{ expected: present("dead"), found: present("missing"), written: present("alive") }] });
		expect(h.fm(MARA).status).toBe("alive");
		await h.journal.undo();
		expect(h.fm(MARA).status).toBe("missing");
	});

	it("an added key is removed by undo and written again by redo", async () => {
		const h = setup({ [MARA]: {} });
		await h.write(MARA, "mood", "calm");
		await h.journal.undo();
		expect(h.fm(MARA)).toEqual({ ...UNRELATED });
		await h.journal.redo();
		expect(h.fm(MARA)).toEqual({ ...UNRELATED, mood: "calm" });
	});

	it("a key deleted outside is restored by undo, and redo deletes it again", async () => {
		const h = setup({ [MARA]: { status: "dead" } });
		await h.write(MARA, "status", "alive");
		h.outsideEdit(MARA, { status: undefined });
		const o = await h.journal.undo();
		expect(o).toMatchObject({ conflicts: [{ expected: present("alive"), found: ABSENT }] });
		expect(h.fm(MARA).status).toBe("dead");
		await h.journal.redo();
		expect(h.fm(MARA)).toEqual({ ...UNRELATED });
	});
});

describe("UndoJournal — failures and vanished notes", () => {
	it("a failure on every file keeps the step on top and gives `failed`", async () => {
		const h = setup({ [MARA]: { status: "alive" } }, { wrapRestore: failing(MARA) });
		await h.write(MARA, "status", "dead");
		const saves = h.store.saves.length;
		const before = h.lastSave().undo[0]!;
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const o = await h.journal.undo();
		expect(o).toEqual({ kind: "failed", direction: "undo", step: before, vanishedPaths: [], changeCounts: { [MARA]: 1 } });
		expect(h.journal.peek()).toEqual({ undo: { label: "status in Mara Stoneway", fieldCount: 1, noteCount: 1 }, redo: null });
		expect(h.fm(MARA).status).toBe("dead");
		expect(h.store.saves).toHaveLength(saves); // no stack change, no save
		expect(h.notices).toEqual(["Couldn't undo the change in Mara Stoneway. It stays on the undo stack; try again."]);
		expect(warn).toHaveBeenCalled();
	});

	it("a partial failure moves the written files and keeps a reduced step of the failed ones", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		const { h } = twoNoteSetup({ wrapRestore: failing(SCENE_4) });
		await h.journal.load();
		const o = await h.journal.undo();
		expect(o).toMatchObject({ kind: "applied", failedPaths: [SCENE_4], vanishedPaths: [], changeCounts: { [SCENE_4]: 1, [SCENE_5]: 1 } });
		expect((o as Extract<UndoOutcome, { kind: "applied" }>).step.files.map((f) => f.path)).toEqual([SCENE_5]);
		expect([h.fm(SCENE_4).order, h.fm(SCENE_5).order]).toEqual([20, 11]);
		const saved = h.lastSave();
		expect(saved.undo).toEqual([{ ...stepOf("multi", [change(SCENE_4, "order", 10, 20)]), at: saved.undo[0]!.at }]);
		expect(saved.redo.map((s) => s.files.map((f) => f.path))).toEqual([[SCENE_5]]);
		expect(saved.redo[0]!.id).toBe("multi");
	});

	it("a missing note gives `vanished` for it and the rest applies", async () => {
		const { h } = twoNoteSetup();
		await h.journal.load();
		h.removeNote(SCENE_5);
		const o = await h.journal.undo();
		expect(o).toMatchObject({ kind: "applied", failedPaths: [], vanishedPaths: [SCENE_5] });
		expect(h.fm(SCENE_4).order).toBe(10);
		expect(h.lastSave()).toEqual({ undo: [], redo: [expect.objectContaining({ files: [change(SCENE_4, "order", 10, 20)] })] });
	});

	it("a step whose every note is gone is dropped and gives `vanished`", async () => {
		const h = setup({ [MARA]: { status: "alive" } });
		await h.write(MARA, "status", "dead");
		h.removeNote(MARA);
		const o = await h.journal.undo();
		expect(o).toEqual({ kind: "vanished", direction: "undo", paths: [MARA], changeCounts: { [MARA]: 1 } });
		expect(h.journal.peek()).toEqual({ undo: null, redo: null });
		expect(h.lastSave()).toEqual({ undo: [], redo: [] });
		expect(h.notices).toEqual(["Mara Stoneway no longer exists; its change was removed from the undo history."]);
	});

	it("counts the changes per note, so a vanished note with several changes reads \"its changes were\" (P10)", async () => {
		const two: FileChanges = { path: SCENE_4, changes: [
			{ key: "order", before: present(10), after: present(20) },
			{ key: "status", before: present("a"), after: present("b") },
		] };
		const h = setup({ [SCENE_4]: { order: 20, status: "b" } }, { store: fakeStore({ undo: [stepOf("two", [two])], redo: [] }) });
		await h.journal.load();
		h.removeNote(SCENE_4);
		const o = await h.journal.undo();
		expect(o).toMatchObject({ kind: "vanished", changeCounts: { [SCENE_4]: 2 } });
		expect(h.notices).toEqual(["Scene 4 no longer exists; its changes were removed from the undo history."]);
	});

	it("a folder at the step's path is not the note, so it reports `vanished`", async () => {
		const h = setup({ [MARA]: { status: "alive" } });
		await h.write(MARA, "status", "dead");
		h.replaceWithFolder(MARA);
		vi.mocked(h.app.fileManager.processFrontMatter).mockClear();
		const o = await h.journal.undo();
		expect(o).toEqual({ kind: "vanished", direction: "undo", paths: [MARA], changeCounts: { [MARA]: 1 } });
		expect(h.app.fileManager.processFrontMatter).not.toHaveBeenCalled();
	});

	it("a failure with a vanished rest gives `failed` with the reduced step", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		const { h } = twoNoteSetup({ wrapRestore: failing(SCENE_4) });
		await h.journal.load();
		h.removeNote(SCENE_5);
		const o = await h.journal.undo();
		expect(o).toMatchObject({
			kind: "failed", step: { id: "multi", files: [change(SCENE_4, "order", 10, 20)] },
			vanishedPaths: [SCENE_5], changeCounts: { [SCENE_4]: 1, [SCENE_5]: 1 },
		});
		expect(outcomeNotice(o)).toBe(
			"Couldn't undo the change in Scene 4. It stays on the undo stack; try again. " +
				"Scene 5 no longer exists; its change was removed from the undo history.",
		);
		expect(h.lastSave().undo.map((s) => s.files.map((f) => f.path))).toEqual([[SCENE_4]]);
	});

	it("a restore that answers the wrong number of slots counts as a failure", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		const h = setup({ [MARA]: { status: "alive" } }, { wrapRestore: () => () => Promise.resolve([]) });
		await h.write(MARA, "status", "dead");
		const o = await h.journal.undo();
		expect(o.kind).toBe("failed");
		expect(h.journal.peek().undo).not.toBeNull();
	});
});

describe("UndoJournal — the serialized queue", () => {
	it("two quick undo() calls run one after the other", async () => {
		let running = 0;
		let most = 0;
		const h = setup({ [MARA]: { status: "alive" } }, {
			wrapRestore: (real) => async (file: TFile, ops) => {
				most = Math.max(most, ++running);
				await new Promise((r) => setTimeout(r, 5));
				try { return await real(file, ops); } finally { running--; }
			},
		});
		await h.write(MARA, "status", "dead");
		await h.write(MARA, "status", "missing");
		const [first, second] = await Promise.all([h.journal.undo(), h.journal.undo()]);
		expect(most).toBe(1);
		expect([first.kind, second.kind]).toEqual(["applied", "applied"]);
		expect(h.fm(MARA).status).toBe("alive");
		expect((second as Extract<UndoOutcome, { kind: "applied" }>).conflicts).toEqual([]);
	});

	it("an unexpected error rejects that call and the next one still runs", async () => {
		const h = setup({ [MARA]: { status: "alive" } });
		await h.write(MARA, "status", "dead");
		vi.mocked(h.app.vault.getFileByPath).mockImplementationOnce(() => { throw new Error("index broken"); });
		await expect(h.journal.undo()).rejects.toThrow("index broken");
		expect((await h.journal.undo()).kind).toBe("applied");
		expect(h.fm(MARA).status).toBe("alive");
	});

	it("a write recorded while an undo runs goes on top, and the undone step still moves to redo", async () => {
		let h!: ReturnType<typeof setup>;
		h = setup({ [MARA]: { status: "alive" }, [SCENE_4]: {} }, {
			wrapRestore: (real) => async (file, ops) => {
				await h.write(SCENE_4, "mood", "calm"); // the user, mid-apply
				return real(file, ops);
			},
		});
		await h.write(MARA, "status", "dead");
		await h.journal.undo();
		expect(h.journal.peek()).toEqual({
			undo: { label: "mood in Scene 4", fieldCount: 1, noteCount: 1 },
			redo: { label: "status in Mara Stoneway", fieldCount: 1, noteCount: 1 },
		});
		expect(h.lastSave().undo).toHaveLength(1);
		expect(h.fm(MARA).status).toBe("alive");
	});

	it("a write recorded while a redo runs clears redo, and the redone step still goes on top", async () => {
		let during = false;
		let h!: ReturnType<typeof setup>;
		h = setup({ [MARA]: { status: "alive" }, [SCENE_4]: {} }, {
			wrapRestore: (real) => async (file, ops) => {
				if (during) await h.write(SCENE_4, "mood", "calm");
				return real(file, ops);
			},
		});
		await h.write(MARA, "status", "dead");
		await h.journal.undo();
		during = true;
		await h.journal.redo();
		const saved = h.lastSave();
		expect(saved.redo).toEqual([]);
		expect(saved.undo.map((s) => s.files[0]!.path)).toEqual([SCENE_4, MARA]);
	});
});

describe("UndoJournal — outcomes", () => {
	it("each outcome reaches every listener with its notice, and notify once", async () => {
		const h = setup({ [MARA]: { status: "alive" } });
		const heard: [UndoOutcome, string][] = [];
		const off = h.journal.onOutcome((o, message) => void heard.push([o, message]));
		await h.write(MARA, "status", "dead");
		const o = await h.journal.undo();
		expect(heard).toEqual([[o, outcomeNotice(o)]]);
		expect(h.notices).toEqual([outcomeNotice(o)]);
		expect(h.notices).toEqual(["Undo: status in Mara Stoneway"]);
		off();
		await h.journal.redo();
		expect(heard).toHaveLength(1);
		expect(h.notices).toHaveLength(2);
	});

	it("a throwing outcome listener does not stop the notice", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		const h = setup({});
		h.journal.onOutcome(() => { throw new Error("boom"); });
		await h.journal.undo();
		expect(h.notices).toEqual(["Nothing to undo"]);
	});
});
