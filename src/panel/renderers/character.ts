/**
 * renderCharacter — Context-tab body renderer for character/character-fantasy notes.
 *
 * Renders mockup states S32–S35 using the shared T3.1 component library.
 * Pure DOM, XSS-safe: no innerHTML, only createEl/text content.
 *
 * Sections (in order):
 *   1. Profile (portrait tile + pinfo stat lines)
 *   2. Facts   (core character facts from frontmatter, in kindFields order)
 *   3. Fantasy (conditional: only when fantasy fields exist in frontmatter — ADR-9)
 *   4. Relationships (outgoing entities grouped by field)
 *   5. Appears in  (scene backlinks via pov/characters)
 *   6. Owns        (object backlinks via owner; collapsed when empty)
 *   7. Related     (location + lore backlinks)
 *
 * @ref mockups.html S32–S35
 * @ref SDD/ADR-9 (conditional fantasy sub-block)
 * @ref SDD/ADR-2 (pure DOM components; deps injected)
 */

import {
	section,
	factRow,
	relationRow,
	linkRow,
	emptyLine,
	portraitTile,
	unresolvedEl,
} from "panel/components";

declare const activeDocument: Document;
import { kindFields } from "panel/kindFields";
import type { NoteContext, ResolvedEntity } from "scoping/NoteContext";
import type { PanelDeps } from "panel/renderPanel";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Fantasy-specific fact fields (ADR-9). Presence of any triggers the sub-block. */
const FANTASY_FIELDS: ReadonlyArray<string> = [
	"species",
	"magical_abilities",
	"combat_skills",
	"weapons",
	"armor",
];

/** Display label overrides for relation fields. */
const RELATION_LABELS: Record<string, string> = {
	significant_other: "partner",
};

// ---------------------------------------------------------------------------
// renderCharacter
// ---------------------------------------------------------------------------

/**
 * Render the character context panel into `el`.
 *
 * @param ctx  The resolved note context for a character note.
 * @param el   The container element (already augmented with createEl).
 * @param deps Injected navigation + collapse dependencies.
 */
export function renderCharacter(
	ctx: NoteContext,
	el: HTMLElement,
	_deps: PanelDeps,
): void {
	const { frontmatter, entities, backlinks } = ctx;
	const name = ctx.activeFile.basename;

	renderPortrait(el, name, frontmatter);
	renderFacts(el, frontmatter);
	renderFantasy(el, frontmatter);
	renderRelationships(el, entities);
	renderAppearsIn(el, backlinks);
	renderOwns(el, backlinks);
	renderRelated(el, backlinks);
}

// ---------------------------------------------------------------------------
// Section renderers (each under 20 lines, single responsibility)
// ---------------------------------------------------------------------------

function renderPortrait(
	el: HTMLElement,
	name: string,
	frontmatter: Record<string, unknown>,
): void {
	const portrait = frontmatter["portrait"];
	const image = typeof portrait === "string" && portrait ? portrait : undefined;
	portraitTile(el, name, image);
}

function renderFacts(el: HTMLElement, frontmatter: Record<string, unknown>): void {
	const fields = kindFields("character").facts;
	const presentFields = fields.filter((f) => frontmatter[f] !== undefined);
	if (presentFields.length === 0) return;

	const { bodyEl } = section(el, "Facts");
	for (const field of presentFields) {
		const value = frontmatter[field];
		factRow(bodyEl, field, String(value));
	}
}

function renderFantasy(el: HTMLElement, frontmatter: Record<string, unknown>): void {
	const present = FANTASY_FIELDS.filter((f) => frontmatter[f] !== undefined);
	if (present.length === 0) return;

	const { bodyEl } = section(el, "Fantasy");
	for (const field of present) {
		factRow(bodyEl, field, String(frontmatter[field]));
	}
}

function renderRelationships(el: HTMLElement, entities: ResolvedEntity[]): void {
	const { bodyEl } = section(el, "Relationships");
	const relationFields = kindFields("character").relations;

	// Only fields that have at least one entity
	const byField = groupByField(entities.filter((e) => !e.unresolved || e.field !== undefined));
	const unresolvedByField = groupUnresolvedByField(entities);

	// Collect which fields are actually present
	const allFields = new Set([
		...Object.keys(byField),
		...Object.keys(unresolvedByField),
	]);

	// Only render entries for known relation fields that have data
	const orderedFields = relationFields.filter((f) => allFields.has(f));

	if (orderedFields.length === 0) {
		emptyLine(bodyEl, "No relationships yet.");
		return;
	}

	for (const field of orderedFields) {
		const label = RELATION_LABELS[field] ?? field;
		const resolved = byField[field] ?? [];
		const unresolved = unresolvedByField[field] ?? [];
		const linkEls = buildRelationLinkEls(resolved, unresolved);
		relationRow(bodyEl, label, linkEls);
	}
}

function renderAppearsIn(el: HTMLElement, backlinks: ResolvedEntity[]): void {
	const sceneLinks = backlinks.filter(
		(b) => b.kind === "scene" && (b.field === "pov" || b.field === "characters"),
	);
	const { bodyEl } = section(el, "Appears in", { count: sceneLinks.length });

	if (sceneLinks.length === 0) {
		emptyLine(bodyEl, "No scenes yet.");
		return;
	}

	for (const bl of sceneLinks) {
		const tag = bl.field === "pov" ? "pov" : "char";
		linkRow(bodyEl, bl.file.basename, { tag });
	}
}

function renderOwns(el: HTMLElement, backlinks: ResolvedEntity[]): void {
	const owned = backlinks.filter((b) => b.kind === "object" && b.field === "owner");
	const collapsed = owned.length === 0;
	const { bodyEl } = section(el, "Owns", { count: owned.length, collapsed });

	if (owned.length === 0) {
		emptyLine(bodyEl, "No objects yet.");
		return;
	}

	for (const bl of owned) {
		linkRow(bodyEl, bl.file.basename);
	}
}

function renderRelated(el: HTMLElement, backlinks: ResolvedEntity[]): void {
	const { bodyEl } = section(el, "Related");
	const locationLinks = backlinks.filter((b) => b.kind === "location" && b.field === "inhabitants");
	const loreLinks = backlinks.filter((b) => b.kind === "lore");

	if (locationLinks.length === 0 && loreLinks.length === 0) {
		emptyLine(bodyEl, "No related locations or lore yet.");
		return;
	}

	if (locationLinks.length > 0) {
		const linkEls = buildLinkEls(locationLinks);
		relationRow(bodyEl, "locations", linkEls);
	}
	if (loreLinks.length > 0) {
		const linkEls = buildLinkEls(loreLinks);
		relationRow(bodyEl, "lore", linkEls);
	}
}

// ---------------------------------------------------------------------------
// Private utilities
// ---------------------------------------------------------------------------

/** Group resolved (non-unresolved) entities by field. */
function groupByField(entities: ResolvedEntity[]): Record<string, ResolvedEntity[]> {
	const result: Record<string, ResolvedEntity[]> = {};
	for (const e of entities) {
		if (!e.field || e.unresolved) continue;
		(result[e.field] ??= []).push(e);
	}
	return result;
}

/** Group unresolved entities by field. */
function groupUnresolvedByField(entities: ResolvedEntity[]): Record<string, ResolvedEntity[]> {
	const result: Record<string, ResolvedEntity[]> = {};
	for (const e of entities) {
		if (!e.field || !e.unresolved) continue;
		(result[e.field] ??= []).push(e);
	}
	return result;
}

/**
 * Build link elements for resolved + unresolved entities in a relation slot.
 * Uses the T3.1 unresolvedRow component for unresolved entries.
 */
function buildRelationLinkEls(
	resolved: ResolvedEntity[],
	unresolved: ResolvedEntity[],
): HTMLElement[] {
	const els: HTMLElement[] = [];

	for (const e of resolved) {
		const span = activeDocument.createElement("span");
		span.className = "sf-lrow-lnk";
		span.textContent = e.file.basename;
		span.setAttribute("tabindex", "0");
		span.setAttribute("role", "link");
		els.push(span);
	}

	for (const e of unresolved) {
		els.push(unresolvedEl(e.file.basename));
	}

	return els;
}

/** Build simple link elements for a list of resolved backlinks. */
function buildLinkEls(backlinks: ResolvedEntity[]): HTMLElement[] {
	return backlinks.map((bl) => {
		const span = activeDocument.createElement("span");
		span.className = "sf-lrow-lnk";
		span.textContent = bl.file.basename;
		span.setAttribute("tabindex", "0");
		span.setAttribute("role", "link");
		return span;
	});
}
