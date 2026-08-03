/**
 * workspaceScope.test.ts — M5 Phase 2 (RED).
 *
 * The scope seam: active note → {book|plotline|none} + the in-scope scene TFiles.
 * Reuses ScopingService (classify + resolve/backlinks) internally; the mock wires a
 * faithful mini-vault (resolvedLinks reverse index + per-file caches).
 *
 * @ref docs/XDD/specs/006-declarative-views/plan/phase-2.md (T2.1)
 * @ref SDD/ADR-4; PRD/F3
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	App,
	createMockCachedMetadata,
	createMockFrontmatterLink,
	createMockTFile,
	type CachedMetadata,
	type TFile,
} from "../__mocks__/obsidian";
import { resolveWorkspaceScope, resolvePlotlineScope, DEFAULT_EXCLUDED_FOLDERS } from "scoping/workspaceScope";

// Mini-vault fixtures
const book = createMockTFile({ basename: "Wardens of Moonharbor", path: "20 Planning/Wardens of Moonharbor.md" });
const plotline = createMockTFile({ basename: "The Dying Light", path: "20 Planning/The Dying Light.md" });
const scene1 = createMockTFile({ basename: "Scene 1", path: "10 Manuscript/WoM/Scene 1.md" });
const scene2 = createMockTFile({ basename: "Scene 2", path: "10 Manuscript/WoM/Scene 2.md" });
const template = createMockTFile({ basename: "scene", path: "00 Meta/Templates/scene.md" }); // excluded
const character = createMockTFile({ basename: "Mara Stoneway", path: "30 Canon/Mara Stoneway.md" });

function sceneCache(): CachedMetadata {
	return createMockCachedMetadata({
		tags: [{ tag: "#manuscript/scene" }],
		frontmatter: { type: "scene" },
		frontmatterLinks: [
			createMockFrontmatterLink("book", "Wardens of Moonharbor"),
			createMockFrontmatterLink("plotlines.0", "The Dying Light"),
		],
	});
}

function tagCache(tag: string): CachedMetadata {
	return createMockCachedMetadata({ tags: [{ tag }] });
}

function titlesOf(files: TFile[]): string[] {
	return files.map((f) => f.basename).sort();
}

describe("resolveWorkspaceScope", () => {
	let app: App;

	beforeEach(() => {
		app = new App();

		const cacheByFile = new Map<TFile, CachedMetadata>([
			[book, tagCache("#planning/book")],
			[plotline, tagCache("#planning/plotline")],
			[scene1, sceneCache()],
			[scene2, sceneCache()],
			[template, sceneCache()], // template classifies as a scene → must be excluded by folder
			[character, tagCache("#canon/character")],
		]);
		const byPath = new Map<string, TFile>(
			[book, plotline, scene1, scene2, template, character].map((f) => [f.path, f]),
		);
		const byLink = new Map<string, TFile>([
			["Wardens of Moonharbor", book],
			["The Dying Light", plotline],
		]);

		vi.mocked(app.metadataCache.getFileCache).mockImplementation((f) => cacheByFile.get(f) ?? null);
		vi.mocked(app.metadataCache.getFirstLinkpathDest).mockImplementation((link) => byLink.get(link) ?? null);
		vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((p) => byPath.get(p) ?? null);
		vi.mocked(app.vault.getMarkdownFiles).mockReturnValue([book, plotline, scene1, scene2, template, character]);

		// Reverse index: which sources link which targets. The template also "links" the book.
		app.metadataCache.resolvedLinks = {
			"10 Manuscript/WoM/Scene 1.md": { "20 Planning/Wardens of Moonharbor.md": 1, "20 Planning/The Dying Light.md": 1 },
			"10 Manuscript/WoM/Scene 2.md": { "20 Planning/Wardens of Moonharbor.md": 1, "20 Planning/The Dying Light.md": 1 },
			"00 Meta/Templates/scene.md": { "20 Planning/Wardens of Moonharbor.md": 1 },
		};
	});

	it("scopes a book note to the scenes whose `book` links it", () => {
		const { scope, scenes } = resolveWorkspaceScope(app, book);
		expect(scope).toEqual({ kind: "book", ref: book });
		expect(titlesOf(scenes)).toEqual(["Scene 1", "Scene 2"]); // template excluded (00 Meta)
	});

	it("scopes a plotline note to the scenes whose `plotlines` link it", () => {
		const { scope, scenes } = resolveWorkspaceScope(app, plotline);
		expect(scope).toEqual({ kind: "plotline", ref: plotline });
		expect(titlesOf(scenes)).toEqual(["Scene 1", "Scene 2"]);
	});

	it("scopes a scene note to its book's scenes", () => {
		const { scope, scenes } = resolveWorkspaceScope(app, scene1);
		expect(scope).toEqual({ kind: "book", ref: book });
		expect(titlesOf(scenes)).toEqual(["Scene 1", "Scene 2"]);
	});

	it("falls back to whole-vault scenes for a non-story note (kind none)", () => {
		const { scope, scenes } = resolveWorkspaceScope(app, character);
		expect(scope).toEqual({ kind: "none" });
		expect(titlesOf(scenes)).toEqual(["Scene 1", "Scene 2"]); // template still excluded
	});

	it("falls back to whole-vault scenes when there is no active note", () => {
		const { scope, scenes } = resolveWorkspaceScope(app, null);
		expect(scope).toEqual({ kind: "none" });
		expect(titlesOf(scenes)).toEqual(["Scene 1", "Scene 2"]);
	});

	it("never surfaces notes under an excluded folder (00 Meta)", () => {
		const scenes = resolveWorkspaceScope(app, book).scenes;
		expect(scenes).not.toContain(template);
	});

	it("never throws on an empty/unindexed vault", () => {
		const bare = new App();
		vi.mocked(bare.metadataCache.getFileCache).mockReturnValue(null);
		vi.mocked(bare.metadataCache.getFirstLinkpathDest).mockReturnValue(null);
		vi.mocked(bare.vault.getMarkdownFiles).mockReturnValue([]);
		expect(() => resolveWorkspaceScope(bare, null)).not.toThrow();
		const out = resolveWorkspaceScope(bare, scene1);
		expect(out.scope).toEqual({ kind: "none" });
		expect(out.scenes).toEqual([]);
	});

	// -------------------------------------------------------------------------
	// T3.5 — excludedFolders threaded as a parameter (PluginSettings.excludedFolders)
	// -------------------------------------------------------------------------

	it("with no excludedFolders argument, behaves IDENTICALLY to passing the shipped default explicitly", () => {
		const implicit = resolveWorkspaceScope(app, book);
		const explicit = resolveWorkspaceScope(app, book, DEFAULT_EXCLUDED_FOLDERS);
		expect(titlesOf(implicit.scenes)).toEqual(titlesOf(explicit.scenes));
		expect(titlesOf(implicit.scenes)).toEqual(["Scene 1", "Scene 2"]); // template (00 Meta) still excluded
		expect(implicit.scope).toEqual(explicit.scope);
	});

	it("a custom excludedFolders list excludes DIFFERENT notes than the default", () => {
		// Exclude the manuscript folder instead of 00 Meta: the two real scenes
		// disappear, and the template (00 Meta) — excluded by the DEFAULT — is
		// no longer excluded by this custom list, so it now surfaces instead.
		const { scenes } = resolveWorkspaceScope(app, book, ["10 Manuscript"]);
		expect(titlesOf(scenes)).toEqual(["scene"]); // only the template note (basename "scene")
	});

	it("an empty excludedFolders list excludes nothing", () => {
		const { scenes } = resolveWorkspaceScope(app, book, []);
		// All three scene-classified notes linking the book surface, including
		// the template that the shipped default normally hides.
		expect(titlesOf(scenes)).toEqual(["Scene 1", "Scene 2", "scene"]);
	});
});

describe("resolvePlotlineScope", () => {
	it("returns all plotline-type notes in scope as Link objects sorted by name", () => {
		const app = new App();
		const pl1 = createMockTFile({ basename: "Zephyr Arc", path: "20 Planning/Zephyr Arc.md" });
		const pl2 = createMockTFile({ basename: "Alpha Arc", path: "20 Planning/Alpha Arc.md" });
		const scene = createMockTFile({ basename: "Scene 1", path: "10 Manuscript/WoM/Scene 1.md" });
		const meta = createMockTFile({ basename: "Plotline Template", path: "00 Meta/Plotline Template.md" });

		vi.mocked(app.metadataCache.getFileCache).mockImplementation((f) => {
			if (f === pl1 || f === pl2) return createMockCachedMetadata({ tags: [{ tag: "#planning/plotline" }] });
			if (f === scene) return createMockCachedMetadata({ tags: [{ tag: "#manuscript/scene" }] });
			if (f === meta) return createMockCachedMetadata({ tags: [{ tag: "#planning/plotline" }] });
			return null;
		});
		vi.mocked(app.vault.getMarkdownFiles).mockReturnValue([pl1, pl2, scene, meta]);

		const result = resolvePlotlineScope(app);

		// Should contain both plotlines sorted by name, meta excluded
		expect(result.map((l) => l.name)).toEqual(["Alpha Arc", "Zephyr Arc"]);
		expect(result[0]).toEqual({ name: "Alpha Arc", path: "20 Planning/Alpha Arc.md" });
		expect(result[1]).toEqual({ name: "Zephyr Arc", path: "20 Planning/Zephyr Arc.md" });
		// Meta template excluded (under 00 Meta)
		expect(result.some((l) => l.name === "Plotline Template")).toBe(false);
		// Scene not included (wrong kind)
		expect(result.some((l) => l.name === "Scene 1")).toBe(false);
	});

	// -------------------------------------------------------------------------
	// T3.5 — excludedFolders threaded as a parameter (PluginSettings.excludedFolders)
	// -------------------------------------------------------------------------

	function makePlotlineFixture(): { app: App; pl1: TFile; pl2: TFile; meta: TFile } {
		const app = new App();
		const pl1 = createMockTFile({ basename: "Zephyr Arc", path: "20 Planning/Zephyr Arc.md" });
		const pl2 = createMockTFile({ basename: "Alpha Arc", path: "20 Planning/Alpha Arc.md" });
		const meta = createMockTFile({ basename: "Plotline Template", path: "00 Meta/Plotline Template.md" });

		vi.mocked(app.metadataCache.getFileCache).mockImplementation((f) => {
			if (f === pl1 || f === pl2 || f === meta) {
				return createMockCachedMetadata({ tags: [{ tag: "#planning/plotline" }] });
			}
			return null;
		});
		vi.mocked(app.vault.getMarkdownFiles).mockReturnValue([pl1, pl2, meta]);
		return { app, pl1, pl2, meta };
	}

	it("with no excludedFolders argument, behaves IDENTICALLY to passing the shipped default explicitly", () => {
		const { app } = makePlotlineFixture();
		const implicit = resolvePlotlineScope(app);
		const explicit = resolvePlotlineScope(app, DEFAULT_EXCLUDED_FOLDERS);
		expect(implicit).toEqual(explicit);
		expect(implicit.map((l) => l.name)).toEqual(["Alpha Arc", "Zephyr Arc"]); // 00 Meta template excluded
	});

	it("a custom excludedFolders list excludes DIFFERENT notes than the default", () => {
		const { app } = makePlotlineFixture();
		// Exclude "20 Planning" instead of "00 Meta": both real plotlines
		// disappear, and the template — excluded by the DEFAULT — now surfaces.
		const result = resolvePlotlineScope(app, ["20 Planning"]);
		expect(result.map((l) => l.name)).toEqual(["Plotline Template"]);
	});

	it("an empty excludedFolders list excludes nothing", () => {
		const { app } = makePlotlineFixture();
		const result = resolvePlotlineScope(app, []);
		expect(result.map((l) => l.name)).toEqual(["Alpha Arc", "Plotline Template", "Zephyr Arc"]);
	});

	it("returns empty array on empty vault", () => {
		const app = new App();
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue(null);
		vi.mocked(app.vault.getMarkdownFiles).mockReturnValue([]);
		expect(resolvePlotlineScope(app)).toEqual([]);
	});
});
