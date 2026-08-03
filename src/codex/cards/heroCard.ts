/**
 * heroCard — the Codex's default Card (T4.2's registry default), rebuilt to
 * reproduce the signed-off mockup structure exactly (PRD/F4; mockup S91,
 * `.hero`/`.hb`/`.hn`/`.hf`/`.hp`, lines 613-623/368-381).
 *
 * **Rebuilt 2026-08-03.** The first cut split "key facts" into a uniform row
 * of labelled chips, which read as a reasonable generalisation but was a
 * mockup divergence raised *after* coding rather than before it — the repo
 * rule is sign-off first. S91's actual structure, mapped onto this file's
 * `sf-cx-*` vocabulary (not the mockup's literal short classnames):
 *
 *   - image-or-monogram tile (`portraitTile`/`kindTileEl`)
 *   - `.sf-cx-name` — the name (`deps.nameEl`)
 *   - `.sf-cx-hero-facts` — ONE middot-joined line of the first two facts,
 *     UNLABELLED plain text when present ("protagonist · alive" — no "role:"
 *     prefix); an absent one renders `.miss` instead (self-labelled, since
 *     nothing else would say which field is missing)
 *   - `.sf-cx-hero-pills` — ONE flex-wrap pill row folding in the *third*
 *     fact (occupation, in the worked example) alongside every relation —
 *     the same slot for both, which is what `entryPills` (`./shared`)
 *     doesn't distinguish between
 *
 * There is deliberately **no** fourth element for the mockup's `.hx`
 * ("12 scenes"): `CardEntry` exposes only `path`/`name`/`field(id)` — no
 * backlink/scene-count seam — and adding one would reopen T4.2's frozen
 * contract. Recorded as an owned gap for a later task, not stubbed here.
 *
 * Facts/relations come from `kindFields(entryKind(entry))` (`./shared`) — the
 * same per-kind lists the panel renderers use. Only characters ship a
 * three-fact worked example in the mockup; other built-in kinds (location,
 * object, lore) apply the identical mechanical split (first two facts → the
 * line, the third → the pill row) over their own, shorter fact lists — see
 * the module's test file for what that looks like per kind. An entry whose
 * tag classifies to no known kind (a user's own collection) gets empty
 * fact/relation lists from `kindFields("unknown")`, so Hero degrades to
 * image + name rather than a wall of unrelated `.miss` markers (S104).
 *
 * @ref docs/mockups/anvil-workbench-codex.html — S91, S97, S104
 * @ref docs/XDD/specs/008-codex-surface/requirements.md — Feature F4
 */

import type { CardEntry, CardRenderDeps, CardRenderer } from "codex/cardRegistry";
import { kindTileEl, portraitTile } from "panel/components";
import { kindFields } from "panel/kindFields";
import type { EntityKind } from "scoping/NoteContext";
import { entryKind, entryPills, imageFieldId, missBadge } from "./shared";

declare const activeDocument: Document;

/** S91's `.hf`: the first two facts, joined by a middot. */
const HF_FACT_COUNT = 2;
/** S91's `.hp` worked example folds in exactly one more fact (`occupation`) beside the relations. */
const PILL_FACT_COUNT = 1;

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
		appendFactsLine(body, entry, facts.slice(0, HF_FACT_COUNT));
		// Skip the pill row in compact (Workbench) density — S95 keeps the
		// sidebar form to name + the facts line, matching its narrower width.
		if (!deps.compact) {
			const pillFieldIds = [...facts.slice(HF_FACT_COUNT, HF_FACT_COUNT + PILL_FACT_COUNT), ...relations];
			appendPillRow(body, entry, pillFieldIds);
		}
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

/**
 * S91's `.hf`: the first two facts on one line, joined by a middot. A
 * present value (even blank) renders as plain, unlabelled text — the mockup
 * shows "protagonist · alive", never "role: protagonist". An absent one
 * renders `.miss` instead, which *is* self-labelled (it names the field it
 * marks — otherwise nothing here would say which one is missing).
 */
function appendFactsLine(body: HTMLElement, entry: CardEntry, factIds: readonly string[]): void {
	if (factIds.length === 0) return;

	const row = activeDocument.createElement("div");
	row.className = "sf-cx-hero-facts";

	factIds.forEach((id, index) => {
		if (index > 0) {
			const dot = activeDocument.createElement("span");
			dot.className = "sf-cx-hero-dot";
			dot.textContent = "·";
			row.appendChild(dot);
		}

		const field = entry.field(id);
		if (field.present) {
			const value = activeDocument.createElement("span");
			value.className = "sf-cx-hero-fact-v";
			value.textContent = field.text;
			row.appendChild(value);
		} else {
			row.appendChild(missBadge(id));
		}
	});

	body.appendChild(row);
}

/**
 * S91's `.hp`: one flex-wrap pill row. `fieldIds` mixes the "third" fact
 * (occupation, in the worked example) with the kind's relations — the same
 * slot for both; `entryPills` doesn't distinguish a fact-as-list from a
 * genuine relation, which is the point (S104's "the same marking" lesson,
 * extended from misses to pills).
 */
function appendPillRow(body: HTMLElement, entry: CardEntry, fieldIds: readonly string[]): void {
	if (fieldIds.length === 0) return;

	const row = activeDocument.createElement("div");
	row.className = "sf-cx-hero-pills";
	for (const id of fieldIds) {
		for (const pillOrMiss of entryPills(entry, id)) row.appendChild(pillOrMiss);
	}
	body.appendChild(row);
}
