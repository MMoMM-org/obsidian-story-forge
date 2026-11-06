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
import { GROUP_TIMEOUT_MS, MAX_STEPS, MAX_VALUE_CHARS } from "undo/undoJournal";
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

	it("a recorded step's id is u-<at>-<counter> in decimal (SDD PersistedStep.id)", async () => {
		const h = setup({ [MARA]: { status: "alive" } });
		await h.write(MARA, "status", "dead");
		const [step] = h.lastSave().undo;
		expect(step!.id).toMatch(/^u-\d+-\d+$/);
		expect(step!.id.split("-")[1]).toBe(String(step!.at));
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

describe("UndoJournal — gesture groups (ADR-38)", () => {
	afterEach(() => vi.useRealTimers());

	it("writes with a group collect into one step, committed when the last hold closes", async () => {
		const h = setup({ [MARA]: { status: "alive" }, [SCENE_4]: {} });
		const g = h.journal.openGroup();
		await h.write(MARA, "status", "dead", g);
		await h.write(SCENE_4, "mood", "calm", g);
		expect(h.journal.peek().undo).toBeNull();
		g.close();
		await g.settled;
		expect(h.lastSave().undo).toHaveLength(1);
		expect(h.lastSave().undo[0]!.files.map((f) => f.path)).toEqual([MARA, SCENE_4]);
		expect(h.journal.peek().undo).toEqual({ label: "2 changes in 2 notes", fieldCount: 2, noteCount: 2 });
	});

	it("a join needs its own close", async () => {
		const h = setup({ [MARA]: {} });
		const g = h.journal.openGroup();
		g.join();
		await h.write(MARA, "order", 1, g);
		g.close();
		expect(h.journal.peek().undo).toBeNull();
		g.close();
		await g.settled;
		expect(h.journal.peek().undo).not.toBeNull();
	});

	it("the group waits for a tracked promise, and commits after it settles", async () => {
		const h = setup({ [MARA]: {} });
		const g = h.journal.openGroup();
		let release!: () => void;
		void g.track(new Promise<void>((r) => (release = r)));
		g.close();
		await Promise.resolve();
		expect(h.journal.peek().undo).toBeNull();
		await h.write(MARA, "order", 1, g);
		expect(h.journal.peek().undo).toBeNull(); // closed, but still waiting for the tracked promise
		release();
		await g.settled;
		expect(h.lastSave().undo).toHaveLength(1);
	});

	it("track returns the promise it was given", async () => {
		const h = setup({});
		const g = h.journal.openGroup();
		const p = Promise.resolve(7);
		expect(g.track(p)).toBe(p);
		g.close();
		await g.settled;
	});

	it("a rejected tracked promise still lets the group commit", async () => {
		const h = setup({ [MARA]: {} });
		const g = h.journal.openGroup();
		await h.write(MARA, "order", 1, g);
		const failing = g.track(Promise.reject(new Error("renumber failed")));
		g.close();
		await expect(failing).rejects.toThrow("renumber failed");
		await g.settled;
		expect(h.journal.peek().undo).not.toBeNull();
	});

	it("an empty group commits nothing and notifies nobody", async () => {
		const h = setup({});
		const listener = vi.fn();
		h.journal.subscribe(listener);
		const g = h.journal.openGroup();
		g.close();
		await g.settled;
		expect(h.journal.peek().undo).toBeNull();
		expect(listener).not.toHaveBeenCalled();
		expect(h.store.saves).toHaveLength(0);
	});

	it("the same key twice keeps the first before and the last after", async () => {
		const h = setup({ [MARA]: { status: "alive" } });
		const g = h.journal.openGroup();
		await h.write(MARA, "status", "dead", g);
		await h.write(MARA, "status", "missing", g);
		g.close();
		await g.settled;
		expect(h.lastSave().undo[0]!.files).toEqual([
			{ path: MARA, changes: [{ key: "status", before: present("alive"), after: present("missing") }] },
		]);
	});

	it("an A to B to A sequence drops the change, and an all-dropped group records nothing", async () => {
		const h = setup({ [MARA]: { status: "alive" } });
		const listener = vi.fn();
		h.journal.subscribe(listener);
		const g = h.journal.openGroup();
		await h.write(MARA, "status", "dead", g);
		await h.write(MARA, "status", "alive", g);
		g.close();
		await g.settled;
		expect(h.journal.peek().undo).toBeNull();
		expect(listener).not.toHaveBeenCalled();
		expect(h.store.saves).toHaveLength(0);
	});

	it("a dropped change leaves the group's other changes, in first-write order", async () => {
		const h = setup({ [MARA]: { status: "alive" }, [SCENE_4]: {} });
		const g = h.journal.openGroup();
		await h.write(MARA, "status", "dead", g);
		await h.write(SCENE_4, "mood", "calm", g);
		await h.write(MARA, "status", "alive", g);
		g.close();
		await g.settled;
		expect(h.lastSave().undo[0]!.files.map((f) => f.path)).toEqual([SCENE_4]);
	});

	it("a group step follows the ungrouped rules: clears redo, notifies, saves once", async () => {
		const h = setup({ [MARA]: { status: "alive" } });
		await h.write(MARA, "status", "dead");
		await h.journal.undo();
		const listener = vi.fn();
		h.journal.subscribe(listener);
		const saves = h.store.saves.length;
		const g = h.journal.openGroup();
		await h.write(MARA, "status", "missing", g);
		g.close();
		await g.settled;
		expect(h.journal.peek().redo).toBeNull();
		expect(listener).toHaveBeenCalledTimes(1);
		expect(h.store.saves).toHaveLength(saves + 1);
	});

	it("a group step over the value limit is not persisted, and the 51st step still caps the stack", async () => {
		const h = setup({ [MARA]: {} });
		const g = h.journal.openGroup();
		await h.write(MARA, "notes", "x".repeat(MAX_VALUE_CHARS), g);
		g.close();
		await g.settled;
		expect(h.lastSave().undo[0]!.persist).toBe(false);
		for (let i = 1; i <= MAX_STEPS; i++) {
			const gi = h.journal.openGroup();
			await h.write(MARA, "order", i, gi);
			gi.close();
			await gi.settled;
		}
		expect(h.lastSave().undo).toHaveLength(MAX_STEPS);
	});

	it("a group open after 10 s force-closes with a warning", async () => {
		vi.useFakeTimers();
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const h = setup({ [MARA]: {} });
		const g = h.journal.openGroup();
		await h.write(MARA, "order", 1, g);
		await vi.advanceTimersByTimeAsync(GROUP_TIMEOUT_MS - 1);
		expect(h.journal.peek().undo).toBeNull();
		await vi.advanceTimersByTimeAsync(1);
		await g.settled;
		expect(h.journal.peek().undo).not.toBeNull();
		expect(warn).toHaveBeenCalled();
	});

	it("a group that commits in time leaves no timer behind", async () => {
		vi.useFakeTimers();
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const h = setup({ [MARA]: {} });
		const g = h.journal.openGroup();
		await h.write(MARA, "order", 1, g);
		g.close();
		await g.settled;
		expect(vi.getTimerCount()).toBe(0);
		await vi.advanceTimersByTimeAsync(GROUP_TIMEOUT_MS * 2);
		expect(warn).not.toHaveBeenCalled();
	});

	it("a write that arrives after its group committed records its own step and warns", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const h = setup({ [MARA]: { status: "alive" }, [SCENE_4]: {} });
		const g = h.journal.openGroup();
		await h.write(MARA, "status", "dead", g);
		g.close();
		await g.settled;
		expect(warn).not.toHaveBeenCalled();
		await h.write(SCENE_4, "mood", "calm", g);
		expect(h.lastSave().undo).toHaveLength(2);
		expect(h.journal.peek().undo!.label).toBe("mood in Scene 4");
		expect(warn).toHaveBeenCalledTimes(1);
	});

	it("group(fn) hands fn a group, closes it afterwards and returns fn's value", async () => {
		const h = setup({ [MARA]: {} });
		const result = await h.journal.group(async (g) => {
			await h.write(MARA, "order", 1, g);
			expect(h.journal.peek().undo).toBeNull();
			return "done";
		});
		expect(result).toBe("done");
		expect(h.journal.peek().undo).not.toBeNull();
	});

	it("group(fn) closes in finally when fn throws", async () => {
		const h = setup({ [MARA]: {} });
		await expect(h.journal.group(async (g) => {
			await h.write(MARA, "order", 1, g);
			throw new Error("gesture failed");
		})).rejects.toThrow("gesture failed");
		expect(h.journal.peek().undo).not.toBeNull();
	});

	it("dispose closes open groups: they commit without a save and settle", async () => {
		const h = setup({ [MARA]: {} });
		const g = h.journal.openGroup();
		await h.write(MARA, "order", 1, g);
		h.journal.dispose();
		await g.settled;
		expect(h.journal.peek().undo).not.toBeNull();
		expect(h.store.saves).toHaveLength(0);
	});
});
