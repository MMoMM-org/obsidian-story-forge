/**
 * Shared renderer utilities — T3.3+.
 *
 * Extracted helpers used across multiple per-kind renderers. Keep this module
 * free of kind-specific logic; callers pass in the field list and frontmatter.
 *
 * @ref SDD/ADR-2 (pure DOM components; deps injected)
 */

import { section, factRow } from "panel/components";

/**
 * Render a "Facts" section with the given ordered field list.
 *
 * - Skips fields not present in `frontmatter` (value === undefined).
 * - Joins array values with ", ".
 * - Returns early (no section rendered) when no fields are present.
 *
 * @param el          Parent element to append the section into.
 * @param facts       Ordered list of frontmatter field names for this kind.
 * @param frontmatter Raw frontmatter of the active note.
 */
export function renderFactsSection(
	el: HTMLElement,
	facts: string[],
	frontmatter: Record<string, unknown>,
): void {
	const presentFields = facts.filter((f) => frontmatter[f] !== undefined);
	if (presentFields.length === 0) return;

	const { bodyEl } = section(el, "Facts");
	for (const field of presentFields) {
		const value = frontmatter[field];
		const display = Array.isArray(value) ? value.join(", ") : String(value);
		factRow(bodyEl, field, display);
	}
}
