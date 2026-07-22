/**
 * BasesAdapter — the ONLY module that imports Bases typings.
 *
 * CON-3 firewall: All Bases typings and every Bases-runtime interaction
 * live in src/bases/ — exactly as src/engines/EngineRegistry.ts is the
 * sole home for the `app as any` Dataview casts.
 *
 * ADR-8 (revised): Feature-detection caches the boolean returned by
 * registerBasesView at plugin onload time (WeakMap<Plugin, boolean>).
 * isBasesAvailable() reads from the cache — it has NO side effects.
 *
 * ADR-9: Single src/bases/ module is the API-churn firewall.
 *
 * @ref SDD/CON-3  — single Bases-typings firewall (src/bases/ only)
 * @ref SDD/ADR-8  — cache-at-onload feature detect via registerBasesView
 * @ref SDD/ADR-9  — API-churn firewall: single module + smoke test
 */

import type { Plugin } from "obsidian";
import type { BasesViewRegistration } from "obsidian";
import { CodexBasesView } from "bases/CodexBasesView";
import { revealAndShowFile } from "views/SidebarView";

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
 * WeakMap cache: plugin instance → Bases availability boolean.
 *
 * Keyed by plugin instance (GC-friendly, test-isolatable). Populated by
 * registerCodexView() on first call; isBasesAvailable() reads from it.
 *
 * Using WeakMap (not a module-level boolean) prevents cross-instance or
 * cross-test state leakage.
 */
const availabilityCache = new WeakMap<object, boolean>();

/**
 * Register the one polymorphic "story-forge-codex" Bases view type.
 *
 * Call once from plugin onload(). Calls registerBasesView EXACTLY ONCE,
 * caches the boolean result (WeakMap keyed by plugin instance), and returns
 * it. Idempotent: subsequent calls return the cached value without calling
 * registerBasesView again.
 *
 * Returns false when Bases is unavailable (method absent or returns false).
 * The factory constructs a CodexBasesView wired with onRowClick →
 * revealAndShowFile(plugin.app, file) (T3.3 — row click re-subjects sidebar).
 *
 * @param plugin - the Story Forge plugin instance
 * @returns true when registration succeeded (Bases enabled); false otherwise
 */
export function registerCodexView(plugin: Plugin): boolean {
	if (availabilityCache.has(plugin)) {
		return availabilityCache.get(plugin)!;
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
	const registerFn: unknown = (plugin as any).registerBasesView;
	if (typeof registerFn !== "function") {
		availabilityCache.set(plugin, false);
		return false;
	}

	const registration: BasesViewRegistration = {
		name: "Story Forge Codex",
		icon: "library",
		factory: (controller, containerEl) => new CodexBasesView(controller, containerEl, {
			app: plugin.app,
			onRowClick: (path: string): void => {
				const file = plugin.app.vault.getFileByPath(path);
				if (file) {
					void revealAndShowFile(plugin.app, file);
				}
			},
		}),
	};

	try {
		const available = (registerFn as RegisterBasesViewFn).call(plugin, CODEX_VIEW_ID, registration);
		availabilityCache.set(plugin, available);
		return available;
	} catch {
		availabilityCache.set(plugin, false);
		return false;
	}
}

/**
 * Return the cached Bases availability boolean for this plugin instance.
 *
 * Returns the value stored by registerCodexView(). Returns false if
 * registerCodexView has not run yet (default). Has NO side effects —
 * never calls registerBasesView.
 *
 * CON-3 sanctioned any-cast confined to registerCodexView above; this
 * function reads only from the WeakMap cache.
 *
 * @returns true when Bases is enabled; false when absent, disabled, or
 *          registerCodexView has not yet been called.
 */
export function isBasesAvailable(plugin: Plugin): boolean {
	return availabilityCache.get(plugin) ?? false;
}
