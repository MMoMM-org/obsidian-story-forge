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
import { CardBasesView } from "bases/CardBasesView";
import { revealAndShowFile } from "views/SidebarView";
import {
	CODEX_VIEW_ID,
	CODEX_HERO_VIEW_ID,
	CODEX_TABLE_VIEW_ID,
	CODEX_COMPACT_VIEW_ID,
} from "pluginConstants";
import { CODEX_CARD_REGISTRY } from "codex/builtinCards";

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
 * One row of the Card-view registration table (T4.5): a Bases view id, its
 * display name in Obsidian's view-type picker, and the Card id it draws with.
 * `CardBasesView` resolves that Card id against `CODEX_CARD_REGISTRY` at DRAW
 * time, not here — see `CardBasesView`'s module doc for why capturing a
 * `CardRenderer` in this table would be wrong.
 */
interface CardViewSpec {
	readonly viewId: string;
	readonly name: string;
	readonly cardId: string;
}

const CARD_VIEW_SPECS: readonly CardViewSpec[] = [
	{ viewId: CODEX_HERO_VIEW_ID, name: "Story Forge Hero", cardId: "hero" },
	{ viewId: CODEX_TABLE_VIEW_ID, name: "Story Forge Table", cardId: "table" },
	{ viewId: CODEX_COMPACT_VIEW_ID, name: "Story Forge Compact", cardId: "compact" },
];

/** Open the file at `path` in the Workbench sidebar. Shared by every factory below. */
function onEntryOpen(plugin: Plugin, path: string): void {
	const file = plugin.app.vault.getFileByPath(path);
	if (file) {
		void revealAndShowFile(plugin.app, file);
	}
}

/**
 * Register the polymorphic "story-forge-codex" grid view AND the three
 * per-Card view types — "story-forge-hero" / "-table" / "-compact" (T4.5) —
 * so a Card is selectable directly inside a user's own `.base` file, not only
 * inside the Anvil's Codex tab.
 *
 * Call once from plugin onload(). Calls registerBasesView for each view type
 * EXACTLY ONCE, caches the "story-forge-codex" result as the overall
 * availability boolean (WeakMap keyed by plugin instance), and returns it.
 * Idempotent: subsequent calls return the cached value without calling
 * registerBasesView again.
 *
 * The three Card view types are registered ONLY when the "story-forge-codex"
 * registration itself succeeds — if the Bases runtime declines that one, it
 * has declined Bases entirely, and registering the rest would be silently
 * broken as well as untestable as a single "Bases is on/off" signal.
 *
 * Returns false when Bases is unavailable (method absent or returns false).
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
	const call = registerFn as RegisterBasesViewFn;

	const codexRegistration: BasesViewRegistration = {
		name: "Story Forge Codex",
		icon: "library",
		factory: (controller, containerEl) => new CodexBasesView(controller, containerEl, {
			app: plugin.app,
			onRowClick: (path: string): void => onEntryOpen(plugin, path),
		}),
	};

	try {
		const available = call.call(plugin, CODEX_VIEW_ID, codexRegistration);

		if (available) {
			for (const spec of CARD_VIEW_SPECS) {
				const registration: BasesViewRegistration = {
					name: spec.name,
					icon: "gallery-vertical",
					factory: (controller, containerEl) => new CardBasesView(spec.viewId, controller, containerEl, {
						app: plugin.app,
						registry: CODEX_CARD_REGISTRY,
						cardId: spec.cardId,
						onEntryClick: (path: string): void => onEntryOpen(plugin, path),
					}),
				};
				call.call(plugin, spec.viewId, registration);
			}
		}

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
