/**
 * compactCard — the single-line built-in Card: name plus a couple of key
 * facts, no image, no relation pills. The density that fits the Workbench's
 * width (mockup S95) and a scanning list view in the Anvil alike.
 *
 * @ref docs/XDD/specs/008-codex-surface/requirements.md — Feature F4
 * @ref src/codex/cards/shared.ts — entryKind, fieldChip (the shared PRD/F4 vocabulary)
 */

import type { CardEntry, CardRenderDeps, CardRenderer } from "codex/cardRegistry";
import { kindFields } from "panel/kindFields";
import { entryKind, fieldChip } from "./shared";

/** Fewer facts than Hero — one line, no room for a third. */
const COMPACT_FACT_CAP = 2;

export const compactCard: CardRenderer = {
	id: "compact",
	label: "Compact",

	render(entry: CardEntry, el: HTMLElement, deps: CardRenderDeps): void {
		el.classList.add("sf-cx-compactrow");

		el.appendChild(deps.nameEl(entry));

		const { facts } = kindFields(entryKind(entry));
		for (const id of facts.slice(0, COMPACT_FACT_CAP)) {
			el.appendChild(fieldChip(entry, id));
		}
	},
};
