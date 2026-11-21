/**
 * interactionHandler.group.test.ts — spec 009 T3.3
 *
 * Gesture groups, flushPending, isBusy and the flushing destroy
 * (ADR-38, ADR-39, ADR-52).
 */

import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { App, createMockTFile } from "../__mocks__/obsidian";
import {
	InteractionHandler,
	type Draggable,
	type GestureContext,
	type InteractionHandlerOpts,
} from "workspace/interactionHandler";
import type { CommitEntry, CommitResult } from "inspector/frontmatterWriter";
import type { JournalGroup } from "undo/journalTypes";

if (typeof globalThis.PointerEvent === "undefined") {
	(globalThis as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = class PointerEvent extends MouseEvent {};
}
Object.defineProperty(document, "elementFromPoint", {
	value: () => null as Element | null,
	writable: true,
	configurable: true,
});

const FIELD = { name: "status", type: "select" as const, values: ["draft", "done"] };
const entry = (value: string): CommitEntry => ({ key: "status", value, field: FIELD });

interface FakeGroup extends JournalGroup {
	closes: number;
}

function makeGroup(id: string): FakeGroup {
	const g = {
		id,
		closes: 0,
		join: () => g,
		track: <T,>(p: Promise<T>): Promise<T> => p,
		close: (): void => {
			g.closes++;
		},
		settled: Promise.resolve(),
	};
	return g;
}

function makeDraggable(): Draggable & { drops: GestureContext[]; keys: GestureContext[] } {
	const drops: GestureContext[] = [];
	const keys: GestureContext[] = [];
	return {
		drops,
		keys,
		computeDrop: (_c, _t, ctx): CommitEntry[] => {
			drops.push(ctx);
			return [entry("done")];
		},
		computeKey: (_c, _k, ctx): CommitEntry[] => {
			keys.push(ctx);
			return [entry("draft")];
		},
	};
}

function drag(card: HTMLElement): void {
	const ev = (type: string, x: number): PointerEvent =>
		new PointerEvent(type, { bubbles: true, clientX: x, clientY: 100, button: 0, buttons: 1, pointerId: 1 });
	card.dispatchEvent(ev("pointerdown", 100));
	window.dispatchEvent(ev("pointermove", 110));
	window.dispatchEvent(ev("pointerup", 110));
}

const keyRight = (card: HTMLElement): void => {
	card.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" }));
};

describe("InteractionHandler — gestures, pending work, flushing destroy", () => {
	let host: HTMLElement;
	let groups: FakeGroup[];
	let opened: number;
	let onWrite: Mock;

	function make(withGroups = true): InteractionHandler {
		const opts: InteractionHandlerOpts = {
			onWrite: onWrite as InteractionHandlerOpts["onWrite"],
			onAfter: vi.fn(),
			debounceMs: 200,
			dragThreshold: 5,
			...(withGroups
				? {
						openGroup: (): JournalGroup => {
							const g = makeGroup(`g${++opened}`);
							groups.push(g);
							return g;
						},
					}
				: {}),
		};
		return new InteractionHandler(new App(), host, opts);
	}

	function setup(h: InteractionHandler, path = "s1.md"): { card: HTMLElement; d: ReturnType<typeof makeDraggable> } {
		const card = document.createElement("div");
		host.appendChild(card);
		const d = makeDraggable();
		h.bind(card, createMockTFile({ path }), d);
		return { card, d };
	}

	beforeEach(() => {
		vi.useFakeTimers();
		host = document.createElement("div");
		document.body.appendChild(host);
		groups = [];
		opened = 0;
		onWrite = vi.fn(async (): Promise<CommitResult> => ({ ok: true }));
	});
	afterEach(() => {
		host.remove();
		vi.useRealTimers();
	});

	it("a drop opens a group; _flush passes it to onWrite and closes it", async () => {
		const h = make();
		const { card } = setup(h);
		drag(card);
		expect(groups).toHaveLength(1);
		expect(groups[0]!.closes).toBe(0);
		await vi.advanceTimersByTimeAsync(200);
		expect(onWrite.mock.calls[0]![2]).toBe(groups[0]);
		expect(groups[0]!.closes).toBe(1);
	});

	it("closes the group even when onWrite throws", async () => {
		onWrite.mockRejectedValue(new Error("boom"));
		const h = make();
		const { card } = setup(h);
		drag(card);
		await vi.advanceTimersByTimeAsync(200);
		expect(groups[0]!.closes).toBe(1);
	});

	it("coalesced key moves reuse the file's pending group (one group, one close)", async () => {
		const h = make();
		const { card } = setup(h);
		keyRight(card);
		keyRight(card);
		keyRight(card);
		expect(groups).toHaveLength(1);
		await vi.advanceTimersByTimeAsync(200);
		expect(onWrite).toHaveBeenCalledOnce();
		expect(groups[0]!.closes).toBe(1);
	});

	it("a move after the flush opens a new group", async () => {
		const h = make();
		const { card } = setup(h);
		keyRight(card);
		await vi.advanceTimersByTimeAsync(200);
		keyRight(card);
		expect(groups).toHaveLength(2);
	});

	it("a no-op gesture does not leak a group", () => {
		const h = make();
		const card = document.createElement("div");
		host.appendChild(card);
		h.bind(card, createMockTFile({ path: "n.md" }), {
			computeDrop: () => [],
			computeKey: () => [],
		});
		keyRight(card);
		expect(groups).toHaveLength(1);
		expect(groups.every((g) => g.closes === 1)).toBe(true);
	});

	it("a pointer no-op (computeDrop returns []) does not leak a group", async () => {
		const h = make();
		const card = document.createElement("div");
		host.appendChild(card);
		h.bind(card, createMockTFile({ path: "n.md" }), {
			computeDrop: () => [],
			computeKey: () => [],
		});
		drag(card);
		expect(groups).toHaveLength(1);
		expect(groups[0]!.closes).toBe(1);
		await vi.advanceTimersByTimeAsync(200);
		expect(onWrite).not.toHaveBeenCalled();
		keyRight(card);
		expect(groups).toHaveLength(2);
	});

	describe("a strategy that throws", () => {
		let errors: unknown[];
		const onError = (e: ErrorEvent): void => {
			e.preventDefault();
			errors.push(e.error);
		};
		beforeEach(() => {
			errors = [];
			window.addEventListener("error", onError);
		});
		afterEach(() => window.removeEventListener("error", onError));

		const thrower = (): Draggable => ({
			computeDrop: () => {
				throw new Error("drop boom");
			},
			computeKey: () => {
				throw new Error("key boom");
			},
		});

		it.each([
			["pointer", drag],
			["key", keyRight],
		])("%s path: closes the fresh group and the next gesture opens a new one", async (_n, gesture) => {
			const h = make();
			const card = document.createElement("div");
			host.appendChild(card);
			const file = createMockTFile({ path: "t.md" });
			h.bind(card, file, thrower());
			gesture(card);
			expect(errors).toHaveLength(1);
			expect(groups).toHaveLength(1);
			expect(groups[0]!.closes).toBe(1);
			expect(h.isBusy("t.md")).toBe(false);
			h.bind(card, file, makeDraggable());
			gesture(card);
			expect(groups).toHaveLength(2);
			await vi.advanceTimersByTimeAsync(200);
			expect(onWrite.mock.calls[0]![2]).toBe(groups[1]);
		});

		it("does not close a reused pending group when the strategy throws", () => {
			const h = make();
			const { card } = setup(h, "r.md");
			keyRight(card);
			h.bind(card, createMockTFile({ path: "r.md" }), thrower());
			keyRight(card);
			expect(groups).toHaveLength(1);
			expect(groups[0]!.closes).toBe(0);
		});
	});

	it("a gesture during an in-flight write gets its own group", async () => {
		const releases: Array<(r: CommitResult) => void> = [];
		onWrite.mockImplementation(() => new Promise<CommitResult>((res) => releases.push(res)));
		const h = make();
		const { card, d } = setup(h);
		keyRight(card);
		await vi.advanceTimersByTimeAsync(200);
		expect(onWrite).toHaveBeenCalledOnce();
		keyRight(card);
		expect(groups).toHaveLength(2);
		expect(d.keys[1]!.group).toBe(groups[1]);
		expect(d.keys[1]!.group).not.toBe(groups[0]);
		releases[0]!({ ok: true });
		await vi.advanceTimersByTimeAsync(0);
		expect(groups[0]!.closes).toBe(1);
		expect(groups[1]!.closes).toBe(0);
		await vi.advanceTimersByTimeAsync(200);
		expect(onWrite).toHaveBeenCalledTimes(2);
		expect(onWrite.mock.calls[1]![2]).toBe(groups[1]);
		releases[1]!({ ok: true });
		await vi.advanceTimersByTimeAsync(0);
		expect(groups[1]!.closes).toBe(1);
		expect(groups[0]!.closes).toBe(1);
	});

	it("flushPending resolves even when a late onAfter throws", async () => {
		const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
		let release!: (r: CommitResult) => void;
		onWrite.mockImplementation(() => new Promise<CommitResult>((r) => (release = r)));
		const onAfter = vi.fn(() => {
			throw new Error("late");
		});
		const h = new InteractionHandler(new App(), host, {
			onWrite: onWrite as InteractionHandlerOpts["onWrite"],
			onAfter,
			debounceMs: 200,
			dragThreshold: 5,
		});
		const { card } = setup(h);
		keyRight(card);
		const p = h.flushPending();
		release({ ok: true });
		await expect(p).resolves.toBeUndefined();
		expect(onAfter).toHaveBeenCalledOnce();
		expect(logged).toHaveBeenCalledOnce();
		logged.mockRestore();
	});

	it("computeDrop and computeKey receive the GestureContext", () => {
		const h = make();
		const { card, d } = setup(h);
		drag(card);
		keyRight(card);
		expect(d.drops[0]!.group).toBe(groups[0]);
		expect(d.keys[0]!.group).toBe(groups[0]);
	});

	it("without openGroup: ctx.group is null and onWrite gets null", async () => {
		const h = make(false);
		const { card, d } = setup(h);
		drag(card);
		await vi.advanceTimersByTimeAsync(200);
		expect(d.drops[0]!.group).toBeNull();
		expect(onWrite.mock.calls[0]![2]).toBeNull();
	});

	it("flushPending runs every pending debouncer and awaits the writes", async () => {
		const releases: Array<(r: CommitResult) => void> = [];
		onWrite.mockImplementation(() => new Promise<CommitResult>((res) => releases.push(res)));
		const h = make();
		const a = setup(h, "a.md");
		const b = setup(h, "b.md");
		keyRight(a.card);
		keyRight(b.card);
		let done = false;
		const p = h.flushPending().then(() => {
			done = true;
		});
		expect(onWrite).toHaveBeenCalledTimes(2);
		await vi.advanceTimersByTimeAsync(0);
		expect(done).toBe(false);
		releases[0]!({ ok: true });
		await vi.advanceTimersByTimeAsync(0);
		expect(done).toBe(false);
		releases[1]!({ ok: true });
		await p;
		expect(done).toBe(true);
	});

	it("isBusy is true while entries are pending and while a flush is in flight", async () => {
		let release!: (r: CommitResult) => void;
		onWrite.mockImplementation(() => new Promise<CommitResult>((r) => (release = r)));
		const h = make();
		const { card } = setup(h);
		expect(h.isBusy("s1.md")).toBe(false);
		keyRight(card);
		expect(h.isBusy("s1.md")).toBe(true);
		expect(h.isBusy("other.md")).toBe(false);
		await vi.advanceTimersByTimeAsync(200);
		expect(h.isBusy("s1.md")).toBe(true); // in flight
		release({ ok: true });
		await vi.advanceTimersByTimeAsync(0);
		expect(h.isBusy("s1.md")).toBe(false);
	});

	it("destroy() runs the pending flush instead of cancelling it (ADR-52)", async () => {
		const h = make();
		const { card } = setup(h);
		drag(card);
		h.destroy();
		await vi.advanceTimersByTimeAsync(0);
		expect(onWrite).toHaveBeenCalledOnce();
		expect(groups[0]!.closes).toBe(1);
		await vi.advanceTimersByTimeAsync(500);
		expect(onWrite).toHaveBeenCalledOnce();
	});

	it("flushPending after destroy still awaits the in-flight write", async () => {
		let release!: (r: CommitResult) => void;
		onWrite.mockImplementation(() => new Promise<CommitResult>((r) => (release = r)));
		const h = make();
		const { card } = setup(h);
		keyRight(card);
		h.destroy();
		let done = false;
		const p = h.flushPending().then(() => {
			done = true;
		});
		await vi.advanceTimersByTimeAsync(0);
		expect(done).toBe(false);
		release({ ok: true });
		await p;
		expect(groups[0]!.closes).toBe(1);
	});
});
