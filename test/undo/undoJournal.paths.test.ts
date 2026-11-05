/**
 * UndoJournal — renames, deletes and the startup prune (spec 009 T2.5).
 *
 * Paths in the history follow the notes: a rename rewrites them on both
 * stacks (a folder rename only below `old/`), a delete drops the records and
 * any step left empty, and the startup prune drops what no longer resolves.
 * Any change saves and notifies; no change does neither.
 *
 * @ref SDD/ADR-47 — AC-F10.1, AC-F10.2
 */
import { afterEach, describe, expect, it } from "vitest";
import { TFile, TFolder, createMockTFile } from "../__mocks__/obsidian";
import type { FileChanges, Step } from "undo/journalTypes";
import { MARA, SCENE_4, SCENE_5, fakeStore, present, setup, stepOf, teardownAndCheckUntouched } from "./journalHarness";

afterEach(teardownAndCheckUntouched);

const edit = (path: string, key = "status"): FileChanges =>
	({ path, changes: [{ key, before: present("a"), after: present("b") }] });

const fileAt = (path: string): TFile => createMockTFile({ path, name: path.split("/").pop()! });
const folderAt = (path: string): TFolder => Object.assign(new TFolder(), { path });

const pathsOf = (steps: readonly Step[]): string[][] => steps.map((s) => s.files.map((f) => f.path));

/** A journal loaded with the given undo and redo steps; notes exist for every path used. */
async function loaded(undo: Step[], redo: Step[] = [], notes: string[] = [MARA, SCENE_4, SCENE_5]) {
	const h = setup(Object.fromEntries(notes.map((n) => [n, {}])), { store: fakeStore({ undo, redo }) });
	await h.journal.load();
	h.store.saves.length = 0;
	let notified = 0;
	h.journal.subscribe(() => void (notified += 1));
	return { h, notified: () => notified };
}

describe("UndoJournal — renames", () => {
	it("a file rename rewrites the exact path on the undo and the redo stack", async () => {
		const { h } = await loaded([stepOf("u", [edit(MARA)])], [stepOf("r", [edit(MARA)])]);
		await h.journal.onRename(fileAt("20 Characters/Mara S.md"), MARA);
		expect(pathsOf(h.lastSave().undo)).toEqual([["20 Characters/Mara S.md"]]);
		expect(pathsOf(h.lastSave().redo)).toEqual([["20 Characters/Mara S.md"]]);
	});

	it("a file rename leaves other files, and a folder-like prefix of its path, alone", async () => {
		const { h } = await loaded([stepOf("u", [edit(MARA), edit(`${MARA}.bak`), edit(SCENE_4)])]);
		await h.journal.onRename(fileAt("X.md"), MARA);
		expect(pathsOf(h.lastSave().undo)).toEqual([["X.md", `${MARA}.bak`, SCENE_4]]);
	});

	it("a folder rename rewrites every path under it, on both stacks", async () => {
		const { h } = await loaded([stepOf("u", [edit(SCENE_4), edit(SCENE_5)])], [stepOf("r", [edit(SCENE_4)])]);
		await h.journal.onRename(folderAt("Scenes"), "30 Scenes");
		expect(pathsOf(h.lastSave().undo)).toEqual([["Scenes/Scene 4.md", "Scenes/Scene 5.md"]]);
		expect(pathsOf(h.lastSave().redo)).toEqual([["Scenes/Scene 4.md"]]);
	});

	it("a folder rename never touches a sibling that merely shares the prefix", async () => {
		const { h } = await loaded([stepOf("u", [edit("Notes/a.md"), edit("Notes2/x.md"), edit("Notes.md")])]);
		await h.journal.onRename(folderAt("Plans"), "Notes");
		expect(pathsOf(h.lastSave().undo)).toEqual([["Plans/a.md", "Notes2/x.md", "Notes.md"]]);
	});

	it("a rename onto a path another record in the step already has keeps one record, the renamed one", async () => {
		const first = edit(MARA, "status");
		const stale = edit(SCENE_4, "order");
		const { h } = await loaded([stepOf("u", [first, stale])]);
		await h.journal.onRename(fileAt(SCENE_4), MARA);
		const files = h.lastSave().undo[0]!.files;
		expect(files).toEqual([{ ...first, path: SCENE_4 }]);
	});

	it("a rename that touches nothing neither saves nor notifies", async () => {
		const { h, notified } = await loaded([stepOf("u", [edit(MARA)])], [stepOf("r", [edit(MARA)])]);
		await h.journal.onRename(fileAt("Z.md"), "Elsewhere.md");
		await h.journal.onRename(folderAt("Z"), "Elsewhere");
		expect(h.store.saves).toHaveLength(0);
		expect(notified()).toBe(0);
	});

	it("a rename saves once and notifies subscribers once", async () => {
		const { h, notified } = await loaded([stepOf("u", [edit(MARA)])]);
		await h.journal.onRename(fileAt("Z.md"), MARA);
		expect(h.store.saves).toHaveLength(1);
		expect(notified()).toBe(1);
	});
});

describe("UndoJournal — deletes", () => {
	it("drops the file's records from both stacks and keeps the other records of a step", async () => {
		const { h } = await loaded([stepOf("u", [edit(MARA), edit(SCENE_4)])], [stepOf("r", [edit(MARA), edit(SCENE_5)])]);
		await h.journal.onDelete(fileAt(MARA));
		expect(pathsOf(h.lastSave().undo)).toEqual([[SCENE_4]]);
		expect(pathsOf(h.lastSave().redo)).toEqual([[SCENE_5]]);
	});

	it("drops a step left with no files", async () => {
		const { h } = await loaded([stepOf("keep", [edit(SCENE_4)]), stepOf("gone", [edit(MARA)])], [stepOf("gone-r", [edit(MARA)])]);
		await h.journal.onDelete(fileAt(MARA));
		expect(h.lastSave().undo.map((s) => s.id)).toEqual(["keep"]);
		expect(h.lastSave().redo).toEqual([]);
		expect(h.journal.peek().redo).toBeNull();
	});

	it("a folder delete drops every record under it and only those", async () => {
		const { h } = await loaded([stepOf("u", [edit(SCENE_4), edit("30 Scenes2/x.md"), edit(MARA)])]);
		await h.journal.onDelete(folderAt("30 Scenes"));
		expect(pathsOf(h.lastSave().undo)).toEqual([["30 Scenes2/x.md", MARA]]);
	});

	it("a file delete does not drop records below a path that merely starts with it", async () => {
		const { h } = await loaded([stepOf("u", [edit("Notes/a.md")])]);
		await h.journal.onDelete(fileAt("Notes"));
		expect(h.store.saves).toHaveLength(0);
	});

	it("saves and notifies on a change, and does neither when nothing matched", async () => {
		const { h, notified } = await loaded([stepOf("u", [edit(MARA)])]);
		await h.journal.onDelete(fileAt("Other.md"));
		expect([h.store.saves.length, notified()]).toEqual([0, 0]);
		await h.journal.onDelete(fileAt(MARA));
		expect([h.store.saves.length, notified()]).toEqual([1, 1]);
	});
});

describe("UndoJournal — pruneUnresolvable", () => {
	it("drops paths that no longer resolve to a note, on both stacks, and empty steps", async () => {
		const { h } = await loaded(
			[stepOf("a", [edit(MARA), edit("Gone.md")]), stepOf("b", [edit("Gone.md")])],
			[stepOf("c", [edit("Gone.md"), edit(SCENE_4)])],
		);
		await h.journal.pruneUnresolvable();
		expect(pathsOf(h.lastSave().undo)).toEqual([[MARA]]);
		expect(pathsOf(h.lastSave().redo)).toEqual([[SCENE_4]]);
	});

	it("treats a folder sitting at a record's path as unresolvable", async () => {
		const { h } = await loaded([stepOf("a", [edit(MARA)])]);
		h.replaceWithFolder(MARA);
		await h.journal.pruneUnresolvable();
		expect(h.journal.peek().undo).toBeNull();
	});

	it("saves and notifies on a change, and does neither when every path resolves", async () => {
		const { h, notified } = await loaded([stepOf("a", [edit(MARA)])]);
		await h.journal.pruneUnresolvable();
		expect([h.store.saves.length, notified()]).toEqual([0, 0]);
		h.removeNote(MARA);
		await h.journal.pruneUnresolvable();
		expect([h.store.saves.length, notified()]).toEqual([1, 1]);
	});
});

describe("UndoJournal — path upkeep and the queue", () => {
	it("a rename during an undo waits for it and then rewrites the settled stacks", async () => {
		let release!: () => void;
		let started!: () => void;
		const begun = new Promise<void>((r) => (started = r));
		const gate = new Promise<void>((r) => (release = r));
		const step = stepOf("u", [edit(MARA)]);
		const h = setup({ [MARA]: { status: "b" } }, {
			store: fakeStore({ undo: [step], redo: [] }),
			wrapRestore: (real) => async (file, ops) => (started(), await gate, real(file, ops)),
		});
		await h.journal.load();
		const undone = h.journal.undo();
		await begun; // the apply is now mid-flight, holding its step
		const renamed = h.journal.onRename(fileAt("Z.md"), MARA);
		release();
		await Promise.all([undone, renamed]);
		expect(pathsOf(h.lastSave().redo)).toEqual([["Z.md"]]);
		expect(h.lastSave().undo).toEqual([]);
	});

	it("a delete during an undo waits for it, then drops the moved step from the redo stack", async () => {
		let release!: () => void;
		let started!: () => void;
		const begun = new Promise<void>((r) => (started = r));
		const gate = new Promise<void>((r) => (release = r));
		const h = setup({ [MARA]: { status: "b" } }, {
			store: fakeStore({ undo: [stepOf("u", [edit(MARA)])], redo: [] }),
			wrapRestore: (real) => async (file, ops) => (started(), await gate, real(file, ops)),
		});
		await h.journal.load();
		const undone = h.journal.undo();
		await begun; // the apply is now mid-flight, holding its step
		const deleted = h.journal.onDelete(fileAt(MARA));
		release();
		await Promise.all([undone, deleted]);
		expect(h.journal.peek()).toEqual({ undo: null, redo: null });
	});

	it("a prune during an undo waits for it, then drops the moved step from the redo stack", async () => {
		let release!: () => void;
		let started!: () => void;
		const begun = new Promise<void>((r) => (started = r));
		const gate = new Promise<void>((r) => (release = r));
		const h = setup({ [MARA]: { status: "b" } }, {
			store: fakeStore({ undo: [stepOf("u", [edit(MARA)])], redo: [] }),
			wrapRestore: (real) => async (file, ops) => (started(), await gate, real(file, ops)),
		});
		await h.journal.load();
		const undone = h.journal.undo();
		await begun; // the apply is now mid-flight, holding its step
		h.removeNote(MARA); // the note no longer resolves while the apply is in flight
		const pruned = h.journal.pruneUnresolvable();
		release();
		await Promise.all([undone, pruned]);
		expect(h.journal.peek()).toEqual({ undo: null, redo: null });
	});
});
