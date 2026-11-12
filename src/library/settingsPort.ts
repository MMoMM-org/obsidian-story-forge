/**
 * settingsPort — the plugin-side adapter for `LibraryPort` (spec 008 T7.1b).
 *
 * Records go through `ViewStore`; everything else is the plugin's in-memory settings, which
 * `PluginSettings` consumers (the tab's other rows, the Anvil) already read. A patch is merged
 * into that same object and persisted through the plugin's own `saveSettings`, so there is one
 * copy of the settings and one write path.
 */

import type { ViewStore } from "store/ViewStore";
import { normalizeSettings, type PluginSettings } from "types/index";
import type { LibraryPort } from "./collectionStore";

/** The slice of the plugin the adapter needs. */
export interface SettingsHost {
	settings: PluginSettings;
	saveSettings(): Promise<void>;
}

export function createLibraryPort(views: ViewStore, host: SettingsHost): LibraryPort {
	return {
		getViews: () => views.getViews(),
		setRecord: (id, record) => views.setRecord(id, record),
		deleteRecord: (id) => views.deleteRecord(id),
		// Normalised on every read, so a stale or partial settings object cannot reach the store.
		loadSettings: async () => normalizeSettings(host.settings),
		saveSettings: async (patch) => {
			Object.assign(host.settings, patch);
			await host.saveSettings();
		},
	};
}
