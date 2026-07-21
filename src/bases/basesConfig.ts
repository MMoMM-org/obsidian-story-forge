/**
 * basesConfig — typed builders and BasesConfigFile validation for authored .base YAML.
 *
 * CON-3 firewall: This module is the sanctioned home for BasesConfigFile typing
 * and validation. No other module may import BasesConfigFile.
 *
 * The validator is used at build time (build-catalog.mjs) and can be used at
 * runtime for import-time gating.
 *
 * @ref SDD/CON-3  — src/bases/ firewall (BasesConfigFile typings here only)
 * @ref SDD/ADR-9  — build-time .base YAML validation against BasesConfigFile
 */

import type { BasesConfigFile } from "obsidian";

// ---------------------------------------------------------------------------
// Validation result
// ---------------------------------------------------------------------------

export type ValidationOk = { ok: true; config: BasesConfigFile };
export type ValidationError = { ok: false; error: string };
export type ValidationResult = ValidationOk | ValidationError;

// ---------------------------------------------------------------------------
// validateBasesConfig
// ---------------------------------------------------------------------------

/**
 * Validate that `raw` conforms to the BasesConfigFile shape.
 *
 * A valid BasesConfigFile must:
 *  - Be a non-null plain object
 *  - Have at least one of: views, filters, formulas
 *  - views (if present) must be an array
 *  - formulas (if present) must be a Record<string, string> (all values are strings)
 *
 * Returns { ok: true, config } on success; { ok: false, error } on failure.
 * The error message is human-readable and references the failing member.
 *
 * Note: BasesConfigFile.properties and BasesConfigFile.summaries are optional
 * members not required for a minimally valid config. We do not validate their
 * shape here — BasesConfigFile treats them as extensible.
 */
export function validateBasesConfig(raw: unknown): ValidationResult {
	if (raw === null || raw === undefined || typeof raw !== "object" || Array.isArray(raw)) {
		return { ok: false, error: "Not an object — expected a BasesConfigFile plain object" };
	}

	// obj is now narrowed to a plain object (non-null, non-array).
	// BasesConfigFile has all-optional members — structurally compatible with object.
	const obj = raw as BasesConfigFile & Record<string, unknown>;

	const hasViews = "views" in obj;
	const hasFilters = "filters" in obj;
	const hasFormulas = "formulas" in obj;

	// At least one of the three recognised members must be present.
	if (!hasViews && !hasFilters && !hasFormulas) {
		return {
			ok: false,
			error: "Invalid BasesConfigFile: must have at least one of views, filters, or formulas",
		};
	}

	// views — must be an array when present
	if (hasViews && !Array.isArray(obj.views)) {
		return {
			ok: false,
			error: "Invalid BasesConfigFile: views must be an array of BasesConfigFileView",
		};
	}

	// formulas — must be a plain object with string values when present
	if (hasFormulas) {
		const formulas: unknown = obj.formulas;
		if (
			formulas === null ||
			typeof formulas !== "object" ||
			Array.isArray(formulas)
		) {
			return {
				ok: false,
				error: "Invalid BasesConfigFile: formulas must be a Record<string, string>",
			};
		}
		for (const value of Object.values(formulas as Record<string, unknown>)) {
			if (typeof value !== "string") {
				return {
					ok: false,
					error: "Invalid BasesConfigFile: formulas values must all be strings",
				};
			}
		}
	}

	return { ok: true, config: obj };
}
