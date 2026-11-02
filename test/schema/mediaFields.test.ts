/**
 * mediaFields.test.ts — T6.1 (spec 008-codex-surface, Phase 6): the `media`
 * schema type.
 *
 * `portrait` (character) and `image` (location, object) are metadata-menu
 * `Media` fields holding a wikilink, not a path string. This proves the three
 * places that must agree: the generator's type map, the generated FileClasses,
 * and the seed notes the test vault ships. The entity list is read off disk
 * (CLAUDE.md: never hardcode it).
 *
 * @ref docs/XDD/specs/008-codex-surface/solution.md — ADR-32
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { nativeType } from "../../scripts/schema-types-json.mjs";
import { wikilinkTarget } from "panel/assetResolver";

const ROOT = path.resolve(__dirname, "../..");
const VAULT = path.join(ROOT, "test/StoryForge");

interface SchemaField { name: string; type: string; description: string }
interface Schema { entity: string; folder: string; fields: SchemaField[] }

function loadSchemas(): Schema[] {
	const dir = path.join(ROOT, "schema");
	return readdirSync(dir)
		.filter((f) => f.endsWith(".json"))
		.map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")) as Schema);
}

function mediaFields(): { entity: string; folder: string; name: string }[] {
	return loadSchemas().flatMap((s) =>
		s.fields.filter((f) => f.type === "media").map((f) => ({ entity: s.entity, folder: s.folder, name: f.name })),
	);
}

/** The declared metadata-menu type of `field` in a generated FileClass. */
function fileClassType(entity: string, field: string): string | undefined {
	const md = readFileSync(path.join(VAULT, "00 Meta/FileClasses", `fc-${entity}.md`), "utf8");
	return new RegExp(`- name: ${field}\\n\\s+type: (\\w+)`).exec(md)?.[1];
}

describe("schema type `media` (T6.1)", () => {
	it("declares exactly portrait, image and image as media — and no ui: image anywhere", () => {
		const found = mediaFields().map((m) => `${m.entity}.${m.name}`).sort();
		expect(found).toEqual(["character.portrait", "location.image", "object.image"]);
		expect(JSON.stringify(loadSchemas())).not.toMatch(/"ui"\s*:\s*"image"/);
	});

	it("generates every media field as a metadata-menu Media field", () => {
		for (const m of mediaFields()) {
			expect(fileClassType(m.entity, m.name), `${m.entity}.${m.name}`).toBe("Media");
		}
	});

	it("keeps a media field a plain text property in Obsidian's types.json", () => {
		expect(nativeType({ name: "portrait", type: "media" })).toBe("text");
	});

	it("no longer describes a media field as plain Text", () => {
		for (const s of loadSchemas()) {
			for (const f of s.fields.filter((x) => x.type === "media")) {
				expect(f.description, `${s.entity}.${f.name}`).toMatch(/^Media\./);
			}
		}
	});
});

describe("seed notes hold wikilinks for media fields (T6.1)", () => {
	function noteValue(file: string, field: string): string | undefined {
		const fm = /^---\n([\s\S]*?)\n---/.exec(readFileSync(file, "utf8"))?.[1] ?? "";
		const raw = new RegExp(`^${field}:\\s*(.*)$`, "m").exec(fm)?.[1]?.trim();
		return raw?.replace(/^"(.*)"$/, "$1");
	}

	function notesIn(folder: string): string[] {
		const dir = path.join(VAULT, folder);
		return readdirSync(dir).filter((f) => f.endsWith(".md")).map((f) => path.join(dir, f));
	}

	function vaultHasFile(target: string): boolean {
		const assets = path.join(VAULT, "95 Assets");
		return existsSync(path.join(VAULT, target)) || existsSync(path.join(assets, target));
	}

	it("every non-empty media value is a wikilink to an existing file, or an http(s) URL", () => {
		let checked = 0;
		for (const m of mediaFields()) {
			for (const file of notesIn(m.folder)) {
				const value = noteValue(file, m.name);
				if (!value) continue;
				checked++;
				if (/^https?:/.test(value)) continue;
				const target = wikilinkTarget(value);
				expect(target, `${path.basename(file)} ${m.name}: "${value}" is not a wikilink`).not.toBeNull();
				expect(vaultHasFile(target ?? ""), `${path.basename(file)} → ${target}`).toBe(true);
			}
		}
		expect(checked).toBeGreaterThanOrEqual(4);
	});
});
