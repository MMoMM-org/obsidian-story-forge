/**
 * artifactTypes.ts — types and the closed placeholder list for shipped vault
 * artifacts (FileClasses, Templates, Schema reference).
 *
 * Imports nothing at runtime: Node scripts load this file through jiti, where
 * the tsconfig `baseUrl` imports (e.g. "types") do not resolve.
 *
 * @ref SDD/Data model — ArtifactIndex
 * @ref SDD/ADR-38 (closed placeholder list)
 */

/** The closed list of placeholder names usable as `{{sf:<name>}}`. */
export const ARTIFACT_PLACEHOLDERS = [
	"fileClassesFolder",
	"templatesFolder",
	"schemaFolder",
] as const;

export type ArtifactPlaceholder = (typeof ARTIFACT_PLACEHOLDERS)[number];

/** Folder value for each placeholder. */
export type ArtifactFolders = Record<ArtifactPlaceholder, string>;

/**
 * Dev-vault defaults. `fileClassesFolder` equals DEFAULT_FILE_CLASSES_FOLDER in
 * src/types/index.ts (duplicated here to stay import-free; a test pins them).
 */
export const DEFAULT_ARTIFACT_FOLDERS: ArtifactFolders = {
	fileClassesFolder: "00 Meta/FileClasses",
	templatesFolder: "00 Meta/Templates",
	schemaFolder: "00 Meta/Schema",
};

export type ArtifactSet = "fileclasses" | "templates" | "schema";

export interface ArtifactEntry {
	id: string;
	set: ArtifactSet;
	relPath: string;
	source: string;
	checksum: string;
	placeholders: ArtifactPlaceholder[];
}

export interface ArtifactIndex {
	version: "1";
	entries: ArtifactEntry[];
}

/**
 * What Story Forge wrote for one artifact id, kept in data.json "artifacts".
 * Operational state, not story data.
 *
 * @ref SDD/Data storage — artifact record
 */
export interface ArtifactRecord {
	/** Vault path written (normalised). */
	path: string;
	/** "sha256:…" of the unresolved source that was installed. */
	sourceChecksum: string;
	/** "sha256:…" of the resolved bytes actually written. */
	instanceChecksum: string;
	/** Folder values the placeholders were resolved with. */
	params: ArtifactFolders;
	/** Manifest version at write time (diagnostics only). */
	pluginVersion: string;
}

/** Records keyed by artifact id. */
export type ArtifactRecords = Record<string, ArtifactRecord>;

/**
 * Planned action for one artifact. "refused" is an addition to the SDD union:
 * an index entry whose checksum does not match its source (fail closed).
 */
export type PlanAction =
	| "create"
	| "up-to-date"
	| "update"
	| "skip-exists"
	| "skip-edited"
	| "missing"
	| "unreadable"
	| "refused";

/** @ref SDD/Application Data Models — PlanItem */
export interface PlanItem {
	entry: ArtifactEntry;
	/** Target vault path (the record's path when a record exists). */
	path: string;
	action: PlanAction;
	/** e.g. "setting now points to <folder>", a read failure, "checksum mismatch". */
	note?: string;
	/**
	 * skip-exists only: the file's bytes equal the shipped copy resolved with the current folders.
	 * Shown in the dialog's reason line; it never makes Story Forge claim the file (ADR-41).
	 */
	sameContent?: boolean;
}

/** Result of reading one vault path for planning. */
export type ArtifactFileRead =
	| { kind: "content"; text: string }
	| { kind: "absent" }
	| { kind: "unreadable"; reason: string };
