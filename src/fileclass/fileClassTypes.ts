/**
 * fileClassTypes — the narrow shape `fileClassReader` depends on.
 *
 * ADR-31 firewall: this module (together with `fileClassReader.ts`) is the
 * sanctioned home for metadata-menu FileClass typings. Nothing outside
 * `src/fileclass/` may assume anything about the raw FileClass frontmatter
 * shape — callers get only `ParsedFileClass`/`FileClassField` below, which
 * are ours, not metadata-menu's. This contains the "accepted risk: coupling
 * to metadata-menu's file format" (ADR-0002) to one module.
 *
 * @ref SDD/ADR-31 — a pure FieldModel sits between the reader and the editor
 * @ref ADR-0002   — FileClass-driven editor; the 13 flat field types in scope
 */

/**
 * The 13 flat metadata-menu field types this plugin renders a control for,
 * plus "Unknown" for anything else (unrecognised, or one of the excluded
 * computed/nested types — Lookup, Formula, Canvas*, JSON, YAML, Object*).
 */
export type FieldType =
	| "Input"
	| "Boolean"
	| "Number"
	| "Select"
	| "Cycle"
	| "Multi"
	| "Date"
	| "Datetime"
	| "Time"
	| "File"
	| "MultiFile"
	| "Media"
	| "MultiMedia"
	| "Unknown";

/** A single field declaration, resolved and typed. */
export interface FileClassField {
	/** The FileClass-scoped id (e.g. "f-name", "g-species") — `fieldsOrder` refers to this, not `name`. */
	id: string;
	/** The frontmatter key this field reads/writes (e.g. "name", "species"). */
	name: string;
	type: FieldType;
	/** Selectable values (from `options.valuesList`), present only when declared and non-empty. */
	values?: string[];
}

/** One FileClass in a chain, with its fields already ordered per `fieldsOrder`. */
export interface ParsedFileClass {
	/** The FileClass's own name (its file basename, e.g. "fc-character-fantasy"). */
	name: string;
	/**
	 * The FileClass's own display title, when it declares one (OQ-1, resolved
	 * 2026-08-05). Optional by decision, not by accident: metadata-menu writes
	 * these files through its own UI and may drop a key it does not recognise,
	 * and every FileClass this plugin generates today carries none — so the
	 * label falls back to the file name and never vanishes.
	 */
	title?: string;
	/** The FileClass this one extends, if any — read for chain traversal, not exposed further. */
	extends?: string;
	/** Fields in render order: `fieldsOrder` first, then any declared field `fieldsOrder` omitted. */
	fields: FileClassField[];
}

/**
 * Injected lookup — resolves a FileClass name to its raw frontmatter.
 *
 * Kept as a plain-data port (no Obsidian types) so `fileClassReader` stays
 * unit-testable without a vault; in production this wraps
 * `app.metadataCache.getFileCache(file)?.frontmatter` for the FileClasses
 * folder. Returns `undefined` when the name has no corresponding file.
 */
export interface FileClassLookup {
	getFileClassFrontmatter(name: string): unknown;
}
