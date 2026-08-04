/**
 * cardWrapper — the shared card-wrapper DOM builder both card backends draw
 * through (ADR-30's "one CardRenderer, two backends" promise, extended to the
 * WRAPPER around a Card's own markup, not just its content).
 *
 * `codexTab.ts`'s native `renderEntry` and `CardBasesView.ts`'s Bases
 * `renderEntry` used to duplicate the exact same wrapper: the `sf-cx-card`
 * class, the card-body marker (`data-sf-card-body`), `role="button"`,
 * `tabindex="0"`, the `CardRenderDeps` assembly (in particular `nameEl`), and
 * the `aria-label` set from the rendered entry's name. Two independently
 * hand-rolled copies of one piece of markup is exactly the kind of thing that
 * silently diverges — this module is the single place it is built now, so
 * `renderCodexTab` and `CardBasesView` produce identical wrapper markup by
 * construction rather than by two call sites happening to agree.
 *
 * CON-6 FIREWALL: this module has ZERO Bases typings — it only ever sees the
 * already-adapted `CardEntry` (see `cardRegistry.ts`'s `nativeCardEntry` /
 * `basesCardEntry`), never a `BasesEntry`. That is what lets `src/bases/`
 * import it without breaking the firewall direction (`src/bases/` may depend
 * on `src/codex/`, never the reverse).
 *
 * **Marker nesting is load-bearing (ADR-28).** The F2 precedence AC — "a
 * name's behaviour wins over the card's" — holds purely because the `name`
 * marker (`data-sf-link`, stamped by `buildNameEl` below) nests INSIDE the
 * card-body marker (`data-sf-card-body`, stamped on the wrapper itself). Do
 * not flatten the two onto one element, and do not hoist the name outside the
 * wrapper. A Card is never handed the marker vocabulary directly — only a
 * `nameEl` builder (`CardRenderDeps.nameEl`) — so no Card, built-in or
 * imported, can get the nesting wrong.
 *
 * Uses `activeDocument` (Obsidian's popout-window-aware document reference),
 * the same discipline `codexGrid.ts` (this module's precedent as a pure-DOM
 * helper) keeps.
 *
 * @ref docs/XDD/specs/008-codex-surface/solution.md — ADR-28, ADR-30, CON-6
 */

import type { CardEntry, CardRenderDeps, CardRenderer } from "./cardRegistry";

// Obsidian's popout-window-aware document — the mock polyfills this to
// globalThis.document in jsdom test environments (see test/__mocks__/obsidian.ts).
declare const activeDocument: Document;

// ---------------------------------------------------------------------------
// Marker attributes
// ---------------------------------------------------------------------------

/**
 * Marks a card / row body. Hosts classify it as `"cardBody"`; its value is the
 * entry's vault path, so the host can resolve the file without the controller
 * ever seeing one. Never placed on the same element as `data-sf-link` — the
 * two must nest, not co-occur (see the module docstring).
 */
export const CARD_BODY_ATTR = "data-sf-card-body";

/** The cross-surface "name" marker, stamped by `buildNameEl` below. */
const CARD_NAME_ATTR = "data-sf-link";

// ---------------------------------------------------------------------------
// Wrapper builder
// ---------------------------------------------------------------------------

/** What a caller supplies beyond the wrapper itself — everything backend-specific. */
export interface CardWrapperDeps {
	/** Workbench density (S95). Passed straight through to `CardRenderDeps.compact`. */
	readonly compact: boolean;
	/**
	 * Backend-specific asset resolution — see `CardRenderDeps.resolveAsset`.
	 * Declared as a property (not a method signature) so passing it through
	 * unchanged in `buildCardWrapper` below never trips
	 * `@typescript-eslint/unbound-method` — there is no `this` to lose.
	 */
	readonly resolveAsset: (raw: string) => string;
}

/**
 * Build one card's wrapper element and draw `card` into it.
 *
 * Stamps the card-body marker, `role="button"`, `tabindex="0"`, assembles the
 * `CardRenderDeps` a Card renders with (injecting the shared `nameEl` builder
 * so the name marker nests correctly), calls `card.render`, then stamps
 * `aria-label` from the rendered entry's name. Callers own placing the
 * returned element and emptying their container beforehand (CON-4) — this
 * function only ever builds one wrapper.
 */
export function buildCardWrapper(
	entry: CardEntry,
	card: CardRenderer,
	deps: CardWrapperDeps,
): HTMLElement {
	const cardEl = activeDocument.createElement("div");
	cardEl.className = "sf-cx-card";
	cardEl.setAttribute(CARD_BODY_ATTR, entry.path);
	cardEl.setAttribute("role", "button");
	cardEl.setAttribute("tabindex", "0");

	const renderDeps: CardRenderDeps = {
		compact: deps.compact,
		nameEl: buildNameEl,
		resolveAsset: deps.resolveAsset,
	};

	card.render(entry, cardEl, renderDeps);
	cardEl.setAttribute("aria-label", entry.name);
	return cardEl;
}

/** The entry's name element, carrying the `name` marker (`data-sf-link`). */
function buildNameEl(entry: CardEntry): HTMLElement {
	const name = activeDocument.createElement("span");
	name.className = "sf-cx-name";
	name.setAttribute(CARD_NAME_ATTR, entry.path);
	name.textContent = entry.name;
	return name;
}
