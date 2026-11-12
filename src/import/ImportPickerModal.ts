/**
 * ImportPickerModal — vault view-definition picker (S19).
 *
 * Scans the vault for unimported sf-view:true notes via ViewImporter.scanVault(),
 * lets the user select one, then PARSES it (S19: parse errors stay shown inline
 * without closing). On a successful parse the picker closes and hands the parsed
 * definition to runImportFlow, which owns the consent → commit sequence (F2: no
 * bind step). The picker itself performs NO store write.
 *
 * @ref SDD/Runtime View — Flow C (import leg)
 * @ref SDD/Cross-Cutting Concepts — User Interface S19
 * @ref PRD/AC-F3.1, AC-F3.3, AC-F3.4
 */

import { Modal } from "obsidian";
import type { App, TFile } from "obsidian";
import type { ViewImporter } from "import/ViewImporter";
import { ImportError } from "import/ViewDefinition";
import type { ViewDefinition } from "import/ViewDefinition";
import { runImportFlow } from "import/ImportFlow";
import type { ConsentGate } from "consent/ConsentGate";

/** The engine badge on a picker row (today's lowercase picker badges; T7.2 adds Bases). */
const PICKER_BADGE: Record<ViewDefinition["engine"], { text: string; cls: string }> = {
	bases: { text: "bases", cls: "sf-badge-bases" },
	"dataview-dql": { text: "dql", cls: "sf-badge-dql" },
	dataviewjs: { text: "dataviewjs", cls: "sf-badge-dvjs" },
};

/**
 * ImportPickerModal — Modal subclass.
 *
 * Constructor dependencies (injected, not grabbed from globals):
 *   - app: App (passed to super)
 *   - importer: ViewImporter (stateless service; the flow commits via it)
 *   - gate: ConsentGate (the flow's first, no-write consent step)
 *
 * On a successful parse the picker closes and delegates to runImportFlow — the
 * picker no longer imports/commits itself (that is deferred to the flow's end).
 */
export class ImportPickerModal extends Modal {
	private selectedFile: TFile | null = null;
	private errorEl: HTMLElement | null = null;
	private searchEl: HTMLInputElement | null = null;
	private listEl: HTMLElement | null = null;
	private nextBtnEl: HTMLElement | null = null;
	private files: TFile[] = [];
	/**
	 * Per-candidate parsed metadata, keyed by TFile. A candidate whose parse
	 * threw is absent from this map and rendered as a plain (name+path) row.
	 */
	private meta = new Map<TFile, ViewDefinition>();
	/** Row elements keyed by TFile, used by the search filter. */
	private rowEls = new Map<TFile, HTMLElement>();
	/** Lowercased search text used to match a row (name + description). */
	private rowSearchText = new Map<TFile, string>();
	/** True once onClose() fires — guards async tail after scanVault resolves. */
	private _closed = false;

	constructor(
		app: App,
		private readonly importer: ViewImporter,
		private readonly gate: ConsentGate,
	) {
		super(app);
	}

	onOpen(): void {
		this._render();
	}

	onClose(): void {
		this._closed = true;
		this.contentEl.empty();
		// Null out refs so any in-flight _loadFiles tail sees a closed state
		this.listEl = null;
		this.errorEl = null;
		this.searchEl = null;
		this.nextBtnEl = null;
	}

	// ---------------------------------------------------------------------------
	// Private rendering
	// ---------------------------------------------------------------------------

	private _render(): void {
		const el = this.contentEl;
		el.empty();

		// P18: today's modal, with "view" replaced by "collection"; T7.2 lists .base files too.
		el.createEl("h2", { text: "Import a collection" });
		el.createEl("p", {
			text: "Notes in your vault marked sf-view: true, and .base files",
			cls: "sf-picker-sub",
		});

		// Error display area (hidden until an error occurs)
		this.errorEl = el.createEl("div", { cls: "sf-picker-error sf-hidden" });

		// Search box (S19): filters the list by view name + description.
		this.searchEl = el.createEl("input", {
			cls: "sf-picker-search",
			type: "text",
			placeholder: "Search collections…",
		});
		this.searchEl.addEventListener("input", () => this._applyFilter());

		// File list (populated asynchronously)
		this.listEl = el.createEl("div", { cls: "sf-picker-list" });

		// Footer buttons
		const footEl = el.createEl("div", { cls: "sf-picker-foot" });
		const cancelBtn = footEl.createEl("button", { text: "Cancel" });
		const nextBtn = footEl.createEl("button", { text: "Next →" });

		this.nextBtnEl = nextBtn;

		cancelBtn.addEventListener("click", () => this.close());
		nextBtn.addEventListener("click", () => void this._onConfirm());

		// Load files asynchronously
		void this._loadFiles();
	}

	private async _loadFiles(): Promise<void> {
		this.files = await this.importer.scanVault();
		// Guard: modal may have been closed while scan was in-flight
		if (this._closed) return;

		// S19: enrich each candidate with parsed metadata (engine + description).
		// A candidate whose parse throws is tolerated — it still gets a plain row
		// (name + path only) and must NOT abort the whole list.
		this.meta.clear();
		for (const file of this.files) {
			try {
				const def = await this.importer.parse(file);
				if (this._closed) return;
				this.meta.set(file, def);
			} catch (err) {
				// Non-fatal per candidate: log and fall back to a plain row.
				console.debug("Story Forge: could not parse view candidate", file.path, err);
			}
		}
		if (this._closed) return;
		this._renderFileList();
	}

	private _renderFileList(): void {
		if (!this.listEl) return;
		this.listEl.empty();
		this.rowEls.clear();
		this.rowSearchText.clear();

		if (this.files.length === 0) {
			this.listEl.createEl("p", {
				text: "Nothing to import — add sf-view: true to a vault note, or create a .base file, to make it available here.",
				cls: "sf-picker-empty",
			});
			// W3: disable Next → when there is nothing to import
			if (this.nextBtnEl) {
				(this.nextBtnEl as HTMLButtonElement).disabled = true;
			}
			return;
		}

		let isFirst = true;
		for (const file of this.files) {
			const def = this.meta.get(file);
			const name = def?.name || file.basename;

			const row = this.listEl.createEl("div", { cls: "sf-picker-row" });
			row.createEl("div", { text: name, cls: "sf-picker-name" });

			// Description (only when non-empty).
			if (def?.description) {
				row.createEl("div", { text: def.description, cls: "sf-picker-sub" });
			}

			// Engine badge — only for successfully-parsed candidates.
			if (def) {
				const badge = PICKER_BADGE[def.engine];
				row.createEl("span", { text: badge.text, cls: `sf-badge ${badge.cls}` });
			}

			row.createEl("div", { text: file.path, cls: "sf-picker-path" });

			// Index the row for filtering (name + description, lowercased).
			this.rowEls.set(file, row);
			this.rowSearchText.set(
				file,
				`${name} ${def?.description ?? ""}`.toLowerCase(),
			);

			row.addEventListener("click", () => {
				this.selectedFile = file;
				// Highlight selected
				for (const el of Array.from(this.listEl!.querySelectorAll(".sf-picker-row"))) {
					el.classList.remove("is-selected");
				}
				row.classList.add("is-selected");
			});

			// S2: auto-select the first file using a boolean instead of O(n) indexOf
			if (isFirst) {
				this.selectedFile = file;
				row.classList.add("is-selected");
				isFirst = false;
			}
		}

		// Re-apply any active filter after a rebuild.
		this._applyFilter();
	}

	/**
	 * S19: filter rows case-insensitively by view name + description substring.
	 * Non-matching rows are hidden via `.sf-hidden`; clearing the box restores
	 * all rows. Selection is left as-is even if the selected row is hidden.
	 */
	private _applyFilter(): void {
		const query = (this.searchEl?.value ?? "").trim().toLowerCase();
		for (const [file, row] of this.rowEls) {
			const haystack = this.rowSearchText.get(file) ?? "";
			const matches = query === "" || haystack.includes(query);
			row.classList.toggle("sf-hidden", !matches);
		}
	}

	private _showError(message: string): void {
		if (!this.errorEl) return;
		this.errorEl.textContent = message;
		this.errorEl.classList.remove("sf-hidden");
	}

	private _clearError(): void {
		if (!this.errorEl) return;
		this.errorEl.textContent = "";
		this.errorEl.classList.add("sf-hidden");
	}

	private async _onConfirm(): Promise<void> {
		if (this._closed) return;
		if (!this.selectedFile) return;
		this._clearError();

		let def: ViewDefinition;
		try {
			def = await this.importer.parse(this.selectedFile);
		} catch (err) {
			// S19: parse errors stay shown inline; the modal does NOT close and the
			// import flow is NOT started.
			if (err instanceof ImportError) {
				this._showError(err.message);
			} else {
				// W1: log the real error before showing the user-facing message
				console.error(err);
				this._showError("Import failed: unexpected error");
			}
			return;
		}

		// Success: close the picker and hand the parsed def to the flow
		// (consent → commit; F2: no bind step). The picker commits nothing.
		this.close();
		void runImportFlow(
			{
				app: this.app,
				importer: this.importer,
				gate: this.gate,
			},
			def,
		);
	}
}
