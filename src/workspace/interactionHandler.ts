/**
 * interactionHandler.ts — M6 Phase 3 (ADR-15, ADR-22, ADR-23, ADR-24)
 *
 * A reusable pointer-drag + keyboard + per-file-debounced-commit layer.
 * Interactive renderers (Kanban, Plotgrid, Timeline-placement) bind their
 * cards to this handler. Read-only renderers do NOT use it.
 *
 * Design decisions:
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
 *   delegate. `destroy()` calls the public `unload()` on that delegate, which
 *   removes all DOM listeners. Pending debounce timers are also cancelled.
 *
 * ANNOUNCE (T3.2 — F8, AC-11):
 *   The keyboard path sets a per-file announce flag before scheduling the
 *   debounced flush. A pointer-drop path does not set it. The flush reads the
 *   flag once at the time of the flush call, so coalescing always reflects
 *   whether the most recent apply came from the keyboard.
 *
 * @ref docs/XDD/specs/007-interactive-views/plan/phase-3.md
 * @ref docs/XDD/specs/007-interactive-views/solution.md
 */

import type { App, TFile } from "obsidian";
import { Component, debounce } from "obsidian";
import { DEBOUNCE_MS } from "pluginConstants";
import type { CommitEntry, CommitResult } from "../inspector/frontmatterWriter";
import type { JournalGroup } from "../undo/journalTypes";

// ---------------------------------------------------------------------------
// Re-export CommitEntry so renderers don't need a second import path.
// ---------------------------------------------------------------------------

export type { CommitEntry };

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/** What a gesture hands to the strategy: the undo group its writes join, or null. */
export interface GestureContext {
	readonly group: JournalGroup | null;
}

/**
 * Strategy supplied by each interactive renderer.
 *
 * The handler is view-agnostic: all domain semantics live here.
 * Both computeDrop and computeKey must return the SAME entry shape so drag and
 * keyboard share one commit path (F8, AC-11).
 */
export interface Draggable {
	/**
	 * Field(s) to write for a drop landing on `dropTarget`; [] = no-op/cancel.
	 * Called by the handler on pointerup with the resolved elementFromPoint target.
	 */
	computeDrop(card: HTMLElement, dropTarget: Element | null, ctx: GestureContext): CommitEntry[];

	/**
	 * Keyboard parity: same entries for a discrete key move.
	 *
	 * Supported key strings passed by the handler (documented per ADR-15):
	 *   "ArrowLeft"      — move to previous column/slot
	 *   "ArrowRight"     — move to next column/slot
	 *   "Alt+ArrowUp"    — move position up (e.g. earlier storyDay)
	 *   "Alt+ArrowDown"  — move position down (e.g. later storyDay)
	 *
	 * Returning [] means no-op (no write).
	 */
	computeKey(card: HTMLElement, key: string, ctx: GestureContext): CommitEntry[];
}

/**
 * Options for InteractionHandler.
 */
export interface InteractionHandlerOpts {
	/** Host wires this to commit/commitMany; the handler calls it on flush. */
	onWrite: (file: TFile, entries: CommitEntry[], group: JournalGroup | null) => Promise<CommitResult>;
	/** Opens an undo group for a gesture (ADR-38). Absent: no grouping. */
	openGroup?: () => JournalGroup;
	/** Called after a successful write; triggers optimistic re-render (ADR-22). */
	onAfter: (file: TFile) => void;
	/**
	 * Called when onWrite returns {ok:false} — the rollback signal (ADR-24).
	 * Optional; if absent, failures are silently surfaced (onAfter is NOT called).
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
 * One InteractionHandler per AnvilView.
 *
 * Registers delegated pointer + keyboard listeners on `host` (one set total).
 * Each call to `bind(card, file, strategy)` registers the card as draggable and
 * keyboard-actionable by recording it in an internal map.
 */
export class InteractionHandler {
	private readonly _opts: Required<Omit<InteractionHandlerOpts, "announce" | "onError" | "openGroup">> & {
		openGroup?: () => JournalGroup;
		announce?: (msg: string) => void;
		onError?: (file: TFile, result: CommitResult) => void;
	};

	/** Map from card element → { file, strategy }. */
	private readonly _cards = new Map<HTMLElement, { file: TFile; strategy: Draggable }>();

	/**
	 * Per-file pending entry queue.
	 * Key: file.path → CommitEntry[] (last value per key wins on merge — ADR-23).
	 */
	private readonly _pending = new Map<string, CommitEntry[]>();

	/**
	 * Per-file announce flag.
	 * Set to true when the most recent _apply for this file came from the keyboard
	 * path, so _flush() knows to call announce() on success.
	 * Pointer-drop applies set it to false, preventing spurious announcements.
	 */
	private readonly _announceOnFlush = new Map<string, boolean>();

	/**
	 * Per-file debounced flush functions.
	 * Created lazily on first _apply(); cancelled on destroy().
	 */
	private readonly _flushFns = new Map<
		string,
		ReturnType<typeof debounce<[], void>>
	>();

	/** Per-file group opened by the first gesture, closed by its flush (ADR-38). */
	private readonly _groups = new Map<string, JournalGroup>();

	/** Flushes that have started and not settled, with the path they write (ADR-39). */
	private readonly _inFlight = new Map<Promise<void>, string>();

	/** Component delegate — owns all DOM listener registrations for CON-4. */
	private readonly _delegate: Component;

	/** Current drag in-flight (null when idle). */
	private _drag: DragState | null = null;

	/** Ghost element following the pointer during an armed drag (null when idle). */
	private _ghost: HTMLElement | null = null;

	constructor(_app: App, host: HTMLElement, opts: InteractionHandlerOpts) {
		this._opts = {
			onWrite: opts.onWrite,
			onAfter: opts.onAfter,
			onError: opts.onError,
			announce: opts.announce,
			openGroup: opts.openGroup,
			debounceMs: opts.debounceMs ?? DEBOUNCE_MS,
			dragThreshold: opts.dragThreshold ?? 5,
		};

		this._delegate = new Component();

		// Pointer events — pointerdown on the host; move/up/cancel on activeWindow
		// so the pointer is tracked even when it leaves the host boundaries (ADR-15).
		// Using activeWindow (not document) for cross-popout-window safety.
		this._delegate.registerDomEvent(
			host,
			"pointerdown",
			this._onPointerDown.bind(this),
		);
		this._delegate.registerDomEvent(
			activeWindow,
			"pointermove",
			this._onPointerMove.bind(this),
		);
		this._delegate.registerDomEvent(
			activeWindow,
			"pointerup",
			this._onPointerUp.bind(this),
		);
		this._delegate.registerDomEvent(
			activeWindow,
			"pointercancel",
			this._onPointerCancel.bind(this),
		);

		// Keyboard events — delegated on host for focused bound cards.
		this._delegate.registerDomEvent(
			host,
			"keydown",
			this._onKeyDown.bind(this),
		);
	}

	// ---------------------------------------------------------------------------
	// Public API
	// ---------------------------------------------------------------------------

	/**
	 * Register a card element as draggable + keyboard-actionable.
	 *
	 * The card must be a descendant of `host`. The handler records the mapping;
	 * pointer + keyboard events are delegated from the host and resolved via the
	 * internal ancestor-walk.
	 */
	bind(card: HTMLElement, file: TFile, strategy: Draggable): void {
		this._cards.set(card, { file, strategy });
		// Ensure the card is keyboard-reachable (a11y, F8, AC-11).
		if (!card.hasAttribute("tabindex")) card.setAttribute("tabindex", "0");
	}

	/**
	 * Remove all listeners, START the pending flushes, and clear card registrations.
	 * Call from AnvilView.onClose() (CON-4).
	 *
	 * Synchronous: it starts every pending flush (ADR-52) but cannot await them.
	 * An owner that needs the writes and their groups settled calls
	 * `await flushPending()` afterwards; it still awaits flushes in flight.
	 */
	destroy(): void {
		this._runPendingFlushes();
		this._flushFns.clear();
		this._pending.clear();
		this._announceOnFlush.clear();
		this._cards.clear();
		this._drag = null;
		// Remove any live ghost (prevent leak if destroyed mid-drag).
		this._removeGhost();
		// Remove all DOM listeners via the real public Component.unload() (CON-4).
		this._delegate.unload();
	}

	/**
	 * Run every pending debounced flush now and await all writes in flight
	 * (ADR-39). Undo calls this before it reads the journal.
	 */
	async flushPending(): Promise<void> {
		this._runPendingFlushes();
		await Promise.allSettled([...this._inFlight.keys()]);
	}

	/** True while `path` has pending entries or a flush that has not settled. */
	isBusy(path: string): boolean {
		return this._pending.has(path) || [...this._inFlight.values()].includes(path);
	}

	private _runPendingFlushes(): void {
		for (const fn of this._flushFns.values()) fn.run();
	}

	/** The file's pending group, or a new one (undefined without `openGroup`). */
	private _groupFor(file: TFile): { group: JournalGroup | null; fresh: boolean } {
		const pending = this._groups.get(file.path);
		if (pending) return { group: pending, fresh: false };
		const group = this._opts.openGroup?.() ?? null;
		if (group) this._groups.set(file.path, group);
		return { group, fresh: group !== null };
	}

	/** Release a group that was opened for a gesture that wrote nothing. */
	private _dropEmptyGroup(file: TFile, g: { group: JournalGroup | null; fresh: boolean }): void {
		if (!g.fresh || !g.group) return;
		this._groups.delete(file.path);
		g.group.close();
	}

	/** Run a strategy call; if it throws, release the gesture's fresh group and rethrow. */
	private _guarded<T>(
		file: TFile,
		g: { group: JournalGroup | null; fresh: boolean },
		call: () => T,
	): T {
		try {
			return call();
		} catch (err) {
			this._dropEmptyGroup(file, g);
			throw err;
		}
	}

	// ---------------------------------------------------------------------------
	// Pointer event handlers
	// ---------------------------------------------------------------------------

	private _onPointerDown(e: PointerEvent): void {
		// Primary button only.
		if (e.button !== 0) return;

		const target = e.target as Element | null;
		if (!target) return;

		// AC-F8.3: Drill wins — a [data-sf-link] target never starts a drag.
		if (target.closest("[data-sf-link]")) return;

		// Resolve the bound card via ancestor walk.
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

			// Create ghost — a clone of the dragged card that follows the pointer.
			const ghost = this._drag.card.cloneNode(true) as HTMLElement;
			ghost.classList.add("sf-drag-ghost");
			ghost.style.left = `${e.clientX + 8}px`;
			ghost.style.top = `${e.clientY + 8}px`;
			activeDocument.body.appendChild(ghost);
			this._ghost = ghost;
		} else if (this._drag.armed && this._ghost) {
			// Update ghost position to track the pointer.
			this._ghost.style.left = `${e.clientX + 8}px`;
			this._ghost.style.top = `${e.clientY + 8}px`;
		}
	}

	private _onPointerUp(e: PointerEvent): void {
		if (!this._drag) return;

		const drag = this._drag;
		this._drag = null;

		// Remove ghost from DOM.
		this._removeGhost();

		// Clean up drag class regardless of whether the drag was armed.
		drag.card.classList.remove("sf-dragging");

		if (!drag.armed) return; // threshold not reached — no-op

		// Resolve drop target via elementFromPoint (ADR-15).
		// activeDocument is the cross-popout-window-safe equivalent of document.
		const dropTarget = activeDocument.elementFromPoint(e.clientX, e.clientY);
		const g = this._groupFor(drag.file);
		const entries = this._guarded(drag.file, g, () =>
			drag.strategy.computeDrop(drag.card, dropTarget, { group: g.group }),
		);

		if (entries.length === 0) {
			this._dropEmptyGroup(drag.file, g);
			return; // no-op (AC-F1.6, AC-F3.5)
		}

		// Pointer drop — no announce.
		this._apply(drag.file, entries, false);
	}

	private _onPointerCancel(_e: PointerEvent): void {
		if (!this._drag) return;
		this._drag.card.classList.remove("sf-dragging");
		this._drag = null;
		this._removeGhost();
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

		// Build a canonical key string; include Alt modifier for vertical arrows.
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

		const g = this._groupFor(binding.file);
		const entries = this._guarded(binding.file, g, () =>
			binding.strategy.computeKey(card, key, { group: g.group }),
		);
		if (entries.length === 0) {
			this._dropEmptyGroup(binding.file, g);
			return; // no-op
		}

		// Keyboard path — announce on success (F8, AC-11).
		this._apply(binding.file, entries, true);
	}

	// ---------------------------------------------------------------------------
	// Internal apply path — shared by pointer drop and keyboard (F8, AC-11)
	// ---------------------------------------------------------------------------

	/**
	 * Enqueue entries under file.path, then schedule a per-file debounced flush.
	 *
	 * Merge rule (ADR-23): latest value wins per key.
	 * Entries from different files flush independently.
	 *
	 * @param shouldAnnounce — true when called from the keyboard path; announce()
	 *   will be called on successful flush. The pointer path passes false.
	 */
	private _apply(file: TFile, entries: CommitEntry[], shouldAnnounce: boolean): void {
		// Merge: build a key→entry map, latest wins per key.
		const existing = this._pending.get(file.path) ?? [];
		const map = new Map<string, CommitEntry>(existing.map((e) => [e.key, e]));
		for (const entry of entries) {
			map.set(entry.key, entry);
		}
		this._pending.set(file.path, Array.from(map.values()));

		// Update the per-file announce flag.
		// Most-recent write determines whether the flush announces:
		// if the last apply was a keyboard action, announce; otherwise don't.
		this._announceOnFlush.set(file.path, shouldAnnounce);

		// Schedule or reset the per-file debounced flush.
		if (!this._flushFns.has(file.path)) {
			const flushFn = debounce(
				(): void => {
					this._startFlush(file);
				},
				this._opts.debounceMs,
				true, // resetTimer = true
			);
			this._flushFns.set(file.path, flushFn);
		}
		this._flushFns.get(file.path)!();
	}

	/** Start a flush and track it until it settles (isBusy, flushPending). */
	private _startFlush(file: TFile): void {
		const p = this._flush(file);
		this._inFlight.set(p, file.path);
		// A throwing onAfter/onError must not become an unhandled rejection.
		void p
			.catch((err: unknown) => console.error("[story-forge] flush callback failed", err))
			.finally(() => this._inFlight.delete(p));
	}

	/**
	 * Flush the pending entries for `file` to onWrite.
	 *
	 * On success: calls onAfter(file); if announce flag is set, calls announce().
	 * On failure: calls onError?(file, result); does NOT call onAfter; does NOT throw.
	 */
	private async _flush(file: TFile): Promise<void> {
		const entries = this._pending.get(file.path);
		if (!entries || entries.length === 0) return;

		const shouldAnnounce = this._announceOnFlush.get(file.path) ?? false;

		// Clear pending state before the write so re-entrant applies start fresh.
		this._pending.delete(file.path);
		this._announceOnFlush.delete(file.path);
		const group = this._groups.get(file.path) ?? null;
		this._groups.delete(file.path);

		let result: CommitResult;
		try {
			result = await this._opts.onWrite(file, entries, group);
		} catch {
			result = {
				ok: false,
				reason: "write",
				message: "Unexpected error during write.",
				keepDirty: true,
			};
		} finally {
			group?.close();
		}

		if (result.ok) {
			this._opts.onAfter(file);
			if (shouldAnnounce && this._opts.announce) {
				const keyStr = entries.map((e) => `${e.key}=${String(e.value)}`).join(", ");
				this._opts.announce(`Updated ${file.basename ?? file.name}: ${keyStr}`);
			}
		} else {
			this._opts.onError?.(file, result);
		}
	}

	// ---------------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------------

	/**
	 * Remove the floating drag ghost from the DOM and null the reference.
	 * Safe to call when no ghost is live.
	 */
	private _removeGhost(): void {
		if (this._ghost) {
			this._ghost.remove();
			this._ghost = null;
		}
	}

	/**
	 * Walk up from `target` to find the nearest bound card element.
	 * Returns null if no bound card is found in the ancestor chain.
	 */
	private _resolveCard(target: Element): HTMLElement | null {
		let el: Element | null = target;
		while (el) {
			// eslint-disable-next-line obsidianmd/prefer-instanceof
			if (el instanceof HTMLElement && this._cards.has(el)) {
				return el;
			}
			el = el.parentElement;
		}
		return null;
	}
}
