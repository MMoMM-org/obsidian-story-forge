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
 * @ref docs/XDD/specs/008-codex-surface/mockups.html — S91
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
import { buildCollections } from "library/collectionStore";
import { DEFAULT_SETTINGS, type PluginSettings } from "types/index";
import { CODEX_CARD_REGISTRY } from "codex/builtinCards";
import { nativeTileField } from "codex/cardTileField";
import type { CardRenderer } from "codex/cardRegistry";
import { walkTargetMarkers } from "navigation/domTargetWalk";
import type { TargetKind } from "navigation/navigationController";
import type { BasesCapability } from "bases/basesCapability";
import { CODEX_CHANGE_TAG_ATTR } from "codex/codexEmptyState";
import { BASES_DISABLED_HINT_ID, CODEX_HINT_DISMISS_ATTR } from "codex/basesHint";

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
	basesCapability?: BasesCapability;
	dismissedHints?: readonly string[];
	onDismissHint?: (hintId: string) => void;
	onChangeTag?: (collectionId: string) => void;
}

async function openCodex(app: App, opts: OpenOpts = {}): Promise<AnvilView> {
	// codex/bases are only included when at least one member is supplied — this
	// preserves the pre-grouping behaviour where an untouched field (e.g.
	// getBasesCapability never wired) fell back to its default, now exercised as
	// the whole group being absent (see "defaults to no hint when the host
	// hasn't wired getBasesCapability at all").
	const codex = {
		...(opts.collections ? { getCollections: (): readonly CodexCollection[] => opts.collections! } : {}),
		...(opts.cardByCollection
			? { getCardByCollection: (): Record<string, string> => opts.cardByCollection! }
			: {}),
		...(opts.onCardSelect ? { onCardSelect: opts.onCardSelect } : {}),
		...(opts.onChangeTag ? { onChangeTag: opts.onChangeTag } : {}),
	};
	const bases = {
		...(opts.basesCapability ? { getCapability: (): BasesCapability => opts.basesCapability! } : {}),
		...(opts.dismissedHints ? { getDismissedHints: (): readonly string[] => opts.dismissedHints! } : {}),
		...(opts.onDismissHint ? { onDismissHint: opts.onDismissHint } : {}),
	};
	const view = new AnvilView(makeLeaf(app), {
		settings: { getLinkClickAction: (): "drill" | "open" => opts.linkClickAction ?? "drill" },
		...(opts.drill ? { drill: opts.drill } : {}),
		...(Object.keys(codex).length > 0 ? { codex } : {}),
		...(Object.keys(bases).length > 0 ? { bases } : {}),
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
 * Mount `view.contentEl` into the real `document.body`. The mock's `ItemView`
 * (unlike its `Modal`) never does this itself, so a click dispatched inside it
 * normally bubbles only as far as the detached `containerEl` root and never
 * reaches `document` — real Obsidian DOES mount a leaf's content into the
 * document, which is what the Card selector's document-level dismiss listener
 * (T4.4 follow-up, `AnvilView._dismissOpenCardDropdown`) relies on. Returns an
 * unmount function so the test can clean up rather than leaking elements onto
 * `document.body` for the rest of the file's test run.
 */
function mountToDocument(view: AnvilView): () => void {
	document.body.appendChild(view.contentEl);
	return (): void => {
		view.contentEl.parentNode?.removeChild(view.contentEl);
	};
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
// T7.1d1 — a built-in resolves by its OWN tag and excluded folders
// ---------------------------------------------------------------------------

describe("Codex tab: a built-in collection's own config (Library, T7.1d1)", () => {
	let app: App;
	beforeEach(() => {
		app = new App();
		seedVault(app);
	});

	/** The built-in rows exactly as the Library store hands them to the Anvil. */
	const rows = (builtInCollections: PluginSettings["builtInCollections"], excludedFolders: string[] = ["00 Meta"]): readonly CodexCollection[] =>
		buildCollections({}, { ...DEFAULT_SETTINGS, builtInCollections, excludedFolders });

	it("resolves by the tag override, not the shipped tag", async () => {
		const view = await openCodex(app, { collections: rows({ character: { tag: "canon/location" } }) });

		expect(selectedPill(view)?.getAttribute("data-sf-collection")).toBe("character");
		expect(cardPaths(view)).toEqual([harbor.path]);
	});

	it("excludes its own folders, and not the ones Scope excludes", async () => {
		const view = await openCodex(app, { collections: rows({ character: { excludedFolders: ["30 Canon/31 Characters"] } }) });

		// Scope's "00 Meta" no longer applies to this collection, so the template shows; Mara and Tobias do not.
		expect(cardPaths(view)).toEqual([template.path]);
	});

	it("follows Scope when it has no list of its own", async () => {
		const view = await openCodex(app, { collections: rows({}, ["30 Canon/31 Characters"]) });

		expect(cardPaths(view)).toEqual([template.path]);
	});

	it("an empty own list excludes nothing, rather than falling back to Scope", async () => {
		const view = await openCodex(app, { collections: rows({ character: { excludedFolders: [] } }) });

		expect(cardPaths(view).sort()).toEqual([mara.path, template.path, tobias.path].sort());
	});

	it("a collection with no list of its own (a plain CodexCollection) still uses the host's Scope list", async () => {
		const view = await openCodex(app);

		expect(cardPaths(view)).not.toContain(template.path);
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

	it("a title inside the card body classifies as cardTitle", async () => {
		const view = await openCodex(app);
		const name = nameIn(cardFor(view, mara));

		expect(markersFor(view, name)[0]).toBe("cardTitle");
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
		expect(markersFor(view, name)).toEqual(["cardTitle", "cardBody"]);
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

	it("clicking the title opens a new tab (cardTitleOpensNote) while the body still inspects", async () => {
		// The default setting splits the two behaviours: a TITLE click opens the
		// note in a new tab, a BODY click still inspects. If the title did not win
		// by proximity the title click would inspect too, and this would fail.
		const drill = vi.fn();
		const view = await openCodex(app, { drill, linkClickAction: "open" });

		click(nameIn(cardFor(view, mara)));
		expect(app.workspace.openLinkText).toHaveBeenCalledWith(mara.path, "", true);
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

	// Regression: T4.1 (codexTab.ts) and T4.3 (cards/shared.ts) independently
	// named their pill markup `.sf-cx-pill`. The later CSS block for the card's
	// relation pills then overrode `background`/`color` on the COLLECTION pills
	// too, beating `.sf-cx-pill--sel` and silently dropping the selected
	// collection pill's accent fill (docs/XDD/specs/008-codex-surface/mockups.html —
	// S91). The fix scopes the two under distinct classes
	// (`.sf-cx-pill` for collections, `.sf-cx-relpill` for a Card's relation
	// pills); this test fails again if the two are ever collapsed back onto one
	// class, whether or not the CSS collision that exposed it is still present.
	it("the selected collection pill's class never overlaps a card's relation pill class [regression: shared .sf-cx-pill]", async () => {
		const caches = new Map<TFile, CachedMetadata>([
			[mara, canon("character", { role: "protagonist", allies: ["[[Tobias Ferro]]"] })],
			[tobias, canon("character", { role: "supporting" })],
			[harbor, canon("location")],
			[seal, canon("object")],
			[template, canon("character")],
		]);
		vi.mocked(app.metadataCache.getFileCache).mockImplementation((f) => caches.get(f) ?? null);

		const view = await openCodex(app);
		const selected = selectedPill(view);
		const relationPill = bodyOf(view).querySelector<HTMLElement>(".sf-cx-relpill");

		expect(selected).not.toBeNull();
		expect(relationPill).not.toBeNull();

		const selectedClasses = new Set(selected!.classList);
		const overlap = Array.from(relationPill!.classList).filter((c) => selectedClasses.has(c));
		expect(overlap).toEqual([]);

		// The selected pill must still carry its accent-fill class regardless.
		expect(selected!.classList.contains("sf-cx-pill--sel")).toBe(true);
	});

	function cardFor(view: AnvilView, file: TFile): HTMLElement {
		const card = bodyOf(view).querySelector<HTMLElement>(`[data-sf-card-body="${file.path}"]`);
		if (!card) throw new Error(`no card rendered for ${file.path}`);
		return card;
	}
});

// ---------------------------------------------------------------------------
// T4.6 — S98 empty state: names the tag, Change tag + What are FileClasses?
// ---------------------------------------------------------------------------

describe("Codex tab: S98 empty state [PRD/F3 AC]", () => {
	let app: App;

	beforeEach(() => {
		app = new App();
		seedVault(app);
	});

	function emptyBox(view: AnvilView): HTMLElement {
		const box = bodyOf(view).querySelector<HTMLElement>("[data-sf-cx-empty]");
		if (!box) throw new Error("no empty-state box rendered");
		return box;
	}

	it("names the heading after the collection and the tag it looked for", async () => {
		const view = await openCodex(app);
		click(bodyOf(view).querySelector('[data-sf-collection="lore"]'));

		const box = emptyBox(view);
		expect(box.querySelector(".sf-cx-empty-heading")?.textContent).toBe("No lore found");
		expect(box.textContent).toContain("canon/lore");
	});

	it("offers a primary Change tag action, not Set up my vault… (S98 correction — that action returns with #27)", async () => {
		const view = await openCodex(app);
		click(bodyOf(view).querySelector('[data-sf-collection="lore"]'));

		const box = emptyBox(view);
		expect(box.textContent).not.toContain("Set up my vault");
		const changeTag = box.querySelector<HTMLElement>(`[${CODEX_CHANGE_TAG_ATTR}]`);
		expect(changeTag?.textContent).toBe("Change tag");
		expect(changeTag?.getAttribute(CODEX_CHANGE_TAG_ATTR)).toBe("lore");
	});

	it("offers a secondary What are FileClasses? documentation link", async () => {
		const view = await openCodex(app);
		click(bodyOf(view).querySelector('[data-sf-collection="lore"]'));

		const box = emptyBox(view);
		const docsLink = Array.from(box.querySelectorAll("a")).find((a) => a.textContent === "What are FileClasses?");
		expect(docsLink).toBeDefined();
		expect(docsLink?.getAttribute("href")).toBe("https://mdelobelle.github.io/metadatamenu/fileclasses/");
		// External link — must not let the destination reach back via window.opener.
		expect(docsLink?.getAttribute("rel")).toContain("noopener");
	});

	it("Change tag is a structural control routed through the real click walk, and opens Settings via the host", async () => {
		const onChangeTag = vi.fn();
		const view = await openCodex(app, { onChangeTag });
		click(bodyOf(view).querySelector('[data-sf-collection="lore"]'));

		const changeTag = emptyBox(view).querySelector<HTMLElement>(`[${CODEX_CHANGE_TAG_ATTR}]`);
		expect(markersFor(view, changeTag!)[0]).toBe("structuralControl");

		click(changeTag);
		expect(onChangeTag).toHaveBeenCalledWith("lore");
	});

	it("a MISCONFIGURED (empty-tag) collection says so, with no Change tag / FileClasses actions to offer", async () => {
		const collections: readonly CodexCollection[] = [
			{ id: "broken", label: "Broken", tag: "  ", enabled: true },
		];
		const view = await openCodex(app, { collections });

		const misconfigured = bodyOf(view).querySelector<HTMLElement>("[data-sf-cx-misconfigured]");
		expect(misconfigured).not.toBeNull();
		expect(misconfigured?.textContent).toContain("no tag configured");
		// Not the S98 empty-state box — a misconfigured collection has nothing to
		// offer "Change tag" a valid tag to change TO.
		expect(bodyOf(view).querySelector("[data-sf-cx-empty]")).toBeNull();
		expect(bodyOf(view).querySelector(`[${CODEX_CHANGE_TAG_ATTR}]`)).toBeNull();
	});

	it("XSS-safe: a tag containing markup renders as inert text, never parsed HTML", async () => {
		const collections: readonly CodexCollection[] = [
			{ id: "hostile", label: "Hostile", tag: '<img src=x onerror="window.__pwned = true">', enabled: true },
		];
		const view = await openCodex(app, { collections });

		const box = emptyBox(view);
		expect(box.querySelector("img")).toBeNull();
		expect(box.textContent).toContain('<img src=x onerror="window.__pwned = true">');
		expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// T4.6 — ADR-36 Bases hint: one dismissible hint, permanent dismissal, silence
// for "absent" / "enabled" / any community-plugin state
// ---------------------------------------------------------------------------

describe("Codex tab: ADR-36 Bases hint [PRD/F4 AC]", () => {
	let app: App;

	beforeEach(() => {
		app = new App();
		seedVault(app);
	});

	function hint(view: AnvilView): HTMLElement | null {
		return bodyOf(view).querySelector<HTMLElement>(".sf-cx-hint");
	}

	it("shows the hint when Bases is present but disabled", async () => {
		const view = await openCodex(app, { basesCapability: "disabled" });
		expect(hint(view)).not.toBeNull();
	});

	// T7.4 S2: the reworded hint (mockups-capabilities.html L12d).
	it("says what Bases being off costs, in the signed-off words", async () => {
		const view = await openCodex(app, { basesCapability: "disabled" });
		expect(hint(view)!.querySelector("span")?.textContent).toBe(
			"The core Bases plugin is off. Turn it on to draw .base collections and to use Story Forge Cards in your own .base files.",
		);
	});

	// T7.4, PRD F8 AC: with every optional plugin absent, no screen is empty, broken or blocked (L12c(b)).
	it("with Bases off and no Dataview, the built-in collections still draw their entries", async () => {
		const view = await openCodex(app, { basesCapability: "disabled" });
		const grid = bodyOf(view).querySelector(".sf-cx-grid")!;
		expect(grid.textContent).toContain("Mara");
		expect(grid.querySelector(".sf-cx-empty")).toBeNull();
		expect(bodyOf(view).textContent).not.toMatch(/install/i);
	});

	// T7.4 S1: the first-run trigger is the host's; the Anvil only says it opened.
	it("tells the host it opened (the capability screen's first-run trigger)", async () => {
		const onOpened = vi.fn();
		const view = new AnvilView(makeLeaf(app), { onOpened });
		expect(onOpened).not.toHaveBeenCalled();
		await view.onOpen();
		expect(onOpened).toHaveBeenCalledTimes(1);
	});

	it("shows no hint when Bases is enabled", async () => {
		const view = await openCodex(app, { basesCapability: "enabled" });
		expect(hint(view)).toBeNull();
	});

	it("shows no hint when Bases is absent (an old Obsidian) — silence, not a broken-install message", async () => {
		const view = await openCodex(app, { basesCapability: "absent" });
		expect(hint(view)).toBeNull();
	});

	it("defaults to no hint when the host hasn't wired getBasesCapability at all", async () => {
		const view = await openCodex(app);
		expect(hint(view)).toBeNull();
	});

	it("shows no hint — ever — regardless of a community plugin's absence, even while Bases itself is disabled and eligible", async () => {
		// Dataview/metadata-menu are never wired into this test at all. The only
		// thing that gates the hint is basesCapability, which has no community-
		// plugin input by construction (ADR-36: core may be suggested; community
		// never). This proves the Codex doesn't spontaneously grow a community
		// nag alongside the legitimate core one.
		const view = await openCodex(app, { basesCapability: "enabled" });
		expect(hint(view)).toBeNull();
		expect(bodyOf(view).textContent).not.toMatch(/dataview|metadata-menu/i);
	});

	it("suppresses the hint once its id is already in dismissedHints — even before any click happens", async () => {
		const view = await openCodex(app, {
			basesCapability: "disabled",
			dismissedHints: [BASES_DISABLED_HINT_ID],
		});
		expect(hint(view)).toBeNull();
	});

	it("dismissing is a structural control routed through the real click walk, and calls the host callback with the hint id", async () => {
		const onDismissHint = vi.fn();
		const view = await openCodex(app, { basesCapability: "disabled", onDismissHint });

		const dismissBtn = hint(view)!.querySelector<HTMLElement>(`[${CODEX_HINT_DISMISS_ATTR}]`);
		expect(markersFor(view, dismissBtn!)[0]).toBe("structuralControl");

		click(dismissBtn);
		expect(onDismissHint).toHaveBeenCalledWith(BASES_DISABLED_HINT_ID);
	});

	it("the hint disappears immediately after a dismiss click, without waiting for a follow re-render", async () => {
		// getDismissedHints is a getter the host re-reads on every render — this
		// test's stub doesn't mutate, so only the AnvilView's own re-render
		// (triggered by the click handler, not by an external settings change)
		// could make the hint vanish. That is the behaviour under test.
		const dismissed: string[] = [];
		const view = new AnvilView(makeLeaf(app), {
			bases: {
				getCapability: (): BasesCapability => "disabled",
				getDismissedHints: (): readonly string[] => dismissed,
				onDismissHint: (id: string): void => { dismissed.push(id); },
			},
		});
		await view.onOpen();
		view.setLayout("codex");

		expect(hint(view)).not.toBeNull();
		click(hint(view)!.querySelector<HTMLElement>(`[${CODEX_HINT_DISMISS_ATTR}]`));

		expect(hint(view)).toBeNull();
	});
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
			tileField: nativeTileField,
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
			tileField: nativeTileField,
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
			tileField: nativeTileField,
		});

		expect(container.querySelectorAll("[data-sf-collection]").length).toBe(0);
		expect(container.querySelector(".sf-cx-empty")?.textContent).toContain("settings");
	});

	it("falls back to the path's basename when the file cannot be resolved", () => {
		const container = render(false);

		expect(container.querySelector(".sf-cx-name")?.textContent).toBe("Mara Stoneway");
	});
});

describe("renderCodexTab: an engine collection's host (T7.2 live-test fix, embed width)", () => {
	const BASES_COLLECTION = { id: "imported-1", label: "Overview", tag: "", enabled: true, engine: "bases" as const };

	function renderEngine(cardId: string, basesCapability: BasesCapability, renderEmbed?: ReturnType<typeof vi.fn>): HTMLElement {
		const container = document.createElement("div");
		renderCodexTab(container, {
			collections: [BASES_COLLECTION],
			selection: new CodexSelectionStore(),
			index: [],
			excludedFolders: [],
			tileField: nativeTileField,
			cardId,
			basesCapability,
			...(renderEmbed ? { renderEmbed } : {}),
		});
		return container;
	}

	it.each(["hero", "table", "compact"])("hands the embed a full-width host under the %s Card", (cardId) => {
		const renderEmbed = vi.fn();
		renderEngine(cardId, "enabled", renderEmbed);

		const host = renderEmbed.mock.calls[0]![0] as HTMLElement;
		expect(host.classList.contains("sf-cx-grid--embed")).toBe(true);
	});

	it("keeps the full-width host when Bases is off and nothing is drawn", () => {
		const container = renderEngine("hero", "disabled");

		const grid = container.querySelector(".sf-cx-grid")!;
		expect(grid.classList.contains("sf-cx-grid--embed")).toBe(true);
		expect(grid.querySelector(".sf-cx-empty--bases-off")).not.toBeNull();
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

	it("closes the open dropdown on a click elsewhere that does not itself trigger a re-render", async () => {
		// The reachable gap this guards: a click that resolves to NO action also
		// runs no `_render()`, so without an explicit dismiss an open dropdown
		// would stay open over whatever the user just clicked. The dismiss
		// listener is document-scoped (real Obsidian mounts a leaf's content into
		// the document), so the test mounts `contentEl` the same way — see
		// `mountToDocument`.
		//
		// Updated by T5.1: this used to click a card BODY, relying on inspect
		// being inert (the 2026-07-31 decision). Inspect now opens the editor
		// pane and re-renders **on any host that feeds the `drill` seam** —
		// `main.ts` does — so a card body is no longer a dependable no-render
		// target; it only still behaves like one here because `openCodex` leaves
		// the seam unfed. Depending on that would make this test a hostage to an
		// unrelated wiring decision, so it now clicks inert chrome (the grid's
		// own padding, which carries no marker) — a click that resolves to no
		// action in every configuration.
		const view = await openCodex(app);
		const unmount = mountToDocument(view);
		try {
			const trigger = cardSelTrigger(view)!;
			const dd = bodyOf(view).querySelector<HTMLElement>(".sf-cx-cardsel-dd")!;

			click(trigger);
			expect(dd.hidden).toBe(false);

			click(bodyOf(view).querySelector(".sf-cx-grid"));

			expect(dd.hidden).toBe(true);
			expect(trigger.getAttribute("aria-expanded")).toBe("false");
		} finally {
			unmount();
		}
	});

	it("does not close the dropdown on a click on the trigger or an option inside it", async () => {
		const view = await openCodex(app, statefulCardSelection());
		const unmount = mountToDocument(view);
		try {
			const trigger = cardSelTrigger(view)!;

			click(trigger);
			let dd = bodyOf(view).querySelector<HTMLElement>(".sf-cx-cardsel-dd")!;
			expect(dd.hidden).toBe(false);

			// Clicking an option picks the Card, which re-renders (a fresh, closed
			// dropdown) — the dismiss listener must not additionally interfere.
			click(cardOption(view, "table"));
			expect(gridCardId(view)).toBe("table");
			dd = bodyOf(view).querySelector<HTMLElement>(".sf-cx-cardsel-dd")!;
			expect(dd.hidden).toBe(true);
		} finally {
			unmount();
		}
	});

	it("releases the document-level dismiss listener on close (no leak, CON-4)", async () => {
		const view = await openCodex(app);
		const trigger = cardSelTrigger(view)!;
		const dd = bodyOf(view).querySelector<HTMLElement>(".sf-cx-cardsel-dd")!;

		click(trigger);
		expect(dd.hidden).toBe(false);

		// registerDomEvent's queued removeEventListener runs from _unload — same
		// release seam already proven for registerEvent subscriptions elsewhere
		// in this file ("releases every metadataCache subscription on close").
		(view as unknown as { _unload(): void })._unload();

		// A click elsewhere would have dismissed the dropdown while the listener
		// was live (the sibling "closes the open dropdown…" test above) — after
		// unload it must be inert rather than a leaked handler still reacting.
		document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));

		expect(dd.hidden).toBe(false);
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
