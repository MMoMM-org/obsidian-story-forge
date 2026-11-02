/**
 * fieldModelCoverage — T6.3's deletion gate (spec 008-codex-surface, Phase 6).
 *
 * `inspectorFields.ts` may only go once the FileClass chain provably carries
 * what it hardcoded: every field except `tags`, which `schema-gen` excludes on
 * purpose, with a compatible type, the same select values, the same order.
 *
 * @ref docs/XDD/adr/0002-fileclass-driven-editor.md
 * @ref docs/XDD/specs/008-codex-surface/plan/phase-6.md — T6.3
 */

import { describe, expect, it } from "vitest";
import { buildFieldModel, type FieldDef } from "editor/fieldModel";
import { inspectorFields } from "inspector/inspectorFields";
import type { FieldSpec } from "inspector/frontmatterWriter";
import type { EntityKind } from "scoping/NoteContext";
import { generatedChain, loadSchemas } from "../helpers/generatedFileClasses";

/** The FileClass types that can stand in for one old `FieldSpec` type. */
const COMPATIBLE: Readonly<Record<string, readonly string[]>> = {
	fixed: ["Select"],
	text: ["Input", "Media"],
	number: ["Number"],
	select: ["Select"],
	relation: ["File"],
	list: ["Multi", "MultiFile"],
};

function modelFields(entity: string): FieldDef[] {
	return buildFieldModel(generatedChain(entity), {}).sections.flatMap((section) => section.fields);
}

function oldFields(entity: string): FieldSpec[] {
	return inspectorFields(entity as EntityKind).filter((field) => field.name !== "tags");
}

const kinds = loadSchemas().map((schema) => schema.entity).filter((entity) => oldFields(entity).length > 0);

describe("the FieldModel covers everything inspectorFields.ts hardcoded (T6.3)", () => {
	it("finds every kind the old list served", () => {
		expect(kinds).toHaveLength(7);
	});

	it.each(kinds)("%s: holds every old field except tags, in the old order", (entity) => {
		const old = oldFields(entity).map((field) => field.name);
		const inModel = modelFields(entity).map((field) => field.name);
		expect(inModel.filter((name) => old.includes(name))).toEqual(old);
	});

	it.each(kinds)("%s: every old field has a compatible type and the same select values", (entity) => {
		const byName = new Map(modelFields(entity).map((field) => [field.name, field]));
		for (const old of oldFields(entity)) {
			const field = byName.get(old.name);
			expect(COMPATIBLE[old.type], `${entity}.${old.name}`).toContain(field?.type);
			if (old.type === "select") expect(field?.values, `${entity}.${old.name}`).toEqual(old.values);
			if (old.type === "fixed") expect(field?.values, `${entity}.${old.name}`).toEqual([entity]);
		}
	});

	it.each(kinds)("%s: the generated FileClass does not declare tags", (entity) => {
		expect(modelFields(entity).map((field) => field.name)).not.toContain("tags");
	});
});
