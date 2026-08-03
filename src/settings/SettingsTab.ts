import type MyPlugin from "main";
import { type App, Menu, PluginSettingTab, Setting, ToggleComponent } from "obsidian";
import { normalizeLinkClickAction, normalizeExcludedFolders, normalizeFileClassesFolder } from "types/index";

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

/** Last path segment of a source path, with a trailing `.md` stripped. */
function basenameNoMd(source: string): string {
	const last = source.split("/").pop() ?? source;
	return last.replace(/\.md$/, "");
}

/** Kind pill (engine badge) mapping — reuses the existing `.sf-badge-*` styles. */
const KIND_BADGE: Record<ViewRecord["engine"], { cls: string; text: string }> = {
	dataviewjs: { cls: "sf-badge-dvjs", text: "dataviewjs" },
	"dataview-dql": { cls: "sf-badge-dql", text: "dql" },
	bases: { cls: "sf-badge-bases", text: "bases" },
};

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

		new Setting(containerEl)
			.setName("Curated bases folder")
			.setDesc("Vault folder where installed curated .base files are placed. Default: 00 Meta/Bases")
			.addText((text) =>
				text
					// eslint-disable-next-line obsidianmd/ui/sentence-case -- '00 Meta/Bases' is a vault path placeholder
					.setPlaceholder("00 Meta/Bases")
					.setValue(this.plugin.settings.curatedBasesFolder)
					.onChange(async (value) => {
						// Fall back to the default when the field is cleared.
						this.plugin.settings.curatedBasesFolder =
							value.trim().length > 0 ? value.trim() : "00 Meta/Bases";
						await this.plugin.saveSettings();
					}),
			);

		this._renderScopeSection(containerEl);

		await this._renderViewsSection(gen);
	}

	// ---------------------------------------------------------------------------
	// Scope section — which vault folders/FileClasses feed the Codex/Anvil/Workbench
	// (T3.5, PRD F3 AC: tag + excluded folders are user-editable with shipped defaults;
	// per-collection tag editing is Phase 7's Library UI — this section carries only
	// the global excludedFolders + fileClassesFolder settings).
	// ---------------------------------------------------------------------------

	private _renderScopeSection(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName("Scope")
			.setHeading();

		new Setting(containerEl)
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- 'FileClasses' is metadata-menu's proper noun for its fc-*.md files
			.setName("FileClasses folder")
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- 'FileClass'/'FileClasses' are metadata-menu's proper noun
			.setDesc("Vault folder containing your FileClass definitions (fc-*.md). Default: 00 Meta/FileClasses")
			.addText((text) =>
				text
					// eslint-disable-next-line obsidianmd/ui/sentence-case -- '00 Meta/FileClasses' is a vault path placeholder
					.setPlaceholder("00 Meta/FileClasses")
					.setValue(normalizeFileClassesFolder(this.plugin.settings.fileClassesFolder))
					.onChange(async (value) => {
						// Fall back to the default when the field is cleared or malformed.
						this.plugin.settings.fileClassesFolder = normalizeFileClassesFolder(value.trim());
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Excluded folders")
			.setDesc("Comma-separated vault folders left out of every collection and scope view. Default: 00 Meta")
			.addText((text) =>
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
						this.plugin.settings.excludedFolders = normalizeExcludedFolders(parsed);
						await this.plugin.saveSettings();
					}),
			);
	}

	// ---------------------------------------------------------------------------
	// Views section
	// ---------------------------------------------------------------------------

	private async _renderViewsSection(gen: number): Promise<void> {
		const { containerEl } = this;

		new Setting(containerEl)
			.setName("Views")
			.setHeading();

		// Toolbar — Import from vault (active) + Import from repo (M4, disabled).
		const toolbar = containerEl.createDiv({ cls: "sf-views-toolbar" });

		const vaultBtn = toolbar.createEl("button", {
			cls: "sf-views-toolbar-btn mod-cta",
			text: "Import from vault",
		});
		vaultBtn.addEventListener("click", () => {
			new ImportPickerModal(this.app, this.importer, this.gate).open();
		});

		const repoBtn = toolbar.createEl("button", {
			cls: "sf-views-toolbar-btn",
			text: "Import from repo",
			title: "Coming in a future release",
			attr: { "aria-label": "Coming in a future release" },
		});
		repoBtn.disabled = true;

		const views = await this.store.getViews();

		// Re-entrancy guard: a newer displayAsync() call has superseded us — bail
		// before appending any view rows to avoid doubled or stale rows.
		if (gen !== this._displayGen) return;

		const entries = Object.entries(views);

		if (entries.length === 0) {
			new Setting(containerEl)
				// eslint-disable-next-line obsidianmd/ui/sentence-case -- 'Import from vault' refers to the button name above
				.setName("No views imported yet. Use 'Import from vault' to add a view.")
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

		const listEl = containerEl.createDiv({ cls: "sf-view-list" });

		for (const { id, record, status } of rows) {
			// The enabled projection (evaluate({ ...record, enabled: true })) can
			// never short-circuit to "disabled", so this guard is defensive only —
			// it narrows `status` for _renderViewRow without an `as` cast.
			if (status === "disabled") continue;
			this._renderViewRow(listEl, id, record, status);
		}
	}

	/**
	 * Render a single view card. State is driven by `decision` — the consent-gate
	 * status from the ENABLED PROJECTION (so a disabled card still reveals whether
	 * its consent is fresh / drifted / never-given). Mockups S28–S31.
	 *
	 * Card head order: name → provenance chip → kind pill → [command pill] →
	 * status pill → [version] → [toggle] → ⋯ menu. Then a description line, and —
	 * for engine-missing / dvjs-off / platform-restricted — a blocked-reason row.
	 */
	private _renderViewRow(
		listEl: HTMLElement,
		id: string,
		record: ViewRecord,
		decision: Exclude<ConsentDecision["status"], "disabled">,
	): void {
		const cardEl = listEl.createDiv({ cls: "sf-view-card" });
		const headEl = cardEl.createDiv({ cls: "sf-view-head" });

		// 1. Name
		headEl.createSpan({
			cls: "sf-view-name",
			text: record.commandName ?? basenameNoMd(record.source),
		});

		// 2. Provenance chip
		const isOfficial = record.provenance === "curated";
		headEl.createSpan({
			cls: `sf-view-chip ${isOfficial ? "sf-chip-official" : "sf-chip-imported"}`,
			text: isOfficial ? "Official" : "Imported",
		});

		// 3. Kind pill (reuse engine badges)
		const kind = KIND_BADGE[record.engine];
		headEl.createSpan({ cls: `sf-badge ${kind.cls}`, text: kind.text });

		// 4. Command pill — only when the view is bound to a palette command.
		if (record.command === true) {
			const cmd = headEl.createSpan({ cls: "sf-view-cmd", text: "command" });
			cmd.title = record.commandLabel ?? record.commandName ?? "";
		}

		// 5. Status pill
		this._buildStatusPill(headEl, record, decision);

		// 6. Version — only when consent has been recorded.
		if (record.okayed) {
			headEl.createSpan({ cls: "sf-view-ver", text: `v${record.okayed.version}` });
		}

		// 7. Toggle — only for the safely-toggleable states.
		if (decision === "consented" || decision === "not-consented") {
			this._buildToggle(headEl, id, record, decision);
		}

		// 8. ⋯ overflow menu
		const menuBtn = headEl.createEl("button", {
			cls: "sf-view-menu-btn",
			text: "⋯",
			attr: { "aria-label": "More actions" },
		});
		menuBtn.addEventListener("click", (evt) => {
			this._buildRowMenu(id, record, decision).showAtMouseEvent(evt);
		});

		// Description line (falls back to the source path).
		cardEl.createDiv({
			cls: "sf-view-desc",
			text: record.description ?? record.source,
		});

		// Blocked-reason row for the engine/platform-unavailable states.
		if (decision === "engine-missing") {
			const blocked = cardEl.createDiv({ cls: "sf-view-blocked" });
			const reason = blocked.createSpan({ cls: "sf-view-blocked-reason" });
			reason.appendText("Dataview is not installed. ");
			reason.createEl("a", {
				// eslint-disable-next-line obsidianmd/ui/sentence-case -- 'Dataview' is a proper product name
				text: "Install Dataview",
				href: "https://obsidian.md/plugins?id=dataview",
			});
			reason.appendText(" to run this view.");
		} else if (decision === "dvjs-off") {
			const blocked = cardEl.createDiv({ cls: "sf-view-blocked" });
			blocked.createSpan({
				cls: "sf-view-blocked-reason",
				text: "DataviewJS is disabled in Dataview settings.",
			});
		} else if (decision === "platform-restricted") {
			const blocked = cardEl.createDiv({ cls: "sf-view-blocked" });
			blocked.createSpan({
				cls: "sf-view-blocked-reason",
				text: "DataviewJS is not available on mobile.",
			});
		}
	}

	/**
	 * Status pill = icon glyph span + label span, plus a modifier class.
	 * Mapping (plan §"Status pill mapping"):
	 *   enabled & consented                → ● Active / sf-status-active
	 *   !enabled & (consented|not-consented) → ○ Disabled / (none)
	 *   drift OR (enabled & not-consented)  → ▲ Consent required / sf-status-consent
	 *   engine-missing                      → ■ Engine unavailable / sf-status-missing
	 *   dvjs-off | platform-restricted      → ○ Unavailable / (none)
	 */
	private _buildStatusPill(
		headEl: HTMLElement,
		record: ViewRecord,
		decision: Exclude<ConsentDecision["status"], "disabled">,
	): void {
		let glyph = "○";
		let label = "Disabled";
		let modifier = "";

		if (decision === "engine-missing") {
			glyph = "■";
			label = "Engine unavailable";
			modifier = "sf-status-missing";
		} else if (decision === "dvjs-off" || decision === "platform-restricted") {
			glyph = "○";
			label = "Unavailable";
		} else if (decision === "drift" || (record.enabled && decision === "not-consented")) {
			glyph = "▲";
			label = "Consent required";
			modifier = "sf-status-consent";
		} else if (record.enabled && decision === "consented") {
			glyph = "●";
			label = "Active";
			modifier = "sf-status-active";
		} else {
			// !enabled & (consented | not-consented) → Disabled.
			glyph = "○";
			label = "Disabled";
		}

		const pill = headEl.createSpan({
			cls: modifier ? `sf-view-status ${modifier}` : "sf-view-status",
		});
		pill.createSpan({ cls: "sf-view-status-ic", text: glyph });
		pill.createSpan({ cls: "sf-view-status-label", text: label });
	}

	/**
	 * Toggle for the consented / not-consented states.
	 *   ON  + consented     → _reEnableView (immediate, source unchanged)
	 *   ON  + not-consented  → _enableView   (opens consent)
	 *   OFF (either)         → _disableView
	 */
	private _buildToggle(
		headEl: HTMLElement,
		id: string,
		record: ViewRecord,
		decision: "consented" | "not-consented",
	): void {
		new ToggleComponent(headEl).setValue(record.enabled).onChange((value) => {
			if (value) {
				if (decision === "consented") this._reEnableView(id, record);
				else this._enableView(id, record);
			} else {
				this._disableView(id, record);
			}
		});
	}

	/**
	 * Build the ⋯ overflow menu. View source is always first; Edit is present for
	 * every state except engine-missing; Re-review is present when consent has
	 * been recorded (okayed) or the source has drifted; Remove is always last,
	 * after a separator.
	 */
	private _buildRowMenu(
		id: string,
		record: ViewRecord,
		decision: Exclude<ConsentDecision["status"], "disabled">,
	): Menu {
		const menu = new Menu();
		menu.addItem((i) =>
			i.setTitle("View source").setIcon("file-search").onClick(() => this._viewSource(record)),
		);
		if (decision !== "engine-missing") {
			menu.addItem((i) =>
				i.setTitle("Edit (rename & command)…").setIcon("pencil").onClick(() => this._editView(id, record)),
			);
		}
		if (decision !== "engine-missing" && (record.okayed !== null || decision === "drift")) {
			menu.addItem((i) =>
				i.setTitle("Re-review consent…").setIcon("shield").onClick(() => this._reviewView(id, record)),
			);
		}
		menu.addSeparator();
		menu.addItem((i) =>
			i.setTitle("Remove").setIcon("trash").onClick(() => this._removeView(id)),
		);
		return menu;
	}

	/** Open the view's source note (⋯ → View source). */
	private _viewSource(record: ViewRecord): void {
		void this.app.workspace.openLinkText(record.source, "", false);
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
		const seedName = record.commandName ?? basenameNoMd(record.source);
		const seed = {
			name: seedName,
			registerCommand: record.command,
			commandName: record.commandLabel ?? record.commandName ?? basenameNoMd(record.source),
		};
		const result = await new BindModal(this.app, seed).present();
		if (!result) return; // cancelled — no change

		await this.store.setRecord(id, {
			...record,
			commandName: result.label,          // tab label
			command: result.registerCommand,
			commandLabel: result.commandName,    // persisted command name
		});

		// Reconcile the palette command entry. removeCommand is idempotent, so
		// remove UNCONDITIONALLY (fix: a stale record.command must not skip
		// removal), then register with the dedicated command name (no
		// "Story Forge: " prefix — Obsidian prefixes the plugin name in the
		// palette automatically).
		this.removeCommand(id);
		if (result.registerCommand) {
			this.registerCommand(id, result.commandName);
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
