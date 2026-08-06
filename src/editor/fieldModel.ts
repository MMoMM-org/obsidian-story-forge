/**
 * fieldModel — the FileClass chain (from `fileClassReader`) plus a note's
 * frontmatter, reduced to an ordered, typed, laid-out `FieldModel`.
 *
 * ADR-31: this is the pure layer between the reader and the editor pane —
 * the editor renders `FieldModel`, it never reads FileClasses itself. Layout
 * (`FieldDef.width`) is always *derived* from the field's type via
 * `uiHints.widthOf` — never a per-kind/per-name branch (ADR-32).
 *
 * Three tiers, all data-driven (ADR-0002 §6):
 *  1. a chain resolves  -> one section per FileClass, base first, plus a
 *     trailing "Other properties" section for any undeclared frontmatter key.
 *  2. no chain at all   -> a single section built from the note's own
 *     frontmatter keys, typed by inspecting their values.
 *  3. (folded into 1)   -> the "Other properties" section itself.
 *
 * @ref SDD/Complex Logic  — buildFieldModel algorithm + traced walkthrough
 * @ref SDD/Application Data Models — FieldModel / FieldSection / FieldDef
 * @ref PRD/F6             — fields come from the FileClass chain
 * @ref ADR-31, ADR-32
 */

import type { FieldType, FileClassField, ParsedFileClass } from "fileclass/fileClassTypes";
import { widthOf } from "editor/uiHints";
import { isGeneratedFileClass } from "editor/generatedFileClasses";

/** A single rendered field: its control type, its selectable values (if any), and its width. */
export interface FieldDef {
	name: string;
	type: FieldType;
	values?: string[];
	width: "half" | "full";
	ui?: "wide";
}

/**
 * Where a section's fields came from.
 *
 * `"builtin"` — a FileClass the plugin generates (`generatedFileClasses.ts`).
 * `"user"` — a FileClass the user wrote, including one that extends ours; S103
 * exists to show these as visibly theirs, so collapsing the two would remove
 * the whole point of that figure. `"other"` — tier 2 (no chain at all) and
 * tier 3 (the trailing "Other properties" section), neither of which is backed
 * by a FileClass declaration at all.
 *
 * Provenance cannot come from `ParsedFileClass` — metadata-menu's format has
 * nowhere to put it, and a key of our own would be dropped the first time
 * metadata-menu rewrote the file — so it comes from the generated-name set,
 * which a drift test pins to `schema/*.json` (T5.3).
 */
export type FieldSectionOrigin = "builtin" | "user" | "other";

export interface FieldSection {
	/**
	 * The display label (OQ-1, resolved 2026-08-05): the FileClass's own
	 * `title` when it declares one, otherwise derived from the file name
	 * (`fc-character` -> "Character", `fc-character-custom1` -> "Character
	 * custom1").
	 *
	 * Resolved HERE rather than in the renderer: ADR-31 says the editor renders
	 * a `FieldModel` and never reads FileClasses itself, so the layer that knows
	 * what `fc-` means has to be this one. The fallback is not a nicety — no
	 * FileClass the plugin generates carries a `title` today, so it is the live
	 * path for every shipped section, and a metadata-menu that drops or empties
	 * the key degrades to it rather than to a blank heading.
	 */
	label: string;
	source: string;
	/** What this section's FileClass extends, when it extends one (S102/S103's source line). */
	extends?: string;
	origin: FieldSectionOrigin;
	fields: FieldDef[];
}

export interface FieldModel {
	sections: FieldSection[];
}

/** Field name -> presentation override. Lives in our `schema/*.json`, never in a FileClass file. */
export type UiHints = Readonly<Record<string, "wide">>;

/**
 * Keys that classify a note rather than describe it, and so never render as
 * editable fields (T5.3).
 *
 * `tags` decides which collection a note belongs to and `fileClass` decides
 * which fields it has — editing either from the editor would change what the
 * pane itself is, and a typo in `fileClass` would silently empty it. S103's
 * *Other properties* section shows exactly one key (`scratch`) for a note that
 * certainly carries tags, which is the same call made in the figure.
 *
 * Excluded only from the UNDECLARED sections: a FileClass that genuinely
 * declares `tags` as a field still renders it, because then it is that
 * FileClass's business, not ours.
 */
const CLASSIFICATION_KEYS: ReadonlySet<string> = new Set(["tags", "fileClass"]);

const OTHER_PROPERTIES_LABEL = "Other properties";
const TIER2_LABEL = "Properties";
const NO_FILECLASS_SOURCE = "other";

/**
 * Build the ordered, typed, laid-out field model for one note.
 *
 * `chain` is the already-resolved, base-first `resolveFileClassChain` output
 * (T1.2) — this function never talks to a vault or a lookup. `frontmatter`
 * is the note's own frontmatter (possibly `undefined` for a note with none).
 */
export function buildFieldModel(
	chain: ParsedFileClass[],
	frontmatter: Record<string, unknown> | undefined,
	uiHints: UiHints = {},
): FieldModel {
	if (chain.length === 0) {
		return { sections: [buildTier2Section(frontmatter)] };
	}

	const seen = new Set<string>();
	const sections = chain.map((fileClass) => buildChainSection(fileClass, uiHints, seen));

	const otherSection = buildOtherPropertiesSection(frontmatter, seen);
	if (otherSection !== undefined) sections.push(otherSection);

	return { sections };
}

// ---------------------------------------------------------------------------
// Tier 1 — one section per FileClass in the chain
// ---------------------------------------------------------------------------

/**
 * One FileClass's section. Fields already carry the reader's final render
 * order — including any field `fieldsOrder` omitted, which `fileClassReader`
 * appends last in declaration order rather than dropping (see this task's
 * report). This function trusts that order completely: it neither re-derives
 * nor filters it, it only removes a name already claimed by an earlier
 * section in the chain (R1/R4: first declaration wins).
 */
function buildChainSection(fileClass: ParsedFileClass, uiHints: UiHints, seen: Set<string>): FieldSection {
	const fields: FieldDef[] = [];
	for (const field of fileClass.fields) {
		if (seen.has(field.name)) continue; // first declaration wins (F6 edge case)
		seen.add(field.name);
		fields.push(toFieldDef(field, uiHints));
	}
	const section: FieldSection = {
		label: sectionLabel(fileClass),
		source: `${fileClass.name}.md`,
		origin: isGeneratedFileClass(fileClass.name) ? "builtin" : "user",
		fields,
	};
	if (fileClass.extends !== undefined) section.extends = fileClass.extends;
	return section;
}

/**
 * OQ-1: the FileClass's own `title`, else the file name made readable —
 * `fc-character` -> "Character", `fc-character-custom1` -> "Character custom1".
 *
 * Only the leading `fc-` is stripped; the rest becomes one sentence-cased
 * phrase. A user FileClass called `fc-isekai` reads "Isekai" without needing a
 * title key at all, and one that wants "Isekai" from `fc-character-custom1`
 * declares it.
 */
function sectionLabel(fileClass: ParsedFileClass): string {
	if (fileClass.title !== undefined) return fileClass.title;
	const words = fileClass.name.replace(/^fc-/, "").replace(/[-_]+/g, " ").trim();
	if (words === "") return fileClass.name;
	return words.charAt(0).toUpperCase() + words.slice(1);
}

function toFieldDef(field: FileClassField, uiHints: UiHints): FieldDef {
	const ui = uiHints[field.name];
	const def: FieldDef = { name: field.name, type: field.type, width: widthOf({ type: field.type, ui }) };
	if (field.values !== undefined) def.values = field.values;
	if (ui !== undefined) def.ui = ui;
	return def;
}

// ---------------------------------------------------------------------------
// Tier 2 — no chain at all: the note's own keys, typed by value
// ---------------------------------------------------------------------------

function buildTier2Section(frontmatter: Record<string, unknown> | undefined): FieldSection {
	const declared = Object.entries(frontmatter ?? {}).filter(([name]) => !CLASSIFICATION_KEYS.has(name));
	const fields = declared.map(([name, value]) => {
		const type = inferTypeFromValue(value);
		return { name, type, width: widthOf({ type }) };
	});
	return { label: TIER2_LABEL, source: NO_FILECLASS_SOURCE, origin: "other", fields };
}

function inferTypeFromValue(value: unknown): FieldType {
	if (typeof value === "string") return "Input";
	if (typeof value === "number") return "Number";
	if (typeof value === "boolean") return "Boolean";
	if (Array.isArray(value)) return "Multi";
	return "Unknown";
}

// ---------------------------------------------------------------------------
// Tier 3 — a key no FileClass in the chain declares
// ---------------------------------------------------------------------------

/**
 * Undeclared frontmatter keys, always rendered as plain text (R2: an
 * unrecognised type never fails, it falls back to text) rather than typed by
 * value the way tier 2 is — a key present on the note but declared by no
 * FileClass is, by definition, of a type this model cannot know.
 *
 * If a FileClass in the chain were literally named "Other properties", its
 * section would share this one's label with no data merge between them —
 * a cosmetic label collision, not a correctness issue: fields still resolve
 * through `seen`/`declared`, so nothing is double-counted or dropped.
 */
function buildOtherPropertiesSection(
	frontmatter: Record<string, unknown> | undefined,
	declared: ReadonlySet<string>,
): FieldSection | undefined {
	const extraNames = Object.keys(frontmatter ?? {}).filter(
		(name) => !declared.has(name) && !CLASSIFICATION_KEYS.has(name),
	);
	if (extraNames.length === 0) return undefined;

	const fields = extraNames.map((name) => ({ name, type: "Unknown" as const, width: widthOf({ type: "Unknown" }) }));
	return { label: OTHER_PROPERTIES_LABEL, source: NO_FILECLASS_SOURCE, origin: "other", fields };
}
