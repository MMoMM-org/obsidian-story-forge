/**
 * editorPane.test.ts — T5.1 (spec 008-codex-surface, Phase 5).
 *
 * The editor pane's SHELL: the three docks (S92 bottom, S99 right, S100
 * fullscreen), the header tools, and the wiring that finally makes the Anvil's
 * `inspect` do something.
 *
 * Everything is driven through a **real `AnvilView`**, never by calling
 * `renderEditorPane` with hand-made arguments, for the same reason
 * `codexTab.test.ts` gives: what this task must get right is only observable
 * end to end — a click is classified by the real `walkTargetMarkers` over the
 * really-rendered DOM, resolved by the real `NavigationController`, and enacted
 * by the host. A direct renderer call would prove nothing about any of it.
 *
 * Three of these tests exist because a criterion had no watcher:
 *  - **the dock never changes on a resize** (ADR-33) — nothing in the code
 *    would fail if someone added a resize handler tomorrow;
 *  - **switching collection never leaves a note from the previous collection
 *    on screen** (PRD/F3) — vacuously true while `_render` emptied the body
 *    wholesale, and this task is the one that introduces pane state capable of
 *    breaking it;
 *  - **the tab strip survives fullscreen** — the Anvil must never be a trap.
 *
 * @ref docs/XDD/specs/008-codex-surface/requirements.md — Features F2, F3, F5
 * @ref docs/XDD/specs/008-codex-surface/solution.md — ADR-28, ADR-33
 * @ref docs/mockups/anvil-workbench-codex.html — S92, S99, S100
 */

import { describe, expect, it, vi } from "vitest";
import { App, WorkspaceLeaf, type TFile } from "obsidian";
import {
	createMockCachedMetadata,
	createMockFrontmatterLink,
	createMockTFile,
	type CachedMetadata,
} from "../__mocks__/obsidian";
import { AnvilView, type AnvilLayout } from "anvil/AnvilView";
import { EDITOR_PATH_ATTR, EditorPaneStore, type EditorDock, type EditorPaneMode } from "editor/editorPane";

// ---------------------------------------------------------------------------
// Fixture: canon entries (the Codex half) + a two-scene book (every other tab)
// ---------------------------------------------------------------------------

const mara = createMockTFile({ basename: "Mara Stoneway", path: "30 Canon/31 Characters/Mara Stoneway.md" });
const tobias = createMockTFile({ basename: "Tobias Ferro", path: "30 Canon/31 Characters/Tobias Ferro.md" });
const harbor = createMockTFile({ basename: "Moonharbor", path: "30 Canon/32 Locations/Moonharbor.md" });
const book = createMockTFile({ basename: "Wardens of Moonharbor", path: "20 Planning/Wardens of Moonharbor.md" });
const dying = createMockTFile({ basename: "The Dying Light", path: "20 Planning/The Dying Light.md" });
const s1 = createMockTFile({ basename: "Scene 1", path: "10 Manuscript/WoM/Scene 1.md" });
const s2 = createMockTFile({ basename: "Scene 2", path: "10 Manuscript/WoM/Scene 2.md" });

const FILES: readonly TFile[] = [mara, tobias, harbor, book, dying, s1, s2];

function canon(kind: string, extra?: Record<string, unknown>): CachedMetadata {
	return createMockCachedMetadata({ frontmatter: { tags: [`canon/${kind}`], ...extra } });
}

function tagged(t: string): CachedMetadata {
	return createMockCachedMetadata({ tags: [{ tag: t }] });
}

function sceneCache(order: number): CachedMetadata {
	return createMockCachedMetadata({
		tags: [{ tag: "#manuscript/scene" }],
		frontmatter: { type: "scene", act: 1, order, status: "draft", when: "Night 1" },
		frontmatterLinks: [
			createMockFrontmatterLink("book", "Wardens of Moonharbor"),
			createMockFrontmatterLink("plotlines.0", "The Dying Light"),
		],
	});
}

function seedVault(app: App): void {
	const caches = new Map<TFile, CachedMetadata>([
		[mara, canon("character", { role: "protagonist" })],
		[tobias, canon("character", { role: "supporting" })],
		[harbor, canon("location")],
		[book, tagged("#planning/book")],
		[dying, tagged("#planning/plotline")],
		[s1, sceneCache(1)],
		[s2, sceneCache(2)],
	]);
	const byPath = new Map<string, TFile>(FILES.map((f) => [f.path, f]));
	const byLink = new Map<string, TFile>([
		["Wardens of Moonharbor", book],
		["The Dying Light", dying],
		["Mara Stoneway", mara],
	]);

	vi.mocked(app.metadataCache.getFileCache).mockImplementation((f) => caches.get(f) ?? null);
	vi.mocked(app.metadataCache.getFirstLinkpathDest).mockImplementation((l) => byLink.get(l) ?? null);
	vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((p) => byPath.get(p) ?? null);
	vi.mocked(app.vault.getMarkdownFiles).mockReturnValue([...FILES]);
	app.metadataCache.resolvedLinks = {
		"10 Manuscript/WoM/Scene 1.md": {
			"20 Planning/Wardens of Moonharbor.md": 1,
			"20 Planning/The Dying Light.md": 1,
		},
		"10 Manuscript/WoM/Scene 2.md": {
			"20 Planning/Wardens of Moonharbor.md": 1,
			"20 Planning/The Dying Light.md": 1,
		},
	};
	app.workspace.getActiveFile = vi.fn(() => book);
	app.workspace.openLinkText = vi.fn(async () => {});
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

/**
 * A stand-in for `PluginSettings.editorDock` plus its write-through — the same
 * getter/callback pair `main.ts` supplies. Tests assert against `changes` to
 * prove a dock switch is always a deliberate, host-persisted act (ADR-33).
 */
function dockStore(initial: EditorDock = "bottom"): {
	getDock: () => EditorDock;
	onDockChange: (dock: EditorDock) => void;
	changes: EditorDock[];
} {
	let dock = initial;
	const changes: EditorDock[] = [];
	return {
		getDock: (): EditorDock => dock,
		onDockChange: (next: EditorDock): void => {
			dock = next;
			changes.push(next);
		},
		changes,
	};
}

/**
 * A view wired exactly as `main.ts` wires it: the `drill` seam fed with this
 * view's own `inspect`.
 *
 * The seam is fed HERE rather than defaulted inside `AnvilView`, and that is
 * deliberate (ruling on the T5.1 review). A default of `this.inspect(file)`
 * would make the construction site's injection unobservable — deleting it from
 * `main.ts` would break nothing — and "a name click is no longer a no-op" is
 * precisely the criterion that has to be falsifiable. `main.editorPane.test.ts`
 * is what watches the real construction site; this file exercises the pane's
 * behaviour given a wired host, and "does nothing when the seam is unfed"
 * below pins the default down so it cannot quietly grow back.
 */
async function openAnvil(
	app: App,
	opts: { dock?: ReturnType<typeof dockStore>; layout?: AnvilLayout } = {},
): Promise<AnvilView> {
	const leaf = new WorkspaceLeaf();
	(leaf as unknown as { app: App }).app = app;
	const view: AnvilView = new AnvilView(leaf, {
		drill: (file) => { view.inspect(file); },
		...(opts.dock ? { editor: { getDock: opts.dock.getDock, onDockChange: opts.dock.onDockChange } } : {}),
	});
	await view.onOpen();
	view.setLayout(opts.layout ?? "codex");
	return view;
}

/** A view with the drill seam left unfed — the pre-T5.1 default (2026-07-31). */
async function openUnwiredAnvil(app: App): Promise<AnvilView> {
	const leaf = new WorkspaceLeaf();
	(leaf as unknown as { app: App }).app = app;
	const view = new AnvilView(leaf);
	await view.onOpen();
	view.setLayout("codex");
	return view;
}

function bodyOf(view: AnvilView): HTMLElement {
	return view.contentEl.querySelector(".sf-ws-body") as HTMLElement;
}

function pane(view: AnvilView): HTMLElement | null {
	return bodyOf(view).querySelector<HTMLElement>(".sf-ed");
}

function panePath(view: AnvilView): string | null {
	// Via the exported constant, so renaming the attribute breaks here rather
	// than silently in a host that reads it.
	return pane(view)?.getAttribute(EDITOR_PATH_ATTR) ?? null;
}

/** Card wrappers currently marked as the open entry (S92/S99's `.hero.sel`). */
function selectedCardPaths(view: AnvilView): string[] {
	return Array.from(bodyOf(view).querySelectorAll<HTMLElement>("[data-sf-card-body].sf-cx-card--sel")).map(
		(el) => el.getAttribute("data-sf-card-body") ?? "",
	);
}

function tool(view: AnvilView, name: string): HTMLElement | null {
	return bodyOf(view).querySelector<HTMLElement>(`[data-sf-ed-tool="${name}"]`);
}

function cardPaths(view: AnvilView): string[] {
	return Array.from(bodyOf(view).querySelectorAll<HTMLElement>("[data-sf-card-body]")).map(
		(el) => el.getAttribute("data-sf-card-body") ?? "",
	);
}

/** The card body element for `path` — a plain click on it inspects (PRD/F2). */
function cardBody(view: AnvilView, path: string): HTMLElement | null {
	return bodyOf(view).querySelector<HTMLElement>(`[data-sf-card-body="${path}"]`);
}

/** The name element for `path` — nested INSIDE its card body (ADR-28 proximity). */
function nameEl(view: AnvilView, path: string): HTMLElement | null {
	return bodyOf(view).querySelector<HTMLElement>(`[data-sf-link="${path}"]`);
}

function collectionPill(view: AnvilView, id: string): HTMLElement | null {
	return bodyOf(view).querySelector<HTMLElement>(`[data-sf-collection="${id}"]`);
}

function click(el: Element | null, opts: { ctrl?: boolean } = {}): void {
	if (!el) throw new Error("no element to click");
	el.dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: opts.ctrl ?? false }));
}

/** Open the pane on Mara the way a user does: a plain click on her name. */
function inspectMara(view: AnvilView): void {
	click(nameEl(view, mara.path));
}

// ---------------------------------------------------------------------------
// Opening (PRD/F5 AC, PRD/F2 AC)
// ---------------------------------------------------------------------------

describe("editor pane — opening (T5.1)", () => {
	it("opens showing the selected entry when a Codex entry's name is clicked", async () => {
		const app = new App();
		seedVault(app);
		const view = await openAnvil(app);

		expect(pane(view)).toBeNull();
		inspectMara(view);

		expect(panePath(view)).toBe(mara.path);
		expect(pane(view)?.textContent).toContain("Mara Stoneway");
	});

	it("opens on a plain click on the card BODY, not only on the name", async () => {
		const app = new App();
		seedVault(app);
		const view = await openAnvil(app);

		click(cardBody(view, tobias.path));

		expect(panePath(view)).toBe(tobias.path);
	});

	it("does nothing when the drill seam is unfed — no default may stand in for the wiring", async () => {
		const app = new App();
		seedVault(app);
		const view = await openUnwiredAnvil(app);

		click(nameEl(view, mara.path));
		click(cardBody(view, tobias.path));

		// The seam is the contract: a host that wants inspection wires it. If
		// `AnvilView` ever defaults `drill` to its own `inspect`, this fails —
		// and so does the whole point of injecting it in `main.ts`, since
		// deleting that injection would then change nothing observable.
		expect(pane(view)).toBeNull();
		expect(app.workspace.openLinkText).not.toHaveBeenCalled();
	});

	it("opens no other leaf and reveals nothing when inspecting (PRD/F2)", async () => {
		const app = new App();
		seedVault(app);
		const view = await openAnvil(app);

		inspectMara(view);

		expect(app.workspace.openLinkText).not.toHaveBeenCalled();
		expect(app.workspace.revealLeaf).not.toHaveBeenCalled();
		expect(app.workspace.getLeaf).not.toHaveBeenCalled();
	});

	it("still opens the note in a leaf on a modifier click, rather than the pane", async () => {
		const app = new App();
		seedVault(app);
		const view = await openAnvil(app);

		click(cardBody(view, mara.path), { ctrl: true });

		expect(pane(view)).toBeNull();
		expect(app.workspace.openLinkText).toHaveBeenCalledWith(mara.path, "", false);
	});

	it.each<AnvilLayout>(["timeline", "plotgrid", "plotlines", "kanban"])(
		"reaches the pane from a name click in the %s tab",
		async (layout) => {
			const app = new App();
			seedVault(app);
			const view = await openAnvil(app, { layout });

			const name = bodyOf(view).querySelector<HTMLElement>(`[data-sf-link="${s1.path}"]`);
			expect(name).not.toBeNull();
			click(name);

			expect(panePath(view)).toBe(s1.path);
		},
	);
});

// ---------------------------------------------------------------------------
// Docks and tools (PRD/F5 AC, ADR-33, S92/S99/S100)
// ---------------------------------------------------------------------------

describe("editor pane — docks and tools (T5.1)", () => {
	it("closes back to the full grid", async () => {
		const app = new App();
		seedVault(app);
		const view = await openAnvil(app);
		inspectMara(view);

		click(tool(view, "close"));

		expect(pane(view)).toBeNull();
		expect(bodyOf(view).querySelector(".sf-cx-split")).toBeNull();
		expect(cardPaths(view)).toEqual([mara.path, tobias.path]);
	});

	it("docks beside a single card column when the dock is 'right' (S99)", async () => {
		const app = new App();
		seedVault(app);
		const view = await openAnvil(app, { dock: dockStore("right") });
		inspectMara(view);

		const split = bodyOf(view).querySelector<HTMLElement>(".sf-cx-split");
		expect(split).not.toBeNull();
		expect(split?.querySelector(".sf-cx-split-left .sf-cx-grid")).not.toBeNull();
		expect(split?.querySelector(".sf-cx-split-right .sf-ed")).not.toBeNull();
		// Every entry stays reachable in the column beside the pane.
		expect(
			Array.from(split!.querySelectorAll<HTMLElement>(".sf-cx-split-left [data-sf-card-body]")).map((el) =>
				el.getAttribute("data-sf-card-body"),
			),
		).toEqual([mara.path, tobias.path]);
	});

	it("keeps the collection chrome full width above the split, not inside the column (S99)", async () => {
		const app = new App();
		seedVault(app);
		const view = await openAnvil(app, { dock: dockStore("right") });
		inspectMara(view);

		const cats = bodyOf(view).querySelector<HTMLElement>(".sf-cx-cats");
		expect(cats).not.toBeNull();
		// S99 draws `.cx-cats` above `.cx-split`; only the card grid is in the
		// left column. Nesting the pill row in a 236px column wraps four pills
		// onto three rows — and the Card selector's absolutely-positioned
		// dropdown would be CLIPPED by the column's `overflow: auto`, breaking a
		// control T4.4 shipped working.
		expect(bodyOf(view).querySelector(".sf-cx-split-left .sf-cx-cats")).toBeNull();
		expect(bodyOf(view).querySelector(".sf-cx-split-left .sf-cx-cardsel")).toBeNull();
		expect(cats?.closest(".sf-cx-split")).toBeNull();
		// The split is inside the Codex body, below the chrome — not wrapped
		// around the whole tab.
		expect(bodyOf(view).querySelector<HTMLElement>(".sf-cx-split")?.closest(".sf-cx")).not.toBeNull();
	});

	it.each<EditorPaneMode>(["bottom", "right", "fullscreen"])(
		"keeps the pane outside the zoom-scaled element in the %s dock",
		async (mode) => {
			const app = new App();
			seedVault(app);
			const view = await openAnvil(app, { dock: dockStore(mode === "right" ? "right" : "bottom") });
			inspectMara(view);
			if (mode === "fullscreen") click(tool(view, "fullscreen"));

			// `.sf-zoom-scaled` carries `transform: scale(var(--sf-zoom))`, and
			// zoom is reachable from every layout. A pane inside it would scale
			// with the grid, scroll inside `.sf-zoom-wrap`, and — because a
			// non-`none` transform creates a containing block — silently become
			// the anchor for any absolutely-positioned control T5.2 adds. The
			// editor is a form, not a zoomable canvas.
			expect(pane(view)?.closest(".sf-zoom-scaled") ?? null).toBeNull();
		},
	);

	it("keeps the card grid zoomable beside the pane in the right dock", async () => {
		const app = new App();
		seedVault(app);
		const view = await openAnvil(app, { dock: dockStore("right") });
		inspectMara(view);

		// The other half of the same rule: the grid has zoomed since Phase 4 and
		// keeps doing so — the pane moves out of the transform, the grid does not.
		expect(bodyOf(view).querySelector(".sf-cx-grid")?.closest(".sf-zoom-scaled") ?? null).not.toBeNull();
	});

	it("zooms the Codex chrome in the bottom dock but not in the right dock", async () => {
		const app = new App();
		seedVault(app);
		const bottom = await openAnvil(app, { dock: dockStore("bottom") });
		inspectMara(bottom);
		const right = await openAnvil(app, { dock: dockStore("right") });
		inspectMara(right);

		// Resolved once, and asserted present: "absent" and "present but not
		// zoomed" must not collapse into the same `false`, or this test would
		// pass vacuously if the chrome ever stopped rendering.
		const zoomed = (view: AnvilView, sel: string): boolean => {
			const el = bodyOf(view).querySelector(sel);
			expect(el, `expected ${sel} to be rendered`).not.toBeNull();
			return el!.closest(".sf-zoom-scaled") !== null;
		};

		// Deliberate asymmetry, pinned so it cannot drift unnoticed. In the right
		// dock the zoom wraps the GRID ALONE (it has to: the pane must stay out
		// of the transform, and S99 keeps the chrome full width above the split),
		// so the pill row and Card selector no longer scale there. Every other
		// dock is unchanged — the whole tab still scales.
		expect(zoomed(bottom, ".sf-cx-cats")).toBe(true);
		expect(zoomed(bottom, ".sf-cx-cardsel")).toBe(true);
		expect(zoomed(right, ".sf-cx-cats")).toBe(false);
		expect(zoomed(right, ".sf-cx-cardsel")).toBe(false);
	});

	it.each<EditorDock>(["bottom", "right"])(
		"marks the open entry's card as selected in the %s dock (S92/S99)",
		async (dock) => {
			const app = new App();
			seedVault(app);
			const view = await openAnvil(app, { dock: dockStore(dock) });

			expect(selectedCardPaths(view)).toEqual([]);
			inspectMara(view);

			// Without this the dock=right column beside the pane gives no cue
			// which of its entries is being edited (S92:658 / S99:714 `hero sel`).
			expect(selectedCardPaths(view)).toEqual([mara.path]);

			click(cardBody(view, tobias.path));
			expect(selectedCardPaths(view)).toEqual([tobias.path]);

			click(tool(view, "close"));
			expect(selectedCardPaths(view)).toEqual([]);
		},
	);

	it.each<AnvilLayout>(["timeline", "plotgrid", "plotlines", "kanban"])(
		"docks right in the %s tab without confining the layout to the card column",
		async (layout) => {
			const app = new App();
			seedVault(app);
			const view = await openAnvil(app, { dock: dockStore("right"), layout });

			click(bodyOf(view).querySelector(`[data-sf-link="${s1.path}"]`));

			// These four must never get the Codex's fixed card column — the
			// reasoning lives with the 236px itself, on `.sf-cx-split-left` in
			// styles.css. Reachable because `editorDock` persists: dock right in
			// the Codex, click Timeline, land here.
			expect(bodyOf(view).querySelector(".sf-cx-split-left")).toBeNull();
			expect(bodyOf(view).querySelector(".sf-cx-split")).toBeNull();
			expect(bodyOf(view).querySelector(`.sf-ws-split-left [data-sf-link="${s1.path}"]`)).not.toBeNull();
			expect(bodyOf(view).querySelector(".sf-ws-split-right .sf-ed")).not.toBeNull();
			expect(pane(view)?.closest(".sf-zoom-scaled") ?? null).toBeNull();
		},
	);

	it("switches dock only when the dock tool is used, persisting through the host", async () => {
		const app = new App();
		seedVault(app);
		const dock = dockStore("bottom");
		const view = await openAnvil(app, { dock });
		inspectMara(view);

		expect(bodyOf(view).querySelector(".sf-cx-split")).toBeNull();
		expect(dock.changes).toEqual([]);

		click(tool(view, "dock"));

		expect(dock.changes).toEqual(["right"]);
		expect(bodyOf(view).querySelector(".sf-cx-split-right .sf-ed")).not.toBeNull();

		click(tool(view, "dock"));

		expect(dock.changes).toEqual(["right", "bottom"]);
		expect(bodyOf(view).querySelector(".sf-cx-split")).toBeNull();
	});

	it("takes the grid's space in fullscreen (S100)", async () => {
		const app = new App();
		seedVault(app);
		const view = await openAnvil(app);
		inspectMara(view);

		click(tool(view, "fullscreen"));

		expect(pane(view)?.classList.contains("sf-ed--fullscreen")).toBe(true);
		expect(bodyOf(view).querySelector(".sf-cx-grid")).toBeNull();
		expect(cardPaths(view)).toEqual([]);
	});

	it.each<EditorDock>(["bottom", "right"])(
		"returns from fullscreen to the previous dock (%s) via Back",
		async (initial) => {
			const app = new App();
			seedVault(app);
			const dock = dockStore(initial);
			const view = await openAnvil(app, { dock });
			inspectMara(view);
			click(tool(view, "fullscreen"));

			click(tool(view, "back"));

			expect(panePath(view)).toBe(mara.path);
			expect(pane(view)?.classList.contains(`sf-ed--${initial}`)).toBe(true);
			expect(Boolean(bodyOf(view).querySelector(".sf-cx-split"))).toBe(initial === "right");
			expect(cardPaths(view)).toEqual([mara.path, tobias.path]);
			// Back is a mode change, never a dock change (ADR-33).
			expect(dock.changes).toEqual([]);
		},
	);

	it("keeps the tab strip visible in fullscreen so the Anvil is never a trap", async () => {
		const app = new App();
		seedVault(app);
		const view = await openAnvil(app);
		inspectMara(view);
		click(tool(view, "fullscreen"));

		const tabs = Array.from(view.contentEl.querySelectorAll<HTMLElement>("[data-ws-layout]"));
		expect(tabs.map((t) => t.getAttribute("data-ws-layout"))).toEqual([
			"codex",
			"timeline",
			"plotgrid",
			"plotlines",
			"kanban",
		]);
	});

	it("leaves fullscreen when a tab is used, so the strip is not merely decorative", async () => {
		const app = new App();
		seedVault(app);
		const dock = dockStore("bottom");
		const view = await openAnvil(app, { dock });
		inspectMara(view);
		click(tool(view, "fullscreen"));

		click(view.contentEl.querySelector('[data-ws-layout="timeline"]'));

		// The requested layout is actually shown...
		expect(bodyOf(view).querySelector(`[data-sf-link="${s1.path}"]`)).not.toBeNull();
		// ...and the pane is still open, just back in its dock (a mode change,
		// never a dock change — ADR-33, guarded on this path too and not only
		// on `back`).
		expect(panePath(view)).toBe(mara.path);
		expect(pane(view)?.classList.contains("sf-ed--bottom")).toBe(true);
		expect(dock.changes).toEqual([]);
	});

	it("never changes the dock on a window resize (ADR-33)", async () => {
		const app = new App();
		seedVault(app);
		const dock = dockStore("right");
		const view = await openAnvil(app, { dock });
		inspectMara(view);

		(window as unknown as { innerWidth: number }).innerWidth = 320;
		window.dispatchEvent(new Event("resize"));
		(window as unknown as { innerWidth: number }).innerWidth = 2560;
		window.dispatchEvent(new Event("resize"));

		expect(dock.changes).toEqual([]);
		expect(bodyOf(view).querySelector(".sf-cx-split-right .sf-ed")).not.toBeNull();
		expect(pane(view)?.classList.contains("sf-ed--right")).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// The one-line branches (watchers, so a later task cannot invert them silently)
// ---------------------------------------------------------------------------

describe("editor pane — edges (T5.1)", () => {
	it("ignores a tool marker carrying an unrecognised value", async () => {
		const app = new App();
		seedVault(app);
		const dock = dockStore("bottom");
		const view = await openAnvil(app, { dock });
		inspectMara(view);

		// The attribute is a DOM string, so it is narrowed rather than trusted
		// (CON-8). An unknown value must do nothing at all — not close, not
		// dock, not throw.
		const before = pane(view);
		const bogus = before!.ownerDocument.createElement("span");
		bogus.setAttribute("data-sf-ed-tool", "self-destruct");
		before!.appendChild(bogus);
		click(bogus);

		// Node IDENTITY, not just state: dropping the narrowing leaves the
		// switch matching nothing but still runs `_render()`, which rebuilds the
		// body — same path, different node. Asserting the path alone cannot see
		// that, so it is the wasted re-render this pins.
		expect(pane(view)).toBe(before);
		expect(panePath(view)).toBe(mara.path);
		expect(dock.changes).toEqual([]);
	});

	it("falls back to the path as the title when the note no longer resolves", async () => {
		const app = new App();
		seedVault(app);
		const view = await openAnvil(app);
		inspectMara(view);
		expect(pane(view)?.querySelector(".sf-ed-title")?.textContent).toBe("Mara Stoneway");

		// The store holds a path, not a TFile, so an unresolvable target must
		// degrade to showing the path rather than throwing. (Closing the pane on
		// a deleted note is T5.4's — this only pins the render.)
		vi.mocked(app.vault.getAbstractFileByPath).mockReturnValue(null);
		view.setLayout("codex");

		expect(pane(view)?.querySelector(".sf-ed-title")?.textContent).toBe(mara.path);
		expect(panePath(view)).toBe(mara.path);
	});

	it("operates a pane tool from the keyboard, like every other control", async () => {
		const app = new App();
		seedVault(app);
		const view = await openAnvil(app);
		inspectMara(view);

		// A synthetic keydown reaches the delegated router whether or not the
		// element can be focused, so the affordance has to be asserted on the
		// markup as well — otherwise deleting `tabindex="0"` leaves a tool that
		// no keyboard user can reach and the whole suite stays green.
		const close = tool(view, "close")!;
		expect(close.getAttribute("tabindex")).toBe("0");
		expect(close.getAttribute("role")).toBe("button");

		close.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

		expect(pane(view)).toBeNull();
	});
});

describe("EditorPaneStore (T5.1)", () => {
	it("keeps fullscreen when a different entry is opened", () => {
		const store = new EditorPaneStore();
		store.open("a.md");
		store.toggleFullscreen();

		store.open("b.md");

		// Inspecting a second entry while fullscreen must not throw the user
		// back to the grid. Unreachable from the Anvil today (fullscreen shows
		// no grid to click), so it is pinned here rather than left to a later
		// task to invert unnoticed.
		expect(store.path).toBe("b.md");
		expect(store.mode("bottom")).toBe("fullscreen");
	});

	it("leaves fullscreen on close, so the next open starts in its dock", () => {
		const store = new EditorPaneStore();
		store.open("a.md");
		store.toggleFullscreen();

		store.close();
		store.open("b.md");

		expect(store.mode("right")).toBe("right");
	});
});

// ---------------------------------------------------------------------------
// Pane state vs. the grid (PRD/F3 AC — the criterion that had no owner)
// ---------------------------------------------------------------------------

describe("editor pane — collection switching (T5.1, PRD/F3)", () => {
	it("never shows a note from the previous collection after a collection switch", async () => {
		const app = new App();
		seedVault(app);
		const view = await openAnvil(app);
		inspectMara(view);
		expect(panePath(view)).toBe(mara.path);

		click(collectionPill(view, "location"));

		// The pane either closed or retargeted — it must not still be Mara, who
		// belongs to the collection we just left.
		const shown = panePath(view);
		expect(shown).not.toBe(mara.path);
		if (shown !== null) expect(cardPaths(view)).toContain(shown);
		expect(cardPaths(view)).toEqual([harbor.path]);
	});

	it("keeps the pane open across an unrelated re-render (following the active note)", async () => {
		const app = new App();
		seedVault(app);
		const view = await openAnvil(app);
		inspectMara(view);

		// A follow re-render is not a collection switch — the pane survives it.
		view.setLayout("codex");

		expect(panePath(view)).toBe(mara.path);
	});

	it("drops pane state on close so a reopened view starts on the grid", async () => {
		const app = new App();
		seedVault(app);
		const view = await openAnvil(app);
		inspectMara(view);

		await view.onClose();
		await view.onOpen();
		view.setLayout("codex");

		expect(pane(view)).toBeNull();
		expect(cardPaths(view)).toEqual([mara.path, tobias.path]);
	});
});
