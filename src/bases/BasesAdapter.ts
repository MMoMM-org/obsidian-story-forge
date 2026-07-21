/**
 * BasesAdapter — the ONLY module that imports Bases typings.
 *
 * CON-3 firewall: All Bases typings and every Bases-runtime interaction
 * live in src/bases/ — exactly as src/engines/EngineRegistry.ts is the
 * sole home for the `app as any` Dataview casts.
 *
 * ADR-8: Feature-detection via the boolean returned by registerBasesView.
 * Re-read per call, never cached (mirrors getDataviewApi in EngineRegistry.ts).
 *
 * ADR-9: Single src/bases/ module is the API-churn firewall.
 *
 * @ref SDD/CON-3  — single Bases-typings firewall (src/bases/ only)
 * @ref SDD/ADR-8  — per-render feature detect via registerBasesView boolean
 * @ref SDD/ADR-9  — API-churn firewall: single module + smoke test
 */

import type { Plugin } from "obsidian";
import type { BasesViewRegistration } from "obsidian";

/** View ID for the one polymorphic Codex view type (ADR-2). */
const CODEX_VIEW_ID = "story-forge-codex";

/**
 * Shape of the registerBasesView method as it appears on Plugin
 * (obsidian.d.ts:5009, @since 1.10.0).
 *
 * We read this off the plugin instance via `as any` — sanctioned by CON-3
 * (this file is the sole Bases-typings firewall, mirroring the `app as any`
 * casts in EngineRegistry.ts).
 */
type RegisterBasesViewFn = (viewId: string, registration: BasesViewRegistration) => boolean;

/**
 * Probe whether Obsidian Bases is enabled in this vault.
 *
 * CON-3 sanctioned any-cast: this is the sole sanctioned Bases-typings
 * firewall (mirrors getDataviewApi in EngineRegistry.ts).
 *
 * Probes availability by calling registerBasesView with a no-op stub.
 * Per the obsidian.d.ts JSDoc: "@returns false if bases are not enabled
 * in this vault." Re-read on every call — never cached (ADR-8).
 *
 * @returns true when Bases is enabled; false when absent or disabled.
 */
export function isBasesAvailable(plugin: Plugin): boolean {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
	const registerFn: unknown = (plugin as any).registerBasesView;
	if (typeof registerFn !== "function") return false;

	// Probe by calling with a temporary no-op stub. The Bases runtime returns
	// false immediately if Bases is disabled, without side-effects on the vault.
	// Re-read on every call (ADR-8: no cached reference).
	return (registerFn as RegisterBasesViewFn).call(plugin, "__story-forge-probe__", {
		name: "probe",
		icon: "database",
		factory: (_controller, _containerEl) => {
			throw new Error("probe factory must never be called");
		},
	});
}

/**
 * Register the one polymorphic "story-forge-codex" Bases view type.
 *
 * Returns false when Bases is unavailable (mirrors isBasesAvailable).
 * The full polymorphic view class lands in Phase 3; this stub registers
 * the minimal required shape so the firewall is in place for downstream phases.
 *
 * TODO(Phase 3): Replace the minimal factory stub with the real CodexBasesView
 * factory and the full options callback when codex/CodexBasesView.ts is built.
 *
 * @param plugin - the Story Forge plugin instance
 * @returns true when registration succeeded (Bases enabled); false otherwise
 */
export function registerCodexView(plugin: Plugin): boolean {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
	const registerFn: unknown = (plugin as any).registerBasesView;
	if (typeof registerFn !== "function") return false;

	const registration: BasesViewRegistration = {
		name: "Story Forge Codex",
		icon: "library",
		// TODO(Phase 3): Replace stub with real CodexBasesView factory.
		factory: (_controller, _containerEl) => {
			throw new Error("CodexBasesView factory not yet implemented (Phase 3)");
		},
	};

	return (registerFn as RegisterBasesViewFn).call(plugin, CODEX_VIEW_ID, registration);
}
