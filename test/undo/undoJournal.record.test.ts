/**
 * UndoJournal — recording and the two stacks (spec 009 T2.4).
 *
 * Every write the writer reports is its own step (groups are Phase 3); the
 * newest is on top, a new step clears redo, each stack keeps 50 steps, and
 * every stack change reaches subscribers and the store.
 *
 * @ref SDD/ADR-46, ADR-48 — AC-F2.1, AC-F2.2, AC-F2.3
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_STEPS, MAX_VALUE_CHARS } from "undo/undoJournal";
import { ABSENT, MARA, SCENE_4, fakeStore, present, setup, stepOf, teardownAndCheckUntouched } from "./journalHarness";

afterEach(teardownAndCheckUntouched);

describe("UndoJournal — record", () => {
	it("a recorded change becomes the top step", async () => {
		const h = setup({ [MARA]: { status: "alive" } });
		await h.write(MARA, "status", "dead");
		expect(h.journal.peek()).toEqual({
			undo: { label: "status in Mara Stoneway", fieldCount: 1, noteCount: 1 },
			redo: null,
		});
		const [step] = h.lastSave().undo;
		expect(step!.files).toEqual([{ path: MARA, changes: [{ key: "status", before: present("alive"), after: present("dead") }] }]);
		expect(step!.at).toBe(1_000);
	});

	it("the newest step is on top and each call is its own step", async () => {
		const h = setup({ [MARA]: { status: "alive" }, [SCENE_4]: {} });
		await h.write(MARA, "status", "dead");
		await h.write(SCENE_4, "mood", "calm");
		expect(h.lastSave().undo.map((s) => s.files[0]!.path)).toEqual([MARA, SCENE_4]);
		expect(h.journal.peek().undo!.label).toBe("mood in Scene 4");
		const ids = h.lastSave().undo.map((s) => s.id);
		expect(new Set(ids).size).toBe(2);
	});

	it("an empty change list records nothing", () => {
		const h = setup({});
		h.journal.record(MARA, [], undefined);
		expect(h.journal.peek()).toEqual({ undo: null, redo: null });
		expect(h.store.saves).toHaveLength(0);
	});

	it("a new step clears redo", async () => {
		const h = setup({ [MARA]: { status: "alive" } });
		await h.write(MARA, "status", "dead");
		await h.journal.undo();
		expect(h.journal.peek().redo).not.toBeNull();
		await h.write(MARA, "status", "missing");
		expect(h.journal.peek().redo).toBeNull();
		expect(h.lastSave().redo).toEqual([]);
	});

	it("the 51st step on undo drops the oldest", async () => {
		const h = setup({ [MARA]: {} });
		for (let i = 1; i <= MAX_STEPS + 1; i++) await h.write(MARA, "order", i);
		const undo = h.lastSave().undo;
		expect(undo).toHaveLength(50);
		expect(undo[0]!.files[0]!.changes[0]!.after).toEqual(present(2));
		expect(undo[49]!.files[0]!.changes[0]!.after).toEqual(present(51));
	});

	it("the 51st step on redo drops the oldest", async () => {
		// Only a loaded journal can hold 50 on redo and one more on undo.
		const redo = Array.from({ length: MAX_STEPS }, (_, i) =>
			stepOf(`r${i}`, [{ path: MARA, changes: [{ key: "order", before: present(i), after: present(i + 1) }] }]));
		const top = stepOf("u", [{ path: MARA, changes: [{ key: "status", before: present("alive"), after: present("dead") }] }]);
		const h = setup({ [MARA]: { status: "dead" } }, { store: fakeStore({ undo: [top], redo }) });
		await h.journal.load();
		await h.journal.undo();
		const saved = h.lastSave().redo;
		expect(saved).toHaveLength(50);
		expect(saved.map((s) => s.id)).toEqual([...redo.slice(1).map((s) => s.id), "u"]);
	});

	it("peek() and subscribe follow every stack change", async () => {
		const h = setup({ [MARA]: { status: "alive" } });
		const seen: unknown[] = [];
		h.journal.subscribe(() => seen.push(h.journal.peek()));
		await h.write(MARA, "status", "dead");
		await h.journal.undo();
		await h.journal.redo();
		await h.journal.redo(); // empty: no stack change
		const label = { label: "status in Mara Stoneway", fieldCount: 1, noteCount: 1 };
		expect(seen).toEqual([
			{ undo: label, redo: null },
			{ undo: null, redo: label },
			{ undo: label, redo: null },
		]);
		expect(h.store.saves).toHaveLength(3);
	});

	it("an unsubscribed listener hears nothing more", async () => {
		const h = setup({ [MARA]: {} });
		const listener = vi.fn();
		const off = h.journal.subscribe(listener);
		await h.write(MARA, "order", 1);
		off();
		await h.write(MARA, "order", 2);
		expect(listener).toHaveBeenCalledTimes(1);
	});

	it("a throwing subscriber neither stops the others nor the step", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const h = setup({ [MARA]: {} });
		h.journal.subscribe(() => { throw new Error("boom"); });
		const second = vi.fn();
		h.journal.subscribe(second);
		await h.write(MARA, "order", 1);
		expect(second).toHaveBeenCalledTimes(1);
		expect(h.journal.peek().undo).not.toBeNull();
		expect(warn).toHaveBeenCalled();
	});

	it("dispose drops every listener", async () => {
		const h = setup({ [MARA]: {} });
		const listener = vi.fn();
		const outcome = vi.fn();
		h.journal.subscribe(listener);
		h.journal.onOutcome(outcome);
		h.journal.dispose();
		await h.write(MARA, "order", 1);
		await h.journal.undo();
		expect(listener).not.toHaveBeenCalled();
		expect(outcome).not.toHaveBeenCalled();
	});
});

describe("UndoJournal — the persist flag (ADR-48)", () => {
	// A string of n chars is n + 2 chars of JSON (the quotes).
	const ofJsonLength = (n: number): string => "x".repeat(n - 2);

	it("a step whose values fit is persisted", async () => {
		const h = setup({ [MARA]: {} });
		await h.write(MARA, "notes", ofJsonLength(MAX_VALUE_CHARS));
		expect(h.lastSave().undo[0]!.persist).toBe(true);
	});

	it("a step with an `after` over 16,384 chars is not persisted", async () => {
		const h = setup({ [MARA]: {} });
		await h.write(MARA, "notes", ofJsonLength(MAX_VALUE_CHARS + 1));
		expect(h.lastSave().undo[0]!.persist).toBe(false);
	});

	it("a step with a `before` over 16,384 chars is not persisted", async () => {
		const h = setup({ [MARA]: { notes: ofJsonLength(MAX_VALUE_CHARS + 1) } });
		await h.write(MARA, "notes", "short");
		expect(h.lastSave().undo[0]!.persist).toBe(false);
	});

	it("a moved step is flagged by what the apply found", async () => {
		const h = setup({ [MARA]: { notes: "a" } });
		await h.write(MARA, "notes", "b");
		h.outsideEdit(MARA, { notes: ofJsonLength(MAX_VALUE_CHARS + 1) });
		await h.journal.undo();
		expect(h.lastSave().redo[0]!.persist).toBe(false);
	});
});

describe("UndoJournal — load", () => {
	it("load takes both stacks from the store and tells subscribers", async () => {
		const a = stepOf("a", [{ path: MARA, changes: [{ key: "status", before: ABSENT, after: present("dead") }] }]);
		const b = stepOf("b", [{ path: SCENE_4, changes: [{ key: "mood", before: present("x"), after: present("y") }] }]);
		const h = setup({ [MARA]: {}, [SCENE_4]: {} }, { store: fakeStore({ undo: [a], redo: [b] }) });
		const listener = vi.fn();
		h.journal.subscribe(listener);
		await h.journal.load();
		expect(h.journal.peek()).toEqual({
			undo: { label: "status in Mara Stoneway", fieldCount: 1, noteCount: 1 },
			redo: { label: "mood in Scene 4", fieldCount: 1, noteCount: 1 },
		});
		expect(listener).toHaveBeenCalledTimes(1);
		expect(h.store.saves).toHaveLength(0);
	});

	it("load keeps only the newest 50 steps of each stored stack", async () => {
		// The notes do not exist, so the undo below only drops its step: that save shows both lengths.
		const many = (prefix: string) => Array.from({ length: MAX_STEPS + 1 }, (_, i) =>
			stepOf(`${prefix}${i}`, [{ path: `gone/${prefix}${i}.md`, changes: [{ key: "k", before: ABSENT, after: present(i) }] }]));
		const h = setup({}, { store: fakeStore({ undo: many("u"), redo: many("r") }) });
		await h.journal.load();
		await h.journal.undo();
		const saved = h.lastSave();
		expect([saved.undo.length, saved.redo.length]).toEqual([49, 50]);
		expect(saved.undo[0]!.id).toBe("u1");
		expect(saved.redo[0]!.id).toBe("r1");
	});

	it("an undo asked for while load runs waits for it", async () => {
		const a = stepOf("a", [{ path: MARA, changes: [{ key: "status", before: present("alive"), after: present("dead") }] }]);
		const store = fakeStore({ undo: [a], redo: [] });
		let release!: () => void;
		const gate = new Promise<void>((r) => (release = r));
		const load = store.load;
		const h = setup({ [MARA]: { status: "dead" } }, { store: { ...store, load: () => gate.then(load) } });
		const loading = h.journal.load();
		const undoing = h.journal.undo();
		release();
		await loading;
		expect((await undoing).kind).toBe("applied");
		expect(h.fm(MARA).status).toBe("alive");
	});

	it("a step recorded before load resolves stays on top, and the loaded redo is dropped", async () => {
		const a = stepOf("a", [{ path: MARA, changes: [{ key: "status", before: ABSENT, after: present("dead") }] }]);
		const b = stepOf("b", [{ path: SCENE_4, changes: [{ key: "mood", before: present("x"), after: present("y") }] }]);
		const h = setup({ [MARA]: {}, [SCENE_4]: {} }, { store: fakeStore({ undo: [a], redo: [b] }) });
		await h.write(SCENE_4, "order", 3);
		await h.journal.load();
		const saved = h.lastSave();
		expect(saved.undo.map((s) => s.id)).toEqual(["a", saved.undo[1]!.id]);
		expect(saved.undo[1]!.files[0]!.changes[0]!.key).toBe("order");
		expect(saved.redo).toEqual([]);
	});
});
