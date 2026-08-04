/**
 * basesCapability.test.ts — T4.6 (spec 008-codex-surface, Phase 4).
 *
 * ADR-36: a hint may appear only when Bases is present-but-disabled; Bases
 * absent (an old Obsidian) must be silent, same as Bases enabled. This is the
 * PURE half of that rule — no App/Plugin needed, so every combination is
 * driven directly rather than through a mocked plugin instance.
 *
 * @ref docs/XDD/specs/008-codex-surface/plan/phase-4.md — T4.6 resolution
 * @ref docs/XDD/specs/008-codex-surface/solution.md — ADR-36
 */

import { describe, it, expect } from "vitest";
import {
	BASES_CORE_MIN_VERSION,
	basesCapability,
	isVersionAtLeast,
} from "../../src/bases/basesCapability";

describe("isVersionAtLeast — numeric component comparison", () => {
	it("is true when version equals min", () => {
		expect(isVersionAtLeast("1.10.0", "1.10.0")).toBe(true);
	});

	it("is true when version is above min on the minor component", () => {
		expect(isVersionAtLeast("1.12.7", "1.10.0")).toBe(true);
	});

	it("is true when version is above min on the major component", () => {
		expect(isVersionAtLeast("2.0.0", "1.10.0")).toBe(true);
	});

	it("is false when version is below min on the minor component", () => {
		expect(isVersionAtLeast("1.9.0", "1.10.0")).toBe(false);
	});

	// The load-bearing case: a plain string compare gets this backwards
	// ("1.9.0" > "1.10.0" lexicographically, because "9" > "1").
	it("compares minor version numerically, not lexicographically", () => {
		expect("1.9.0" > "1.10.0").toBe(true); // sanity check: string compare IS backwards here
		expect(isVersionAtLeast("1.9.0", "1.10.0")).toBe(false);
		expect(isVersionAtLeast("1.10.0", "1.9.0")).toBe(true);
	});

	it("treats a missing patch component as 0", () => {
		expect(isVersionAtLeast("1.10", "1.10.0")).toBe(true);
		expect(isVersionAtLeast("1.9", "1.10.0")).toBe(false);
	});
});

describe("basesCapability — the four availability combinations", () => {
	it("reports 'absent' when apiVersion is below the core-Bases version, regardless of the cached flag", () => {
		expect(basesCapability("1.9.0", false)).toBe("absent");
		expect(basesCapability("1.9.0", true)).toBe("absent");
	});

	it("reports 'disabled' when apiVersion is at/above the core-Bases version but registration failed", () => {
		expect(basesCapability(BASES_CORE_MIN_VERSION, false)).toBe("disabled");
		expect(basesCapability("1.12.7", false)).toBe("disabled");
	});

	it("reports 'enabled' when apiVersion is at/above the core-Bases version and registration succeeded", () => {
		expect(basesCapability(BASES_CORE_MIN_VERSION, true)).toBe("enabled");
		expect(basesCapability("1.13.1", true)).toBe("enabled");
	});

	it("BASES_CORE_MIN_VERSION is 1.10.0 — registerBasesView's documented @since version", () => {
		expect(BASES_CORE_MIN_VERSION).toBe("1.10.0");
	});
});
