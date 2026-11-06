/**
 * UndoJournal — pending work (spec 009 T3.2).
 *
 * Undo and redo first run the flushers, then wait for open groups, then pick the
 * top step and ask every probe about every path in it. A busy note refuses the
 * request: nothing is written and the stacks stay as they were. The same
 * sequence runs for both directions.
 *
 * @ref SDD/ADR-39, Traced walkthrough 3 — AC-F8.1–AC-F8.5
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { outcomeNotice } from "undo/stepLabel";
import type { JournalGroup, PendingReason, UndoDirection } from "undo/journalTypes";
import type { Harness } from "./journalHarness";
import { MARA, SCENE_4, SCENE_5, UNRELATED, fakeStore, present, setup, stepOf, teardownAndCheckUntouched } from "./journalHarness";

afterEach(teardownAndCheckUntouched);

const DIRECTIONS: readonly UndoDirection[] = ["undo", "redo"];

/** One write to Mara; for "redo" it is undone first, so `dir` has exactly that step on top. */
async function primed(dir: UndoDirection): Promise<Harness> {
	const h = setup({ [MARA]: { status: "alive" }, [SCENE_4]: { order: 1 } });
	await h.write(MARA, "status", "dead");
	if (dir === "redo") await h.journal.undo();
	h.notices.length = 0;
	return h;
}

/** Mara's status as `dir` leaves it once applied, and as it stands before. */
const applied = (dir: UndoDirection): string => (dir === "undo" ? "alive" : "dead");
const before = (dir: UndoDirection): string => (dir === "undo" ? "dead" : "alive");

/**
 * Resolve after the microtask queue has drained a few times. A fixed count is safe here because every
 * negative assertion that relies on it is followed by a later positive one, which fails if a wait was cut short.
 */
const ticks = async (): Promise<void> => {
	for (let i = 0; i < 10; i++) await Promise.resolve();
};

describe.each(DIRECTIONS)("pending work — %s", (dir) => {
	it("runs every flusher and awaits it before choosing the step", async () => {
		const h = await primed(dir);
		const log: string[] = [];
		let release!: () => void;
		h.journal.registerFlusher(() => new Promise<void>((r) => (release = () => (log.push("flushed"), r()))));
		h.journal.registerFlusher(() => (log.push("second"), Promise.resolve()));
		const done = h.journal[dir]().then((o) => (log.push(o.kind), o));
		await ticks();
		expect(log).toEqual(["second"]);
		expect(h.fm(MARA).status).toBe(before(dir));
		release();
		await done;
		expect(log).toEqual(["second", "flushed", "applied"]);
	});

	it("takes the step a flusher wrote as the top of the stack", async () => {
		const h = await primed(dir);
		h.journal.registerFlusher(() => h.write(SCENE_4, "order", 2));
		const outcome = await h.journal[dir]();
		if (dir === "undo") {
			expect(h.fm(SCENE_4).order).toBe(1);
			expect(h.fm(MARA).status).toBe("dead");
			expect(outcome).toMatchObject({ kind: "applied" });
		} else {
			expect(outcome).toEqual({ kind: "empty", direction: "redo" }); // the flusher's write cleared redo
		}
	});

	it("waits for an open group, then applies the step it committed", async () => {
		const h = await primed(dir);
		const g = h.journal.openGroup();
		await h.write(SCENE_4, "order", 2, g);
		const settledBefore = vi.fn();
		const done = h.journal[dir]().then(settledBefore);
		await ticks();
		expect(settledBefore).not.toHaveBeenCalled();
		expect(h.fm(SCENE_4).order).toBe(2);
		g.close();
		await done;
		if (dir === "undo") expect(h.fm(SCENE_4).order).toBe(1); // the committed group step was the top
		else expect(h.fm(MARA).status).toBe("alive"); // the group's step cleared redo: nothing applied
	});

	it("keeps waiting for a group opened while it waited for another", async () => {
		const h = await primed(dir);
		const first = h.journal.openGroup();
		const done = h.journal[dir]();
		const settledAfter = vi.fn();
		void done.then(settledAfter);
		await ticks();
		const second = h.journal.openGroup();
		first.close();
		await ticks();
		expect(settledAfter).not.toHaveBeenCalled();
		second.close();
		await done;
		expect(settledAfter).toHaveBeenCalled();
	});

	it("waits for a group that is opened and closed while the flushers run", async () => {
		const h = await primed(dir);
		let group!: JournalGroup;
		h.journal.registerFlusher(async () => {
			group = h.journal.openGroup();
			await h.write(SCENE_4, "order", 2, group);
		});
		const done = h.journal[dir]();
		await ticks(); // the flushers have finished and the group is still open: apply is waiting on it
		group.close();
		await done;
		if (dir === "undo") expect(h.fm(SCENE_4).order).toBe(1); // undo took the group's step
		else {
			expect(h.fm(SCENE_4).order).toBe(2);
			expect(h.fm(MARA).status).toBe("alive"); // the group's step cleared redo: nothing applied
		}
	});

	it.each<PendingReason>(["draft", "write"])("a probe reporting %s on the step's note refuses and changes nothing", async (reason) => {
		const h = await primed(dir);
		const stacks = h.journal.peek();
		h.journal.registerProbe((p) => (p === MARA ? reason : null));
		const outcome = await h.journal[dir]();
		expect(outcome).toEqual({ kind: "refused", direction: dir, path: MARA, reason });
		expect(h.fm(MARA).status).toBe(before(dir));
		expect(h.journal.peek()).toEqual(stacks);
		expect(h.notices).toEqual([outcomeNotice(outcome)]);
		expect(h.notices[0]).toContain("Save or discard your edit first");
	});

	it("proceeds when the busy note is not in the step", async () => {
		const h = await primed(dir);
		h.journal.registerProbe((p) => (p === SCENE_4 ? "draft" : null));
		expect(await h.journal[dir]()).toMatchObject({ kind: "applied" });
		expect(h.fm(MARA).status).toBe(applied(dir));
	});

	it("applies on the next request once the probe clears", async () => {
		const h = await primed(dir);
		let busy: PendingReason | null = "draft";
		h.journal.registerProbe(() => busy);
		expect((await h.journal[dir]()).kind).toBe("refused");
		busy = null;
		expect((await h.journal[dir]()).kind).toBe("applied");
		expect(h.fm(MARA).status).toBe(applied(dir));
	});

	it("stops asking a probe once it is unregistered", async () => {
		const h = await primed(dir);
		const off = h.journal.registerProbe(() => "draft");
		off();
		expect((await h.journal[dir]()).kind).toBe("applied");
	});

	it("stops running a flusher once it is unregistered", async () => {
		const h = await primed(dir);
		const flush = vi.fn(() => Promise.resolve());
		h.journal.registerFlusher(flush)();
		await h.journal[dir]();
		expect(flush).not.toHaveBeenCalled();
	});

	it("warns about a throwing flusher and still applies", async () => {
		const h = await primed(dir);
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		h.journal.registerFlusher(() => Promise.reject(new Error("flush failed")));
		h.journal.registerFlusher(() => {
			throw new Error("sync failure");
		});
		expect((await h.journal[dir]()).kind).toBe("applied");
		expect(warn).toHaveBeenCalledTimes(2);
	});

	it("warns about a throwing probe and treats it as not busy", async () => {
		const h = await primed(dir);
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		h.journal.registerProbe(() => {
			throw new Error("probe failed");
		});
		expect((await h.journal[dir]()).kind).toBe("applied");
		expect(warn).toHaveBeenCalledOnce();
	});

	it("still answers empty after flushing an empty stack, without asking probes", async () => {
		const h = setup({ [MARA]: { status: "alive" } });
		const flush = vi.fn(() => Promise.resolve());
		const probe = vi.fn(() => null);
		h.journal.registerFlusher(flush);
		h.journal.registerProbe(probe);
		expect(await h.journal[dir]()).toEqual({ kind: "empty", direction: dir });
		expect(flush).toHaveBeenCalledOnce();
		expect(probe).not.toHaveBeenCalled();
	});
});

describe.each(DIRECTIONS)("pending work on a step with several notes — %s", (dir) => {
	function twoNotes(): Harness {
		const files = [
			{ path: SCENE_4, changes: [{ key: "order", before: present(10), after: present(20) }] },
			{ path: SCENE_5, changes: [{ key: "order", before: present(11), after: present(30) }] },
		];
		const snapshot = dir === "undo" ? { undo: [stepOf("multi", files)], redo: [] } : { undo: [], redo: [stepOf("multi", files)] };
		return setup({ [SCENE_4]: { order: dir === "undo" ? 20 : 10 }, [SCENE_5]: { order: dir === "undo" ? 30 : 11 } }, { store: fakeStore(snapshot) });
	}

	it("asks the probes about every path, not just the first", async () => {
		const h = twoNotes();
		await h.journal.load();
		h.journal.registerProbe((p) => (p === SCENE_5 ? "write" : null));
		expect(await h.journal[dir]()).toEqual({ kind: "refused", direction: dir, path: SCENE_5, reason: "write" });
		expect(h.fm(SCENE_4).order).toBe(dir === "undo" ? 20 : 10); // nothing was written, not even the clean note
	});

	it("reports the first busy path of the step, and the first probe registered", async () => {
		const h = twoNotes();
		await h.journal.load();
		h.journal.registerProbe(() => "draft");
		h.journal.registerProbe(() => "write");
		expect(await h.journal[dir]()).toEqual({ kind: "refused", direction: dir, path: SCENE_4, reason: "draft" });
	});
});

describe("pending work — dispose", () => {
	it("drops probes and flushers", async () => {
		const h = await primed("undo");
		const flush = vi.fn(() => Promise.resolve());
		h.journal.registerFlusher(flush);
		h.journal.registerProbe(() => "draft");
		h.journal.dispose();
		expect((await h.journal.undo()).kind).toBe("applied");
		expect(flush).not.toHaveBeenCalled();
		expect(h.fm(MARA)).toEqual({ ...UNRELATED, status: "alive" });
	});
});

describe("settle — the shutdown's pre-save step (T3.4)", () => {
	it("runs the flushers and resolves only once every open group has committed, writing nothing itself", async () => {
		const h = setup({ [MARA]: { status: "alive" }, [SCENE_4]: { order: 1 } });
		const g = h.journal.openGroup();
		h.journal.registerFlusher(async () => {
			await h.write(MARA, "status", "dead", g);
		});
		let settled = false;
		const done = h.journal.settle().then(() => (settled = true));
		await ticks();
		expect(h.fm(MARA).status).toBe("dead");
		expect(settled).toBe(false); // the group still holds its gesture
		expect(h.journal.peek().undo).toBeNull();
		g.close();
		await done;
		expect(h.journal.peek().undo?.label).toBe("status in Mara Stoneway");
		expect(h.notices).toEqual([]);
	});
});
