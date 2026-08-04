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
 * (`codexTab.ts`'s `renderEntry`), so a Card's CONTENT cannot diverge between
 * "inside the Anvil" and "inside a user's own `.base`" — both backends call
 * the identical `CardRenderer.render()`. The WRAPPER around that content (the
 * `sf-cx-card` element, its marker/role/tabindex attributes, `aria-label`, and
 * the `nameEl` a Card is handed) is drawn identically too, but only because
 * both backends build it through the shared `buildCardWrapper`
 * (`codex/cardWrapper.ts`) rather than each hand-rolling its own — see that
 * module's doc comment for why the two used to be able to drift apart.
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
import { basesCardEntry, type CardEntry, type CardRegistry, type CardRenderer } from "codex/cardRegistry";
import { buildCardWrapper, CARD_BODY_ATTR } from "codex/cardWrapper";
import { createAssetResolver } from "panel/assetResolver";
import { createNavigationController, type LinkClickAction } from "navigation/navigationController";
import { walkTargetMarkers, type MarkerKindOf } from "navigation/domTargetWalk";
import { createMarkerKindOf, CARD_BASES_MARKERS } from "navigation/markerVocabulary";

// Obsidian's popout-window-aware document — the mock polyfills this to
// globalThis.document in jsdom test environments (see test/__mocks__/obsidian.ts).
declare const activeDocument: Document;

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
	/**
	 * Reads the live configured name-click action (`AnvilView`/`SidebarView`'s
	 * own `getLinkClickAction`, ADR-28). Optional, defaulting to `"drill"` —
	 * the same fallback those two hosts use when unconfigured — so existing
	 * callers (`BasesAdapter.ts`) do not have to change to keep building.
	 * Governs only the `name` marker's plain-vs-modifier split; the `cardBody`
	 * marker's rule (plain ⇒ inert, modifier ⇒ open) is fixed and ignores it.
	 */
	getLinkClickAction?: () => LinkClickAction;
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

	/**
	 * ADR-28's marker vocabulary, scoped to what this surface's markup can
	 * ever carry (`CARD_BASES_MARKERS` — `navigation/markerVocabulary.ts`).
	 * Reused rather than hand-rolled so this surface stays governed by the
	 * same attribute→kind table `AnvilView`/`SidebarView` read.
	 */
	private readonly _markerKindOf: MarkerKindOf = createMarkerKindOf(CARD_BASES_MARKERS);

	/** `deps.getLinkClickAction`, defaulted to `"drill"` — see that field's doc comment. */
	private readonly getLinkClickAction: () => LinkClickAction;

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
		this.getLinkClickAction = deps.getLinkClickAction ?? ((): LinkClickAction => "drill");
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

		// Single delegated click listener — mirrors codexGrid.ts's pattern, now
		// routed through the shared NavigationController (see _onCardClick).
		grid.addEventListener("click", (evt) => {
			this._onCardClick(evt.target, evt.metaKey || evt.ctrlKey, grid);
		});
	}

	/**
	 * ADR-28: classify-then-act via the shared `NavigationController` — the
	 * same matrix `AnvilView`/`SidebarView` already read. Before this, every
	 * click here collapsed into one unconditional `onEntryClick` regardless of
	 * target or modifier (the gap recorded at the Phase 4 close-out): a Card
	 * rendered inside a user's own `.base` looked identical to one rendered in
	 * the Anvil but behaved nothing alike. `buildCardWrapper` already emits
	 * the same name-nested-in-card-body markup both surfaces read, so only
	 * the handling was missing.
	 *
	 * DEFERRED, DELIBERATELY: "inspect" stays a no-op. A standalone `.base`
	 * has no Anvil, no editor pane (that lands with Phase 5's T5.1, not yet
	 * built), and no tab to stay within — there is nowhere for an inspection
	 * to be shown at all. Falling back to a file-open on a plain click would
	 * silently make plain-click and modifier-click identical again — exactly
	 * the bug this closes — so only the "openNote" outcome is enacted below.
	 */
	private _onCardClick(target: EventTarget | null, modifier: boolean, root: HTMLElement): void {
		if (!(target instanceof HTMLElement)) return;

		const { markers, nearest } = walkTargetMarkers(target, root, (el) => this._markerKindOf(el));

		const controller = createNavigationController({
			getLinkClickAction: this.getLinkClickAction,
			inspect: (): void => {
				// Deferred — see this method's doc comment. Intentionally empty.
			},
		});
		const outcome = controller.handle(markers, modifier);

		if (outcome.action === "openNote") {
			const path = nearest?.getAttribute("data-sf-link") ?? nearest?.getAttribute(CARD_BODY_ATTR);
			if (path) this.deps.onEntryClick(path);
		}
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

		return buildCardWrapper(cardEntry, card, {
			compact: false,
			resolveAsset: createAssetResolver(this.deps.app, cardEntry.path),
		});
	}
}
