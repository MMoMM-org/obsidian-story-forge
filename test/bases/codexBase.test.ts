/**
 * codexBase.test.ts — T3.3 seed Codex.base assertions.
 *
 * Verifies that the seed Codex.base exists in the test vault's Bases folder
 * (test/StoryForge/00 Meta/Bases/Codex.base) and contains exactly 5
 * story-forge-codex views — one per category:
 *   characters, locations, objects, lore, scenes
 *
 * Reads from disk; no Obsidian runtime required.
 * Mirrors the Canon.base / Manuscript.base seed mechanism (plain YAML files
 * placed in the configurable curated bases folder, default "00 Meta/Bases").
 *
 * @ref SDD/ADR-2 addendum — Codex.base has one story-forge-codex view per category
 * @ref SDD/T3.3 — seed Codex.base mirrors Canon.base mechanism
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { isEntityKind } from "scoping/NoteContext";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VAULT = resolve(__dirname, "../StoryForge");
const BASES_DIR = join(VAULT, "00 Meta/Bases");
const CODEX_BASE_PATH = join(BASES_DIR, "Codex.base");
// infra/ is the deploy source of truth (schema-gen copies it into the vault).
const INFRA_CODEX_PATH = resolve(__dirname, "../../infra/Bases/Codex.base");

// Expected categories — SINGULAR, matching the EntityKind discriminant the code
// resolves via isEntityKind() (CodexBasesView reads config.get("category")).
// A plural value here would fall through to "unknown" at runtime (the f-bug).
const EXPECTED_CATEGORIES = ["character", "location", "object", "lore", "scene"] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Minimal YAML view list parser.
 * Extracts name and type from each `- type:` entry in a `views:` list.
 * Works by finding the `views:` key and scanning subsequent indented lines.
 */
function parseViews(content: string): Array<{ name: string; type: string; category?: string }> {
	const views: Array<{ name: string; type: string; category?: string }> = [];

	// Find the views: section — capture all lines that start with whitespace after it
	const viewsIdx = content.indexOf("\nviews:");
	if (viewsIdx === -1) return views;

	const afterViews = content.slice(viewsIdx + "\nviews:".length);

	// Split on view list item markers (  - type: ...) to get per-view blocks
	const itemPattern = /(?:^|\n)(\s+- type:[\s\S]*?)(?=\n\s+- type:|\s*$)/g;
	let match: RegExpExecArray | null;
	while ((match = itemPattern.exec(afterViews)) !== null) {
		const entry = match[1] ?? "";
		const nameMatch = entry.match(/name:\s*(.+)/);
		const typeMatch = entry.match(/type:\s*(.+)/);
		const categoryMatch = entry.match(/category:\s*(.+)/);
		if (typeMatch?.[1]) {
			views.push({
				name: nameMatch?.[1]?.trim() ?? "",
				type: typeMatch[1].trim(),
				category: categoryMatch?.[1]?.trim(),
			});
		}
	}
	return views;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Seed Codex.base — existence", () => {
	it("Codex.base exists in 00 Meta/Bases/", () => {
		expect(
			existsSync(CODEX_BASE_PATH),
			`Expected Codex.base at ${CODEX_BASE_PATH}`,
		).toBe(true);
	});
});

describe("Seed Codex.base — structure", () => {
	it("contains exactly 5 views", () => {
		const content = readFileSync(CODEX_BASE_PATH, "utf8");
		const views = parseViews(content);
		expect(
			views.length,
			`Expected 5 story-forge-codex views, got ${views.length}. Views: ${JSON.stringify(views)}`,
		).toBe(5);
	});

	it("all views have type 'story-forge-codex'", () => {
		const content = readFileSync(CODEX_BASE_PATH, "utf8");
		const views = parseViews(content);
		for (const view of views) {
			expect(
				view.type,
				`View '${view.name}' has type '${view.type}', expected 'story-forge-codex'`,
			).toBe("story-forge-codex");
		}
	});

	it("has a view for each singular category: character, location, object, lore, scene", () => {
		const content = readFileSync(CODEX_BASE_PATH, "utf8");
		const views = parseViews(content);

		for (const category of EXPECTED_CATEGORIES) {
			// Exact category-key match only — no name fallback. A plural/typo value
			// would resolve to "unknown" at runtime, so this must be strict.
			const hasCategory = views.some((v) => v.category === category);
			expect(
				hasCategory,
				`Expected a view with category '${category}'. Categories: ${JSON.stringify(views.map((v) => v.category))}`,
			).toBe(true);
		}
	});

	it("every view's category is a valid EntityKind (not plural/unknown — the f-bug guard)", () => {
		const content = readFileSync(CODEX_BASE_PATH, "utf8");
		const views = parseViews(content);

		expect(views.length).toBeGreaterThan(0);
		for (const v of views) {
			expect(
				v.category !== undefined && isEntityKind(v.category),
				`View '${v.name}' category '${v.category ?? "(none)"}' is not a valid EntityKind`,
			).toBe(true);
		}
	});

	it("top-level filter combines the category tags with OR, not AND", () => {
		// The base-level filter applies to ALL views. `and` of mutually-exclusive
		// canon/* + manuscript/* tags matches zero notes → every category empty.
		const content = readFileSync(CODEX_BASE_PATH, "utf8");
		const filterBlock = content.slice(
			content.indexOf("filters:"),
			content.indexOf("\nproperties:"),
		);
		expect(filterBlock, "expected an `or:` top-level filter block").toMatch(/\bor:/);
		expect(filterBlock, "top-level filter must not use mutually-exclusive `and:`").not.toMatch(/\band:/);
	});
});

describe("Seed Codex.base — deploy source of truth", () => {
	it("infra/Bases/Codex.base exists (schema-gen deploys it into the vault)", () => {
		expect(
			existsSync(INFRA_CODEX_PATH),
			`Expected the deploy source at ${INFRA_CODEX_PATH}`,
		).toBe(true);
	});

	it("the deployed vault copy matches the infra source", () => {
		const infra = readFileSync(INFRA_CODEX_PATH, "utf8");
		const deployed = readFileSync(CODEX_BASE_PATH, "utf8");
		expect(deployed).toBe(infra);
	});
});
