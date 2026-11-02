/**
 * fieldModelCoverage — T6.3's deletion gate (spec 008-codex-surface, Phase 6).
 *
 * `inspectorFields.ts` could only go once the FileClass chain provably carried
 * what it hardcoded: every field except `tags`, which `schema-gen` excludes on
 * purpose, with a compatible type, the same select values, the same order. That
 * list mirrored `schema/*.json` under a drift test, so the schema now stands in
 * for it here and this keeps guarding the chain the Workbench depends on.
 *
 * @ref docs/XDD/adr/0002-fileclass-driven-editor.md
 * @ref docs/XDD/specs/008-codex-surface/plan/phase-6.md — T6.3
 */

import { describe, expect, it } from "vitest";
import { buildFieldModel, type FieldDef } from "editor/fieldModel";
import { generatedChain, loadSchemas, type EntitySchema } from "../helpers/generatedFileClasses";

/** The FileClass types that can carry one schema field type. */
const COMPATIBLE: Readonly<Record<string, readonly string[]>> = {
	fixed: ["Select"],
	text: ["Input"],
	media: ["Media"],
	number: ["Number"],
	select: ["Select"],
	relation: ["File"],
	list: ["Multi", "MultiFile"],
};

function modelFields(entity: string): FieldDef[] {
	return buildFieldModel(generatedChain(entity), {}).sections.flatMap((section) => section.fields);
}

function declaredBySchema(schema: EntitySchema): EntitySchema["fields"] {
	return schema.fields.filter((field) => field.type !== "tags");
}

const kinds = loadSchemas()
	.filter((schema) => schema.extends === undefined)
	.map((schema) => [schema.entity, schema] as const);

describe("the FieldModel covers everything inspectorFields.ts hardcoded (T6.3)", () => {
	it("finds every kind the old list served", () => {
		expect(kinds).toHaveLength(7);
	});

	it.each(kinds)("%s: holds every field except tags, in schema order", (entity, schema) => {
		const expected = declaredBySchema(schema).map((field) => field.name);
		const inModel = modelFields(entity).map((field) => field.name);
		expect(inModel.filter((name) => expected.includes(name))).toEqual(expected);
	});

	it.each(kinds)("%s: every field has a compatible type and the same select values", (entity, schema) => {
		const byName = new Map(modelFields(entity).map((field) => [field.name, field]));
		for (const declared of declaredBySchema(schema)) {
			const field = byName.get(declared.name);
			expect(COMPATIBLE[declared.type], `${entity}.${declared.name}`).toContain(field?.type);
			if (declared.type === "select") expect(field?.values, `${entity}.${declared.name}`).toEqual(declared.values);
			if (declared.type === "fixed") expect(field?.values, `${entity}.${declared.name}`).toEqual([entity]);
		}
	});

	it.each(kinds)("%s: the generated FileClass does not declare tags", (entity) => {
		expect(modelFields(entity).map((field) => field.name)).not.toContain("tags");
	});
});
