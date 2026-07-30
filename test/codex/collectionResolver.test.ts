/**
 * collectionResolver tests — T1.1 (RED → GREEN).
 *
 * collectionResolver is a pure function: (collectionId, collections config,
 * global settings, note index) → resolved notes or a misconfigured result.
 * No vault, no Obsidian runtime import — the note index is injected.
 *
 * Contracts verified:
 *   - A tag match returns the note that carries it
 *   - A note under an excluded folder is absent from the result
 *   - An empty tag reports "misconfigured", never falls through to all notes
 *   - Excluded-folder matching is prefix-based on path segments, not string prefix
 *     ("00 Meta" must not exclude a note under "00 Metadata")
 *   - An unknown collection id resolves to an empty (not misconfigured) result
 *
 * @ref SDD/CON-7   — structure-agnostic selection: tag includes, folders only exclude
 * @ref SDD/PRD-F3  — Codex collections
 * @ref docs/XDD/specs/008-codex-surface/solution.md:648-662 — Error Handling: "Collection tag empty"
 */

import { describe, it, expect } from "vitest";
import {
	resolveCollection,
	type CollectionRecordConfig,
	type CollectionResolverSettings,
	type IndexedNote,
} from "codex/collectionResolver";

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeNote(overrides?: Partial<IndexedNote>): IndexedNote {
	return {
		path: "Characters/Mara.md",
		tags: ["canon/character"],
		...overrides,
	};
}

function makeCollections(
	overrides?: Record<string, CollectionRecordConfig>,
): Record<string, CollectionRecordConfig> {
	return {
		character: { tag: "canon/character" },
		...overrides,
	};
}

function makeSettings(overrides?: Partial<CollectionResolverSettings>): CollectionResolverSettings {
	return {
		excludedFolders: ["00 Meta"],
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Tag matching
// ---------------------------------------------------------------------------

describe("resolveCollection — tag matching", () => {
	it("returns notes carrying the collection's configured tag", () => {
		const notes = [
			makeNote({ path: "Characters/Mara.md", tags: ["canon/character"] }),
			makeNote({ path: "Locations/Harbor.md", tags: ["canon/location"] }),
		];

		const result = resolveCollection("character", makeCollections(), makeSettings(), notes);

		expect(result).toEqual({
			status: "resolved",
			notes: [{ path: "Characters/Mara.md", tags: ["canon/character"] }],
		});
	});
});

// ---------------------------------------------------------------------------
// Folder exclusion
// ---------------------------------------------------------------------------

describe("resolveCollection — folder exclusion", () => {
	it("excludes a tag-matching note that lives under an excluded folder", () => {
		const notes = [
			makeNote({ path: "Characters/Mara.md", tags: ["canon/character"] }),
			makeNote({ path: "00 Meta/Templates/Character.md", tags: ["canon/character"] }),
		];

		const result = resolveCollection("character", makeCollections(), makeSettings(), notes);

		expect(result.status).toBe("resolved");
		expect(result).toMatchObject({
			notes: [{ path: "Characters/Mara.md" }],
		});
	});

	it("is prefix-based on path segments — '00 Meta' does not exclude '00 Metadata'", () => {
		const notes = [
			makeNote({ path: "00 Metadata/Character.md", tags: ["canon/character"] }),
			makeNote({ path: "00 Meta/Character.md", tags: ["canon/character"] }),
		];

		const result = resolveCollection("character", makeCollections(), makeSettings(), notes);

		expect(result).toEqual({
			status: "resolved",
			notes: [{ path: "00 Metadata/Character.md", tags: ["canon/character"] }],
		});
	});
});

// ---------------------------------------------------------------------------
// Misconfiguration
// ---------------------------------------------------------------------------

describe("resolveCollection — empty tag", () => {
	it("reports misconfigured for an empty tag, never listing the whole vault", () => {
		const notes = [
			makeNote({ path: "Characters/Mara.md", tags: ["canon/character"] }),
			makeNote({ path: "Locations/Harbor.md", tags: ["canon/location"] }),
		];
		const collections = makeCollections({ character: { tag: "" } });

		const result = resolveCollection("character", collections, makeSettings(), notes);

		expect(result.status).toBe("misconfigured");
		if (result.status === "misconfigured") {
			expect(result.reason).toMatch(/tag/i);
		}
	});

	it("reports misconfigured for a whitespace-only tag", () => {
		const notes = [makeNote()];
		const collections = makeCollections({ character: { tag: "   " } });

		const result = resolveCollection("character", collections, makeSettings(), notes);

		expect(result.status).toBe("misconfigured");
	});
});

// ---------------------------------------------------------------------------
// Unknown collection id
// ---------------------------------------------------------------------------

describe("resolveCollection — unknown collection id", () => {
	it("resolves to an empty note list rather than erroring or misconfiguring", () => {
		const notes = [makeNote()];

		const result = resolveCollection("no-such-collection", makeCollections(), makeSettings(), notes);

		expect(result).toEqual({ status: "resolved", notes: [] });
	});
});
