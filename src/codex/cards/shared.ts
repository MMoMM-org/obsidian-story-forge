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
// Image field per kind
// ---------------------------------------------------------------------------

/** The frontmatter field a Card draws as its image, per kind (see kindFields.ts's header comment). */
const IMAGE_FIELD: Partial<Record<EntityKind, string>> = {
	character: "portrait",
	location: "image",
	object: "image",
};

/** The field id a Card should try for its image tile, or `undefined` for a kind with no image field. */
export function imageFieldId(kind: EntityKind): string | undefined {
	return IMAGE_FIELD[kind];
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
 */
export function missBadge(fieldId: string): HTMLElement {
	const badge = activeDocument.createElement("span");
	badge.className = "sf-cx-miss";
	badge.setAttribute("title", "This property does not exist in this note");

	const label = activeDocument.createElement("b");
	label.textContent = humanizeFieldLabel(fieldId);
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
export function factChip(fieldId: string, text: string): HTMLElement {
	const chip = activeDocument.createElement("span");
	chip.className = "sf-cx-fact";

	const label = activeDocument.createElement("b");
	label.textContent = humanizeFieldLabel(fieldId);
	chip.appendChild(label);

	const value = activeDocument.createElement("span");
	value.className = "sf-cx-fact-v";
	value.textContent = text;
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
 * An empty-but-present field (`[]`, or a blank string) renders as no pills at
 * all: nothing to list is the normal rendering of "blank" for a list field.
 */
export function entryPills(entry: CardEntry, fieldId: string): HTMLElement[] {
	const field = entry.field(fieldId);
	if (!field.present) return [missBadge(fieldId)];

	return field.items.map((item) => {
		const pill = activeDocument.createElement("i");
		pill.className = "sf-cx-pill";
		pill.textContent = item;
		return pill;
	});
}
