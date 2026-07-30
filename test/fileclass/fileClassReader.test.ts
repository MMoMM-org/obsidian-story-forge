/**
 * fileClassReader tests — T1.2 (RED first).
 *
 * Behaviour under test (via the public `resolveFileClassChain` API only):
 *  - a single class (no `extends`) parses
 *  - `extends` produces a base-first chain
 *  - a cycle truncates at the first repeat
 *  - a malformed class is skipped and the rest of the chain still parses
 *  - an unknown `type` maps to "Unknown"
 *  - `fieldsOrder` resolves through ids, not names
 *  - a class with empty `tagNames`/`filesPaths` is still reachable via `extends`
 *  - defensive degradation: missing/non-object frontmatter never throws
 */

import { describe, it, expect } from "vitest";
import { resolveFileClassChain } from "fileclass/fileClassReader";
import type { FileClassLookup } from "fileclass/fileClassTypes";
import { FC_CHARACTER, FC_CHARACTER_FANTASY } from "./fixtures";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a FileClassLookup over a plain name → frontmatter map. */
function makeLookup(entries: Record<string, unknown>): FileClassLookup {
	return {
		getFileClassFrontmatter(name: string): unknown {
			return entries[name];
		},
	};
}

// ---------------------------------------------------------------------------
// resolveFileClassChain
// ---------------------------------------------------------------------------

describe("resolveFileClassChain", () => {
	it("parses a single class with no extends", () => {
		const lookup = makeLookup({ "fc-character": FC_CHARACTER });

		const chain = resolveFileClassChain("fc-character", lookup);

		expect(chain).toHaveLength(1);
		expect(chain[0]?.name).toBe("fc-character");
		expect(chain[0]?.fields.map((f) => f.name)).toEqual([
			"type",
			"name",
			"role",
			"status",
			"age",
			"portrait",
		]);
	});

	it("produces a base-first chain when a class extends another", () => {
		const lookup = makeLookup({
			"fc-character": FC_CHARACTER,
			"fc-character-fantasy": FC_CHARACTER_FANTASY,
		});

		const chain = resolveFileClassChain("fc-character-fantasy", lookup);

		expect(chain.map((c) => c.name)).toEqual(["fc-character", "fc-character-fantasy"]);
	});

	it("resolves fieldsOrder through ids, not names, using the real fc-character-fantasy shape", () => {
		const lookup = makeLookup({
			"fc-character": FC_CHARACTER,
			"fc-character-fantasy": FC_CHARACTER_FANTASY,
		});

		const chain = resolveFileClassChain("fc-character-fantasy", lookup);
		const fantasySection = chain.find((c) => c.name === "fc-character-fantasy");

		expect(fantasySection?.fields.map((f) => f.id)).toEqual([
			"g-species",
			"g-combat_skills",
			"g-other_skills",
		]);
		expect(fantasySection?.fields.map((f) => f.name)).toEqual([
			"species",
			"combat_skills",
			"other_skills",
		]);
	});

	it("is still reachable via extends when tagNames/filesPaths are empty", () => {
		// FC_CHARACTER_FANTASY carries tagNames: [""] / filesPaths: [""], exactly
		// like the real generated file — the reader must not use them at all.
		const lookup = makeLookup({
			"fc-character": FC_CHARACTER,
			"fc-character-fantasy": FC_CHARACTER_FANTASY,
		});

		const chain = resolveFileClassChain("fc-character-fantasy", lookup);

		expect(chain.map((c) => c.name)).toContain("fc-character-fantasy");
	});

	it("truncates a cycle at the first repeat", () => {
		const lookup = makeLookup({
			"fc-a": { fieldsOrder: ["a-1"], fields: [{ id: "a-1", name: "one", type: "Input" }], extends: "fc-b" },
			"fc-b": { fieldsOrder: ["b-1"], fields: [{ id: "b-1", name: "two", type: "Input" }], extends: "fc-a" },
		});

		const chain = resolveFileClassChain("fc-a", lookup);

		// Each of fc-a / fc-b renders once; no infinite loop, no duplicate section.
		const names = chain.map((c) => c.name);
		expect(names).toEqual(["fc-b", "fc-a"]);
		expect(new Set(names).size).toBe(names.length);
	});

	it("skips a malformed class but still parses the rest of the chain via its extends", () => {
		const lookup = makeLookup({
			"fc-character": FC_CHARACTER,
			// fc-broken sits between fc-character-fantasy and fc-character: its
			// `fields` is not an array (malformed), but `extends` is still a
			// plain, readable string.
			"fc-broken": { extends: "fc-character", fieldsOrder: ["x-1"], fields: "not-an-array" },
			"fc-leaf": { extends: "fc-broken", fieldsOrder: ["l-1"], fields: [{ id: "l-1", name: "leaf", type: "Input" }] },
		});

		const chain = resolveFileClassChain("fc-leaf", lookup);

		expect(chain.map((c) => c.name)).toEqual(["fc-character", "fc-leaf"]);
	});

	it("maps an unrecognised type to Unknown", () => {
		const lookup = makeLookup({
			"fc-weird": {
				fieldsOrder: ["w-1", "w-2"],
				fields: [
					{ id: "w-1", name: "computed", type: "Lookup" },
					{ id: "w-2", name: "mystery", type: "SomeFutureType" },
				],
			},
		});

		const chain = resolveFileClassChain("fc-weird", lookup);

		expect(chain[0]?.fields.map((f) => f.type)).toEqual(["Unknown", "Unknown"]);
	});

	it("degrades to an empty chain, never throws, when the starting class is missing", () => {
		const lookup = makeLookup({});

		expect(() => resolveFileClassChain("fc-does-not-exist", lookup)).not.toThrow();
		expect(resolveFileClassChain("fc-does-not-exist", lookup)).toEqual([]);
	});

	it("degrades to an empty chain, never throws, when frontmatter is not an object", () => {
		const lookup = makeLookup({ "fc-null": null, "fc-string": "not frontmatter" });

		expect(() => resolveFileClassChain("fc-null", lookup)).not.toThrow();
		expect(resolveFileClassChain("fc-null", lookup)).toEqual([]);
		expect(resolveFileClassChain("fc-string", lookup)).toEqual([]);
	});

	it("reads selectable values from options.valuesList for a Select field", () => {
		const lookup = makeLookup({ "fc-character-fantasy": FC_CHARACTER_FANTASY });

		const chain = resolveFileClassChain("fc-character-fantasy", lookup);
		const species = chain[0]?.fields.find((f) => f.id === "g-species");

		expect(species?.values).toEqual([
			"Human",
			"HighElf",
			"DarkElf",
			"WoodElf",
			"Dwarf",
			"Halfling",
			"Orc",
			"Ogre",
		]);
	});

	it("omits values for a Multi field sourced from another note (empty valuesList)", () => {
		const lookup = makeLookup({ "fc-character-fantasy": FC_CHARACTER_FANTASY });

		const chain = resolveFileClassChain("fc-character-fantasy", lookup);
		const combatSkills = chain[0]?.fields.find((f) => f.id === "g-combat_skills");

		expect(combatSkills?.values).toBeUndefined();
	});
});
