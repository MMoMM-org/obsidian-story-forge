/**
 * tableCard — the roomiest built-in Card: every fact and relation column for
 * the entry's classified kind, one flat row per entry (PRD/F4 — "Table
 * renders the same entries... at a different density").
 *
 * Drawn as a `<div>` "row" rather than a `<table>` because `CardRenderer.render`
 * draws ONE entry at a time into ONE host-owned element (ADR-30) — there is no
 * shared header row across sibling cards for a single Card invocation to build.
 * That is the genuine remaining constraint, and it is contract-shaped: nothing
 * short of reopening `CardRenderer.render`'s per-entry signature closes it.
 *
 * The grid density itself is already handled: `codexTab.ts`'s `renderBody`
 * stamps the grid with `sf-cx-grid--${card.id}`, and `styles.css`'s
 * `.sf-cx-grid--table` switches it to a single, full-width column — Table
 * does not share Hero's multi-column card grid.
 *
 * @ref docs/XDD/specs/008-codex-surface/requirements.md — Feature F4
 * @ref src/codex/cards/shared.ts — entryKind, fieldChip (the shared PRD/F4 vocabulary)
 */

import type { CardEntry, CardRenderDeps, CardRenderer } from "codex/cardRegistry";
import { kindFields } from "panel/kindFields";
import { entryKind, fieldChip } from "./shared";

declare const activeDocument: Document;

export const tableCard: CardRenderer = {
	id: "table",
	label: "Table",

	render(entry: CardEntry, el: HTMLElement, deps: CardRenderDeps): void {
		el.classList.add("sf-cx-table-row");

		const nameCell = activeDocument.createElement("span");
		nameCell.className = "sf-cx-table-cell sf-cx-table-name";
		nameCell.appendChild(deps.nameEl(entry));
		el.appendChild(nameCell);

		const { facts, relations } = kindFields(entryKind(entry));
		for (const id of [...facts, ...relations]) {
			const cell = activeDocument.createElement("span");
			cell.className = "sf-cx-table-cell";
			cell.appendChild(fieldChip(entry, id));
			el.appendChild(cell);
		}
	},
};
