/**
 * generatedFileClasses — which FileClasses this plugin authored (T5.3).
 *
 * `FieldSection.origin` has three variants, and the third one — `"user"` — is
 * the whole point of S103: a FileClass the *user* wrote must render as visibly
 * theirs, not silently as ours. `ParsedFileClass` carries no provenance flag
 * (metadata-menu's format has nowhere to put one, and adding a key of our own
 * would be dropped the first time metadata-menu rewrote the file through its
 * UI), so provenance has to come from the outside: the set of names the plugin
 * itself generates.
 *
 * These names are not free-form — `schema/*.json` is the canonical source and
 * `scripts/schema-gen.mjs` emits one `fc-<name>.md` per entry. This list is
 * therefore a *mirror*, and `test/editor/generatedFileClasses.test.ts` reads
 * `schema/` off disk and fails if the two ever drift, so adding an entity type
 * without updating this file breaks CI rather than silently re-labelling a
 * shipped FileClass as the user's own.
 *
 * @ref docs/XDD/specs/008-codex-surface/plan/phase-5.md — T5.3, the `origin: "user"` debt
 * @ref schema/README.md — the canonical schema, and what schema-gen writes
 */

/** The prefix `schema-gen.mjs` gives every FileClass it writes. */
export const GENERATED_FILE_CLASS_PREFIX = "fc-";

/**
 * Every FileClass name the plugin generates, mirroring `schema/*.json`.
 *
 * Kept as a sorted literal rather than derived at runtime: `src/` cannot read
 * `schema/` in a vault (it is not shipped with the plugin), so the honest
 * options were a mirror with a drift test or a provenance key metadata-menu
 * would eat. The drift test is the one that fails loudly.
 */
export const GENERATED_FILE_CLASSES: ReadonlySet<string> = new Set([
	"fc-book",
	"fc-character",
	"fc-character-fantasy",
	"fc-location",
	"fc-lore",
	"fc-object",
	"fc-plotline",
	"fc-scene",
]);

/**
 * Did the plugin author this FileClass?
 *
 * Anything not on the generated list is the user's, including a name that
 * merely looks like ours (`fc-character-custom1`) — extending one of our
 * FileClasses does not make a file ours.
 */
export function isGeneratedFileClass(name: string): boolean {
	return GENERATED_FILE_CLASSES.has(name);
}
