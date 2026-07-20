/**
 * renderBook — Context-tab body renderer for book notes.
 *
 * Renders the same shape as plotline (S40 note: "Same shape for book."),
 * using the shared T3.1 component library.
 * Pure DOM, XSS-safe: no innerHTML, only createEl/text content.
 *
 * Sections (in order):
 *   1. Facts  (subtitle / author / order / status / series; absent fields skipped)
 *   2. Scenes (reverse backlinks: kind==="scene" && field==="book";
 *              stable basename order — DV-3; count badge)
 *
 * @ref mockups.html S40 ("Same shape for book.")
 * @ref DV-3 (sort by basename, NOT by scene.order — data not available here)
 * @ref SDD/ADR-2 (pure DOM components; deps injected)
 */

import { kindFields } from "panel/kindFields";
import { renderFactsSection, renderReverseSceneList } from "panel/renderers/shared";
import type { NoteContext } from "scoping/NoteContext";
import type { PanelDeps } from "panel/renderPanel";

// ---------------------------------------------------------------------------
// renderBook
// ---------------------------------------------------------------------------

/**
 * Render the book context panel into `el`.
 *
 * @param ctx  The resolved note context for a book note.
 * @param el   The container element (already augmented with createEl).
 * @param deps Injected navigation + collapse dependencies.
 */
export function renderBook(
	ctx: NoteContext,
	el: HTMLElement,
	_deps: PanelDeps,
): void {
	const { frontmatter, backlinks } = ctx;

	renderFactsSection(el, kindFields("book").facts, frontmatter);
	renderReverseSceneList(el, backlinks, "book", {
		emptyText: "No scenes in this book yet.",
	});
}
