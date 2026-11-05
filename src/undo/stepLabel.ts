/**
 * stepLabel — every user-facing string of the undo journal (ADR-49).
 *
 * The wording is PROVISIONAL until the mockup sign-off (OQ-3). All of it lives
 * here so one file changes. Pure, apart from reading `Platform.isMacOS` for
 * the modifier key name.
 */
import { Platform } from "obsidian";
import type { ConflictReport, Slot, Step, StepSummary, UndoDirection, UndoOutcome } from "./journalTypes";

/** Values longer than this are cut and end in an ellipsis. */
export const MAX_DISPLAY_CHARS = 40;
const MAX_NAMED_CONFLICTS = 3;

/** "Cmd" on macOS, "Ctrl" elsewhere. */
export function modKeyName(): string {
	return Platform.isMacOS ? "Cmd" : "Ctrl";
}

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

/** The shortcut that reverses this direction. */
function reverseShortcut(direction: UndoDirection): string {
	return direction === "undo" ? `${modKeyName()}+Shift+Z` : `${modKeyName()}+Z`;
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
	const key = reverseShortcut(o.direction);
	if (o.conflicts.length === 1 && only !== undefined) {
		return `${verb(o.direction)}: ${only.key} in ${noteName(only.path)} is ${formatValue(only.written)} again. ` +
			`It had changed to ${formatValue(only.found)}; ${key} restores it.`;
	}
	return `${verb(o.direction)}: ${conflictNames(o.conflicts)} had changed since; ${key} restores them.`;
}

function failedSentence(paths: readonly string[], direction: UndoDirection): string {
	const names = andList(paths.map(noteName));
	const stays = paths.length === 1 ? "its change stays" : "their changes stay";
	return `Couldn't write ${names}; ${stays} on the ${direction} stack.`;
}

function vanishedSentence(paths: readonly string[]): string {
	const names = andList(paths.map(noteName));
	const clause = paths.length === 1 ? "no longer exists; its change was" : "no longer exist; their changes were";
	return `${names} ${clause} removed from the undo history.`;
}

function appliedNotice(o: Extract<UndoOutcome, { kind: "applied" }>): string {
	const main = o.conflicts.length > 0 ? conflictSentence(o) : `${verb(o.direction)}: ${stepLabel(o.step)}`;
	const extras: string[] = [];
	if (o.failedPaths.length > 0) extras.push(failedSentence(o.failedPaths, o.direction));
	if (o.vanishedPaths.length > 0) extras.push(vanishedSentence(o.vanishedPaths));
	if (extras.length === 0) return main;
	return [main.endsWith(".") ? main : `${main}.`, ...extras].join(" ");
}

function failedNotice(o: Extract<UndoOutcome, { kind: "failed" }>): string {
	const { fieldCount, noteCount } = summariseStep(o.step);
	const what = fieldCount === 1 ? "the change" : "the changes";
	const first = o.step.files[0];
	const where = noteCount === 1 && first !== undefined ? noteName(first.path) : `${noteCount} notes`;
	return `Couldn't ${o.direction} ${what} in ${where}. It stays on the ${o.direction} stack; try again.`;
}

/** The notice text for one undo/redo outcome. */
export function outcomeNotice(o: UndoOutcome): string {
	switch (o.kind) {
		case "empty":
			return `Nothing to ${o.direction}`;
		case "refused":
			return `Save or discard your edit first (${noteName(o.path)})`;
		case "failed":
			return failedNotice(o);
		case "vanished":
			return vanishedSentence(o.paths);
		case "applied":
			return appliedNotice(o);
	}
}
