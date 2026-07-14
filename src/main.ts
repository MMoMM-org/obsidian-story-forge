import { Plugin } from "obsidian";
import { SettingsTab } from "settings/SettingsTab";
import { DEFAULT_SETTINGS, type PluginSettings } from "types/index";
import { ViewStore } from "store/ViewStore";
import type { PluginDataPort, StoryForgeData } from "store/types";
import { SidebarView, activateView } from "views/SidebarView";
import { SIDEBAR_VIEW_TYPE, ICON } from "pluginConstants";
import type { WorkspaceLeaf } from "obsidian";

export default class StoryForgePlugin extends Plugin {
	settings: PluginSettings = DEFAULT_SETTINGS;
	store!: ViewStore;

	async onload(): Promise<void> {
		// Build the single shared data port — both store and settings use it.
		const port: PluginDataPort = {
			load: () => this.loadData() as Promise<unknown>,
			save: (d: unknown) => this.saveData(d),
		};

		this.store = new ViewStore(port);

		await this.loadSettings();

		// Register the sidebar panel view type.
		this.registerView(
			SIDEBAR_VIEW_TYPE,
			(leaf: WorkspaceLeaf) => new SidebarView(leaf),
		);

		// Ribbon icon — open panel on click. "Story Forge" is a proper noun.
		// eslint-disable-next-line obsidianmd/ui/sentence-case
		this.addRibbonIcon(ICON, "Story Forge: open panel", () => {
			void activateView(this.app);
		});

		// Command palette entry.
		this.addCommand({
			id: "open-panel",
			name: "Open panel",
			callback: () => {
				void activateView(this.app);
			},
		});

		this.addSettingTab(new SettingsTab(this.app, this));
	}

	// Detach the sidebar leaf on unload so it doesn't persist a stale view
	// after the plugin is disabled. The linter warns against this pattern
	// (it resets the leaf position) but M1 spec requires it (T4.1-d).
	// eslint-disable-next-line obsidianmd/detach-leaves
	onunload(): void {
		this.app.workspace.detachLeavesOfType(SIDEBAR_VIEW_TYPE);
	}

	// ---------------------------------------------------------------------------
	// Settings — read-modify-write to preserve sibling `views` in data.json
	// ---------------------------------------------------------------------------

	async loadSettings(): Promise<void> {
		const raw = await this.loadData() as StoryForgeData | null | undefined;
		const stored = raw?.settings ?? null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, stored ?? {});
	}

	async saveSettings(): Promise<void> {
		// Read-modify-write: preserve the views key alongside settings.
		const raw = await this.loadData() as StoryForgeData | null | undefined;
		const data: StoryForgeData = raw && typeof raw === "object" && !Array.isArray(raw)
			? raw
			: {};
		data.settings = this.settings;
		await this.saveData(data);
	}
}
