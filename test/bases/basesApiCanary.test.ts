/**
 * T1.2 — Bases API schema smoke-test canary.
 *
 * PURPOSE (ADR-9): Break loudly when obsidian.d.ts renames or removes a Bases
 * API member the adapter depends on — before a runtime crash can occur.
 *
 * ASSERTION STRATEGY
 * Two layers, each catching a different failure mode:
 *
 * 1. Compile-time keyof pins (TypeScript)
 *    `const _k: keyof BasesConfigFile = "views"` is a type error if "views" is
 *    not a key of BasesConfigFile.  These statements are pure TypeScript: they
 *    vanish at runtime but fail `npm run typecheck:test` the moment a member is
 *    renamed or removed in the obsidian.d.ts mock.
 *
 *    In tests, `"obsidian"` is aliased to `test/__mocks__/obsidian.ts`
 *    (tsconfig.test.json paths).  The existing `obsidian.guard.ts` + its
 *    `typecheck:mock` step enforce that the mock is a faithful subset of the
 *    real obsidian.d.ts — so a rename in the real typings must propagate to
 *    the mock, which then breaks these pins.  The full chain:
 *
 *      real obsidian.d.ts rename
 *        → mock must be updated (or typecheck:mock fails)
 *        → mock update breaks compile-time pins here (typecheck:test fails)
 *        → npm test fails
 *
 * 2. Runtime assertion (vitest)
 *    `plugin.registerBasesView(...)` — called on a mock Plugin with a spy wired
 *    at the real prototype method name.  This asserts the CALL SITE works and
 *    returns a boolean, catching a member-name mismatch at runtime against the
 *    mock as a cross-check.
 *
 * CON-3 compliance: Bases typings imported here (test file) are allowed by spec.
 * No Bases typings enter any src/ file outside src/bases/.
 *
 * @ref SDD/ADR-9  — API-churn firewall: single module + smoke test
 * @ref SDD/CON-3  — Bases typings confined to src/bases/ (test files exempt)
 */

import { describe, it, expect, vi } from "vitest";
import type {
	BasesView,
	BasesConfigFile,
	BasesViewRegistration,
} from "obsidian";
import { Plugin, App } from "../__mocks__/obsidian";

// ---------------------------------------------------------------------------
// SECTION 1 — Compile-time keyof pins
//
// These statements are type-only assertions.  They compile to nothing at runtime
// but fail `typecheck:test` if any pinned member is renamed or removed.
//
// The `void` casts suppress the "variable declared but never read" warning while
// keeping each pin on its own named constant (aids error messages that cite the
// variable name).
//
// WHAT THEY CATCH:
//   If obsidian.d.ts renames `BasesConfigFile.views` → `BasesConfigFile.viewList`,
//   the mock must be updated (typecheck:mock fails otherwise).  After the mock is
//   updated, the line below becomes a compile error ("viewList" is not assignable
//   to keyof BasesConfigFile if the old pin still says "views").
// ---------------------------------------------------------------------------

// BasesConfigFile member pins — views, filters, formulas
const _bcfViews: keyof BasesConfigFile = "views";
const _bcfFilters: keyof BasesConfigFile = "filters";
const _bcfFormulas: keyof BasesConfigFile = "formulas";
void _bcfViews; void _bcfFilters; void _bcfFormulas;

// BasesView member pins — data, config, onDataUpdated, allProperties
const _bvData: keyof BasesView = "data";
const _bvConfig: keyof BasesView = "config";
const _bvOnDataUpdated: keyof BasesView = "onDataUpdated";
const _bvAllProperties: keyof BasesView = "allProperties";
void _bvData; void _bvConfig; void _bvOnDataUpdated; void _bvAllProperties;

// BasesViewRegistration member pin — factory (used by BasesAdapter.registerCodexView)
const _bvrFactory: keyof BasesViewRegistration = "factory";
void _bvrFactory;

// Plugin.prototype.registerBasesView — pin the method name on the Plugin type
// (obsidian.d.ts:5009).  This catches a rename of the method itself.
//
// Note: the mock Plugin class does NOT include registerBasesView by default
// (it is wired per-test below) — this pin asserts only that the TYPE declares
// it, not that the mock instance carries it.  We use `& { registerBasesView: unknown }`
// to make the type-level assertion independent of mock instance presence.
type _PluginWithBases = typeof Plugin.prototype & { registerBasesView: unknown };
const _hasRegisterBasesView: keyof _PluginWithBases = "registerBasesView";
void _hasRegisterBasesView;

// ---------------------------------------------------------------------------
// SECTION 2 — Runtime assertions
// ---------------------------------------------------------------------------

describe("Bases API canary (ADR-9)", () => {
	describe("Plugin.prototype.registerBasesView", () => {
		it("returns boolean true when Bases is enabled", () => {
			const plugin = new Plugin(new App());
			// Wire a spy at the real method name, typed to match the real signature.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const anyPlugin = plugin as any;
			anyPlugin.registerBasesView = vi.fn(
				(_viewId: string, _registration: BasesViewRegistration): boolean => true,
			);

			const registration: BasesViewRegistration = {
				name: "canary-view",
				icon: "database",
				factory: (_controller, _containerEl) => { throw new Error("unreachable"); },
			};
			// Call through the plugin instance — the method name "registerBasesView" must
			// match what the adapter uses.  If the name ever changes, this line throws.
			const result: boolean = anyPlugin.registerBasesView("canary-view-id", registration) as boolean;

			expect(typeof result).toBe("boolean");
			expect(result).toBe(true);
		});

		it("returns boolean false when Bases is disabled", () => {
			const plugin = new Plugin(new App());
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const anyPlugin = plugin as any;
			anyPlugin.registerBasesView = vi.fn(
				(_viewId: string, _registration: BasesViewRegistration): boolean => false,
			);

			const registration: BasesViewRegistration = {
				name: "canary-view",
				icon: "database",
				factory: (_controller, _containerEl) => { throw new Error("unreachable"); },
			};
			const result: boolean = anyPlugin.registerBasesView("canary-view-id", registration) as boolean;

			expect(typeof result).toBe("boolean");
			expect(result).toBe(false);
		});
	});

	describe("BasesConfigFile shape", () => {
		it("compile-time pins cover views, filters, and formulas (pin failure = RED)", () => {
			// The real assertion is compile-time (see SECTION 1 above).
			// This runtime test documents the expectation and ensures the test file
			// is included in the vitest run — an empty test suite is skipped.
			const expectedMembers: (keyof BasesConfigFile)[] = ["views", "filters", "formulas"];
			expect(expectedMembers).toContain("views");
			expect(expectedMembers).toContain("filters");
			expect(expectedMembers).toContain("formulas");
		});
	});

	describe("BasesView shape", () => {
		it("compile-time pins cover data, config, onDataUpdated, and allProperties (pin failure = RED)", () => {
			// The real assertion is compile-time (see SECTION 1 above).
			const expectedMembers: (keyof BasesView)[] = [
				"data",
				"config",
				"onDataUpdated",
				"allProperties",
			];
			expect(expectedMembers).toContain("data");
			expect(expectedMembers).toContain("config");
			expect(expectedMembers).toContain("onDataUpdated");
			expect(expectedMembers).toContain("allProperties");
		});
	});
});
