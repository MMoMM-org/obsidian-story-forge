/**
 * collectionResolver — pure: (collection id, record config, settings, note index) → notes.
 *
 * Structure-agnostic selection (CON-7): notes are INCLUDED by tag; folders may only
 * EXCLUDE. This mirrors the tag-inclusion / folder-exclusion rule already used by
 * `src/scoping/workspaceScope.ts` (DEFAULT_EXCLUDED_FOLDERS, `isExcluded`) — same
 * prefix-on-path-segment semantics, re-derived here (not imported) because that module
 * pulls in `ScopingService`/`App` and this one must stay a pure function over an
 * injected note index, with zero Obsidian runtime dependency, so it is testable
 * without a vault.
 *
 * An empty (or whitespace-only) tag is never treated as "no filter" — it is reported
 * as a misconfigured collection. Falling through to "list the whole vault" is the one
 * failure mode this module exists to prevent (PRD/F3, SDD Error Handling table).
 *
 * @ref SDD/CON-7   — structure-agnostic selection
 * @ref SDD/CON-8   — no `any`; unknown external shapes narrowed
 * @ref PRD/F3      — Codex collections, incl. "empty tag → misconfigured" AC
 * @ref docs/XDD/specs/008-codex-surface/solution.md:648-662 — Error Handling
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** The per-collection config a CollectionRecord contributes to resolution. */
export interface CollectionRecordConfig {
	/** The tag notes must carry to belong to this collection (no leading '#'). */
	tag: string;
}

/** The global settings slice this resolver reads (PluginSettings.excludedFolders). */
export interface CollectionResolverSettings {
	/** Folders whose notes are excluded from every collection. Exclusion only (CON-7). */
	excludedFolders: readonly string[];
}

/** A plain, pre-indexed note — the injection seam that keeps this module vault-free. */
export interface IndexedNote {
	/** Vault-relative path. */
	path: string;
	/** Normalized tags carried by the note (no leading '#'). */
	tags: readonly string[];
}

export type CollectionResolution =
	| { status: "resolved"; notes: IndexedNote[] }
	| { status: "misconfigured"; reason: string };

// ---------------------------------------------------------------------------
// Folder exclusion (mirrors workspaceScope.ts's isExcluded — see module doc)
// ---------------------------------------------------------------------------

/**
 * Prefix-on-path-segment match: a note is excluded when its path equals an
 * excluded folder or starts with `${folder}/`. A plain string-prefix check
 * would wrongly exclude "00 Metadata" for an excluded "00 Meta" — the `/`
 * boundary is what CON-7 requires.
 */
function isUnderExcludedFolder(path: string, excludedFolders: readonly string[]): boolean {
	return excludedFolders.some((folder) => path === folder || path.startsWith(`${folder}/`));
}

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

/**
 * Resolve a collection to its member notes.
 *
 * - Unknown `collectionId` (absent from `collections`): resolves to an empty note
 *   list — not an error, not a misconfiguration. There is simply nothing to show.
 * - Empty or whitespace-only tag: `"misconfigured"` — never falls through to
 *   listing every note.
 * - Otherwise: notes carrying the tag, minus any under an excluded folder.
 */
export function resolveCollection(
	collectionId: string,
	collections: Readonly<Record<string, CollectionRecordConfig>>,
	settings: CollectionResolverSettings,
	index: readonly IndexedNote[],
): CollectionResolution {
	// Plain `collections[collectionId]` bracket access with an unvalidated key
	// inherits Object.prototype members ("constructor", "toString", ...): for
	// those keys the lookup is truthy even though nothing was ever stored, so
	// the own-property check below is required, not just a null guard.
	if (!Object.prototype.hasOwnProperty.call(collections, collectionId)) {
		return { status: "resolved", notes: [] };
	}
	const record = collections[collectionId];
	if (!record) {
		return { status: "resolved", notes: [] };
	}

	const tag = record.tag.trim();
	if (tag === "") {
		// User-facing copy, not developer-voiced: no internal collection id here
		// (codexTab.ts renders this string verbatim into the Codex grid) — the
		// selected pill above it already identifies which collection this is.
		return {
			status: "misconfigured",
			reason: "This collection has no tag configured, so nothing can be shown — refusing to fall back to listing the whole vault.",
		};
	}

	const notes = index.filter(
		(note) => note.tags.includes(tag) && !isUnderExcludedFolder(note.path, settings.excludedFolders),
	);

	return { status: "resolved", notes };
}
