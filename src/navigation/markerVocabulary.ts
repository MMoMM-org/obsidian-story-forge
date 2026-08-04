/**
 * markerVocabulary — the one attribute → TargetKind map shared by every
 * host's `_markerKindOf` (ADR-28, T2.5 gap closure).
 *
 * `AnvilView` and `SidebarView` each hand-rolled an identical if-chain
 * classifying the same marker attributes into a `TargetKind`, differing
 * only in *which* attributes each recognises — the Sidebar deliberately
 * omits the Codex collection pill (`CODEX_COLLECTION_ATTR`) because it has
 * no selection store to act on it. Collapsing that difference by sharing a
 * single unconditional classifier would be wrong: `createMarkerKindOf`
 * takes a per-host **whitelist** instead, so a host that doesn't list an
 * attribute reports `null` for it exactly as before.
 *
 * Order matters: `walkTargetMarkers` (`domTargetWalk.ts`) reports markers
 * nearest-first, so within a single element the first *listed* attribute
 * that is present wins. Each host's whitelist must preserve that host's
 * original check order — reordering could change which kind an element
 * carrying two markers reports (ADR-28's proximity contract).
 *
 * Deliberately its own module, importing neither `obsidian` (ADR-28: this
 * module deals only in attribute strings and `TargetKind`) nor any host —
 * `AnvilView.ts` and `SidebarView.ts` import from here, never the reverse.
 *
 * @ref docs/XDD/specs/008-codex-surface/solution.md — ADR-28
 */

import type { TargetKind } from "./navigationController";
import type { MarkerKindOf } from "./domTargetWalk";
import { CODEX_CARD_BODY_ATTR, CODEX_COLLECTION_ATTR } from "codex/codexTab";
import { CODEX_CARD_SELECT_ATTR } from "codex/cardSelector";
import { CODEX_CHANGE_TAG_ATTR } from "codex/codexEmptyState";
import { CODEX_HINT_DISMISS_ATTR } from "codex/basesHint";

/** Every marker attribute either host can emit, mapped to its `TargetKind`. */
export const MARKER_VOCABULARY: Record<string, TargetKind> = {
	"data-sf-link": "name",
	[CODEX_CARD_BODY_ATTR]: "cardBody",
	"data-ws-layout": "structuralControl",
	"data-ws-tlmode": "structuralControl",
	[CODEX_COLLECTION_ATTR]: "structuralControl",
	[CODEX_CARD_SELECT_ATTR]: "structuralControl",
	"data-sf-section-toggle": "structuralControl",
	[CODEX_CHANGE_TAG_ATTR]: "structuralControl",
	[CODEX_HINT_DISMISS_ATTR]: "structuralControl",
	"data-sf-plotline": "structuralControl",
	"data-sf-nav": "structuralControl",
};

/**
 * Build a `MarkerKindOf` recognising only `recognisedMarkers` — checked in
 * the array's own order, first match wins. An attribute present on `el` but
 * absent from `recognisedMarkers` is treated as unknown, same as today's
 * per-host if-chains that simply never mention it.
 */
export function createMarkerKindOf(recognisedMarkers: readonly string[]): MarkerKindOf {
	return (el: HTMLElement): TargetKind | null => {
		for (const attr of recognisedMarkers) {
			if (el.hasAttribute(attr)) return MARKER_VOCABULARY[attr] ?? null;
		}
		return null;
	};
}

/**
 * `AnvilView`'s recognised markers, in its original check order (was
 * `AnvilView._markerKindOf`, `AnvilView.ts:563-574` pre-factoring).
 */
export const ANVIL_MARKERS: readonly string[] = [
	"data-sf-link",
	CODEX_CARD_BODY_ATTR,
	"data-ws-layout",
	"data-ws-tlmode",
	CODEX_COLLECTION_ATTR,
	CODEX_CARD_SELECT_ATTR,
	"data-sf-section-toggle",
	CODEX_CHANGE_TAG_ATTR,
	CODEX_HINT_DISMISS_ATTR,
];

/**
 * `SidebarView`'s recognised markers, in its original check order (was
 * `SidebarView._markerKindOf`, `SidebarView.ts:724-731` pre-factoring). No
 * selection store to act on the Codex collection pill, so it stays off this
 * list — see this module's docstring.
 */
export const SIDEBAR_MARKERS: readonly string[] = [
	"data-sf-section-toggle",
	"data-sf-plotline",
	"data-sf-nav",
	"data-sf-link",
	CODEX_CARD_BODY_ATTR,
];

/**
 * `CardBasesView`'s recognised markers — a standalone `.base` has no Anvil/
 * Workbench chrome around a Card, only `buildCardWrapper`'s own two markers
 * (`codex/cardWrapper.ts`): a name nested inside its card body. None of the
 * structural controls apply here (no section toggles, no Card selector, no
 * Codex collection pills — those belong to the Codex tab's own chrome, which
 * this surface never renders), so this list is deliberately the shortest of
 * the three.
 */
export const CARD_BASES_MARKERS: readonly string[] = [
	"data-sf-link",
	CODEX_CARD_BODY_ATTR,
];
