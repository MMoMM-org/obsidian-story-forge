/**
 * shared — the two pieces of knowledge all three built-in Cards need alike
 * (T4.3, spec 008-codex-surface, Phase 4).
 *
 * A `CardRenderer` only ever sees a `CardEntry` (ADR-30) — no `App`, no
 * collection id, no declared "reads:" list (the S104 mockup rejects both a
 * `reads:` declaration and a heuristic that guesses from an empty-looking
 * grid: "a whole column of markings is self-explanatory"). So a built-in Card
 * that wants the same per-kind fact/relation lists the panel renderers use
 * (`panel/kindFields.ts`) has to classify the entry's kind from the one thing
 * it *can* read — its own `tags` (and `type`) properties — rather than being
 * told. That is `entryKind` below: a thin adapter onto
 * `scoping/NoteContext.ts`'s `classifyEntityKind`, the ONE tag→kind mapping
 * (ADR-4) — not a second copy of it. A second copy is exactly what this file
 * shipped with originally, and it had already drifted from
 * `ScopingService.classify`: this file's copy had no `type`-field fallback,
 * so a note classifiable only via frontmatter `type` classified as
 * `"unknown"` here while `ScopingService` correctly resolved its real kind.
 *
 * `missBadge` is the other shared piece: the PRD/F4 "absent property" marking
 * (mockup `.miss`, S91/S97/S104) — a red tint plus a visible label plus a
 * tooltip, so the marking never depends on colour alone and stays legible
 * without a pointer (mobile, keyboard, colour-blind).
 *
 * Extracted rather than duplicated three times because it is the same
 * knowledge in three consumers (DRY) — not for its own testability. Each
 * function is exercised through the Cards that use it (`heroCard.test.ts`,
 * `tableCard.test.ts`, `compactCard.test.ts`), not in a test file of its own.
 *
 * @ref docs/mockups/anvil-workbench-codex.html — S91, S97, S104
 * @ref docs/XDD/specs/008-codex-surface/requirements.md — Feature F4
 * @ref src/panel/kindFields.ts — the per-kind fact/relation lists reused here
 * @ref src/scoping/NoteContext.ts — classifyEntityKind, the single source of
 *      truth for the tag→kind mapping (ADR-4), shared with ScopingService
 */

import type { CardEntry } from "codex/cardRegistry";
import { wikilinkTarget } from "panel/assetResolver";
import { humanizeFieldLabel } from "panel/components";
import { classifyEntityKind, type EntityKind } from "scoping/NoteContext";

declare const activeDocument: Document;

// ---------------------------------------------------------------------------
// entryKind — classify from the entry's own tags (+ type fallback)
// ---------------------------------------------------------------------------

/**
 * Classify an entry's `EntityKind` from its own `tags` property, falling back
 * to a `type` property the same way `ScopingService.classify` does (ADR-4) —
 * both key off `classifyEntityKind`, so the two cannot independently drift.
 *
 * A tag (and `type`) none of the built-in collections use (a user's own
 * collection, e.g. `canon/creature`) classifies as `"unknown"` — for which
 * `kindFields` returns empty fact/relation lists, so a Card degrades to
 * image + name rather than marking a wall of fields that were never going
 * to apply.
 */
export function entryKind(entry: CardEntry): EntityKind {
	return classifyEntityKind(entry.field("tags").items, entry.field("type").text);
}

// ---------------------------------------------------------------------------
// Link display — no raw brackets on a relation value
// ---------------------------------------------------------------------------

const INLINE_WIKILINK_RE = /!?\[\[([^\]]*)\]\]/g;

/** One link's visible text: the alias, else the target's last path segment (no extension, no heading). */
function oneLinkDisplay(inner: string): string {
	const [targetPart = "", ...aliasParts] = inner.split("|");
	const alias = aliasParts.join("|").trim();
	if (alias) return alias;
	const target = wikilinkTarget(`[[${inner}]]`) ?? targetPart;
	const last = target.split("/").pop() ?? "";
	return last.replace(/\.md$/i, "").trim() || inner.trim();
}

/**
 * The visible form of a value that may hold wikilinks: every `[[...]]` becomes
 * its alias or its target's last path segment. Plain text is returned
 * unchanged. The click marker keeps the full target; this only changes what is
 * drawn. The ONE helper the relation pills, Hero facts line and fact chips share.
 */
export function linkDisplay(raw: string): string {
	return raw.replace(INLINE_WIKILINK_RE, (_m, inner: string) => oneLinkDisplay(inner));
}

// ---------------------------------------------------------------------------
// Field presentation — the shared PRD/F4 vocabulary
// ---------------------------------------------------------------------------

/**
 * The absent-property marking (PRD/F4; mockup `.miss`): a visible label
 * ("not set") plus a tooltip, on top of the CSS tint — so the marking never
 * depends on colour alone. Colours come from Obsidian's own error variables
 * (`--background-modifier-error`, `--text-error`; see `styles.css`) rather
 * than the mockup's fixed reds, so the tint survives both themes.
 *
 * The `title` attribute carries the same explanation ("This property does
 * not exist in this note") to pointer users, but `title` is unreachable
 * without a pointer — never exposed to touch or keyboard users, and only
 * inconsistently to screen readers via a non-focusable `<span>`. `aria-label`
 * carries it to assistive tech instead; it folds in the field label too
 * (rather than replacing it) so the accessible name doesn't lose which field
 * this is — an `aria-label` overrides the element's text content as far as
 * the accessibility tree is concerned, so a bare "not set" here would have
 * silently dropped the field name for AT users even though sighted users
 * still see it right beside it.
 */
export function missBadge(fieldId: string): HTMLElement {
	const humanLabel = humanizeFieldLabel(fieldId);

	const badge = activeDocument.createElement("span");
	badge.className = "sf-cx-miss";
	badge.setAttribute("title", "This property does not exist in this note");
	badge.setAttribute("aria-label", `${humanLabel} — this property does not exist in this note`);

	const label = activeDocument.createElement("b");
	label.textContent = humanLabel;
	badge.appendChild(label);

	const state = activeDocument.createElement("i");
	// "not set" is a mid-sentence continuation of the bold field label (mockup
	// S91/S97/S104: "<b>level</b> <i>not set</i>" reads as one phrase), not a
	// standalone sentence.
	// eslint-disable-next-line obsidianmd/ui/sentence-case
	state.textContent = "not set";
	badge.appendChild(state);

	return badge;
}

/**
 * One present fact, labelled — rendered even when its text is `""` (a
 * present-but-blank property renders normally, PRD/F4; `null`, `""` and `[]`
 * are deliberately not distinguished from one another).
 */
function factChip(fieldId: string, text: string): HTMLElement {
	const chip = activeDocument.createElement("span");
	chip.className = "sf-cx-fact";

	const label = activeDocument.createElement("b");
	label.textContent = humanizeFieldLabel(fieldId);
	chip.appendChild(label);

	const value = activeDocument.createElement("span");
	value.className = "sf-cx-fact-v";
	value.textContent = linkDisplay(text);
	chip.appendChild(value);

	return chip;
}

/**
 * Render one field as a Card would show it: a labelled fact when the
 * property is present (even blank), `missBadge` when it is absent. Shared by
 * Table's columns and Compact's one-line facts. (Hero no longer calls this
 * since its S91 rebuild — its facts line renders plain, unlabelled text
 * inline plus `missBadge` directly, matching the mockup's unlabelled `.hf`.)
 */
export function fieldChip(entry: CardEntry, fieldId: string): HTMLElement {
	const field = entry.field(fieldId);
	return field.present ? factChip(fieldId, field.text) : missBadge(fieldId);
}

/**
 * Render a field's `.items` as pills — one per entry — or a single
 * `missBadge` when the field itself is absent. Deliberately generic over
 * *any* field id, not only a relation: S91's `.hp` pill row is **one slot**
 * that holds either a genuine relation (`allies`, one pill per linked entity)
 * or a scalar fact folded in beside them (`occupation`, one pill, since
 * `CardField.items` already reduces a scalar to a single-element list) — the
 * mockup draws no visual distinction between the two, so this function
 * doesn't either (see `heroCard.ts`'s pill row, which mixes both).
 *
 * A pill whose value is a wikilink carries `data-sf-link` (the TARGET, via
 * `wikilinkTarget`). Native frontmatter keeps the stored `[[Target|alias]]`
 * form in `items`; the Bases backend re-reads `Value.toString()`, so it is
 * only a link there if that display form keeps its brackets.
 *
 * An empty-but-present field (`[]`, or a blank string) renders as no pills at
 * all: nothing to list is the normal rendering of "blank" for a list field.
 */
export function entryPills(entry: CardEntry, fieldId: string): HTMLElement[] {
	const field = entry.field(fieldId);
	if (!field.present) return [missBadge(fieldId)];

	return field.items.map((item) => {
		const pill = activeDocument.createElement("i");
		// Distinct from the Codex collection pills' `.sf-cx-pill` (codexTab.ts):
		// the two used to share a class name, which let the collection-pill CSS
		// block (styles.css, later in the file) silently override the selected
		// collection pill's accent fill. Scoped names keep the cascade from
		// crossing between the two unrelated controls again.
		pill.className = "sf-cx-relpill";
		pill.textContent = linkDisplay(item);
		// A link pill is a link (nearest marker beats the card body's). A plain
		// value is NOT marked: a marker that resolves to nothing would swallow the
		// click that should fall through to the card.
		const target = wikilinkTarget(item);
		if (target) pill.setAttribute("data-sf-link", target);
		return pill;
	});
}
