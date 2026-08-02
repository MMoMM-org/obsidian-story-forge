/**
 * catalogOverviews.test.ts — M4 overview .base files, retained as test-vault fixtures.
 *
 * These five plain Bases table views predate the Codex-surface design (spec
 * 008): they are not Cards, not the Codex, and nothing in spec 008 consumes
 * them. Spec 008's F4 gives the Codex a Table card that covers the same
 * ground, so these are no longer shipped in the plugin catalog — they were
 * moved out of catalog/ into the test vault (test/StoryForge/00 Meta/Bases/),
 * where they remain available as an alternate Bases view for manual testing.
 *
 * This suite keeps validating them in place: they still exist as real .base
 * files and are still worth checking against validateBasesConfig() and
 * against their original field/sort/group shape.
 *
 * Reads from disk; no Obsidian runtime required.
 *
 * V4 — overview-characters.base
 *       filter: canon/character; fields: name, role, status, tagline
 * V5 — overview-locations.base
 *       filter: canon/location; grouped by locationType; fields: world, region
 * V6 — overview-objects.base
 *       filter: canon/object; fields: name, kind, owner
 * V7 — overview-lore.base
 *       filter: canon/lore; fields: name, scope, related
 * V8 — overview-scenes.base
 *       filter: manuscript/scene; fields: order, status, pov, location; sorted by order ASC
 *
 * @ref docs/view-roadmap.md §V4–V8
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { parse as parseYaml } from "yaml";
import { validateBasesConfig } from "bases/basesConfig";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const CATALOG_DIR = resolve(__dirname, "../StoryForge/00 Meta/Bases");

function catalogPath(filename: string): string {
	return join(CATALOG_DIR, filename);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Load a catalog .base file as a parsed YAML object.
 * Throws descriptively if the file is missing.
 */
function loadBase(filename: string): unknown {
	const filePath = catalogPath(filename);
	if (!existsSync(filePath)) {
		throw new Error(`Expected catalog file not found: ${filePath}`);
	}
	const content = readFileSync(filePath, "utf8");
	return parseYaml(content);
}

/**
 * Extract the first view entry from a parsed BasesConfigFile-shaped object.
 * The overview .base files each have exactly one view.
 */
function firstView(parsed: unknown): Record<string, unknown> {
	const obj = parsed as Record<string, unknown>;
	const views = obj["views"];
	if (!Array.isArray(views) || views.length === 0) {
		throw new Error("No views array found in parsed .base");
	}
	return views[0] as Record<string, unknown>;
}

/**
 * Return the order array (column list) from the first view, as strings.
 */
function viewOrder(parsed: unknown): string[] {
	const view = firstView(parsed);
	const order = view["order"];
	if (!Array.isArray(order)) return [];
	return order as string[];
}

/**
 * Return the groupBy object from the first view as { property, direction }.
 * Returns undefined when groupBy is absent or not a plain object.
 */
function viewGroupBy(parsed: unknown): { property: string | undefined; direction: string | undefined } | undefined {
	const view = firstView(parsed);
	const groupBy = view["groupBy"];
	if (groupBy === null || typeof groupBy !== "object" || Array.isArray(groupBy)) return undefined;
	const gb = groupBy as Record<string, unknown>;
	return {
		property: gb["property"] as string | undefined,
		direction: gb["direction"] as string | undefined,
	};
}

/**
 * Return the sort entries from the first view.
 */
function viewSort(parsed: unknown): Array<{ property: string; direction: string }> {
	const view = firstView(parsed);
	const sort = view["sort"];
	if (!Array.isArray(sort)) return [];
	return sort as Array<{ property: string; direction: string }>;
}

/**
 * Return the top-level filters string from a parsed object, cast to string.
 */
function topLevelFilters(parsed: unknown): string {
	const obj = parsed as Record<string, unknown>;
	const filters = obj["filters"];
	return typeof filters === "string" ? filters : JSON.stringify(filters);
}

// ---------------------------------------------------------------------------
// Existence tests
// ---------------------------------------------------------------------------

describe("catalog overview .base files — existence", () => {
	const FILES = [
		"overview-characters.base",
		"overview-locations.base",
		"overview-objects.base",
		"overview-lore.base",
		"overview-scenes.base",
	];

	for (const file of FILES) {
		it(`${file} exists in the test vault's Bases folder`, () => {
			expect(
				existsSync(catalogPath(file)),
				`Expected ${file} at ${catalogPath(file)}`,
			).toBe(true);
		});
	}
});

// ---------------------------------------------------------------------------
// Validation tests (validateBasesConfig)
// ---------------------------------------------------------------------------

describe("catalog overview .base files — validateBasesConfig", () => {
	const FILES = [
		"overview-characters.base",
		"overview-locations.base",
		"overview-objects.base",
		"overview-lore.base",
		"overview-scenes.base",
	];

	for (const file of FILES) {
		it(`${file} passes validateBasesConfig`, () => {
			const parsed = loadBase(file);
			const result = validateBasesConfig(parsed);
			expect(result.ok, result.ok ? undefined : `error: ${(result as { ok: false; error: string }).error}`).toBe(true);
		});
	}
});

// ---------------------------------------------------------------------------
// V4 — Characters
// ---------------------------------------------------------------------------

describe("V4 overview-characters.base — fields match roadmap", () => {
	it("filters target canon/character", () => {
		const parsed = loadBase("overview-characters.base");
		const filters = topLevelFilters(parsed);
		expect(filters).toContain("canon/character");
	});

	it("view order includes: file.name, role, status, tagline", () => {
		const parsed = loadBase("overview-characters.base");
		const order = viewOrder(parsed);
		expect(order).toContain("file.name");
		expect(order).toContain("role");
		expect(order).toContain("status");
		expect(order).toContain("tagline");
	});
});

// ---------------------------------------------------------------------------
// V5 — Locations
// ---------------------------------------------------------------------------

describe("V5 overview-locations.base — fields + groupBy match roadmap", () => {
	it("filters target canon/location", () => {
		const parsed = loadBase("overview-locations.base");
		const filters = topLevelFilters(parsed);
		expect(filters).toContain("canon/location");
	});

	it("view is grouped by locationType ASC", () => {
		const parsed = loadBase("overview-locations.base");
		const groupBy = viewGroupBy(parsed);
		expect(groupBy, "Expected a groupBy entry").toBeDefined();
		expect(groupBy?.property).toBe("locationType");
		expect(groupBy?.direction).toBe("ASC");
	});

	it("view order includes: world, region", () => {
		const parsed = loadBase("overview-locations.base");
		const order = viewOrder(parsed);
		expect(order).toContain("world");
		expect(order).toContain("region");
	});
});

// ---------------------------------------------------------------------------
// V6 — Objects
// ---------------------------------------------------------------------------

describe("V6 overview-objects.base — fields match roadmap", () => {
	it("filters target canon/object", () => {
		const parsed = loadBase("overview-objects.base");
		const filters = topLevelFilters(parsed);
		expect(filters).toContain("canon/object");
	});

	it("view order includes: file.name, kind, owner", () => {
		const parsed = loadBase("overview-objects.base");
		const order = viewOrder(parsed);
		expect(order).toContain("file.name");
		expect(order).toContain("kind");
		expect(order).toContain("owner");
	});
});

// ---------------------------------------------------------------------------
// V7 — Lore
// ---------------------------------------------------------------------------

describe("V7 overview-lore.base — fields match roadmap", () => {
	it("filters target canon/lore", () => {
		const parsed = loadBase("overview-lore.base");
		const filters = topLevelFilters(parsed);
		expect(filters).toContain("canon/lore");
	});

	it("view order includes: file.name, scope, related", () => {
		const parsed = loadBase("overview-lore.base");
		const order = viewOrder(parsed);
		expect(order).toContain("file.name");
		expect(order).toContain("scope");
		expect(order).toContain("related");
	});
});

// ---------------------------------------------------------------------------
// V8 — Scenes
// ---------------------------------------------------------------------------

describe("V8 overview-scenes.base — fields + sort match roadmap", () => {
	it("filters target manuscript/scene", () => {
		const parsed = loadBase("overview-scenes.base");
		const filters = topLevelFilters(parsed);
		expect(filters).toContain("manuscript/scene");
	});

	it("view order includes: order, status, pov, location", () => {
		const parsed = loadBase("overview-scenes.base");
		const colOrder = viewOrder(parsed);
		expect(colOrder).toContain("order");
		expect(colOrder).toContain("status");
		expect(colOrder).toContain("pov");
		expect(colOrder).toContain("location");
	});

	it("view is sorted by order ASC", () => {
		const parsed = loadBase("overview-scenes.base");
		const sortEntries = viewSort(parsed);
		const orderSort = sortEntries.find((s) => s.property === "order");
		expect(orderSort, "Expected a sort entry for 'order' property").toBeDefined();
		expect(orderSort?.direction).toBe("ASC");
	});
});
