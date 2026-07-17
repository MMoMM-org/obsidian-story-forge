import { Plugin, Events, Notice } from "obsidian";
import { SettingsTab } from "settings/SettingsTab";
import { DEFAULT_SETTINGS, type PluginSettings } from "types/index";
import { ViewStore } from "store/ViewStore";
import type { PluginDataPort, StoryForgeData } from "store/types";
import { SidebarView, activateView } from "views/SidebarView";
import { SIDEBAR_VIEW_TYPE, ICON } from "pluginConstants";
import type { WorkspaceLeaf } from "obsidian";
import { EngineRegistry } from "engines/QueryEngine";
import { buildEngineRegistry, getDvSettings } from "engines/EngineRegistry";
import { ConsentGate } from "consent/ConsentGate";
import { NativeScopingEngine } from "engines/NativeScopingEngine";
import { ViewImporter } from "import/ViewImporter";
import type { RegisterCommandCallback } from "import/types";

/** Last path segment of a source path, with a trailing `.md` stripped. */
function basenameNoMd(source: string): string {
	const last = source.split("/").pop() ?? source;
	return last.replace(/\.md$/, "");
}

export default class StoryForgePlugin extends Plugin {
	settings: PluginSettings = DEFAULT_SETTINGS;
	store!: ViewStore;

	/** Tracks which view-ids have a registered command-palette entry. */
	readonly _commandIds: Set<string> = new Set();

	async onload(): Promise<void> {
		// Build the single shared data port — both store and settings use it.
		const port: PluginDataPort = {
			load: () => this.loadData() as Promise<unknown>,
			save: (d: unknown) => this.saveData(d),
		};

		this.store = new ViewStore(port);

		await this.loadSettings();

		// Construct the shared engine infrastructure injected into SidebarView
		// and SettingsTab. Registry starts empty; populated in onLayoutReady and
		// the late-join dataview:api-ready handler (SDD Flow A).
		const nativeEngine = new NativeScopingEngine();
		const registry = new EngineRegistry([]);

		// DvSettingsReader: wraps getDvSettings (CON-8 any-cast isolated to
		// src/engines/EngineRegistry.ts). Re-read on every call — no cache.
		const dvSettings = {
			isDvJsEnabled: (): boolean => getDvSettings(this.app).enableDataviewJs,
		};

		const gate = new ConsentGate(this.app, registry, dvSettings, this.store);
		const importer = new ViewImporter(this.app, this.store);

		// registerCommand + removeCommand callbacks passed to SettingsTab/BindModal.
		const registerCommand: RegisterCommandCallback = this._registerViewCommand.bind(this);

		// Register the sidebar panel view type — inject all M2 deps via closure.
		this.registerView(
			SIDEBAR_VIEW_TYPE,
			(leaf: WorkspaceLeaf) => new SidebarView(leaf, registry, gate, nativeEngine, this.store),
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

		// Populate registry from a freshly-built EngineRegistry.
		// buildEngineRegistry returns a new EngineRegistry; we extract the
		// two known engine kinds and pass them into the shared registry.replace().
		const populateRegistry = (): void => {
			const built = buildEngineRegistry(this.app);
			registry.replace(
				(["dataview-dql", "dataviewjs"] as const)
					.map((k) => built.get(k))
					.filter((e): e is NonNullable<typeof e> => e !== undefined),
			);
		};

		// Populate registry after layout-ready (Dataview may not be initialised yet).
		this.app.workspace.onLayoutReady(() => {
			populateRegistry();

			// Rebuild command-palette entries the user had turned on — Obsidian
			// drops dynamically-added commands on reload. Fire-and-forget.
			void this._restoreViewCommands();

			// Late-join listener: fires if Dataview loads AFTER onLayoutReady.
			// "dataview:api-ready" is a Dataview-emitted custom event not typed in
			// @types/obsidian; cast to Events (the base class) to reach the generic
			// on(name: string, ...) overload. Registered via registerEvent so it is
			// auto-cleaned on unload (ADR-2, CON-2).
			this.registerEvent(
				(this.app.metadataCache as unknown as Events).on("dataview:api-ready", () => {
					populateRegistry();
				}),
			);
		});

		this.addSettingTab(new SettingsTab(
			this.app,
			this,
			this.store,
			gate,
			importer,
			registerCommand,
			this._removeViewCommand.bind(this),
		));
	}

	// No onunload override: Obsidian releases registered views and the
	// Component base auto-cleans every listener wired via register*/registerEvent.
	// Detaching leaves here would reset the user's panel layout (obsidianmd
	// guidance), so we deliberately do NOT do it.

	// ---------------------------------------------------------------------------
	// View command management
	// ---------------------------------------------------------------------------

	/**
	 * Register a command palette entry for a view.
	 * Public for test access; aliased as the registerCommand callback passed to SettingsTab.
	 *
	 * Bug D1 fix: after activating the panel, locate the live SidebarView and
	 * call selectView(viewId) so the correct tab is selected.
	 */
	_registerViewCommand(viewId: string, name: string): void {
		const cmd = this.addCommand({
			id: `view-${viewId}`,
			name,
			callback: () => {
				void (async () => {
					// Stale-command fail-safe: a command whose view was removed since
					// registration must not silently activate the panel. Re-check the
					// store and inform the user instead.
					const views = await this.store.getViews();
					if (!views[viewId]) {
						// "Story Forge" is a proper noun (matches the ribbon label).
						// eslint-disable-next-line obsidianmd/ui/sentence-case
						new Notice("This Story Forge view no longer exists.");
						return;
					}
					await activateView(this.app);
					const leaves = this.app.workspace.getLeavesOfType(SIDEBAR_VIEW_TYPE);
					const leaf = leaves[0];
					if (leaf?.view instanceof SidebarView) {
						await leaf.view.selectView(viewId);
					}
				})();
			},
		});
		// Track the viewId's presence. removeCommand reconstructs the FULL
		// prefixed id (`${manifest.id}:view-${viewId}`) deterministically, so the
		// stored value is never read — a presence Set suffices. Do NOT trust the
		// object addCommand returns (bug c).
		if (cmd) {
			this._commandIds.add(viewId);
		}
	}

	/**
	 * Remove the command palette entry for a view.
	 * Called when a view with a registered command is deleted from the store.
	 * No-op when no command was registered for this viewId.
	 */
	_removeViewCommand(viewId: string): void {
		if (this._commandIds.has(viewId)) {
			// removeCommand AUTO-PREFIXES the id with the plugin id (exactly like
			// addCommand), so pass the LOCAL id `view-${viewId}`. Passing the
			// already-prefixed `${manifest.id}:view-${viewId}` double-prefixes and
			// silently removes nothing (verified live — bug c / uncheck-doesn't-remove).
			// eslint-disable-next-line obsidianmd/no-unsupported-api -- removeCommand @since 1.7.2; used only for dynamically-registered view commands; CON-1 keeps minAppVersion at 1.5.7 per SDD
			this.removeCommand(`view-${viewId}`);
			this._commandIds.delete(viewId);
		}
	}

	/**
	 * Re-create command-palette entries for every view the user had turned on.
	 * Obsidian drops dynamically-added commands on reload, so this runs at
	 * layout-ready to rebuild them with their STABLE ids (so user hotkeys survive).
	 * Falls back to the source's basename when no commandName was chosen.
	 */
	async _restoreViewCommands(): Promise<void> {
		const views = await this.store.getViews();
		for (const [id, rec] of Object.entries(views)) {
			if (rec.command === true) {
				const name = rec.commandLabel ?? rec.commandName ?? basenameNoMd(rec.source);
				this._registerViewCommand(id, name);
			}
		}
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
