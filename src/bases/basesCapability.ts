/**
 * basesCapability — ADR-36: tells "Bases absent" apart from "Bases present but
 * disabled" so the Codex can hint at the latter (once, dismissibly) and stay
 * silent for the former.
 *
 * `isBasesAvailable()` (`BasesAdapter.ts`) reads `false` for BOTH states — it
 * only knows whether `registerBasesView` succeeded, not why it didn't. Bases is
 * a CORE plugin (ships with Obsidian; ADR-36's own rationale is "enabled, not
 * installed"), so its PRESENCE is a function of the running Obsidian version,
 * never of anything a user installed. That is the missing axis this module
 * adds, via the public `apiVersion` export (obsidian.d.ts:400) — never
 * `app.plugins` / `app.internalPlugins` (neither is public API; reaching for
 * them means an `as unknown as` cast on `app`, the exact pattern that has
 * already hidden a real crash in this repo).
 *
 * Pure and App-free by design: every combination is testable without a mocked
 * Plugin/App (see `test/bases/basesCapability.test.ts`).
 *
 * @ref SDD/ADR-36 — core may be suggested once; community never
 * @ref docs/XDD/specs/008-codex-surface/plan/phase-4.md — T4.6 resolution
 */

export type BasesCapability = "enabled" | "disabled" | "absent";

/**
 * The Obsidian version in which Bases became core. Sourced, not guessed:
 * `obsidian.d.ts` documents `registerBasesView` as `@since 1.10.0`, and spec
 * 005's SDD independently records Bases as "core plugin, GA ~1.9.10". 1.10.0
 * is the release that ships the API this plugin actually calls, and this
 * plugin's own `manifest.json` sets `minAppVersion: 1.12.7` — safely above it,
 * which is why the "absent" branch is unreachable in supported configurations
 * (implemented honestly anyway, so ADR-36 holds as written, not by accident).
 */
export const BASES_CORE_MIN_VERSION = "1.10.0";

/** Parse "1.10.0" into [1, 10, 0]. Missing or non-numeric components read as 0. */
function versionComponents(v: string): readonly [number, number, number] {
	const parts = v.split(".");
	const component = (i: number): number => {
		const parsed = Number.parseInt(parts[i] ?? "", 10);
		return Number.isFinite(parsed) ? parsed : 0;
	};
	return [component(0), component(1), component(2)];
}

/**
 * True when `version` is component-wise >= `min` (major, then minor, then
 * patch, each compared numerically). A plain string compare gets this wrong —
 * `"1.9.0" > "1.10.0"` lexicographically, because `"9" > "1"`.
 */
export function isVersionAtLeast(version: string, min: string): boolean {
	const [vMajor, vMinor, vPatch] = versionComponents(version);
	const [mMajor, mMinor, mPatch] = versionComponents(min);
	if (vMajor !== mMajor) return vMajor > mMajor;
	if (vMinor !== mMinor) return vMinor > mMinor;
	return vPatch >= mPatch;
}

/**
 * Derive Bases' capability from the running Obsidian version and the cached
 * registration outcome (`isBasesAvailable`, `BasesAdapter.ts`).
 *
 * - version below `BASES_CORE_MIN_VERSION` → `"absent"`: Bases does not exist
 *   on this Obsidian yet. Silence (ADR-36) — not a broken install.
 * - version at/above it, registration failed → `"disabled"`: Bases shipped but
 *   the user has it off. The one dismissible hint (ADR-36) targets this case.
 * - version at/above it, registration succeeded → `"enabled"`: nothing to say.
 */
export function basesCapability(currentApiVersion: string, registrationSucceeded: boolean): BasesCapability {
	if (!isVersionAtLeast(currentApiVersion, BASES_CORE_MIN_VERSION)) return "absent";
	return registrationSucceeded ? "enabled" : "disabled";
}
