/**
 * resolvePlaceholders.ts — resolve `{{sf:<name>}}` placeholders in artifact
 * source text against the user's configured folders.
 *
 * Only `{{sf:<name>}}` is ours; every other `{{…}}` (notably core Templates'
 * `{{title}}`) passes through untouched. Unknown names throw. No runtime
 * "obsidian" import: Node scripts load this via jiti, so folder normalisation
 * mirrors obsidian's normalizePath instead of calling it.
 *
 * @ref SDD/Implementation Examples — placeholder resolution
 * @ref SDD/Implementation Gotchas — `{{title}}` is not ours
 * @ref SDD/ADR-38
 */

import {
	ARTIFACT_PLACEHOLDERS,
	type ArtifactFolders,
	type ArtifactPlaceholder,
} from "./artifactTypes";

const PLACEHOLDER_RE = /\{\{sf:([^{}]*)\}\}/g;

function isKnown(name: string): name is ArtifactPlaceholder {
	return (ARTIFACT_PLACEHOLDERS as readonly string[]).includes(name);
}

/** Folder normalisation matching obsidian normalizePath, no trailing slash. */
export function normalizeFolder(value: string): string {
	return value
		.replace(/\u00a0/g, " ")
		.trim()
		.replace(/[\\/]+/g, "/")
		.replace(/^\/+|\/+$/g, "");
}

/** Distinct `{{sf:…}}` names used in `text`, in first-use order (unvalidated). */
export function placeholdersIn(text: string): ArtifactPlaceholder[] {
	const seen: string[] = [];
	for (const m of text.matchAll(PLACEHOLDER_RE)) {
		const name = m[1] ?? "";
		if (!seen.includes(name)) seen.push(name);
	}
	return seen as ArtifactPlaceholder[];
}

/** Replace every `{{sf:<name>}}`; throws listing all unknown names. */
export function resolvePlaceholders(text: string, folders: ArtifactFolders): string {
	const unknown = placeholdersIn(text).filter((n) => !isKnown(n));
	if (unknown.length > 0) {
		throw new Error(`Unknown artifact placeholder(s): ${unknown.join(", ")}`);
	}
	return text.replace(PLACEHOLDER_RE, (_m, name: string) =>
		normalizeFolder(folders[name as ArtifactPlaceholder]),
	);
}
