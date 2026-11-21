/**
 * interactionHandler.keyboard.test.ts — T3.2 (RED → GREEN)
 *
 * Tests for keyboard command parity in InteractionHandler:
 * - Documented keys (ArrowLeft/Right, Alt+ArrowUp/Down) call computeKey
 * - computeKey entries flow through the same _apply path as pointer drop
 * - announce() is called on success
 * - No announce/no write when computeKey returns []
 * - Enter/Space are NOT consumed (drill wins — AC-F8.3)
 *
 * @ref docs/XDD/specs/007-interactive-views/plan/phase-3.md — T3.2
 * @ref docs/XDD/specs/007-interactive-views/solution.md — ADR-15, AC-F8.1, AC-F8.2
 */

import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { App, TFile, createMockTFile } from "../__mocks__/obsidian";

// ---------------------------------------------------------------------------
// jsdom shims (shared with pointer test — duplicated here to keep files independent)
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

Object.defineProperty(document, "elementFromPoint", {
	value: () => null as Element | null,
	writable: true,
	configurable: true,
});
import {
	InteractionHandler,
	type Draggable,
	type InteractionHandlerOpts,
} from "workspace/interactionHandler";
import type { CommitEntry, CommitResult } from "inspector/frontmatterWriter";

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
	card.className = "sf-card";
	card.setAttribute("tabindex", "0");
	host.appendChild(card);
	return card;
}

const FIELD_SPEC_STATUS = { name: "status", type: "select" as const, values: ["draft", "done"] };

function makeEntry(key = "status", value: unknown = "done"): CommitEntry {
	return { key, value, field: FIELD_SPEC_STATUS };
}

function makeDraggable(entries: CommitEntry[] = []): Draggable {
	return {
		computeDrop: vi.fn((): CommitEntry[] => entries),
		computeKey: vi.fn((): CommitEntry[] => entries),
	};
}

/**
 * Dispatch a keydown event on the given element, bubbling up to the host.
 * altKey controls Alt+Arrow combos.
 */
function keyDown(el: Element, key: string, altKey = false): void {
	el.dispatchEvent(
		new KeyboardEvent("keydown", {
			bubbles: true,
			cancelable: true,
			key,
			altKey,
		}),
	);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("InteractionHandler — keyboard command parity", () => {
	let app: App;
	let host: HTMLElement;
	let onWrite: Mock;
	let onAfter: Mock;
	let onError: Mock;
	let announce: Mock;
	let file: TFile;
	let handler: InteractionHandler;

	beforeEach(() => {
		app = new App();
		host = makeHost();
		onWrite = vi.fn(async (): Promise<CommitResult> => ({ ok: true }));
		onAfter = vi.fn();
		onError = vi.fn();
		announce = vi.fn();
		file = createMockTFile({ path: "scenes/s1.md" });
	});

	afterEach(() => {
		handler.destroy();
		if (host.parentNode) host.parentNode.removeChild(host);
	});

	function makeHandler(debounceMs = 0): InteractionHandler {
		const opts: InteractionHandlerOpts = {
			onWrite,
			onAfter,
			onError,
			announce,
			debounceMs,
			dragThreshold: 5,
		};
		return new InteractionHandler(app, host, opts);
	}

	// -----------------------------------------------------------------------
	// T3.2-1: ArrowRight calls computeKey and reaches onWrite
	// -----------------------------------------------------------------------
	it("ArrowRight calls computeKey and routes entries to onWrite", async () => {
		vi.useFakeTimers();
		handler = makeHandler();
		const entry = makeEntry();
		const card = makeCard(host);
		const draggable = makeDraggable([entry]);
		handler.bind(card, file, draggable);

		keyDown(card, "ArrowRight");
		await vi.runAllTimersAsync();

		expect(draggable.computeKey).toHaveBeenCalledWith(card, "ArrowRight", { group: null });
		expect(onWrite).toHaveBeenCalledOnce();
		const [calledFile, calledEntries] = onWrite.mock.calls[0] as [TFile, CommitEntry[]];
		expect(calledFile).toBe(file);
		expect(calledEntries).toEqual([entry]);
		vi.useRealTimers();
	});

	// -----------------------------------------------------------------------
	// T3.2-2: ArrowLeft calls computeKey and reaches onWrite
	// -----------------------------------------------------------------------
	it("ArrowLeft calls computeKey and routes entries to onWrite", async () => {
		vi.useFakeTimers();
		handler = makeHandler();
		const entry = makeEntry("status", "draft");
		const card = makeCard(host);
		const draggable = makeDraggable([entry]);
		handler.bind(card, file, draggable);

		keyDown(card, "ArrowLeft");
		await vi.runAllTimersAsync();

		expect(draggable.computeKey).toHaveBeenCalledWith(card, "ArrowLeft", { group: null });
		expect(onWrite).toHaveBeenCalledOnce();
		vi.useRealTimers();
	});

	// -----------------------------------------------------------------------
	// T3.2-3: Alt+ArrowDown calls computeKey with "Alt+ArrowDown"
	// -----------------------------------------------------------------------
	it("Alt+ArrowDown calls computeKey with 'Alt+ArrowDown' key string", async () => {
		vi.useFakeTimers();
		handler = makeHandler();
		const entry = makeEntry("storyDay", 3);
		const card = makeCard(host);
		const draggable = makeDraggable([entry]);
		handler.bind(card, file, draggable);

		keyDown(card, "ArrowDown", true /* altKey */);
		await vi.runAllTimersAsync();

		expect(draggable.computeKey).toHaveBeenCalledWith(card, "Alt+ArrowDown", { group: null });
		expect(onWrite).toHaveBeenCalledOnce();
		vi.useRealTimers();
	});

	// -----------------------------------------------------------------------
	// T3.2-4: Alt+ArrowUp calls computeKey with "Alt+ArrowUp"
	// -----------------------------------------------------------------------
	it("Alt+ArrowUp calls computeKey with 'Alt+ArrowUp' key string", async () => {
		vi.useFakeTimers();
		handler = makeHandler();
		const card = makeCard(host);
		const draggable = makeDraggable([makeEntry("storyDay", 1)]);
		handler.bind(card, file, draggable);

		keyDown(card, "ArrowUp", true /* altKey */);
		await vi.runAllTimersAsync();

		expect(draggable.computeKey).toHaveBeenCalledWith(card, "Alt+ArrowUp", { group: null });
		vi.useRealTimers();
	});

	// -----------------------------------------------------------------------
	// T3.2-5: Keyboard entries produce the same write as a pointer drop
	//         (same _apply path — F8, AC-11)
	// -----------------------------------------------------------------------
	it("keyboard entries reach onWrite with the same shape as a pointer drop", async () => {
		vi.useFakeTimers();
		handler = makeHandler();
		const entry = makeEntry();

		// Strategy returns the same entry regardless of path.
		const draggable: Draggable = {
			computeDrop: vi.fn((): CommitEntry[] => [entry]),
			computeKey: vi.fn((): CommitEntry[] => [entry]),
		};

		const card = makeCard(host);
		handler.bind(card, file, draggable);

		// Keyboard path.
		keyDown(card, "ArrowRight");
		await vi.runAllTimersAsync();

		const [, keyEntries] = onWrite.mock.calls[0] as [TFile, CommitEntry[]];

		// Pointer path — reset and re-run.
		onWrite.mockClear();
		Object.defineProperty(document, "elementFromPoint", {
			value: () => card,
			configurable: true,
		});
		card.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 0, clientY: 0, button: 0, buttons: 1, pointerId: 1 }));
		window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 10, clientY: 0, button: 0, buttons: 1, pointerId: 1 }));
		window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: 10, clientY: 0, button: 0, pointerId: 1 }));
		await vi.runAllTimersAsync();

		const [, ptrEntries] = onWrite.mock.calls[0] as [TFile, CommitEntry[]];

		// Both paths produce the same entry shape.
		expect(keyEntries).toEqual(ptrEntries);
		vi.useRealTimers();
	});

	// -----------------------------------------------------------------------
	// T3.2-6: announce() is called on successful write (aria-live seam)
	// -----------------------------------------------------------------------
	it("calls announce() after a successful keyboard write", async () => {
		vi.useFakeTimers();
		handler = makeHandler();
		const card = makeCard(host);
		handler.bind(card, file, makeDraggable([makeEntry()]));

		keyDown(card, "ArrowRight");
		await vi.runAllTimersAsync();

		expect(announce).toHaveBeenCalledOnce();
		expect(typeof announce.mock.calls[0]?.[0]).toBe("string");
		vi.useRealTimers();
	});

	// -----------------------------------------------------------------------
	// T3.2-7: No announce / no onWrite when computeKey returns []
	// -----------------------------------------------------------------------
	it("does NOT call announce or onWrite when computeKey returns []", async () => {
		vi.useFakeTimers();
		handler = makeHandler();
		const card = makeCard(host);
		handler.bind(card, file, makeDraggable([])); // no-op

		keyDown(card, "ArrowRight");
		await vi.runAllTimersAsync();

		expect(onWrite).not.toHaveBeenCalled();
		expect(announce).not.toHaveBeenCalled();
		vi.useRealTimers();
	});

	// -----------------------------------------------------------------------
	// T3.2-8: Enter key is NOT consumed (drill wins — AC-F8.3)
	// -----------------------------------------------------------------------
	it("does NOT consume Enter key (drill path must not be hijacked)", async () => {
		vi.useFakeTimers();
		handler = makeHandler();
		const card = makeCard(host);
		const draggable = makeDraggable([makeEntry()]);
		handler.bind(card, file, draggable);

		const event = new KeyboardEvent("keydown", {
			bubbles: true,
			cancelable: true,
			key: "Enter",
		});
		const preventDefaultSpy = vi.spyOn(event, "preventDefault");
		card.dispatchEvent(event);
		await vi.runAllTimersAsync();

		// computeKey should not be called for Enter.
		expect(draggable.computeKey).not.toHaveBeenCalled();
		expect(onWrite).not.toHaveBeenCalled();
		expect(preventDefaultSpy).not.toHaveBeenCalled();
		vi.useRealTimers();
	});

	// -----------------------------------------------------------------------
	// T3.2-9: Space key is NOT consumed (drill wins — AC-F8.3)
	// -----------------------------------------------------------------------
	it("does NOT consume Space key (drill path must not be hijacked)", async () => {
		vi.useFakeTimers();
		handler = makeHandler();
		const card = makeCard(host);
		const draggable = makeDraggable([makeEntry()]);
		handler.bind(card, file, draggable);

		const event = new KeyboardEvent("keydown", {
			bubbles: true,
			cancelable: true,
			key: " ",
		});
		card.dispatchEvent(event);
		await vi.runAllTimersAsync();

		expect(draggable.computeKey).not.toHaveBeenCalled();
		expect(onWrite).not.toHaveBeenCalled();
		vi.useRealTimers();
	});

	// -----------------------------------------------------------------------
	// T3.2-10: Unrecognised keys are ignored
	// -----------------------------------------------------------------------
	it("ignores unrecognised keys like ArrowUp (without Alt)", async () => {
		vi.useFakeTimers();
		handler = makeHandler();
		const card = makeCard(host);
		const draggable = makeDraggable([makeEntry()]);
		handler.bind(card, file, draggable);

		keyDown(card, "ArrowUp"); // no Alt → not a handled key
		await vi.runAllTimersAsync();

		expect(draggable.computeKey).not.toHaveBeenCalled();
		expect(onWrite).not.toHaveBeenCalled();
		vi.useRealTimers();
	});
});
