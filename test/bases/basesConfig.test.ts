/**
 * basesConfig tests — T1.1 (RED first).
 *
 * Tests:
 *  - validateBasesConfig accepts a well-formed BasesConfigFile (has views)
 *  - validateBasesConfig accepts a well-formed BasesConfigFile (has filters)
 *  - validateBasesConfig accepts a well-formed BasesConfigFile (has formulas)
 *  - validateBasesConfig accepts a config with all three optional members
 *  - validateBasesConfig rejects null / undefined
 *  - validateBasesConfig rejects a non-object primitive
 *  - validateBasesConfig rejects an empty object (none of views/filters/formulas present)
 *  - validateBasesConfig rejects when views is present but not an array
 *  - validateBasesConfig rejects when formulas is present but not a Record<string,string>
 *
 * Note: `filters` is typed as `unknown` in BasesConfigFile — no shape validation
 * is performed on it; any value (string, object, undefined) is accepted as-is.
 */

import { describe, it, expect } from "vitest";
import { validateBasesConfig } from "bases/basesConfig";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeValidConfig(overrides?: Record<string, unknown>): Record<string, unknown> {
	return {
		views: [{ type: "table", name: "All characters" }],
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// validateBasesConfig
// ---------------------------------------------------------------------------

describe("validateBasesConfig", () => {
	// --- VALID cases ---

	it("returns ok for a config with a views array", () => {
		const config = makeValidConfig();

		const result = validateBasesConfig(config);

		expect(result.ok).toBe(true);
	});

	it("returns ok for a config with only filters", () => {
		const config = { filters: "type = character" };

		const result = validateBasesConfig(config);

		expect(result.ok).toBe(true);
	});

	it("returns ok for a config with only formulas", () => {
		const config = { formulas: { fullName: "concat(firstName, ' ', lastName)" } };

		const result = validateBasesConfig(config);

		expect(result.ok).toBe(true);
	});

	it("returns ok for a config with views, filters, and formulas", () => {
		const config = {
			views: [{ type: "table", name: "All" }],
			filters: "status = final",
			formulas: { slug: "lower(name)" },
		};

		const result = validateBasesConfig(config);

		expect(result.ok).toBe(true);
	});

	// --- INVALID cases ---

	it("returns error for null", () => {
		const result = validateBasesConfig(null);

		expect(result.ok).toBe(false);
		expect(result.ok === false && result.error).toMatch(/not an object/i);
	});

	it("returns error for undefined", () => {
		const result = validateBasesConfig(undefined);

		expect(result.ok).toBe(false);
	});

	it("returns error for a string value", () => {
		const result = validateBasesConfig("bad");

		expect(result.ok).toBe(false);
	});

	it("returns error for an empty object (no recognised members)", () => {
		const result = validateBasesConfig({});

		expect(result.ok).toBe(false);
		expect(result.ok === false && result.error).toMatch(/views.*filters.*formulas/i);
	});

	it("returns error when views is present but not an array", () => {
		const result = validateBasesConfig({ views: "not-an-array" });

		expect(result.ok).toBe(false);
		expect(result.ok === false && result.error).toMatch(/views/i);
	});

	it("returns error when formulas is present but not a plain object", () => {
		const result = validateBasesConfig({ formulas: ["not", "an", "object"] });

		expect(result.ok).toBe(false);
		expect(result.ok === false && result.error).toMatch(/formulas/i);
	});

	it("returns error when formulas values are not strings", () => {
		const result = validateBasesConfig({ formulas: { slug: 42 } });

		expect(result.ok).toBe(false);
		expect(result.ok === false && result.error).toMatch(/formulas/i);
	});
});
