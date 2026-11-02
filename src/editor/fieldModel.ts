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
 *  3. (folded into 1)   -> the "Other properties" section itself, typed by
 *     inspecting values exactly as tier 2 does (`untypedFieldDef`).
 *
 * The stored value outranks a declared scalar type in one case: a list. Every
 * scalar control would write it back as a string, or keep only its first item,
 * so such a field takes chips instead (`listValuedDef`), on both surfaces.
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
	/**
	 * The stored value is one no control can represent (a nested map, a list
	 * that is not all strings, a native date object). The pane shows it but
	 * offers no way to edit it, so editing can never rewrite it into something
	 * else. Set by value inference, and on a field declared as a scalar that
	 * holds a list of non-strings (see `listValuedDef`). Also set on `type`, in
	 * every tier (see `CLASSIFYING_FIELD`).
	 */
	readOnly?: true;
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
 * Hints keyed by the FileClass that declares them (`fc-character`), so a hint
 * for our `tagline` never widens a user's own FileClass field of that name.
 */
export type UiHintsByFileClass = Readonly<Record<string, UiHints>>;

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
	uiHints: UiHintsByFileClass = {},
): FieldModel {
	if (chain.length === 0) {
		return { sections: [buildTier2Section(frontmatter)] };
	}

	const seen = new Set<string>();
	const sections = chain.map((fileClass) => buildChainSection(fileClass, uiHints, seen, frontmatter));

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
function buildChainSection(
	fileClass: ParsedFileClass,
	uiHints: UiHintsByFileClass,
	seen: Set<string>,
	frontmatter: Record<string, unknown> | undefined,
): FieldSection {
	const fields: FieldDef[] = [];
	const hints = uiHints[fileClass.name] ?? {};
	for (const field of fileClass.fields) {
		if (seen.has(field.name)) continue; // first declaration wins (F6 edge case)
		seen.add(field.name);
		fields.push(toFieldDef(field, hints, frontmatter?.[field.name]));
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

function toFieldDef(field: FileClassField, uiHints: UiHints, value: unknown): FieldDef {
	const ui = uiHints[field.name];
	const listDef = Array.isArray(value) ? listValuedDef(field, value as unknown[]) : undefined;
	const type = listDef?.type ?? field.type;
	const def: FieldDef = { name: field.name, type, width: widthOf({ type, ui }) };
	if (field.values !== undefined && listDef?.type === undefined) def.values = field.values;
	if (ui !== undefined) def.ui = ui;
	if (listDef?.readOnly || isClassifyingKey(field.name) || isMap(value)) def.readOnly = true;
	return def;
}

/**
 * `type` is never editable, in any tier and on either surface: `classifyEntityKind`
 * falls back to it, so a stray edit (or the clearing "—" of a one-value Select)
 * would reclassify the note. Decided here, once, so the Anvil and the Workbench
 * inherit it rather than each restating a rule by name.
 */
const CLASSIFYING_FIELD = "type";

function isClassifyingKey(name: string): boolean {
	return name === CLASSIFYING_FIELD;
}

/**
 * A plain object (a YAML map). No control can hold one, so a declared field
 * storing one is shown and never written, as an undeclared one is in tiers 2 and 3.
 */
function isMap(value: unknown): boolean {
	return typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype;
}

/** Declared types whose control holds a list already, so a stored list changes nothing. */
const LIST_TYPES: ReadonlySet<FieldType> = new Set<FieldType>(["Multi", "MultiFile"]);
/** Declared types that hold links, so an EMPTY list stays a link field. */
const LINK_TYPES: ReadonlySet<FieldType> = new Set<FieldType>(["File", "Media", "MultiMedia"]);
/**
 * Declared types whose control cannot hold a list, and for which `[]` is the
 * same "no value" a missing key or `null` is. The declared control stays.
 * Text-like and link-like types are not here: there `[]` is a list with no
 * items yet, which chips represent.
 */
const UNSET_WHEN_EMPTY: ReadonlySet<FieldType> = new Set<FieldType>([
	"Number", "Boolean", "Select", "Cycle", "Date", "Datetime", "Time",
]);
const WIKILINK = /^\[\[.+\]\]$/;

/**
 * What a list stored in a field declared as a scalar turns the field into, or
 * `undefined` when its declared type already holds lists.
 *
 * An empty list in a `Number`, `Boolean`, `Select`, `Cycle` or date-like field
 * counts as unset (`UNSET_WHEN_EMPTY`). Strings get chips: link chips when every
 * item is a `[[link]]`, free chips otherwise. A list holding a non-string keeps its declared type and becomes
 * read-only, since chips would rewrite those members as strings. That holds
 * for a declared `Multi`/`MultiFile` too: its chips would write `[1,2]` back
 * as `["1","2"]`.
 */
function listValuedDef(
	field: FileClassField,
	value: readonly unknown[],
): { type?: FieldType; readOnly?: true } | undefined {
	const strings = value.filter((item): item is string => typeof item === "string");
	if (strings.length !== value.length) return { readOnly: true };
	if (LIST_TYPES.has(field.type)) return undefined;
	if (value.length === 0 && UNSET_WHEN_EMPTY.has(field.type)) return undefined;
	const allLinks = strings.every((item) => WIKILINK.test(item.trim()));
	const links = strings.length === 0 ? LINK_TYPES.has(field.type) : allLinks;
	return { type: links ? "MultiFile" : "Multi" };
}

// ---------------------------------------------------------------------------
// Tier 2 — no chain at all: the note's own keys, typed by value
// ---------------------------------------------------------------------------

function buildTier2Section(frontmatter: Record<string, unknown> | undefined): FieldSection {
	const declared = Object.entries(frontmatter ?? {}).filter(([name]) => !CLASSIFICATION_KEYS.has(name));
	const fields = declared.map(([name, value]) => untypedFieldDef(name, value));
	return { label: TIER2_LABEL, source: NO_FILECLASS_SOURCE, origin: "other", fields };
}

/**
 * A field for a key no FileClass declares (tiers 2 and 3), typed by its value
 * so that editing keeps the YAML type: a string stays a string, a number a
 * number, a boolean a boolean, a list of strings a list.
 *
 * Two kinds of `Unknown` result, and the difference matters:
 *  - `null` (an empty `key:`) holds nothing to lose, so it stays an editable
 *    text box — typing into it creates the value.
 *  - anything no control can round-trip (a nested map, a list holding a
 *    non-string, a native date object) is `readOnly`: shown, never writable,
 *    because the only control that could take it would rewrite it.
 */
function untypedFieldDef(name: string, value: unknown): FieldDef {
	const inferred = inferFromValue(value);
	const def: FieldDef = { name, type: inferred.type, width: widthOf({ type: inferred.type }) };
	if (inferred.readOnly || isClassifyingKey(name)) def.readOnly = true;
	return def;
}

function inferFromValue(value: unknown): { type: FieldType; readOnly?: true } {
	if (value === null || value === undefined) return { type: "Unknown" };
	if (typeof value === "string") return { type: "Input" };
	if (typeof value === "number") return { type: "Number" };
	if (typeof value === "boolean") return { type: "Boolean" };
	if (Array.isArray(value) && value.every((v) => typeof v === "string")) return { type: "Multi" };
	return { type: "Unknown", readOnly: true };
}

// ---------------------------------------------------------------------------
// Tier 3 — a key no FileClass in the chain declares
// ---------------------------------------------------------------------------

/**
 * Undeclared frontmatter keys, typed by their value the way tier 2 is. They
 * used to be always `Unknown` (text), which silently changed the YAML type on
 * edit — `age: 34` became `"35"`, a list became one string. A value no control
 * can round-trip is marked read-only instead (see `untypedFieldDef`).
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

	const fields = extraNames.map((name) => untypedFieldDef(name, frontmatter?.[name]));
	return { label: OTHER_PROPERTIES_LABEL, source: NO_FILECLASS_SOURCE, origin: "other", fields };
}
