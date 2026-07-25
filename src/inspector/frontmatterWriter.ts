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
 *
 * @ref SDD/ADR-7 — block type errors, warn vocab
 * @ref PRD/AC-F6.3, AC-F6.5, AC-F6.6, AC-F6.7
 * @ref obsidian.d.ts:2954 — processFrontMatter(file, fn, options?)
 */

import type { App, TFile } from "obsidian";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Field type discriminant. Mirrors schema/*.json field.type values. */
export type FieldType = "text" | "number" | "select" | "list" | "tags" | "relation" | "fixed";

/**
 * Minimal field descriptor consumed by the writer.
 * Select fields carry an optional `values` array (from schema/*.json).
 * This mirrors the schema field shape without duplicating the full JSON structure.
 */
export type FieldSpec =
	| { name: string; type: Extract<FieldType, "text" | "list" | "tags" | "relation" | "fixed"> }
	| { name: string; type: Extract<FieldType, "number"> }
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

/** User-facing message when processFrontMatter rejects. */
const WRITE_ERROR_MESSAGE = "Couldn't write frontmatter. Your edits are kept.";

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
	try {
		await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			for (const entry of entries) {
				fm[entry.key] = entry.value;
			}
		});
		return { ok: true };
	} catch {
		return {
			ok: false,
			reason: "write",
			message: WRITE_ERROR_MESSAGE,
			keepDirty: true,
		};
	}
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
export async function commit(
	app: App,
	file: TFile,
	key: string,
	value: unknown,
	field: FieldSpec,
): Promise<CommitResult> {
	// 1. Validate in memory — nothing touches the vault yet.
	const validation = validateField(field, value);
	if (validation.kind === "type-error") {
		return {
			ok: false,
			reason: "validation",
			message: validation.message,
			keepDirty: true,
		};
	}

	// 2. Advisory warn for out-of-vocab select (ADR-7, not a block).
	if (isOutOfVocab(field, value)) {
		console.warn(outOfVocabWarning(value, key));
	}

	// 3. Write via processFrontMatter — the ONLY vault write path (CON-1, CON-7).
	try {
		await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			fm[key] = value;
		});
		return { ok: true };
	} catch {
		return {
			ok: false,
			reason: "write",
			message: WRITE_ERROR_MESSAGE,
			keepDirty: true,
		};
	}
}
