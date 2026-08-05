/**
 * codexTab — the Codex tab body: collection pills over an entry grid (S91).
 *
 * One body, two hosts: the Anvil renders it full width, the Workbench renders
 * it `compact` once Phase 7 binds a collection to that surface. The module owns
 * *markup and selection*, never behaviour — per ADR-28 a surface contributes
 * **target markers** and the shared `NavigationController` decides what a click
 * does. That is why the pills carry `data-sf-collection` (which the host maps
 * to `"structuralControl"` and enacts in its `_operateControl`) instead of
 * wiring their own listeners: a pill that handled its own click would be the
 * one control in the plugin exempt from the F2 matrix. Only the Anvil enacts
 * it today — the Workbench gets its pills with the surface binding in Phase 7.
 *
 * **Marker nesting is load-bearing, not incidental.** A card stamps
 * `data-sf-card-body` on its outer element and `data-sf-link` on the name
 * *inside* it. The PRD's one explicit precedence AC — "the name's behaviour
 * wins over the card's" — is satisfied purely by that nesting: the shared
 * ancestor walk reports markers nearest-event-target-first, so a click on the
 * name yields `["name", "cardBody"]` and a click anywhere else in the body
 * yields `["cardBody"]`. Flatten the two onto one element, or hoist the name
 * outside the body, and the AC breaks with nothing else to catch it. There is
 * deliberately no special case anywhere for this (ADR-28). The wrapper that
 * stamps both markers is `cardWrapper.ts`'s `buildCardWrapper` — the same
 * builder `CardBasesView` (`src/bases/`) draws with, so this nesting cannot
 * diverge between the two backends.
 *
 * This module owns the body, the pill row and the selection store
 * (`CodexSelectionStore`); `renderEntry` adapts each note to a `CardEntry`
 * (`nativeCardEntry`) and hands it to `buildCardWrapper` alongside the active
 * Card (registry-resolved, Hero by default), and a resolution with no notes
 * delegates entirely to `codexEmptyState.ts`'s S98 empty state (heading, the
 * tag it looked for, `Change tag` + `What are FileClasses?`) rather than
 * rendering anything of its own for that case.
 *
 * @ref docs/mockups/anvil-workbench-codex.html — S91
 * @ref docs/XDD/specs/008-codex-surface/requirements.md — Features F2, F3, F7
 * @ref docs/XDD/specs/008-codex-surface/solution.md — ADR-28, Building Block View
 */

import { resolveCollection, type IndexedNote } from "./collectionResolver";
import { nativeCardEntry, type CardRenderer } from "./cardRegistry";
import { buildCardWrapper, CARD_BODY_ATTR } from "./cardWrapper";
import { CODEX_CARD_REGISTRY } from "./builtinCards";
import { renderCardSelector } from "./cardSelector";
import { renderCodexEmptyState } from "./codexEmptyState";
import { renderBasesHint, BASES_DISABLED_HINT_ID } from "./basesHint";
import type { BasesCapability } from "bases/basesCapability";

// Obsidian's popout-window-aware document — the mock polyfills this to
// globalThis.document in jsdom test environments (see test/__mocks__/obsidian.ts).
declare const activeDocument: Document;

// ---------------------------------------------------------------------------
// Marker attributes — the single declaration site
// ---------------------------------------------------------------------------

/**
 * Marks a collection pill. Hosts classify it as `"structuralControl"` and read
 * the attribute's value (the collection id) to enact the switch.
 */
export const CODEX_COLLECTION_ATTR = "data-sf-collection";

/**
 * Marks a card / row body. Hosts classify it as `"cardBody"`; its value is the
 * entry's vault path, so the host can resolve the file without the controller
 * ever seeing one. Never placed on the same element as `data-sf-link` — the two
 * must nest, not co-occur (see the module docstring). Re-exported under this
 * name for existing importers (`AnvilView.ts`, `SidebarView.ts`,
 * `navigation/markerVocabulary.ts`); `cardWrapper.ts` is the single place that
 * actually stamps it, shared with `CardBasesView` (`src/bases/`).
 */
export const CODEX_CARD_BODY_ATTR = CARD_BODY_ATTR;

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

/** A collection as the tab renders it: a pill, a tag, and whether it is on. */
export interface CodexCollection {
	/** Stable id — the pill's `data-sf-collection` value and the selection key. */
	readonly id: string;
	/** Sentence-case pill label (obsidianmd UI-text rule). */
	readonly label: string;
	/** The tag whose notes belong to this collection (no leading `#`). */
	readonly tag: string;
	/** A disabled collection has no pill at all (PRD/F7) — it is not merely dimmed. */
	readonly enabled: boolean;
}

/**
 * The four collections that ship enabled (PRD/F3 AC). Tags match the seed
 * vault's canon vocabulary. Phase 7's Library replaces this default with the
 * store-backed list; until then it is what every host passes.
 */
export const BUILT_IN_COLLECTIONS: readonly CodexCollection[] = [
	{ id: "character", label: "Characters", tag: "canon/character", enabled: true },
	{ id: "location", label: "Locations", tag: "canon/location", enabled: true },
	{ id: "object", label: "Objects", tag: "canon/object", enabled: true },
	{ id: "lore", label: "Lore", tag: "canon/lore", enabled: true },
];

// ---------------------------------------------------------------------------
// Selection state
// ---------------------------------------------------------------------------

/**
 * Which collection this host has selected, surviving the body re-renders that
 * follow-the-active-note triggers.
 *
 * Modelled on `CollapseStore` (a small class the host owns for its lifetime and
 * `clear()`s on close) but deliberately **without** its scope key: collapse is
 * per-book because a group only exists inside one book, whereas a collection is
 * global — re-selecting Characters every time the focused book changed would be
 * a bug, not a feature. One store per host instance keeps two open Anvils
 * independent.
 */
export class CodexSelectionStore {
	private selected: string | null = null;

	/**
	 * The collection to render: the last explicit pick while it is still
	 * enabled, otherwise the first enabled one (PRD/F3 — "the first enabled
	 * collection is selected"). `null` only when nothing is enabled.
	 */
	resolve(collections: readonly CodexCollection[]): CodexCollection | null {
		const enabled = collections.filter((c) => c.enabled);
		return enabled.find((c) => c.id === this.selected) ?? enabled[0] ?? null;
	}

	/**
	 * Record an explicit pick. Unknown ids are harmless — `resolve` falls back.
	 *
	 * **Invariant every caller must keep:** a `select()` call must be
	 * synchronously followed by a re-render. `_operateControl`'s Card-select
	 * branch (`AnvilView.ts`) relies on this — it reads `resolve(...)` right
	 * after a pick to know which collection to persist the choice against, and
	 * that read is only correct if nothing has gone stale in between. A second
	 * call site that defers its render (e.g. behind a debounce) would still
	 * compile and still pass `CodexSelectionStore`'s own tests, but would
	 * silently break per-collection Card memory.
	 */
	select(collectionId: string): void {
		this.selected = collectionId;
	}

	/** Drop the selection (teardown). */
	clear(): void {
		this.selected = null;
	}
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

export interface CodexTabOptions {
	/** Every collection the host offers, in display order — disabled ones included. */
	readonly collections: readonly CodexCollection[];
	/** The host's selection store; consulted, never written here. */
	readonly selection: CodexSelectionStore;
	/** The current note index (path + normalized tags) — see `noteIndex.ts`. */
	readonly index: readonly IndexedNote[];
	/** Folders excluded from every collection (CON-7: exclusion only). */
	readonly excludedFolders: readonly string[];
	/**
	 * Frontmatter for a resolved note path — Cards read entries built from this
	 * (T4.3, `nativeCardEntry`). Optional: a host that has not wired this yet
	 * still renders — every field simply reads as absent (`.miss`) rather than
	 * throwing.
	 */
	readonly frontmatterFor?: (path: string) => Record<string, unknown> | null;
	/**
	 * Resolve a raw frontmatter asset path (`portrait`/`image`) for the note at
	 * `sourcePath` to something an `<img src>` can use (T4.3,
	 * `panel/assetResolver.ts`'s `createAssetResolver`). Optional: defaults to
	 * the identity function, so a host without vault-relative image resolution
	 * still renders (plain URLs pass through; a vault path just would not
	 * resolve to a resource URL).
	 */
	readonly resolveAsset?: (sourcePath: string, raw: string) => string;
	/**
	 * The Card id this collection is currently rendered with. Optional:
	 * `undefined` resolves to the registry default (Hero, T4.2). The host reads
	 * this from settings (`cardByCollection`, T4.4) keyed by the active
	 * collection's id — `renderCodexTab` itself is stateless with respect to
	 * the choice, same as it already is for `selection`.
	 */
	readonly cardId?: string;
	/** Workbench form: same markup, tighter density (S95). */
	readonly compact?: boolean;
	/**
	 * ADR-36: Bases' three-way capability (`bases/basesCapability.ts`). Optional:
	 * defaults to `"enabled"` — the safe default that never shows a hint a host
	 * hasn't explicitly wired the real value for, same convention as `cardId`
	 * defaulting to the registry default rather than guessing.
	 */
	readonly basesCapability?: BasesCapability;
	/**
	 * Hint ids the user has already dismissed (`PluginSettings.dismissedHints`,
	 * T4.6). Optional: defaults to none dismissed.
	 */
	readonly dismissedHints?: readonly string[];
	/**
	 * The vault path of the entry the host's editor pane is showing (T5.1), so
	 * its card is drawn selected — S92/S99's `.hero.sel`. Optional: a host with
	 * no editor pane (or with it closed) passes nothing and no card is marked.
	 */
	readonly openPath?: string;
	/**
	 * S99's split. When supplied, the grid is placed in a left column and
	 * `renderPane` is called with the right one.
	 *
	 * The split lives HERE rather than around the whole tab body because S99
	 * draws `.cx-cats` **full width above** `.cx-split`, and that is not a
	 * cosmetic detail: the pill row wraps onto three rows inside a 236px
	 * column, and the Card selector's absolutely-positioned dropdown would be
	 * clipped by the column's own `overflow: auto` — a T4.4 control broken by a
	 * layout choice. The host still owns what the pane *is*; this module only
	 * owns where the Codex's own chrome sits relative to it.
	 */
	readonly split?: CodexTabSplit;
}

/** The host's half of S99's split: where the grid goes, and what sits beside it. */
export interface CodexTabSplit {
	/**
	 * Wrap the left column and return the element the grid is appended to —
	 * the left column itself, or something the host mounts inside it.
	 *
	 * Required, not optional: the one caller always supplies it, and an
	 * unexercised `?? left` fallback is a branch no test can reach. A host that
	 * wants no wrapper returns the column unchanged.
	 *
	 * This exists so the Anvil can mount its zoom wrapper (`.sf-zoom-wrap >
	 * .sf-zoom-scaled`) around the **grid alone**: that element carries a
	 * `transform`, and a pane inside it would scale with the grid and become
	 * the containing block for absolutely-positioned controls. The grid stays
	 * zoomable, the pane stays out of the transform.
	 */
	readonly wrapGridHost: (left: HTMLElement) => HTMLElement;
	/** Draw whatever goes beside the grid (the Anvil's editor pane) into `host`. */
	readonly renderPane: (host: HTMLElement) => void;
}

/**
 * Render the Codex tab body into `container`, replacing whatever it held.
 *
 * Returns the collection that was rendered (`null` when none is enabled) so the
 * host can keep its own header in step without re-deriving the selection.
 */
export function renderCodexTab(container: HTMLElement, opts: CodexTabOptions): CodexCollection | null {
	empty(container);

	const root = el("div", "sf-cx");
	if (opts.compact) root.classList.add("sf-cx--compact");
	container.appendChild(root);

	const active = opts.selection.resolve(opts.collections);
	const cats = renderPills(opts.collections, active);
	root.appendChild(cats);

	maybeRenderBasesHint(root, opts);

	// The pill row and the hint stay full width above the split (S99); only the
	// grid moves into the left column.
	const grid = el("div", "sf-cx-grid");
	if (opts.split) {
		const split = el("div", "sf-cx-split");
		const left = el("div", "sf-cx-split-left");
		const right = el("div", "sf-cx-split-right");
		split.appendChild(left);
		split.appendChild(right);
		root.appendChild(split);
		// `left` is in the document before `wrapGridHost` runs, so a host that
		// mounts a wrapper into it (the Anvil's zoom) builds against a parented
		// element rather than a detached one.
		opts.split.wrapGridHost(left).appendChild(grid);
		opts.split.renderPane(right);
	} else {
		root.appendChild(grid);
	}

	if (!active) {
		grid.appendChild(message("sf-cx-empty", "No collections are enabled — enable one in settings."));
		return null;
	}

	// The selector is meaningful only once a collection is active — it always
	// resolves through the registry (Hero default, ADR-30), independent of
	// whether the active collection currently has any notes to show with it.
	const card = CODEX_CARD_REGISTRY.resolve(opts.cardId);
	cats.appendChild(el("span", "sf-cx-cats-sp"));
	cats.appendChild(renderCardSelector(card));

	renderBody(grid, active, card, opts);
	return active;
}

/**
 * ADR-36: render the single dismissible hint iff Bases is present-but-disabled
 * AND the user has not already dismissed it. Every other combination —
 * "enabled" (nothing to say), "absent" (silence, not a broken install), or
 * already dismissed — renders nothing here, by construction: there is no
 * branch that reads a community plugin's presence at all (F8's "community
 * never" holds structurally, not just by convention).
 */
function maybeRenderBasesHint(root: HTMLElement, opts: CodexTabOptions): void {
	if ((opts.basesCapability ?? "enabled") !== "disabled") return;
	if ((opts.dismissedHints ?? []).includes(BASES_DISABLED_HINT_ID)) return;
	renderBasesHint(root);
}

/** The pill row (S91's `.cx-cats`): one pill per ENABLED collection, in order. */
function renderPills(
	collections: readonly CodexCollection[],
	active: CodexCollection | null,
): HTMLElement {
	const row = el("div", "sf-cx-cats");
	for (const collection of collections) {
		if (!collection.enabled) continue;
		const pill = el("span", "sf-cx-pill");
		pill.setAttribute(CODEX_COLLECTION_ATTR, collection.id);
		pill.setAttribute("role", "button");
		pill.setAttribute("tabindex", "0");
		pill.setAttribute("aria-pressed", String(collection.id === active?.id));
		if (collection.id === active?.id) pill.classList.add("sf-cx-pill--sel");
		pill.textContent = collection.label;
		row.appendChild(pill);
	}
	return row;
}

/** Resolve the active collection and render its entries, or why there are none. */
function renderBody(
	grid: HTMLElement,
	active: CodexCollection,
	card: CardRenderer,
	opts: CodexTabOptions,
): void {
	const resolution = resolveCollection(
		active.id,
		{ [active.id]: { tag: active.tag } },
		{ excludedFolders: opts.excludedFolders },
		opts.index,
	);

	if (resolution.status === "misconfigured") {
		const box = message("sf-cx-misconfigured", resolution.reason);
		box.setAttribute("data-sf-cx-misconfigured", active.id);
		grid.appendChild(box);
		return;
	}

	if (resolution.notes.length === 0) {
		// S98: heading, the tag it looked for, Change tag + What are FileClasses?
		// (codexEmptyState.ts). Naming the tag is the part that held from T4.1
		// (PRD/F3 AC); this is that placeholder grown into the signed-off mockup.
		renderCodexEmptyState(grid, { collectionId: active.id, label: active.label, tag: active.tag });
		return;
	}

	// Card-id-aware density (PRD/F4 — "shown at the density it deserves"): Hero
	// keeps the multi-column card grid; Table and Compact are row-shaped (a
	// flat line of cells/facts, `tableCard.ts`/`compactCard.ts`) and only read
	// correctly full width, one per row — see `sf-cx-grid--table`/`--compact`
	// in styles.css.
	grid.classList.add(`sf-cx-grid--${card.id}`);
	for (const note of resolution.notes) {
		grid.appendChild(renderEntry(note, card, opts));
	}
}

/**
 * One entry, adapted to a `CardEntry` (native backend, `nativeCardEntry`) and
 * drawn through `buildCardWrapper` (`cardWrapper.ts`) — the SAME wrapper
 * builder `CardBasesView` (`src/bases/`) draws with, so the two backends'
 * wrapper markup cannot diverge (module docstring). `buildCardWrapper` is
 * what nests the name marker inside the card-body marker correctly, for every
 * Card, ours or imported (T4.2's `CardRenderDeps.nameEl` doc comment).
 */
function renderEntry(note: IndexedNote, card: CardRenderer, opts: CodexTabOptions): HTMLElement {
	const frontmatter = opts.frontmatterFor?.(note.path) ?? null;
	const entry = nativeCardEntry(note.path, frontmatter);

	return buildCardWrapper(entry, card, {
		compact: Boolean(opts.compact),
		resolveAsset: (raw: string): string => opts.resolveAsset?.(note.path, raw) ?? raw,
		selected: opts.openPath === note.path,
	});
}

// ---------------------------------------------------------------------------
// Small DOM helpers (plain DOM only — no Obsidian element augmentation)
// ---------------------------------------------------------------------------

function el(tag: "div" | "span", cls: string): HTMLElement {
	const node = activeDocument.createElement(tag);
	node.className = cls;
	return node;
}

function message(cls: string, text: string): HTMLElement {
	const node = el("div", cls);
	node.textContent = text;
	return node;
}

function empty(container: HTMLElement): void {
	while (container.firstChild) container.removeChild(container.firstChild);
}
