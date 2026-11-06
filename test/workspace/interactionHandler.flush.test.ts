/**
 * interactionHandler.flush.test.ts — T3.3 (RED → GREEN)
 *
 * Tests for per-file debounce, coalescing, independent file flushing, and
 * cleanup behaviour in InteractionHandler:
 * - Same-file rapid applies coalesce into one onWrite call (last-wins per key)
 * - Two different files flush independently
 * - Successful flush calls onAfter(file)
 * - Failed flush calls onError(file, result) — does NOT throw
 * - destroy() runs pending flushes (ADR-52)
 * - destroy() removes DOM listeners (_runCleanup / _unload verifiable)
 *
 * @ref docs/XDD/specs/007-interactive-views/plan/phase-3.md — T3.3
 * @ref docs/XDD/specs/007-interactive-views/solution.md — ADR-22, ADR-23, CON-4
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, createMockTFile } from "../__mocks__/obsidian";
import type { TFile } from "../__mocks__/obsidian";
import {
	InteractionHandler,
	type Draggable,
	type InteractionHandlerOpts,
} from "workspace/interactionHandler";
import type { CommitEntry, CommitResult } from "inspector/frontmatterWriter";

// ---------------------------------------------------------------------------
// jsdom shims (same as pointer/keyboard tests)
// ---------------------------------------------------------------------------

if (typeof globalThis.PointerEvent === "undefined") {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(globalThis as any).PointerEvent = class PointerEvent extends MouseEvent {
		pointerId: number;
		isPrimary: boolean;
		constructor(type: string, init?: MouseEventInit & { pointerId?: number; isPrimary?: boolean }) {
			super(type, init);
			this.pointerId = init?.pointerId ?? 1;
			this.isPrimary = init?.isPrimary ?? true;
		}
	};
}

// Stub document.elementFromPoint for all tests in this file.
Object.defineProperty(document, "elementFromPoint", {
	value: () => null as Element | null,
	writable: true,
	configurable: true,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeHost(): HTMLElement {
	const host = document.createElement("div");
	document.body.appendChild(host);
	return host;
}

function makeCard(host: HTMLElement): HTMLElement {
	const card = document.createElement("div");
	card.setAttribute("tabindex", "0");
	host.appendChild(card);
	return card;
}

const STATUS_FIELD = { name: "status", type: "select" as const, values: ["draft", "done"] };
const ORDER_FIELD = { name: "order", type: "number" as const };

function entry(key: string, value: unknown): CommitEntry {
	return { key, value, field: key === "order" ? ORDER_FIELD : STATUS_FIELD };
}

function makeDraggable(entries: CommitEntry[]): Draggable {
	return {
		computeDrop: vi.fn((): CommitEntry[] => entries),
		computeKey: vi.fn((): CommitEntry[] => entries),
	};
}

/** Fire a complete pointer drag sequence on a bound card. */
function drag(card: HTMLElement): void {
	card.dispatchEvent(
		new PointerEvent("pointerdown", {
			bubbles: true,
			clientX: 100,
			clientY: 100,
			button: 0,
			buttons: 1,
			pointerId: 1,
		}),
	);
	window.dispatchEvent(
		new PointerEvent("pointermove", {
			bubbles: true,
			clientX: 110,
			clientY: 100,
			button: 0,
			buttons: 1,
			pointerId: 1,
		}),
	);
	window.dispatchEvent(
		new PointerEvent("pointerup", {
			bubbles: true,
			clientX: 110,
			clientY: 100,
			button: 0,
			pointerId: 1,
		}),
	);
}

/** Fire a keyboard action on a bound card. */
function keyRight(card: HTMLElement): void {
	card.dispatchEvent(
		new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" }),
	);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("InteractionHandler — per-file debounce + flush + cleanup", () => {
	let app: App;
	let host: HTMLElement;
	let onWrite: ReturnType<typeof vi.fn>;
	let onAfter: ReturnType<typeof vi.fn>;
	let onError: ReturnType<typeof vi.fn>;
	let handler: InteractionHandler;

	function makeHandler(debounceMs = 200): InteractionHandler {
		const opts: InteractionHandlerOpts = {
			onWrite,
			onAfter,
			onError,
			debounceMs,
			dragThreshold: 5,
		};
		return new InteractionHandler(app, host, opts);
	}

	beforeEach(() => {
		vi.useFakeTimers();
		app = new App();
		host = makeHost();
		onWrite = vi.fn(async (): Promise<CommitResult> => ({ ok: true }));
		onAfter = vi.fn();
		onError = vi.fn();
	});

	afterEach(async () => {
		handler.destroy();
		if (host.parentNode) host.parentNode.removeChild(host);
		await vi.runAllTimersAsync();
		vi.useRealTimers();
	});

	// -----------------------------------------------------------------------
	// T3.3-1: Rapid applies on the same file coalesce into one onWrite
	// -----------------------------------------------------------------------
	it("same-file rapid applies coalesce: onWrite called once with merged entries", async () => {
		handler = makeHandler(200);
		const file = createMockTFile({ path: "scenes/s1.md" });
		const card = makeCard(host);

		// First drag: status=draft
		handler.bind(card, file, makeDraggable([entry("status", "draft")]));
		drag(card);

		// Second drag before debounce fires: status=done (overwrites draft)
		handler.bind(card, file, makeDraggable([entry("status", "done")]));
		drag(card);

		// Debounce has NOT fired yet.
		expect(onWrite).not.toHaveBeenCalled();

		// Advance past debounce.
		await vi.runAllTimersAsync();

		// onWrite called exactly once with the coalesced (latest) value.
		expect(onWrite).toHaveBeenCalledOnce();
		const [, entries] = onWrite.mock.calls[0] as [TFile, CommitEntry[]];
		expect(entries).toEqual([entry("status", "done")]);
	});

	// -----------------------------------------------------------------------
	// T3.3-2: Same-file coalescing — latest wins per key, multiple keys merged
	// -----------------------------------------------------------------------
	it("same-file coalescing merges keys: later entry wins per key", async () => {
		handler = makeHandler(200);
		const file = createMockTFile({ path: "scenes/s1.md" });
		const card = makeCard(host);

		// First drag: status=draft, order=10
		handler.bind(card, file, makeDraggable([entry("status", "draft"), entry("order", 10)]));
		drag(card);

		// Second drag: status=done (order not in second set — previous order survives)
		handler.bind(card, file, makeDraggable([entry("status", "done")]));
		drag(card);

		await vi.runAllTimersAsync();

		expect(onWrite).toHaveBeenCalledOnce();
		const [, entries] = onWrite.mock.calls[0] as [TFile, CommitEntry[]];
		// status is overwritten by latest; order survives from first.
		const keys = entries.map((e) => e.key);
		expect(keys).toContain("status");
		expect(keys).toContain("order");
		const statusEntry = entries.find((e) => e.key === "status");
		expect(statusEntry?.value).toBe("done");
		const orderEntry = entries.find((e) => e.key === "order");
		expect(orderEntry?.value).toBe(10);
	});

	// -----------------------------------------------------------------------
	// T3.3-3: Different files flush independently
	// -----------------------------------------------------------------------
	it("two different files flush independently (separate debounce timers)", async () => {
		handler = makeHandler(200);
		const fileA = createMockTFile({ path: "scenes/a.md" });
		const fileB = createMockTFile({ path: "scenes/b.md" });
		const cardA = makeCard(host);
		const cardB = makeCard(host);

		handler.bind(cardA, fileA, makeDraggable([entry("status", "draft")]));
		handler.bind(cardB, fileB, makeDraggable([entry("status", "done")]));

		drag(cardA);
		drag(cardB);

		await vi.runAllTimersAsync();

		// Both flushed independently.
		expect(onWrite).toHaveBeenCalledTimes(2);
		const files = onWrite.mock.calls.map(([f]) => (f as TFile).path);
		expect(files).toContain("scenes/a.md");
		expect(files).toContain("scenes/b.md");
	});

	// -----------------------------------------------------------------------
	// T3.3-4: Successful flush → onAfter called
	// -----------------------------------------------------------------------
	it("successful flush calls onAfter(file)", async () => {
		handler = makeHandler(0);
		const file = createMockTFile({ path: "scenes/s1.md" });
		const card = makeCard(host);
		handler.bind(card, file, makeDraggable([entry("status", "done")]));

		drag(card);
		await vi.runAllTimersAsync();

		expect(onAfter).toHaveBeenCalledOnce();
		expect(onAfter.mock.calls[0]?.[0]).toBe(file);
	});

	// -----------------------------------------------------------------------
	// T3.3-5: Failed flush (ok:false) → onError called; no throw; onAfter NOT called
	// -----------------------------------------------------------------------
	it("failed flush calls onError(file, result) without throwing; onAfter NOT called", async () => {
		const failResult: CommitResult = {
			ok: false,
			reason: "validation",
			message: "Bad value",
			keepDirty: true,
		};
		onWrite = vi.fn(async (): Promise<CommitResult> => failResult);
		handler = makeHandler(0);
		const file = createMockTFile({ path: "scenes/s1.md" });
		const card = makeCard(host);
		handler.bind(card, file, makeDraggable([entry("status", "done")]));

		// Drag and let the flush run — must NOT throw (neither synchronously
		// nor as an unhandled rejection).
		let threw = false;
		try {
			drag(card);
			await vi.runAllTimersAsync();
		} catch {
			threw = true;
		}
		expect(threw).toBe(false);

		expect(onError).toHaveBeenCalledOnce();
		expect(onError.mock.calls[0]?.[0]).toBe(file);
		expect(onError.mock.calls[0]?.[1]).toEqual(failResult);
		expect(onAfter).not.toHaveBeenCalled();
	});

	// -----------------------------------------------------------------------
	// T3.3-6 (spec 009, ADR-52): destroy() runs pending flushes instead of cancelling
	// -----------------------------------------------------------------------
	it("destroy() runs the pending flush so the dropped card's write is not lost", async () => {
		handler = makeHandler(200);
		const file = createMockTFile({ path: "scenes/s1.md" });
		const card = makeCard(host);
		handler.bind(card, file, makeDraggable([entry("status", "done")]));

		drag(card);

		// destroy() before the debounce fires.
		handler.destroy();

		await vi.runAllTimersAsync();

		expect(onWrite).toHaveBeenCalledOnce();
	});

	// -----------------------------------------------------------------------
	// T3.3-7: destroy() removes DOM listeners — _delegate._unload() leaves no
	//         residual pointer or keyboard listeners on the host
	// -----------------------------------------------------------------------
	it("destroy() removes all DOM listeners via Component._unload", async () => {
		handler = makeHandler(0);
		const file = createMockTFile({ path: "scenes/s1.md" });
		const card = makeCard(host);
		handler.bind(card, file, makeDraggable([entry("status", "done")]));

		// Verify the handler works before destroy.
		drag(card);
		await vi.runAllTimersAsync();
		expect(onWrite).toHaveBeenCalledOnce();

		onWrite.mockClear();
		onAfter.mockClear();

		// Destroy the handler.
		handler.destroy();

		// Dispatch events that would have triggered the handler — should be no-ops.
		card.dispatchEvent(
			new PointerEvent("pointerdown", {
				bubbles: true,
				clientX: 100,
				clientY: 100,
				button: 0,
				buttons: 1,
				pointerId: 1,
			}),
		);
		window.dispatchEvent(
			new PointerEvent("pointermove", {
				bubbles: true,
				clientX: 110,
				clientY: 100,
				buttons: 1,
				pointerId: 1,
			}),
		);
		window.dispatchEvent(
			new PointerEvent("pointerup", {
				bubbles: true,
				clientX: 110,
				clientY: 100,
				pointerId: 1,
			}),
		);
		await vi.runAllTimersAsync();

		// No further writes — listeners were removed.
		expect(onWrite).not.toHaveBeenCalled();
	});

	// -----------------------------------------------------------------------
	// T3.3-8: write error ({reason:"write"}) also calls onError, not onAfter
	// -----------------------------------------------------------------------
	it("write-error result calls onError and does not call onAfter", async () => {
		const writeError: CommitResult = {
			ok: false,
			reason: "write",
			message: "Disk full",
			keepDirty: true,
		};
		onWrite = vi.fn(async (): Promise<CommitResult> => writeError);
		handler = makeHandler(0);
		const file = createMockTFile({ path: "scenes/s1.md" });
		const card = makeCard(host);
		handler.bind(card, file, makeDraggable([entry("status", "done")]));

		drag(card);
		await vi.runAllTimersAsync();

		expect(onError).toHaveBeenCalledOnce();
		expect(onAfter).not.toHaveBeenCalled();
	});

	// -----------------------------------------------------------------------
	// T3.3-9: keyboard path coalesces with pointer applies on same file
	// -----------------------------------------------------------------------
	it("keyboard and pointer applies on the same file coalesce before flush", async () => {
		handler = makeHandler(200);
		const file = createMockTFile({ path: "scenes/s1.md" });
		const card = makeCard(host);

		// Pointer drag: status=draft
		handler.bind(card, file, makeDraggable([entry("status", "draft")]));
		drag(card);

		// Keyboard apply: status=done (overwrites)
		handler.bind(card, file, makeDraggable([entry("status", "done")]));
		keyRight(card);

		await vi.runAllTimersAsync();

		expect(onWrite).toHaveBeenCalledOnce();
		const [, entries] = onWrite.mock.calls[0] as [TFile, CommitEntry[]];
		const statusEntry = entries.find((e) => e.key === "status");
		expect(statusEntry?.value).toBe("done");
	});
});
