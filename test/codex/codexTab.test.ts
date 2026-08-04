/**
 * codexTab.test.ts — T4.1 (spec 008-codex-surface, Phase 4).
 *
 * The Codex tab body: collection pills + the entry grid, hosted by the Anvil
 * (and, in compact form, by the Workbench once Phase 7 binds a collection to
 * it). Everything here is driven through a **real `AnvilView`** rather than by
 * calling `renderCodexTab` with hand-made arguments, because the two things
 * this task must get right are only observable end to end:
 *
 *   1. the pill row is a *structural control* and the grid re-render is the
 *      host's response to it — a direct call to the renderer would prove
 *      nothing about the delegated click router;
 *   2. the F2 markers this surface is the first to emit (`cardBody`, and a
 *      `name` nested inside it) must be classified by the **real**
 *      `walkTargetMarkers` over the **actually rendered** DOM, with the host's
 *      real `markerKindOf` vocabulary. A hand-built marker array cannot catch
 *      the nesting order being wrong in the markup, which is the entire point
 *      of ADR-28's "precedence is proximity, not a kind ranking".
 *
 * @ref docs/XDD/specs/008-codex-surface/requirements.md — Feature F2, F3, F7
 * @ref docs/XDD/specs/008-codex-surface/solution.md — ADR-28
 * @ref docs/mockups/anvil-workbench-codex.html — S91
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, TFolder, WorkspaceLeaf, type EventRef, type TFile } from "obsidian";
import { createMockCachedMetadata, createMockTFile, type CachedMetadata } from "../__mocks__/obsidian";
import { AnvilView } from "anvil/AnvilView";
import {
	BUILT_IN_COLLECTIONS,
	CodexSelectionStore,
	renderCodexTab,
	type CodexCollection,
} from "codex/codexTab";
import { createNoteIndex } from "codex/noteIndex";
import { CODEX_CARD_REGISTRY } from "codex/builtinCards";
import type { CardRenderer } from "codex/cardRegistry";
import { walkTargetMarkers } from "navigation/domTargetWalk";
import type { TargetKind } from "navigation/navigationController";

// ---------------------------------------------------------------------------
// Fixture: a mini canon vault, tagged the way the seed vault tags (frontmatter)
// ---------------------------------------------------------------------------

const mara = createMockTFile({ basename: "Mara Stoneway", path: "30 Canon/31 Characters/Mara Stoneway.md" });
const tobias = createMockTFile({ basename: "Tobias Ferro", path: "30 Canon/31 Characters/Tobias Ferro.md" });
const harbor = createMockTFile({ basename: "Moonharbor", path: "30 Canon/32 Locations/Moonharbor.md" });
const seal = createMockTFile({ basename: "The Warden's Seal", path: "30 Canon/33 Objects/The Warden's Seal.md" });
const template = createMockTFile({ basename: "Character template", path: "00 Meta/Templates/Character template.md" });

function canon(kind: string, extra?: Record<string, unknown>): CachedMetadata {
	return createMockCachedMetadata({ frontmatter: { tags: [`canon/${kind}`], ...extra } });
}

const FILES: readonly TFile[] = [mara, tobias, harbor, seal, template];

function seedVault(app: App): void {
	const caches = new Map<TFile, CachedMetadata>([
		[mara, canon("character", { role: "protagonist" })],
		[tobias, canon("character", { role: "supporting" })],
		[harbor, canon("location")],
		[seal, canon("object")],
		// Excluded by the default excludedFolders (00 Meta) — never a pill entry.
		[template, canon("character")],
	]);
	const byPath = new Map<string, TFile>(FILES.map((f) => [f.path, f]));

	vi.mocked(app.metadataCache.getFileCache).mockImplementation((f) => caches.get(f) ?? null);
	vi.mocked(app.vault.getMarkdownFiles).mockReturnValue([...FILES]);
	vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((p) => byPath.get(p) ?? null);
	app.workspace.getActiveFile = vi.fn(() => null);
	app.workspace.openLinkText = vi.fn(async () => {});
}

function makeLeaf(app: App): WorkspaceLeaf {
	const leaf = new WorkspaceLeaf();
	(leaf as unknown as { app: App }).app = app;
	return leaf;
}

interface OpenOpts {
	collections?: readonly CodexCollection[];
	linkClickAction?: "drill" | "open";
	drill?: (file: TFile) => void;
	cardByCollection?: Record<string, string>;
	onCardSelect?: (collectionId: string, cardId: string) => void;
}

async function openCodex(app: App, opts: OpenOpts = {}): Promise<AnvilView> {
	const view = new AnvilView(makeLeaf(app), {
		getLinkClickAction: (): "drill" | "open" => opts.linkClickAction ?? "drill",
		...(opts.drill ? { drill: opts.drill } : {}),
		...(opts.collections ? { getCollections: (): readonly CodexCollection[] => opts.collections! } : {}),
		...(opts.cardByCollection
			? { getCardByCollection: (): Record<string, string> => opts.cardByCollection! }
			: {}),
		...(opts.onCardSelect ? { onCardSelect: opts.onCardSelect } : {}),
	});
	await view.onOpen();
	view.setLayout("codex");
	return view;
}

function bodyOf(view: AnvilView): HTMLElement {
	return view.contentEl.querySelector(".sf-ws-body") as HTMLElement;
}

function pillLabels(view: AnvilView): string[] {
	return Array.from(bodyOf(view).querySelectorAll<HTMLElement>("[data-sf-collection]")).map(
		(el) => el.textContent ?? "",
	);
}

function selectedPill(view: AnvilView): HTMLElement | null {
	return bodyOf(view).querySelector<HTMLElement>('[data-sf-collection][aria-pressed="true"]');
}

function cardPaths(view: AnvilView): string[] {
	return Array.from(bodyOf(view).querySelectorAll<HTMLElement>("[data-sf-card-body]")).map(
		(el) => el.getAttribute("data-sf-card-body") ?? "",
	);
}

/** The class of `.sf-cx-grid--*` currently on the grid — which Card drew it. */
function gridCardId(view: AnvilView): string | null {
	const grid = bodyOf(view).querySelector(".sf-cx-grid");
	const cls = Array.from(grid?.classList ?? []).find((c) => c.startsWith("sf-cx-grid--"));
	return cls?.replace("sf-cx-grid--", "") ?? null;
}

/** The Card selector's trigger button (S91/S97's "Card: X ▾"). */
function cardSelTrigger(view: AnvilView): HTMLElement | null {
	return bodyOf(view).querySelector<HTMLElement>(".sf-cx-cardsel-trigger");
}

/** A Card option inside the (possibly closed) selector dropdown. */
function cardOption(view: AnvilView, cardId: string): HTMLElement | null {
	return bodyOf(view).querySelector<HTMLElement>(`[data-sf-card="${cardId}"]`);
}

function click(el: Element | null, opts: { ctrl?: boolean } = {}): void {
	if (!el) throw new Error("no element to click");
	el.dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: opts.ctrl ?? false }));
}

/**
 * The host's OWN marker vocabulary, driven over the real ancestor walk. Reaching
 * for the private member is deliberate: re-declaring the vocabulary in the test
 * would make the assertion self-fulfilling, and it is exactly the host-side
 * mapping this task extends.
 */
function markersFor(view: AnvilView, el: HTMLElement): readonly TargetKind[] {
	const host = view as unknown as { _markerKindOf(e: HTMLElement): TargetKind | null };
	return walkTargetMarkers(el, view.contentEl, (e) => host._markerKindOf(e)).markers;
}

// ---------------------------------------------------------------------------
// F3 / F7 — the pills
// ---------------------------------------------------------------------------

describe("Codex tab: collection pills [PRD/F3, PRD/F7]", () => {
	let app: App;

	beforeEach(() => {
		app = new App();
		seedVault(app);
	});

	it("renders one pill per enabled collection, in the configured order", async () => {
		const view = await openCodex(app);

		expect(pillLabels(view)).toEqual(["Characters", "Locations", "Objects", "Lore"]);
	});

	it("selects the first enabled collection on open [PRD/F3 AC]", async () => {
		const view = await openCodex(app);

		expect(selectedPill(view)?.getAttribute("data-sf-collection")).toBe("character");
		expect(cardPaths(view)).toEqual([mara.path, tobias.path]);
	});

	it("gives a disabled collection no pill at all [PRD/F7 AC]", async () => {
		const collections = BUILT_IN_COLLECTIONS.map((c) =>
			c.id === "location" ? { ...c, enabled: false } : c,
		);

		const view = await openCodex(app, { collections });

		expect(pillLabels(view)).toEqual(["Characters", "Objects", "Lore"]);
		expect(bodyOf(view).querySelector('[data-sf-collection="location"]')).toBeNull();
	});

	it("selects the first ENABLED collection when the first listed one is disabled", async () => {
		const collections = BUILT_IN_COLLECTIONS.map((c) =>
			c.id === "character" ? { ...c, enabled: false } : c,
		);

		const view = await openCodex(app, { collections });

		expect(selectedPill(view)?.getAttribute("data-sf-collection")).toBe("location");
		expect(cardPaths(view)).toEqual([harbor.path]);
	});

	it("re-renders the grid when another collection is picked", async () => {
		const view = await openCodex(app);
		expect(cardPaths(view)).toEqual([mara.path, tobias.path]);

		click(bodyOf(view).querySelector('[data-sf-collection="object"]'));

		expect(selectedPill(view)?.getAttribute("data-sf-collection")).toBe("object");
		expect(cardPaths(view)).toEqual([seal.path]);
	});

	it("leaves notes under an excluded folder out of the grid [PRD/F3 AC]", async () => {
		const view = await openCodex(app);

		expect(cardPaths(view)).not.toContain(template.path);
	});

	it("names the tag it looked for when a collection resolves to nothing [PRD/F3 AC]", async () => {
		const view = await openCodex(app);

		click(bodyOf(view).querySelector('[data-sf-collection="lore"]'));

		const empty = bodyOf(view).querySelector<HTMLElement>("[data-sf-cx-empty]");
		expect(empty?.textContent).toContain("canon/lore");
	});

	it("reports a cleared tag as misconfigured instead of listing the whole vault [PRD/F3 AC]", async () => {
		const collections: readonly CodexCollection[] = [
			{ id: "broken", label: "Broken", tag: "  ", enabled: true },
		];

		const view = await openCodex(app, { collections });

		expect(bodyOf(view).querySelector("[data-sf-cx-misconfigured]")).not.toBeNull();
		expect(cardPaths(view)).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// F3 — selection survives a follow re-render
// ---------------------------------------------------------------------------

describe("Codex tab: selection state survives a follow re-render [PRD/F3 AC]", () => {
	let app: App;

	beforeEach(() => {
		app = new App();
		seedVault(app);
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("keeps the picked collection when the active note changes", async () => {
		const view = await openCodex(app);
		click(bodyOf(view).querySelector('[data-sf-collection="object"]'));
		expect(cardPaths(view)).toEqual([seal.path]);

		// The follow pipeline: active-leaf-change → debounced _render().
		app.workspace.getActiveFile = vi.fn(() => mara);
		app.workspace._trigger("active-leaf-change");
		vi.advanceTimersByTime(500);

		expect(selectedPill(view)?.getAttribute("data-sf-collection")).toBe("object");
		expect(cardPaths(view)).toEqual([seal.path]);
	});
});

// ---------------------------------------------------------------------------
// F2 — the markers this surface is the first to emit (ADR-28)
// ---------------------------------------------------------------------------

describe("Codex tab: F2 target markers through the real walk [PRD/F2, SDD/ADR-28]", () => {
	let app: App;

	beforeEach(() => {
		app = new App();
		seedVault(app);
	});

	function cardFor(view: AnvilView, file: TFile): HTMLElement {
		const card = bodyOf(view).querySelector<HTMLElement>(`[data-sf-card-body="${file.path}"]`);
		if (!card) throw new Error(`no card rendered for ${file.path}`);
		return card;
	}

	function nameIn(card: HTMLElement): HTMLElement {
		const name = card.querySelector<HTMLElement>("[data-sf-link]");
		if (!name) throw new Error("no name element inside the card body");
		return name;
	}

	it("a card body classifies as cardBody", async () => {
		const view = await openCodex(app);
		const card = cardFor(view, mara);

		expect(markersFor(view, card)[0]).toBe("cardBody");
	});

	it("a name inside the card body classifies as name", async () => {
		const view = await openCodex(app);
		const name = nameIn(cardFor(view, mara));

		expect(markersFor(view, name)[0]).toBe("name");
	});

	it("the name wins over the surrounding card body BY PROXIMITY, not by a ranking", async () => {
		const view = await openCodex(app);
		const card = cardFor(view, mara);
		const name = nameIn(card);

		// The markup really nests the name inside the body — the precondition
		// that makes this a proximity question at all.
		expect(card.contains(name)).toBe(true);
		expect(name).not.toBe(card);

		// One walk, two starting points, opposite winners: only proximity can
		// produce that. A fixed kind ranking would return the same head twice.
		expect(markersFor(view, name)).toEqual(["name", "cardBody"]);
		expect(markersFor(view, card)).toEqual(["cardBody"]);
	});

	it("a plain click on the card body inspects; a modifier click opens the note [PRD/F2 matrix]", async () => {
		const drill = vi.fn();
		const view = await openCodex(app, { drill });
		const card = cardFor(view, mara);

		click(card);
		expect(drill).toHaveBeenCalledTimes(1);
		expect((drill.mock.calls[0]![0] as TFile).path).toBe(mara.path);
		expect(app.workspace.openLinkText).not.toHaveBeenCalled();

		click(cardFor(view, mara), { ctrl: true });
		expect(app.workspace.openLinkText).toHaveBeenCalledWith(mara.path, "", false);
		expect(drill).toHaveBeenCalledTimes(1);
	});

	it("clicking the name follows the configured action while the body still inspects", async () => {
		// linkClickAction "open" splits the two behaviours: a NAME click opens the
		// note, a BODY click still inspects. If the name did not win by proximity
		// the name click would inspect too, and this assertion would fail.
		const drill = vi.fn();
		const view = await openCodex(app, { drill, linkClickAction: "open" });

		click(nameIn(cardFor(view, mara)));
		expect(app.workspace.openLinkText).toHaveBeenCalledWith(mara.path, "", false);
		expect(drill).not.toHaveBeenCalled();

		click(cardFor(view, tobias));
		expect(drill).toHaveBeenCalledTimes(1);
		expect((drill.mock.calls[0]![0] as TFile).path).toBe(tobias.path);
	});

	it("a pill is a structural control — it operates, it never navigates [PRD/F2 matrix]", async () => {
		const drill = vi.fn();
		const view = await openCodex(app, { drill });
		const pill = bodyOf(view).querySelector<HTMLElement>('[data-sf-collection="object"]');

		expect(markersFor(view, pill!)[0]).toBe("structuralControl");

		click(pill, { ctrl: true });

		expect(drill).not.toHaveBeenCalled();
		expect(app.workspace.openLinkText).not.toHaveBeenCalled();
		expect(selectedPill(view)?.getAttribute("data-sf-collection")).toBe("object");
	});
});

// ---------------------------------------------------------------------------
// T4.3 — Cards wired end to end (Hero is the registry default, T4.2)
// ---------------------------------------------------------------------------

describe("Codex tab: built-in Cards render through the real AnvilView [PRD/F4]", () => {
	let app: App;

	beforeEach(() => {
		app = new App();
		seedVault(app);
	});

	it("draws every entry with Hero, the registry default, reading real frontmatter", async () => {
		const view = await openCodex(app);
		const card = cardFor(view, mara);

		expect(card.classList.contains("sf-cx-hero")).toBe(true);
		// role is character's first fact — S91's facts line (.sf-cx-hero-facts)
		// shows it first, unlabelled.
		const factsLine = card.querySelector(".sf-cx-hero-facts");
		expect(factsLine?.querySelector(".sf-cx-hero-fact-v")?.textContent).toBe("protagonist");
	});

	function cardFor(view: AnvilView, file: TFile): HTMLElement {
		const card = bodyOf(view).querySelector<HTMLElement>(`[data-sf-card-body="${file.path}"]`);
		if (!card) throw new Error(`no card rendered for ${file.path}`);
		return card;
	}
});

// ---------------------------------------------------------------------------
// The body's own contract — the second host's form, before it has a second host
// ---------------------------------------------------------------------------

describe("renderCodexTab: the shared body", () => {
	function render(compact: boolean, cardId?: string): HTMLElement {
		const container = document.createElement("div");
		renderCodexTab(container, {
			collections: BUILT_IN_COLLECTIONS,
			selection: new CodexSelectionStore(),
			index: [{ path: "30 Canon/31 Characters/Mara Stoneway.md", tags: ["canon/character"] }],
			excludedFolders: ["00 Meta"],
			compact,
			...(cardId !== undefined ? { cardId } : {}),
		});
		return container;
	}

	it("marks the grid with the selected Card's id (T4.3 fix — density per Card, PRD/F4)", () => {
		const heroGrid = render(false).querySelector(".sf-cx-grid");
		const tableGrid = render(false, "table").querySelector(".sf-cx-grid");
		const compactCardGrid = render(false, "compact").querySelector(".sf-cx-grid");

		// Hero is the registry default (T4.2) — no explicit cardId still yields
		// the hero grid class, not a bare unmarked one.
		expect(heroGrid?.classList.contains("sf-cx-grid--hero")).toBe(true);
		expect(tableGrid?.classList.contains("sf-cx-grid--table")).toBe(true);
		expect(compactCardGrid?.classList.contains("sf-cx-grid--compact")).toBe(true);

		// Each grid carries exactly one card-id class — never a stale one from
		// a prior render, and never more than one at a time.
		for (const grid of [heroGrid, tableGrid, compactCardGrid]) {
			const cardIdClasses = Array.from(grid?.classList ?? []).filter((c) => c.startsWith("sf-cx-grid--"));
			expect(cardIdClasses).toHaveLength(1);
		}
	});

	it("renders the Workbench's compact form from the same markup", () => {
		const compact = render(true);
		const full = render(false);

		expect(compact.querySelector(".sf-cx")?.classList.contains("sf-cx--compact")).toBe(true);
		expect(full.querySelector(".sf-cx")?.classList.contains("sf-cx--compact")).toBe(false);
		// Same pills, same cards — density is the only difference (S95).
		expect(compact.querySelectorAll("[data-sf-collection]").length).toBe(
			full.querySelectorAll("[data-sf-collection]").length,
		);
		expect(compact.querySelectorAll("[data-sf-card-body]").length).toBe(1);
	});

	it("replaces whatever the container held rather than appending to it", () => {
		const container = render(false);
		const stale = document.createElement("p");
		container.appendChild(stale);

		renderCodexTab(container, {
			collections: BUILT_IN_COLLECTIONS,
			selection: new CodexSelectionStore(),
			index: [],
			excludedFolders: [],
		});

		expect(container.contains(stale)).toBe(false);
		expect(container.querySelectorAll(".sf-cx").length).toBe(1);
	});

	it("says so when every collection is disabled, instead of rendering a bare grid", () => {
		const container = document.createElement("div");
		renderCodexTab(container, {
			collections: BUILT_IN_COLLECTIONS.map((c) => ({ ...c, enabled: false })),
			selection: new CodexSelectionStore(),
			index: [],
			excludedFolders: [],
		});

		expect(container.querySelectorAll("[data-sf-collection]").length).toBe(0);
		expect(container.querySelector(".sf-cx-empty")?.textContent).toContain("settings");
	});

	it("falls back to the path's basename when the file cannot be resolved", () => {
		const container = render(false);

		expect(container.querySelector(".sf-cx-name")?.textContent).toBe("Mara Stoneway");
	});
});

describe("CodexSelectionStore", () => {
	it("falls back to the first enabled collection when the pick is disabled", () => {
		const store = new CodexSelectionStore();
		store.select("location");

		const withLocation = store.resolve(BUILT_IN_COLLECTIONS);
		const withoutLocation = store.resolve(
			BUILT_IN_COLLECTIONS.map((c) => (c.id === "location" ? { ...c, enabled: false } : c)),
		);

		expect(withLocation?.id).toBe("location");
		expect(withoutLocation?.id).toBe("character");
	});

	it("resolves to null when nothing is enabled, and clears back to the default", () => {
		const store = new CodexSelectionStore();
		store.select("object");

		expect(store.resolve(BUILT_IN_COLLECTIONS.map((c) => ({ ...c, enabled: false })))).toBeNull();

		store.clear();
		expect(store.resolve(BUILT_IN_COLLECTIONS)?.id).toBe("character");
	});
});

// ---------------------------------------------------------------------------
// The vault adaptation — the cases the rendered grid cannot reach
// ---------------------------------------------------------------------------

describe("createNoteIndex: adapting the vault to the pure resolver", () => {
	/** An index over a vault whose markdown files are exactly `files`. */
	function indexOver(files: readonly TFile[], caches: Map<TFile, CachedMetadata>) {
		const app = new App();
		vi.mocked(app.vault.getMarkdownFiles).mockReturnValue([...files]);
		vi.mocked(app.metadataCache.getFileCache).mockImplementation((f) => caches.get(f) ?? null);
		return { app, index: createNoteIndex(app, (_ref: EventRef): void => {}) };
	}

	it("indexes a note whose metadata is not cached yet as untagged, rather than throwing", () => {
		// Obsidian returns null from getFileCache until a file has been indexed.
		// A note in that window must simply belong to no collection.
		const { index } = indexOver([mara, tobias], new Map([[mara, canon("character")]]));

		expect(index.notes()).toEqual([
			{ path: mara.path, tags: ["canon/character"] },
			{ path: tobias.path, tags: [] },
		]);
	});

	it("resolves a file the index snapshot does not contain yet", () => {
		// A note created between two reads of the same render pass is absent from
		// the snapshot but already resolvable from the vault — cards must still
		// get their file rather than degrading to a path-derived name.
		const { app, index } = indexOver([mara], new Map([[mara, canon("character")]]));
		vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((p) => (p === tobias.path ? tobias : null));

		expect(index.notes().map((n) => n.path)).toEqual([mara.path]);
		expect(index.fileFor(tobias.path)).toBe(tobias);
	});

	it("returns null when the path resolves to something that is not a file", () => {
		const { app, index } = indexOver([mara], new Map([[mara, canon("character")]]));
		vi.mocked(app.vault.getAbstractFileByPath).mockReturnValue(new TFolder());

		expect(index.fileFor("30 Canon/31 Characters")).toBeNull();
	});

	it("returns null for a path nothing can resolve", () => {
		const { app, index } = indexOver([mara], new Map([[mara, canon("character")]]));
		vi.mocked(app.vault.getAbstractFileByPath).mockReturnValue(null);

		expect(index.fileFor("30 Canon/Gone.md")).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Cleanup — the note index subscription must be released on unload (CON-4)
// ---------------------------------------------------------------------------

describe("Codex tab: the note index keeps itself current and unsubscribes cleanly", () => {
	let app: App;

	beforeEach(() => {
		app = new App();
		seedVault(app);
	});

	it("picks up a note that gains the collection's tag without a reopen", async () => {
		const view = await openCodex(app);
		expect(cardPaths(view)).toEqual([mara.path, tobias.path]);

		const newcomer = createMockTFile({ basename: "Elke Stoneway", path: "30 Canon/31 Characters/Elke Stoneway.md" });
		const caches = new Map<TFile, CachedMetadata>([
			[mara, canon("character")],
			[tobias, canon("character")],
			[harbor, canon("location")],
			[seal, canon("object")],
			[template, canon("character")],
			[newcomer, canon("character")],
		]);
		vi.mocked(app.metadataCache.getFileCache).mockImplementation((f) => caches.get(f) ?? null);
		vi.mocked(app.vault.getMarkdownFiles).mockReturnValue([...FILES, newcomer]);
		app.metadataCache._trigger("changed", newcomer);

		// Re-render through a control the user actually operates.
		click(bodyOf(view).querySelector('[data-sf-collection="object"]'));
		click(bodyOf(view).querySelector('[data-sf-collection="character"]'));

		expect(cardPaths(view)).toEqual([mara.path, tobias.path, newcomer.path]);
	});

	it("releases every metadataCache subscription on close", async () => {
		const view = await openCodex(app);
		const before = app.metadataCache._eventRegistrations.size;
		expect(before).toBeGreaterThan(0);

		(view as unknown as { _unload(): void })._unload();
		await view.onClose();

		expect(app.metadataCache._eventRegistrations.size).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// T4.4 — the Card selector: picking, per-collection memory, no frontmatter
// ---------------------------------------------------------------------------

describe("Codex tab: Card selector [PRD/F4]", () => {
	let app: App;

	beforeEach(() => {
		app = new App();
		seedVault(app);
	});

	/**
	 * A stateful `cardByCollection`/`onCardSelect` pair, mirroring how main.ts
	 * wires the real one against `plugin.settings` (write-through, read back on
	 * the very next render). Without this, `AnvilView` has nowhere to keep a
	 * pick between renders — it is deliberately a stateless pass-through — so
	 * any test asserting a pick is STILL VISIBLE after the re-render it triggers
	 * needs a backing store, not just a spy.
	 */
	function statefulCardSelection(): {
		cardByCollection: Record<string, string>;
		onCardSelect: (collectionId: string, cardId: string) => void;
	} {
		const cardByCollection: Record<string, string> = {};
		return {
			cardByCollection,
			onCardSelect: (collectionId, cardId): void => {
				cardByCollection[collectionId] = cardId;
			},
		};
	}

	it("Hero is shown as the active Card by default (the registry default, T4.2)", async () => {
		const view = await openCodex(app);

		expect(cardSelTrigger(view)?.textContent).toContain("Hero");
		expect(gridCardId(view)).toBe("hero");
	});

	it("picking a Card re-renders the same entries and writes no frontmatter [PRD/F4 AC]", async () => {
		const view = await openCodex(app, statefulCardSelection());
		expect(cardPaths(view)).toEqual([mara.path, tobias.path]);

		click(cardOption(view, "table"));

		// Same entries — the query (collection) didn't change, only the drawing.
		expect(cardPaths(view)).toEqual([mara.path, tobias.path]);
		expect(gridCardId(view)).toBe("table");
		expect(cardSelTrigger(view)?.textContent).toContain("Table");
		expect(app.fileManager.processFrontMatter).not.toHaveBeenCalled();
	});

	it("the trigger toggles the dropdown open and closed", async () => {
		const view = await openCodex(app);
		const trigger = cardSelTrigger(view)!;
		const dd = bodyOf(view).querySelector<HTMLElement>(".sf-cx-cardsel-dd")!;

		expect(dd.hidden).toBe(true);
		expect(trigger.getAttribute("aria-expanded")).toBe("false");

		click(trigger);
		expect(dd.hidden).toBe(false);
		expect(trigger.getAttribute("aria-expanded")).toBe("true");

		click(trigger);
		expect(dd.hidden).toBe(true);
		expect(trigger.getAttribute("aria-expanded")).toBe("false");
	});

	it("remembers the Card choice per collection — Characters Hero while Objects is Table [PRD/F4 AC]", async () => {
		const { cardByCollection, onCardSelect } = statefulCardSelection();
		const view = await openCodex(app, { cardByCollection, onCardSelect });

		// Characters starts on Hero (default — nothing chosen for it yet).
		expect(gridCardId(view)).toBe("hero");

		// Switch to Objects and pick Table there.
		click(bodyOf(view).querySelector('[data-sf-collection="object"]'));
		click(cardOption(view, "table"));
		expect(gridCardId(view)).toBe("table");
		expect(cardByCollection).toEqual({ object: "table" });

		// Switching BACK to Characters must still show Hero — proving the memory
		// is keyed by collection, not a single shared slot (mutation-kill: a
		// global key would leak "table" back onto Characters here).
		click(bodyOf(view).querySelector('[data-sf-collection="character"]'));
		expect(gridCardId(view)).toBe("hero");

		expect(app.fileManager.processFrontMatter).not.toHaveBeenCalled();
	});

	it("a fresh AnvilView reflects a persisted per-collection Card choice immediately (reload) [SDD/AC]", async () => {
		const view = await openCodex(app, { cardByCollection: { character: "table" } });

		expect(gridCardId(view)).toBe("table");
		expect(cardSelTrigger(view)?.textContent).toContain("Table");
	});

	it("persists via the injected callback with the collection id and the picked Card id (mutation guard)", async () => {
		const onCardSelect = vi.fn();
		const view = await openCodex(app, { onCardSelect });

		click(cardOption(view, "compact"));

		expect(onCardSelect).toHaveBeenCalledTimes(1);
		expect(onCardSelect).toHaveBeenCalledWith("character", "compact");
	});

	// Registers directly into the MODULE-LEVEL CODEX_CARD_REGISTRY singleton
	// (T4.2's frozen contract has no unregister — "first registration wins" is
	// deliberate, ADR-30). That registration outlives this test for the rest of
	// this file's process, so this test is placed LAST to avoid leaking a
	// "Yours" heading into any test above it.
	it("groups an imported Card under a heading distinct from the built-ins [PRD/F4 AC]", async () => {
		const imported: CardRenderer = {
			id: "test-imported-card",
			label: "Test imported card",
			render: (): void => {},
		};
		const registered = CODEX_CARD_REGISTRY.register(imported);
		// Guards against an id collision silently no-op'ing the rest of this test.
		expect(registered).toBe(true);

		const view = await openCodex(app);
		const dd = bodyOf(view).querySelector<HTMLElement>(".sf-cx-cardsel-dd")!;

		const headings = Array.from(dd.querySelectorAll(".sf-cx-cardsel-heading")).map((h) => h.textContent);
		expect(headings).toEqual(["Built-in", "Yours"]);

		const importedOption = cardOption(view, "test-imported-card");
		expect(importedOption).not.toBeNull();
		expect(importedOption?.classList.contains("sf-cx-cardsel-item--usr")).toBe(true);

		// Positioned after the "Yours" heading — not lumped in with the built-ins.
		const yoursHeading = Array.from(dd.children).find((c) => c.textContent === "Yours")!;
		const position = yoursHeading.compareDocumentPosition(importedOption!);
		// eslint-disable-next-line no-bitwise -- DOM Node.compareDocumentPosition is a bitmask API
		expect(Boolean(position & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
	});
});
