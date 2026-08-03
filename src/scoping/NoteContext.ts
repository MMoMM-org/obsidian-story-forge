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
	| "book"
	| "unknown";

/** All valid EntityKind values, used for runtime validation. */
const ENTITY_KINDS: ReadonlySet<string> = new Set<EntityKind>([
	"character",
	"location",
	"object",
	"lore",
	"scene",
	"plotline",
	"book",
	"unknown",
]);

/** Type guard: returns true if `value` is a valid EntityKind. */
export function isEntityKind(value: unknown): value is EntityKind {
	return typeof value === "string" && ENTITY_KINDS.has(value);
}

// ---------------------------------------------------------------------------
// classifyEntityKind — the ONE tag→kind mapping (ADR-4)
// ---------------------------------------------------------------------------

/**
 * Tag → EntityKind. Order matters: first match wins. Unprefixed — the
 * vocabulary `noteIndex.ts`/`collectionResolver.ts`/`CardEntry.field("tags")`
 * already index and compare against (no leading `#`). `ScopingService`, whose
 * raw `metadataCache` tags carry the `#`, strips it before calling
 * `classifyEntityKind` rather than this map growing a second, prefixed copy.
 *
 * This is the single source of truth for the mapping (previously duplicated
 * in `ScopingService.ts` and, independently and incompletely, in
 * `codex/cards/shared.ts` — the two had already drifted: the Card copy had no
 * `type`-fallback, so a note classifiable only via frontmatter `type` got
 * "unknown" from one and its real kind from the other).
 */
const TAG_KIND_MAP: ReadonlyArray<readonly [string, EntityKind]> = [
	["canon/character", "character"],
	["canon/location", "location"],
	["canon/object", "object"],
	["canon/lore", "lore"],
	["manuscript/scene", "scene"],
	["planning/plotline", "plotline"],
	["planning/book", "book"],
];

/**
 * Classify an `EntityKind` from a note's own (unprefixed) tags, falling back
 * to a frontmatter `type` field when no tag matches (ADR-4). Pure — no `App`,
 * no Obsidian classes — so both `ScopingService.classify` (tags from
 * `metadataCache`, `#`-stripped) and a Card's own classification
 * (`codex/cards/shared.ts`, tags already unprefixed via `CardEntry`) key off
 * this one function rather than restating the mapping.
 *
 * Never throws; returns `"unknown"` when neither tags nor `type` resolve.
 */
export function classifyEntityKind(tags: readonly string[], type?: unknown): EntityKind {
	for (const [tag, kind] of TAG_KIND_MAP) {
		if (tags.includes(tag)) return kind;
	}
	if (isEntityKind(type)) return type;
	return "unknown";
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
 * - `fuzzy` — true when the backlink is inferred from a body link only
 *   (resolvedLinks hit with no frontmatterLinks edge); only emitted for
 *   object and lore subjects whose srcKind is "scene" (ADR-8)
 */
export interface ResolvedEntity {
	file: TFile;
	kind: EntityKind;
	relation: "outgoing" | "backlink" | "self";
	field?: string;
	unresolved?: boolean;
	fuzzy?: boolean;
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
	/** Raw frontmatter of the active note. Empty object when cache is null. */
	frontmatter: Record<string, unknown>;
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
		typeof v["frontmatter"] === "object" &&
		v["frontmatter"] !== null &&
		typeof v["resolvedAt"] === "number"
	);
}
