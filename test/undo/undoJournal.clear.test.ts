/**
 * UndoJournal.clear — "Clear undo history" (spec 009 T5.5).
 *
 * @ref SDD/ADR-48 — AC-C.1
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RestoreFn } from "inspector/frontmatterWriter";
import { MARA, fakeStore, setup, teardownAndCheckUntouched, type FakeStore } from "./journalHarness";

afterEach(teardownAndCheckUntouched);

function spyStore(): FakeStore & { remove: ReturnType<typeof vi.fn> } {
	return Object.assign(fakeStore(), { remove: vi.fn(() => Promise.resolve()) });
}

async function withBothStacks() {
	const store = spyStore();
	const h = setup({ [MARA]: { status: "alive" } }, { store });
	await h.write(MARA, "status", "dead");
	await h.write(MARA, "status", "missing");
	await h.journal.undo();
	expect(h.journal.peek().undo).not.toBeNull();
	expect(h.journal.peek().redo).not.toBeNull();
	return { h, store };
}

const flushMicrotasks = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe("UndoJournal — clear", () => {
	it("empties both stacks", async () => {
		const { h } = await withBothStacks();
		await h.journal.clear();
		expect(h.journal.peek()).toEqual({ undo: null, redo: null });
	});

	it("deletes the stored file", async () => {
		const { h, store } = await withBothStacks();
		await h.journal.clear();
		expect(store.remove).toHaveBeenCalledTimes(1);
	});

	it("notifies subscribers once", async () => {
		const { h } = await withBothStacks();
		const listener = vi.fn();
		h.journal.subscribe(listener);
		await h.journal.clear();
		expect(listener).toHaveBeenCalledTimes(1);
	});

	it("does not re-save the emptied state over the deleted file", async () => {
		const { h, store } = await withBothStacks();
		const saved = store.saves.length;
		await h.journal.clear();
		expect(store.saves).toHaveLength(saved);
	});

	it("leaves the notes alone", async () => {
		const { h } = await withBothStacks();
		const before = h.fm(MARA);
		await h.journal.clear();
		expect(h.fm(MARA)).toEqual(before);
	});

	it("works on empty stacks, and later changes record again", async () => {
		const h = setup({ [MARA]: { status: "alive" } });
		await h.journal.clear();
		await h.write(MARA, "status", "dead");
		expect(h.journal.peek().undo).not.toBeNull();
	});

	it("waits for an undo in flight, then empties the settled stacks", async () => {
		let release!: () => void;
		let entered!: () => void;
		const gate = new Promise<void>((r) => (release = r));
		const inFlight = new Promise<void>((r) => (entered = r));
		const wrap = (real: RestoreFn): RestoreFn => async (file, ops) => { entered(); await gate; return real(file, ops); };
		const h = setup({ [MARA]: { status: "alive" } }, { wrapRestore: wrap });
		await h.write(MARA, "status", "dead");
		const undoing = h.journal.undo();
		await inFlight;
		let cleared = false;
		const clearing = h.journal.clear().then(() => { cleared = true; });
		await flushMicrotasks();
		expect(cleared).toBe(false);
		release();
		await undoing;
		await clearing;
		expect(h.journal.peek()).toEqual({ undo: null, redo: null });
		expect(h.fm(MARA).status).toBe("alive"); // the undo completed before the clear
	});
});
