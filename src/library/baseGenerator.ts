/**
 * baseGenerator — classify() for generated `.base` collections installed before T7.3.
 *
 * ADR-0003 (`docs/XDD/adr/0003-generated-bases-two-checksums.md`): our own
 * generated defaults are NOT consented imports. A generated artifact is
 * produced deterministically from the user's own settings (tag, excluded
 * folders) — checksumming it against a single "did the user edit it" gate
 * asks the user to re-consent to their own input on every settings change.
 *
 * `classify` — the three-way comparison (source checksum / params / instance
 * checksum) that tells the caller whether a stored `GeneratedArtifact` is clean,
 * needs silent regeneration, needs to ask the user, or needs re-consent.
 *
 * T7.3 (reduced, 2026-11-13): settings-driven regeneration is deferred, so the
 * template renderer (`renderBase`) was removed — nothing called it. Curated `.base`
 * files install verbatim with no `generated` block; `classify` stays only because
 * records installed before T7.3 still carry one and ConsentGate evaluates them.
 *
 * @ref SDD/Implementation Examples — "classifying a generated artifact"
 * @ref SDD/Application Data Models — GeneratedArtifact
 * @ref ADR-0003 §Decision — the two-checksum classification table
 */

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
