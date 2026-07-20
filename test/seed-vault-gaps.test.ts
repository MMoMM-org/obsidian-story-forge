/**
 * seed-vault-gaps.test.ts — T5.2 seed-vault gap assertions.
 *
 * Verifies that the Moonharbor sample vault contains the demo-critical
 * entities required for the contextual panel:
 *
 *   1. A fantasy character note (species / magical_abilities / … present)
 *   2. The Beacon Lens (object) and The Moonfire (lore) are each referenced
 *      by ≥1 scene note (frontmatter OR body wikilink — mirrors ADR-8 fuzzy resolvedLinks)
 *   3. ≥1 canon note has a non-empty `portrait` or `image` field
 *
 * Reads raw markdown from disk; no Obsidian runtime required.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VAULT = resolve(__dirname, "StoryForge");
const CHARACTERS_DIR = join(VAULT, "30 Canon/31 Characters");
const SCENES_DIR = join(VAULT, "10 Manuscript/Wardens of Moonharbor");

/** Read all .md files in a directory (non-recursive). */
function readMdFiles(dir: string): { name: string; content: string }[] {
	return readdirSync(dir)
		.filter((f) => f.endsWith(".md"))
		.map((f) => ({
			name: f,
			content: readFileSync(join(dir, f), "utf8"),
		}));
}

/** Extract the YAML frontmatter block (between first --- ... ---). */
function extractFrontmatter(content: string): string {
	const m = content.match(/^---\n([\s\S]*?)\n---/);
	return m?.[1] ?? "";
}

/** Parse frontmatter into a flat key→raw-value map (strings only, no YAML lib). */
function parseFlatFrontmatter(content: string): Record<string, string> {
	const fm = extractFrontmatter(content);
	const result: Record<string, string> = {};
	for (const line of fm.split("\n")) {
		const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)/);
		if (m?.[1] !== undefined && m?.[2] !== undefined) {
			result[m[1]] = m[2].trim();
		}
	}
	return result;
}

/**
 * Return true if the note (frontmatter OR body) contains a wikilink to the
 * given target name — matching the ADR-8 fuzzy "resolvedLinks" rule.
 * Matches [[Target Name]] and [[Target Name|alias]] forms.
 */
function noteContainsWikilink(content: string, target: string): boolean {
	// Escape special regex chars in target name
	const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const pattern = new RegExp(`\\[\\[${escaped}(\\|[^\\]]*)?\\]\\]`);
	return pattern.test(content);
}

// ---------------------------------------------------------------------------
// 1. Fantasy character exists
// ---------------------------------------------------------------------------

describe("Seed vault — fantasy character", () => {
	const FANTASY_FIELDS = ["species", "magical_abilities", "combat_skills", "weapons", "armor"];

	it("at least one character note under 30 Canon/31 Characters/ has a fantasy field", () => {
		const files = readMdFiles(CHARACTERS_DIR);
		expect(files.length).toBeGreaterThan(0);

		const fantasyCharacters = files.filter((f) => {
			const fm = parseFlatFrontmatter(f.content);
			// Has at least one fantasy field that is non-empty
			return FANTASY_FIELDS.some((field) => {
				const val = fm[field];
				// Also check multi-line list style (field: \n  - …)
				const listPattern = new RegExp(`^${field}:\\s*\\n\\s*-`, "m");
				return (val !== undefined && val !== "" && val !== "null") ||
					listPattern.test(f.content);
			});
		});

		expect(
			fantasyCharacters.length,
			`Expected ≥1 character with a fantasy field (species/magical_abilities/combat_skills/weapons/armor). ` +
			`Characters found: ${files.map((f) => f.name).join(", ")}`,
		).toBeGreaterThan(0);
	});

	it("the fantasy character has the canon/character tag", () => {
		const files = readMdFiles(CHARACTERS_DIR);

		const fantasyCharacters = files.filter((f) => {
			const fm = parseFlatFrontmatter(f.content);
			return FANTASY_FIELDS.some((field) => {
				const val = fm[field];
				const listPattern = new RegExp(`^${field}:\\s*\\n\\s*-`, "m");
				return (val !== undefined && val !== "" && val !== "null") ||
					listPattern.test(f.content);
			});
		});

		expect(fantasyCharacters.length).toBeGreaterThan(0);

		for (const fc of fantasyCharacters) {
			expect(
				fc.content,
				`${fc.name} must include the canon/character tag`,
			).toMatch(/canon\/character/);
		}
	});

	it("the fantasy character has type: character", () => {
		const files = readMdFiles(CHARACTERS_DIR);

		const fantasyCharacters = files.filter((f) => {
			const fm = parseFlatFrontmatter(f.content);
			return FANTASY_FIELDS.some((field) => {
				const val = fm[field];
				const listPattern = new RegExp(`^${field}:\\s*\\n\\s*-`, "m");
				return (val !== undefined && val !== "" && val !== "null") ||
					listPattern.test(f.content);
			});
		});

		expect(fantasyCharacters.length).toBeGreaterThan(0);

		for (const fc of fantasyCharacters) {
			const fm = parseFlatFrontmatter(fc.content);
			expect(fm["type"], `${fc.name} must have type: character`).toBe("character");
		}
	});
});

// ---------------------------------------------------------------------------
// 2. Object + lore appear in ≥1 scene
// ---------------------------------------------------------------------------

describe("Seed vault — object and lore scene coverage", () => {
	it("The Beacon Lens is referenced (wikilink) in at least one scene note", () => {
		const scenes = readMdFiles(SCENES_DIR);
		expect(scenes.length).toBeGreaterThan(0);

		const scenes_with_lens = scenes.filter((s) =>
			noteContainsWikilink(s.content, "The Beacon Lens"),
		);

		expect(
			scenes_with_lens.length,
			`Expected ≥1 scene to contain [[The Beacon Lens]]. ` +
			`Scenes checked: ${scenes.map((s) => s.name).join(", ")}`,
		).toBeGreaterThan(0);
	});

	it("The Moonfire is referenced (wikilink) in at least one scene note", () => {
		const scenes = readMdFiles(SCENES_DIR);
		expect(scenes.length).toBeGreaterThan(0);

		const scenes_with_moonfire = scenes.filter((s) =>
			noteContainsWikilink(s.content, "The Moonfire"),
		);

		expect(
			scenes_with_moonfire.length,
			`Expected ≥1 scene to contain [[The Moonfire]]. ` +
			`Scenes checked: ${scenes.map((s) => s.name).join(", ")}`,
		).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// 3. Non-empty portrait or image on a canon note
// ---------------------------------------------------------------------------

describe("Seed vault — non-empty portrait or image", () => {
	const CANON_DIRS = [
		join(VAULT, "30 Canon/31 Characters"),
		join(VAULT, "30 Canon/32 Locations"),
		join(VAULT, "30 Canon/33 Objects"),
		join(VAULT, "30 Canon/34 Lore"),
	];

	it("at least one canon note has a non-empty portrait or image field", () => {
		const allNotes: { name: string; content: string }[] = [];
		for (const dir of CANON_DIRS) {
			allNotes.push(...readMdFiles(dir));
		}
		expect(allNotes.length).toBeGreaterThan(0);

		const withImage = allNotes.filter((n) => {
			const fm = parseFlatFrontmatter(n.content);
			const portrait = fm["portrait"];
			const image = fm["image"];
			return (portrait !== undefined && portrait !== "" && portrait !== '""') ||
				(image !== undefined && image !== "" && image !== '""');
		});

		expect(
			withImage.length,
			`Expected ≥1 canon note with non-empty portrait or image. ` +
			`Notes scanned: ${allNotes.map((n) => n.name).join(", ")}`,
		).toBeGreaterThan(0);
	});
});
