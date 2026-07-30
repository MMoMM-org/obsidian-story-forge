/**
 * fieldModel tests — T1.3 (RED first).
 *
 * Behaviour under test (via the public `buildFieldModel` API, plus
 * `widthOf` directly since `uiHints.ts` is its own small public module):
 *  - one section per FileClass in the chain, base first
 *  - a field declared twice renders once, in the earliest section (F6 edge case)
 *  - the reader's declared-but-fieldsOrder-omitted fields pass through untouched
 *  - tier 2: no chain at all -> the note's own frontmatter keys, typed by value
 *  - tier 2: an empty/undefined note still yields exactly one (empty) section
 *  - tier 3: an undeclared key lands in a trailing "Other properties" section
 *  - tier 3 is omitted entirely when nothing is undeclared
 *  - a Select whose current value is absent from its declared list is left
 *    untouched (no filtering, no throw) — F6 edge case
 *  - the width rule reproduces S102/S103 exactly, field by field
 *  - widthOf: an unrecognised type is full width; a `ui` hint on an unknown
 *    type is still full width (never a crash, never silently dropped)
 */

import { describe, it, expect } from "vitest";
import { buildFieldModel } from "editor/fieldModel";
import { widthOf } from "editor/uiHints";
import type { ParsedFileClass, FileClassField } from "fileclass/fileClassTypes";

// ---------------------------------------------------------------------------
// Factories — the S102/S103 shapes, trimmed to the fields the mockup traces.
// ---------------------------------------------------------------------------

function makeField(overrides: Partial<FileClassField> & Pick<FileClassField, "id" | "name" | "type">): FileClassField {
	return { ...overrides };
}

/** fc-character (S102) — name/role/status/occupation half; tagline `ui:wide`, portrait `Media`, full. */
function makeCharacterClass(overrides: Partial<ParsedFileClass> = {}): ParsedFileClass {
	return {
		name: "fc-character",
		fields: [
			makeField({ id: "f-name", name: "name", type: "Input" }),
			makeField({ id: "f-role", name: "role", type: "Select", values: ["protagonist", "antagonist"] }),
			makeField({ id: "f-status", name: "status", type: "Select", values: ["alive", "dead"] }),
			makeField({ id: "f-occupation", name: "occupation", type: "Input" }),
			makeField({ id: "f-tagline", name: "tagline", type: "Input" }),
			makeField({ id: "f-portrait", name: "portrait", type: "Media" }),
		],
		...overrides,
	};
}

/** fc-character-custom1 (S103, "Isekai") — level/affinity/awakened half; skills/guild full. */
function makeIsekaiClass(overrides: Partial<ParsedFileClass> = {}): ParsedFileClass {
	return {
		name: "fc-character-custom1",
		extends: "fc-character",
		fields: [
			makeField({ id: "u-level", name: "level", type: "Number" }),
			makeField({ id: "u-affinity", name: "affinity", type: "Select", values: ["fire", "water"] }),
			makeField({ id: "u-awakened", name: "awakened", type: "Boolean" }),
			makeField({ id: "u-skills", name: "skills", type: "Multi" }),
			makeField({ id: "u-guild", name: "guild", type: "MultiFile" }),
		],
		...overrides,
	};
}

function widthsByName(fields: { name: string; width: "half" | "full" }[]): Record<string, "half" | "full"> {
	return Object.fromEntries(fields.map((field) => [field.name, field.width]));
}

// ---------------------------------------------------------------------------
// Tier 1 — sections from the chain
// ---------------------------------------------------------------------------

describe("buildFieldModel — tier 1: a FileClass chain resolves", () => {
	it("renders one section per FileClass in the chain, base first", () => {
		const model = buildFieldModel([makeCharacterClass(), makeIsekaiClass()], {}, {});

		expect(model.sections.map((section) => section.label)).toEqual(["fc-character", "fc-character-custom1"]);
	});

	it("labels a section's source with the FileClass file it came from", () => {
		const model = buildFieldModel([makeCharacterClass()], {}, {});

		expect(model.sections[0]?.source).toBe("fc-character.md");
	});

	it("renders a field declared twice once, in the earliest section", () => {
		const base = makeCharacterClass({
			fields: [makeField({ id: "f-name", name: "name", type: "Input" })],
		});
		const child = makeIsekaiClass({
			fields: [
				makeField({ id: "u-name", name: "name", type: "Input" }), // repeat of the base's "name"
				makeField({ id: "u-level", name: "level", type: "Number" }),
			],
		});

		const model = buildFieldModel([base, child], {}, {});

		expect(model.sections[0]?.fields.map((f) => f.name)).toEqual(["name"]);
		expect(model.sections[1]?.fields.map((f) => f.name)).toEqual(["level"]);
	});

	it("passes the reader's field order through untouched, including fieldsOrder-omitted fields appended last", () => {
		// fileClassReader already appends declared-but-fieldsOrder-omitted fields
		// last, in declaration order, rather than dropping them (see report).
		// fieldModel must not re-derive or re-filter that order — just consume it.
		const fileClass = makeCharacterClass({
			fields: [
				makeField({ id: "f-status", name: "status", type: "Select" }),
				makeField({ id: "f-name", name: "name", type: "Input" }), // e.g. omitted from fieldsOrder, appended last
			],
		});

		const model = buildFieldModel([fileClass], {}, {});

		expect(model.sections[0]?.fields.map((f) => f.name)).toEqual(["status", "name"]);
	});

	it("keeps a Select's declared values untouched, and does not throw, when the note's current value is absent from them", () => {
		const fileClass = makeCharacterClass({
			fields: [makeField({ id: "f-role", name: "role", type: "Select", values: ["protagonist", "antagonist"] })],
		});

		expect(() => buildFieldModel([fileClass], { role: "villain-arc" }, {})).not.toThrow();

		const model = buildFieldModel([fileClass], { role: "villain-arc" }, {});
		expect(model.sections[0]?.fields[0]?.values).toEqual(["protagonist", "antagonist"]);
	});
});

// ---------------------------------------------------------------------------
// Tier 2 — no chain at all
// ---------------------------------------------------------------------------

describe("buildFieldModel — tier 2: no FileClass applies", () => {
	it("types the note's own frontmatter keys by inspecting their values", () => {
		const model = buildFieldModel(
			[],
			{ name: "Mara", age: 34, awakened: true, skills: ["ember sight", "tidecall"] },
			{},
		);

		expect(model.sections).toHaveLength(1);
		expect(model.sections[0]?.fields).toEqual([
			{ name: "name", type: "Input", width: "half" },
			{ name: "age", type: "Number", width: "half" },
			{ name: "awakened", type: "Boolean", width: "half" },
			{ name: "skills", type: "Multi", width: "full" },
		]);
	});

	it("still returns exactly one (empty) section for a note with no frontmatter, without error", () => {
		const model = buildFieldModel([], undefined, {});

		expect(model.sections).toHaveLength(1);
		expect(model.sections[0]?.fields).toEqual([]);
	});

	it("types values it cannot map to a control as Unknown/full — null, a Date, and a nested object", () => {
		// Realistic tier-2 inputs from Obsidian's own frontmatter parser: `null`
		// is a common empty-property value, unquoted YAML date scalars come back
		// as native `Date` objects, and a hand-edited nested block is an object.
		const model = buildFieldModel(
			[],
			{ empty: null, born: new Date("2024-01-01"), meta: { nested: true } },
			{},
		);

		expect(model.sections[0]?.fields).toEqual([
			{ name: "empty", type: "Unknown", width: "full" },
			{ name: "born", type: "Unknown", width: "full" },
			{ name: "meta", type: "Unknown", width: "full" },
		]);
	});
});

// ---------------------------------------------------------------------------
// Tier 3 — undeclared keys
// ---------------------------------------------------------------------------

describe("buildFieldModel — tier 3: a key no FileClass declares", () => {
	it("appears last, in a distinct Other properties section", () => {
		const model = buildFieldModel([makeCharacterClass()], { name: "Mara", scratch: "note to self" }, {});

		const last = model.sections.at(-1);
		expect(last?.label).toBe("Other properties");
		expect(last?.fields).toEqual([{ name: "scratch", type: "Unknown", width: "full" }]);
	});

	it("is omitted entirely when every frontmatter key is declared by the chain", () => {
		const model = buildFieldModel([makeCharacterClass()], { name: "Mara" }, {});

		expect(model.sections.some((section) => section.label === "Other properties")).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// The width rule (F6 / ADR-32) — reproduces S102/S103 exactly
// ---------------------------------------------------------------------------

describe("buildFieldModel — the width rule reproduces S102/S103", () => {
	it("gives name/role/status/occupation half width, tagline (ui:wide) and portrait (Media) full", () => {
		const model = buildFieldModel([makeCharacterClass()], {}, { tagline: "wide" });

		expect(widthsByName(model.sections[0]!.fields)).toEqual({
			name: "half",
			role: "half",
			status: "half",
			occupation: "half",
			tagline: "full",
			portrait: "full",
		});
	});

	it("gives level/affinity/awakened half width, skills/guild full width", () => {
		const model = buildFieldModel([makeCharacterClass(), makeIsekaiClass()], {}, {});

		expect(widthsByName(model.sections[1]!.fields)).toEqual({
			level: "half",
			affinity: "half",
			awakened: "half",
			skills: "full",
			guild: "full",
		});
	});
});

// ---------------------------------------------------------------------------
// widthOf — direct edge cases (uiHints.ts's own public API)
// ---------------------------------------------------------------------------

describe("widthOf", () => {
	it("resolves an unrecognised type to full width", () => {
		expect(widthOf({ type: "Unknown" })).toBe("full");
	});

	it("resolves a `wide` hint on an unrecognised type to full width, never crashing", () => {
		expect(widthOf({ type: "Unknown", ui: "wide" })).toBe("full");
	});

	it("resolves every half-width type", () => {
		for (const type of ["Input", "Boolean", "Number", "Select", "Cycle", "Date", "Datetime", "Time"] as const) {
			expect(widthOf({ type })).toBe("half");
		}
	});

	it("resolves every list-valued or media type to full width", () => {
		for (const type of ["Multi", "MultiFile", "Media", "MultiMedia", "File"] as const) {
			expect(widthOf({ type })).toBe("full");
		}
	});
});
