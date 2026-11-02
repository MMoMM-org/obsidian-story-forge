/**
 * inspectorFieldsFromModel — the `FieldModel` as the Workbench editor's fields.
 *
 * The Workbench and the Anvil read the same model (ADR-0002), but `specFor` is
 * the Anvil's write map, and the Workbench differs from it in three ways:
 *
 *  - `type` is never editable. `classifyEntityKind` reads it, and `fixed` reaches
 *    the model as a one-value `Select` at best and an `Input` in tiers 2 and 3,
 *    so the rule goes by name rather than by type. Every `fixed` field in
 *    `schema/*.json` is called `type`, which a test reads off disk.
 *  - `readOnly` has no equivalent in `specFor`. It becomes `fixed`.
 *  - `Media` stays text. `SPEC_TYPE` says `relation` because the Anvil has a
 *    `Media` control, which the Workbench does not; its plain text box already
 *    edits the `[[wikilink]]` as the string it is.
 *
 * @ref docs/XDD/adr/0002-fileclass-driven-editor.md
 * @ref docs/XDD/specs/008-codex-surface/plan/phase-6.md — T6.3
 */

import { specFor } from "editor/fieldCommit";
import type { FieldDef, FieldModel, FieldSection } from "editor/fieldModel";
import type { FieldSpec } from "./frontmatterWriter";

/** The frontmatter key `classifyEntityKind` falls back to. */
const CLASSIFYING_FIELD = "type";

/** Every field of `model`, in render order, as `InspectorController` takes them. */
export function inspectorFieldsFromModel(model: FieldModel): FieldSpec[] {
	return model.sections.flatMap((section) => section.fields).map(inspectorSpec);
}

function inspectorSpec(field: FieldDef): FieldSpec {
	if (field.readOnly || field.name === CLASSIFYING_FIELD) return { name: field.name, type: "fixed" };
	if (field.type === "Media") return { name: field.name, type: "text" };
	return specFor(field);
}

/**
 * The headings the flat field list needs: first field's name -> label.
 *
 * Only the trailing *Other properties* section takes one, so a note's undeclared
 * keys read as such, as they do in the Anvil. A model with one section is tier 2,
 * where the note's own keys are the whole list and there is nothing to set apart.
 */
export function inspectorHeadings(model: FieldModel): ReadonlyMap<string, string> {
	const undeclared = model.sections.length > 1 ? model.sections.filter(isUndeclared) : [];
	return new Map(undeclared.flatMap((section) => {
		const first = section.fields[0];
		return first ? [[first.name, section.label] as const] : [];
	}));
}

function isUndeclared(section: FieldSection): boolean {
	return section.origin === "other";
}
