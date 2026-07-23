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
import { resolveWorkspaceScope } from "scoping/workspaceScope";

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
});
