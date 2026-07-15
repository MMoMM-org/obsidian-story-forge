/**
 * ImportPickerModal — vault view-definition picker (S19).
 *
 * Scans the vault for unimported sf-view:true notes via ViewImporter.scanVault(),
 * lets the user select one, then calls parse → importToStore in sequence.
 * Errors (parse / duplicate) are displayed inline; the modal stays open.
 * On success the modal closes and a BindModal is opened.
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
import { BindModal } from "import/BindModal";

/** Callback type injected from main.ts / SettingsTab to register a command palette entry. */
export type RegisterCommandCallback = (viewId: string, commandName: string) => void;

/**
 * ImportPickerModal — Modal subclass.
 *
 * Constructor dependencies (injected, not grabbed from globals):
 *   - app: App (passed to super)
 *   - importer: ViewImporter (stateless service)
 *   - registerCommand: RegisterCommandCallback (passed through to BindModal)
 *
 * T4.2/T4.4 callers construct this as:
 *   new ImportPickerModal(app, importer, (id, name) => plugin.addCommand({...}))
 */
export class ImportPickerModal extends Modal {
	private selectedFile: TFile | null = null;
	private errorEl: HTMLElement | null = null;
	private listEl: HTMLElement | null = null;
	private files: TFile[] = [];

	constructor(
		app: App,
		private readonly importer: ViewImporter,
		private readonly registerCommand: RegisterCommandCallback,
	) {
		super(app);
	}

	onOpen(): void {
		this._render();
	}

	onClose(): void {
		this.contentEl.empty();
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

		cancelBtn.addEventListener("click", () => this.close());
		nextBtn.addEventListener("click", () => void this._onConfirm());

		// Load files asynchronously
		void this._loadFiles();
	}

	private async _loadFiles(): Promise<void> {
		if (!this.listEl) return;
		this.files = await this.importer.scanVault();
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
			return;
		}

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

			// Auto-select the first file
			if (this.files.indexOf(file) === 0) {
				this.selectedFile = file;
				row.classList.add("is-selected");
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
		if (!this.selectedFile) return;
		this._clearError();

		let def: ViewDefinition;
		try {
			def = await this.importer.parse(this.selectedFile);
		} catch (err) {
			if (err instanceof ImportError) {
				this._showError(err.message);
			} else {
				this._showError("Import failed: unexpected error");
			}
			return;
		}

		let viewId: string;
		try {
			viewId = await this.importer.importToStore(def);
		} catch (err) {
			if (err instanceof ImportError) {
				this._showError(err.message);
			} else {
				this._showError("Import failed: unexpected error");
			}
			return;
		}

		// Success: close picker, open bind modal
		this.close();
		const bindModal = new BindModal(this.app, viewId, def, this.registerCommand);
		bindModal.open();
	}
}
