/**
 * editableFields — scalar/enum edit controls and vocab helpers.
 *
 * Provides helpers for deriving select vocabulary from FieldSpec,
 * which in turn comes from schema/*.json `values` arrays.
 * The edit control rendering (DOM) lives in InspectorController (T5.2).
 *
 * @ref SDD/ADR-7 — constrained dropdown; select vocab from schema values
 * @ref SDD/Building Block View — editableFields owns scalar/enum controls
 */

import type { FieldSpec } from "./frontmatterWriter";

/**
 * Return the select vocabulary for a select field, or null for non-select fields.
 *
 * The vocab comes from FieldSpec.values (sourced from schema/*.json `values`).
 * Returns an empty array if the field has type "select" but no values declared.
 * Returns null for all other field types — callers use this to decide whether
 * to render a dropdown vs a plain text input.
 */
export function selectVocab(field: FieldSpec): string[] | null {
	if (field.type !== "select") return null;
	return field.values ?? [];
}

/**
 * Return true if `field` is editable as a scalar input in the Inspector.
 *
 * Scalar-editable: text, number, boolean, select.
 * Non-editable (read-only): list, relation, tags, fixed.
 * This drives the Inspector's field rendering decision (T5.2).
 */
export function isScalarEditable(field: FieldSpec): boolean {
	return field.type === "text" || field.type === "number" || field.type === "boolean" || field.type === "select";
}

/**
 * Return true if `field` is read-only in the Inspector.
 * Inverse of isScalarEditable (F8 — list/relation display-only).
 */
export function isReadOnly(field: FieldSpec): boolean {
	return !isScalarEditable(field);
}
