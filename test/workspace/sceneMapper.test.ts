/**
 * sceneMapper.test.ts — M5 Phase 2 (RED).
 *
 * The impure adapter: a scene TFile → SceneRow, reading metadataCache frontmatter +
 * frontmatterLinks and resolving pov/location/characters basenames and the beat alias.
 *
 * @ref docs/XDD/specs/006-declarative-views/plan/phase-2.md (T2.2)
 * @ref SDD/ADR-11 (beat → act label)
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	App,
	createMockCachedMetadata,
	createMockFrontmatterLink,
	createMockTFile,
	type CachedMetadata,
} from "../__mocks__/obsidian";
import { mapSceneRow } from "workspace/sceneMapper";

describe("mapSceneRow", () => {
	let app: App;

	beforeEach(() => {
		app = new App();
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue(null);
		vi.mocked(app.metadataCache.getFirstLinkpathDest).mockReturnValue(null);
	});

	it("maps flat fields, resolves relation basenames, and reads the beat alias", () => {
		const scene = createMockTFile({
			basename: "Scene 1 - The Extinguished Fire",
			path: "10 Manuscript/Wardens of Moonharbor/Scene 1 - The Extinguished Fire.md",
		});
		const mara = createMockTFile({ basename: "Mara Stoneway", path: "30 Canon/31 Characters/Mara Stoneway.md" });
		const tobias = createMockTFile({ basename: "Tobias Ferro", path: "30 Canon/31 Characters/Tobias Ferro.md" });
		const lighthouse = createMockTFile({ basename: "Moonharbor Lighthouse", path: "30 Canon/32 Locations/Moonharbor Lighthouse.md" });
		const beat = createMockTFile({ basename: "201 🎬 The Failing Light", path: "20 Planning/201 🎬 The Failing Light.md" });

		vi.mocked(app.metadataCache.getFileCache).mockImplementation((f): CachedMetadata | null => {
			if (f === scene) {
				return createMockCachedMetadata({
					frontmatter: {
						title: "The Extinguished Fire",
						act: 1,
						chapter: "1",
						order: 1,
						storyDay: 1,
						when: "Night 1",
						status: "draft",
						wordcount: 210,
					},
					frontmatterLinks: [
						createMockFrontmatterLink("pov", "Mara Stoneway"),
						createMockFrontmatterLink("characters.0", "Mara Stoneway"),
						createMockFrontmatterLink("characters.1", "Tobias Ferro"),
						createMockFrontmatterLink("location", "Moonharbor Lighthouse"),
						createMockFrontmatterLink("plotlines.0", "The Dying Light"),
						createMockFrontmatterLink("beat", "201 🎬 The Failing Light"),
					],
				});
			}
			if (f === beat) {
				return createMockCachedMetadata({
					frontmatter: { title: "🎬 The Failing Light", aliases: ["The Failing Light"] },
				});
			}
			return null;
		});
		vi.mocked(app.metadataCache.getFirstLinkpathDest).mockImplementation((link) => {
			if (link === "Mara Stoneway") return mara;
			if (link === "Tobias Ferro") return tobias;
			if (link === "Moonharbor Lighthouse") return lighthouse;
			if (link === "201 🎬 The Failing Light") return beat;
			return null; // "The Dying Light" left unresolved on purpose
		});

		const rowResult = mapSceneRow(app, scene);
		expect(rowResult.file).toBe(scene);
		expect(rowResult.title).toBe("The Extinguished Fire");
		expect(rowResult.act).toBe(1);
		expect(rowResult.order).toBe(1);
		expect(rowResult.storyDay).toBe(1);
		expect(rowResult.when).toBe("Night 1");
		expect(rowResult.status).toBe("draft");
		expect(rowResult.wordcount).toBe(210);
		expect(rowResult.pov).toEqual({ name: "Mara Stoneway", path: mara.path });
		expect(rowResult.location).toEqual({ name: "Moonharbor Lighthouse", path: lighthouse.path });
		expect(rowResult.characters).toEqual([
			{ name: "Mara Stoneway", path: mara.path },
			{ name: "Tobias Ferro", path: tobias.path },
		]);
		expect(rowResult.plotlines).toEqual(["The Dying Light"]); // raw, unresolved kept
		expect(rowResult.plotline).toEqual({ name: "The Dying Light", path: "" }); // unresolved → no path
		expect(rowResult.beat).toBe("201 🎬 The Failing Light");
		expect(rowResult.beatName).toBe("The Failing Light"); // from alias
		expect(rowResult.beatPath).toBe(beat.path);
	});

	it("falls back to the emoji-stripped beat title when the beat has no alias", () => {
		const scene = createMockTFile({ basename: "S", path: "S.md" });
		const beat = createMockTFile({ basename: "b", path: "20 Planning/b.md" });
		vi.mocked(app.metadataCache.getFileCache).mockImplementation((f): CachedMetadata | null => {
			if (f === scene) {
				return createMockCachedMetadata({
					frontmatter: { act: 2 },
					frontmatterLinks: [createMockFrontmatterLink("beat", "b")],
				});
			}
			if (f === beat) return createMockCachedMetadata({ frontmatter: { title: "🎬 The Gathering Dark" } });
			return null;
		});
		vi.mocked(app.metadataCache.getFirstLinkpathDest).mockImplementation((link) => (link === "b" ? beat : null));

		expect(mapSceneRow(app, scene).beatName).toBe("The Gathering Dark");
	});

	it("uses placeholders for a bare scene (no frontmatter) and title = basename", () => {
		const scene = createMockTFile({ basename: "Untitled Scene", path: "Untitled Scene.md" });
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue(createMockCachedMetadata({}));

		const rowResult = mapSceneRow(app, scene);
		expect(rowResult.title).toBe("Untitled Scene");
		expect(rowResult.act).toBeNull();
		expect(rowResult.order).toBeNull();
		expect(rowResult.storyDay).toBeNull();
		expect(rowResult.when).toBe("");
		expect(rowResult.status).toBe("");
		expect(rowResult.pov).toBeNull();
		expect(rowResult.location).toBeNull();
		expect(rowResult.characters).toEqual([]);
		expect(rowResult.plotline).toBeNull();
		expect(rowResult.plotlines).toEqual([]);
		expect(rowResult.beat).toBe("");
		expect(rowResult.beatName).toBe("");
		expect(rowResult.beatPath).toBe("");
		expect(rowResult.wordcount).toBeNull();
	});

	it("leaves beatName empty when the beat link is unresolved", () => {
		const scene = createMockTFile({ basename: "S", path: "S.md" });
		vi.mocked(app.metadataCache.getFileCache).mockImplementation((f): CachedMetadata | null =>
			f === scene
				? createMockCachedMetadata({ frontmatterLinks: [createMockFrontmatterLink("beat", "Ghost Beat")] })
				: null,
		);
		vi.mocked(app.metadataCache.getFirstLinkpathDest).mockReturnValue(null);

		const rowResult = mapSceneRow(app, scene);
		expect(rowResult.beat).toBe("Ghost Beat");
		expect(rowResult.beatName).toBe("");
	});
});
