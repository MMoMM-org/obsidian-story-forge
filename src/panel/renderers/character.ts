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

declare const activeDocument: Document;

import {
	section,
	factRow,
	relationRow,
	linkRow,
	emptyLine,
	portraitTile,
	profileRow,
	taglineLine,
	humanizeFieldLabel,
	stringifyFieldValue,
	unresolvedEl,
	stampLinkEl,
} from "panel/components";
import { kindFields } from "panel/kindFields";
import { renderFactsSection } from "panel/renderers/shared";
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

/**
 * Character fact fields surfaced in the profile block (mockup S32), NOT in the
 * Facts section. The Facts section keeps only the remaining fields (aliases,
 * distinctive_features, first_appearance).
 */
const PROFILE_FIELDS: ReadonlySet<string> = new Set([
	"nickname", "role", "occupation", "age",
	"status", "height", "build", "eyes", "hair", "tagline",
]);

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
	deps: PanelDeps,
): void {
	const { frontmatter, entities, backlinks } = ctx;
	const name = ctx.activeFile.basename;

	renderProfile(el, name, frontmatter, deps);
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

/**
 * Render the profile block (mockup S32): a portrait tile beside stacked pinfo
 * stat lines, then an optional tagline. Portrait uses the `portrait` image or
 * a monogram (existing portraitTile behaviour).
 */
function renderProfile(
	el: HTMLElement,
	name: string,
	frontmatter: Record<string, unknown>,
	deps: PanelDeps,
): void {
	const portrait = frontmatter["portrait"];
	const rawSrc = typeof portrait === "string" && portrait ? portrait : "";
	const resolved = deps.resolveAsset(rawSrc);
	const image = resolved || undefined;

	// Build the portrait tile detached, then hand it to profileRow.
	const holder = activeDocument.createElement("div");
	const tile = portraitTile(holder, name, image);

	profileRow(el, tile, buildPinfoLines(frontmatter));

	const tagline = frontmatter["tagline"];
	if (typeof tagline === "string" && tagline) {
		taglineLine(el, tagline);
	}
}

/** Compose the pinfo stat lines from frontmatter, skipping all-empty lines. */
function buildPinfoLines(
	fm: Record<string, unknown>,
): Array<string | HTMLElement> {
	const lines: Array<string | HTMLElement> = [];

	const nickname = stringifyFieldValue(fm["nickname"]);
	const role = stringifyFieldValue(fm["role"]);
	// Lead: **<nickname>** · <role> when nickname present, else <role>.
	if (nickname) {
		const leadEl = activeDocument.createElement("span");
		const b = activeDocument.createElement("b");
		b.textContent = nickname;
		leadEl.appendChild(b);
		if (role) leadEl.appendChild(activeDocument.createTextNode(` · ${role}`));
		lines.push(leadEl);
	} else if (role) {
		lines.push(role);
	}

	const occupation = stringifyFieldValue(fm["occupation"]);
	const age = stringifyFieldValue(fm["age"]);
	pushLine(lines, [occupation, age ? `age ${age}` : ""]);

	const status = stringifyFieldValue(fm["status"]);
	const height = stringifyFieldValue(fm["height"]);
	const build = stringifyFieldValue(fm["build"]);
	pushLine(lines, [status, height ? `${height} cm` : "", build]);

	const eyes = stringifyFieldValue(fm["eyes"]);
	const hair = stringifyFieldValue(fm["hair"]);
	pushLine(lines, [eyes ? `${eyes} eyes` : "", hair]);

	// Ensure at least the lead exists so the profile never renders an empty pinfo.
	if (lines.length === 0 && role) lines.push(role);
	return lines;
}

/** Join non-empty parts with " · " and push as a line; skip when all empty. */
function pushLine(lines: Array<string | HTMLElement>, parts: string[]): void {
	const kept = parts.filter((p) => p !== "");
	if (kept.length > 0) lines.push(kept.join(" · "));
}

function renderFacts(el: HTMLElement, frontmatter: Record<string, unknown>): void {
	// Profile-consumed fields (nickname/role/stats/tagline) are shown in the
	// profile block, not the Facts section (mockup S32).
	const facts = kindFields("character").facts.filter((f) => !PROFILE_FIELDS.has(f));
	renderFactsSection(el, facts, frontmatter);
}

function renderFantasy(el: HTMLElement, frontmatter: Record<string, unknown>): void {
	const present = FANTASY_FIELDS.filter((f) => frontmatter[f] !== undefined);
	if (present.length === 0) return;

	const { bodyEl } = section(el, "Fantasy");
	for (const field of present) {
		factRow(bodyEl, humanizeFieldLabel(field), stringifyFieldValue(frontmatter[field]));
	}
}

function renderRelationships(el: HTMLElement, entities: ResolvedEntity[]): void {
	const { bodyEl } = section(el, "Relationships");
	const relationFields = kindFields("character").relations;

	// Only fields that have at least one entity
	const byField = groupByField(entities);
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
		const label = humanizeFieldLabel(field);
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

	// Dedup by scene file — a character referenced by the same scene BOTH as `pov`
	// and in `characters` must appear once, tagged with its primary role (pov wins).
	// Mockup S32/S34: one row per unique scene; count reflects unique scenes.
	const byScene = new Map<string, { file: ResolvedEntity["file"]; isPov: boolean }>();
	for (const bl of sceneLinks) {
		const existing = byScene.get(bl.file.path);
		if (existing) {
			existing.isPov = existing.isPov || bl.field === "pov";
		} else {
			byScene.set(bl.file.path, { file: bl.file, isPov: bl.field === "pov" });
		}
	}
	const scenes = [...byScene.values()];

	const { bodyEl } = section(el, "Appears in", { count: scenes.length });

	if (scenes.length === 0) {
		emptyLine(bodyEl, "No scenes yet.");
		return;
	}

	for (const s of scenes) {
		linkRow(bodyEl, s.file.basename, { tag: s.isPov ? "pov" : "char", path: s.file.path });
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
		linkRow(bodyEl, bl.file.basename, { path: bl.file.path });
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
		els.push(stampLinkEl(e.file.basename, e.file.path));
	}

	for (const e of unresolved) {
		els.push(unresolvedEl(e.file.basename));
	}

	return els;
}

/** Build simple link elements for a list of resolved backlinks. */
function buildLinkEls(backlinks: ResolvedEntity[]): HTMLElement[] {
	return backlinks.map((bl) => stampLinkEl(bl.file.basename, bl.file.path));
}
