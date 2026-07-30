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
 * `"builtin"` — every section built from a resolved FileClass chain link.
 * `ParsedFileClass` carries no provenance flag (it does not know which
 * FileClass files ship with the plugin versus which a user authored), so
 * this pure layer cannot yet distinguish "ours" from "the user's own
 * FileClass" — see this task's report for the reasoning. `"other"` — tier 2
 * (no chain at all) and tier 3 (the trailing "Other properties" section),
 * neither of which is backed by a FileClass declaration.
 */
export type FieldSectionOrigin = "builtin" | "other";

export interface FieldSection {
	/**
	 * The raw FileClass name (e.g. `"fc-character"`), not a display-ready
	 * title — there is no separate "title" field anywhere in the real
	 * generated FileClass frontmatter to draw one from. Prettifying this
	 * (e.g. "fc-character" -> "Character") is deliberately left to a later,
	 * render-facing layer (`editorPane.ts`), not this pure model.
	 */
	label: string;
	source: string;
	origin: FieldSectionOrigin;
	fields: FieldDef[];
}

export interface FieldModel {
	sections: FieldSection[];
}

/** Field name -> presentation override. Lives in our `schema/*.json`, never in a FileClass file. */
export type UiHints = Readonly<Record<string, "wide">>;

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
	return { label: fileClass.name, source: `${fileClass.name}.md`, origin: "builtin", fields };
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
	const fields = Object.entries(frontmatter ?? {}).map(([name, value]) => {
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
	const extraNames = Object.keys(frontmatter ?? {}).filter((name) => !declared.has(name));
	if (extraNames.length === 0) return undefined;

	const fields = extraNames.map((name) => ({ name, type: "Unknown" as const, width: widthOf({ type: "Unknown" }) }));
	return { label: OTHER_PROPERTIES_LABEL, source: NO_FILECLASS_SOURCE, origin: "other", fields };
}
