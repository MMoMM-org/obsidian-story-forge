/**
 * wireLibrary — builds the one shared `CollectionStore` and connects it to the plugin
 * (spec 008 T7.1d1). Mirrors `wireUndoJournal`: built in `onload`, released through `register`.
 *
 * - One store, handed to the settings tab and reachable by every host factory.
 * - `migrate()` runs once, after the settings are loaded and before any view renders (D2, P13).
 * - A synchronous snapshot of the collection list, because the Codex hosts read their list while
 *   rendering. It is rebuilt after every Library write and every record write (an import), and
 *   `onChange` tells a host when to repaint.
 */
import type { Plugin } from "obsidian";
import type { ViewStore } from "store/ViewStore";
import type { PluginSettings } from "types/index";
import { CollectionStore, type LibraryCollection } from "./collectionStore";
import { createLibraryPort, type SettingsHost } from "./settingsPort";

export interface LibraryWiring {
	/** The one store. The settings tab, the Anvil and the Workbench all share it. */
	readonly collections: CollectionStore;
	/**
	 * Every collection as last read, in Library order. Never stale by more than one read.
	 * No production caller yet: T7.1d2 (Anvil pills) and T7.1d3 (Workbench) consume it.
	 */
	snapshot(): readonly LibraryCollection[];
	/** The built-ins only, with their own tag and excluded folders applied (what the Anvil shows today). */
	builtIns(): readonly LibraryCollection[];
	/** Fires after the snapshot has been rebuilt. Returns the unsubscribe function. */
	onChange(listener: () => void): () => void;
}

export interface LibraryHost extends Plugin, SettingsHost {
	settings: PluginSettings;
}

function warn(what: string): (err: unknown) => void {
	return (err) => { console.warn(`[StoryForge] Library: ${what}.`, err); };
}

/** Keeps the snapshot current. Only the newest successful read may land, so a slow older one cannot undo it. */
function createSnapshot(collections: CollectionStore) {
	let current: readonly LibraryCollection[] = [];
	let requested = 0;
	let applied = 0;
	const listeners = new Set<() => void>();
	const refresh = async (): Promise<void> => {
		const mine = ++requested;
		const next = await collections.collections();
		// A read that failed never gets here, so it cannot discard an older one that succeeded;
		// a read that succeeded may not overwrite a newer one that already landed.
		if (mine < applied) return;
		applied = mine;
		current = next;
		for (const listener of [...listeners]) {
			try {
				listener();
			} catch (e) {
				console.error("[StoryForge] library subscriber failed", e);
			}
		}
	};
	return {
		read: (): readonly LibraryCollection[] => current,
		refresh,
		onChange: (listener: () => void): (() => void) => {
			listeners.add(listener);
			return () => { listeners.delete(listener); };
		},
		clear: (): void => { listeners.clear(); },
	};
}

/**
 * Create the store, migrate, take the first snapshot and subscribe. Resolves once the first
 * snapshot is in, so a view built afterwards already has its collections.
 * Call after the settings are loaded: the port reads `plugin.settings`.
 */
export async function wireLibrary(plugin: LibraryHost, views: ViewStore): Promise<LibraryWiring> {
	const collections = new CollectionStore(createLibraryPort(views, plugin));
	await collections.migrate().catch(warn("the legacy views could not be migrated"));
	const snap = createSnapshot(collections);
	await snap.refresh().catch(warn("the collection list could not be read"));
	const rebuild = (): void => { snap.refresh().catch(warn("the collection list could not be refreshed")); };
	// Record writes the store did not make (an import) change the list too.
	const unsubscribe = [collections.subscribe(rebuild), views.subscribe(rebuild)];
	plugin.register(() => {
		for (const off of unsubscribe) off();
		snap.clear();
	});
	return {
		collections,
		snapshot: snap.read,
		builtIns: () => snap.read().filter((c) => c.provenance === "built-in"),
		onChange: snap.onChange,
	};
}
