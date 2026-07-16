import type MyPlugin from "main";
import { type App, PluginSettingTab, Setting } from "obsidian";

import { HeaderSection } from "./HeaderSection";
import type { ViewStore } from "store/ViewStore";
import type { ViewRecord } from "store/types";
import { EngineRegistry } from "engines/QueryEngine";
import type { ConsentGate } from "consent/ConsentGate";
import type { ViewImporter } from "import/ViewImporter";
import { ImportPickerModal } from "import/ImportPickerModal";
import type { RegisterCommandCallback } from "import/types";

/** Callback injected from main.ts to remove a view's command palette entry on deletion. */
export type RemoveCommandCallback = (viewId: string) => void;

export class SettingsTab extends PluginSettingTab {
	plugin: MyPlugin;
	private readonly header: HeaderSection;
	private readonly store: ViewStore;
	private readonly registry: EngineRegistry;
	private readonly gate: ConsentGate;
	private readonly importer: ViewImporter;
	private readonly registerCommand: RegisterCommandCallback;
	private readonly removeCommand: RemoveCommandCallback;
	/** Store unsubscribe handle — set when tab is open, null when hidden. */
	private _unsubscribeStore: (() => void) | null = null;

	constructor(
		app: App,
		plugin: MyPlugin,
		store: ViewStore,
		registry: EngineRegistry,
		gate: ConsentGate,
		importer: ViewImporter,
		registerCommand: RegisterCommandCallback,
		removeCommand: RemoveCommandCallback,
	) {
		super(app, plugin);
		this.plugin = plugin;
		this.header = new HeaderSection({ plugin });
		this.store = store;
		this.registry = registry;
		this.gate = gate;
		this.importer = importer;
		this.registerCommand = registerCommand;
		this.removeCommand = removeCommand;
	}

	display(): void {
		void this.displayAsync();
	}

	hide(): void {
		this._unsubscribeStore?.();
		this._unsubscribeStore = null;
	}

	/**
	 * Async render entrypoint — awaitable in tests, called fire-and-forget by
	 * the synchronous display() that Obsidian's PluginSettingTab contract requires.
	 *
	 * Subscribe to store on first call (guard against double-subscribe on re-renders
	 * triggered by actions like Disable/Remove which call displayAsync() directly).
	 */
	async displayAsync(): Promise<void> {
		// Subscribe to store changes to live-refresh the Views list.
		// Guard: only subscribe once per open session; hide() clears the handle.
		if (!this._unsubscribeStore) {
			this._unsubscribeStore = this.store.subscribe(() => {
				void this.displayAsync();
			});
		}
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass("sf-settings");

		const headerEl = containerEl.createDiv({ cls: "sf-settings-header" });
		this.header.render(headerEl);

		new Setting(containerEl)
			.setName("Example setting")
			.setDesc("A placeholder setting to demonstrate the pattern.")
			.addText((text) =>
				text
					.setPlaceholder("Enter a value")
					.setValue(this.plugin.settings.exampleSetting)
					.onChange(async (value) => {
						this.plugin.settings.exampleSetting = value;
						await this.plugin.saveSettings();
					}),
			);

		await this._renderViewsSection();
	}

	// ---------------------------------------------------------------------------
	// Views section
	// ---------------------------------------------------------------------------

	private async _renderViewsSection(): Promise<void> {
		const { containerEl } = this;

		new Setting(containerEl)
			.setName("Views")
			.setHeading();

		// Import button at the top of the section
		new Setting(containerEl)
			.setName("Import a view from your vault")
			.setDesc("Add an sf-view:true note from your vault to the view list.")
			.addButton((btn) =>
				btn
					.setButtonText("Import view")
					.onClick(() => {
						new ImportPickerModal(
							this.app,
							this.importer,
							this.store,
							this.registerCommand,
						).open();
					}),
			);

		const views = await this.store.getViews();
		const entries = Object.entries(views);

		if (entries.length === 0) {
			new Setting(containerEl)
				// eslint-disable-next-line obsidianmd/ui/sentence-case -- 'Import view' refers to the button name above
				.setName("No views imported yet. Use 'Import view' to add a view.")
				.setDesc("");
			return;
		}

		for (const [id, record] of entries) {
			this._renderViewRow(containerEl, id, record);
		}
	}

	/**
	 * Render a single view row. State is determined at render time:
	 *   S26 — registry.get(engine) === undefined → engine missing
	 *   S24 — enabled:true → Disable action
	 *   S25 — enabled:false → Enable action (routes through consentGate.requestConsent)
	 */
	private _renderViewRow(
		containerEl: HTMLElement,
		id: string,
		record: ViewRecord,
	): void {
		const engineMissing = this.registry.get(record.engine) === undefined;
		const displayName = record.commandName ?? record.source;

		if (engineMissing) {
			// S26 — Engine missing
			new Setting(containerEl)
				.setName(displayName)
				.setDesc(`Engine ${record.engine} is missing or not installed — install Dataview to use this view.`)
				.addButton((btn) => {
					btn.setButtonText("Remove").onClick(() => this._removeView(id));
					btn.buttonEl.classList.add("mod-warning");
				});
			return;
		}

		if (record.enabled) {
			// S24 — Enabled
			new Setting(containerEl)
				.setName(displayName)
				.setDesc(`Engine: ${record.engine} · Enabled`)
				.addButton((btn) =>
					btn
						.setButtonText("Disable")
						.onClick(() => this._disableView(id, record)),
				)
				.addButton((btn) => {
					btn.setButtonText("Remove").onClick(() => this._removeView(id));
					btn.buttonEl.classList.add("mod-warning");
				});
		} else {
			// S25 — Disabled / Consent required
			new Setting(containerEl)
				.setName(displayName)
				.setDesc(`Engine: ${record.engine} · Disabled`)
				.addButton((btn) =>
					btn
						.setButtonText("Enable")
						.setCta()
						.onClick(() => this._enableView(id, record)),
				)
				.addButton((btn) => {
					btn.setButtonText("Remove").onClick(() => this._removeView(id));
					btn.buttonEl.classList.add("mod-warning");
				});
		}
	}

	// ---------------------------------------------------------------------------
	// Actions
	// ---------------------------------------------------------------------------

	private _disableView(id: string, record: ViewRecord): void {
		void this.store
			.setRecord(id, { ...record, enabled: false })
			.then(() => this.displayAsync())
			.catch((err) => console.error("[StoryForge] view action failed", err));
	}

	private _enableView(id: string, record: ViewRecord): void {
		void this.gate
			.requestConsent(id, record)
			.then((granted) => granted ? this.displayAsync() : Promise.resolve())
			.catch((err) => console.error("[StoryForge] view action failed", err));
	}

	private _removeView(id: string): void {
		this.removeCommand(id);
		void this.store
			.deleteRecord(id)
			.then(() => this.displayAsync())
			.catch((err) => console.error("[StoryForge] view action failed", err));
	}
}
