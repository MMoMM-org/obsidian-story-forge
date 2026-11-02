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
 *  - a list stored in a field declared as a scalar becomes chips (T6.3)
 *  - the width rule reproduces S102/S103 exactly, field by field
 *  - widthOf: an unrecognised type is full width; a `ui` hint on an unknown
 *    type is still full width (never a crash, never silently dropped)
 */

import { describe, it, expect } from "vitest";
import { buildFieldModel } from "editor/fieldModel";
import { widthOf } from "editor/uiHints";
import { GENERATED_UI_HINTS } from "editor/generatedUiHints";
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

/** The one field a chain declaring `type` yields for a note holding `value`. */
function fieldFor(type: FileClassField["type"], value: unknown, values?: string[]): unknown {
	const fileClass: ParsedFileClass = {
		name: "fc-note",
		fields: [{ id: "f", name: "subject", type, ...(values ? { values } : {}) }],
	};
	return buildFieldModel([fileClass], { subject: value }).sections[0]?.fields[0];
}

function widthsByName(fields: { name: string; width: "half" | "full" }[]): Record<string, "half" | "full"> {
	return Object.fromEntries(fields.map((field) => [field.name, field.width]));
}

// ---------------------------------------------------------------------------
// The stored value outranks a declared scalar type (T6.3)
// ---------------------------------------------------------------------------

describe("buildFieldModel — a list stored in a field declared as a scalar (T6.3)", () => {
	it.each(["Input", "Number", "Boolean", "Select", "Cycle", "Date", "Datetime", "Time", "Unknown"] as const)(
		"%s holding strings becomes free chips at full width, with no leftover vocabulary",
		(type) => {
			expect(fieldFor(type, ["one", "two"], ["a"])).toEqual({ name: "subject", type: "Multi", width: "full" });
		},
	);

	it.each(["Input", "File", "Media", "MultiMedia"] as const)("%s holding only [[links]] becomes link chips", (type) => {
		expect(fieldFor(type, ["[[A]]", "[[B]]"])).toEqual({ name: "subject", type: "MultiFile", width: "full" });
	});

	it("reads a link with whitespace around it the way the chip control does", () => {
		expect(fieldFor("Input", [" [[A]] "])).toMatchObject({ type: "MultiFile" });
	});

	it("keeps a list mixing links and plain strings as free chips", () => {
		expect(fieldFor("Input", ["[[A]]", "plain"])).toMatchObject({ type: "Multi" });
	});

	it("treats an empty list as a list: free chips, or link chips where the field holds links", () => {
		expect(fieldFor("Input", [])).toMatchObject({ type: "Multi" });
		expect(fieldFor("File", [])).toMatchObject({ type: "MultiFile" });
		expect(fieldFor("Media", [])).toMatchObject({ type: "MultiFile" });
		expect(fieldFor("MultiMedia", [])).toMatchObject({ type: "MultiFile" });
	});

	it("keeps the declared type and marks a list of non-strings read-only", () => {
		expect(fieldFor("Input", [1, 2])).toEqual({ name: "subject", type: "Input", width: "half", readOnly: true });
		expect(fieldFor("File", ["[[A]]", 2])).toMatchObject({ type: "File", readOnly: true });
	});

	it.each(["Multi", "MultiFile"] as const)("leaves a declared %s alone", (type) => {
		expect(fieldFor(type, ["[[A]]", "plain"])).toMatchObject({ type });
	});

	it.each([["a string", "text"], ["a number", 3], ["nothing", undefined], ["null", null]])(
		"leaves a declared scalar holding %s alone",
		(_label, value) => {
			expect(fieldFor("Input", value)).toEqual({ name: "subject", type: "Input", width: "half" });
		},
	);

	it("keeps a ui hint on the field it turned into chips", () => {
		const fileClass: ParsedFileClass = { name: "fc-note", fields: [{ id: "f", name: "subject", type: "Input" }] };
		const model = buildFieldModel([fileClass], { subject: ["x"] }, { "fc-note": { subject: "wide" } });
		expect(model.sections[0]?.fields[0]).toEqual({ name: "subject", type: "Multi", width: "full", ui: "wide" });
	});
});

// ---------------------------------------------------------------------------
// Tier 1 — sections from the chain
// ---------------------------------------------------------------------------

describe("buildFieldModel — tier 1: a FileClass chain resolves", () => {
	it("renders one section per FileClass in the chain, base first", () => {
		const model = buildFieldModel([makeCharacterClass(), makeIsekaiClass()], {}, {});

		// Labels are display labels as of OQ-1 (resolved 2026-08-05): the
		// FileClass's own `title` when it has one, otherwise derived from the file
		// name. These fixtures declare no title, so both take the fallback — which
		// is the live path for every FileClass the plugin generates.
		expect(model.sections.map((section) => section.label)).toEqual(["Character", "Character custom1"]);
	});

	it("marks a FileClass the plugin did not generate as the user's own", () => {
		const model = buildFieldModel([makeCharacterClass(), makeIsekaiClass()], {}, {});

		expect(model.sections.map((section) => section.origin)).toEqual(["builtin", "user"]);
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

	it("applies each section's own ui hints across a chain, first declaration winning", () => {
		const fantasy: ParsedFileClass = {
			name: "fc-character-fantasy",
			extends: "fc-character",
			fields: [
				makeField({ id: "x-tagline", name: "tagline", type: "Input" }), // duplicate: dropped
				makeField({ id: "x-motto", name: "motto", type: "Input" }),
			],
		};

		const model = buildFieldModel([makeCharacterClass(), fantasy], {}, GENERATED_UI_HINTS);

		const width = (s: number, n: string) => model.sections[s]?.fields.find((f) => f.name === n)?.width;
		expect(width(0, "tagline")).toBe("full");
		expect(width(1, "motto")).toBe("half");
		expect(model.sections[1]?.fields.map((f) => f.name)).toEqual(["motto"]);
	});

	it("keeps a same-named field half width when only another class declares it", () => {
		const other: ParsedFileClass = {
			name: "fc-character-fantasy",
			fields: [makeField({ id: "x-tagline", name: "tagline", type: "Input" })],
		};

		const model = buildFieldModel([other], {}, GENERATED_UI_HINTS);

		expect(model.sections[0]?.fields[0]?.width).toBe("half");
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
			{ name: "born", type: "Unknown", width: "full", readOnly: true },
			{ name: "meta", type: "Unknown", width: "full", readOnly: true },
		]);
	});

	it("marks a list that is not all strings read-only, so editing cannot stringify it", () => {
		const model = buildFieldModel([], { scores: [1, 2], mixed: ["a", 2], none: [] }, {});

		expect(model.sections[0]?.fields).toEqual([
			{ name: "scores", type: "Unknown", width: "full", readOnly: true },
			{ name: "mixed", type: "Unknown", width: "full", readOnly: true },
			{ name: "none", type: "Multi", width: "full" },
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
		expect(last?.fields).toEqual([{ name: "scratch", type: "Input", width: "half" }]);
	});

	it("types an undeclared key by its value, as tier 2 does, so editing keeps its YAML type", () => {
		const model = buildFieldModel(
			[makeCharacterClass()],
			{ name: "Mara", age: 34, awakened: true, nicknames: ["Em", "Ash"], note: "x" },
			{},
		);

		expect(model.sections.at(-1)?.fields).toEqual([
			{ name: "age", type: "Number", width: "half" },
			{ name: "awakened", type: "Boolean", width: "half" },
			{ name: "nicknames", type: "Multi", width: "full" },
			{ name: "note", type: "Input", width: "half" },
		]);
	});

	it("marks a value no control can represent read-only, and leaves an empty key editable", () => {
		const model = buildFieldModel(
			[makeCharacterClass()],
			{ name: "Mara", meta: { nested: true }, scores: [1, 2], empty: null },
			{},
		);

		expect(model.sections.at(-1)?.fields).toEqual([
			{ name: "meta", type: "Unknown", width: "full", readOnly: true },
			{ name: "scores", type: "Unknown", width: "full", readOnly: true },
			{ name: "empty", type: "Unknown", width: "full" },
		]);
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
		const model = buildFieldModel([makeCharacterClass()], {}, { "fc-character": { tagline: "wide" } });

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
