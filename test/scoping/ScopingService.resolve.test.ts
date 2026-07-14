/**
 * T2.2 — Outgoing-relation resolver
 *
 * Tests for ScopingService.resolve(file): NoteContext
 * Strategy (ADR-3):
 * - Reads frontmatterLinks from CachedMetadata.
 * - Resolves each via metadataCache.getFirstLinkpathDest().
 * - Classifies each resolved target.
 * - Strips array indices from frontmatter key to derive `field`.
 * - Marks unresolved links (unresolved: true) and continues.
 * - backlinks is always [] in M1.
 * - Never throws; null cache → empty context.
 *
 * Fixtures mirror the vault seed notes (Scene 1, Silvan Nightweaver, etc.)
 * without importing any real vault files — all from mock metadata.
 * No live Obsidian instance required.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	App,
	createMockCachedMetadata,
	createMockFrontmatterLink,
	createMockTFile,
	type CachedMetadata,
} from "../__mocks__/obsidian";
import { ScopingService } from "../../src/scoping/ScopingService";
import type { EntityKind, ResolvedEntity } from "../../src/scoping/NoteContext";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a tag-only CachedMetadata (for target entity files). */
function cacheWithTag(tag: string): CachedMetadata {
	return createMockCachedMetadata({ tags: [{ tag }] });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ScopingService.resolve", () => {
	let app: App;
	let service: ScopingService;

	beforeEach(() => {
		app = new App();
		service = new ScopingService(app);
		// Default: getFileCache returns null; getFirstLinkpathDest returns null
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue(null);
		vi.mocked(app.metadataCache.getFirstLinkpathDest).mockReturnValue(null);
	});

	// -------------------------------------------------------------------------
	// Null cache (pre-index guard)
	// -------------------------------------------------------------------------

	it("returns empty context when cache is null", () => {
		const file = createMockTFile({ path: "10 Manuscript/Scene 1.md" });
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue(null);

		const ctx = service.resolve(file);

		expect(ctx.activeFile).toBe(file);
		expect(ctx.activeKind).toBe<EntityKind>("unknown");
		expect(ctx.entities).toEqual([]);
		expect(ctx.backlinks).toEqual([]);
		expect(typeof ctx.resolvedAt).toBe("number");
	});

	// -------------------------------------------------------------------------
	// Scene fixture: pov / characters / location / plotlines
	// -------------------------------------------------------------------------

	it("resolves a scene's pov, characters, location, and plotlines", () => {
		// Active note: Scene 1 — The Extinguished Fire
		const sceneFile = createMockTFile({
			path: "10 Manuscript/Wardens of Moonharbor/Scene 1 - The Extinguished Fire.md",
		});

		// Target files
		const maraFile = createMockTFile({ path: "30 Canon/31 Characters/Mara Stoneway.md" });
		const tobiasFile = createMockTFile({ path: "30 Canon/31 Characters/Tobias Ferro.md" });
		const lighthouseFile = createMockTFile({ path: "30 Canon/32 Locations/Moonharbor Lighthouse.md" });
		const plotlineFile = createMockTFile({ path: "20 Planning/The Dying Light.md" });

		// Scene cache: has #manuscript/scene tag and frontmatterLinks
		vi.mocked(app.metadataCache.getFileCache).mockImplementation((f) => {
			if (f === sceneFile) {
				return createMockCachedMetadata({
					tags: [{ tag: "#manuscript/scene" }],
					frontmatter: { type: "scene" },
					frontmatterLinks: [
						createMockFrontmatterLink("pov", "Mara Stoneway"),
						createMockFrontmatterLink("characters.0", "Mara Stoneway"),
						createMockFrontmatterLink("characters.1", "Tobias Ferro"),
						createMockFrontmatterLink("location", "Moonharbor Lighthouse"),
						createMockFrontmatterLink("plotlines.0", "The Dying Light"),
					],
				});
			}
			if (f === maraFile) return cacheWithTag("#canon/character");
			if (f === tobiasFile) return cacheWithTag("#canon/character");
			if (f === lighthouseFile) return cacheWithTag("#canon/location");
			if (f === plotlineFile) return cacheWithTag("#planning/plotline");
			return null;
		});

		// Link resolution
		vi.mocked(app.metadataCache.getFirstLinkpathDest).mockImplementation(
			(link) => {
				if (link === "Mara Stoneway") return maraFile;
				if (link === "Tobias Ferro") return tobiasFile;
				if (link === "Moonharbor Lighthouse") return lighthouseFile;
				if (link === "The Dying Light") return plotlineFile;
				return null;
			},
		);

		const ctx = service.resolve(sceneFile);

		// Active note classification
		expect(ctx.activeKind).toBe<EntityKind>("scene");
		expect(ctx.activeFile).toBe(sceneFile);

		// Backlinks seam must be empty (ADR-3, M1)
		expect(ctx.backlinks).toEqual([]);

		// resolvedAt is a number
		expect(typeof ctx.resolvedAt).toBe("number");

		// 5 entities: pov + characters(2) + location + plotlines(1)
		expect(ctx.entities).toHaveLength(5);

		// pov → Mara Stoneway, character
		const pov = ctx.entities.find((e) => e.field === "pov");
		expect(pov).toBeDefined();
		expect(pov?.file).toBe(maraFile);
		expect(pov?.kind).toBe<EntityKind>("character");
		expect(pov?.relation).toBe("outgoing");
		expect(pov?.unresolved).toBeUndefined();

		// characters field (both entries) → Mara + Tobias
		const chars = ctx.entities.filter((e) => e.field === "characters");
		expect(chars).toHaveLength(2);
		expect(chars.map((e) => e.kind).every((k) => k === "character")).toBe(true);

		// location → Moonharbor Lighthouse, location
		const loc = ctx.entities.find((e) => e.field === "location");
		expect(loc).toBeDefined();
		expect(loc?.file).toBe(lighthouseFile);
		expect(loc?.kind).toBe<EntityKind>("location");

		// plotlines field → The Dying Light, plotline
		const plot = ctx.entities.find((e) => e.field === "plotlines");
		expect(plot).toBeDefined();
		expect(plot?.file).toBe(plotlineFile);
		expect(plot?.kind).toBe<EntityKind>("plotline");
	});

	// -------------------------------------------------------------------------
	// Array-index stripping: "characters.0" → field "characters"
	// -------------------------------------------------------------------------

	it("strips array index from key to derive the field name", () => {
		const sceneFile = createMockTFile({ path: "scene.md" });
		const charFile = createMockTFile({ path: "char.md" });

		vi.mocked(app.metadataCache.getFileCache).mockImplementation((f) => {
			if (f === sceneFile) {
				return createMockCachedMetadata({
					tags: [{ tag: "#manuscript/scene" }],
					frontmatterLinks: [
						createMockFrontmatterLink("characters.0", "Alice"),
						createMockFrontmatterLink("characters.1", "Bob"),
					],
				});
			}
			if (f === charFile) return cacheWithTag("#canon/character");
			return null;
		});

		vi.mocked(app.metadataCache.getFirstLinkpathDest).mockReturnValue(charFile);

		const ctx = service.resolve(sceneFile);

		expect(ctx.entities).toHaveLength(2);
		expect(ctx.entities[0].field).toBe("characters");
		expect(ctx.entities[1].field).toBe("characters");
	});

	// -------------------------------------------------------------------------
	// Unresolved link: link text with no target file
	// -------------------------------------------------------------------------

	it("marks unresolved links with unresolved:true and continues resolution", () => {
		const sceneFile = createMockTFile({ path: "scene.md" });
		const charFile = createMockTFile({ path: "30 Canon/31 Characters/Elke.md" });

		vi.mocked(app.metadataCache.getFileCache).mockImplementation((f) => {
			if (f === sceneFile) {
				return createMockCachedMetadata({
					tags: [{ tag: "#manuscript/scene" }],
					frontmatterLinks: [
						// This link will resolve to null (ghost reference)
						createMockFrontmatterLink("pov", "Ghost Character"),
						// This one resolves fine
						createMockFrontmatterLink("location", "Elke"),
					],
				});
			}
			if (f === charFile) return cacheWithTag("#canon/character");
			return null;
		});

		vi.mocked(app.metadataCache.getFirstLinkpathDest).mockImplementation(
			(link) => {
				if (link === "Elke") return charFile;
				return null; // Ghost Character → null
			},
		);

		const ctx = service.resolve(sceneFile);

		// Both entities are present (resolution continues after unresolved)
		expect(ctx.entities).toHaveLength(2);

		const ghost = ctx.entities.find((e) => e.field === "pov");
		expect(ghost).toBeDefined();
		expect(ghost?.unresolved).toBe(true);
		expect(ghost?.kind).toBe<EntityKind>("unknown");
		// The stub TFile carries the attempted link text as its path.
		expect(ghost?.file.path).toBe("Ghost Character");

		const resolved = ctx.entities.find((e) => e.field === "location");
		expect(resolved).toBeDefined();
		expect(resolved?.unresolved).toBeUndefined();
		expect(resolved?.file).toBe(charFile);
	});

	// -------------------------------------------------------------------------
	// backlinks is always empty in M1 (ADR-3 seam)
	// -------------------------------------------------------------------------

	it("backlinks is always an empty array (M1 seam per ADR-3)", () => {
		const file = createMockTFile({ path: "any.md" });
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue(
			createMockCachedMetadata({ tags: [], frontmatterLinks: [] }),
		);

		const ctx = service.resolve(file);

		expect(ctx.backlinks).toEqual([]);
		expect(Array.isArray(ctx.backlinks)).toBe(true);
	});

	// -------------------------------------------------------------------------
	// No frontmatterLinks → empty entities
	// -------------------------------------------------------------------------

	it("returns empty entities when frontmatterLinks is absent", () => {
		const file = createMockTFile({ path: "char.md" });
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue(
			createMockCachedMetadata({
				tags: [{ tag: "#canon/character" }],
				// no frontmatterLinks key
			}),
		);

		const ctx = service.resolve(file);

		expect(ctx.activeKind).toBe<EntityKind>("character");
		expect(ctx.entities).toEqual([]);
	});

	// -------------------------------------------------------------------------
	// NoteContext shape is engine-free (plain data, not Obsidian classes)
	// -------------------------------------------------------------------------

	it("NoteContext shape is plain data, not Obsidian framework objects", () => {
		const file = createMockTFile({ path: "scene.md" });
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue(
			createMockCachedMetadata({
				tags: [{ tag: "#manuscript/scene" }],
				frontmatterLinks: [],
			}),
		);

		const ctx = service.resolve(file);

		// Verify shape has all required NoteContext fields
		expect(ctx).toHaveProperty("activeFile");
		expect(ctx).toHaveProperty("activeKind");
		expect(ctx).toHaveProperty("entities");
		expect(ctx).toHaveProperty("backlinks");
		expect(ctx).toHaveProperty("resolvedAt");

		// entities and backlinks are plain arrays
		expect(Array.isArray(ctx.entities)).toBe(true);
		expect(Array.isArray(ctx.backlinks)).toBe(true);
	});

	// -------------------------------------------------------------------------
	// getFirstLinkpathDest called with correct args (link + source path)
	// -------------------------------------------------------------------------

	it("calls getFirstLinkpathDest with the link text and source file path", () => {
		const sceneFile = createMockTFile({ path: "10 Manuscript/scene.md" });
		const targetFile = createMockTFile({ path: "30 Canon/Target.md" });

		vi.mocked(app.metadataCache.getFileCache).mockImplementation((f) => {
			if (f === sceneFile) {
				return createMockCachedMetadata({
					tags: [{ tag: "#manuscript/scene" }],
					frontmatterLinks: [
						createMockFrontmatterLink("pov", "Target"),
					],
				});
			}
			if (f === targetFile) return cacheWithTag("#canon/character");
			return null;
		});

		vi.mocked(app.metadataCache.getFirstLinkpathDest).mockReturnValue(targetFile);

		service.resolve(sceneFile);

		expect(app.metadataCache.getFirstLinkpathDest).toHaveBeenCalledWith(
			"Target",
			"10 Manuscript/scene.md",
		);
	});

	// -------------------------------------------------------------------------
	// ResolvedEntity shape: each entry has relation "outgoing"
	// -------------------------------------------------------------------------

	it("each resolved entity has relation 'outgoing'", () => {
		const sceneFile = createMockTFile({ path: "scene.md" });
		const charFile = createMockTFile({ path: "char.md" });

		vi.mocked(app.metadataCache.getFileCache).mockImplementation((f) => {
			if (f === sceneFile) {
				return createMockCachedMetadata({
					tags: [{ tag: "#manuscript/scene" }],
					frontmatterLinks: [
						createMockFrontmatterLink("pov", "Alice"),
					],
				});
			}
			if (f === charFile) return cacheWithTag("#canon/character");
			return null;
		});

		vi.mocked(app.metadataCache.getFirstLinkpathDest).mockReturnValue(charFile);

		const ctx = service.resolve(sceneFile);
		const entity = ctx.entities[0] as ResolvedEntity;

		expect(entity.relation).toBe("outgoing");
		expect(entity.field).toBe("pov");
		expect(entity.kind).toBe<EntityKind>("character");
		expect(entity.file).toBe(charFile);
	});
});
