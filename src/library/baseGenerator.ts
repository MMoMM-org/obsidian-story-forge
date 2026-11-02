/**
 * baseGenerator — template render + classify() for generated `.base` collections.
 *
 * ADR-0003 (`docs/XDD/adr/0003-generated-bases-two-checksums.md`): our own
 * generated defaults are NOT consented imports. A generated artifact is
 * produced deterministically from the user's own settings (tag, excluded
 * folders) — checksumming it against a single "did the user edit it" gate
 * asks the user to re-consent to their own input on every settings change.
 *
 * Two responsibilities live here:
 *  - `renderBase` — whole-file template render (ADR-34: never regex-patch a
 *    resolved `.base`; always re-render from the template so the result is
 *    deterministic and diffable).
 *  - `classify` — the three-way comparison (source checksum / params /
 *    instance checksum) that tells the caller whether a stored
 *    `GeneratedArtifact` is clean, needs silent regeneration, needs to ask
 *    the user, or needs re-consent.
 *
 * CON-6 firewall: `BasesConfigFile` typings are sanctioned only in
 * `src/bases/basesConfig.ts`. This module builds a plain, untyped YAML
 * document that is *structurally* a valid BasesConfigFile (verified by
 * round-tripping through `validateBasesConfig` in tests) without importing
 * the type itself.
 *
 * @ref SDD/Implementation Examples — "classifying a generated artifact"
 * @ref SDD/Application Data Models — GeneratedArtifact
 * @ref ADR-0003 §Decision — the two-checksum classification table
 * @ref ADR-34 — templates rendered whole, never patched
 */

import { stringify as stringifyYaml } from "yaml";
import { CODEX_VIEW_ID } from "pluginConstants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The settings that produce a generated `.base` artifact.
 *
 * @ref SDD/Data Storage Changes — `generated.params: { tag, excludedFolders }`
 */
export interface CollectionParams {
	readonly tag: string;
	readonly excludedFolders: readonly string[];
}

/**
 * Stored record of a generated artifact (SDD `GeneratedArtifact`).
 *
 * `verify: false` means "this file is yours now" — the plugin stops
 * verifying and stops regenerating it (ADR-0003 §Decision point 7).
 */
export interface GeneratedArtifact {
	/** Checksum of the template that produced this artifact — "did upstream change". */
	readonly sourceChecksum: string;
	/** The params the artifact was last rendered with. */
	readonly params: CollectionParams;
	/** Checksum of the written file at render time — "was it edited since". */
	readonly instanceChecksum: string;
	/** The artifact's path in the vault. */
	readonly filePath: string;
	/** false = the file is user-owned; never verified or regenerated again. */
	readonly verify: boolean;
}

/**
 * The outcome of comparing a `GeneratedArtifact` against current state.
 *
 * - `clean` — nothing to do.
 * - `regenerate` — the plugin's own settings changed; re-render silently.
 * - `ask` — a foreign hand edited the file; offer regenerate/keep.
 * - `reconsent` — the upstream template changed; route through the existing
 *   consent flow.
 */
export type ArtifactState = "clean" | "regenerate" | "ask" | "reconsent";

// ---------------------------------------------------------------------------
// classify — ADR-0003 §Decision point 5
// ---------------------------------------------------------------------------

/**
 * Classify a stored `GeneratedArtifact` against current source/params and the
 * checksum of the file actually on disk.
 *
 * Traced walkthrough (ADR-0003 / SDD Implementation Examples):
 *
 * | Scenario                          | source | params    | file      | → |
 * |------------------------------------|--------|-----------|-----------|---|
 * | Nothing happened                   | same   | same      | same      | clean |
 * | User changes tag/folders in settings | same | **changed** | same | regenerate (silent) |
 * | User hand-edits the file           | same   | same      | **differs** | ask |
 * | Catalog update ships a new template | **differs** | —   | —         | reconsent |
 * | Verification switched off          | —      | —         | —         | clean |
 *
 * A settings change does not touch the file, so the file still matches the
 * stored instance checksum. Any mismatch is therefore a foreign edit, and it
 * outranks a params change: a hand edit is never overwritten silently.
 *
 * `fileChecksum: null` means the file is missing — treated the same as a
 * change WE caused (regenerate), never as a foreign edit.
 */
export function classify(
	rec: GeneratedArtifact,
	currentSourceChecksum: string,
	currentParams: CollectionParams,
	fileChecksum: string | null,
): ArtifactState {
	if (rec.verify === false) return "clean"; // "this file is yours now"
	if (currentSourceChecksum !== rec.sourceChecksum) return "reconsent"; // upstream changed
	if (fileChecksum === null) return "regenerate"; // missing → just rewrite
	if (fileChecksum !== rec.instanceChecksum) return "ask"; // a foreign hand edited the file
	if (!sameParams(currentParams, rec.params)) return "regenerate"; // WE caused it — silent
	return "clean";
}

/**
 * Order-independent equality over CollectionParams. Reordering the excluded
 * folders in settings is not a semantic change and must not be classified
 * as one.
 */
function sameParams(a: CollectionParams, b: CollectionParams): boolean {
	if (a.tag !== b.tag) return false;
	if (a.excludedFolders.length !== b.excludedFolders.length) return false;
	const sortedA = [...a.excludedFolders].sort();
	const sortedB = [...b.excludedFolders].sort();
	return sortedA.every((folder, i) => folder === sortedB[i]);
}

// ---------------------------------------------------------------------------
// renderBase — whole-file template render (ADR-34)
// ---------------------------------------------------------------------------

/**
 * Render a complete `.base` YAML document from `CollectionParams`.
 *
 * Never a patch (ADR-34): this always produces the whole file from scratch —
 * there is no code path here that edits an existing `.base` in place.
 *
 * - Selection is by tag (CON-7); folders may only exclude.
 * - An empty `excludedFolders` list produces a bare tag filter with no
 *   `not:` block, rather than an empty one.
 * - Folder names are substituted as plain values into the object graph, so
 *   the YAML serializer (not string concatenation) is responsible for
 *   correct quoting/escaping — including names containing spaces.
 */
export function renderBase(params: CollectionParams): string {
	const config = {
		filters: buildFilters(params),
		views: [
			{
				type: CODEX_VIEW_ID,
				name: "Codex",
			},
		],
	};

	return stringifyYaml(config);
}

/**
 * The two shapes `buildFilters` can produce: a bare tag expression, or that
 * expression `and`-ed with a `not:` block over the folder exclusions.
 */
type FilterExpr = string | { and: [string, { not: string[] }] };

/**
 * Build the `filters` member: a bare tag expression, or — when there are
 * folders to exclude — that expression `and`-ed with a `not:` block over the
 * per-folder exclusions.
 *
 * @ref ADR-0003 Consequences — "replaced by tag selection plus generated
 *   `not: [file.inFolder(…)]` exclusions"
 */
function buildFilters(params: CollectionParams): FilterExpr {
	const tagExpr = hasTagExpr(params.tag);

	if (params.excludedFolders.length === 0) {
		return tagExpr;
	}

	return {
		and: [tagExpr, { not: params.excludedFolders.map(inFolderExpr) }],
	};
}

function hasTagExpr(tag: string): string {
	return `file.hasTag("${tag}")`;
}

function inFolderExpr(folder: string): string {
	return `file.inFolder("${folder}")`;
}
