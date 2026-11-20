import type MyPlugin from "main";
import { type App, PluginSettingTab, Setting, SettingGroup } from "obsidian";
import { attachFolderSuggest } from "./suggesters";
import {
	normalizeLinkClickAction,
	normalizeCardTitleOpensNote,
	normalizeExcludedFolders,
	normalizeFileClassesFolder,
	normalizeSchemaFolder,
	normalizeTemplatesFolder,
} from "types/index";

import { HeaderSection } from "./HeaderSection";
import { LibrarySection } from "./LibrarySection";
import { CardsSection } from "./CardsSection";
import type { FileClassSource } from "fileclass/fileClassVault";
import type { ViewStore } from "store/ViewStore";
import type { ConsentGate } from "consent/ConsentGate";
import type { ViewImporter } from "import/ViewImporter";
import { ImportPickerModal } from "import/ImportPickerModal";
import type { RegisterCommandCallback } from "import/types";
import type { OwnedUndoJournal } from "undo/undoJournal";
import { showHistoryCleared } from "undo/undoNotice";
import { CollectionStore } from "library/collectionStore";
import { createLibraryPort } from "library/settingsPort";
import { createNoteIndex } from "codex/noteIndex";
import type { IndexedNote } from "codex/collectionResolver";
import type { StoryFilesStatus } from "artifacts/storyFilesStatus";

/** Callback injected from main.ts to remove a view's command palette entry on deletion. */
export type RemoveCommandCallback = (viewId: string) => void;

/** The part of the undo journal the settings tab drives (spec 009, ADR-48). */
export type UndoHistoryControl = Pick<OwnedUndoJournal, "setPersistence" | "clear">;

/** The story files status and dialog (spec 010 T3.3), from `storyFilesWiring`. */
export interface StoryFilesTabDeps {
	/** The read-only status (S1b). */
	getStatus: () => Promise<StoryFilesStatus>;
	/** Open the setup dialog; `onClose` runs once it has closed. */
	open: (onClose?: () => void) => void;
	/** The Library hint's "Don't show again" (S7). */
	isHintDismissed: () => boolean;
	dismissHint: () => void;
}

/** What the Library tab reads beyond the view store. Each member defaults to the plugin's own. */
export interface LibraryDeps {
	collections?: CollectionStore;
	/** The vault's notes with their tags, for the live count in `configure` (P10). */
	notes?: () => readonly IndexedNote[];
	/** The plugin's FileClass cache, so a Card preview draws its tile as the Anvil does. */
	fileClasses?: FileClassSource;
	/** The "What Story Forge can use…" link: opens the capability screen (T7.4). */
	openCapabilities?: () => void;
	/** "+ Browse repo…" (T7.2): opens the catalog. Absent, the button stays disabled. */
	browseRepo?: () => void;
	/** The Scope tab's Story files row and the Library hint (spec 010). Absent, the button stays disabled. */
	storyFiles?: StoryFilesTabDeps;
}

/** L1: the three tabs, in order. */
export const SETTINGS_TABS = [
	{ id: "library", label: "Library" },
	{ id: "scope", label: "Scope" },
	{ id: "behaviour", label: "Behaviour" },
] as const;

export type SettingsTabId = (typeof SETTINGS_TABS)[number]["id"];

export class SettingsTab extends PluginSettingTab {
	plugin: MyPlugin;
	private readonly header: HeaderSection;
	private readonly store: ViewStore;
	private readonly undo: UndoHistoryControl;
	private readonly library: LibrarySection;
	private readonly cards: CardsSection;
	private readonly openCapabilities: () => void;
	private readonly storyFiles: StoryFilesTabDeps | undefined;
	/** The Scope tab's status line and the Library hint's slot, from the last draw. */
	private storyStatusEl: HTMLElement | null = null;
	private storyHintSlot: HTMLElement | null = null;
	/** Status read generation: a stale read's result is dropped. */
	private storyGen = 0;
	/** Store unsubscribe handle — set when tab is open, null when hidden. */
	private _unsubscribeStore: (() => void) | null = null;
	private readonly collections: CollectionStore;
	/** The selected tab survives a repaint; Library is the default (L1). */
	private active: SettingsTabId = "library";

	constructor(
		app: App,
		plugin: MyPlugin,
		store: ViewStore,
		gate: ConsentGate,
		importer: ViewImporter,
		registerCommand: RegisterCommandCallback,
		removeCommand: RemoveCommandCallback,
		undo: UndoHistoryControl,
		library: LibraryDeps = {},
	) {
		super(app, plugin);
		this.plugin = plugin;
		this.header = new HeaderSection({ plugin });
		this.store = store;
		this.undo = undo;
		this.openCapabilities = library.openCapabilities ?? (() => {});
		this.storyFiles = library.storyFiles;
		const collections = library.collections ?? new CollectionStore(createLibraryPort(store, plugin));
		this.collections = collections;
		const notes = library.notes ?? this.defaultNotes();
		const importFromVault = (): void => { new ImportPickerModal(app, importer, gate).open(); };
		this.cards = new CardsSection({
			app, collections, notes, importFromVault,
			...(library.fileClasses ? { fileClasses: library.fileClasses } : {}),
		});
		this.library = new LibrarySection({
			app,
			collections,
			views: store,
			gate,
			notes,
			scopeFolders: () => normalizeExcludedFolders(this.plugin.settings.excludedFolders),
			registerCommand,
			removeCommand,
			importFromVault,
			// T7.4 S5: a Dataview row's cause links to the same capability screen as the footer.
			openCapabilities: () => this.openCapabilities(),
			...(library.browseRepo ? { browseRepo: library.browseRepo } : {}),
		});
	}

	display(): void {
		void this.displayAsync();
	}

	hide(): void {
		this._unsubscribeStore?.();
		this._unsubscribeStore = null;
		this.library.suspend();
		this.cards.suspend();
	}

	/**
	 * Repaint both lists when the Library changes. The collection store signals after every write
	 * of its own (built-in settings included); the view store signals for records written behind
	 * its back (an import). A store write also moves a record, so that second signal is dropped
	 * while the write runs: the write's own signal follows it, and reads the finished state.
	 */
	private subscribeToChanges(): () => void {
		const repaint = (): void => { void this.library.refresh(); void this.cards.refresh(); };
		const offs = [
			this.collections.subscribe(repaint),
			this.store.subscribe(() => {
				if (this.collections.writing) this.collections.noteDroppedSignal();
				else repaint();
			}),
		];
		return () => { for (const off of offs) off(); };
	}

	/**
	 * Open a tab, optionally with one collection's configure panel expanded and its tag field
	 * focused (the S98 "Change tag" deep link, P10).
	 */
	async openTab(tab: SettingsTabId, opts: { configure?: string } = {}): Promise<void> {
		this.active = tab;
		if (opts.configure) this.library.expand(opts.configure);
		await this.displayAsync();
	}

	/**
	 * Async render entrypoint — awaitable in tests, called fire-and-forget by the synchronous
	 * display() that Obsidian's PluginSettingTab contract requires. Everything but the
	 * collection list is painted synchronously; the list guards its own re-entrancy.
	 */
	async displayAsync(): Promise<void> {
		// Live-refresh the Library list when a record changes. Subscribe once per open session.
		this._unsubscribeStore ??= this.subscribeToChanges();
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass("sf-settings");
		this.header.render(containerEl.createDiv({ cls: "sf-settings-header" }));

		const panels = this.renderStrip(containerEl);
		this.renderBehaviourSection(panels.behaviour);
		this._renderScopeSection(panels.scope);
		const libraryDrawn = this.renderLibraryTab(panels.library);
		this.refreshStoryFiles();
		await libraryDrawn;
	}

	// ---------------------------------------------------------------------------
	// L1 — the tab strip
	// ---------------------------------------------------------------------------

	private renderStrip(root: HTMLElement): Record<SettingsTabId, HTMLElement> {
		const strip = root.createDiv({ cls: "sf-tabs", attr: { role: "tablist", "aria-label": "Settings sections" } });
		const tabs = new Map<SettingsTabId, HTMLElement>();
		const makePanel = (id: SettingsTabId, label: string): HTMLElement => {
			tabs.set(id, strip.createEl("button", {
				cls: "sf-tab",
				text: label,
				attr: { type: "button", role: "tab", id: `sf-tab-${id}`, "aria-controls": `sf-tabpanel-${id}` },
			}));
			return root.createDiv({
				cls: "sf-tabpanel",
				attr: { role: "tabpanel", id: `sf-tabpanel-${id}`, "aria-labelledby": `sf-tab-${id}`, "data-tab": id },
			});
		};
		const panels: Record<SettingsTabId, HTMLElement> = {
			library: makePanel("library", "Library"),
			scope: makePanel("scope", "Scope"),
			behaviour: makePanel("behaviour", "Behaviour"),
		};
		const select = (id: SettingsTabId, focus: boolean): void => {
			this.active = id;
			this.applySelection(tabs, panels);
			if (focus) tabs.get(id)?.focus();
			// Scope may have changed since the list was painted: its counts follow.
			if (id === "library") { void this.library.refresh(); void this.cards.refresh(); }
		};
		for (const [id, tab] of tabs) {
			tab.addEventListener("click", () => select(id, false));
			tab.addEventListener("keydown", (e) => {
				const next = this.neighbour(id, e.key);
				if (next === null) return;
				e.preventDefault();
				select(next, true);
			});
		}
		this.applySelection(tabs, panels);
		return panels;
	}

	/** Paint the selection: aria-selected, the roving tabindex and which panel is visible. */
	private applySelection(tabs: Map<SettingsTabId, HTMLElement>, panels: Record<SettingsTabId, HTMLElement>): void {
		for (const [key, tab] of tabs) {
			tab.setAttribute("aria-selected", String(key === this.active));
			tab.setAttribute("tabindex", key === this.active ? "0" : "-1");
			panels[key].hidden = key !== this.active;
		}
	}

	/** Arrow keys, Home and End move between tabs (roving tabindex). */
	private neighbour(from: SettingsTabId, key: string): SettingsTabId | null {
		const ids = SETTINGS_TABS.map((t) => t.id);
		const i = ids.indexOf(from);
		if (key === "ArrowRight") return ids[(i + 1) % ids.length] ?? null;
		if (key === "ArrowLeft") return ids[(i + ids.length - 1) % ids.length] ?? null;
		if (key === "Home") return ids[0] ?? null;
		if (key === "End") return ids[ids.length - 1] ?? null;
		return null;
	}

	// ---------------------------------------------------------------------------
	// Library tab (L2, P14)
	// ---------------------------------------------------------------------------

	private async renderLibraryTab(panel: HTMLElement): Promise<void> {
		// S7a: filled once the status is known, and only while nothing is set up.
		this.storyHintSlot = panel.createDiv({ cls: "sf-story-nudge-slot" });
		new Setting(panel)
			.setName("Collections")
			.setDesc("What the Codex can show. Each is a query over your vault. Choose where each one appears.")
			.setHeading();
		const list = panel.createDiv({ cls: "sf-lb-list" });
		const slot = panel.createDiv({ cls: "sf-lb-cards-slot", attr: { "data-slot": "cards" } });
		new Setting(slot).setName("Cards").setDesc("How entries are drawn. Chosen per collection and remembered.").setHeading();
		const cardList = slot.createDiv({ cls: "sf-lb-list" });
		this.renderCuratedFolder(panel);
		const foot = panel.createDiv({ cls: "sf-lb-foot" });
		const link = foot.createEl("button", { cls: "sf-lb-link", text: "What Story Forge can use…", attr: { type: "button" } });
		link.addEventListener("click", () => this.openCapabilities());
		await Promise.all([this.library.render(list), this.cards.render(cardList)]);
	}

	private renderCuratedFolder(panel: HTMLElement): void {
		new SettingGroup(panel).setHeading("Collections from the repo").addSetting((setting) => {
			setting
				.setName("Folder for collections from the repo")
				.setDesc("Where Browse repo… places the .base files and Dataview notes it installs. Default: 00 Meta/Bases")
				.addText((text) =>
					text
						.setPlaceholder("00 Meta/Bases")
						.setValue(this.plugin.settings.curatedBasesFolder)
						.onChange(async (value) => {
							// Fall back to the default when the field is cleared.
							this.plugin.settings.curatedBasesFolder = value.trim().length > 0 ? value.trim() : "00 Meta/Bases";
							await this.plugin.saveSettings();
						}),
				);
		});
	}

	/** One index for the tab's lifetime, built on first use; its events are released with the plugin. */
	private defaultNotes(): () => readonly IndexedNote[] {
		let index: ReturnType<typeof createNoteIndex> | null = null;
		return () => {
			index ??= createNoteIndex(this.app, (ref) => { this.plugin.registerEvent(ref); });
			return index.notes();
		};
	}

	// ---------------------------------------------------------------------------
	// Behaviour tab (L1b) — what clicks do, and the undo history (spec 009, U11)
	// ---------------------------------------------------------------------------

	private renderBehaviourSection(containerEl: HTMLElement): void {
		this.renderLinksGroup(containerEl);
		this._renderUndoSection(containerEl);
	}

	private renderLinksGroup(containerEl: HTMLElement): void {
		new SettingGroup(containerEl).setHeading("Links and cards")
			.addSetting((setting) => {
				setting
					.setName("Link click action")
					.setDesc("What happens when you click a link to another entity. Modifier-click (ctrl/cmd) inverts this choice.")
					.addDropdown((d) =>
						d
							.addOption("drill", "Inspect the linked note (show it in place)")
							.addOption("open", "Open in editor")
							.setValue(this.plugin.settings.linkClickAction)
							.onChange(async (value: string) => {
								this.plugin.settings.linkClickAction = normalizeLinkClickAction(value);
								await this.plugin.saveSettings();
							}),
					);
			})
			.addSetting((setting) => {
				setting
					.setName("Open note from card title")
					.setDesc(
						"Clicking a card's title opens the note in a new tab. When off, it shows the note in the editor pane. " +
							"Modifier-click (ctrl/cmd) inverts this choice.",
					)
					.addToggle((t) =>
						t.setValue(this.plugin.settings.cardTitleOpensNote).onChange(async (value) => {
							this.plugin.settings.cardTitleOpensNote = normalizeCardTitleOpensNote(value);
							await this.plugin.saveSettings();
						}),
					);
			});
	}

	private _renderUndoSection(containerEl: HTMLElement): void {
		new SettingGroup(containerEl).setHeading("Undo history")
			.addSetting((setting) => {
				setting
					.setName("Keep undo history across restarts")
					.setDesc(
						"Stores the undo history in the plugin folder so you can still undo after restarting Obsidian. " +
							"It holds copies of field values from your notes and is meant to stay on this device; Obsidian Sync is not expected to transfer it, but this is not verified. Turning this off deletes the stored history.",
					)
					.addToggle((t) =>
						t.setValue(this.plugin.settings.keepUndoHistory).onChange(async (value) => {
							this.plugin.settings.keepUndoHistory = value;
							await this.plugin.saveSettings();
							await this.undo.setPersistence(value);
						}),
					);
			})
			.addSetting((setting) => {
				setting
					.setName("Clear undo history")
					.setDesc("Empties undo and redo and deletes the stored history. Your notes are not changed.")
					.addButton((b) =>
						b.setButtonText("Clear").onClick(() => {
							this.undo.clear().then(showHistoryCleared, (err: unknown) => {
								console.warn("[StoryForge] Undo journal: couldn't clear the history.", err);
							});
						}),
					);
			});
	}

	// ---------------------------------------------------------------------------
	// Scope tab (L1a) — which notes feed every collection
	// (T3.5, PRD F3 AC; a collection's own tag and folders live in Library › configure, P10.)
	// ---------------------------------------------------------------------------

	private _renderScopeSection(containerEl: HTMLElement): void {
		new SettingGroup(containerEl).setHeading("Vault folders")
			.addSetting((setting) => {
				setting
					.setName("FileClasses folder")
					.setDesc(
						"Vault folder containing your FileClass definitions (fc-*.md). Default: 00 Meta/FileClasses " +
							"Set up story files… writes Story Forge's FileClasses here.",
					)
					.addText((text) => {
						text
							.setPlaceholder("00 Meta/FileClasses")
							.setValue(normalizeFileClassesFolder(this.plugin.settings.fileClassesFolder))
							.onChange(async (value) => {
								// Fall back to the default when the field is cleared or malformed.
								this.plugin.settings.fileClassesFolder = normalizeFileClassesFolder(value.trim());
								await this.plugin.saveSettings();
							});
						attachFolderSuggest(this.app, text.inputEl, { list: false });
					});
			})
			.addSetting((setting) => {
				setting
					.setName("Excluded folders")
					.setDesc(
						"Comma-separated vault folders left out of every collection and scope view. Default: 00 Meta. " +
							"A collection can use its own list instead (Library › configure).",
					)
					.addText((text) => {
						text
							.setPlaceholder("00 Meta")
							.setValue(normalizeExcludedFolders(this.plugin.settings.excludedFolders).join(", "))
							.onChange(async (value) => {
								// An emptied field is a deliberate "exclude nothing" — NOT a
								// fall back to the default (CON-7: exclusion only, and clearing
								// the list is a legitimate user choice, not malformed input).
								const parsed = value
									.split(",")
									.map((s) => s.trim())
									.filter((s) => s.length > 0);
								// Through the store, so built-ins that follow Scope, the live counts and
								// the Anvil all hear about it (one change signal).
								await this.collections.setScope(normalizeExcludedFolders(parsed));
							});
						attachFolderSuggest(this.app, text.inputEl, { list: true });
					});
			});
		this._renderStoryFilesGroup(containerEl);
	}

	// ---------------------------------------------------------------------------
	// Story files (spec 010 S1a, S7a) — the folders, the setup row and the Library hint.
	// Drawing writes nothing: the status is read-only, a folder change saves a setting only.
	// ---------------------------------------------------------------------------

	private _renderStoryFilesGroup(containerEl: HTMLElement): void {
		const folder = (
			setting: Setting,
			name: string,
			desc: string,
			fallback: string,
			key: "templatesFolder" | "schemaFolder",
			normalize: (v: unknown) => string,
		): void => {
			setting
				.setName(name)
				.setDesc(desc)
				.addText((text) => {
					text
						.setPlaceholder(fallback)
						.setValue(normalize(this.plugin.settings[key]))
						.onChange(async (value) => {
							// Fall back to the default when the field is cleared or malformed. No file is written.
							this.plugin.settings[key] = normalize(value.trim());
							await this.plugin.saveSettings();
						});
					attachFolderSuggest(this.app, text.inputEl, { list: false });
				});
		};
		new SettingGroup(containerEl).setHeading("Story files")
			.addSetting((setting) => {
				folder(
					setting,
					"Templates folder",
					"Where Set up story files… places the entity and scene templates. Point Obsidian's core Templates " +
						"plugin at the same folder to use them. Default: 00 Meta/Templates",
					"00 Meta/Templates",
					"templatesFolder",
					normalizeTemplatesFolder,
				);
			})
			.addSetting((setting) => {
				folder(
					setting,
					"Schema reference folder",
					"Where Set up story files… places the notes that explain each story Property and its values. " +
						"Default: 00 Meta/Schema",
					"00 Meta/Schema",
					"schemaFolder",
					normalizeSchemaFolder,
				);
			})
			.addSetting((setting) => {
				setting.setName("Set up story files");
				// The status line is the row's description, a polite live region (S1a note).
				setting.descEl.empty();
				this.storyStatusEl = setting.descEl.createDiv({
					cls: "sf-story-status",
					attr: { role: "status", "aria-live": "polite" },
				});
				setting.addButton((button) => {
					button.setButtonText("Set up story files…");
					if (this.storyFiles) button.onClick(() => this.openStoryFiles());
					else button.setDisabled(true);
				});
			});
	}

	/** Open the dialog; once it closes, read the status again and redraw the line and the hint. */
	private openStoryFiles(): void {
		this.storyFiles?.open(() => this.refreshStoryFiles());
	}

	/** One read-only status read, shared by the Scope line and the Library hint. */
	private refreshStoryFiles(): void {
		const statusEl = this.storyStatusEl;
		const slot = this.storyHintSlot;
		const gen = ++this.storyGen;
		if (!this.storyFiles) {
			if (statusEl) statusEl.textContent = "Could not check story files";
			return;
		}
		if (statusEl) {
			statusEl.textContent = "Checking story files…";
			delete statusEl.dataset["kind"];
		}
		// While checking, the hint draws nothing (S7a): no stale hint from the last read.
		slot?.empty();
		const deps = this.storyFiles;
		deps.getStatus().then(
			(s) => {
				if (gen !== this.storyGen) return;
				if (statusEl) {
					statusEl.textContent = s.line;
					statusEl.dataset["kind"] = s.kind;
				}
				if (slot) this.renderStoryHint(slot, s);
			},
			(err: unknown) => {
				console.debug("[StoryForge] story files: could not check", err);
				if (gen !== this.storyGen) return;
				if (statusEl) statusEl.textContent = "Could not check story files";
				slot?.empty();
			},
		);
	}

	/** S7a: the hint shows only while nothing is set up and it is not dismissed. */
	private renderStoryHint(slot: HTMLElement, status: StoryFilesStatus): void {
		slot.empty();
		const deps = this.storyFiles;
		if (!deps || status.kind !== "none" || deps.isHintDismissed()) return;
		const hint = slot.createDiv({ cls: "sf-story-nudge", attr: { role: "status" } });
		const text = hint.createSpan({ cls: "sf-story-nudge-text" });
		text.createEl("b", { text: "Story files are not set up." });
		text.appendText(
			" Without them the editor shows no sections or option lists, and there are no templates for new scenes and entities.",
		);
		const actions = hint.createDiv({ cls: "sf-story-nudge-actions" });
		const open = actions.createEl("button", { text: "Set up story files…", attr: { type: "button" } });
		open.addEventListener("click", () => this.openStoryFiles());
		const dismiss = actions.createEl("button", { cls: "sf-lb-link", text: "Don't show again", attr: { type: "button" } });
		dismiss.addEventListener("click", () => {
			deps.dismissHint();
			slot.empty();
		});
	}
}
