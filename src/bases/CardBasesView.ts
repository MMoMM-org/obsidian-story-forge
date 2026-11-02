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
import { BasesView, TFile } from "obsidian";
import { basesCardEntry, type CardEntry, type CardRegistry, type CardRenderer } from "codex/cardRegistry";
import { buildCardWrapper, CARD_BODY_ATTR } from "codex/cardWrapper";
import { createLinkedImageResolver } from "panel/assetResolver";
import { createCardTileField } from "codex/cardTileField";
import type { FileClassCache } from "fileclass/fileClassVault";
import { createNavigationController, type LinkClickAction } from "navigation/navigationController";
import { walkTargetMarkers, type MarkerKindOf } from "navigation/domTargetWalk";
import { linkContextMenuHandler } from "navigation/linkContextMenu";
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
	/**
	 * The plugin's FileClass cache, so a Card's tile follows the `Media`-typed field
	 * as the panel's does (T6.2b). Optional: absent, Cards use the shipped names.
	 */
	fileClasses?: FileClassCache;
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

	/** Bases has handed this view data: until then `this.data` may not exist. */
	private drawn = false;

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
		// Bases repaints for its query's results, and a FileClass is rarely one of
		// them, so a change of field type would otherwise wait for the next repaint.
		if (deps.fileClasses) {
			this.register(deps.fileClasses.subscribe(() => { if (this.drawn) this.onDataUpdated(); }));
		}
		// Right-click on a link (name or relation pill): Obsidian's own file menu.
		// On the persistent container (the grid is rebuilt every repaint), so it is
		// registered once and released with the view.
		this.registerDomEvent(
			containerEl,
			"contextmenu",
			linkContextMenuHandler(deps.app, containerEl, (link) => this._resolveLinkFile(link)),
		);
	}

	/**
	 * The file a `data-sf-link` element names. A card name stamps its note's
	 * vault path; a relation pill stamps a LINK target (a basename), resolved
	 * the way Obsidian does, relative to the card's own note.
	 */
	private _resolveLinkFile(link: HTMLElement): TFile | null {
		const target = link.getAttribute("data-sf-link");
		if (!target) return null;
		const { vault, metadataCache } = this.deps.app;
		const source = link.closest(`[${CARD_BODY_ATTR}]`)?.getAttribute(CARD_BODY_ATTR) ?? "";
		const file = vault.getAbstractFileByPath(target) ?? metadataCache.getFirstLinkpathDest(target, source);
		return file instanceof TFile ? file : null;
	}

	/** The vault path a click on `nearest` should open, or `null` when it names nothing. */
	private _openPath(nearest: HTMLElement | null): string | null {
		const link = nearest?.getAttribute("data-sf-link");
		if (link === null || link === undefined) return nearest?.getAttribute(CARD_BODY_ATTR) ?? null;
		const cardPath = nearest?.closest(`[${CARD_BODY_ATTR}]`)?.getAttribute(CARD_BODY_ATTR);
		// A card's own name already carries its path; a pill carries a link target.
		return link === cardPath ? link : (this._resolveLinkFile(nearest!)?.path ?? null);
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
		this.drawn = true;

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

		const tileField = this.tileFieldFor(entries);
		for (const entry of entries) {
			grid.appendChild(this.renderEntry(entry, card, tileField));
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
			const path = this._openPath(nearest);
			if (path) this.deps.onEntryClick(path);
		}
	}

	/**
	 * One entry, drawn through the resolved Card. Closes the T4.5 GATE: presence
	 * comes from `metadataCache`'s frontmatter (ground truth), not from
	 * `getValue()` alone, so a blank-but-present property never reads as absent.
	 */
	private renderEntry(
		entry: BasesEntry,
		card: CardRenderer,
		tileField: (entry: CardEntry) => string | null,
	): HTMLElement {
		const frontmatter: Record<string, unknown> | null =
			this.deps.app.metadataCache.getFileCache(entry.file)?.frontmatter ?? null;
		const cardEntry: CardEntry = basesCardEntry(entry, frontmatter);

		return buildCardWrapper(cardEntry, card, {
			compact: false,
			resolveAsset: createLinkedImageResolver(this.deps.app, cardEntry.path),
			tileField,
		});
	}

	/** This pass's tile-field resolver, over the entries about to be drawn. */
	private tileFieldFor(entries: readonly BasesEntry[]): (entry: CardEntry) => string | null {
		const files = new Map(entries.map((e) => [e.file.path, e.file] as const));
		return createCardTileField(this.deps.fileClasses, (path) => files.get(path) ?? null);
	}
}
