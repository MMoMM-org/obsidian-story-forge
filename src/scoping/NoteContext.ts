/**
 * Engine-free data models for the scoping layer (M1/M2 contract).
 *
 * NoteContext is a plain-data snapshot — no Obsidian classes, no framework
 * coupling — so it can be constructed and asserted in unit tests without a
 * live vault (ADR-3).
 */

import type { TFile } from "obsidian";

// ---------------------------------------------------------------------------
// EntityKind
// ---------------------------------------------------------------------------

/** The semantic kind of a story entity or note. */
export type EntityKind =
	| "character"
	| "location"
	| "object"
	| "lore"
	| "scene"
	| "plotline"
	| "unknown";

/** All valid EntityKind values, used for runtime validation. */
const ENTITY_KINDS: ReadonlySet<string> = new Set<EntityKind>([
	"character",
	"location",
	"object",
	"lore",
	"scene",
	"plotline",
	"unknown",
]);

/** Type guard: returns true if `value` is a valid EntityKind. */
export function isEntityKind(value: unknown): value is EntityKind {
	return typeof value === "string" && ENTITY_KINDS.has(value);
}

// ---------------------------------------------------------------------------
// ResolvedEntity
// ---------------------------------------------------------------------------

/**
 * A single entity resolved from an outgoing or backlink relation.
 *
 * - `file` — the resolved TFile (only set when `unresolved` is not true)
 * - `kind` — classified kind of the target file
 * - `relation` — "outgoing" | "backlink" | "self"
 * - `field` — source frontmatter key (e.g. "pov", "characters", "location")
 * - `unresolved` — true when the link text resolves to no file in the vault
 */
export interface ResolvedEntity {
	file: TFile;
	kind: EntityKind;
	relation: "outgoing" | "backlink" | "self";
	field?: string;
	unresolved?: boolean;
}

// ---------------------------------------------------------------------------
// NoteContext
// ---------------------------------------------------------------------------

/**
 * Engine-free snapshot of the active note's story context.
 *
 * Built by ScopingService.resolve() from metadataCache only; no Dataview /
 * Bases / prose link scanning involved (ADR-3).
 *
 * M1: `backlinks` is always [] — seam reserved for M3.
 */
export interface NoteContext {
	/** The note whose context was resolved. */
	activeFile: TFile;
	/** Classified kind of the active note itself. */
	activeKind: EntityKind;
	/** Outgoing relations resolved from frontmatterLinks. */
	entities: ResolvedEntity[];
	/** Backlink seam — EMPTY in M1, filled in M3. */
	backlinks: ResolvedEntity[];
	/** Unix millis timestamp of when this context was resolved. */
	resolvedAt: number;
}

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

/** Type guard: checks that a value has the NoteContext shape. */
export function isNoteContext(value: unknown): value is NoteContext {
	if (typeof value !== "object" || value === null) return false;
	const v = value as Record<string, unknown>;
	return (
		v["activeFile"] != null &&
		isEntityKind(v["activeKind"]) &&
		Array.isArray(v["entities"]) &&
		Array.isArray(v["backlinks"]) &&
		typeof v["resolvedAt"] === "number"
	);
}
