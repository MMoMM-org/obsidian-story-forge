/**
 * AnvilView.excludedFolders.test.ts — code-review fix (spec 008-codex-surface, T3.5).
 *
 * Regression coverage for the `getExcludedFolders` seam: AnvilView reads the getter on
 * every render and threads it into both `resolveWorkspaceScope` (Timeline) and
 * `resolvePlotlineScope` (Plotgrid). Before this test, nothing asserted that the
 * argument actually reaches those calls — reverting `AnvilView.ts` to
 * `resolveWorkspaceScope(this.app, f)` (dropping the third argument) would pass every
 * other suite.
 *
 * The fixture places a scene and a plotline under "99 Archive", a folder NOT covered by
 * the shipped default (`DEFAULT_EXCLUDED_FOLDERS = ["00 Meta"]`). A view constructed
 * with the default getter must still include them; a view constructed with a custom
 * `getExcludedFolders` returning `["99 Archive"]` must exclude them. Only threading the
 * live getter through to the resolve calls can produce that difference.
 *
 * @ref docs/XDD/specs/008-codex-surface/plan/phase-3.md §T3.5
 * @ref src/scoping/workspaceScope.ts — resolveWorkspaceScope / resolvePlotlineScope
 * @ref src/anvil/AnvilView.ts:125,297,331 — the getExcludedFolders seam
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { App, WorkspaceLeaf, type TFile } from "obsidian";
import {
	createMockCachedMetadata,
	createMockFrontmatterLink,
	createMockTFile,
	type CachedMetadata,
} from "../__mocks__/obsidian";
import { AnvilView } from "anvil/AnvilView";

const book = createMockTFile({ basename: "Wardens of Moonharbor", path: "20 Planning/Wardens of Moonharbor.md" });
const plKept = createMockTFile({ basename: "The Dying Light", path: "20 Planning/The Dying Light.md" });
const plArchived = createMockTFile({ basename: "Archived Plot", path: "99 Archive/Archived Plot.md" });
const sKept = createMockTFile({ basename: "Scene 1", path: "10 Manuscript/WoM/Scene 1.md" });
const sArchived = createMockTFile({ basename: "Scene 2", path: "99 Archive/Scene 2.md" });

function tag(t: string): CachedMetadata {
	return createMockCachedMetadata({ tags: [{ tag: t }] });
}

function sceneCache(plotline: string): CachedMetadata {
	return createMockCachedMetadata({
		tags: [{ tag: "#manuscript/scene" }],
		frontmatter: { type: "scene", act: 1, order: 1, status: "draft", when: "Night 1" },
		frontmatterLinks: [
			createMockFrontmatterLink("book", "Wardens of Moonharbor"),
			createMockFrontmatterLink("plotlines.0", plotline),
		],
	});
}

function makeFixture(): App {
	const app = new App();
	const caches = new Map<TFile, CachedMetadata>([
		[book, tag("#planning/book")],
		[plKept, tag("#planning/plotline")],
		[plArchived, tag("#planning/plotline")],
		[sKept, sceneCache("The Dying Light")],
		[sArchived, sceneCache("Archived Plot")],
	]);
	const byPath = new Map<string, TFile>(
		[book, plKept, plArchived, sKept, sArchived].map((f) => [f.path, f]),
	);
	const byLink = new Map<string, TFile>([
		["Wardens of Moonharbor", book],
		["The Dying Light", plKept],
		["Archived Plot", plArchived],
	]);

	vi.mocked(app.metadataCache.getFileCache).mockImplementation((f) => caches.get(f) ?? null);
	vi.mocked(app.metadataCache.getFirstLinkpathDest).mockImplementation((l) => byLink.get(l) ?? null);
	vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((p) => byPath.get(p) ?? null);
	vi.mocked(app.vault.getMarkdownFiles).mockReturnValue([book, plKept, plArchived, sKept, sArchived]);
	app.metadataCache.resolvedLinks = {
		"10 Manuscript/WoM/Scene 1.md": {
			"20 Planning/Wardens of Moonharbor.md": 1,
			"20 Planning/The Dying Light.md": 1,
		},
		"99 Archive/Scene 2.md": {
			"20 Planning/Wardens of Moonharbor.md": 1,
			"99 Archive/Archived Plot.md": 1,
		},
	};
	app.workspace.getActiveFile = vi.fn(() => book);
	return app;
}

function makeView(app: App, getExcludedFolders?: () => readonly string[]): AnvilView {
	const leaf = new WorkspaceLeaf();
	(leaf as unknown as { app: App }).app = app;
	return new AnvilView(leaf, { drill: vi.fn(), settings: { getLinkClickAction: () => "drill", getExcludedFolders } });
}

function body(view: AnvilView): HTMLElement {
	return view.contentEl.querySelector(".sf-ws-body") as HTMLElement;
}

describe("AnvilView — getExcludedFolders seam (T3.5 regression)", () => {
	let app: App;

	beforeEach(() => {
		app = makeFixture();
	});

	it("Timeline: the default getter includes a scene under a non-excluded custom folder", async () => {
		const view = makeView(app);
		await view.onOpen();
		expect(body(view).querySelectorAll(".sf-tl-card")).toHaveLength(2);
	});

	it("Timeline: a custom getExcludedFolders excludes the scene under that folder", async () => {
		const view = makeView(app, () => ["99 Archive"]);
		await view.onOpen();
		expect(body(view).querySelectorAll(".sf-tl-card")).toHaveLength(1);
	});

	it("Plotgrid: the default getter includes a plotline column under a non-excluded custom folder", async () => {
		const view = makeView(app);
		await view.onOpen();
		view.setLayout("plotgrid");
		expect(body(view).querySelectorAll("[data-sf-plotline-col]")).toHaveLength(2);
		expect(body(view).querySelector('[data-sf-plotline-col="Archived Plot"]')).not.toBeNull();
	});

	it("Plotgrid: a custom getExcludedFolders drops the plotline column under that folder", async () => {
		const view = makeView(app, () => ["99 Archive"]);
		await view.onOpen();
		view.setLayout("plotgrid");
		expect(body(view).querySelectorAll("[data-sf-plotline-col]")).toHaveLength(1);
		expect(body(view).querySelector('[data-sf-plotline-col="Archived Plot"]')).toBeNull();
	});
});
