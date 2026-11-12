import { Plugin, Events, Notice } from "obsidian";
import { SettingsTab } from "settings/SettingsTab";
import { DEFAULT_SETTINGS, normalizeSettings, type PluginSettings } from "types/index";
import { ViewStore } from "store/ViewStore";
import type { PluginDataPort, StoryForgeData } from "store/types";
import { SidebarView, activateView } from "views/SidebarView";
import { SIDEBAR_VIEW_TYPE, ICON, WORKSPACE_VIEW_TYPE } from "pluginConstants";
import type { WorkspaceLeaf } from "obsidian";
import { EngineRegistry } from "engines/QueryEngine";
import { buildEngineRegistry, createEngineFor, getDvSettings } from "engines/EngineRegistry";
import { ConsentGate } from "consent/ConsentGate";
import { NativeScopingEngine } from "engines/NativeScopingEngine";
import { createFileClassCache } from "fileclass/fileClassVault";
import { ViewImporter } from "import/ViewImporter";
import type { RegisterCommandCallback } from "import/types";
import { registerCodexView, getBasesCapability, isBasesAvailable } from "bases/BasesAdapter";
import { AnvilView, type AnvilLayout } from "anvil/AnvilView";
import { CatalogService } from "catalog/CatalogService";
import { BrowseOfficialModal } from "catalog/BrowseOfficialModal";
import type { CollectionParams } from "library/baseGenerator";
import type { CatalogIndex } from "catalog/catalogTypes";
import { wireUndoJournal } from "undo/wireUndoJournal";
import { wireLibrary, type LibraryWiring } from "library/wireLibrary";
import { openLibrarySettings } from "library/openLibrary";
import { buildAnvilCodexOpts } from "anvil/anvilCodexOpts";
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
	/** The one shared Library: collection store, change signal and a synchronous snapshot (T7.1d1). */
	library!: LibraryWiring;

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

		// The Library (T7.1d1): one CollectionStore for the settings tab and both hosts.
		// `migrate()` runs here, once, after the data is loaded and before any view renders.
		this.library = await wireLibrary(this, this.store);

		// The one FileClass cache (T6.4): every consumer below reads through it, so
		// a scan is shared and a FileClass change reaches all of them at once.
		const fileClasses = createFileClassCache(
			this.app,
			() => this.settings.fileClassesFolder,
			(ref) => { this.registerEvent(ref); },
		);
		// A change still pending must not reach a view that unload has already torn down.
		this.register(() => { fileClasses.dispose(); });

		// The undo journal (spec 009, ADR-43): created once, loaded before the settings tab
		// exists, released on unload. The Workbench and the Anvil receive it below. Mod+Z acts
		// only while one of them is the active view (ADR-37).
		const journal = await wireUndoJournal(this, () =>
			this.app.workspace.getActiveViewOfType(AnvilView)
			?? this.app.workspace.getActiveViewOfType(SidebarView));

		// Construct the shared engine infrastructure injected into SidebarView
		// and SettingsTab. Registry starts empty; populated in onLayoutReady and
		// the late-join dataview:api-ready handler (SDD Flow A).
		const nativeEngine = new NativeScopingEngine(this.app, fileClasses);
		const registry = new EngineRegistry([]);

		// DvSettingsReader: wraps getDvSettings (CON-8 any-cast isolated to
		// src/engines/EngineRegistry.ts). Re-read on every call — no cache.
		const dvSettings = {
			isDvJsEnabled: (): boolean => getDvSettings(this.app).enableDataviewJs,
		};

		// PLACEHOLDER (T3.4, hoisted up from its former T3.3 construction site
		// below CatalogService): `excludedFolders` now exists on PluginSettings
		// (T3.5), but this placeholder is DELIBERATELY left as-is rather than
		// swapped for a settings-backed value. Reasons: (1) no collection record
		// can exist yet — catalog/ ships zero entries, so there is nothing to
		// reconcile against; (2) `collectionParams` must stay ONE shared value
		// between this construction site and CatalogService's (below) — reading
		// install-time and classify-time params from different sources would
		// desync and produce a spurious `regenerate` the moment they diverge.
		// T7.3 (real template wiring) is where a real collection first exists,
		// so it is the right place to wire this for real. Until then every
		// generated collection is recorded/compared against an empty tag and an
		// empty exclusion list. Shared by ConsentGate's getCurrentParams seam
		// (below) and CatalogService's collectionParams dep (see the HAZARD
		// note at its construction site).
		//
		// HAZARD (see CatalogService.ts class docstring): when T7.3 swaps this
		// placeholder for real settings-backed values, it must also reconcile
		// `generated.params` on already-installed records — otherwise
		// classify() flips every unedited curated file to "regenerate" and
		// its curated content is replaced by `renderBase` output.
		const collectionParams: CollectionParams = { tag: "", excludedFolders: [] };

		// PLACEHOLDER (T3.4): no real template producer is wired yet (T7.3) — a
		// generated collection's upstream checksum cannot be looked up, so
		// this always reports "unknown" (null). ConsentGate treats that as
		// "cannot tell, do not nag" rather than manufacturing drift; the
		// classify() `reconsent` branch stays inert until T7.3 wires a real
		// lookup.
		const getCurrentSourceChecksum = async (): Promise<string | null> => null;

		const gate = new ConsentGate(
			this.app,
			registry,
			dvSettings,
			this.store,
			getCurrentSourceChecksum,
			() => collectionParams,
		);
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
				() => this.settings.excludedFolders,
				fileClasses,
				journal,
				this.library,
			),
		);

		// The settings tab is built last (it needs everything above); the Anvil's "Manage in settings…"
		// and "Change tag" deep-link into it, and only ever run after onload has finished.
		let settingsTab: SettingsTab | null = null;

		// Register the main-area AnvilView (M5): Timeline rail + Plotlines list.
		this.registerView(
			WORKSPACE_VIEW_TYPE,
			(leaf: WorkspaceLeaf) => {
				// T5.1 discharges the 2026-07-31 "inspect is inert" decision: the
				// seam is fed here, at the construction site, so the Anvil's
				// inspect is visible in the wiring rather than only in a default.
				// It resolves to THIS view's editor pane — no other leaf is
				// opened, revealed or re-targeted (PRD/F2).
				const view: AnvilView = new AnvilView(leaf, {
					drill: (file) => { view.inspect(file); },
					undo: journal,
					settings: {
						getLinkClickAction: () => this.settings.linkClickAction,
						getCardTitleOpensNote: () => this.settings.cardTitleOpensNote,
						getExcludedFolders: () => this.settings.excludedFolders,
					},
					editor: {
						// ADR-33: the dock is a persisted setting, changed only by the
						// pane's own dock tool — never by a resize.
						getDock: () => this.settings.editorDock,
						// T5.3, T6.4: where the pane gets the field declarations it renders.
						fileClasses,
						onDockChange: (dock) => {
							// Operational state (CON-2) — never written to a note's frontmatter.
							this.settings = { ...this.settings, editorDock: dock };
							void this.saveSettings();
						},
					},
					codex: buildAnvilCodexOpts({
						library: this.library,
						getRecord: async (id) => (await this.store.getViews())[id],
						gate,
						// The Anvil draws with engines of its own; the shared ones belong to the Workbench.
						createEngine: (kind) => createEngineFor(this.app, kind, isBasesAvailable(this)),
						getCardByCollection: () => this.settings.cardByCollection,
						onCardSelect: (collectionId, cardId) => {
							// Operational state (CON-2) — never written to a note's frontmatter.
							this.settings = {
								...this.settings,
								cardByCollection: { ...this.settings.cardByCollection, [collectionId]: cardId },
							};
							void this.saveSettings();
						},
						openLibrary: (opts) => { openLibrarySettings(this.app, this.manifest.id, settingsTab, opts); },
					}),
					bases: {
						// T4.6, ADR-36. Reads the cached registration outcome
						// (registerCodexView, called below) + apiVersion — safe to call before
						// that line runs textually because this is a getter, invoked only when
						// the Codex actually renders, by which point onload has completed.
						getCapability: () => getBasesCapability(this),
						getDismissedHints: () => this.settings.dismissedHints,
						onDismissHint: (hintId) => {
							// Idempotent: a hint already dismissed is not appended again.
							// Operational state (CON-2) — never written to a note's frontmatter.
							if (this.settings.dismissedHints.includes(hintId)) return;
							this.settings = {
								...this.settings,
								dismissedHints: [...this.settings.dismissedHints, hintId],
							};
							void this.saveSettings();
						},
					},
				});
				return view;
			},
		);

		// Ribbon icon — open the Workbench on click. "Workbench" is a registered
		// brand (eslint.config.mts); "Story Forge" is the plugin's own name and
		// isn't (T2.6) — the disable below is still needed for that half.
		// eslint-disable-next-line obsidianmd/ui/sentence-case -- "Story Forge" is a proper noun
		this.addRibbonIcon(ICON, "Story Forge: open Workbench", () => {
			void activateView(this.app);
		});

		// Command palette entry. id stays "open-panel" (CON-4 analog — renaming
		// a command id would orphan a user's saved hotkey); only the display
		// name changes (T2.6).
		this.addCommand({
			id: "open-panel",
			name: "Open Workbench",
			callback: () => {
				void activateView(this.app);
			},
		});

		// ADR-8: capture Bases availability ONCE at onload — before populateRegistry.
		// registerCodexView registers the "story-forge-codex" Bases view type and
		// caches the boolean (WeakMap<Plugin, boolean>). Do NOT call per-render or
		// inside populateRegistry (which runs twice — layout-ready + late-join).
		//
		// getLinkClickAction is a LIVE getter, not a snapshot — mirrors the same
		// closure passed to SidebarView/AnvilView below, so a Card rendered inside
		// a user's own `.base` honours a Settings change immediately, exactly like
		// those two hosts (ADR-28 parity — see BasesAdapter.ts's doc comment).
		const basesAvailable = registerCodexView(
			this,
			() => this.settings.linkClickAction,
			fileClasses,
		);

		// T2.3 (spec 008, PRD F1): the single entry point into the Anvil, opened with
		// the Codex tab selected. Reveals the existing leaf rather than creating a
		// second one — see _openWorkspace.
		this.addCommand({
			id: "open-anvil",
			name: "Open Anvil",
			callback: () => {
				void this._openWorkspace("codex");
			},
		});

		// M5: main-area Timeline / Plotlines views.
		// T2.3: these ids are kept registered as REDIRECTS into the Anvil so a user's
		// existing hotkey binding survives (SDD Risks — hotkeys). Do not remove them.
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
		// `collectionParams` is the T3.4-hoisted placeholder declared above (shared
		// with ConsentGate's getCurrentParams seam) — see the HAZARD note there.
		const catalogService = new CatalogService(catalogIndex, {
			app: this.app,
			gate,
			store: this.store,
			curatedBasesFolder: this._getCuratedBasesFolder(),
			collectionParams,
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

		settingsTab = new SettingsTab(
			this.app,
			this,
			this.store,
			gate,
			importer,
			registerCommand,
			this._removeViewCommand.bind(this),
			journal,
			// T7.4 supplies the capabilities screen; until then "What optional plugins add…" is inert.
			{ fileClasses, collections: this.library.collections, openCapabilities: () => {} },
		);
		this.addSettingTab(settingsTab);
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

	/**
	 * Open the main-area AnvilView at the given layout, selecting that layout's tab.
	 *
	 * T2.3 (spec 008): there is only ever one Anvil leaf. If one is already open, it
	 * is revealed and switched to the requested tab rather than opening a second leaf
	 * — this is what makes `open-anvil` and the four legacy `open-*` ids (M5/M6) true
	 * redirects into the same view instead of each spawning its own tab.
	 *
	 * When creating a new leaf (getLeaf(true), a new tab — avoids clobbering the
	 * user's active note), the initial layout is passed via view state AND applied
	 * directly to the live view (setLayout), so it renders the requested layout
	 * without relying on state round-tripping.
	 */
	async _openWorkspace(layout: AnvilLayout): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(WORKSPACE_VIEW_TYPE)[0];
		if (existing) {
			await this.app.workspace.revealLeaf(existing);
			// A leaf of WORKSPACE_VIEW_TYPE can exist with `.view` not yet a live
			// AnvilView (e.g. mid-restore during workspace deserialization). Reveal it
			// but deliberately do not retarget the tab in that case — silent, not an
			// error, and pinned by the "not yet a live AnvilView" test below.
			if (existing.view instanceof AnvilView) existing.view.setLayout(layout);
			return;
		}
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
		// normalizeSettings builds this.settings field-by-field from only the keys
		// PluginSettings declares — a stray persisted key (e.g. a removed field like
		// the pre-Phase-3 exampleSetting, G17) cannot ride along (see types/index.ts).
		this.settings = normalizeSettings(raw?.settings ?? null);
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
