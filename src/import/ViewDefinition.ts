/**
 * ViewDefinition — parsed intermediate form of a vault view-definition note.
 *
 * @ref SDD/Interface Specifications — ViewDefinition + ViewImporter
 * @ref SDD/ADR-6 (view-definition format)
 * @ref SDD/ADR-9 (store-generated id; no UUID written to vault note)
 */

import type { Checksum } from "consent/checksum";

/**
 * Parsed view definition extracted from a vault note or a vault `.base` file.
 * Intermediate form between the raw vault file and a ViewRecord.
 *
 * T7.2: a `.base` imports too (engine "bases"); it has no frontmatter, so `version` is 0, `name`
 * is the file's basename, `command` is false and `querySource` is the whole YAML.
 */
export interface ViewDefinition {
	/** Vault-relative path of the source note (becomes ViewRecord.source). */
	sourcePath: string;
	/** Engine: "bases" for a `.base` file, else inferred from the fenced block language tag. */
	engine: "bases" | "dataview-dql" | "dataviewjs";
	/** sf-version frontmatter field (integer). */
	version: number;
	/** sf-name frontmatter field (becomes ViewRecord.commandName default). */
	name: string;
	/** sf-description frontmatter field (becomes ViewRecord.description). */
	description?: string;
	/** sf-command frontmatter field (becomes ViewRecord.command). */
	command: boolean;
	/**
	 * Raw source string of the fenced query block body, as read at import time.
	 * TRANSIENT — used only to preview the query and derive `checksum` during
	 * import. It is NOT persisted onto the ViewRecord; at render/consent time the
	 * block is re-read fresh from the note at `sourcePath` (ADR-3/ADR-4).
	 */
	querySource: string;
	/**
	 * Checksum over querySource bytes at import time (sha256: prefixed);
	 * shown in the import preview, not persisted until consent.
	 */
	checksum: Checksum;
}

/**
 * Which case of a code a refusal is, where one code covers several (L11f, A3): the import modal
 * picks its fix line by this, never by matching the message text.
 * - INVALID_BASE: `base-not-found`, `base-unreadable` (YAML that does not parse), `base-invalid`
 *   (parses, but is not a Bases file)
 * - INVALID_FRONTMATTER: `sf-version`, `sf-name`
 */
export type ImportErrorDetail = "base-not-found" | "base-unreadable" | "base-invalid" | "sf-version" | "sf-name";

/**
 * Error thrown by ViewImporter.parse() on invalid view-definition notes,
 * and by ViewImporter.importToStore() on duplicate source paths.
 *
 * @ref SDD/EARS F3 — "NO_QUERY_BLOCK" / "MULTIPLE_QUERY_BLOCKS"
 * @ref PRD/F7 AC 7 — "INVALID_BASE": a `.base` whose YAML cannot be read or is not a Bases file
 */
export class ImportError extends Error {
	constructor(
		public readonly code:
			| "NO_QUERY_BLOCK"
			| "MULTIPLE_QUERY_BLOCKS"
			| "INVALID_FRONTMATTER"
			| "ENGINE_MISMATCH"
			| "INVALID_BASE"
			| "DUPLICATE",
		message: string,
		public readonly detail?: ImportErrorDetail,
	) {
		super(message);
		this.name = "ImportError";
	}
}
