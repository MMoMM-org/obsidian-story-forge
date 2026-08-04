/**
 * cardByCollection.test.ts — T4.4 (spec 008-codex-surface, Phase 4)
 *
 * `PluginSettings.cardByCollection`: which Card renders each collection, keyed by
 * collection id. Operational state (CON-2) — never story data, never written to a
 * note. Follows the T3.5 fail-closed pattern (`test/settings/pluginSettings.test.ts`):
 * a type guard, a normalizer that falls back to `{}` for anything malformed, and a
 * value round-trip through a mocked save/load pair (the precedent in
 * `test/settings/linkClickAction.test.ts`, lines 307-376) proving the choice
 * survives a reload.
 *
 * @ref docs/XDD/specs/008-codex-surface/plan/phase-4.md — T4.4
 * @ref docs/XDD/specs/008-codex-surface/solution.md — Data Storage Changes, CON-2
 */

import { describe, expect, it } from "vitest";
import {
	DEFAULT_SETTINGS,
	isCardByCollection,
	normalizeCardByCollection,
	normalizeSettings,
	type PluginSettings,
} from "../../src/types/index";

// ---------------------------------------------------------------------------
// DEFAULT_SETTINGS
// ---------------------------------------------------------------------------

describe("DEFAULT_SETTINGS.cardByCollection", () => {
	it("defaults to an empty record", () => {
		expect(DEFAULT_SETTINGS.cardByCollection).toEqual({});
	});
});

// ---------------------------------------------------------------------------
// isCardByCollection — fail-closed
// ---------------------------------------------------------------------------

describe("isCardByCollection", () => {
	it("returns true for a record of string values", () => {
		expect(isCardByCollection({ character: "hero", lore: "table" })).toBe(true);
	});

	it("returns true for an empty record (nothing chosen yet is valid)", () => {
		expect(isCardByCollection({})).toBe(true);
	});

	it("returns false for an array (arrays are objects, but not this shape)", () => {
		expect(isCardByCollection(["hero"])).toBe(false);
	});

	it("returns false for a record containing a non-string value", () => {
		expect(isCardByCollection({ character: "hero", lore: 42 })).toBe(false);
	});

	it("returns false for a string", () => {
		expect(isCardByCollection("hero")).toBe(false);
	});

	it("returns false for null", () => {
		expect(isCardByCollection(null)).toBe(false);
	});

	it("returns false for undefined", () => {
		expect(isCardByCollection(undefined)).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// normalizeCardByCollection — fail-closed, fresh-copy discipline
// ---------------------------------------------------------------------------

describe("normalizeCardByCollection", () => {
	it("preserves a valid record", () => {
		expect(normalizeCardByCollection({ character: "hero", lore: "table" })).toEqual({
			character: "hero",
			lore: "table",
		});
	});

	it("preserves an explicit empty record", () => {
		expect(normalizeCardByCollection({})).toEqual({});
	});

	it("falls back to {} for an array", () => {
		expect(normalizeCardByCollection(["hero"])).toEqual({});
	});

	it("falls back to {} for a record containing a non-string value", () => {
		expect(normalizeCardByCollection({ character: 1 })).toEqual({});
	});

	it("falls back to {} for null", () => {
		expect(normalizeCardByCollection(null)).toEqual({});
	});

	it("falls back to {} for undefined", () => {
		expect(normalizeCardByCollection(undefined)).toEqual({});
	});

	it("returns a fresh object, never the same reference as DEFAULT_SETTINGS.cardByCollection", () => {
		const valid = { character: "hero" };
		expect(normalizeCardByCollection(valid)).not.toBe(valid);
		expect(normalizeCardByCollection(valid)).not.toBe(DEFAULT_SETTINGS.cardByCollection);
		expect(normalizeCardByCollection(undefined)).not.toBe(DEFAULT_SETTINGS.cardByCollection);
	});

	it("mutating the returned object does not corrupt DEFAULT_SETTINGS.cardByCollection", () => {
		const result = normalizeCardByCollection(undefined);
		result["character"] = "corrupted";
		expect(DEFAULT_SETTINGS.cardByCollection).toEqual({});

		const resultFromValid = normalizeCardByCollection({ character: "hero" });
		resultFromValid["lore"] = "also corrupted";
		expect(DEFAULT_SETTINGS.cardByCollection).toEqual({});
	});
});

// ---------------------------------------------------------------------------
// normalizeSettings — the field is wired into the field-by-field build
// ---------------------------------------------------------------------------

describe("normalizeSettings — cardByCollection", () => {
	it("defaults to {} when the raw settings blob lacks the field entirely", () => {
		expect(normalizeSettings({}).cardByCollection).toEqual({});
		expect(normalizeSettings(null).cardByCollection).toEqual({});
	});

	it("keeps a valid stored record", () => {
		const result = normalizeSettings({ cardByCollection: { character: "hero", lore: "table" } });
		expect(result.cardByCollection).toEqual({ character: "hero", lore: "table" });
	});

	it("does not let a malformed stored value ride through unnormalized", () => {
		const result = normalizeSettings({ cardByCollection: { character: 1 } });
		expect(result.cardByCollection).toEqual({});
	});
});

// ---------------------------------------------------------------------------
// Value round-trip (save then load) — the "survives a reload" AC
// ---------------------------------------------------------------------------

describe("cardByCollection value round-trip (save then load)", () => {
	it("saving per-collection choices and reloading preserves every one of them", async () => {
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

		// Characters remembered as Hero, Lore remembered as Table — two distinct
		// collections, two distinct choices, in one persisted record.
		await saveSettings({
			...DEFAULT_SETTINGS,
			cardByCollection: { character: "hero", lore: "table" },
		});

		const result = await loadSettings();

		expect(result.cardByCollection).toEqual({ character: "hero", lore: "table" });
	});

	it("an empty saved record reloads as empty, not as the shipped default object reference", async () => {
		let storedData: unknown = {};

		async function saveSettings(settings: PluginSettings): Promise<void> {
			storedData = { settings };
		}
		async function loadSettings(): Promise<PluginSettings> {
			const raw = storedData as { settings?: unknown } | null | undefined;
			return normalizeSettings(raw?.settings ?? null);
		}

		await saveSettings({ ...DEFAULT_SETTINGS, cardByCollection: {} });
		const result = await loadSettings();

		expect(result.cardByCollection).toEqual({});
	});
});
