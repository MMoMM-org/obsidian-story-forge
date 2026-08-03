/**
 * SidebarView.excludedFolders.test.ts — code-review fix (spec 008-codex-surface, T3.5).
 *
 * Regression coverage for the `getExcludedFolders` seam: SidebarView reads the getter on
 * every Navigator render and threads it into `resolveWorkspaceScope`. Before this test,
 * nothing asserted that the argument actually reaches the call — reverting
 * `SidebarView.ts:1231` to `resolveWorkspaceScope(this.app, activeFile)` (dropping the
 * third argument) would pass every other suite.
 *
 * The fixture places a scene under "99 Archive", a folder NOT covered by the shipped
 * default (`DEFAULT_EXCLUDED_FOLDERS = ["00 Meta"]`). A view constructed with the default
 * getter must still include it in the Navigator's scene list; a view constructed with a
 * custom `getExcludedFolders` returning `["99 Archive"]` must exclude it. Only threading
 * the live getter through to the resolve call can produce that difference.
 *
 * @ref docs/XDD/specs/008-codex-surface/plan/phase-3.md §T3.5
 * @ref src/scoping/workspaceScope.ts — resolveWorkspaceScope
 * @ref src/views/SidebarView.ts:253,1231 — the getExcludedFolders seam
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

const book = createMockTFile({ basename: "Wardens of Moonharbor", path: "20 Planning/Wardens of Moonharbor.md" });
const plotline = createMockTFile({ basename: "The Dying Light", path: "20 Planning/The Dying Light.md" });
const sKept = createMockTFile({ basename: "Scene 1", path: "10 Manuscript/WoM/Scene 1.md" });
const sArchived = createMockTFile({ basename: "Scene 2", path: "99 Archive/Scene 2.md" });

function tag(t: string): CachedMetadata {
	return createMockCachedMetadata({ tags: [{ tag: t }] });
}

function sceneCache(): CachedMetadata {
	return createMockCachedMetadata({
		tags: [{ tag: "#manuscript/scene" }],
		frontmatter: { type: "scene", act: 1, order: 1, status: "draft", when: "Night 1" },
		frontmatterLinks: [
			createMockFrontmatterLink("book", "Wardens of Moonharbor"),
			createMockFrontmatterLink("plotlines.0", "The Dying Light"),
		],
	});
}

function makeFixture(): App {
	const app = new App();
	const caches = new Map<TFile, CachedMetadata>([
		[book, tag("#planning/book")],
		[plotline, tag("#planning/plotline")],
		[sKept, sceneCache()],
		[sArchived, sceneCache()],
	]);
	const byPath = new Map<string, TFile>(
		[book, plotline, sKept, sArchived].map((f) => [f.path, f]),
	);
	const byLink = new Map<string, TFile>([
		["Wardens of Moonharbor", book],
		["The Dying Light", plotline],
	]);

	vi.mocked(app.metadataCache.getFileCache).mockImplementation((f) => caches.get(f) ?? null);
	vi.mocked(app.metadataCache.getFirstLinkpathDest).mockImplementation((l) => byLink.get(l) ?? null);
	vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((p) => byPath.get(p) ?? null);
	vi.mocked(app.vault.getMarkdownFiles).mockReturnValue([book, plotline, sKept, sArchived]);
	app.metadataCache.resolvedLinks = {
		"10 Manuscript/WoM/Scene 1.md": {
			"20 Planning/Wardens of Moonharbor.md": 1,
			"20 Planning/The Dying Light.md": 1,
		},
		"99 Archive/Scene 2.md": {
			"20 Planning/Wardens of Moonharbor.md": 1,
			"20 Planning/The Dying Light.md": 1,
		},
	};
	app.workspace.getActiveFile = vi.fn(() => book);
	return app;
}

function makeLeaf(app: App): WorkspaceLeaf {
	const leaf = new WorkspaceLeaf();
	(leaf as unknown as { app: App }).app = app;
	leaf.view.getViewType = vi.fn(() => SIDEBAR_VIEW_TYPE);
	return leaf;
}

function makeView(app: App, getExcludedFolders?: () => readonly string[]): SidebarView {
	return new SidebarView(
		makeLeaf(app),
		undefined,
		undefined,
		new NativeScopingEngine(app),
		undefined,
		() => "drill",
		getExcludedFolders,
	);
}

function body(view: SidebarView): HTMLElement {
	return view.contentEl.querySelector(".sf-body") as HTMLElement;
}

function selectNavigator(view: SidebarView): void {
	const tab = view.contentEl.querySelector(`[data-view-id="${NAVIGATOR_TAB_ID}"]`) as HTMLElement;
	tab.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

describe("SidebarView Navigator — getExcludedFolders seam (T3.5 regression)", () => {
	let app: App;

	beforeEach(() => {
		app = makeFixture();
	});

	it("the default getter includes a scene under a non-excluded custom folder", async () => {
		const view = makeView(app);
		await view.onOpen();
		selectNavigator(view);
		expect(body(view).querySelectorAll(".sf-nav-sc-row")).toHaveLength(2);
	});

	it("a custom getExcludedFolders excludes the scene under that folder", async () => {
		const view = makeView(app, () => ["99 Archive"]);
		await view.onOpen();
		selectNavigator(view);
		expect(body(view).querySelectorAll(".sf-nav-sc-row")).toHaveLength(1);
	});
});
