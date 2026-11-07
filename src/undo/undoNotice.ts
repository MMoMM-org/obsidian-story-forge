/**
 * undoNotice — the notice for an undo/redo that rejected (spec 009, ADR-49, mockup U9, P1).
 *
 * A rejection is a bug, not an outcome: it is logged and the user is told once, in the
 * wording of `stepLabel`. Shared by the palette commands and both sets of controls.
 */
import { Notice } from "obsidian";
import type { UndoDirection } from "undo/journalTypes";
import { HISTORY_CLEARED_NOTICE, unexpectedErrorNotice } from "undo/stepLabel";

/** Log a rejected undo/redo and show the unexpected-error notice. */
export function reportRejectedUndo(direction: UndoDirection, err: unknown): void {
	console.warn(`[StoryForge] Undo journal: ${direction} failed.`, err);
	new Notice(unexpectedErrorNotice(direction));
}

/** Tell the user the stored history is gone (ADR-48). */
export function showHistoryCleared(): void {
	new Notice(HISTORY_CLEARED_NOTICE);
}
