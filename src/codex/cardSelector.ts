/**
 * cardSelector — the Codex header's Card selector (T4.4, S91/S97): a trigger
 * showing the active Card's label, and a dropdown grouped "Built-in" / "Yours".
 *
 * Extracted out of `codexTab.ts` (a code-quality follow-up on the same task
 * that added it) so T4.6's empty state and Bases hint don't land in a file
 * that already carries markup building, collection defaults and selection
 * state. Depends only on `CardRenderer` (`cardRegistry.ts`) and the built-in
 * registry (`builtinCards.ts`) — the same shape as that earlier split.
 *
 * The Built-in/Yours split is derived by joining the registry's `list()`
 * against `BUILT_IN_CARD_IDS` rather than a `provenance` field — T4.2
 * deliberately kept that off the frozen `CardRenderer` contract.
 *
 * Picking an option carries no behaviour of its own: it only stamps
 * `CODEX_CARD_SELECT_ATTR`, the same "contribute a marker, let the host
 * decide" discipline the collection pills follow in `codexTab.ts` (ADR-28) —
 * the host resolves the active collection and persists the choice.
 *
 * @ref docs/XDD/specs/008-codex-surface/mockups.html — S91 (closed), S97 (open)
 * @ref docs/XDD/specs/008-codex-surface/requirements.md — Feature F4
 * @ref docs/XDD/specs/008-codex-surface/solution.md — ADR-28, ADR-30
 */

import type { CardRenderer } from "./cardRegistry";
import { BUILT_IN_CARD_IDS, CODEX_CARD_REGISTRY } from "./builtinCards";

// Obsidian's popout-window-aware document — the mock polyfills this to
// globalThis.document in jsdom test environments (see test/__mocks__/obsidian.ts).
declare const activeDocument: Document;

/**
 * Marks a Card option in the selector dropdown. Hosts classify it as
 * `"structuralControl"`; its value is the Card id to persist for the active
 * collection.
 */
export const CODEX_CARD_SELECT_ATTR = "data-sf-card";

/**
 * The Card selector: a trigger showing `active`'s label, and a dropdown
 * grouped "Built-in" / "Yours" (S91 closed, S97 open).
 */
export function renderCardSelector(active: CardRenderer): HTMLElement {
	const wrap = el("div", "sf-cx-cardsel");

	const trigger = activeDocument.createElement("button");
	trigger.type = "button";
	trigger.className = "sf-cx-cardsel-trigger";
	trigger.setAttribute("aria-haspopup", "listbox");
	trigger.setAttribute("aria-expanded", "false");
	trigger.append("Card: ");
	const label = activeDocument.createElement("b");
	label.textContent = active.label;
	trigger.appendChild(label);
	trigger.append(" ▾");
	wrap.appendChild(trigger);

	const dd = el("div", "sf-cx-cardsel-dd");
	dd.setAttribute("role", "listbox");
	dd.hidden = true;
	wrap.appendChild(dd);

	const all = CODEX_CARD_REGISTRY.list();
	const builtIns = all.filter((c) => BUILT_IN_CARD_IDS.has(c.id));
	const imported = all.filter((c) => !BUILT_IN_CARD_IDS.has(c.id));

	appendCardGroup(dd, "Built-in", builtIns, active.id, false);
	if (imported.length > 0) {
		dd.appendChild(activeDocument.createElement("hr"));
		appendCardGroup(dd, "Yours", imported, active.id, true);
	}

	// Local UI-only state (open/closed): it carries no navigation meaning
	// (ADR-28), so it never joins the host's marker vocabulary. This whole
	// subtree is torn down on every render (`renderCodexTab`'s `empty(container)`
	// at the top), so a plain listener is GC'd with it — the same documented
	// ADR-2 exception for a plain, subtree-scoped listener.
	trigger.addEventListener("click", () => {
		const opening = dd.hidden;
		dd.hidden = !opening;
		trigger.setAttribute("aria-expanded", String(opening));
	});

	return wrap;
}

/** Append one heading + its Card options to the selector dropdown. */
function appendCardGroup(
	dd: HTMLElement,
	heading: string,
	cards: readonly CardRenderer[],
	activeId: string,
	imported: boolean,
): void {
	const h = el("div", "sf-cx-cardsel-heading");
	h.textContent = heading;
	dd.appendChild(h);
	for (const card of cards) {
		const item = el("span", "sf-cx-cardsel-item");
		if (imported) item.classList.add("sf-cx-cardsel-item--usr");
		const isSelected = card.id === activeId;
		if (isSelected) item.classList.add("sf-cx-cardsel-item--sel");
		item.setAttribute("role", "option");
		item.setAttribute("aria-selected", String(isSelected));
		item.setAttribute("tabindex", "0");
		item.setAttribute(CODEX_CARD_SELECT_ATTR, card.id);
		item.textContent = card.label;
		dd.appendChild(item);
	}
}

function el(tag: "div" | "span", cls: string): HTMLElement {
	const node = activeDocument.createElement(tag);
	node.className = cls;
	return node;
}
