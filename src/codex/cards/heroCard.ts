/**
 * heroCard — the Codex's default Card (T4.2's registry default): image or
 * monogram, name, key facts and relation pills (PRD/F4; mockup S91/S97/S104).
 *
 * Reuses `portraitTile`/`kindTileEl` from `panel/components.ts` so a Codex
 * card and the panel's own profile block share one visual language — the
 * same reason both resolve images through `CardRenderDeps.resolveAsset`
 * (`panel/assetResolver.ts`).
 *
 * Facts and relations come from `kindFields(entryKind(entry))` (`./shared`) —
 * the same per-kind lists the panel renderers already use — the facts capped
 * to a small "key facts" set for the grid's card width; every relation is
 * shown (no built-in kind has more than five, S91's worked example). An
 * entry whose tag classifies to no known kind (a user's own collection) gets
 * empty fact/relation lists from `kindFields("unknown")`, so Hero degrades to
 * image + name rather than a wall of unrelated `.miss` markers — S104's
 * lesson, applied to our own default rather than only to an imported Card.
 *
 * @ref docs/mockups/anvil-workbench-codex.html — S91, S97, S104
 * @ref docs/XDD/specs/008-codex-surface/requirements.md — Feature F4
 */

import type { CardEntry, CardRenderDeps, CardRenderer } from "codex/cardRegistry";
import { kindTileEl, portraitTile } from "panel/components";
import { kindFields } from "panel/kindFields";
import type { EntityKind } from "scoping/NoteContext";
import { entryKind, fieldChip, imageFieldId, relationPills } from "./shared";

declare const activeDocument: Document;

/** Key facts shown on the card face — the rest are still reachable via Table. */
const HERO_FACT_CAP = 3;

export const heroCard: CardRenderer = {
	id: "hero",
	label: "Hero",

	render(entry: CardEntry, el: HTMLElement, deps: CardRenderDeps): void {
		el.classList.add("sf-cx-hero");
		const kind = entryKind(entry);

		appendTile(el, entry, kind, (raw) => deps.resolveAsset(raw));

		const body = activeDocument.createElement("div");
		body.className = "sf-cx-card-main sf-cx-hero-body";
		el.appendChild(body);

		body.appendChild(deps.nameEl(entry));

		const { facts, relations } = kindFields(kind);
		appendFacts(body, entry, facts.slice(0, HERO_FACT_CAP));
		// Skip the relation-pill row in compact (Workbench) density — S95 keeps
		// the sidebar form to name + key facts, matching its narrower width.
		if (!deps.compact) appendPills(body, entry, relations);
	},
};

/** The image-or-monogram tile: `kindTileEl` for location/object, `portraitTile` otherwise. */
function appendTile(
	el: HTMLElement,
	entry: CardEntry,
	kind: EntityKind,
	resolveAsset: CardRenderDeps["resolveAsset"],
): void {
	const fieldId = imageFieldId(kind);
	const raw = fieldId ? entry.field(fieldId).text : "";
	const src = raw ? resolveAsset(raw) : "";

	if (kind === "location" || kind === "object") {
		el.appendChild(kindTileEl(kind, src || undefined));
		return;
	}
	// portraitTile appends to `el` itself and draws the monogram fallback when
	// `src` is empty — the same composition CardRenderDeps.resolveAsset is
	// documented against (empty input → "" → monogram).
	portraitTile(el, entry.name, src || undefined);
}

function appendFacts(body: HTMLElement, entry: CardEntry, factIds: readonly string[]): void {
	if (factIds.length === 0) return;
	const row = activeDocument.createElement("div");
	row.className = "sf-cx-hero-facts";
	for (const id of factIds) row.appendChild(fieldChip(entry, id));
	body.appendChild(row);
}

function appendPills(body: HTMLElement, entry: CardEntry, relationIds: readonly string[]): void {
	if (relationIds.length === 0) return;
	const row = activeDocument.createElement("div");
	row.className = "sf-cx-hero-pills";
	for (const id of relationIds) {
		for (const pillOrMiss of relationPills(entry, id)) row.appendChild(pillOrMiss);
	}
	body.appendChild(row);
}
