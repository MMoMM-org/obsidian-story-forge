export interface PluginSettings {
	/** ADR-5: link-click action; modifier-click inverts. Default: "drill". */
	linkClickAction: "drill" | "open";
	/** A plain click on a Codex Card title opens the note in a new tab; off, it shows it in the editor pane. */
	cardTitleOpensNote: boolean;
	/**
	 * Vault folder where curated .base files are materialised on install.
	 * Default "00 Meta/Bases" (colocates with M3-seeded Canon.base/Manuscript.base).
	 * Falls back to the default when unset or empty.
	 * @ref SDD/ADR-5, SDD/Data Storage Changes — Settings.curatedBasesFolder
	 */
	curatedBasesFolder: string;
	/**
	 * Vault folder containing metadata-menu FileClass definitions (fc-*.md).
	 * Default "00 Meta/FileClasses". Falls back to the default when unset or empty.
	 * @ref SDD/Data Storage Changes — Settings.fileClassesFolder
	 */
	fileClassesFolder: string;
	/**
	 * Folders whose notes are excluded from every collection/scope resolution
	 * (CON-7: exclusion only — this is never an include list). Default ["00 Meta"].
	 * Falls back to the default when the persisted value is not an array of strings;
	 * an explicit empty array is a valid choice ("exclude nothing"), not malformed.
	 * @ref SDD/Data Storage Changes — Settings.excludedFolders
	 * @ref src/scoping/workspaceScope.ts — the consuming seam
	 */
	excludedFolders: string[];
	/**
	 * The editor pane's dock position (PRD/F5, ADR-33). Set manually by the user —
	 * never changed automatically (e.g. on window resize). Default "bottom".
	 * @ref SDD/Data Storage Changes — Settings.editorDock
	 */
	editorDock: "bottom" | "right";
	/**
	 * The Card a collection is rendered with (T4.4), keyed by collection id. Operational
	 * state (CON-2) — which Card draws a collection's entries, never story data, and never
	 * written to a note. Default `{}`: every collection renders the registry default
	 * (Hero) until the user picks one. A collection id absent from this record, or one
	 * whose Card id no longer resolves (a removed Card), degrades to the registry default
	 * rather than throwing (`CardRegistry.resolve`, `cardRegistry.ts`).
	 * @ref SDD/Data Storage Changes — Settings.cardByCollection
	 */
	cardByCollection: Record<string, string>;
	/**
	 * Ids of one-time hints the user has dismissed (T4.6, ADR-36), e.g.
	 * `"bases-disabled"`. Operational state (CON-2) — never story data, never
	 * written to a note. Dismissal is permanent: once an id is present here it
	 * stays hidden across every future render and every reload. Default `[]`:
	 * every eligible hint shows until explicitly dismissed.
	 * @ref SDD/Data Storage Changes — Settings.dismissedHints
	 * @ref SDD/ADR-36 — core may be suggested once; community never
	 */
	dismissedHints: string[];
	/**
	 * Keep the undo history across restarts (spec 009, ADR-48). The history file holds
	 * copies of frontmatter values; turning this off deletes it.
	 */
	keepUndoHistory: boolean;
}

/**
 * Shipped default for `fileClassesFolder`. Exported for tests that build a
 * FileClass cache over the shipped folder; two copies of a path string is
 * exactly how they drift.
 */
export const DEFAULT_FILE_CLASSES_FOLDER = "00 Meta/FileClasses";
const DEFAULT_EDITOR_DOCK: PluginSettings["editorDock"] = "bottom";

/**
 * Shipped default for `excludedFolders` (T3.5) — folders whose notes are kept out of
 * every collection/scope resolution (templates/meta). This file is the source of truth
 * (it defines `PluginSettings`); `src/scoping/workspaceScope.ts` re-exports this same
 * constant for its own callers, so the two stay identical by construction — exactly one
 * literal, imported by the other side.
 */
export const DEFAULT_EXCLUDED_FOLDERS: readonly string[] = ["00 Meta"];

export const DEFAULT_SETTINGS: PluginSettings = {
	linkClickAction: "drill",
	cardTitleOpensNote: true,
	curatedBasesFolder: "00 Meta/Bases",
	fileClassesFolder: DEFAULT_FILE_CLASSES_FOLDER,
	excludedFolders: [...DEFAULT_EXCLUDED_FOLDERS],
	editorDock: DEFAULT_EDITOR_DOCK,
	cardByCollection: {},
	dismissedHints: [],
	keepUndoHistory: true,
};

/** Type guard: returns true if `v` is a valid `linkClickAction` value. */
export function isLinkClickAction(v: unknown): v is PluginSettings["linkClickAction"] {
	return v === "drill" || v === "open";
}

/** Normalizer: returns `v` if it is a valid `linkClickAction`, otherwise `"drill"`. */
export function normalizeLinkClickAction(v: unknown): PluginSettings["linkClickAction"] {
	return isLinkClickAction(v) ? v : "drill";
}

/** Normalizer: only a real boolean is kept; anything else fails closed to the default (`true`). */
export function normalizeCardTitleOpensNote(v: unknown): boolean {
	return typeof v === "boolean" ? v : DEFAULT_SETTINGS.cardTitleOpensNote;
}

/** Type guard: returns true if `v` is a valid `editorDock` value. */
export function isEditorDock(v: unknown): v is PluginSettings["editorDock"] {
	return v === "bottom" || v === "right";
}

/** Normalizer: returns `v` if it is a valid `editorDock`, otherwise `"bottom"`. */
export function normalizeEditorDock(v: unknown): PluginSettings["editorDock"] {
	return isEditorDock(v) ? v : DEFAULT_EDITOR_DOCK;
}

/** Type guard: returns true if `v` is a valid `excludedFolders` value (an array of strings). */
export function isExcludedFolders(v: unknown): v is string[] {
	return Array.isArray(v) && v.every((x) => typeof x === "string");
}

/**
 * Normalizer: returns a copy of `v` if it is a valid excludedFolders array, otherwise a
 * copy of the shipped default. A malformed value (not an array, or an array containing a
 * non-string) falls back; a legitimate empty array ("exclude nothing") is NOT malformed
 * and passes through (copied). Always returns a fresh array — never the same reference as
 * `DEFAULT_SETTINGS.excludedFolders` — so a future in-place mutation (e.g. an "Add folder"
 * button doing `.push()`) cannot corrupt the module-level default singleton.
 */
export function normalizeExcludedFolders(v: unknown): string[] {
	return isExcludedFolders(v) ? [...v] : [...DEFAULT_EXCLUDED_FOLDERS];
}

/** Type guard: returns true if `v` is a valid `fileClassesFolder` value (a non-empty string). */
export function isFileClassesFolder(v: unknown): v is string {
	return typeof v === "string" && v.length > 0;
}

/**
 * Normalizer: returns `v` without trailing slashes if it is a non-empty string,
 * otherwise the shipped default. A setting of only slashes names no folder, so
 * it fails closed to the default as an empty one does.
 */
export function normalizeFileClassesFolder(v: unknown): string {
	if (!isFileClassesFolder(v)) return DEFAULT_FILE_CLASSES_FOLDER;
	const trimmed = v.replace(/\/+$/, "");
	return trimmed === "" ? DEFAULT_FILE_CLASSES_FOLDER : trimmed;
}

/** Type guard: returns true if `v` is a valid `curatedBasesFolder` value (a non-empty string). */
export function isCuratedBasesFolder(v: unknown): v is string {
	return typeof v === "string" && v.length > 0;
}

/**
 * Normalizer: returns `v` if it is a non-empty string, otherwise the shipped default.
 * Mirrors the fallback `StoryForgePlugin._getCuratedBasesFolder()` already applied at
 * read time (main.ts) — normalizing here too means `settings.curatedBasesFolder` is a
 * valid string immediately after load, not just when read through that helper.
 */
export function normalizeCuratedBasesFolder(v: unknown): string {
	return isCuratedBasesFolder(v) ? v : DEFAULT_SETTINGS.curatedBasesFolder;
}

/** Type guard: true if `v` is a plain record of string → string (T4.4: cardByCollection). */
export function isCardByCollection(v: unknown): v is Record<string, string> {
	if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
	return Object.values(v as Record<string, unknown>).every((x) => typeof x === "string");
}

/**
 * Normalizer: returns a copy of `v` if it is a valid `cardByCollection` record, otherwise
 * `{}`. An empty record is not malformed — it is the shipped default ("nothing chosen
 * yet"). Always returns a fresh object, never the same reference across calls, matching
 * `normalizeExcludedFolders`'s discipline — a future in-place write (`onCardSelect`)
 * mutating the returned object must never corrupt `DEFAULT_SETTINGS.cardByCollection`.
 */
export function normalizeCardByCollection(v: unknown): Record<string, string> {
	return isCardByCollection(v) ? { ...v } : {};
}

/** Type guard: returns true if `v` is a valid `dismissedHints` value (an array of strings). */
export function isDismissedHints(v: unknown): v is string[] {
	return Array.isArray(v) && v.every((x) => typeof x === "string");
}

/**
 * Normalizer: returns a copy of `v` if it is a valid `dismissedHints` array, otherwise a
 * fresh empty array. A malformed value (not an array, or an array containing a non-string)
 * falls back to "nothing dismissed yet"; a legitimate empty array passes through unchanged
 * (copied). Always returns a fresh array — same discipline as `normalizeExcludedFolders` —
 * so a future in-place mutation (dismissing a hint) cannot corrupt
 * `DEFAULT_SETTINGS.dismissedHints`.
 */
export function normalizeDismissedHints(v: unknown): string[] {
	return isDismissedHints(v) ? [...v] : [];
}

/**
 * Build a `PluginSettings` from a persisted (untyped) `settings` blob, keeping only the
 * fields `PluginSettings` declares — every other own-enumerable key on `raw` (e.g. a
 * removed field like the pre-Phase-3 `exampleSetting`, G17) is dropped rather than
 * carried through.
 *
 * Each field is read from `raw` and passed through its own normalizer, falling back to
 * `DEFAULT_SETTINGS` for anything absent or malformed — same fail-closed pattern as the
 * individual normalizers above, just applied field-by-field instead of via a blind merge.
 *
 * This function returns an object literal typed as `PluginSettings`, not a spread of
 * `raw` — so adding a field to `PluginSettings` without adding a line here is a
 * compile error (a missing property on the return value), not a silent runtime gap.
 * If you add a field to `PluginSettings`, you must add its normalization here.
 */
export function normalizeSettings(raw: unknown): PluginSettings {
	const stored: Record<string, unknown> =
		raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
	return {
		linkClickAction: normalizeLinkClickAction(stored.linkClickAction),
		cardTitleOpensNote: normalizeCardTitleOpensNote(stored.cardTitleOpensNote),
		curatedBasesFolder: normalizeCuratedBasesFolder(stored.curatedBasesFolder),
		fileClassesFolder: normalizeFileClassesFolder(stored.fileClassesFolder),
		excludedFolders: normalizeExcludedFolders(stored.excludedFolders),
		editorDock: normalizeEditorDock(stored.editorDock),
		cardByCollection: normalizeCardByCollection(stored.cardByCollection),
		dismissedHints: normalizeDismissedHints(stored.dismissedHints),
		keepUndoHistory: typeof stored.keepUndoHistory === "boolean" ? stored.keepUndoHistory : DEFAULT_SETTINGS.keepUndoHistory,
	};
}
