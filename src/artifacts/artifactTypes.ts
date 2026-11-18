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
