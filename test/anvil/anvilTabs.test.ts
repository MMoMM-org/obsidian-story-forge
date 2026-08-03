/**
 * anvilTabs.test.ts — T2.2 (Phase 2: Anvil shell and navigation).
 *
 * Covers the tab strip's registry (order + labels, `anvilTabs.ts`) and, since a tab strip
 * only means something once it is rendered, the swap / hide / persistence behaviour through
 * `AnvilView` — the same host the M5/M6 suites already exercise. No existing M5/M6 assertion
 * is touched here; this file is additive.
 *
 * T4.1 note: the Codex assertions here used to key off the `.sf-cx-placeholder` stub. That
 * stub is gone — the Codex tab now renders its real body — so they key off `.sf-cx` instead.
 * What this file asserts is unchanged: the strip survives a tab swap and the Codex tab shows
 * Codex content. The body's own behaviour lives in `test/codex/codexTab.test.ts`.
 *
 * @ref docs/mockups/anvil-workbench-codex.html — S91 (tab strip), S94 (Timeline-only controls)
 * @ref docs/XDD/specs/008-codex-surface/requirements.md — Feature F1
 */

import { describe, expect, it, vi } from "vitest";
import { App, WorkspaceLeaf, type TFile } from "obsidian";
import { createMockCachedMetadata, createMockTFile, type CachedMetadata } from "../__mocks__/obsidian";
import { AnvilView } from "anvil/AnvilView";
import { ANVIL_TABS, ANVIL_TAB_LABEL, isAnvilTab } from "anvil/anvilTabs";

// ---- mini scene-vault: just enough for the Anvil to open without a "no scope" branch ----
function makeFixture(): { app: App; book: TFile } {
	const app = new App();
	const book = createMockTFile({ basename: "Wardens of Moonharbor", path: "20 Planning/Wardens of Moonharbor.md" });
	const caches = new Map<TFile, CachedMetadata>([
		[book, createMockCachedMetadata({ tags: [{ tag: "#planning/book" }] })],
	]);
	vi.mocked(app.metadataCache.getFileCache).mockImplementation((f) => caches.get(f) ?? null);
	vi.mocked(app.metadataCache.getFirstLinkpathDest).mockImplementation(() => null);
	vi.mocked(app.vault.getAbstractFileByPath).mockImplementation(() => null);
	vi.mocked(app.vault.getMarkdownFiles).mockReturnValue([book]);
	app.workspace.getActiveFile = vi.fn(() => book);
	return { app, book };
}

function makeView(app: App): AnvilView {
	const leaf = new WorkspaceLeaf();
	(leaf as unknown as { app: App }).app = app;
	return new AnvilView(leaf, { getLinkClickAction: () => "drill", drill: vi.fn() });
}

function body(view: AnvilView): HTMLElement {
	return view.contentEl.querySelector(".sf-ws-body") as HTMLElement;
}

function click(el: Element | null): void {
	if (!el) throw new Error("no element to click");
	el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

describe("anvilTabs registry", () => {
	it("lists the five tabs in mockup S91 order: Codex, Timeline, Plotgrid, Plotlines, Board", () => {
		expect(ANVIL_TABS).toEqual(["codex", "timeline", "plotgrid", "plotlines", "kanban"]);
		expect(ANVIL_TABS.map((t) => ANVIL_TAB_LABEL[t])).toEqual([
			"Codex",
			"Timeline",
			"Plotgrid",
			"Plotlines",
			"Board",
		]);
	});

	it("recognises only registered tabs as valid layout values", () => {
		for (const t of ANVIL_TABS) expect(isAnvilTab(t)).toBe(true);
		expect(isAnvilTab("nonsense")).toBe(false);
		expect(isAnvilTab(undefined)).toBe(false);
	});
});

describe("AnvilView — tab strip (T2.2)", () => {
	it("renders one pill per registry tab, in registry order, with the S91 labels", async () => {
		const { app } = makeFixture();
		const view = makeView(app);
		await view.onOpen();

		const pills = [...view.contentEl.querySelectorAll<HTMLElement>(".sf-ws-toggle .sf-ws-mode")];
		expect(pills.map((p) => p.getAttribute("data-ws-layout"))).toEqual(ANVIL_TABS);
		expect(pills.map((p) => p.textContent)).toEqual(ANVIL_TABS.map((t) => ANVIL_TAB_LABEL[t]));
	});

	it("selecting a tab swaps the body and keeps the strip visible", async () => {
		const { app } = makeFixture();
		const view = makeView(app);
		await view.onOpen();

		view.setLayout("codex");
		expect(view.contentEl.querySelector(".sf-ws-toggle")).not.toBeNull();
		expect(body(view).querySelector(".sf-cx")).not.toBeNull();

		click(view.contentEl.querySelector(`[data-ws-layout="timeline"]`));
		expect(view.contentEl.querySelector(".sf-ws-toggle")).not.toBeNull();
		expect(body(view).querySelector(".sf-cx")).toBeNull();
	});

	it("the codex tab renders the Codex body and no management-tab content", async () => {
		// T4.1 replaced T2.2's "Codex is coming soon" placeholder with the real
		// body (pills + grid). This fixture's vault holds one book note and no
		// canon entities, so the grid shows the collection's empty state — which
		// is still the Codex body, not a management tab.
		const { app } = makeFixture();
		const view = makeView(app);
		await view.onOpen();

		view.setLayout("codex");
		const codex = body(view).querySelector(".sf-cx");
		expect(codex).not.toBeNull();
		expect(codex?.querySelector("[data-sf-collection]")).not.toBeNull();
		expect(body(view).querySelector(".sf-tl-rail, .sf-kb-board, .sf-pg-table, .sf-section")).toBeNull();
	});

	it("Timeline-only controls are hidden on every other tab, including Codex (S94)", async () => {
		const { app } = makeFixture();
		const view = makeView(app);
		await view.onOpen();

		const tlBar = (): HTMLElement | null => view.contentEl.querySelector(".sf-ws-tlbar");
		expect(tlBar()?.classList.contains("sf-ws-tlbar--hidden")).toBe(false);

		for (const tab of ANVIL_TABS.filter((t) => t !== "timeline")) {
			view.setLayout(tab);
			expect(tlBar()?.classList.contains("sf-ws-tlbar--hidden")).toBe(true);
		}

		view.setLayout("timeline");
		expect(tlBar()?.classList.contains("sf-ws-tlbar--hidden")).toBe(false);
	});

	it("keeps the Codex selection (pill + body) across a re-render", async () => {
		const { app } = makeFixture();
		const view = makeView(app);
		await view.onOpen();
		view.setLayout("codex");

		// Simulate the debounced re-render path (active-leaf-change / metadataCache.changed)
		// firing again while Codex stays selected.
		const pv = view as unknown as { _render: () => void };
		pv._render();

		expect(view.contentEl.querySelector(`.sf-ws-mode--sel[data-ws-layout="codex"]`)).not.toBeNull();
		expect(body(view).querySelector(".sf-cx")).not.toBeNull();
	});
});
