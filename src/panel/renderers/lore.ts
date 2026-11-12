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
	linkRow,
	emptyLine,
} from "panel/components";
import { kindFields } from "panel/kindFields";
import { renderFactsSection } from "panel/renderers/shared";
import type { NoteContext, ResolvedEntity } from "scoping/NoteContext";
import type { PanelDeps } from "panel/renderPanel";
import { claimLinks, type SectionCandidate } from "panel/collectionSections";

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
	deps: PanelDeps,
): void {
	const { frontmatter, entities, backlinks } = ctx;

	renderFacts(el, frontmatter);
	// T7.1d3: notes a Workbench-on built-in claims are its sections, not Related or Referenced by.
	const stays = claimLinks(el, linkCandidates(ctx), deps.collections);
	const quiet = deps.collections !== undefined;
	renderRelated(el, entities.filter(stays), quiet);
	renderReferencedBy(el, backlinks.filter(stays), quiet);
}

/** Related notes (outgoing) and every backlink, each under its own field; scenes and the like are claimed by nobody. */
function linkCandidates(ctx: NoteContext): SectionCandidate[] {
	const related = ctx.entities.filter((e) => e.field === "related").map((entity): SectionCandidate => ({ entity, key: "related" }));
	const referencing = ctx.backlinks.map((entity): SectionCandidate => ({ entity, key: entity.field ?? "related" }));
	return [...related, ...referencing];
}

// ---------------------------------------------------------------------------
// Section renderers (each under 20 lines, single responsibility)
// ---------------------------------------------------------------------------

function renderFacts(el: HTMLElement, frontmatter: Record<string, unknown>): void {
	renderFactsSection(el, kindFields("lore").facts, frontmatter);
}

function renderRelated(el: HTMLElement, entities: ResolvedEntity[], omitWhenEmpty: boolean): void {
	const related = entities.filter((e) => e.field === "related");
	if (omitWhenEmpty && related.length === 0) return;
	const { bodyEl } = section(el, "Related", { count: related.length });

	if (related.length === 0) {
		emptyLine(bodyEl, "No related notes yet.");
		return;
	}

	for (const e of related) {
		linkRow(bodyEl, e.file.basename, { tag: e.kind, path: e.file.path });
	}
}

function renderReferencedBy(el: HTMLElement, backlinks: ResolvedEntity[], omitWhenEmpty: boolean): void {
	if (omitWhenEmpty && backlinks.length === 0) return;
	// ADR-8: include fuzzy:true entries — lore is referenced via body links too
	const { bodyEl } = section(el, "Referenced by", { count: backlinks.length });

	if (backlinks.length === 0) {
		emptyLine(bodyEl, "Not referenced yet.");
		return;
	}

	for (const bl of backlinks) {
		linkRow(bodyEl, bl.file.basename, { tag: bl.kind, path: bl.file.path });
	}
}
