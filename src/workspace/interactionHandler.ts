/**
 * interactionHandler.ts — M6 Phase 3 (ADR-15, ADR-22, ADR-23, ADR-24)
 *
 * A reusable pointer-drag + keyboard + per-file-debounced-commit layer.
 * Interactive renderers (Kanban, Plotgrid, Timeline-placement) bind their
 * cards to this handler. Read-only renderers do NOT use it.
 *
 * Design decisions documented here:
 *
 * KEYBOARD KEYS (T3.2):
 *   ArrowLeft / ArrowRight — move card to the previous/next column or slot.
 *   Alt+ArrowUp / Alt+ArrowDown — vertical position adjustments (e.g. storyDay).
 *   Enter and Space are intentionally NOT used (drill wins — AC-F8.3).
 *
 * MERGE RULE (T3.3):
 *   Rapid applies on the same file coalesce by key (latest wins per key).
 *   When flush is triggered, the deduplicated entry list is passed to onWrite.
 *   Entries from different files flush independently (ADR-23).
 *
 * LISTENER CLEANUP (CON-4):
 *   All listeners are registered via `registerDomEvent` on a private Component
 *   delegate. `destroy()` calls `_unload()` on that delegate, which removes
 *   all DOM listeners. Pending debounce timers are also cancelled.
 *
 * @ref docs/XDD/specs/007-interactive-views/plan/phase-3.md
 * @ref docs/XDD/specs/007-interactive-views/solution.md
 */

import type { App, TFile } from "obsidian";
import { Component, debounce } from "obsidian";
import { DEBOUNCE_MS } from "pluginConstants";
import type { CommitEntry, CommitResult } from "inspector/frontmatterWriter";

// ---------------------------------------------------------------------------
// Re-export CommitEntry so renderers don't need a second import path.
// ---------------------------------------------------------------------------

export type { CommitEntry };

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/**
 * Strategy supplied by each interactive renderer.
 *
 * The handler is view-agnostic: all domain semantics live here.
 * Both computeDrop and computeKey must return the SAME shape so drag and
 * keyboard share one commit path (F8, AC-11).
 */
export interface Draggable {
	/**
	 * Field(s) to write for a drop landing on `dropTarget`; [] = no-op/cancel.
	 * Called by the handler on pointerup with the resolved elementFromPoint target.
	 */
	computeDrop(card: HTMLElement, dropTarget: Element | null): CommitEntry[];

	/**
	 * Keyboard parity: same entries for a discrete key move.
	 *
	 * Supported keys (documented per ADR-15):
	 *   "ArrowLeft"  — move to previous column/slot
	 *   "ArrowRight" — move to next column/slot
	 *   "Alt+ArrowUp"   — move position up (e.g. earlier storyDay)
	 *   "Alt+ArrowDown" — move position down (e.g. later storyDay)
	 *
	 * Any other key string is passed through; the renderer decides if it is
	 * meaningful. Returning [] means no-op (no write).
	 */
	computeKey(card: HTMLElement, key: string): CommitEntry[];
}

/**
 * Options for InteractionHandler.
 */
export interface InteractionHandlerOpts {
	/** Host wires this to commit/commitMany; the handler calls it on flush. */
	onWrite: (file: TFile, entries: CommitEntry[]) => Promise<CommitResult>;
	/** Called after a successful write; triggers optimistic re-render (ADR-22). */
	onAfter: (file: TFile) => void;
	/**
	 * Called when onWrite returns {ok:false} — the rollback signal (ADR-24).
	 * Optional; if absent, failures are silently dropped (onAfter is NOT called).
	 */
	onError?: (file: TFile, result: CommitResult) => void;
	/** Wired to the view's aria-live region (F8, AC-11). Optional. */
	announce?: (msg: string) => void;
	/** Default: DEBOUNCE_MS from pluginConstants. Per-file (ADR-23). */
	debounceMs?: number;
	/** Pixels of movement before a drag is considered armed. Default: 5. */
	dragThreshold?: number;
}

// ---------------------------------------------------------------------------
// Drag state (per in-flight drag only)
// ---------------------------------------------------------------------------

interface DragState {
	card: HTMLElement;
	file: TFile;
	strategy: Draggable;
	originX: number;
	originY: number;
	armed: boolean;
}

// ---------------------------------------------------------------------------
// InteractionHandler
// ---------------------------------------------------------------------------

/**
 * One InteractionHandler per WorkspaceView.
 *
 * Registers delegated pointer + keyboard listeners on `host` (one set total).
 * Each call to `bind(card, file, strategy)` registers the card as draggable and
 * keyboard-actionable by recording it in an internal map.
 */
export class InteractionHandler {
	private readonly _app: App;
	private readonly _host: HTMLElement;
	private readonly _opts: Required<Omit<InteractionHandlerOpts, "announce" | "onError">> & {
		announce?: (msg: string) => void;
		onError?: (file: TFile, result: CommitResult) => void;
	};

	/** Map from card element → { file, strategy }. */
	private readonly _cards = new Map<HTMLElement, { file: TFile; strategy: Draggable }>();

	/**
	 * Per-file pending entry queue.
	 * Key: file.path → ordered CommitEntry[] (last value per key wins on flush).
	 */
	private readonly _pending = new Map<string, CommitEntry[]>();

	/**
	 * Per-file debounced flush functions.
	 * Created lazily on first apply(); cancelled on destroy().
	 */
	private readonly _flushFns = new Map<
		string,
		ReturnType<typeof debounce<[], void>>
	>();

	/** Component delegate — owns all DOM listener registrations for CON-4. */
	private readonly _delegate: Component;

	/** Current drag in-flight (null when idle). */
	private _drag: DragState | null = null;

	constructor(app: App, host: HTMLElement, opts: InteractionHandlerOpts) {
		this._app = app;
		this._host = host;
		this._opts = {
			onWrite: opts.onWrite,
			onAfter: opts.onAfter,
			onError: opts.onError,
			announce: opts.announce,
			debounceMs: opts.debounceMs ?? DEBOUNCE_MS,
			dragThreshold: opts.dragThreshold ?? 5,
		};

		this._delegate = new Component();

		// Pointer events — delegated on host (ADR-15).
		this._delegate.registerDomEvent(
			host,
			"pointerdown",
			this._onPointerDown.bind(this) as (e: PointerEvent) => void,
		);
		// pointermove and pointerup are delegated on document so they track
		// the pointer even when it leaves the host element.
		this._delegate.registerDomEvent(
			document as unknown as HTMLElement,
			"pointermove",
			this._onPointerMove.bind(this) as (e: PointerEvent) => void,
		);
		this._delegate.registerDomEvent(
			document as unknown as HTMLElement,
			"pointerup",
			this._onPointerUp.bind(this) as (e: PointerEvent) => void,
		);
		this._delegate.registerDomEvent(
			document as unknown as HTMLElement,
			"pointercancel",
			this._onPointerCancel.bind(this) as (e: PointerEvent) => void,
		);

		// Keyboard events — delegated on host for focused cards.
		this._delegate.registerDomEvent(
			host,
			"keydown",
			this._onKeyDown.bind(this) as (e: KeyboardEvent) => void,
		);
	}

	// ---------------------------------------------------------------------------
	// Public API
	// ---------------------------------------------------------------------------

	/**
	 * Register a card element as draggable + keyboard-actionable.
	 *
	 * The card must be a descendant of `host`. The handler records the mapping;
	 * pointer + keyboard events are delegated from the host and resolved via
	 * `closest` / the internal map.
	 */
	bind(card: HTMLElement, file: TFile, strategy: Draggable): void {
		this._cards.set(card, { file, strategy });
		// Ensure the card is keyboard-reachable (a11y, F8, AC-11).
		if (!card.hasAttribute("tabindex")) card.setAttribute("tabindex", "0");
	}

	/**
	 * Remove all listeners, cancel pending flushes, and clear card registrations.
	 * Call from WorkspaceView.onClose() (CON-4).
	 */
	destroy(): void {
		// Cancel all pending debounced flushes.
		for (const fn of this._flushFns.values()) {
			fn.cancel();
		}
		this._flushFns.clear();
		this._pending.clear();
		this._cards.clear();
		this._drag = null;
		// Remove all DOM listeners.
		this._delegate._unload();
	}

	// ---------------------------------------------------------------------------
	// Pointer event handlers
	// ---------------------------------------------------------------------------

	private _onPointerDown(e: PointerEvent): void {
		// Primary button only; no modifier shortcuts.
		if (e.button !== 0) return;

		const target = e.target as Element | null;
		if (!target) return;

		// Drill wins: if the pointerdown target is inside a [data-sf-link], do not arm.
		if (target.closest("[data-sf-link]")) return;

		// Resolve the bound card via the internal map.
		const card = this._resolveCard(target);
		if (!card) return;

		const binding = this._cards.get(card);
		if (!binding) return;

		this._drag = {
			card,
			file: binding.file,
			strategy: binding.strategy,
			originX: e.clientX,
			originY: e.clientY,
			armed: false,
		};
	}

	private _onPointerMove(e: PointerEvent): void {
		if (!this._drag) return;

		const dx = e.clientX - this._drag.originX;
		const dy = e.clientY - this._drag.originY;
		const dist = Math.sqrt(dx * dx + dy * dy);

		if (!this._drag.armed && dist >= this._opts.dragThreshold) {
			this._drag.armed = true;
			this._drag.card.classList.add("sf-dragging");
		}
	}

	private _onPointerUp(e: PointerEvent): void {
		if (!this._drag) return;

		const drag = this._drag;
		this._drag = null;

		// Clean up drag class regardless.
		drag.card.classList.remove("sf-dragging");

		if (!drag.armed) return; // threshold not reached — no-op

		// Resolve drop target via elementFromPoint (ADR-15).
		const dropTarget = document.elementFromPoint(e.clientX, e.clientY);
		const entries = drag.strategy.computeDrop(drag.card, dropTarget);

		if (entries.length === 0) return; // no-op (AC-F1.6, AC-F3.5)

		this._apply(drag.file, entries);
	}

	private _onPointerCancel(_e: PointerEvent): void {
		if (!this._drag) return;
		this._drag.card.classList.remove("sf-dragging");
		this._drag = null;
	}

	// ---------------------------------------------------------------------------
	// Keyboard event handler
	// ---------------------------------------------------------------------------

	/**
	 * Documented keys (ADR-15, T3.2):
	 *   ArrowLeft / ArrowRight — move card to previous/next column or slot.
	 *   Alt+ArrowUp / Alt+ArrowDown — vertical position adjustments.
	 *
	 * Enter and Space are NOT consumed here — drill behavior owns them (AC-F8.3).
	 */
	private _onKeyDown(e: KeyboardEvent): void {
		const target = e.target as Element | null;
		if (!target) return;

		const card = this._resolveCard(target);
		if (!card) return;

		const binding = this._cards.get(card);
		if (!binding) return;

		// Build a canonical key string that includes Alt modifier for arrow keys.
		let key = e.key;
		if (e.altKey && (key === "ArrowUp" || key === "ArrowDown")) {
			key = `Alt+${key}`;
		}

		const isHandledKey =
			key === "ArrowLeft" ||
			key === "ArrowRight" ||
			key === "Alt+ArrowUp" ||
			key === "Alt+ArrowDown";

		if (!isHandledKey) return;

		e.preventDefault();

		const entries = binding.strategy.computeKey(card, key);
		if (entries.length === 0) return; // no-op

		// Same commit path as drag (F8, AC-11).
		void this._applyAsync(binding.file, entries, card);
	}

	// ---------------------------------------------------------------------------
	// Internal apply path — shared by pointer drop and keyboard
	// ---------------------------------------------------------------------------

	/**
	 * Enqueue entries under file.path, then schedule a per-file debounced flush.
	 *
	 * Merge rule (ADR-23): latest value wins per key.
	 * Entries from different files flush independently.
	 */
	private _apply(file: TFile, entries: CommitEntry[]): void {
		// Merge: build a key→entry map, latest wins.
		const existing = this._pending.get(file.path) ?? [];
		const map = new Map<string, CommitEntry>(existing.map((e) => [e.key, e]));
		for (const entry of entries) {
			map.set(entry.key, entry);
		}
		this._pending.set(file.path, Array.from(map.values()));

		// Schedule or reset the per-file debounced flush.
		if (!this._flushFns.has(file.path)) {
			const flushFn = debounce(
				(): void => {
					void this._flush(file);
				},
				this._opts.debounceMs,
				true, // resetTimer = true
			);
			this._flushFns.set(file.path, flushFn);
		}
		this._flushFns.get(file.path)!();
	}

	/**
	 * Async wrapper for keyboard path — the keyboard handler is synchronous and
	 * calls _applyAsync so that announce() can be called after the write resolves.
	 *
	 * The card reference is passed so we can announce a card-specific message.
	 */
	private async _applyAsync(
		file: TFile,
		entries: CommitEntry[],
		_card: HTMLElement,
	): Promise<void> {
		// We use the same debounced path as pointer drops, then wait for the flush.
		// Because debounceMs may be 0 in tests, we flush immediately.
		this._apply(file, entries);
		// Wait for any microtasks (Promise resolutions) to settle.
		// The announce is called after the flush completes in _flush().
		// We store a reference here so we can announce after flush.
		// This is handled via the _pendingAnnounce mechanism below.
		this._pendingAnnounce = true;
	}

	/** Set to true when the keyboard path wants an announcement after flush. */
	private _pendingAnnounce = false;

	/**
	 * Flush the pending entries for `file` to onWrite.
	 * Called by the debounced flush function.
	 *
	 * On success: calls onAfter(file); optionally announces (keyboard path).
	 * On failure: calls onError(file, result); does NOT call onAfter; does NOT throw.
	 */
	private async _flush(file: TFile): Promise<void> {
		const entries = this._pending.get(file.path);
		if (!entries || entries.length === 0) return;

		// Clear the pending queue before the write so re-entrant applies
		// start fresh.
		this._pending.delete(file.path);

		let result: CommitResult;
		try {
			result = await this._opts.onWrite(file, entries);
		} catch {
			result = {
				ok: false,
				reason: "write",
				message: "Unexpected error during write.",
				keepDirty: true,
			};
		}

		if (result.ok) {
			this._opts.onAfter(file);
			if (this._pendingAnnounce && this._opts.announce) {
				this._pendingAnnounce = false;
				const keyStr = entries.map((e) => `${e.key}=${String(e.value)}`).join(", ");
				this._opts.announce(`Updated ${file.basename ?? file.name}: ${keyStr}`);
			} else {
				this._pendingAnnounce = false;
			}
		} else {
			this._pendingAnnounce = false;
			this._opts.onError?.(file, result);
		}
	}

	// ---------------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------------

	/**
	 * Walk up from `target` to find the nearest bound card element.
	 * Returns null if no bound card is found in the ancestor chain.
	 */
	private _resolveCard(target: Element): HTMLElement | null {
		let el: Element | null = target;
		while (el) {
			if (el instanceof HTMLElement && this._cards.has(el)) {
				return el;
			}
			el = el.parentElement;
		}
		return null;
	}
}
