/**
 * renderPlotline — Context-tab body renderer for plotline notes.
 *
 * Renders mockup state S40 using the shared T3.1 component library.
 * Pure DOM, XSS-safe: no innerHTML, only createEl/text content.
 *
 * Sections (in order):
 *   1. Facts  (logline / status / series; absent fields skipped)
 *   2. Scenes (reverse backlinks: kind==="scene" && field==="plotlines";
 *              stable basename order — DV-3; count badge)
 *
 * @ref mockups.html S40
 * @ref DV-3 (sort by basename, NOT by scene.order — data not available here)
 * @ref SDD/ADR-2 (pure DOM components; deps injected)
 */

import { kindFields } from "panel/kindFields";
import { renderFactsSection, renderReverseSceneList } from "panel/renderers/shared";
import type { NoteContext } from "scoping/NoteContext";
import type { PanelDeps } from "panel/renderPanel";

// ---------------------------------------------------------------------------
// renderPlotline
// ---------------------------------------------------------------------------

/**
 * Render the plotline context panel into `el`.
 *
 * @param ctx  The resolved note context for a plotline note.
 * @param el   The container element (already augmented with createEl).
 * @param deps Injected navigation + collapse dependencies.
 */
export function renderPlotline(
	ctx: NoteContext,
	el: HTMLElement,
	_deps: PanelDeps,
): void {
	const { frontmatter, backlinks } = ctx;

	renderFactsSection(el, kindFields("plotline").facts, frontmatter);
	renderReverseSceneList(el, backlinks, "plotlines", {
		emptyText: "No scenes in this plotline yet.",
	});
}
