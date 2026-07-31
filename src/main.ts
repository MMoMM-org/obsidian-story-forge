import { Plugin, Events, Notice, normalizePath, TFile } from "obsidian";
import { SettingsTab } from "settings/SettingsTab";
import { DEFAULT_SETTINGS, normalizeLinkClickAction, type PluginSettings } from "types/index";
import { ViewStore } from "store/ViewStore";
import type { PluginDataPort, StoryForgeData } from "store/types";
import { SidebarView, activateView } from "views/SidebarView";
import { SIDEBAR_VIEW_TYPE, ICON, WORKSPACE_VIEW_TYPE } from "pluginConstants";
import type { WorkspaceLeaf } from "obsidian";
import { EngineRegistry } from "engines/QueryEngine";
import { buildEngineRegistry, getDvSettings } from "engines/EngineRegistry";
import { ConsentGate } from "consent/ConsentGate";
import { NativeScopingEngine } from "engines/NativeScopingEngine";
import { ViewImporter } from "import/ViewImporter";
import type { RegisterCommandCallback } from "import/types";
import { registerCodexView, isBasesAvailable } from "bases/BasesAdapter";
import { CodexView, CODEX_VIEW_TYPE } from "codex/CodexView";
import { AnvilView, type AnvilLayout } from "anvil/AnvilView";
import { CatalogService } from "catalog/CatalogService";
import { BrowseOfficialModal } from "catalog/BrowseOfficialModal";
import type { CatalogIndex } from "catalog/catalogTypes";
import catalogIndexRaw from "../dist/catalog-index.json";

// The bundled catalog-index.json is built by `catalog:build` before esbuild
// reads this file. TypeScript infers `engine` as `string` from JSON; the cast
// is safe because build-catalog.mjs validates every entry's engine at build time.
const catalogIndex = catalogIndexRaw as unknown as CatalogIndex;

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
		const nativeEngine = new NativeScopingEngine(this.app);
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
			(leaf: WorkspaceLeaf) => new SidebarView(
				leaf,
				registry,
				gate,
				nativeEngine,
				this.store,
				() => this.settings.linkClickAction,
			),
		);

		// Register the thin CodexView host (T3.3, ADR-2 Option A).
		// This view is only ever activated for the S46 degrade path (Bases off).
		// When Bases is available, the open-codex command opens Codex.base directly.
		this.registerView(
			CODEX_VIEW_TYPE,
			(leaf: WorkspaceLeaf) => new CodexView(leaf),
		);

		// Register the main-area AnvilView (M5): Timeline rail + Plotlines list.
		this.registerView(
			WORKSPACE_VIEW_TYPE,
			(leaf: WorkspaceLeaf) => new AnvilView(leaf, {
				getLinkClickAction: () => this.settings.linkClickAction,
			}),
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

		// ADR-8: capture Bases availability ONCE at onload — before populateRegistry.
		// registerCodexView registers the "story-forge-codex" Bases view type and
		// caches the boolean (WeakMap<Plugin, boolean>). Do NOT call per-render or
		// inside populateRegistry (which runs twice — layout-ready + late-join).
		const basesAvailable = registerCodexView(this);

		// "Open Codex" command (T3.3): if Bases is on, open the seed Codex.base in
		// the main area; if Bases is off, activate the CodexView degrade leaf (S46).
		this.addCommand({
			id: "open-codex",
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- "Open Codex" is a proper noun + action
			name: "Open Codex",
			callback: () => {
				void this._openCodex();
			},
		});

		// M5: main-area Timeline / Plotlines views.
		this.addCommand({
			id: "open-timeline",
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- "Open Timeline" is a proper noun + action
			name: "Open Timeline",
			callback: () => {
				void this._openWorkspace("timeline");
			},
		});
		this.addCommand({
			id: "open-plotlines",
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- "Open Plotlines" is a proper noun + action
			name: "Open Plotlines",
			callback: () => {
				void this._openWorkspace("plotlines");
			},
		});

		// M6: interactive Kanban / Plotgrid views (same host).
		this.addCommand({
			id: "open-kanban",
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- "Open Kanban" is a proper noun + action
			name: "Open Kanban",
			callback: () => {
				void this._openWorkspace("kanban");
			},
		});
		this.addCommand({
			id: "open-plotgrid",
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- "Open Plotgrid" is a proper noun + action
			name: "Open Plotgrid",
			callback: () => {
				void this._openWorkspace("plotgrid");
			},
		});

		// T4.5: "Browse official views" command — opens the curated catalog modal.
		// CatalogService receives the bundled catalog-index.json (static import, no
		// fetch). The index is built by catalog:build before esbuild bundles main.ts.
		const catalogService = new CatalogService(catalogIndex, {
			app: this.app,
			gate,
			store: this.store,
			curatedBasesFolder: this._getCuratedBasesFolder(),
		});

		this.addCommand({
			id: "browse-official",
			name: "Browse official views",
			callback: () => {
				new BrowseOfficialModal(this.app, catalogService, this.store).open();
			},
		});

		// Populate registry from a freshly-built EngineRegistry.
		// buildEngineRegistry returns a new EngineRegistry; we extract the
		// three known engine kinds and pass them into the shared registry.replace().
		const populateRegistry = (): void => {
			const built = buildEngineRegistry(this.app, basesAvailable);
			registry.replace(
				(["dataview-dql", "dataviewjs", "bases"] as const)
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
	// Settings helpers
	// ---------------------------------------------------------------------------

	/**
	 * Return the configured curated bases folder, falling back to the default
	 * "00 Meta/Bases" when the value is absent or empty.
	 *
	 * A null/empty persisted value — e.g. from an older data.json — also falls
	 * back gracefully. No `as unknown` cast needed: curatedBasesFolder is a
	 * first-class field on PluginSettings (added in T4.4).
	 */
	_getCuratedBasesFolder(): string {
		const v = this.settings.curatedBasesFolder;
		return typeof v === "string" && v.length > 0 ? v : "00 Meta/Bases";
	}

	// ---------------------------------------------------------------------------
	// Codex navigation (T3.3)
	// ---------------------------------------------------------------------------

	/**
	 * Open the Codex.
	 *
	 * When Bases is available: resolve the seed Codex.base from the curated
	 * bases folder (default "00 Meta/Bases") and open it in a main-area leaf.
	 * When Bases is off: activate the CodexView degrade leaf (S46).
	 *
	 * The curated bases folder is read from settings (curatedBasesFolder,
	 * default "00 Meta/Bases" — added in T4.x; falls back to default here).
	 */
	async _openCodex(): Promise<void> {
		const basePath = normalizePath(`${this._getCuratedBasesFolder()}/Codex.base`);

		if (isBasesAvailable(this)) {
			const abstract = this.app.vault.getAbstractFileByPath(basePath);
			if (abstract instanceof TFile) {
				// getLeaf(true) opens in a new tab — avoids clobbering the user's active note.
				const leaf = this.app.workspace.getLeaf(true);
				await leaf.openFile(abstract);
				return;
			}
			// Codex.base not yet seeded — fall through to degrade
		}

		// Bases off (or Codex.base not yet seeded): reveal existing degrade leaf or create one.
		const existing = this.app.workspace.getLeavesOfType(CODEX_VIEW_TYPE);
		const existingLeaf = existing[0];
		if (existingLeaf) {
			await this.app.workspace.revealLeaf(existingLeaf);
			return;
		}
		// Open in a new tab — avoids clobbering the user's active note.
		const leaf = this.app.workspace.getLeaf(true);
		await leaf.setViewState({ type: CODEX_VIEW_TYPE, active: true });
		await this.app.workspace.revealLeaf(leaf);
	}

	/**
	 * Open the main-area AnvilView at the given layout (M5).
	 *
	 * Opens in a new tab (getLeaf(true)); the initial layout is passed via view
	 * state and also applied directly to the live view (setLayout) so it renders
	 * the requested layout without relying on state round-tripping.
	 */
	async _openWorkspace(layout: AnvilLayout): Promise<void> {
		const leaf = this.app.workspace.getLeaf(true);
		await leaf.setViewState({ type: WORKSPACE_VIEW_TYPE, active: true, state: { layout } });
		if (leaf.view instanceof AnvilView) leaf.view.setLayout(layout);
		await this.app.workspace.revealLeaf(leaf);
	}

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
		// Normalize: Object.assign propagates any persisted value as-is, so a
		// malformed linkClickAction (neither "drill" nor "open") must fall back.
		this.settings.linkClickAction = normalizeLinkClickAction(this.settings.linkClickAction);
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
