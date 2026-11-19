/**
 * BrowseOfficialModal — the catalog browser ("Collections from the repo"), built to the signed-off
 * mockup `docs/XDD/specs/008-codex-surface/mockups-catalog.html` L10a–L10i (proposals Q1–Q8).
 *
 * The list | detail browser itself — two panes stacking below about 560px (Q1), search and engine
 * filter above 5 entries (Q2), nothing selected on open (Q3), keyboard and "← All collections" —
 * is `BrowserList`, shared with the vault import modal (L11). This modal draws the rest: rows carry
 * status text only, and the one Install / Update button and its feedback live in the detail pane
 * (Q4). The detail shows the query block only, contained (Q5); source, version and checksum sit in
 * a collapsed Details line (Q6).
 *
 * Install / update is delegated to CatalogService (checksum, consent, update in place and the
 * refusals all live there; DataviewJS consent is asked inside `install()`). The modal only words
 * the result: success texts here (Q7), refusal sentences via `describeRefusal` (Q8).
 *
 * Update-available detection (F7): an entry is installed when a curated record matches it by
 * `catalogId` (primary, rename-proof) or `commandName` (records from before T4.5); it is current
 * when that record's `okayed.checksum` equals `installedChecksum(entry)`, else "Update available".
 *
 * DOM safety: no innerHTML — every write is createEl / textContent. Popout-safe: Obsidian element
 * helpers only.
 *
 * @ref PRD/AC-F4.2, AC-F7.1, AC-F7.2, AC-F7.3
 * @ref Mockups S47, S48, S49, S57; mockups-catalog.html L10a–L10i
 */

import { Modal } from "obsidian";
import type { App } from "obsidian";
import { BrowserList, renderFeedback, renderLabelled } from "catalog/browserList";
import type { Feedback } from "catalog/browserList";
import { describeRefusal, installedPath } from "catalog/CatalogService";
import type { CatalogService, InstallResult } from "catalog/CatalogService";
import { installedChecksum } from "catalog/catalogTypes";
import type { CatalogEntry } from "catalog/catalogTypes";
import { STATUS_TEXT, queryOf, shortChecksum } from "catalog/catalogView";
import type { Status } from "catalog/catalogView";
import { ENGINE_LABEL } from "settings/libraryShared";
import type { ViewStore } from "store/ViewStore";
import type { ViewRecord } from "store/types";

const STATUS_CLS: Record<Status, string[]> = {
	none: ["sf-catalog-status"],
	installed: ["sf-catalog-status", "is-installed"],
	update: ["sf-catalog-status", "is-update"],
};

/** The detail pane's one action (Q4, Q7). DataviewJS opens the consent dialog first, hence the ellipsis. */
function actionLabel(entry: CatalogEntry, status: Status): string {
	if (entry.engine === "dataviewjs") return status === "update" ? "Review and update…" : "Review and install…";
	return status === "update" ? "Update" : "Install";
}

// ---------------------------------------------------------------------------
// BrowseOfficialModal
// ---------------------------------------------------------------------------

export class BrowseOfficialModal extends Modal {
	/** Map from entry.id to the installed ViewRecord (if any). Populated async. */
	private installedRecords = new Map<string, ViewRecord>();
	/** Entries installed or updated while the modal is open, with the path written. */
	private installedNow = new Map<string, string>();
	private list: BrowserList<CatalogEntry> | null = null;
	/** Entries whose install has not settled yet: their button stays disabled across re-renders. */
	private inFlight = new Set<string>();
	/** Set by onClose: a render still awaiting the store must not draw into a closed modal. */
	private closed = false;

	constructor(
		app: App,
		private readonly service: CatalogService,
		private readonly store: ViewStore,
	) {
		super(app);
	}

	onOpen(): void {
		this.closed = false;
		this.modalEl.addClass("sf-catalog-modal");
		void this._render();
	}

	onClose(): void {
		this.closed = true;
		this.contentEl.empty();
		this.list = null;
	}

	// ---------------------------------------------------------------------------
	// Frame
	// ---------------------------------------------------------------------------

	private async _render(): Promise<void> {
		const el = this.contentEl;
		el.empty();
		el.addClass("sf-catalog");
		el.createEl("h2", { text: "Collections from the repo" });
		el.createEl("p", { text: "Bundled, offline curated library. No network required.", cls: "sf-picker-sub" });
		await this._loadInstalled();
		if (this.closed) return;

		const entries = this.service.getEntries();
		if (entries.length === 0) this._renderEmpty(el);
		else this._mountList(el, entries);

		const close = el.createDiv({ cls: "sf-picker-foot" }).createEl("button", { text: "Close", attr: { type: "button" } });
		close.addEventListener("click", () => this.close());
		if (this.list) this.list.focusStart(close);
		else close.focus();
	}

	private _mountList(el: HTMLElement, entries: CatalogEntry[]): void {
		this.list = new BrowserList(el, entries, {
			keyOf: (entry) => entry.id,
			listLabel: "Collections from the repo",
			titleIdPrefix: "sf-catalog-title",
			renderRow: (row, entry) => this._renderRow(row, entry),
			renderDetail: (pane, entry, titleId, feedback) => this._renderDetail(pane, entry, titleId, feedback),
		});
		this.list.mount();
	}

	/**
	 * Match curated records to entries. Primary: rec.catalogId === entry.id (stable slug, set
	 * since T4.5). Fallback: rec.commandName === entry.name for records persisted before catalogId.
	 */
	private async _loadInstalled(): Promise<void> {
		this.installedRecords.clear();
		let all: Record<string, ViewRecord>;
		try {
			all = await this.store.getViews();
		} catch {
			return; // Non-fatal: no status detection if the store is unreadable.
		}
		for (const entry of this.service.getEntries()) {
			const rec = Object.values(all).find((r) =>
				r.provenance === "curated" && (r.catalogId === entry.id || r.commandName === entry.name));
			if (rec) this.installedRecords.set(entry.id, rec);
		}
	}

	private _status(entry: CatalogEntry): Status {
		if (this.installedNow.has(entry.id)) return "installed";
		const rec = this.installedRecords.get(entry.id);
		if (!rec) return "none";
		return rec.okayed?.checksum === installedChecksum(entry) ? "installed" : "update";
	}

	/** The file an install of `entry` writes, or the installed file it updates. */
	private _pathOf(entry: CatalogEntry): string {
		const now = this.installedNow.get(entry.id);
		if (now !== undefined) return now;
		const target = this.service.targetPath(entry);
		const rec = this.installedRecords.get(entry.id);
		return rec ? installedPath(rec, target) : target;
	}

	private _renderEmpty(el: HTMLElement): void {
		el.createDiv({ cls: "sf-catalog-split is-single" })
			.createEl("p", { text: "The repo has no collections yet.", cls: "sf-picker-empty sf-catalog-empty" });
	}

	// ---------------------------------------------------------------------------
	// Row (left pane)
	// ---------------------------------------------------------------------------

	private _renderRow(row: HTMLElement, entry: CatalogEntry): void {
		row.createSpan({ cls: "sf-catalog-name", text: entry.name });
		this._renderStatus(row, entry);
		const line2 = row.createSpan({ cls: "sf-catalog-line2" });
		line2.createSpan({ cls: "sf-catalog-engine", text: ENGINE_LABEL[entry.engine] });
		line2.createSpan({ cls: "sf-catalog-desc", text: entry.description ?? "" });
	}

	private _renderStatus(host: HTMLElement, entry: CatalogEntry): void {
		const status = this._status(entry);
		host.createSpan({ cls: STATUS_CLS[status], text: STATUS_TEXT[status] });
	}

	// ---------------------------------------------------------------------------
	// Detail (right pane)
	// ---------------------------------------------------------------------------

	private _renderDetail(pane: HTMLElement, entry: CatalogEntry, titleId: string, feedback: Feedback | null): void {
		this._renderHead(pane, entry, titleId);
		const status = this._status(entry);
		this._renderDest(pane, entry, status);
		if (status !== "installed") this._renderBody(pane, entry, status);
		if (feedback) renderFeedback(pane, feedback);
		this._renderDetails(pane, entry);
	}

	private _renderHead(pane: HTMLElement, entry: CatalogEntry, titleId: string): void {
		const head = pane.createDiv({ cls: "sf-catalog-preview-head" });
		head.createSpan({ cls: "sf-catalog-preview-title", text: entry.name, attr: { id: titleId } });
		head.createSpan({ cls: "sf-catalog-engine", text: ENGINE_LABEL[entry.engine] });
		if (this._status(entry) !== "none") this._renderStatus(head, entry);
		if (entry.description) pane.createEl("p", { cls: "sf-catalog-preview-desc", text: entry.description });
	}

	private _renderDest(pane: HTMLElement, entry: CatalogEntry, status: Status): void {
		const label = status === "installed" ? "Installed at" : status === "update" ? "Updates" : "Installs to";
		const dest = renderLabelled(pane, label, "sf-catalog-preview-dest");
		dest.createDiv().createSpan({ cls: "sf-catalog-path", text: this._pathOf(entry) });
		if (status === "update") {
			dest.createDiv({ cls: "sf-catalog-hint", text: "The repo has a newer version. Update replaces this file with it." });
		} else if (status === "none") {
			const hint = dest.createDiv({ cls: "sf-catalog-hint" });
			hint.appendText("Set by ");
			hint.createEl("em", { text: "Folder for collections from the repo" });
			hint.appendText(" in Settings › Library.");
		}
	}

	/** Query, safe / consent note, and the one action (not drawn for an installed, current entry). */
	private _renderBody(pane: HTMLElement, entry: CatalogEntry, status: Status): void {
		renderLabelled(pane, status === "update" ? "Query (new version)" : "Query")
			.createEl("pre", { cls: "sf-catalog-preview-src", text: queryOf(entry) });
		if (entry.engine === "dataviewjs") {
			const note = pane.createDiv({ cls: "sf-catalog-consent" });
			note.createEl("strong", { text: "▲ Runs JavaScript." });
			note.appendText(" This collection runs code with full vault access. ");
			note.createEl("em", { text: actionLabel(entry, status) });
			note.appendText(" shows you its code first. Nothing is written until you enable it.");
		} else {
			pane.createDiv({ cls: "sf-catalog-safe", text: "Safe: declarative query, no code." });
		}
		const btn = pane.createDiv({ cls: "sf-catalog-act" })
			.createEl("button", { cls: "mod-cta", text: actionLabel(entry, status), attr: { type: "button" } });
		btn.disabled = this.inFlight.has(entry.id);
		btn.addEventListener("click", () => void this._doInstall(entry));
	}

	private _renderDetails(pane: HTMLElement, entry: CatalogEntry): void {
		const box = pane.createDiv({ cls: "sf-catalog-preview-details" });
		const toggle = box.createEl("button", {
			cls: "sf-catalog-details-toggle",
			text: "▸ Details",
			attr: { type: "button", "aria-expanded": "false" },
		});
		const dl = box.createEl("dl", { cls: "sf-hidden" });
		const row = (term: string, value: string, title?: string): void => {
			dl.createEl("dt", { text: term });
			dl.createEl("dd", { text: value, ...(title !== undefined ? { title } : {}) });
		};
		row("Source", `catalog/${entry.id}.${entry.engine === "bases" ? "base" : "md"}`);
		if (entry.engine !== "bases") row("Version", String(entry.version));
		row("Checksum", shortChecksum(entry.checksum), entry.checksum);
		toggle.addEventListener("click", () => {
			const open = toggle.getAttribute("aria-expanded") !== "true";
			toggle.setAttribute("aria-expanded", String(open));
			toggle.textContent = open ? "▾ Details" : "▸ Details";
			dl.toggleClass("sf-hidden", !open);
		});
	}

	// ---------------------------------------------------------------------------
	// Install / update
	// ---------------------------------------------------------------------------

	/**
	 * Run one install of `entry`. While it is in flight the entry's button is disabled, however
	 * often its pane is redrawn (re-selecting it rebuilds the button), so it installs once.
	 */
	private async _doInstall(entry: CatalogEntry): Promise<void> {
		if (this.inFlight.has(entry.id)) return;
		const update = this._status(entry) === "update";
		const path = this._pathOf(entry);
		this.inFlight.add(entry.id);
		this._disableAction(entry);
		let result: InstallResult;
		try {
			result = await this.service.install(entry.id);
		} catch (err) {
			// install() promises never to throw; if it does anyway, report it like any refusal so the
			// pane is redrawn and the button is usable again (describeRefusal's "Not installed." + raw).
			console.error(err);
			result = { ok: false, reason: `unexpected error: ${err instanceof Error ? err.message : String(err)}` };
		} finally {
			this.inFlight.delete(entry.id);
		}
		if (result.ok) {
			this.installedNow.set(entry.id, result.path ?? path);
			this.list?.repaintRow(entry);
		}
		// The user moved on to another entry: its pane is not this result's place (the row still updated).
		if (this.list?.isSelected(entry)) this._showResult(entry, result, update, path);
	}

	/** Disable the action button now, when `entry` is the one on show. */
	private _disableAction(entry: CatalogEntry): void {
		if (!this.list?.isSelected(entry)) return;
		const btn = this.list.pane?.querySelector<HTMLButtonElement>(".sf-catalog-act button");
		if (btn) btn.disabled = true;
	}

	private _showResult(entry: CatalogEntry, result: InstallResult, update: boolean, path: string): void {
		const list = this.list;
		if (!list) return;
		if (result.ok) {
			const written = result.path ?? path;
			const text = update ? `Updated ${written}.` : `Installed to ${written}. It is in Library › Collections.`;
			list.showDetail(entry, { text, tone: "success" });
			list.pane?.querySelector<HTMLElement>(".sf-picker-feedback")?.focus();
			return;
		}
		const note = describeRefusal(result.reason, path, update);
		list.showDetail(entry, { text: note.text, ...(note.raw !== undefined ? { raw: note.raw } : {}), tone: note.tone });
		list.pane?.querySelector<HTMLButtonElement>(".sf-catalog-act button")?.focus();
	}
}
