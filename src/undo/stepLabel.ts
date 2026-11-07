/**
 * stepLabel — every user-facing string of the undo journal (ADR-49).
 *
 * The wording is the signed-off text of mockups U5-U9 (2026-11-06, P1/P6/P8/P9/P10).
 * All of it lives here so one file changes. Pure.
 */
import type { ChangeCounts, ConflictReport, Slot, Step, StepSummary, UndoDirection, UndoOutcome } from "./journalTypes";

/** Values longer than this are cut and end in an ellipsis. */
export const MAX_DISPLAY_CHARS = 40;
const MAX_NAMED_CONFLICTS = 3;

function noteName(path: string): string {
	const base = path.slice(path.lastIndexOf("/") + 1);
	return base.endsWith(".md") ? base.slice(0, -3) : base;
}

function truncate(text: string): string {
	return text.length > MAX_DISPLAY_CHARS ? `${text.slice(0, MAX_DISPLAY_CHARS)}…` : text;
}

/** A list item or scalar as plain text; maps (the only objects left after YAML) as JSON. */
function plainText(v: unknown): string {
	if (typeof v === "object" && v !== null) return JSON.stringify(v);
	return String(v);
}

function listText(items: readonly unknown[]): string {
	if (items.length === 0) return "empty list";
	return truncate(items.map(plainText).join(", "));
}

/** A value as it reads in a notice: strings quoted, lists joined, absent as "not set". */
export function formatValue(slot: Slot): string {
	if (!slot.present) return "not set";
	const v = slot.value;
	if (v === null) return "empty";
	if (typeof v === "string") return `'${truncate(v)}'`;
	if (Array.isArray(v)) return listText(v);
	return truncate(plainText(v));
}

export function summariseStep(step: Step): StepSummary {
	const fieldCount = step.files.reduce((sum, f) => sum + f.changes.length, 0);
	const noteCount = step.files.length;
	return { label: labelFor(step, fieldCount, noteCount), fieldCount, noteCount };
}

export function stepLabel(step: Step): string {
	return summariseStep(step).label;
}

function labelFor(step: Step, fieldCount: number, noteCount: number): string {
	const first = step.files[0];
	if (noteCount === 1 && first !== undefined) {
		const name = noteName(first.path);
		return fieldCount === 1 && first.changes[0] ? `${first.changes[0].key} in ${name}` : `${fieldCount} changes in ${name}`;
	}
	return `${fieldCount} changes in ${noteCount} notes`;
}

function verb(direction: UndoDirection): string {
	return direction === "undo" ? "Undo" : "Redo";
}

function nothingTo(direction: UndoDirection): string {
	return `Nothing to ${direction}`;
}

/** The control's tooltip and accessible name: "Undo: <label>", or "Nothing to undo" without a step. */
export function controlTitle(direction: UndoDirection, label: string | null): string {
	return label === null ? nothingTo(direction) : `${verb(direction)}: ${label}`;
}

/** The command that reverses this direction. No key is named: Cmd+Shift+Z is the note editor's own redo (P8). */
function reverseVerb(direction: UndoDirection): string {
	return direction === "undo" ? "Redo" : "Undo";
}

/** True for exactly one note holding exactly one change: "its change", else "their/its changes" (P10). */
function isSingleChange(paths: readonly string[], counts: ChangeCounts): boolean {
	const [only] = paths;
	return paths.length === 1 && only !== undefined && (counts[only] ?? 1) === 1;
}

function andList(names: readonly string[]): string {
	if (names.length < 2) return names.join("");
	return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function conflictNames(conflicts: readonly ConflictReport[]): string {
	const named = conflicts.slice(0, MAX_NAMED_CONFLICTS).map(c => `${c.key} in ${noteName(c.path)}`);
	const rest = conflicts.length - named.length;
	return rest > 0 ? `${named.join(", ")} and ${rest} more` : andList(named);
}

function conflictSentence(o: Extract<UndoOutcome, { kind: "applied" }>): string {
	const [only] = o.conflicts;
	const reverse = reverseVerb(o.direction);
	if (o.conflicts.length === 1 && only !== undefined) {
		return `${verb(o.direction)}: ${only.key} in ${noteName(only.path)} is ${formatValue(only.written)} again. ` +
			`It had changed to ${formatValue(only.found)}; ${reverse} restores it.`;
	}
	return `${verb(o.direction)}: ${conflictNames(o.conflicts)} had changed since; ${reverse} restores them.`;
}

function failedSentence(paths: readonly string[], direction: UndoDirection, counts: ChangeCounts): string {
	const names = andList(paths.map(noteName));
	const stays = isSingleChange(paths, counts) ? "its change stays" : paths.length === 1 ? "its changes stay" : "their changes stay";
	return `Couldn't write ${names}; ${stays} on the ${direction} stack.`;
}

function vanishedSentence(paths: readonly string[], counts: ChangeCounts): string {
	const names = andList(paths.map(noteName));
	const clause = paths.length > 1 ? "no longer exist; their changes were"
		: isSingleChange(paths, counts) ? "no longer exists; its change was" : "no longer exists; its changes were";
	return `${names} ${clause} removed from the undo history.`;
}

function appliedNotice(o: Extract<UndoOutcome, { kind: "applied" }>): string {
	const main = o.conflicts.length > 0 ? conflictSentence(o) : `${verb(o.direction)}: ${stepLabel(o.step)}`;
	const extras: string[] = [];
	if (o.failedPaths.length > 0) extras.push(failedSentence(o.failedPaths, o.direction, o.changeCounts));
	if (o.vanishedPaths.length > 0) extras.push(vanishedSentence(o.vanishedPaths, o.changeCounts));
	if (extras.length === 0) return main;
	return [main.endsWith(".") ? main : `${main}.`, ...extras].join(" ");
}

function failedNotice(o: Extract<UndoOutcome, { kind: "failed" }>): string {
	const { fieldCount, noteCount } = summariseStep(o.step);
	const what = fieldCount === 1 ? "the change" : "the changes";
	const first = o.step.files[0];
	const where = noteCount === 1 && first !== undefined ? noteName(first.path) : `${noteCount} notes`;
	const stays = fieldCount === 1 ? "It stays" : "They stay";
	const main = `Couldn't ${o.direction} ${what} in ${where}. ${stays} on the ${o.direction} stack; try again.`;
	return o.vanishedPaths.length > 0 ? `${main} ${vanishedSentence(o.vanishedPaths, o.changeCounts)}` : main;
}

/** The notice for an undo or redo that rejected unexpectedly (P1); the console warning stays. */
export function unexpectedErrorNotice(direction: UndoDirection): string {
	return `Couldn't ${direction}: an unexpected error occurred. See the developer console for details.`;
}

/** The notice after "Clear undo history" in the settings (ADR-48, mockup U11). */
export const HISTORY_CLEARED_NOTICE = "Undo history cleared";

/** The notice text for one undo/redo outcome. */
export function outcomeNotice(o: UndoOutcome): string {
	switch (o.kind) {
		case "empty":
			return nothingTo(o.direction);
		case "refused":
			return `Save your edit first (${noteName(o.path)})`;
		case "failed":
			return failedNotice(o);
		case "vanished":
			return vanishedSentence(o.paths, o.changeCounts);
		case "applied":
			return appliedNotice(o);
	}
}
