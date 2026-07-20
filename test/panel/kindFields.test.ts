/**
 * kindFields tests — T3.1 RED phase.
 *
 * Tests that kindFields() returns correct { facts, relations } lists per kind.
 * Verified against schema/*.json canonical field names.
 */

import { describe, it, expect } from "vitest";
import { kindFields } from "panel/kindFields";

describe("kindFields()", () => {
	// -------------------------------------------------------------------------
	// Return shape
	// -------------------------------------------------------------------------

	it("returns an object with facts and relations arrays for every kind", () => {
		const kinds = ["character", "location", "object", "lore", "scene", "plotline", "book", "unknown"] as const;
		for (const kind of kinds) {
			const result = kindFields(kind);
			expect(Array.isArray(result.facts)).toBe(true);
			expect(Array.isArray(result.relations)).toBe(true);
		}
	});

	// -------------------------------------------------------------------------
	// character
	// -------------------------------------------------------------------------

	describe("character", () => {
		it("has the expected relation fields", () => {
			const { relations } = kindFields("character");
			expect(relations).toContain("significant_other");
			expect(relations).toContain("family");
			expect(relations).toContain("friends");
			expect(relations).toContain("allies");
			expect(relations).toContain("enemies");
		});

		it("has the expected fact fields", () => {
			const { facts } = kindFields("character");
			expect(facts).toContain("role");
			expect(facts).toContain("status");
			expect(facts).toContain("occupation");
			expect(facts).toContain("age");
			expect(facts).toContain("height");
			expect(facts).toContain("build");
			expect(facts).toContain("hair");
			expect(facts).toContain("eyes");
			expect(facts).toContain("distinctive_features");
			expect(facts).toContain("aliases");
			expect(facts).toContain("nickname");
			expect(facts).toContain("tagline");
			expect(facts).toContain("first_appearance");
		});

		it("does NOT include portrait in facts or relations (special field)", () => {
			const { facts, relations } = kindFields("character");
			expect(facts).not.toContain("portrait");
			expect(relations).not.toContain("portrait");
		});
	});

	// -------------------------------------------------------------------------
	// location
	// -------------------------------------------------------------------------

	describe("location", () => {
		it("has the expected relation fields", () => {
			const { relations } = kindFields("location");
			expect(relations).toContain("world");
			expect(relations).toContain("inhabitants");
		});

		it("has the expected fact fields", () => {
			const { facts } = kindFields("location");
			expect(facts).toContain("locationType");
			expect(facts).toContain("region");
			expect(facts).toContain("aliases");
			expect(facts).toContain("first_appearance");
		});

		it("does NOT include image in facts or relations (special field)", () => {
			const { facts, relations } = kindFields("location");
			expect(facts).not.toContain("image");
			expect(relations).not.toContain("image");
		});
	});

	// -------------------------------------------------------------------------
	// object
	// -------------------------------------------------------------------------

	describe("object", () => {
		it("has the expected relation fields", () => {
			const { relations } = kindFields("object");
			expect(relations).toContain("owner");
		});

		it("has the expected fact fields", () => {
			const { facts } = kindFields("object");
			expect(facts).toContain("kind");
			expect(facts).toContain("aliases");
			expect(facts).toContain("first_appearance");
		});

		it("does NOT include image in facts or relations (special field)", () => {
			const { facts, relations } = kindFields("object");
			expect(facts).not.toContain("image");
			expect(relations).not.toContain("image");
		});
	});

	// -------------------------------------------------------------------------
	// lore
	// -------------------------------------------------------------------------

	describe("lore", () => {
		it("has the expected relation fields", () => {
			const { relations } = kindFields("lore");
			expect(relations).toContain("related");
		});

		it("has the expected fact fields", () => {
			const { facts } = kindFields("lore");
			expect(facts).toContain("scope");
			expect(facts).toContain("aliases");
			expect(facts).toContain("first_appearance");
		});
	});

	// -------------------------------------------------------------------------
	// scene
	// -------------------------------------------------------------------------

	describe("scene", () => {
		it("has the expected relation fields", () => {
			const { relations } = kindFields("scene");
			expect(relations).toContain("pov");
			expect(relations).toContain("characters");
			expect(relations).toContain("location");
			expect(relations).toContain("plotlines");
			expect(relations).toContain("book");
			expect(relations).toContain("prev");
			expect(relations).toContain("next");
		});

		it("has the expected fact fields", () => {
			const { facts } = kindFields("scene");
			expect(facts).toContain("subtitle");
			expect(facts).toContain("act");
			expect(facts).toContain("chapter");
			expect(facts).toContain("order");
			expect(facts).toContain("when");
			expect(facts).toContain("status");
			expect(facts).toContain("arc");
		});
	});

	// -------------------------------------------------------------------------
	// plotline
	// -------------------------------------------------------------------------

	describe("plotline", () => {
		it("has empty relations array", () => {
			const { relations } = kindFields("plotline");
			expect(relations).toHaveLength(0);
		});

		it("has the expected fact fields", () => {
			const { facts } = kindFields("plotline");
			expect(facts).toContain("logline");
			expect(facts).toContain("status");
			expect(facts).toContain("series");
		});
	});

	// -------------------------------------------------------------------------
	// book
	// -------------------------------------------------------------------------

	describe("book", () => {
		it("has empty relations array", () => {
			const { relations } = kindFields("book");
			expect(relations).toHaveLength(0);
		});

		it("has the expected fact fields", () => {
			const { facts } = kindFields("book");
			expect(facts).toContain("subtitle");
			expect(facts).toContain("author");
			expect(facts).toContain("order");
			expect(facts).toContain("status");
			expect(facts).toContain("series");
		});
	});

	// -------------------------------------------------------------------------
	// unknown
	// -------------------------------------------------------------------------

	describe("unknown", () => {
		it("returns empty facts and relations", () => {
			const { facts, relations } = kindFields("unknown");
			expect(facts).toHaveLength(0);
			expect(relations).toHaveLength(0);
		});
	});
});
