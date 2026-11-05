/**
 * frontmatterWriter — validate-before-write wrapper for processFrontMatter.
 *
 * Contract:
 *  - Validates the value in memory BEFORE any vault write (AC-F6.5).
 *  - A type error returns {ok:false, reason:"validation"} without calling
 *    processFrontMatter — nothing is written to the vault.
 *  - A valid value calls processFrontMatter exactly once; on resolve returns {ok:true}.
 *  - If processFrontMatter rejects, returns {ok:false, reason:"write"} with keepDirty.
 *  - Out-of-vocab select values are advisory only (warn, never block — ADR-7).
 *  - This module NEVER persists to plugin state (CON-1 — transient only).
 *  - Reports each successful write that changed a value to the installed
 *    WriteRecorder (spec 009, ADR-44); `restore` is the unrecorded write path.
 *
 * @ref SDD/ADR-7 — block type errors, warn vocab
 * @ref PRD/AC-F6.3, AC-F6.5, AC-F6.6, AC-F6.7
 * @ref obsidian.d.ts:2954 — processFrontMatter(file, fn, options?)
 */

import type { App, TFile } from "obsidian";
import type { FieldChange, JournalGroup, Slot } from "../undo/journalTypes";
import { slotOf, slotsEqual } from "../undo/yamlValue";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Field type discriminant. Mirrors schema/*.json field.type values.
 *
 * `"boolean"` was added by T5.4 (spec 008): the editor pane renders a checkbox
 * for metadata-menu's `Boolean` type, and a checkbox reports a real `true` /
 * `false`. Every other member rejects a boolean as a type error, so without
 * this a `Boolean` field would be silently uneditable — and writing `"true"`
 * instead would put a string where Bases and Dataview expect a boolean. No
 * `schema/*.json` field is boolean today; the Workbench inspector reaches this
 * through a user FileClass field or an undeclared key holding a boolean.
 */
export type FieldType =
	| "text"
	| "number"
	| "boolean"
	| "select"
	| "list"
	| "tags"
	| "relation"
	| "fixed";

/**
 * Minimal field descriptor consumed by the writer.
 * Select fields carry an optional `values` array (the FileClass field's
 * `valuesList` options, via `inspectorFieldsFromModel`). A read-only field
 * arrives as `fixed`.
 */
export type FieldSpec =
	| { name: string; type: Extract<FieldType, "text" | "list" | "tags" | "relation" | "fixed"> }
	| { name: string; type: Extract<FieldType, "number"> }
	| { name: string; type: Extract<FieldType, "boolean"> }
	| { name: string; type: Extract<FieldType, "select">; values?: string[] };

/** Success result. */
export interface CommitOk {
	readonly ok: true;
}

/** Failure result — carries reason + keepDirty so the UI preserves the edit. */
export interface CommitError {
	readonly ok: false;
	readonly reason: "validation" | "write";
	readonly message: string;
	readonly keepDirty: true;
}

export type CommitResult = CommitOk | CommitError;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

type ValidationOk = { kind: "ok" };
type ValidationTypeError = { kind: "type-error"; message: string };
type ValidationResult = ValidationOk | ValidationTypeError;

/** Validate `value` against `field` in memory — no vault side effects. */
function validateField(field: FieldSpec, value: unknown): ValidationResult {
	// null / undefined are valid for any field (clearing a value).
	if (value === null || value === undefined) {
		return { kind: "ok" };
	}

	switch (field.type) {
		case "text":
		case "fixed":
		case "tags":
			if (typeof value !== "string") {
				return {
					kind: "type-error",
					message: `Field "${field.name}" expects a text value, got ${typeof value}.`,
				};
			}
			return { kind: "ok" };

		case "number":
			// NaN and Infinity are typeof "number" but cannot round-trip through YAML frontmatter.
			if (typeof value !== "number" || !Number.isFinite(value)) {
				const got = typeof value === "number" ? "NaN or Infinity" : typeof value;
				return {
					kind: "type-error",
					message: `Field "${field.name}" expects a finite number, got ${got}.`,
				};
			}
			return { kind: "ok" };

		case "boolean":
			// A checkbox's value. Frontmatter must hold a real boolean, not the
			// string "true" — see the FieldType docstring.
			if (typeof value !== "boolean") {
				return {
					kind: "type-error",
					message: `Field "${field.name}" expects true or false, got ${typeof value}.`,
				};
			}
			return { kind: "ok" };

		case "select":
			// Type constraint: must be a string.
			if (typeof value !== "string") {
				return {
					kind: "type-error",
					message: `Field "${field.name}" expects a string value, got ${typeof value}.`,
				};
			}
			// Out-of-vocab: advisory warn only (ADR-7 — frontmatter is truth).
			// We warn at the call site but do NOT block here.
			return { kind: "ok" };

		case "list":
		case "relation":
			// Lists are always written as arrays; a single string is tolerated for relations.
			// Any non-primitive that isn't an array is a type error.
			if (
				typeof value !== "string" &&
				!Array.isArray(value)
			) {
				return {
					kind: "type-error",
					message: `Field "${field.name}" expects a list or string, got ${typeof value}.`,
				};
			}
			return { kind: "ok" };
	}
}

/**
 * Returns true if `value` is out of the declared select vocabulary.
 * False when field has no values array or value is in-vocab.
 */
function isOutOfVocab(field: FieldSpec, value: unknown): boolean {
	if (field.type !== "select") return false;
	if (!field.values || field.values.length === 0) return false;
	return typeof value === "string" && !field.values.includes(value);
}

// ---------------------------------------------------------------------------
// Shared messages (used by both commit and commitMany — keep in one place).
// ---------------------------------------------------------------------------

/** Advisory warning for an out-of-vocab select value (ADR-7 — writes anyway). */
function outOfVocabWarning(value: unknown, key: string): string {
	return `[StoryForge] Inspector: "${String(value)}" is not in the declared vocabulary for field "${key}". Writing anyway (frontmatter is truth).`;
}

/**
 * User-facing message when processFrontMatter rejects. Deliberately says
 * nothing about what happens to the user's edit: that depends on the surface
 * (the inspector keeps its draft, the editor pane restores the old value), so
 * each surface appends its own consequence.
 */
const WRITE_ERROR_MESSAGE = "Couldn't write frontmatter.";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * One entry in an atomic multi-key write (commitMany).
 * Maps a frontmatter key to its new value and field descriptor.
 */
export interface CommitEntry {
	readonly key: string;
	readonly value: unknown;
	readonly field: FieldSpec;
}

/**
 * Atomically write multiple frontmatter keys on `file` in a single
 * processFrontMatter call.
 *
 * Contract (ADR-14):
 *  - Validates every entry in memory FIRST. If any entry is a type error,
 *    returns {ok:false, reason:"validation"} and calls processFrontMatter
 *    ZERO times — nothing is written to the vault.
 *  - All entries valid → a single processFrontMatter sets all keys atomically.
 *  - Sibling keys not present in `entries` are untouched.
 *  - Out-of-vocab select values are advisory (console.warn), never block.
 *  - If processFrontMatter rejects → {ok:false, reason:"write", keepDirty:true}.
 *  - Empty entries array → short-circuit {ok:true} (nothing to validate or write).
 *
 * @param app     - Obsidian App (for fileManager access)
 * @param file    - the target TFile
 * @param entries - key/value/field triples to write atomically
 */
export async function commitMany(
	app: App,
	file: TFile,
	entries: CommitEntry[],
	options?: CommitOptions,
): Promise<CommitResult> {
	// Short-circuit: nothing to validate or write.
	if (entries.length === 0) {
		return { ok: true };
	}

	// 1. Validate ALL entries in memory — nothing touches the vault yet.
	for (const entry of entries) {
		const validation = validateField(entry.field, entry.value);
		if (validation.kind === "type-error") {
			return {
				ok: false,
				reason: "validation",
				message: validation.message,
				keepDirty: true,
			};
		}
	}

	// 2. Advisory warn for out-of-vocab selects (ADR-7 — not a block).
	for (const entry of entries) {
		if (isOutOfVocab(entry.field, entry.value)) {
			console.warn(outOfVocabWarning(entry.value, entry.key));
		}
	}

	// 3. Single processFrontMatter — sets all keys atomically (CON-2, ADR-14).
	const captured: FieldChange[] = [];
	try {
		await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			captured.length = 0; // a repeated callback must not duplicate changes
			captureInto(captured, fm, entries);
		});
	} catch {
		return {
			ok: false,
			reason: "write",
			message: WRITE_ERROR_MESSAGE,
			keepDirty: true,
		};
	}
	// Reached only when processFrontMatter resolved: a failed write records nothing.
	report(file.path, captured, options?.group);
	return { ok: true };
}

/**
 * Commit `value` for `key` on `file` via processFrontMatter.
 *
 * Validation runs in memory first. On type error, returns an error result
 * without calling processFrontMatter — the vault is untouched.
 * Out-of-vocab select values log an advisory warning but proceed.
 *
 * @param app   - Obsidian App (for fileManager access)
 * @param file  - the target TFile
 * @param key   - frontmatter key to write
 * @param value - new value (any JSON-serialisable type)
 * @param field - field descriptor (type + optional select vocab)
 */
export function commit(
	app: App,
	file: TFile,
	key: string,
	value: unknown,
	field: FieldSpec,
	options?: CommitOptions,
): Promise<CommitResult> {
	// Not `async`: returning commitMany's promise adds no microtask hop, which
	// callers that await only a couple of ticks (write-back-fan-out) rely on.
	return commitMany(app, file, [{ key, value, field }], options);
}

// ---------------------------------------------------------------------------
// Journal hook (spec 009, ADR-44 / ADR-45)
// ---------------------------------------------------------------------------

/** Options shared by commit and commitMany. */
export interface CommitOptions {
	/** Join this gesture's step instead of recording one step for this call (ADR-38). */
	readonly group?: JournalGroup;
}

/** Receives one report per successful write that changed at least one value. */
export interface WriteRecorder {
	record(path: string, changes: readonly FieldChange[], group: JournalGroup | undefined): void;
}

/** A target for one key: write this slot (absent = delete the key). */
export interface RestoreOp {
	readonly key: string;
	readonly target: Slot;
}

/** One processFrontMatter: per op, read what is there, then write the target. Not recorded. */
export type RestoreFn = (file: TFile, ops: readonly RestoreOp[]) => Promise<readonly Slot[]>;

/** The one active recorder; module state, so tests must uninstall. */
let recorder: WriteRecorder | null = null;

/** Assign every entry and push the changes whose stored form differs (ADR-45). */
function captureInto(captured: FieldChange[], fm: Record<string, unknown>, entries: readonly CommitEntry[]): void {
	for (const entry of entries) {
		const before = slotOf(fm, entry.key);
		fm[entry.key] = entry.value;
		const after = slotOf(fm, entry.key);
		if (!slotsEqual(before, after)) captured.push({ key: entry.key, before, after });
	}
}

/** Hand the changes to the recorder; a recorder failure never reaches the caller. */
function report(path: string, changes: readonly FieldChange[], group: JournalGroup | undefined): void {
	if (changes.length === 0 || recorder === null) return;
	try {
		recorder.record(path, changes, group);
	} catch (err) {
		console.warn("[StoryForge] Undo journal: recorder failed; the write itself succeeded.", err);
	}
}

function makeRestore(app: App): RestoreFn {
	return async (file, ops) => {
		const found: Slot[] = [];
		await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			for (const op of ops) {
				found.push(slotOf(fm, op.key));
				if (op.target.present) fm[op.key] = op.target.value;
				else delete fm[op.key];
			}
		});
		return found;
	};
}

/**
 * Install the plugin's recorder. Returns the ONLY handle to the unrecorded write path.
 * A second install while one is active throws (one plugin, one journal).
 */
export function installWriteRecorder(
	app: App,
	next: WriteRecorder,
): { readonly restore: RestoreFn; uninstall(): void } {
	if (recorder !== null) throw new Error("[StoryForge] A write recorder is already installed.");
	recorder = next;
	return {
		restore: makeRestore(app),
		uninstall(): void {
			if (recorder === next) recorder = null;
		},
	};
}
