/**
 * UndoJournal — persistence gate, flush and the T2.4 review carry-overs (spec 009 T2.6).
 *
 * @ref SDD/ADR-48 — AC-F7.2, AC-F7.3, AC-F7.4, AC-F7.8
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { MARA, fakeStore, present, setup, stepOf, teardownAndCheckUntouched, type FakeStore } from "./journalHarness";

afterEach(teardownAndCheckUntouched);

const seeded = (id = "u-9-9") => stepOf(id, [{ path: MARA, changes: [{ key: "status", before: present("alive"), after: present("dead") }] }]);

function spyStore(initial = { undo: [seeded()], redo: [] as ReturnType<typeof seeded>[] }) {
	const store = fakeStore(initial);
	return Object.assign(store, {
		flushNow: vi.fn(() => Promise.resolve()),
		remove: vi.fn(() => Promise.resolve()),
		load: vi.fn(() => Promise.resolve(initial)),
	}) as FakeStore & { flushNow: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn>; load: ReturnType<typeof vi.fn> };
}

describe("UndoJournal — persistence off", () => {
	it("load() reads nothing and the stacks stay empty", async () => {
		const store = spyStore();
		const h = setup({ [MARA]: { status: "alive" } }, { store, persist: () => false });
		await h.journal.load();
		expect(store.load).not.toHaveBeenCalled();
		expect(h.journal.peek().undo).toBeNull();
	});

	it("a recorded step is kept in memory and issues no save", async () => {
		const store = spyStore();
		const h = setup({ [MARA]: { status: "alive" } }, { store, persist: () => false });
		await h.write(MARA, "status", "dead");
		expect(h.journal.peek().undo).not.toBeNull();
		expect(store.saves).toHaveLength(0);
	});
});

describe("UndoJournal — setPersistence", () => {
	it("off deletes the file and stops saving; the stacks stay", async () => {
		const store = spyStore();
		const h = setup({ [MARA]: { status: "alive" } }, { store });
		await h.write(MARA, "status", "dead");
		await h.journal.setPersistence(false);
		expect(store.remove).toHaveBeenCalledTimes(1);
		const saved = store.saves.length;
		await h.write(MARA, "status", "alive");
		expect(store.saves).toHaveLength(saved);
		expect(h.journal.peek().undo).not.toBeNull();
	});

	it("on saves the current state, then later changes save again", async () => {
		const store = spyStore();
		const h = setup({ [MARA]: { status: "alive" } }, { store, persist: () => false });
		await h.write(MARA, "status", "dead");
		await h.journal.setPersistence(true);
		expect(store.saves).toHaveLength(1);
		expect(store.saves[0]!.undo).toHaveLength(1);
		await h.write(MARA, "status", "alive");
		expect(store.saves).toHaveLength(2);
	});

	it("off then on without a change saves the state once", async () => {
		const store = spyStore();
		const h = setup({ [MARA]: { status: "alive" } }, { store });
		await h.journal.setPersistence(false);
		await h.journal.setPersistence(true);
		expect(store.saves).toHaveLength(1);
	});
});

describe("UndoJournal — flushNow and dispose", () => {
	it("flushNow hands over to the store", async () => {
		const store = spyStore();
		const h = setup({ [MARA]: { status: "alive" } }, { store });
		await h.journal.flushNow();
		expect(store.flushNow).toHaveBeenCalledTimes(1);
	});

	it("flushNow with persistence off does not touch the store", async () => {
		const store = spyStore();
		const h = setup({ [MARA]: { status: "alive" } }, { store, persist: () => false });
		await h.journal.flushNow();
		expect(store.flushNow).not.toHaveBeenCalled();
	});

	it("after dispose a recorded step issues no save", async () => {
		const store = spyStore();
		const h = setup({ [MARA]: { status: "alive" } }, { store });
		h.journal.dispose();
		await h.write(MARA, "status", "dead");
		expect(store.saves).toHaveLength(0);
	});

	it("an apply in flight when dispose runs does not save", async () => {
		const store = spyStore();
		let release: () => void = () => undefined;
		let started = false;
		const h = setup({ [MARA]: { status: "alive" } }, {
			store,
			wrapRestore: (real) => async (file, ops) => {
				started = true;
				await new Promise<void>((r) => { release = r; });
				return real(file, ops);
			},
		});
		await h.write(MARA, "status", "dead");
		const saved = store.saves.length;
		const undone = h.journal.undo();
		await vi.waitFor(() => expect(started).toBe(true));
		h.journal.dispose();
		release();
		await undone;
		expect(store.saves).toHaveLength(saved);
	});
});

describe("UndoJournal — carry-overs from the T2.4 review", () => {
	it("a throwing notify does not reject undo() and the outcome still reaches listeners", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const h = setup({ [MARA]: { status: "alive" } }, { notify: () => { throw new Error("boom"); } });
		const heard = vi.fn();
		h.journal.onOutcome(heard);
		await h.write(MARA, "status", "dead");
		await expect(h.journal.undo()).resolves.toMatchObject({ kind: "applied" });
		expect(heard).toHaveBeenCalledTimes(1);
		expect(warn).toHaveBeenCalled();
		expect(h.fm(MARA).status).toBe("alive");
	});

	it("a rejected store.load() rejects load(), and a later undo() still runs", async () => {
		const store = spyStore();
		store.load.mockRejectedValueOnce(new Error("EIO"));
		const h = setup({ [MARA]: { status: "alive" } }, { store });
		await expect(h.journal.load()).rejects.toThrow("EIO");
		await h.write(MARA, "status", "dead");
		await expect(h.journal.undo()).resolves.toMatchObject({ kind: "applied" });
	});

	it("a failed load can be tried again", async () => {
		const store = spyStore();
		store.load.mockRejectedValueOnce(new Error("EIO"));
		const h = setup({ [MARA]: { status: "alive" } }, { store });
		await expect(h.journal.load()).rejects.toThrow();
		await h.journal.load();
		expect(h.journal.peek().undo).not.toBeNull();
	});

	it("calling load() twice does not duplicate steps", async () => {
		const store = spyStore({ undo: [seeded("u-1-1"), seeded("u-2-2")], redo: [] });
		const h = setup({ [MARA]: { status: "alive" } }, { store });
		await Promise.all([h.journal.load(), h.journal.load()]);
		await h.journal.load();
		expect(store.load).toHaveBeenCalledTimes(1);
		const outcome = await h.journal.undo();
		const second = await h.journal.undo();
		const third = await h.journal.undo();
		expect([outcome.kind, second.kind, third.kind]).not.toContain("failed");
		expect(third.kind).toBe("empty");
	});
});
