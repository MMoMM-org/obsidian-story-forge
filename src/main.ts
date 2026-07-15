import { Plugin, Events } from "obsidian";
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

export default class StoryForgePlugin extends Plugin {
	settings: PluginSettings = DEFAULT_SETTINGS;
	store!: ViewStore;

	/** Tracks view-id → command-palette id for registered view commands. */
	readonly _commandIds: Map<string, string> = new Map();

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
			(leaf: WorkspaceLeaf) => new SidebarView(leaf, registry, gate, nativeEngine),
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
			registry,
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
	 */
	_registerViewCommand(viewId: string, commandName: string): void {
		const cmd = this.addCommand({
			id: `view-${viewId}`,
			name: commandName,
			callback: () => { void activateView(this.app); },
		});
		if (cmd) {
			this._commandIds.set(viewId, cmd.id);
		}
	}

	/**
	 * Remove the command palette entry for a view.
	 * Called when a view with a registered command is deleted from the store.
	 * No-op when no command was registered for this viewId.
	 */
	_removeViewCommand(viewId: string): void {
		const id = this._commandIds.get(viewId);
		if (id !== undefined) {
			// eslint-disable-next-line obsidianmd/no-unsupported-api -- removeCommand @since 1.7.2; used only for dynamically-registered view commands; CON-1 keeps minAppVersion at 1.5.7 per SDD
			this.removeCommand(id);
			this._commandIds.delete(viewId);
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
