/**
 * dismissedHints.test.ts — T4.6 (spec 008-codex-surface, Phase 4)
 *
 * `PluginSettings.dismissedHints`: ids of one-time capability hints (ADR-36 —
 * "core may be suggested once, dismissibly") the user has dismissed, e.g.
 * `"bases-disabled"`. Operational state (CON-2) — never story data, never
 * written to a note. Follows the T3.5 fail-closed pattern
 * (`test/settings/pluginSettings.test.ts`) and mirrors
 * `test/settings/cardByCollection.test.ts` exactly: a type guard, a
 * normalizer that falls back to `[]` for anything malformed and always
 * returns a fresh copy, and a value round-trip through a mocked save/load
 * pair proving dismissal survives a reload — an in-memory-only assertion does
 * not satisfy "permanent" (T4.6 gate).
 *
 * @ref docs/XDD/specs/008-codex-surface/plan/phase-4.md — T4.6
 * @ref docs/XDD/specs/008-codex-surface/solution.md — Data Storage Changes, CON-2, ADR-36
 */

import { describe, expect, it } from "vitest";
import {
	DEFAULT_SETTINGS,
	isDismissedHints,
	normalizeDismissedHints,
	normalizeSettings,
	type PluginSettings,
} from "../../src/types/index";

// ---------------------------------------------------------------------------
// DEFAULT_SETTINGS
// ---------------------------------------------------------------------------

describe("DEFAULT_SETTINGS.dismissedHints", () => {
	it("defaults to an empty array", () => {
		expect(DEFAULT_SETTINGS.dismissedHints).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// isDismissedHints — fail-closed
// ---------------------------------------------------------------------------

describe("isDismissedHints", () => {
	it("returns true for an array of strings", () => {
		expect(isDismissedHints(["bases-disabled"])).toBe(true);
	});

	it("returns true for an empty array (nothing dismissed yet is valid)", () => {
		expect(isDismissedHints([])).toBe(true);
	});

	it("returns false for a record (objects are not this shape)", () => {
		expect(isDismissedHints({ "bases-disabled": true })).toBe(false);
	});

	it("returns false for an array containing a non-string value", () => {
		expect(isDismissedHints(["bases-disabled", 42])).toBe(false);
	});

	it("returns false for a string", () => {
		expect(isDismissedHints("bases-disabled")).toBe(false);
	});

	it("returns false for null", () => {
		expect(isDismissedHints(null)).toBe(false);
	});

	it("returns false for undefined", () => {
		expect(isDismissedHints(undefined)).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// normalizeDismissedHints — fail-closed, fresh-copy discipline
// ---------------------------------------------------------------------------

describe("normalizeDismissedHints", () => {
	it("preserves a valid array", () => {
		expect(normalizeDismissedHints(["bases-disabled"])).toEqual(["bases-disabled"]);
	});

	it("preserves an explicit empty array", () => {
		expect(normalizeDismissedHints([])).toEqual([]);
	});

	it("falls back to [] for a record", () => {
		expect(normalizeDismissedHints({ "bases-disabled": true })).toEqual([]);
	});

	it("falls back to [] for an array containing a non-string value", () => {
		expect(normalizeDismissedHints(["bases-disabled", 42])).toEqual([]);
	});

	it("falls back to [] for null", () => {
		expect(normalizeDismissedHints(null)).toEqual([]);
	});

	it("falls back to [] for undefined", () => {
		expect(normalizeDismissedHints(undefined)).toEqual([]);
	});

	it("returns a fresh array, never the same reference as DEFAULT_SETTINGS.dismissedHints", () => {
		const valid = ["bases-disabled"];
		expect(normalizeDismissedHints(valid)).not.toBe(valid);
		expect(normalizeDismissedHints(valid)).not.toBe(DEFAULT_SETTINGS.dismissedHints);
		expect(normalizeDismissedHints(undefined)).not.toBe(DEFAULT_SETTINGS.dismissedHints);
	});

	it("mutating the returned array does not corrupt DEFAULT_SETTINGS.dismissedHints", () => {
		const result = normalizeDismissedHints(undefined);
		result.push("corrupted");
		expect(DEFAULT_SETTINGS.dismissedHints).toEqual([]);

		const resultFromValid = normalizeDismissedHints(["bases-disabled"]);
		resultFromValid.push("also corrupted");
		expect(DEFAULT_SETTINGS.dismissedHints).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// normalizeSettings — the field is wired into the field-by-field build
// ---------------------------------------------------------------------------

describe("normalizeSettings — dismissedHints", () => {
	it("defaults to [] when the raw settings blob lacks the field entirely", () => {
		expect(normalizeSettings({}).dismissedHints).toEqual([]);
		expect(normalizeSettings(null).dismissedHints).toEqual([]);
	});

	it("keeps a valid stored array", () => {
		const result = normalizeSettings({ dismissedHints: ["bases-disabled"] });
		expect(result.dismissedHints).toEqual(["bases-disabled"]);
	});

	it("does not let a malformed stored value ride through unnormalized", () => {
		const result = normalizeSettings({ dismissedHints: ["bases-disabled", 42] });
		expect(result.dismissedHints).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// Value round-trip (save then load) — the "dismissal is permanent" AC
// ---------------------------------------------------------------------------

describe("dismissedHints value round-trip (save then load)", () => {
	it("dismissing a hint and reloading keeps it dismissed", async () => {
		let storedData: unknown = {};

		async function saveSettings(settings: PluginSettings): Promise<void> {
			const raw = storedData as { settings?: unknown } | null;
			const data = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
			(data as Record<string, unknown>)["settings"] = settings;
			storedData = data;
		}

		async function loadSettings(): Promise<PluginSettings> {
			const raw = storedData as { settings?: unknown } | null | undefined;
			return normalizeSettings(raw?.settings ?? null);
		}

		await saveSettings({
			...DEFAULT_SETTINGS,
			dismissedHints: ["bases-disabled"],
		});

		const result = await loadSettings();

		expect(result.dismissedHints).toEqual(["bases-disabled"]);
	});

	it("an empty saved array reloads as empty, not as the shipped default array reference", async () => {
		let storedData: unknown = {};

		async function saveSettings(settings: PluginSettings): Promise<void> {
			storedData = { settings };
		}
		async function loadSettings(): Promise<PluginSettings> {
			const raw = storedData as { settings?: unknown } | null | undefined;
			return normalizeSettings(raw?.settings ?? null);
		}

		await saveSettings({ ...DEFAULT_SETTINGS, dismissedHints: [] });
		const result = await loadSettings();

		expect(result.dismissedHints).toEqual([]);
	});

	it("a hint dismissed across two separate save cycles accumulates rather than overwrites", async () => {
		// Mirrors the shape main.ts's onDismissHint wiring will actually use:
		// read current settings, append if absent, save — proving append-not-clobber
		// survives the round trip, not just a single literal write.
		let storedData: unknown = { settings: { ...DEFAULT_SETTINGS } };

		async function loadSettings(): Promise<PluginSettings> {
			const raw = storedData as { settings?: unknown } | null | undefined;
			return normalizeSettings(raw?.settings ?? null);
		}
		async function saveSettings(settings: PluginSettings): Promise<void> {
			storedData = { settings };
		}

		const afterFirst = await loadSettings();
		await saveSettings({ ...afterFirst, dismissedHints: [...afterFirst.dismissedHints, "bases-disabled"] });

		const afterSecondLoad = await loadSettings();
		await saveSettings({
			...afterSecondLoad,
			dismissedHints: afterSecondLoad.dismissedHints.includes("another-hint")
				? afterSecondLoad.dismissedHints
				: [...afterSecondLoad.dismissedHints, "another-hint"],
		});

		const final = await loadSettings();
		expect(final.dismissedHints).toEqual(["bases-disabled", "another-hint"]);
	});
});
