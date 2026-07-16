import type MyPlugin from "main";
import { type App, PluginSettingTab, Setting } from "obsidian";

import { HeaderSection } from "./HeaderSection";
import type { ViewStore } from "store/ViewStore";
import type { ViewRecord } from "store/types";
import type { ConsentGate } from "consent/ConsentGate";
import type { ViewImporter } from "import/ViewImporter";
import { ImportPickerModal } from "import/ImportPickerModal";
import { BindModal } from "import/BindModal";
import type { RegisterCommandCallback } from "import/types";
import type { ConsentDecision } from "consent/ConsentGate";

/** Callback injected from main.ts to remove a view's command palette entry on deletion. */
export type RemoveCommandCallback = (viewId: string) => void;

export class SettingsTab extends PluginSettingTab {
	plugin: MyPlugin;
	private readonly header: HeaderSection;
	private readonly store: ViewStore;
	private readonly gate: ConsentGate;
	private readonly importer: ViewImporter;
	private readonly registerCommand: RegisterCommandCallback;
	private readonly removeCommand: RemoveCommandCallback;
	/** Store unsubscribe handle — set when tab is open, null when hidden. */
	private _unsubscribeStore: (() => void) | null = null;
	/**
	 * Monotonic generation counter for re-entrancy guard.
	 * Each call to displayAsync() increments this and captures its own gen value.
	 * After the async boundary (getViews await), a stale call bails if superseded.
	 */
	private _displayGen = 0;

	constructor(
		app: App,
		plugin: MyPlugin,
		store: ViewStore,
		gate: ConsentGate,
		importer: ViewImporter,
		registerCommand: RegisterCommandCallback,
		removeCommand: RemoveCommandCallback,
	) {
		super(app, plugin);
		this.plugin = plugin;
		this.header = new HeaderSection({ plugin });
		this.store = store;
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
		// Re-entrancy guard: capture generation before the first async boundary.
		// Any call that arrives while we are awaiting getViews() will increment
		// _displayGen, making our captured gen stale — we bail before painting rows.
		const gen = ++this._displayGen;

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

		await this._renderViewsSection(gen);
	}

	// ---------------------------------------------------------------------------
	// Views section
	// ---------------------------------------------------------------------------

	private async _renderViewsSection(gen: number): Promise<void> {
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
							this.gate,
							this.registerCommand,
						).open();
					}),
			);

		const views = await this.store.getViews();

		// Re-entrancy guard: a newer displayAsync() call has superseded us — bail
		// before appending any view rows to avoid doubled or stale rows.
		if (gen !== this._displayGen) return;

		const entries = Object.entries(views);

		if (entries.length === 0) {
			new Setting(containerEl)
				// eslint-disable-next-line obsidianmd/ui/sentence-case -- 'Import view' refers to the button name above
				.setName("No views imported yet. Use 'Import view' to add a view.")
				.setDesc("");
			return;
		}

		// Gather row-state decisions BEFORE painting so the paint stays synchronous
		// and the gen guard stays effective. Each row's TRUE consent state is read
		// via the enabled projection — evaluate() short-circuits to `disabled` when
		// enabled:false, so we must ask "what would the state be if enabled?".
		const rows = await Promise.all(
			entries.map(async ([id, record]) => {
				const decision = await this.gate.evaluate({ ...record, enabled: true });
				return { id, record, status: decision.status };
			}),
		);

		// Re-entrancy guard AGAIN: a store change during evaluate() must not paint
		// stale rows (preserves Bug-1 discipline across the new async boundary).
		if (gen !== this._displayGen) return;

		for (const { id, record, status } of rows) {
			// The enabled projection (evaluate({ ...record, enabled: true })) can
			// never short-circuit to "disabled", so this guard is defensive only —
			// it narrows `status` for _renderViewRow without an `as` cast.
			if (status === "disabled") continue;
			this._renderViewRow(containerEl, id, record, status);
		}
	}

	/**
	 * Render a single view row. State is driven by `decision` — the consent-gate
	 * status computed from the ENABLED PROJECTION (so a disabled row still reveals
	 * whether its consent is fresh / drifted / never-given). Mockups S24–S27.
	 *
	 *   engine-missing        → Remove only (no Edit, no toggle) — S26.
	 *   dvjs-off              → Edit + Remove.
	 *   platform-restricted   → Edit + Remove.
	 *   otherwise, branch on record.enabled × {consented|drift|not-consented}:
	 *     enabled  consented       → Disable + Edit + Remove — S24.
	 *     enabled  drift           → Review(reConsent) + Edit + Remove — S25b.
	 *     enabled  not-consented   → Review(consent) + Disable + Edit + Remove.
	 *     disabled consented       → Re-enable (immediate) + Edit + Remove — S25a.
	 *     disabled drift           → Review(reConsent) + Edit + Remove — S25b.
	 *     disabled not-consented   → Enable(consent, CTA) + Edit + Remove.
	 *
	 * Every non-engine-missing row also gets an Edit button (opens S27 BindModal).
	 */
	private _renderViewRow(
		containerEl: HTMLElement,
		id: string,
		record: ViewRecord,
		decision: Exclude<ConsentDecision["status"], "disabled">,
	): void {
		const displayName = record.commandName ?? record.source;
		const engine = record.engine;

		const setting = new Setting(containerEl).setName(displayName);

		// S26 — Engine missing: Remove only, no Edit, no toggle.
		if (decision === "engine-missing") {
			setting.setDesc(
				`Engine ${engine} is missing or not installed — install Dataview to use this view.`,
			);
			this._addRemoveButton(setting, id);
			return;
		}

		if (decision === "dvjs-off") {
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- 'DataviewJS' and 'Dataview' are proper product names
			setting.setDesc("DataviewJS is disabled in Dataview settings.");
			this._addEditButton(setting, id, record);
			this._addRemoveButton(setting, id);
			return;
		}

		if (decision === "platform-restricted") {
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- 'DataviewJS' is a proper product name
			setting.setDesc("DataviewJS is not available on mobile.");
			this._addEditButton(setting, id, record);
			this._addRemoveButton(setting, id);
			return;
		}

		// Remaining decisions: consented | not-consented | drift.
		if (record.enabled) {
			if (decision === "drift") {
				// S25b — enabled but source changed → re-consent required.
				setting.setDesc(`Engine: ${engine} · Consent required (source changed)`);
				this._addButton(setting, "Review", () => this._reviewView(id, record));
			} else if (decision === "not-consented") {
				setting.setDesc(`Engine: ${engine} · Consent required`);
				this._addButton(setting, "Review", () => this._enableView(id, record));
				this._addButton(setting, "Disable", () => this._disableView(id, record));
			} else {
				// S24 — consented + enabled.
				setting.setDesc(`Engine: ${engine} · Enabled`);
				this._addButton(setting, "Disable", () => this._disableView(id, record));
			}
		} else {
			if (decision === "drift") {
				// S25b — disabled + source changed → re-consent required.
				setting.setDesc(`Engine: ${engine} · Consent required (source changed)`);
				this._addButton(setting, "Review", () => this._reviewView(id, record));
			} else if (decision === "not-consented") {
				setting.setDesc(`Engine: ${engine} · Disabled`);
				this._addButton(setting, "Enable", () => this._enableView(id, record), true);
			} else if (decision === "consented") {
				// S25a — consented but disabled → Re-enable immediately (no fresh
				// consent needed: source unchanged).
				setting.setDesc(`Engine: ${engine} · Disabled`);
				this._addButton(setting, "Re-enable", () => this._reEnableView(id, record));
			} else {
				// Exhaustive guard — satisfies TypeScript's never check. All engine
				// gate statuses (engine-missing/dvjs-off/platform-restricted) are
				// handled above; "disabled" is excluded from the param type.
				const _exhaustive: never = decision;
				console.debug("[StoryForge] unhandled consent decision", _exhaustive);
			}
		}

		this._addEditButton(setting, id, record);
		this._addRemoveButton(setting, id);
	}

	/** Add a plain (or CTA) action button whose click is fire-and-forget. */
	private _addButton(
		setting: Setting,
		label: string,
		onClick: () => void,
		cta = false,
	): void {
		setting.addButton((btn) => {
			btn.setButtonText(label).onClick(onClick);
			if (cta) btn.setCta();
		});
	}

	/** Add the Edit button (opens S27 BindModal). */
	private _addEditButton(setting: Setting, id: string, record: ViewRecord): void {
		this._addButton(setting, "Edit", () => this._editView(id, record));
	}

	/** Add the Remove button (mod-warning) — present on every row. */
	private _addRemoveButton(setting: Setting, id: string): void {
		setting.addButton((btn) => {
			btn.setButtonText("Remove").onClick(() => this._removeView(id));
			btn.buttonEl.classList.add("mod-warning");
		});
	}

	// ---------------------------------------------------------------------------
	// Actions
	// ---------------------------------------------------------------------------

	private _disableView(id: string, record: ViewRecord): void {
		// Re-render is driven by the store observer (subscribe → displayAsync).
		// No manual displayAsync() call — avoids concurrent double-render (Bug B).
		void this.store
			.setRecord(id, { ...record, enabled: false })
			.catch((err) => console.error("[StoryForge] view action failed", err));
	}

	private _enableView(id: string, record: ViewRecord): void {
		// On consent grant, requestConsent calls store.setRecord which fires the
		// observer → re-render. On cancel nothing changed → no re-render needed.
		void this.gate
			.requestConsent(id, record)
			.catch((err) => console.error("[StoryForge] view action failed", err));
	}

	/**
	 * S25a — Re-enable a disabled-but-consented view IMMEDIATELY. The source is
	 * unchanged (decision === "consented"), so no fresh consent is required.
	 * The store write fires the observer → re-render.
	 */
	private _reEnableView(id: string, record: ViewRecord): void {
		void this.store
			.setRecord(id, { ...record, enabled: true })
			.catch((err) => console.error("[StoryForge] view action failed", err));
	}

	/**
	 * S25b — Review a drifted view: opens the re-consent modal. On grant,
	 * requestReConsent writes the store → observer → re-render.
	 */
	private _reviewView(id: string, record: ViewRecord): void {
		void this.gate
			.requestReConsent(id, record)
			.catch((err) => console.error("[StoryForge] view action failed", err));
	}

	/**
	 * S27 — Edit a view's sidebar tab label and command binding. Opens the
	 * BindModal seeded with current values; on Done, writes the new label +
	 * command flag and reconciles the palette command entry. Cancel = no change.
	 * The store write fires the observer → re-render (label updates live).
	 */
	private _editView(id: string, record: ViewRecord): void {
		void this._editViewAsync(id, record).catch((err) =>
			console.error("[StoryForge] view action failed", err),
		);
	}

	private async _editViewAsync(id: string, record: ViewRecord): Promise<void> {
		const seedName = record.commandName ?? record.source;
		const seed = {
			name: seedName,
			registerCommand: record.command,
			commandName: `Story Forge: ${seedName}`,
		};
		const result = await new BindModal(this.app, seed).present();
		if (!result) return; // cancelled — no change

		await this.store.setRecord(id, {
			...record,
			commandName: result.label,
			command: result.registerCommand,
		});

		// Reconcile the palette command entry.
		if (result.registerCommand) {
			this.removeCommand(id); // no-op if none; ensures rename replaces old entry
			this.registerCommand(id, result.commandName);
		} else if (record.command) {
			this.removeCommand(id);
		}
	}

	private _removeView(id: string): void {
		this.removeCommand(id);
		// Re-render is driven by the store observer (subscribe → displayAsync).
		void this.store
			.deleteRecord(id)
			.catch((err) => console.error("[StoryForge] view action failed", err));
	}
}
