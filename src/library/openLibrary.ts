/**
 * openLibrary — open Settings on the Library tab, optionally with one collection's configure panel
 * expanded (spec 008 T7.1d2: `+ Collection`'s "Manage in settings…" and S98's "Change tag").
 *
 * Obsidian's `app.setting` is not in the public typings, so the one cast that reaches it lives here,
 * as it did in `main.ts`. Tab content and focus are `SettingsTab.openTab`'s: it is called last, so
 * the tab that Obsidian shows first is replaced by the Library one rather than the other way round.
 */
import type { App } from "obsidian";
import type { SettingsTab } from "settings/SettingsTab";

interface SettingsModal {
	setting?: { open?: () => void; openTabById?: (id: string) => void };
}

export function openLibrarySettings(
	app: App,
	pluginId: string,
	tab: Pick<SettingsTab, "openTab"> | null,
	opts: { configure?: string } = {},
): void {
	const { setting } = app as unknown as SettingsModal;
	setting?.open?.();
	setting?.openTabById?.(pluginId);
	if (tab) void tab.openTab("library", opts);
}
