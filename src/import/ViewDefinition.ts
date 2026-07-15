/**
 * ViewDefinition — parsed intermediate form of a vault view-definition note.
 *
 * @ref SDD/Interface Specifications — ViewDefinition + ViewImporter
 * @ref SDD/ADR-6 (view-definition format)
 * @ref SDD/ADR-9 (store-generated id; no UUID written to vault note)
 */

import type { Checksum } from "consent/checksum";

/**
 * Parsed view definition extracted from a vault note.
 * Intermediate form between the raw vault note and a ViewRecord.
 */
export interface ViewDefinition {
	/** Vault-relative path of the source note (becomes ViewRecord.source). */
	sourcePath: string;
	/** Engine inferred from the fenced block language tag. */
	engine: "dataview-dql" | "dataviewjs";
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
 * Error thrown by ViewImporter.parse() on invalid view-definition notes,
 * and by ViewImporter.importToStore() on duplicate source paths.
 *
 * @ref SDD/EARS F3 — "NO_QUERY_BLOCK" / "MULTIPLE_QUERY_BLOCKS"
 */
export class ImportError extends Error {
	constructor(
		public readonly code:
			| "NO_QUERY_BLOCK"
			| "MULTIPLE_QUERY_BLOCKS"
			| "INVALID_FRONTMATTER"
			| "ENGINE_MISMATCH"
			| "DUPLICATE",
		message: string,
	) {
		super(message);
		this.name = "ImportError";
	}
}
