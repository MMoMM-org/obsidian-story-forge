/**
 * BrowseOfficialModal — T4.5 Browse official catalog UI.
 *
 * Lists all bundled curated catalog entries with provenance + checksum (S47),
 * shows a preview pane on row selection (S48), delegates install/update to
 * CatalogService (never re-implements checksum/consent/materialise), and
 * surfaces an "update available" affordance when the installed record's stored
 * checksum differs from the bundled entry checksum (S49 / AC-F7.1–AC-F7.3).
 *
 * DataviewJS entries route through CatalogService.install() which internally
 * gates through ConsentGate.requestConsentForDef (S57). The modal only
 * displays the error/result inline — no consent logic lives here.
 *
 * Update-available detection (F7):
 *   For each catalog entry, scan ViewStore for a curated record matched by:
 *   1. rec.catalogId === entry.id  (primary — stable slug, set since T4.5;
 *      survives catalog renames)
 *   2. rec.commandName === entry.name  (fallback — backward-compatible with
 *      records persisted before catalogId was added)
 *   If a match is found and record.okayed?.checksum !== installedChecksum(entry), the
 *   row shows an "update available" affordance with an Update button that
 *   reuses CatalogService.install().
 *
 * DOM safety: no innerHTML with untrusted content — all DOM writes use
 * createEl / textContent (mirrors ImportPickerModal).
 *
 * @ref PRD/AC-F4.2 (browse lists with provenance + checksum + preview)
 * @ref PRD/AC-F7.1 (update available when checksum drifts)
 * @ref PRD/AC-F7.2 (update reuses install path)
 * @ref PRD/AC-F7.3 (no update noise when checksums match)
 * @ref Mockups S47, S48, S49, S57
 */

import { Modal } from "obsidian";
import type { App } from "obsidian";
import type { CatalogService } from "catalog/CatalogService";
import { installedChecksum } from "catalog/catalogTypes";
import type { CatalogEntry } from "catalog/catalogTypes";
import type { ViewStore } from "store/ViewStore";
import type { ViewRecord } from "store/types";

// ---------------------------------------------------------------------------
// BrowseOfficialModal
// ---------------------------------------------------------------------------

export class BrowseOfficialModal extends Modal {
	/** Feedback area used for both error messages and success confirmations. */
	private feedbackEl: HTMLElement | null = null;
	private previewEl: HTMLElement | null = null;
	private selectedEntry: CatalogEntry | null = null;

	/** Map from entry.id to the installed ViewRecord (if any). Populated async. */
	private installedRecords = new Map<string, ViewRecord>();

	constructor(
		app: App,
		private readonly service: CatalogService,
		private readonly store: ViewStore,
	) {
		super(app);
	}

	onOpen(): void {
		void this._render();
	}

	onClose(): void {
		this.contentEl.empty();
		this.feedbackEl = null;
		this.previewEl = null;
	}

	// ---------------------------------------------------------------------------
	// Private rendering
	// ---------------------------------------------------------------------------

	private async _render(): Promise<void> {
		const el = this.contentEl;
		el.empty();

		el.createEl("h2", { text: "Collections from the repo" });
		el.createEl("p", {
			text: "Bundled, offline curated library. No network required.",
			cls: "sf-picker-sub",
		});

		// Inline feedback area — used for both errors and success confirmations.
		this.feedbackEl = el.createEl("div", { cls: "sf-picker-feedback sf-hidden" });

		// Main split layout
		const splitEl = el.createEl("div", { cls: "sf-catalog-split" });
		const listEl = splitEl.createEl("div", { cls: "sf-catalog-list" });
		this.previewEl = splitEl.createEl("div", { cls: "sf-catalog-preview sf-hidden" });

		// Load installed records to detect update-available state.
		// Primary match: rec.catalogId === entry.id (stable slug, set since T4.5).
		// Fallback: rec.commandName === entry.name for records persisted before
		// catalogId was added — backward-compatible with pre-T4.5 installs.
		try {
			const allViews = await this.store.getViews();
			this.installedRecords.clear();
			const entries = this.service.getEntries();
			for (const entry of entries) {
				for (const rec of Object.values(allViews)) {
					if (
						rec.provenance === "curated" &&
						(rec.catalogId === entry.id || rec.commandName === entry.name)
					) {
						this.installedRecords.set(entry.id, rec);
						break;
					}
				}
			}
		} catch {
			// Non-fatal: no update detection if store is unreadable
		}

		this._renderList(listEl);

		// Footer
		const footEl = el.createEl("div", { cls: "sf-picker-foot" });
		footEl.createEl("button", { text: "Close" }).addEventListener("click", () => this.close());
	}

	private _renderList(listEl: HTMLElement): void {
		const entries = this.service.getEntries();

		if (entries.length === 0) {
			listEl.createEl("p", {
				text: "The repo has no collections yet.",
				cls: "sf-picker-empty",
			});
			return;
		}

		let isFirst = true;
		for (const entry of entries) {
			const installed = this.installedRecords.get(entry.id);
			const updateAvailable = installed !== undefined
				&& installed.okayed?.checksum !== installedChecksum(entry);

			const row = listEl.createEl("div", { cls: "sf-catalog-row" });

			// Row header: name + engine badge
			const nameEl = row.createEl("div", { cls: "sf-catalog-name" });
			nameEl.createEl("span", { text: entry.name });
			nameEl.createEl("span", {
				text: entry.engine,
				cls: `sf-badge sf-badge-${entry.engine}`,
			});

			// Provenance line
			row.createEl("div", {
				text: updateAvailable ? "installed · update available" : "official · curated",
				cls: "sf-catalog-prov",
			});

			// Checksum (truncated)
			const shortHash = entry.checksum.slice(0, 14) + "…";
			row.createEl("div", { text: shortHash, cls: "sf-catalog-checksum" });

			// Action button
			const actEl = row.createEl("div", { cls: "sf-catalog-actions" });
			if (updateAvailable) {
				const updateBtn = actEl.createEl("button", { text: "Update" });
				updateBtn.addEventListener("click", (e) => {
					e.stopPropagation();
					void this._doInstall(entry);
				});
			} else if (!installed) {
				const installBtn = actEl.createEl("button", { text: "Install" });
				installBtn.addEventListener("click", (e) => {
					e.stopPropagation();
					void this._doInstall(entry);
				});
			} else {
				actEl.createEl("span", { text: "Installed", cls: "sf-catalog-installed-label" });
			}

			// Row click → select + preview
			row.addEventListener("click", () => {
				this._selectRow(row, listEl, entry);
			});

			// Auto-select first row
			if (isFirst) {
				this.selectedEntry = entry;
				row.classList.add("is-selected");
				this._renderPreview(entry);
				isFirst = false;
			}
		}
	}

	private _selectRow(row: HTMLElement, listEl: HTMLElement, entry: CatalogEntry): void {
		// Deselect all
		for (const r of Array.from(listEl.querySelectorAll(".sf-catalog-row"))) {
			r.classList.remove("is-selected");
		}
		row.classList.add("is-selected");
		this.selectedEntry = entry;
		this._renderPreview(entry);
	}

	private _renderPreview(entry: CatalogEntry): void {
		if (!this.previewEl) return;
		this.previewEl.empty();
		this.previewEl.classList.remove("sf-hidden");

		// Header: name + engine badge
		const headEl = this.previewEl.createEl("div", { cls: "sf-catalog-preview-head" });
		headEl.createEl("span", { text: entry.name, cls: "sf-catalog-preview-title" });
		headEl.createEl("span", { text: entry.engine, cls: `sf-badge sf-badge-${entry.engine}` });

		// Provenance + checksum
		const shortHash = entry.checksum.slice(0, 14) + "…";
		this.previewEl.createEl("div", {
			text: `official · curated · ${shortHash}`,
			cls: "sf-catalog-preview-prov",
		});

		// Description (when present)
		if (entry.description) {
			this.previewEl.createEl("div", {
				text: entry.description,
				cls: "sf-catalog-preview-desc",
			});
		}

		// Source YAML — in a <pre> for safe text display
		const preEl = this.previewEl.createEl("pre", { cls: "sf-catalog-preview-src" });
		preEl.textContent = entry.source;

		// Declarative entries (Bases, Dataview DQL) — safe note. DataviewJS asks at install.
		if (entry.engine !== "dataviewjs") {
			this.previewEl.createEl("div", {
				text: "Safe: declarative query, no code.",
				cls: "sf-catalog-safe",
			});
		}
	}

	private async _doInstall(entry: CatalogEntry): Promise<void> {
		this._clearFeedback();

		const result = await this.service.install(entry.id);

		if (result.ok) {
			this._showMessage("Installed successfully.");
		} else {
			this._showError(result.reason);
		}
	}

	private _showError(message: string): void {
		if (!this.feedbackEl) return;
		this.feedbackEl.textContent = message;
		this.feedbackEl.classList.remove("sf-hidden");
	}

	private _showMessage(message: string): void {
		if (!this.feedbackEl) return;
		this.feedbackEl.textContent = message;
		this.feedbackEl.classList.remove("sf-hidden");
		this.feedbackEl.classList.add("sf-catalog-success");
	}

	private _clearFeedback(): void {
		if (!this.feedbackEl) return;
		this.feedbackEl.textContent = "";
		this.feedbackEl.classList.add("sf-hidden");
		this.feedbackEl.classList.remove("sf-catalog-success");
	}
}
