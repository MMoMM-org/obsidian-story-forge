/**
 * SidebarView.navigator.test.ts — M5 Phase 4 (RED).
 *
 * The Navigator as a fixed 3rd tab in SidebarView: renders scoped scenes, drills a
 * scene click into the Context tab, filters by plotline, and persists collapse.
 *
 * @ref docs/XDD/specs/006-declarative-views/plan/phase-4.md
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { App, WorkspaceLeaf, type TFile } from "obsidian";
import {
	createMockCachedMetadata,
	createMockFrontmatterLink,
	createMockTFile,
	type CachedMetadata,
} from "../__mocks__/obsidian";
import { SidebarView } from "views/SidebarView";
import { NativeScopingEngine } from "engines/NativeScopingEngine";
import { SIDEBAR_VIEW_TYPE, NAVIGATOR_TAB_ID } from "pluginConstants";

const CTX_TAB_ID = "__context__";

// ---- mini scene-vault ------------------------------------------------------
const book = createMockTFile({ basename: "Wardens of Moonharbor", path: "20 Planning/Wardens of Moonharbor.md" });
const dying = createMockTFile({ basename: "The Dying Light", path: "20 Planning/The Dying Light.md" });
const oath = createMockTFile({ basename: "The Warden's Oath", path: "20 Planning/The Warden's Oath.md" });
const s1 = createMockTFile({ basename: "Scene 1", path: "10 Manuscript/WoM/Scene 1.md" });
const s2 = createMockTFile({ basename: "Scene 2", path: "10 Manuscript/WoM/Scene 2.md" });
const s3 = createMockTFile({ basename: "Scene 3", path: "10 Manuscript/WoM/Scene 3.md" });

function tag(t: string): CachedMetadata {
	return createMockCachedMetadata({ tags: [{ tag: t }] });
}

function sceneCache(act: number, order: number, status: string, plotline: string): CachedMetadata {
	return createMockCachedMetadata({
		tags: [{ tag: "#manuscript/scene" }],
		frontmatter: { type: "scene", act, order, status, when: "Night 1" },
		frontmatterLinks: [
			createMockFrontmatterLink("book", "Wardens of Moonharbor"),
			createMockFrontmatterLink("plotlines.0", plotline),
		],
	});
}

function makeLeaf(app: App): WorkspaceLeaf {
	const leaf = new WorkspaceLeaf();
	(leaf as unknown as { app: App }).app = app;
	leaf.view.getViewType = vi.fn(() => SIDEBAR_VIEW_TYPE);
	return leaf;
}

function body(view: SidebarView): HTMLElement {
	return view.contentEl.querySelector(".sf-body") as HTMLElement;
}

function selectNavigator(view: SidebarView): void {
	const tab = view.contentEl.querySelector(`[data-view-id="${NAVIGATOR_TAB_ID}"]`) as HTMLElement;
	tab.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

function click(el: Element | null): void {
	if (!el) throw new Error("no element to click");
	el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

describe("SidebarView Navigator tab", () => {
	let app: App;
	let view: SidebarView;
	let activeFile: TFile | null;

	beforeEach(async () => {
		app = new App();
		activeFile = book;

		const caches = new Map<TFile, CachedMetadata>([
			[book, tag("#planning/book")],
			[dying, tag("#planning/plotline")],
			[oath, tag("#planning/plotline")],
			[s1, sceneCache(1, 1, "draft", "The Dying Light")],
			[s2, sceneCache(1, 2, "draft", "The Dying Light")],
			[s3, sceneCache(2, 3, "outline", "The Warden's Oath")],
		]);
		const byPath = new Map<string, TFile>(
			[book, dying, oath, s1, s2, s3].map((f) => [f.path, f]),
		);
		const byLink = new Map<string, TFile>([
			["Wardens of Moonharbor", book],
			["The Dying Light", dying],
			["The Warden's Oath", oath],
		]);

		vi.mocked(app.metadataCache.getFileCache).mockImplementation((f) => caches.get(f) ?? null);
		vi.mocked(app.metadataCache.getFirstLinkpathDest).mockImplementation((l) => byLink.get(l) ?? null);
		vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((p) => byPath.get(p) ?? null);
		vi.mocked(app.vault.getMarkdownFiles).mockReturnValue([book, dying, oath, s1, s2, s3]);
		app.metadataCache.resolvedLinks = {
			"10 Manuscript/WoM/Scene 1.md": { "20 Planning/Wardens of Moonharbor.md": 1, "20 Planning/The Dying Light.md": 1 },
			"10 Manuscript/WoM/Scene 2.md": { "20 Planning/Wardens of Moonharbor.md": 1, "20 Planning/The Dying Light.md": 1 },
			"10 Manuscript/WoM/Scene 3.md": { "20 Planning/Wardens of Moonharbor.md": 1, "20 Planning/The Warden's Oath.md": 1 },
		};
		app.workspace.getActiveFile = vi.fn(() => activeFile);

		view = new SidebarView(makeLeaf(app), undefined, undefined, new NativeScopingEngine(app), undefined, () => "drill");
		await view.onOpen();
	});

	it("renders a Navigator tab that shows scoped scenes when selected", () => {
		const tab = view.contentEl.querySelector(`[data-view-id="${NAVIGATOR_TAB_ID}"]`);
		expect(tab).not.toBeNull();

		selectNavigator(view);
		expect(body(view).querySelector(".sf-nav-filter")).not.toBeNull();
		// book scope → the three scenes linking the book (templates excluded)
		expect(body(view).querySelectorAll(".sf-nav-sc-row")).toHaveLength(3);
	});

	it("drills a scene click into the Context tab", () => {
		selectNavigator(view);
		click(body(view).querySelector(`[data-sf-link="${s1.path}"]`));

		const pv = view as unknown as { subject: { file: TFile | null; source: string }; selectedViewId: string | null };
		expect(pv.subject.file?.path).toBe(s1.path);
		expect(pv.subject.source).toBe("drilled");
		expect(pv.selectedViewId).toBeNull();
		const ctxTab = view.contentEl.querySelector(`[data-view-id="${CTX_TAB_ID}"]`);
		expect(ctxTab?.getAttribute("aria-selected")).toBe("true");
	});

	it("filters the scene list by plotline and clears via the All row", () => {
		selectNavigator(view);
		click(body(view).querySelector(`[data-sf-plotline="The Warden's Oath"]`));

		let b = body(view);
		expect(b.querySelector(".sf-nav-pl-row--sel")?.getAttribute("data-sf-plotline")).toBe("The Warden's Oath");
		expect(b.querySelectorAll(".sf-nav-sc-row")).toHaveLength(1); // only Scene 3

		click(b.querySelector(`[data-sf-plotline=""]`)); // All
		b = body(view);
		expect((view as unknown as { _navFilter: string | null })._navFilter).toBeNull();
		expect(b.querySelectorAll(".sf-nav-sc-row")).toHaveLength(3);
	});

	it("persists collapse across a re-render (ADR-6/F8)", () => {
		selectNavigator(view);
		click(body(view).querySelector(`[data-sf-group-key="act:1"]`));

		const pv = view as unknown as {
			_collapse: { isCollapsed: (s: string, sc: string, g: string) => boolean };
			_navScopeKey: string;
		};
		expect(pv._collapse.isCollapsed("navigator", pv._navScopeKey, "act:1")).toBe(true);

		// Force a re-render (toggle a filter) — the act:1 section comes back collapsed.
		click(body(view).querySelector(`[data-sf-plotline=""]`));
		const head = body(view).querySelector(`[data-sf-group-key="act:1"]`)?.closest(".sf-section");
		expect(head?.querySelector(".sf-sec-body")?.classList.contains("sf-sec-body--collapsed")).toBe(true);
	});
});
