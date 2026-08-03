export interface PluginSettings {
	/** ADR-5: link-click action; modifier-click inverts. Default: "drill". */
	linkClickAction: "drill" | "open";
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
}

const DEFAULT_FILE_CLASSES_FOLDER = "00 Meta/FileClasses";
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
	curatedBasesFolder: "00 Meta/Bases",
	fileClassesFolder: DEFAULT_FILE_CLASSES_FOLDER,
	excludedFolders: [...DEFAULT_EXCLUDED_FOLDERS],
	editorDock: DEFAULT_EDITOR_DOCK,
};

/** Type guard: returns true if `v` is a valid `linkClickAction` value. */
export function isLinkClickAction(v: unknown): v is PluginSettings["linkClickAction"] {
	return v === "drill" || v === "open";
}

/** Normalizer: returns `v` if it is a valid `linkClickAction`, otherwise `"drill"`. */
export function normalizeLinkClickAction(v: unknown): PluginSettings["linkClickAction"] {
	return isLinkClickAction(v) ? v : "drill";
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

/** Normalizer: returns `v` if it is a non-empty string, otherwise the shipped default. */
export function normalizeFileClassesFolder(v: unknown): string {
	return isFileClassesFolder(v) ? v : DEFAULT_FILE_CLASSES_FOLDER;
}
