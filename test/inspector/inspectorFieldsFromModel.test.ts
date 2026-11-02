/**
 * inspectorFieldsFromModel — the FieldModel as the Workbench editor's `FieldSpec[]`
 * (T6.3). `specFor` alone is the Anvil's write map; these are the three places
 * where the Workbench deliberately differs from it.
 *
 * @ref docs/XDD/specs/008-codex-surface/plan/phase-6.md — T6.3
 */

import { describe, expect, it } from "vitest";
import { buildFieldModel, type FieldModel } from "editor/fieldModel";
import type { FieldType } from "fileclass/fileClassTypes";
import type { FieldSpec } from "inspector/frontmatterWriter";
import { inspectorFieldsFromModel, inspectorHeadings } from "inspector/inspectorFieldsFromModel";
import { generatedChain, holdsLinks, loadSchemas, type SchemaField } from "../helpers/generatedFileClasses";

function specsFor(entity: string): FieldSpec[] {
	return inspectorFieldsFromModel(buildFieldModel(generatedChain(entity), {}));
}

/** What a schema field must reach the Workbench as. */
function expectedSpec(field: SchemaField): FieldSpec {
	switch (field.type) {
		case "fixed": return { name: field.name, type: "fixed" };
		case "media": return { name: field.name, type: "text" };
		case "number": return { name: field.name, type: "number" };
		case "select": return { name: field.name, type: "select", values: field.values ?? [] };
		case "relation": return { name: field.name, type: "relation" };
		case "list": return { name: field.name, type: holdsLinks(field) ? "relation" : "list" };
		default: return { name: field.name, type: "text" };
	}
}

function declared(type: FieldType, frontmatter: Record<string, unknown> = {}): FieldModel {
	return buildFieldModel([{ name: "fc-note", fields: [{ id: "f", name: "subject", type }] }], frontmatter);
}

const schemas = loadSchemas();

describe("inspectorFieldsFromModel, over the generated FileClasses", () => {
	it.each(schemas.map((schema) => [schema.entity, schema] as const))(
		"%s: every schema field except tags arrives with its Workbench type",
		(entity, schema) => {
			const byName = new Map(specsFor(entity).map((spec) => [spec.name, spec]));
			for (const field of schema.fields.filter((candidate) => candidate.type !== "tags")) {
				expect(byName.get(field.name), `${entity}.${field.name}`).toEqual(expectedSpec(field));
			}
		},
	);

	it("every `fixed` schema field comes out fixed, not as a one-value Select", () => {
		const fixed = schemas.flatMap((schema) =>
			schema.fields.filter((field) => field.type === "fixed").map((field) => [schema.entity, field.name] as const),
		);
		expect(fixed.length).toBeGreaterThan(0);
		for (const [entity, name] of fixed) {
			expect(specsFor(entity).find((spec) => spec.name === name)?.type, `${entity}.${name}`).toBe("fixed");
		}
	});
});

describe("inspectorFieldsFromModel, field by field", () => {
	it("maps a read-only field to fixed, whatever its type", () => {
		const model: FieldModel = {
			sections: [{ label: "x", source: "x", origin: "other", fields: [
				{ name: "stats", type: "Unknown", width: "half", readOnly: true },
				{ name: "nick", type: "Input", width: "half", readOnly: true },
			] }],
		};
		expect(inspectorFieldsFromModel(model)).toEqual([
			{ name: "stats", type: "fixed" },
			{ name: "nick", type: "fixed" },
		]);
	});

	it("makes a declared scalar holding a map fixed, so it is never overwritten", () => {
		expect(inspectorFieldsFromModel(declared("Input", { subject: { a: 1 } }))).toEqual([{ name: "subject", type: "fixed" }]);
		expect(inspectorFieldsFromModel(declared("Number", { subject: { a: 1 } }))).toEqual([{ name: "subject", type: "fixed" }]);
	});

	it("keeps Media a text field, which writes a string", () => {
		expect(inspectorFieldsFromModel(declared("Media"))).toEqual([{ name: "subject", type: "text" }]);
	});

	it("keeps MultiMedia a relation: it holds links and has no Workbench control", () => {
		expect(inspectorFieldsFromModel(declared("MultiMedia"))).toEqual([{ name: "subject", type: "relation" }]);
	});

	it("takes the remaining types from the Anvil's map", () => {
		expect(inspectorFieldsFromModel(declared("Boolean"))).toEqual([{ name: "subject", type: "boolean" }]);
		expect(inspectorFieldsFromModel(declared("Date"))).toEqual([{ name: "subject", type: "text" }]);
		expect(inspectorFieldsFromModel(declared("MultiFile"))).toEqual([{ name: "subject", type: "relation" }]);
	});

	it("fixes a field named type in every tier", () => {
		const tier2 = buildFieldModel([], { type: "character" });
		const tier3 = buildFieldModel([{ name: "fc-note", fields: [] }], { type: "character" });
		expect(inspectorFieldsFromModel(tier2)).toEqual([{ name: "type", type: "fixed" }]);
		expect(inspectorFieldsFromModel(tier3)).toEqual([{ name: "type", type: "fixed" }]);
	});

	it("fixes type even when it holds a list", () => {
		const model = buildFieldModel([], { type: ["character", "scene"] });
		expect(inspectorFieldsFromModel(model)).toEqual([{ name: "type", type: "fixed" }]);
	});
});

describe("inspectorHeadings", () => {
	it("heads the first undeclared field with the section's own label", () => {
		const headings = inspectorHeadings(declared("Input", { other: 1, more: 2 }));
		expect([...headings]).toEqual([["other", "Other properties"]]);
	});

	it("heads nothing when every field is declared", () => {
		expect(inspectorHeadings(declared("Input")).size).toBe(0);
	});

	it("heads nothing in tier 2, where the note's keys are the whole list", () => {
		expect(inspectorHeadings(buildFieldModel([], { other: 1 })).size).toBe(0);
	});
});
