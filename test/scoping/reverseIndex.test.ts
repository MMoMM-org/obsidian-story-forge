/**
 * T2.1 — reverseIndex: buildBacklinks
 *
 * Tests the reverse-relation backlink algorithm.
 * buildBacklinks scans resolvedLinks in metadataCache to find all files
 * that link to the subject, then discriminates typed vs. fuzzy backlinks
 * via frontmatterLinks.
 *
 * ADR-1 / ADR-8: resolvedLinks provides a pre-computed reverse index;
 * frontmatterLinks identifies typed (field-bearing) references; body-only
 * links are fuzzy and only emitted for object/lore subjects.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	App,
	createMockCachedMetadata,
	createMockFrontmatterLink,
	createMockTFile,
	TFile,
} from "../__mocks__/obsidian";
import { buildBacklinks } from "../../src/scoping/reverseIndex";
import type { EntityKind, ResolvedEntity } from "../../src/scoping/NoteContext";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Classify stub: reads _mockKind set on the file by makeFile(). */
function classify(file: TFile): EntityKind {
	return (file as { _mockKind?: EntityKind })._mockKind ?? "unknown";
}

// ---------------------------------------------------------------------------
// Test-scoped app + helpers
// ---------------------------------------------------------------------------

describe("buildBacklinks", () => {
	let app: App;

	beforeEach(() => {
		app = new App();
		// Default stubs
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue(null);
		vi.mocked(app.metadataCache.getFirstLinkpathDest).mockReturnValue(null);
		vi.mocked(app.vault.getAbstractFileByPath).mockReturnValue(null);
		// Start with empty resolvedLinks
		app.metadataCache.resolvedLinks = {};
	});

	// -------------------------------------------------------------------------
	// Helpers used by multiple tests
	// -------------------------------------------------------------------------

	/** Create a TFile mock that also carries an EntityKind for the classify stub. */
	function makeFile(path: string, kind: EntityKind): TFile & { _mockKind: EntityKind } {
		const file = createMockTFile({ path }) as TFile & { _mockKind: EntityKind };
		file._mockKind = kind;
		return file;
	}

	/** Wire resolvedLinks so srcPath → subjectPath appears in the index. */
	function wireResolvedLink(srcPath: string, destPath: string, count = 1): void {
		if (!app.metadataCache.resolvedLinks[srcPath]) {
			app.metadataCache.resolvedLinks[srcPath] = {};
		}
		app.metadataCache.resolvedLinks[srcPath][destPath] = count;
	}

	// -------------------------------------------------------------------------
	// Character subject — typed backlinks via pov and characters fields
	// -------------------------------------------------------------------------

	it("emits typed backlinks for a character subject linked via 'pov' and 'characters' fields", () => {
		const maraFile = makeFile("30 Canon/31 Characters/Mara Stoneway.md", "character");
		const sceneFile = makeFile("10 Manuscript/Scene 1.md", "scene");

		// resolvedLinks: Scene 1 → Mara (count 2: appears in both pov and characters)
		wireResolvedLink(sceneFile.path, maraFile.path, 2);

		// vault lookup: srcPath → TFile
		vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((path) => {
			if (path === sceneFile.path) return sceneFile;
			return null;
		});

		// Scene 1's cache: frontmatterLinks reference Mara via pov AND characters.0
		vi.mocked(app.metadataCache.getFileCache).mockImplementation((f) => {
			if (f === sceneFile) {
				return createMockCachedMetadata({
					tags: [{ tag: "#manuscript/scene" }],
					frontmatterLinks: [
						createMockFrontmatterLink("pov", "Mara Stoneway"),
						createMockFrontmatterLink("characters.0", "Mara Stoneway"),
					],
				});
			}
			return null;
		});

		// getFirstLinkpathDest: "Mara Stoneway" → maraFile
		vi.mocked(app.metadataCache.getFirstLinkpathDest).mockImplementation((link) => {
			if (link === "Mara Stoneway") return maraFile;
			return null;
		});

		const backlinks = buildBacklinks(app, maraFile, "character", classify);

		expect(backlinks).toHaveLength(2);

		const povBacklink = backlinks.find((b) => b.field === "pov");
		expect(povBacklink).toBeDefined();
		expect(povBacklink?.file).toBe(sceneFile);
		expect(povBacklink?.kind).toBe<EntityKind>("scene");
		expect(povBacklink?.relation).toBe("backlink");
		expect(povBacklink?.fuzzy).toBeUndefined();

		const charBacklink = backlinks.find((b) => b.field === "characters");
		expect(charBacklink).toBeDefined();
		expect(charBacklink?.file).toBe(sceneFile);
		expect(charBacklink?.kind).toBe<EntityKind>("scene");
		expect(charBacklink?.relation).toBe("backlink");
		expect(charBacklink?.fuzzy).toBeUndefined();
	});

	// -------------------------------------------------------------------------
	// Location subject — backlinks from scene via location field, and from
	// a child location via world field
	// -------------------------------------------------------------------------

	it("emits backlinks for a location subject referenced via 'location' and 'world' fields", () => {
		const lighthouseFile = makeFile("30 Canon/32 Locations/Moonharbor Lighthouse.md", "location");
		const sceneFile = makeFile("10 Manuscript/Scene 1.md", "scene");
		const portFile = makeFile("30 Canon/32 Locations/Moonharbor Port.md", "location");

		wireResolvedLink(sceneFile.path, lighthouseFile.path, 1);
		wireResolvedLink(portFile.path, lighthouseFile.path, 1);

		vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((path) => {
			if (path === sceneFile.path) return sceneFile;
			if (path === portFile.path) return portFile;
			return null;
		});

		vi.mocked(app.metadataCache.getFileCache).mockImplementation((f) => {
			if (f === sceneFile) {
				return createMockCachedMetadata({
					tags: [{ tag: "#manuscript/scene" }],
					frontmatterLinks: [
						createMockFrontmatterLink("location", "Moonharbor Lighthouse"),
					],
				});
			}
			if (f === portFile) {
				return createMockCachedMetadata({
					tags: [{ tag: "#canon/location" }],
					frontmatterLinks: [
						createMockFrontmatterLink("world", "Moonharbor Lighthouse"),
					],
				});
			}
			return null;
		});

		vi.mocked(app.metadataCache.getFirstLinkpathDest).mockImplementation((link) => {
			if (link === "Moonharbor Lighthouse") return lighthouseFile;
			return null;
		});

		const backlinks = buildBacklinks(app, lighthouseFile, "location", classify);

		expect(backlinks).toHaveLength(2);

		const sceneBacklink = backlinks.find((b) => b.field === "location");
		expect(sceneBacklink?.file).toBe(sceneFile);
		expect(sceneBacklink?.kind).toBe<EntityKind>("scene");
		expect(sceneBacklink?.relation).toBe("backlink");

		const worldBacklink = backlinks.find((b) => b.field === "world");
		expect(worldBacklink?.file).toBe(portFile);
		expect(worldBacklink?.kind).toBe<EntityKind>("location");
		expect(worldBacklink?.relation).toBe("backlink");
	});

	// -------------------------------------------------------------------------
	// Object subject — body-only link → fuzzy:true backlink
	// -------------------------------------------------------------------------

	it("emits a fuzzy:true backlink when an object subject appears in scene body only (no frontmatter edge)", () => {
		const swordFile = makeFile("30 Canon/33 Objects/Magic Sword.md", "object");
		const sceneFile = makeFile("10 Manuscript/Scene 2.md", "scene");

		// resolvedLinks hit: scene body mentions the sword
		wireResolvedLink(sceneFile.path, swordFile.path, 1);

		vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((path) => {
			if (path === sceneFile.path) return sceneFile;
			return null;
		});

		// Scene cache: NO frontmatterLinks reference to the sword
		vi.mocked(app.metadataCache.getFileCache).mockImplementation((f) => {
			if (f === sceneFile) {
				return createMockCachedMetadata({
					tags: [{ tag: "#manuscript/scene" }],
					frontmatterLinks: [],
				});
			}
			return null;
		});

		vi.mocked(app.metadataCache.getFirstLinkpathDest).mockReturnValue(null);

		const backlinks = buildBacklinks(app, swordFile, "object", classify);

		expect(backlinks).toHaveLength(1);
		const fuzzy = backlinks[0] as ResolvedEntity;
		expect(fuzzy.file).toBe(sceneFile);
		expect(fuzzy.kind).toBe<EntityKind>("scene");
		expect(fuzzy.relation).toBe("backlink");
		expect(fuzzy.fuzzy).toBe(true);
		expect(fuzzy.field).toBeUndefined();
	});

	// -------------------------------------------------------------------------
	// Character subject — prose-only mention NOT emitted (not object/lore)
	// -------------------------------------------------------------------------

	it("does NOT emit a fuzzy backlink for a character mentioned only in scene body (not object/lore)", () => {
		const characterFile = makeFile("30 Canon/31 Characters/Elke.md", "character");
		const sceneFile = makeFile("10 Manuscript/Scene 3.md", "scene");

		// resolvedLinks hit: scene mentions Elke in prose
		wireResolvedLink(sceneFile.path, characterFile.path, 1);

		vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((path) => {
			if (path === sceneFile.path) return sceneFile;
			return null;
		});

		// Scene cache: no frontmatterLinks for Elke (body-only mention)
		vi.mocked(app.metadataCache.getFileCache).mockImplementation((f) => {
			if (f === sceneFile) {
				return createMockCachedMetadata({
					tags: [{ tag: "#manuscript/scene" }],
					frontmatterLinks: [],
				});
			}
			return null;
		});

		vi.mocked(app.metadataCache.getFirstLinkpathDest).mockReturnValue(null);

		const backlinks = buildBacklinks(app, characterFile, "character", classify);

		expect(backlinks).toHaveLength(0);
	});

	// -------------------------------------------------------------------------
	// Missing file guard — frontmatter link resolves to a missing file → skip
	// -------------------------------------------------------------------------

	it("silently drops a frontmatterLinks entry when getFirstLinkpathDest returns null", () => {
		const maraFile = makeFile("30 Canon/31 Characters/Mara Stoneway.md", "character");
		const sceneFile = makeFile("10 Manuscript/Scene 4.md", "scene");

		wireResolvedLink(sceneFile.path, maraFile.path, 1);

		vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((path) => {
			if (path === sceneFile.path) return sceneFile;
			return null;
		});

		// Scene cache: frontmatterLink for Mara Stoneway
		vi.mocked(app.metadataCache.getFileCache).mockImplementation((f) => {
			if (f === sceneFile) {
				return createMockCachedMetadata({
					tags: [{ tag: "#manuscript/scene" }],
					frontmatterLinks: [
						createMockFrontmatterLink("pov", "Mara Stoneway"),
					],
				});
			}
			return null;
		});

		// getFirstLinkpathDest returns null → the link's dest is missing
		vi.mocked(app.metadataCache.getFirstLinkpathDest).mockReturnValue(null);

		// Must not throw; the entry is silently skipped
		let backlinks: ResolvedEntity[] | undefined;
		expect(() => {
			backlinks = buildBacklinks(app, maraFile, "character", classify);
		}).not.toThrow();

		// The subject file doesn't match any resolved dest → no backlink emitted
		expect(backlinks).toHaveLength(0);
	});

	// -------------------------------------------------------------------------
	// Fields with no schema "relation" key still resolved by field name
	// -------------------------------------------------------------------------

	it("resolves backlinks for fields like 'plotlines', 'related', 'first_appearance' (no schema relation key required)", () => {
		const characterFile = makeFile("30 Canon/31 Characters/Tobias Ferro.md", "character");
		const sceneFile = makeFile("10 Manuscript/Scene 5.md", "scene");

		wireResolvedLink(sceneFile.path, characterFile.path, 1);

		vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((path) => {
			if (path === sceneFile.path) return sceneFile;
			return null;
		});

		vi.mocked(app.metadataCache.getFileCache).mockImplementation((f) => {
			if (f === sceneFile) {
				return createMockCachedMetadata({
					tags: [{ tag: "#manuscript/scene" }],
					frontmatterLinks: [
						createMockFrontmatterLink("first_appearance", "Tobias Ferro"),
					],
				});
			}
			return null;
		});

		vi.mocked(app.metadataCache.getFirstLinkpathDest).mockImplementation((link) => {
			if (link === "Tobias Ferro") return characterFile;
			return null;
		});

		const backlinks = buildBacklinks(app, characterFile, "character", classify);

		expect(backlinks).toHaveLength(1);
		expect(backlinks[0]?.field).toBe("first_appearance");
		expect(backlinks[0]?.relation).toBe("backlink");
		expect(backlinks[0]?.file).toBe(sceneFile);
	});

	// -------------------------------------------------------------------------
	// Lore subject — body-only link from scene → fuzzy:true
	// -------------------------------------------------------------------------

	it("emits a fuzzy:true backlink for a lore subject mentioned only in scene body", () => {
		const loreFile = makeFile("30 Canon/34 Lore/Ancient Magic.md", "lore");
		const sceneFile = makeFile("10 Manuscript/Scene 6.md", "scene");

		wireResolvedLink(sceneFile.path, loreFile.path, 1);

		vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((path) => {
			if (path === sceneFile.path) return sceneFile;
			return null;
		});

		vi.mocked(app.metadataCache.getFileCache).mockImplementation((f) => {
			if (f === sceneFile) {
				return createMockCachedMetadata({
					tags: [{ tag: "#manuscript/scene" }],
					frontmatterLinks: [],
				});
			}
			return null;
		});

		vi.mocked(app.metadataCache.getFirstLinkpathDest).mockReturnValue(null);

		const backlinks = buildBacklinks(app, loreFile, "lore", classify);

		expect(backlinks).toHaveLength(1);
		expect(backlinks[0]?.fuzzy).toBe(true);
		expect(backlinks[0]?.kind).toBe<EntityKind>("scene");
	});

	// -------------------------------------------------------------------------
	// getFileCache null — candidate with resolvedLinks hit but no cache → skip
	// -------------------------------------------------------------------------

	it("skips a source file when getFileCache returns null and never throws", () => {
		const maraFile = makeFile("30 Canon/31 Characters/Mara Stoneway.md", "character");
		const sceneFile = makeFile("10 Manuscript/Scene 7.md", "scene");

		// resolvedLinks hit: scene → Mara
		wireResolvedLink(sceneFile.path, maraFile.path, 1);

		// vault returns a valid TFile for the source path
		vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((path) => {
			if (path === sceneFile.path) return sceneFile;
			return null;
		});

		// getFileCache returns null for the source file — cache not yet indexed
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue(null);

		const backlinks = buildBacklinks(app, maraFile, "character", classify);

		expect(backlinks).toHaveLength(0);
	});
});
