/**
 * generatedFileClasses.test.ts — T5.3 (spec 008-codex-surface, Phase 5).
 *
 * The drift guard that makes `GENERATED_FILE_CLASSES` safe to hand-maintain.
 * `src/` cannot read `schema/` at runtime (it is not shipped into a vault), so
 * the set is a mirror of the canonical schema — and a mirror nobody checks is
 * how a shipped FileClass quietly starts rendering as the user's own.
 *
 * This test reads `schema/*.json` off disk, the same source
 * `scripts/schema-gen.mjs` generates from, and fails on any drift in either
 * direction.
 *
 * @ref docs/XDD/specs/008-codex-surface/plan/phase-5.md — T5.3, the `origin: "user"` debt
 */

import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
	GENERATED_FILE_CLASSES,
	GENERATED_FILE_CLASS_PREFIX,
	isGeneratedFileClass,
} from "editor/generatedFileClasses";

/** Every entity the canonical schema declares — one `fc-<name>.md` each. */
function schemaEntityNames(): string[] {
	const schemaDir = path.resolve(__dirname, "../../schema");
	return readdirSync(schemaDir)
		.filter((file) => file.endsWith(".json"))
		.map((file) => file.replace(/\.json$/, ""))
		.sort();
}

describe("GENERATED_FILE_CLASSES (T5.3)", () => {
	it("mirrors schema/*.json exactly — adding an entity type without updating it fails here", () => {
		const expected = schemaEntityNames().map((name) => `${GENERATED_FILE_CLASS_PREFIX}${name}`);

		expect([...GENERATED_FILE_CLASSES].sort()).toEqual(expected);
	});

	it("treats a user FileClass that extends one of ours as the user's own", () => {
		// The name looks like ours and the file extends ours; neither makes it
		// ours. This is the case S103 is built on.
		expect(isGeneratedFileClass("fc-character")).toBe(true);
		expect(isGeneratedFileClass("fc-character-custom1")).toBe(false);
		expect(isGeneratedFileClass("fc-isekai")).toBe(false);
	});
});
