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
import { apiVersion } from "obsidian";
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
import { basesCapability, type BasesCapability } from "bases/basesCapability";

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
 * The three Card view types are attempted ONLY when the "story-forge-codex"
 * registration itself succeeds — if the Bases runtime declines that one, it
 * has declined Bases entirely, and attempting the rest would be pointless.
 *
 * **Isolation, not shared fate (fixed after a review finding).** Once the
 * codex registration has succeeded it is genuinely live with the Bases
 * runtime — `registerBasesView` cannot be un-called. A LATER Card
 * registration throwing must not retroactively make this function (or the
 * cached `isBasesAvailable`) report `false`: that would be a lie about the
 * codex view, which really did register, and — because `main.ts` feeds this
 * same boolean into `buildEngineRegistry` and `_openCodex`'s degrade
 * decision — would disable the `bases` query engine plugin-wide and fall
 * back to the degrade `CodexView` leaf over a Card-only failure. So the Card
 * registrations run in their OWN try/catch, after `availabilityCache` is
 * already set from the codex outcome alone, and a failure there never
 * touches that cache. See `registerCardViews` for how each failure (a throw,
 * or a declined `false`) is handled instead of discarded.
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

	let available: boolean;
	try {
		available = call.call(plugin, CODEX_VIEW_ID, codexRegistration);
	} catch {
		available = false;
	}

	// The cache reflects the codex outcome ONLY — set it here, before the Card
	// registrations run, so nothing below this line can revise it.
	availabilityCache.set(plugin, available);

	if (available) {
		registerCardViews(plugin, call);
	}

	return available;
}

/**
 * Register the three per-Card view types, best-effort and isolated from one
 * another AND from the codex registration that already succeeded (see the
 * "Isolation, not shared fate" note on `registerCodexView`).
 *
 * Each registration gets its own try/catch: a throw registering
 * "story-forge-table" must not prevent the attempt at "story-forge-compact",
 * and must not be attributed to "story-forge-codex" or `isBasesAvailable`.
 *
 * A per-Card `false` (the Bases runtime declining that one view id — an id
 * collision, for instance) and a thrown error are both logged rather than
 * silently discarded, so a partial Card-registration failure is at least
 * observable even though there is no user-facing surface for it yet (T4.5
 * has none; a later task can promote this to a Notice if that turns out to
 * matter in practice).
 */
function registerCardViews(plugin: Plugin, call: RegisterBasesViewFn): void {
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

		try {
			const registered = call.call(plugin, spec.viewId, registration);
			if (!registered) {
				console.debug(`[StoryForge] Bases declined the "${spec.viewId}" Card view registration`);
			}
		} catch (err) {
			console.error(`[StoryForge] registering the "${spec.viewId}" Card view threw`, err);
		}
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

/**
 * ADR-36: the three-way capability `isBasesAvailable` alone cannot express —
 * "enabled" / "disabled" (present but off) / "absent" (too old to have it).
 * Combines the cached registration outcome above with the running Obsidian's
 * `apiVersion` (obsidian.d.ts:400) via the pure `basesCapability` (see
 * `bases/basesCapability.ts` for why `apiVersion`, not `app.plugins`).
 *
 * Read `apiVersion` at CALL time (not captured into a module-level constant) —
 * it is a live ES-module binding; capturing it once would freeze whatever
 * value happened to be current at import time.
 *
 * @returns "enabled" | "disabled" | "absent" for the Codex's Bases hint (T4.6)
 */
export function getBasesCapability(plugin: Plugin): BasesCapability {
	return basesCapability(apiVersion, isBasesAvailable(plugin));
}
