/**
 * ImportPickerModal — vault view-definition picker (S19).
 *
 * Scans the vault for unimported sf-view:true notes via ViewImporter.scanVault(),
 * lets the user select one, then PARSES it (S19: parse errors stay shown inline
 * without closing). On a successful parse the picker closes and hands the parsed
 * definition to runImportFlow, which owns the deferred-atomic consent → bind →
 * commit sequence. The picker itself performs NO store write.
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
import type { RegisterCommandCallback } from "import/types";
import type { ConsentGate } from "consent/ConsentGate";

export type { RegisterCommandCallback } from "import/types";

/**
 * ImportPickerModal — Modal subclass.
 *
 * Constructor dependencies (injected, not grabbed from globals):
 *   - app: App (passed to super)
 *   - importer: ViewImporter (stateless service; the flow commits via it)
 *   - gate: ConsentGate (the flow's first, no-write consent step)
 *   - registerCommand: RegisterCommandCallback (passed through to the flow)
 *
 * On a successful parse the picker closes and delegates to runImportFlow — the
 * picker no longer imports/commits itself (that is deferred to the flow's end).
 */
export class ImportPickerModal extends Modal {
	private selectedFile: TFile | null = null;
	private errorEl: HTMLElement | null = null;
	private listEl: HTMLElement | null = null;
	private nextBtnEl: HTMLElement | null = null;
	private files: TFile[] = [];
	/** True once onClose() fires — guards async tail after scanVault resolves. */
	private _closed = false;

	constructor(
		app: App,
		private readonly importer: ViewImporter,
		private readonly gate: ConsentGate,
		private readonly registerCommand: RegisterCommandCallback,
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
		this.nextBtnEl = null;
	}

	// ---------------------------------------------------------------------------
	// Private rendering
	// ---------------------------------------------------------------------------

	private _render(): void {
		const el = this.contentEl;
		el.empty();

		el.createEl("h2", { text: "Import a view" });
		el.createEl("p", {
			text: "Notes in your vault marked sf-view: true",
			cls: "sf-picker-sub",
		});

		// Error display area (hidden until an error occurs)
		this.errorEl = el.createEl("div", { cls: "sf-picker-error sf-hidden" });

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
		this._renderFileList();
	}

	private _renderFileList(): void {
		if (!this.listEl) return;
		this.listEl.empty();

		if (this.files.length === 0) {
			this.listEl.createEl("p", {
				text: "No views to import — add sf-view: true to a vault note to make it available here.",
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
			const row = this.listEl.createEl("div", { cls: "sf-picker-row" });
			row.createEl("div", { text: file.basename, cls: "sf-picker-name" });
			row.createEl("div", { text: file.path, cls: "sf-picker-path" });

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

		// Success: close the picker and hand the parsed def to the deferred-atomic
		// flow (consent → bind → commit). The picker does not commit anything.
		this.close();
		void runImportFlow(
			{
				app: this.app,
				importer: this.importer,
				gate: this.gate,
				registerCommand: this.registerCommand,
			},
			def,
		);
	}
}
