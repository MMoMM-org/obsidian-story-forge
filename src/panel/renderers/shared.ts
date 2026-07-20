/**
 * Shared renderer utilities — T3.3+.
 *
 * Extracted helpers used across multiple per-kind renderers. Keep this module
 * free of kind-specific logic; callers pass in the field list and frontmatter.
 *
 * @ref SDD/ADR-2 (pure DOM components; deps injected)
 */

import { section, factRow, linkRow, emptyLine, unresolvedEl } from "panel/components";
import type { ResolvedEntity } from "scoping/NoteContext";

// ---------------------------------------------------------------------------
// renderReverseSceneList
// ---------------------------------------------------------------------------

export interface ReverseSceneListOptions {
	/** Empty-state message when no matching backlinks exist. */
	emptyText: string;
}

/**
 * Render a "Scenes" section populated by reverse scene backlinks.
 *
 * - Filters `backlinks` to entries where `kind === "scene"` and `field === targetField`.
 * - Sorts the matching entries by `file.basename` (stable; DV-3 — do NOT sort by
 *   scene.order, that data is not available in this layer).
 * - Renders a count badge on the section header.
 * - Renders `emptyLine(emptyText)` when no matching backlinks exist.
 *
 * @param el          Parent element to append the section into.
 * @param backlinks   All reverse links for the active note.
 * @param field       The backlink field that links to this kind (e.g. "plotlines" or "book").
 * @param opts        Configuration including the empty-state message.
 */
export function renderReverseSceneList(
	el: HTMLElement,
	backlinks: ResolvedEntity[],
	field: string,
	opts: ReverseSceneListOptions,
): void {
	const scenes = backlinks
		.filter((b) => b.kind === "scene" && b.field === field)
		.sort((a, b) => a.file.basename.localeCompare(b.file.basename));

	const { bodyEl } = section(el, "Scenes", { count: scenes.length });

	if (scenes.length === 0) {
		emptyLine(bodyEl, opts.emptyText);
		return;
	}

	for (const bl of scenes) {
		if (bl.unresolved) {
			bodyEl.appendChild(unresolvedEl(bl.file.basename));
		} else {
			linkRow(bodyEl, bl.file.basename);
		}
	}
}

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
