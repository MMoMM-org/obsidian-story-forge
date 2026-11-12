/**
 * catalogTypes.ts — T4.4 CatalogEntry + CatalogIndex types; T7.2 adds Dataview entries.
 *
 * Shape MUST match the JSON emitted by scripts/build-catalog.mjs exactly.
 * The build script emits:
 *   { version: "1", generated: <ISO>, entries: [BasesCatalogEntry | DataviewCatalogEntry] }
 *
 * @ref SDD/ADR-9 (index schema version = "1")
 * @ref SDD/Building Block View — catalog/catalogTypes.ts
 * @ref scripts/build-catalog.mjs (source of truth for the emitted shape)
 */

/**
 * A curated `.base` file.
 *
 * - id:          slug derived from the filename (e.g. "overview-characters")
 * - name:        first view's `name` field from the parsed YAML, or id fallback
 * - source:      raw .base YAML string (byte-exact; checksum is over this)
 * - checksum:    "sha256:<hex>" via computeChecksum(source)
 * - description: optional blurb
 */
export interface BasesCatalogEntry {
	id: string;
	name: string;
	engine: "bases";
	source: string;
	checksum: string;
	description?: string;
}

/**
 * A curated Dataview note (T7.2): a view-definition note in the import's own format
 * (`sf-version`, `sf-name`, `sf-description`, exactly one `dataview` / `dataviewjs` block).
 *
 * - source:        the whole note, byte-exact; `checksum` is over it (VERIFY)
 * - version:       its `sf-version`
 * - queryChecksum: checksum of the query block's body — what `ConsentGate` checks the
 *                  installed note against, so it is what the installed record's `okayed` holds
 */
export interface DataviewCatalogEntry {
	id: string;
	name: string;
	engine: "dataview-dql" | "dataviewjs";
	source: string;
	checksum: string;
	description?: string;
	version: number;
	queryChecksum: string;
}

export type CatalogEntry = BasesCatalogEntry | DataviewCatalogEntry;

/**
 * The checksum an installed record of `entry` carries in `okayed` when it is current: the file's
 * for a `.base`, the query block's for a Dataview note. "Up to date" and "update available"
 * compare against this.
 */
export function installedChecksum(entry: CatalogEntry): string {
	return entry.engine === "bases" ? entry.checksum : entry.queryChecksum;
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
