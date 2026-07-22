/**
 * catalogTypes.ts — T4.4 CatalogEntry + CatalogIndex types.
 *
 * Shape MUST match the JSON emitted by scripts/build-catalog.mjs exactly.
 * The build script emits:
 *   { version: "1", generated: <ISO>, entries: [{ id, name, engine:"bases", source, checksum, description? }] }
 *
 * @ref SDD/ADR-9 (index schema version = "1")
 * @ref SDD/Building Block View — catalog/catalogTypes.ts
 * @ref scripts/build-catalog.mjs (source of truth for the emitted shape)
 */

/**
 * A single curated-view entry as emitted by build-catalog.mjs.
 *
 * - id:          slug derived from the filename (e.g. "overview-characters")
 * - name:        first view's `name` field from the parsed YAML, or id fallback
 * - engine:      always "bases" — all current catalog entries are Bases .base files
 * - source:      raw .base YAML string (byte-exact; checksum is over this)
 * - checksum:    "sha256:<hex>" via computeChecksum(source)
 * - description: optional blurb (not present in the five overview .base files)
 */
export interface CatalogEntry {
	id: string;
	name: string;
	engine: "bases";
	source: string;
	checksum: string;
	description?: string;
}

/**
 * The bundled catalog index as written by build-catalog.mjs to
 * dist/catalog-index.json.
 *
 * - version:   index schema version string ("1" for the initial schema)
 * - generated: ISO timestamp of the build run
 * - entries:   the ordered list of curated catalog entries
 */
export interface CatalogIndex {
	version: string;
	generated: string;
	entries: CatalogEntry[];
}
