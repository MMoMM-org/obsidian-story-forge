/**
 * interactionHandler.pointer.test.ts — T3.1 (RED → GREEN)
 *
 * Tests for the pointer drag state machine in InteractionHandler:
 * - Pointer arms on plain card surface
 * - Does NOT arm when pointerdown target is inside [data-sf-link]
 * - Threshold gating (no drag if movement is below threshold)
 * - computeDrop receives the elementFromPoint target
 * - Non-empty entries reach onWrite
 * - Empty entries → no onWrite
 * - sf-dragging class cleaned up on pointerup
 * - Non-primary button does not arm drag
 *
 * jsdom note: PointerEvent is not fully implemented in jsdom. We use MouseEvent
 * with custom `button`/`buttons`/`clientX`/`clientY` properties, which matches
 * how the handler inspects events. document.elementFromPoint is stubbed via
 * Object.defineProperty since jsdom doesn't implement layout.
 *
 * @ref docs/XDD/specs/007-interactive-views/plan/phase-3.md — T3.1
 * @ref docs/XDD/specs/007-interactive-views/solution.md — ADR-15, AC-F8.3
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, TFile, createMockTFile } from "../__mocks__/obsidian";
import {
	InteractionHandler,
	type Draggable,
	type InteractionHandlerOpts,
} from "workspace/interactionHandler";
import type { CommitEntry, CommitResult } from "inspector/frontmatterWriter";

// ---------------------------------------------------------------------------
// jsdom shims
// ---------------------------------------------------------------------------

/**
 * jsdom does not implement PointerEvent. Polyfill it from MouseEvent so the
 * handler can consume e.button / e.clientX / e.clientY / e.bubbles as expected.
 */
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

/**
 * Stub document.elementFromPoint — jsdom has no layout engine.
 * Tests override `_efpResult` to control what the handler sees.
 */
let _efpResult: Element | null = null;

function stubElementFromPoint(result: Element | null): void {
	_efpResult = result;
}

// Install the stub once. Individual tests set _efpResult before triggering pointerup.
Object.defineProperty(document, "elementFromPoint", {
	value: (_x: number, _y: number): Element | null => _efpResult,
	writable: true,
	configurable: true,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeApp(): App {
	return new App();
}

function makeHost(): HTMLElement {
	const host = document.createElement("div");
	document.body.appendChild(host);
	return host;
}

function makeCard(host: HTMLElement, withLink = false): HTMLElement {
	const card = document.createElement("div");
	card.className = "sf-card";
	card.setAttribute("data-sf-card", "true");
	if (withLink) {
		const link = document.createElement("span");
		link.setAttribute("data-sf-link", "some/path.md");
		link.textContent = "Scene Title";
		card.appendChild(link);
	}
	host.appendChild(card);
	return card;
}

const FIELD_SPEC = { name: "status", type: "select" as const, values: ["draft", "done"] };

function makeDraggable(entries: CommitEntry[] = []): Draggable {
	return {
		computeDrop: vi.fn((_card: HTMLElement, _target: Element | null): CommitEntry[] => entries),
		computeKey: vi.fn((_card: HTMLElement, _key: string): CommitEntry[] => entries),
	};
}

function makeEntry(): CommitEntry {
	return { key: "status", value: "done", field: FIELD_SPEC };
}

function pointerDown(target: Element, x = 100, y = 100, button = 0): void {
	target.dispatchEvent(
		new PointerEvent("pointerdown", {
			bubbles: true,
			cancelable: true,
			clientX: x,
			clientY: y,
			button,
			buttons: button === 0 ? 1 : button === 2 ? 2 : 1,
			pointerId: 1,
			isPrimary: true,
		}),
	);
}

function pointerMove(x: number, y: number): void {
	// Dispatched on window because the handler registers on activeWindow.
	window.dispatchEvent(
		new PointerEvent("pointermove", {
			bubbles: true,
			cancelable: true,
			clientX: x,
			clientY: y,
			button: 0,
			buttons: 1,
			pointerId: 1,
			isPrimary: true,
		}),
	);
}

function pointerUp(x = 120, y = 120): void {
	// Dispatched on window because the handler registers on activeWindow.
	window.dispatchEvent(
		new PointerEvent("pointerup", {
			bubbles: true,
			cancelable: true,
			clientX: x,
			clientY: y,
			button: 0,
			buttons: 0,
			pointerId: 1,
			isPrimary: true,
		}),
	);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("InteractionHandler — pointer state machine", () => {
	let app: App;
	let host: HTMLElement;
	let onWrite: ReturnType<typeof vi.fn>;
	let onAfter: ReturnType<typeof vi.fn>;
	let onError: ReturnType<typeof vi.fn>;
	let file: TFile;
	let handler: InteractionHandler;

	beforeEach(() => {
		app = makeApp();
		host = makeHost();
		onWrite = vi.fn(async (): Promise<CommitResult> => ({ ok: true }));
		onAfter = vi.fn();
		onError = vi.fn();
		file = createMockTFile({ path: "scenes/s1.md" });
		_efpResult = null;

		const opts: InteractionHandlerOpts = {
			onWrite,
			onAfter,
			onError,
			debounceMs: 0, // immediate flush for most tests
			dragThreshold: 5,
		};
		handler = new InteractionHandler(app, host, opts);
	});

	afterEach(() => {
		handler.destroy();
		if (host.parentNode) host.parentNode.removeChild(host);
	});

	// -----------------------------------------------------------------------
	// T3.1-1: Arms on plain card — adds sf-dragging after threshold
	// -----------------------------------------------------------------------
	it("adds sf-dragging class to card after movement past threshold", () => {
		const card = makeCard(host);
		handler.bind(card, file, makeDraggable([makeEntry()]));

		pointerDown(card, 100, 100);
		pointerMove(110, 100); // 10px > threshold of 5

		expect(card.classList.contains("sf-dragging")).toBe(true);
	});

	// -----------------------------------------------------------------------
	// T3.1-2: Does NOT arm when pointerdown is inside [data-sf-link]
	// -----------------------------------------------------------------------
	it("does NOT arm drag when pointerdown target is inside [data-sf-link]", () => {
		const card = makeCard(host, true /* withLink */);
		handler.bind(card, file, makeDraggable([makeEntry()]));

		const linkEl = card.querySelector("[data-sf-link]") as HTMLElement;
		pointerDown(linkEl, 100, 100);
		pointerMove(110, 100);

		expect(card.classList.contains("sf-dragging")).toBe(false);
	});

	// -----------------------------------------------------------------------
	// T3.1-3: Does NOT arm below threshold
	// -----------------------------------------------------------------------
	it("does NOT add sf-dragging below the threshold", () => {
		const card = makeCard(host);
		handler.bind(card, file, makeDraggable([makeEntry()]));

		pointerDown(card, 100, 100);
		pointerMove(103, 100); // 3px < threshold of 5

		expect(card.classList.contains("sf-dragging")).toBe(false);
	});

	// -----------------------------------------------------------------------
	// T3.1-4: computeDrop receives the element under the pointer
	// -----------------------------------------------------------------------
	it("calls computeDrop with the element under the pointer on pointerup", async () => {
		vi.useFakeTimers();
		const card = makeCard(host);
		const dropTarget = document.createElement("div");
		dropTarget.setAttribute("data-sf-status", "done");
		host.appendChild(dropTarget);
		const draggable = makeDraggable([makeEntry()]);
		handler.bind(card, file, draggable);

		stubElementFromPoint(dropTarget);

		pointerDown(card, 100, 100);
		pointerMove(110, 100);
		pointerUp(110, 100);

		await vi.runAllTimersAsync();

		expect(draggable.computeDrop).toHaveBeenCalledWith(card, dropTarget);
		vi.useRealTimers();
	});

	// -----------------------------------------------------------------------
	// T3.1-5: Non-empty entries reach onWrite
	// -----------------------------------------------------------------------
	it("calls onWrite with file + entries when computeDrop returns non-empty", async () => {
		vi.useFakeTimers();
		const entry = makeEntry();
		const card = makeCard(host);
		handler.bind(card, file, makeDraggable([entry]));

		stubElementFromPoint(card);

		pointerDown(card, 100, 100);
		pointerMove(110, 100);
		pointerUp(110, 100);

		await vi.runAllTimersAsync();

		expect(onWrite).toHaveBeenCalledOnce();
		const [calledFile, calledEntries] = onWrite.mock.calls[0] as [TFile, CommitEntry[]];
		expect(calledFile).toBe(file);
		expect(calledEntries).toEqual([entry]);
		vi.useRealTimers();
	});

	// -----------------------------------------------------------------------
	// T3.1-6: Empty entries → no onWrite
	// -----------------------------------------------------------------------
	it("does NOT call onWrite when computeDrop returns empty entries (no-op)", async () => {
		vi.useFakeTimers();
		const card = makeCard(host);
		handler.bind(card, file, makeDraggable([])); // empty = no-op

		stubElementFromPoint(card);

		pointerDown(card, 100, 100);
		pointerMove(110, 100);
		pointerUp(110, 100);

		await vi.runAllTimersAsync();

		expect(onWrite).not.toHaveBeenCalled();
		vi.useRealTimers();
	});

	// -----------------------------------------------------------------------
	// T3.1-7: sf-dragging class cleaned up on pointerup
	// -----------------------------------------------------------------------
	it("removes sf-dragging class on pointerup", async () => {
		vi.useFakeTimers();
		const card = makeCard(host);
		handler.bind(card, file, makeDraggable([makeEntry()]));

		stubElementFromPoint(card);

		pointerDown(card, 100, 100);
		pointerMove(110, 100);
		expect(card.classList.contains("sf-dragging")).toBe(true);

		pointerUp(110, 100);
		expect(card.classList.contains("sf-dragging")).toBe(false);

		await vi.runAllTimersAsync();
		vi.useRealTimers();
	});

	// -----------------------------------------------------------------------
	// T3.1-8: Non-primary button does not arm drag
	// -----------------------------------------------------------------------
	it("does NOT arm drag for non-primary button (button=2, right-click)", () => {
		const card = makeCard(host);
		handler.bind(card, file, makeDraggable([makeEntry()]));

		pointerDown(card, 100, 100, 2 /* right button */);
		pointerMove(110, 100);

		expect(card.classList.contains("sf-dragging")).toBe(false);
	});

	// -----------------------------------------------------------------------
	// T3.1-9: Pointer drop does NOT call announce (announce is keyboard-only)
	// -----------------------------------------------------------------------
	it("pointer drop does NOT call announce even when announce opt is wired", async () => {
		vi.useFakeTimers();
		const announce = vi.fn();
		const entry = makeEntry();
		const card = makeCard(host);
		const localHandler = new InteractionHandler(app, host, {
			onWrite,
			onAfter,
			onError,
			announce,
			debounceMs: 0,
			dragThreshold: 5,
		});
		handler.destroy(); // replace the beforeEach handler for this test

		handler = localHandler;
		handler.bind(card, file, makeDraggable([entry]));

		stubElementFromPoint(card);

		// Full armed drag.
		pointerDown(card, 100, 100);
		pointerMove(110, 100); // past threshold
		pointerUp(110, 100);

		// Advance debounce so flush runs.
		await vi.runAllTimersAsync();

		// onWrite must have been called (confirms entries were non-empty).
		expect(onWrite).toHaveBeenCalledOnce();
		// announce must NOT be called — pointer drop passes shouldAnnounce=false.
		expect(announce).not.toHaveBeenCalled();

		vi.useRealTimers();
	});

	// -----------------------------------------------------------------------
	// T3.1-10: pointercancel cleans up — removes sf-dragging, no onWrite
	// -----------------------------------------------------------------------
	it("pointercancel removes sf-dragging class and does NOT call onWrite", async () => {
		vi.useFakeTimers();
		const card = makeCard(host);
		handler.bind(card, file, makeDraggable([makeEntry()]));

		// Arm the drag past threshold.
		pointerDown(card, 100, 100);
		pointerMove(110, 100);
		expect(card.classList.contains("sf-dragging")).toBe(true);

		// Dispatch pointercancel on window (where the handler is registered).
		window.dispatchEvent(
			new PointerEvent("pointercancel", {
				bubbles: true,
				pointerId: 1,
			}),
		);

		// sf-dragging must be removed.
		expect(card.classList.contains("sf-dragging")).toBe(false);

		// onWrite must NOT be called — cancel aborts without committing.
		await vi.runAllTimersAsync();
		expect(onWrite).not.toHaveBeenCalled();

		vi.useRealTimers();
	});

	// -----------------------------------------------------------------------
	// T3.1-11: Ghost created on arm — sf-drag-ghost appended to body
	// -----------------------------------------------------------------------
	it("appends an .sf-drag-ghost to document.body when drag arms past threshold", () => {
		const card = makeCard(host);
		handler.bind(card, file, makeDraggable([makeEntry()]));

		pointerDown(card, 100, 100);
		// Below threshold — no ghost yet.
		pointerMove(103, 100);
		expect(document.querySelector(".sf-drag-ghost")).toBeNull();

		// Past threshold — ghost must appear.
		pointerMove(110, 100);
		expect(document.querySelector(".sf-drag-ghost")).not.toBeNull();
	});

	// -----------------------------------------------------------------------
	// T3.1-12: Ghost position tracks the pointer on subsequent pointermove
	// -----------------------------------------------------------------------
	it("updates ghost position to track clientX/clientY on pointermove", () => {
		const card = makeCard(host);
		handler.bind(card, file, makeDraggable([makeEntry()]));

		// Arm at (110, 100).
		pointerDown(card, 100, 100);
		pointerMove(110, 100);

		const ghost = document.querySelector(".sf-drag-ghost") as HTMLElement | null;
		expect(ghost).not.toBeNull();

		const leftAfterArm = ghost!.style.left;
		const topAfterArm = ghost!.style.top;

		// Move to a clearly different position.
		pointerMove(200, 150);

		// Position must have changed.
		expect(ghost!.style.left).not.toBe(leftAfterArm);
		expect(ghost!.style.top).not.toBe(topAfterArm);
	});

	// -----------------------------------------------------------------------
	// T3.1-13: Ghost removed on pointerup
	// -----------------------------------------------------------------------
	it("removes the ghost from the document on pointerup", () => {
		const card = makeCard(host);
		handler.bind(card, file, makeDraggable([makeEntry()]));

		pointerDown(card, 100, 100);
		pointerMove(110, 100); // arm
		expect(document.querySelector(".sf-drag-ghost")).not.toBeNull();

		pointerUp(110, 100);
		expect(document.querySelector(".sf-drag-ghost")).toBeNull();
	});

	// -----------------------------------------------------------------------
	// T3.1-14: Ghost removed on pointercancel
	// -----------------------------------------------------------------------
	it("removes the ghost from the document on pointercancel", () => {
		const card = makeCard(host);
		handler.bind(card, file, makeDraggable([makeEntry()]));

		pointerDown(card, 100, 100);
		pointerMove(110, 100); // arm
		expect(document.querySelector(".sf-drag-ghost")).not.toBeNull();

		window.dispatchEvent(
			new PointerEvent("pointercancel", {
				bubbles: true,
				pointerId: 1,
			}),
		);

		expect(document.querySelector(".sf-drag-ghost")).toBeNull();
	});

	// -----------------------------------------------------------------------
	// T3.1-15: Ghost removed on destroy() mid-drag (no leak)
	// -----------------------------------------------------------------------
	it("removes the ghost when destroy() is called mid-drag", () => {
		const card = makeCard(host);
		handler.bind(card, file, makeDraggable([makeEntry()]));

		pointerDown(card, 100, 100);
		pointerMove(110, 100); // arm — ghost is now live
		expect(document.querySelector(".sf-drag-ghost")).not.toBeNull();

		handler.destroy();
		expect(document.querySelector(".sf-drag-ghost")).toBeNull();
	});
});
