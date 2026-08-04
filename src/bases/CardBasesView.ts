/**
 * CardBasesView — one Bases view per built-in Card (Hero/Table/Compact), so a
 * user can pick "Story Forge Hero" etc. directly as a view type inside their
 * own `.base` file (T4.5; ADR-0001 §Decision 2, ADR-30 — one `CardRenderer`,
 * two backends).
 *
 * `CodexBasesView` (the polymorphic grid registered as `CODEX_VIEW_ID`) draws
 * a plain table via `codexGrid.ts` and never touches `CardRenderer` at all.
 * This class is the OTHER half of ADR-30: it draws through the exact same
 * `heroCard`/`tableCard`/`compactCard` the native Codex tab uses
 * (`codexTab.ts`'s `renderEntry`), so a Card's markup cannot diverge between
 * "inside the Anvil" and "inside a user's own `.base`".
 *
 * **Registry, not a captured renderer.** The factory that constructs this
 * class is handed to `registerBasesView` once at plugin load
 * (`BasesAdapter.ts`), before `CODEX_CARD_REGISTRY` is guaranteed to hold
 * every Card an import flow might still add. A view that captured a
 * `CardRenderer` reference at registration time would therefore capture
 * nothing durable — it must hold the `CardRegistry` and call `resolve(cardId)`
 * at **draw time** (`onDataUpdated`), same discipline `cardRegistry.ts`'s
 * module doc requires of every Bases factory.
 *
 * **The blank-vs-absent gap (T4.5 GATE).** `BasesEntry.getValue()` cannot
 * distinguish "absent" from "present but blank" — both come back `null`. This
 * class is the one place in `src/bases/` that holds an `App`, so it is the
 * one place that can close the gap: `renderEntry` below reads
 * `metadataCache.getFileCache(entry.file)?.frontmatter` for ground-truth
 * presence and hands it to `basesCardEntry` alongside the entry, so
 * `CardField.present` agrees with the native backend (`nativeCardEntry`).
 *
 * ADR-2: never cache a `BasesEntry` between calls — read `this.data.data`
 * fresh on every `onDataUpdated`, the same discipline `CodexBasesView` keeps.
 *
 * @ref docs/XDD/adr/0001-bases-integration-strategy.md — Decision 2
 * @ref docs/XDD/specs/008-codex-surface/solution.md — ADR-2, ADR-30
 * @ref docs/XDD/specs/008-codex-surface/plan/phase-4.md — T4.5, the GATE callout
 */

import type { App, BasesEntry, QueryController } from "obsidian";
import { BasesView } from "obsidian";
import {
	basesCardEntry,
	type CardEntry,
	type CardRegistry,
	type CardRenderDeps,
	type CardRenderer,
} from "codex/cardRegistry";
import { createAssetResolver } from "panel/assetResolver";

// Obsidian's popout-window-aware document — the mock polyfills this to
// globalThis.document in jsdom test environments (see test/__mocks__/obsidian.ts).
declare const activeDocument: Document;

// ---------------------------------------------------------------------------
// Marker attributes — reused from codexTab.ts's vocabulary (same meaning,
// declared locally to avoid a src/bases/ → src/codex/codexTab.ts import for
// two string literals; codexTab.ts remains the single source for the Anvil's
// own NavigationController wiring, which this standalone view does not use).
// ---------------------------------------------------------------------------

const CARD_BODY_ATTR = "data-sf-card-body";
const NAME_ATTR = "data-sf-link";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Dependencies injected at construction time (mirrors CodexBasesViewDeps). */
export interface CardBasesViewDeps {
	app: App;
	/** Every registered Card — resolved by id at DRAW time, never captured. */
	registry: CardRegistry;
	/** Which Card this view type draws with (`"hero"` / `"table"` / `"compact"`). */
	cardId: string;
	/** Called when the user clicks an entry. Receives the vault-relative file path. */
	onEntryClick: (path: string) => void;
}

// ---------------------------------------------------------------------------
// CardBasesView
// ---------------------------------------------------------------------------

/**
 * One Bases view type per built-in Card. `viewId` is supplied by the caller
 * (`BasesAdapter.ts` registers three instances — hero/table/compact — from one
 * class) so the three do not need three near-identical subclasses.
 */
export class CardBasesView extends BasesView {
	/** View type discriminant (required by BasesView abstract contract). */
	readonly type: string;

	/** The element this view renders into (supplied by the Bases runtime). */
	private readonly containerEl: HTMLElement;

	/** Injected deps (app + registry + which Card + click handler). */
	private readonly deps: CardBasesViewDeps;

	/** CON-4: set to true on unload; guards onDataUpdated against post-teardown repaints. */
	private disposed = false;

	constructor(
		viewId: string,
		controller: QueryController,
		containerEl: HTMLElement,
		deps: CardBasesViewDeps,
	) {
		super(controller);
		this.type = viewId;
		this.containerEl = containerEl;
		this.deps = deps;
		// CON-4: mark disposed when Obsidian unloads this Component.
		this.register(() => { this.disposed = true; });
	}

	/**
	 * Called by the Bases runtime whenever query results change.
	 *
	 * ADR-2 invariant: read this.data.data FRESH every call — never store a
	 * BasesEntry reference between calls.
	 *
	 * CON-4: empty the container before repaint.
	 */
	onDataUpdated(): void {
		// CON-4: no stale content bleed after teardown.
		if (this.disposed) return;

		// CON-4: empty before repaint.
		this.containerEl.innerHTML = "";

		// Resolve at DRAW time, never captured at registration (module doc).
		const card = this.deps.registry.resolve(this.deps.cardId);

		const grid = activeDocument.createElement("div");
		grid.className = `sf-cx-grid sf-cx-grid--${card.id}`;
		this.containerEl.appendChild(grid);

		// ADR-2: read this.data FRESH — no cached references.
		const entries: BasesEntry[] = this.data.data;

		if (entries.length === 0) {
			const empty = activeDocument.createElement("div");
			empty.setAttribute("data-empty-state", card.id);
			empty.className = "sf-cx-empty";
			empty.textContent = "No entries found in this base.";
			grid.appendChild(empty);
			return;
		}

		for (const entry of entries) {
			grid.appendChild(this.renderEntry(entry, card));
		}

		// Single delegated click listener — mirrors codexGrid.ts's pattern.
		grid.addEventListener("click", (evt) => {
			const target = evt.target as HTMLElement | null;
			const cardEl = target?.closest(`[${CARD_BODY_ATTR}]`) as HTMLElement | null;
			if (!cardEl) return;
			const path = cardEl.getAttribute(CARD_BODY_ATTR);
			if (path) this.deps.onEntryClick(path);
		});
	}

	/**
	 * One entry, drawn through the resolved Card. Closes the T4.5 GATE: presence
	 * comes from `metadataCache`'s frontmatter (ground truth), not from
	 * `getValue()` alone, so a blank-but-present property never reads as absent.
	 */
	private renderEntry(entry: BasesEntry, card: CardRenderer): HTMLElement {
		const frontmatter: Record<string, unknown> | null =
			this.deps.app.metadataCache.getFileCache(entry.file)?.frontmatter ?? null;
		const cardEntry: CardEntry = basesCardEntry(entry, frontmatter);

		const cardEl = activeDocument.createElement("div");
		cardEl.className = "sf-cx-card";
		cardEl.setAttribute(CARD_BODY_ATTR, cardEntry.path);
		cardEl.setAttribute("role", "button");
		cardEl.setAttribute("tabindex", "0");

		const deps: CardRenderDeps = {
			compact: false,
			nameEl: buildNameEl,
			resolveAsset: createAssetResolver(this.deps.app, cardEntry.path),
		};

		card.render(cardEntry, cardEl, deps);
		cardEl.setAttribute("aria-label", cardEntry.name);
		return cardEl;
	}
}

/** The entry's name element, carrying the `name` marker (mirrors codexTab.ts's buildNameEl). */
function buildNameEl(entry: CardEntry): HTMLElement {
	const name = activeDocument.createElement("span");
	name.className = "sf-cx-name";
	name.setAttribute(NAME_ATTR, entry.path);
	name.textContent = entry.name;
	return name;
}
