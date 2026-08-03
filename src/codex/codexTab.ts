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
 * deliberately no special case anywhere for this (ADR-28).
 *
 * This task ships the body and its selection; the Cards that draw an entry are
 * T4.2/T4.3 and replace `renderEntry` below, and the full empty state (S98,
 * with *Set up my vault…* / *Change tag*) is T4.6 — the placeholder here already
 * satisfies the one thing that must never regress, naming the tag it looked for
 * rather than silently listing the vault.
 *
 * @ref docs/mockups/anvil-workbench-codex.html — S91
 * @ref docs/XDD/specs/008-codex-surface/requirements.md — Features F2, F3, F7
 * @ref docs/XDD/specs/008-codex-surface/solution.md — ADR-28, Building Block View
 */

import type { TFile } from "obsidian";
import { resolveCollection, type IndexedNote } from "./collectionResolver";

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
 * must nest, not co-occur (see the module docstring).
 */
export const CODEX_CARD_BODY_ATTR = "data-sf-card-body";

/** The existing cross-surface "name" marker, reused unchanged. */
const LINK_ATTR = "data-sf-link";

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

	/** Record an explicit pick. Unknown ids are harmless — `resolve` falls back. */
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
	/** Adapts a resolved path to its file — cards read the file, not the path. */
	readonly fileFor: (path: string) => TFile | null;
	/** Workbench form: same markup, tighter density (S95). */
	readonly compact?: boolean;
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
	root.appendChild(renderPills(opts.collections, active));

	const grid = el("div", "sf-cx-grid");
	root.appendChild(grid);

	if (!active) {
		grid.appendChild(message("sf-cx-empty", "No collections are enabled — enable one in settings."));
		return null;
	}

	renderBody(grid, active, opts);
	return active;
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
function renderBody(grid: HTMLElement, active: CodexCollection, opts: CodexTabOptions): void {
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
		// T4.6 grows this into S98 (Set up my vault… / Change tag). Naming the
		// tag is the part that must hold from the start (PRD/F3 AC).
		const box = message("sf-cx-empty", `No notes carry the tag ${active.tag}.`);
		box.setAttribute("data-sf-cx-empty", active.tag);
		grid.appendChild(box);
		return;
	}

	for (const note of resolution.notes) {
		grid.appendChild(renderEntry(note, opts.fileFor(note.path)));
	}
}

/**
 * One entry. The Card that draws it is T4.2/T4.3; what this task fixes is the
 * marker nesting the F2 matrix depends on — body outside, name inside.
 */
function renderEntry(note: IndexedNote, file: TFile | null): HTMLElement {
	const card = el("div", "sf-cx-card");
	card.setAttribute(CODEX_CARD_BODY_ATTR, note.path);
	card.setAttribute("role", "button");
	card.setAttribute("tabindex", "0");

	const main = el("div", "sf-cx-card-main");
	card.appendChild(main);

	const name = el("span", "sf-cx-name");
	name.setAttribute(LINK_ATTR, note.path);
	name.textContent = file?.basename ?? basenameOf(note.path);
	main.appendChild(name);

	card.setAttribute("aria-label", name.textContent);
	return card;
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

/** Display name for a path whose file could not be resolved (deleted mid-render). */
function basenameOf(path: string): string {
	return (path.split("/").pop() ?? path).replace(/\.md$/, "");
}
