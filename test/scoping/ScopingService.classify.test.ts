/**
 * T2.1 — NoteContext model & classification
 *
 * Tests for ScopingService.classify(file): EntityKind
 * Strategy: tag-first (canon/*, manuscript/scene, planning/*),
 * frontmatter `type` as fallback, "unknown" when neither present. (ADR-4)
 *
 * All tests use the mock metadataCache — no live Obsidian instance required.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	App,
	createMockCachedMetadata,
	createMockTFile,
} from "../__mocks__/obsidian";
import { ScopingService } from "../../src/scoping/ScopingService";
import { isEntityKind, type EntityKind } from "../../src/scoping/NoteContext";

describe("ScopingService.classify", () => {
	let app: App;
	let service: ScopingService;

	beforeEach(() => {
		app = new App();
		service = new ScopingService(app);
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue(null);
	});

	// --- Tag-first classification ---

	it("classifies #canon/character → 'character'", () => {
		const file = createMockTFile({ path: "30 Canon/Mara.md" });
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue(
			createMockCachedMetadata({
				tags: [{ tag: "#canon/character" }],
				frontmatter: {},
			}),
		);
		expect(service.classify(file)).toBe<EntityKind>("character");
	});

	it("classifies #canon/location → 'location'", () => {
		const file = createMockTFile({ path: "30 Canon/Lighthouse.md" });
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue(
			createMockCachedMetadata({
				tags: [{ tag: "#canon/location" }],
				frontmatter: {},
			}),
		);
		expect(service.classify(file)).toBe<EntityKind>("location");
	});

	it("classifies #canon/object → 'object'", () => {
		const file = createMockTFile({ path: "30 Canon/Lens.md" });
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue(
			createMockCachedMetadata({
				tags: [{ tag: "#canon/object" }],
				frontmatter: {},
			}),
		);
		expect(service.classify(file)).toBe<EntityKind>("object");
	});

	it("classifies #canon/lore → 'lore'", () => {
		const file = createMockTFile({ path: "30 Canon/Moonfire.md" });
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue(
			createMockCachedMetadata({
				tags: [{ tag: "#canon/lore" }],
				frontmatter: {},
			}),
		);
		expect(service.classify(file)).toBe<EntityKind>("lore");
	});

	it("classifies #manuscript/scene → 'scene'", () => {
		const file = createMockTFile({ path: "10 Manuscript/Scene 1.md" });
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue(
			createMockCachedMetadata({
				tags: [{ tag: "#manuscript/scene" }],
				frontmatter: {},
			}),
		);
		expect(service.classify(file)).toBe<EntityKind>("scene");
	});

	it("classifies #planning/plotline → 'plotline'", () => {
		const file = createMockTFile({ path: "20 Planning/The Dying Light.md" });
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue(
			createMockCachedMetadata({
				tags: [{ tag: "#planning/plotline" }],
				frontmatter: {},
			}),
		);
		expect(service.classify(file)).toBe<EntityKind>("plotline");
	});

	it("classifies #planning/book → 'book'", () => {
		const file = createMockTFile({ path: "20 Planning/The Obsidian Eye.md" });
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue(
			createMockCachedMetadata({
				tags: [{ tag: "#planning/book" }],
				frontmatter: {},
			}),
		);
		expect(service.classify(file)).toBe<EntityKind>("book");
	});

	it("isEntityKind recognises 'book' as a valid EntityKind", () => {
		expect(isEntityKind("book")).toBe(true);
	});

	// Regression: plotline must survive the addition of the book entry
	it("regression: #planning/plotline still classifies as 'plotline'", () => {
		const file = createMockTFile({ path: "20 Planning/Arc 1.md" });
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue(
			createMockCachedMetadata({
				tags: [{ tag: "#planning/plotline" }],
				frontmatter: {},
			}),
		);
		expect(service.classify(file)).toBe<EntityKind>("plotline");
	});

	// --- Tag takes precedence over frontmatter type ---

	it("tag wins over frontmatter type when both present", () => {
		const file = createMockTFile({ path: "test.md" });
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue(
			createMockCachedMetadata({
				tags: [{ tag: "#canon/character" }],
				frontmatter: { type: "scene" },
			}),
		);
		// Tag says character; frontmatter says scene — tag wins
		expect(service.classify(file)).toBe<EntityKind>("character");
	});

	// --- Frontmatter type fallback ---

	it("falls back to frontmatter type when no known tag", () => {
		const file = createMockTFile({ path: "30 Canon/entity.md" });
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue(
			createMockCachedMetadata({
				tags: [{ tag: "#some/other-tag" }],
				frontmatter: { type: "location" },
			}),
		);
		expect(service.classify(file)).toBe<EntityKind>("location");
	});

	it("falls back to frontmatter type when tags array is empty", () => {
		const file = createMockTFile({ path: "entity.md" });
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue(
			createMockCachedMetadata({
				tags: [],
				frontmatter: { type: "object" },
			}),
		);
		expect(service.classify(file)).toBe<EntityKind>("object");
	});

	it("falls back to frontmatter type 'scene'", () => {
		const file = createMockTFile({ path: "scene.md" });
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue(
			createMockCachedMetadata({
				tags: [],
				frontmatter: { type: "scene" },
			}),
		);
		expect(service.classify(file)).toBe<EntityKind>("scene");
	});

	it("falls back to frontmatter type 'plotline'", () => {
		const file = createMockTFile({ path: "plot.md" });
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue(
			createMockCachedMetadata({
				tags: [],
				frontmatter: { type: "plotline" },
			}),
		);
		expect(service.classify(file)).toBe<EntityKind>("plotline");
	});

	// --- Unknown fallback ---

	it("returns 'unknown' when no tag and no valid type", () => {
		const file = createMockTFile({ path: "random.md" });
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue(
			createMockCachedMetadata({
				tags: [],
				frontmatter: { type: "something-invalid" },
			}),
		);
		expect(service.classify(file)).toBe<EntityKind>("unknown");
	});

	it("returns 'unknown' when no tag and no frontmatter type", () => {
		const file = createMockTFile({ path: "random.md" });
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue(
			createMockCachedMetadata({ tags: [], frontmatter: {} }),
		);
		expect(service.classify(file)).toBe<EntityKind>("unknown");
	});

	it("returns 'unknown' when cache is null (pre-index)", () => {
		const file = createMockTFile({ path: "random.md" });
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue(null);
		expect(service.classify(file)).toBe<EntityKind>("unknown");
	});
});
