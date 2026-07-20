/**
 * renderLore — Context-tab body renderer for lore notes.
 *
 * Renders mockup state S38 using the shared T3.1 component library.
 * Pure DOM, XSS-safe: no innerHTML, only createEl/text content.
 *
 * Sections (in order):
 *   1. Facts         (scope/aliases/first_appearance; absent fields skipped)
 *   2. Related       (entities where field==="related"; kind-tagged rows)
 *   3. Referenced by (backlinks — reverse related; incl. fuzzy:true — ADR-8)
 *
 * The Related section mixes entity kinds, so each row carries a trailing
 * kind tag to aid disambiguation (mockup S38).
 *
 * @ref mockups.html S38
 * @ref SDD/ADR-8 (fuzzy backlinks included for lore "referenced by")
 */

import {
	section,
	factRow,
	linkRow,
	emptyLine,
} from "panel/components";
import { kindFields } from "panel/kindFields";
import type { NoteContext, ResolvedEntity } from "scoping/NoteContext";
import type { PanelDeps } from "panel/renderPanel";

/**
 * Render the lore context panel into `el`.
 *
 * @param ctx  The resolved note context for a lore note.
 * @param el   The container element (already augmented with createEl).
 * @param deps Injected navigation + collapse dependencies.
 */
export function renderLore(
	ctx: NoteContext,
	el: HTMLElement,
	_deps: PanelDeps,
): void {
	const { frontmatter, entities, backlinks } = ctx;

	renderFacts(el, frontmatter);
	renderRelated(el, entities);
	renderReferencedBy(el, backlinks);
}

// ---------------------------------------------------------------------------
// Section renderers (each under 20 lines, single responsibility)
// ---------------------------------------------------------------------------

function renderFacts(el: HTMLElement, frontmatter: Record<string, unknown>): void {
	const fields = kindFields("lore").facts;
	const presentFields = fields.filter((f) => frontmatter[f] !== undefined);
	if (presentFields.length === 0) return;

	const { bodyEl } = section(el, "Facts");
	for (const field of presentFields) {
		const value = frontmatter[field];
		const display = Array.isArray(value) ? value.join(", ") : String(value);
		factRow(bodyEl, field, display);
	}
}

function renderRelated(el: HTMLElement, entities: ResolvedEntity[]): void {
	const related = entities.filter((e) => e.field === "related");
	const { bodyEl } = section(el, "Related", { count: related.length });

	if (related.length === 0) {
		emptyLine(bodyEl, "No related notes yet.");
		return;
	}

	for (const e of related) {
		linkRow(bodyEl, e.file.basename, { tag: e.kind });
	}
}

function renderReferencedBy(el: HTMLElement, backlinks: ResolvedEntity[]): void {
	// ADR-8: include fuzzy:true entries — lore is referenced via body links too
	const { bodyEl } = section(el, "Referenced by", { count: backlinks.length });

	if (backlinks.length === 0) {
		emptyLine(bodyEl, "Not referenced yet.");
		return;
	}

	for (const bl of backlinks) {
		linkRow(bodyEl, bl.file.basename, { tag: bl.kind });
	}
}
