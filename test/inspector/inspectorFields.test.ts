/**
 * inspectorFields drift-guard — T5.2 review fix.
 *
 * Loads the canonical schema/*.json files and asserts that every entry in
 * inspectorFields() exactly matches the schema: field names, types, and
 * select `values` arrays. This test exists so that future schema edits fail
 * here rather than silently drifting at runtime.
 *
 * Route taken: hardcoded static FieldSpec[] (schema not bundled at runtime).
 * Build integration: the schema JSON files are loaded by the test runner
 * (resolveJsonModule: true, schema/ is accessible via relative path from test/).
 *
 * @ref schema/character.json
 * @ref schema/location.json
 * @ref schema/object.json
 * @ref schema/lore.json
 * @ref schema/scene.json
 * @ref schema/plotline.json
 * @ref schema/book.json
 * @ref CON-drift — inspectorFields must not drift from schema/*.json
 */

import { describe, it, expect } from "vitest";
import characterSchema from "../../schema/character.json";
import locationSchema from "../../schema/location.json";
import objectSchema from "../../schema/object.json";
import loreSchema from "../../schema/lore.json";
import sceneSchema from "../../schema/scene.json";
import plotlineSchema from "../../schema/plotline.json";
import bookSchema from "../../schema/book.json";
import { inspectorFields } from "inspector/inspectorFields";
import type { EntityKind } from "scoping/NoteContext";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A schema field as it appears in schema/*.json */
interface SchemaField {
	name: string;
	type: string;
	values?: string[];
	value?: string; // for fixed fields
}

interface EntitySchema {
	entity: string;
	fields: SchemaField[];
}

/**
 * Assert that every field listed in inspectorFields(kind) matches its counterpart
 * in the canonical schema. Checks: name exists in schema, type matches, and for
 * select fields the values array matches exactly (same order matters — the UI
 * renders options in this order and vocab checks use exact membership).
 */
function assertNoSchemaDrift(kind: EntityKind, schema: EntitySchema): void {
	const fields = inspectorFields(kind);
	const schemaByName = new Map(schema.fields.map(f => [f.name, f]));

	for (const spec of fields) {
		const schemaField = schemaByName.get(spec.name);

		// Every field in inspectorFields must exist in the canonical schema.
		expect(
			schemaField,
			`inspectorFields(${kind}) has field "${spec.name}" which is NOT in schema/${schema.entity}.json`,
		).toBeDefined();

		if (!schemaField) continue;

		// Type must match the schema (normalised: "fixed" in schema maps to "fixed" in FieldSpec;
		// "list" with a relation target stays "list" — relation in FieldSpec is for single-file links).
		// Note: schema uses "list" for both plain lists and list-of-wikilinks. FieldSpec uses "relation"
		// for single-file links (File type in FileClass) and "list" for MultiFile/plain list. Since
		// the InspectorController renders both as read-only, we allow "list" ↔ "relation" for fields
		// that the schema declares as "list" with a "relation" key (wikilink lists).
		const schemaType = schemaField.type;
		const specType = spec.type;
		const isWikilinkList = schemaType === "list" && "relation" in schemaField;
		const isRelationOrList = specType === "relation" || specType === "list";
		// A `media` field stores a `[[wikilink]]` string; the Inspector edits it as plain text.
		const isMediaAsText = schemaType === "media" && specType === "text";
		if (!(isWikilinkList && isRelationOrList) && !isMediaAsText) {
			expect(
				specType,
				`inspectorFields(${kind}) field "${spec.name}" has type "${specType}" but schema says "${schemaType}"`,
			).toBe(schemaType);
		}

		// Select values must match exactly.
		if (schemaField.type === "select" && schemaField.values) {
			if (spec.type === "select") {
				expect(
					spec.values,
					`inspectorFields(${kind}) field "${spec.name}" select values do not match schema`,
				).toEqual(schemaField.values);
			} else {
				// If schema says select but inspectorFields says something else, that's a drift.
				expect(
					spec.type,
					`inspectorFields(${kind}) field "${spec.name}" should be type "select" (schema has select values)`,
				).toBe("select");
			}
		}
	}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("inspectorFields: no drift from schema/*.json", () => {
	it("character fields match schema/character.json", () => {
		assertNoSchemaDrift("character", characterSchema as EntitySchema);
	});

	it("location fields match schema/location.json", () => {
		assertNoSchemaDrift("location", locationSchema as EntitySchema);
	});

	it("object fields match schema/object.json", () => {
		assertNoSchemaDrift("object", objectSchema as EntitySchema);
	});

	it("lore fields match schema/lore.json", () => {
		assertNoSchemaDrift("lore", loreSchema as EntitySchema);
	});

	it("scene fields match schema/scene.json", () => {
		assertNoSchemaDrift("scene", sceneSchema as EntitySchema);
	});

	it("plotline fields match schema/plotline.json", () => {
		assertNoSchemaDrift("plotline", plotlineSchema as EntitySchema);
	});

	it("book fields match schema/book.json", () => {
		assertNoSchemaDrift("book", bookSchema as EntitySchema);
	});
});

describe("inspectorFields: no unknown fields (no hallucinated entries)", () => {
	/**
	 * Each field in inspectorFields must appear in the canonical schema.
	 * (The inverse is permitted — not every schema field need appear in the Inspector.)
	 * assertNoSchemaDrift already covers this; these tests are explicit documentation.
	 */

	it("character has no fields absent from schema/character.json", () => {
		const schema = characterSchema as EntitySchema;
		const schemaNames = new Set(schema.fields.map(f => f.name));
		for (const spec of inspectorFields("character")) {
			expect(schemaNames.has(spec.name), `"${spec.name}" not in character schema`).toBe(true);
		}
	});

	it("scene has no fields absent from schema/scene.json (e.g. hallucinated 'name')", () => {
		const schema = sceneSchema as EntitySchema;
		const schemaNames = new Set(schema.fields.map(f => f.name));
		for (const spec of inspectorFields("scene")) {
			expect(schemaNames.has(spec.name), `"${spec.name}" not in scene schema`).toBe(true);
		}
	});

	it("plotline has no fields absent from schema/plotline.json", () => {
		const schema = plotlineSchema as EntitySchema;
		const schemaNames = new Set(schema.fields.map(f => f.name));
		for (const spec of inspectorFields("plotline")) {
			expect(schemaNames.has(spec.name), `"${spec.name}" not in plotline schema`).toBe(true);
		}
	});

	it("book has no fields absent from schema/book.json", () => {
		const schema = bookSchema as EntitySchema;
		const schemaNames = new Set(schema.fields.map(f => f.name));
		for (const spec of inspectorFields("book")) {
			expect(schemaNames.has(spec.name), `"${spec.name}" not in book schema`).toBe(true);
		}
	});
});
