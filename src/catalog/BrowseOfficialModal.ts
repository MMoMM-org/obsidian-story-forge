/**
 * BrowseOfficialModal — the catalog browser ("Collections from the repo"), built to the signed-off
 * mockup `docs/XDD/specs/008-codex-surface/mockups-catalog.html` L10a–L10i (proposals Q1–Q8).
 *
 * Two panes (Q1): a listbox of entries on the left and the selected entry's detail on the right.
 * Below about 560px the panes stack: the list fills the modal, choosing a row opens its detail with
 * "← All collections" to go back (CSS container query on `.sf-catalog`; `is-detail` on the split).
 * Nothing is selected on open (Q3). Rows carry status text only; the one Install / Update button
 * and its feedback live in the detail pane (Q4). The detail shows the query block only, contained
 * (Q5); source, version and checksum sit in a collapsed Details line (Q6). Search and an engine
 * filter appear above 5 entries (Q2).
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
 * helpers and `activeDocument` only.
 *
 * @ref PRD/AC-F4.2, AC-F7.1, AC-F7.2, AC-F7.3
 * @ref Mockups S47, S48, S49, S57; mockups-catalog.html L10a–L10i
 */

import { Modal } from "obsidian";
import type { App } from "obsidian";
import { describeRefusal, installedPath } from "catalog/CatalogService";
import type { CatalogService, InstallResult } from "catalog/CatalogService";
import { installedChecksum } from "catalog/catalogTypes";
import type { CatalogEntry } from "catalog/catalogTypes";
import { extractQueryBlocks } from "import/queryBlocks";
import { ENGINE_LABEL } from "settings/libraryShared";
import type { ViewStore } from "store/ViewStore";
import type { ViewRecord } from "store/types";

/** Search and the engine filter show only above this many entries (Q2). */
const SEARCH_THRESHOLD = 5;
/** Below this content width the panes stack (Q1); matches the CSS container query. */
const STACK_WIDTH = 560;
/** Hex digits of the checksum shown in Details; the full value is the element's title. */
const CHECKSUM_DIGITS = 10;

type Status = "none" | "installed" | "update";
type EngineFilter = "all" | CatalogEntry["engine"];

const FILTERS: Array<{ key: EngineFilter; label: string }> = [
	{ key: "all", label: "All" },
	{ key: "bases", label: ENGINE_LABEL.bases },
	{ key: "dataview-dql", label: ENGINE_LABEL["dataview-dql"] },
	{ key: "dataviewjs", label: ENGINE_LABEL.dataviewjs },
];

const STATUS_TEXT: Record<Status, string> = { none: "", installed: "✓ Installed", update: "Update available" };
const STATUS_CLS: Record<Status, string[]> = {
	none: ["sf-catalog-status"],
	installed: ["sf-catalog-status", "is-installed"],
	update: ["sf-catalog-status", "is-update"],
};
const FEEDBACK_CLS: Record<Feedback["tone"], string[]> = {
	success: ["sf-picker-feedback", "sf-catalog-success"],
	error: ["sf-picker-feedback"],
	neutral: ["sf-picker-feedback", "sf-catalog-neutral"],
};

/** The message under the action, after an install attempt. */
interface Feedback {
	text: string;
	raw?: string;
	tone: "success" | "error" | "neutral";
}

/** The query block a user reads: a Bases entry's YAML, a Dataview note's one fenced block body. */
function queryOf(entry: CatalogEntry): string {
	if (entry.engine === "bases") return entry.source.trimEnd();
	const blocks = extractQueryBlocks(entry.source);
	return (blocks.length === 1 ? blocks[0]!.body : entry.source).trimEnd();
}

function shortChecksum(checksum: string): string {
	const [algo, hex] = checksum.includes(":") ? checksum.split(":", 2) : ["", checksum];
	const head = (hex ?? "").slice(0, CHECKSUM_DIGITS);
	return `${algo ? `${algo}:` : ""}${head}…`;
}

// ---------------------------------------------------------------------------
// BrowseOfficialModal
// ---------------------------------------------------------------------------

export class BrowseOfficialModal extends Modal {
	/** Map from entry.id to the installed ViewRecord (if any). Populated async. */
	private installedRecords = new Map<string, ViewRecord>();
	/** Entries installed or updated while the modal is open, with the path written. */
	private installedNow = new Map<string, string>();

	private splitEl: HTMLElement | null = null;
	private listEl: HTMLElement | null = null;
	private detailEl: HTMLElement | null = null;
	private searchEl: HTMLInputElement | null = null;
	private liveEl: HTMLElement | null = null;
	private noMatchEl: HTMLElement | null = null;
	private rowEls = new Map<string, HTMLElement>();
	private filterEls = new Map<EngineFilter, HTMLButtonElement>();
	private filter: EngineFilter = "all";
	private selected: CatalogEntry | null = null;

	constructor(
		app: App,
		private readonly service: CatalogService,
		private readonly store: ViewStore,
	) {
		super(app);
	}

	onOpen(): void {
		this.modalEl.addClass("sf-catalog-modal");
		void this._render();
	}

	onClose(): void {
		this.contentEl.empty();
		this.rowEls.clear();
		this.filterEls.clear();
		this.splitEl = this.listEl = this.detailEl = this.liveEl = this.noMatchEl = null;
		this.searchEl = null;
		this.selected = null;
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

		const entries = this.service.getEntries();
		if (entries.length > SEARCH_THRESHOLD) this._renderTools(el);
		this.splitEl = el.createDiv({ cls: "sf-catalog-split" });
		if (entries.length === 0) this._renderEmpty(this.splitEl);
		else this._renderPanes(this.splitEl, entries);

		const close = el.createDiv({ cls: "sf-picker-foot" }).createEl("button", { text: "Close", attr: { type: "button" } });
		close.addEventListener("click", () => this.close());
		this._focusStart(close);
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

	private _focusStart(close: HTMLElement): void {
		const first = this.listEl?.querySelector<HTMLElement>(".sf-catalog-row");
		(this.searchEl ?? first ?? close).focus();
	}

	private _isStacked(): boolean {
		const w = this.contentEl.clientWidth;
		return w > 0 && w < STACK_WIDTH;
	}

	// ---------------------------------------------------------------------------
	// Search + engine filter (Q2)
	// ---------------------------------------------------------------------------

	private _renderTools(el: HTMLElement): void {
		const tools = el.createDiv({ cls: "sf-catalog-tools" });
		this.searchEl = tools.createEl("input", {
			cls: "sf-picker-search",
			type: "search",
			placeholder: "Search collections…",
			attr: { "aria-label": "Search collections" },
		});
		this.searchEl.addEventListener("input", () => this._applyFilter());
		const group = tools.createDiv({ cls: "sf-catalog-filter", attr: { role: "radiogroup", "aria-label": "Engine" } });
		for (const f of FILTERS) {
			const btn = group.createEl("button", { attr: { type: "button", role: "radio", "aria-checked": String(f.key === this.filter) } });
			btn.createSpan({ cls: "sf-catalog-filter-label", text: f.label });
			btn.createSpan({ cls: "sf-catalog-filter-count" });
			btn.addEventListener("click", () => this._setFilter(f.key));
			this.filterEls.set(f.key, btn);
		}
		this.liveEl = el.createDiv({ cls: "sf-lb-sr sf-catalog-live", attr: { "aria-live": "polite" } });
	}

	private _setFilter(key: EngineFilter): void {
		this.filter = key;
		for (const [k, btn] of this.filterEls) btn.setAttribute("aria-checked", String(k === key));
		this._applyFilter();
	}

	private _matchesSearch(entry: CatalogEntry, query: string): boolean {
		return `${entry.name} ${entry.description ?? ""}`.toLowerCase().includes(query);
	}

	private _applyFilter(): void {
		const raw = this.searchEl?.value.trim() ?? "";
		const query = raw.toLowerCase();
		const entries = this.service.getEntries();
		const found = entries.filter((e) => this._matchesSearch(e, query));
		const shown = found.filter((e) => this.filter === "all" || e.engine === this.filter);
		for (const e of entries) this.rowEls.get(e.id)?.toggleClass("sf-hidden", !shown.includes(e));
		for (const f of FILTERS) {
			const n = f.key === "all" ? found.length : found.filter((e) => e.engine === f.key).length;
			const count = this.filterEls.get(f.key)?.querySelector(".sf-catalog-filter-count");
			if (count) count.textContent = String(n);
		}
		if (this.liveEl) this.liveEl.textContent = `${shown.length} of ${entries.length} collections`;
		this._renderNoMatch(shown.length === 0, raw);
		if (this.selected && !shown.includes(this.selected)) this._deselect();
		this._updateTabStops();
	}

	private _renderNoMatch(none: boolean, raw: string): void {
		if (!this.noMatchEl) return;
		this.noMatchEl.toggleClass("sf-hidden", !none);
		const label = FILTERS.find((f) => f.key === this.filter)?.label ?? "";
		this.noMatchEl.textContent = raw.length > 0 ? `No collections match "${raw}".` : `No ${label} collections.`;
	}

	// ---------------------------------------------------------------------------
	// List (left pane)
	// ---------------------------------------------------------------------------

	private _renderEmpty(split: HTMLElement): void {
		split.addClass("is-single");
		split.createEl("p", { text: "The repo has no collections yet.", cls: "sf-picker-empty sf-catalog-empty" });
	}

	private _renderPanes(split: HTMLElement, entries: CatalogEntry[]): void {
		this.listEl = split.createDiv({
			cls: "sf-catalog-list",
			attr: { role: "listbox", "aria-label": "Collections from the repo" },
		});
		for (const entry of entries) this._renderRow(this.listEl, entry);
		this.noMatchEl = this.listEl.createEl("p", { cls: "sf-picker-empty sf-catalog-nomatch sf-hidden" });
		this.detailEl = split.createDiv({ cls: "sf-catalog-preview" });
		this._renderPlaceholder();
		this._applyFilter();
	}

	private _renderRow(listEl: HTMLElement, entry: CatalogEntry): void {
		const row = listEl.createDiv({
			cls: "sf-catalog-row",
			attr: { role: "option", "aria-selected": "false", tabindex: "-1" },
		});
		row.createSpan({ cls: "sf-catalog-name", text: entry.name });
		this._renderStatus(row, entry);
		const line2 = row.createSpan({ cls: "sf-catalog-line2" });
		line2.createSpan({ cls: "sf-catalog-engine", text: ENGINE_LABEL[entry.engine] });
		line2.createSpan({ cls: "sf-catalog-desc", text: entry.description ?? "" });
		row.addEventListener("click", () => this._choose(entry));
		row.addEventListener("keydown", (e) => this._onRowKey(e, entry));
		this.rowEls.set(entry.id, row);
	}

	private _renderStatus(host: HTMLElement, entry: CatalogEntry): HTMLElement {
		const status = this._status(entry);
		return host.createSpan({ cls: STATUS_CLS[status], text: STATUS_TEXT[status] });
	}

	private _refreshRowStatus(entry: CatalogEntry): void {
		const old = this.rowEls.get(entry.id)?.querySelector(".sf-catalog-status");
		if (!old) return;
		const status = this._status(entry);
		old.className = STATUS_CLS[status].join(" ");
		old.textContent = STATUS_TEXT[status];
	}

	private _onRowKey(e: KeyboardEvent, entry: CatalogEntry): void {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			this._choose(entry);
		} else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
			e.preventDefault();
			this._moveFocus(entry, e.key === "ArrowDown" ? 1 : -1);
		}
	}

	/** Move focus to the next / previous visible row; selection follows focus when both panes show. */
	private _moveFocus(from: CatalogEntry, step: 1 | -1): void {
		const visible = this.service.getEntries().filter((e) => !this.rowEls.get(e.id)?.classList.contains("sf-hidden"));
		const next = visible[visible.indexOf(from) + step];
		if (!next) return;
		if (!this._isStacked()) this._select(next);
		this._updateTabStops(next);
		this.rowEls.get(next.id)?.focus();
	}

	/** Roving tabindex: one row in the Tab order — the selected one, else the given or first visible row. */
	private _updateTabStops(focusTarget?: CatalogEntry): void {
		const visible = this.service.getEntries().filter((e) => !this.rowEls.get(e.id)?.classList.contains("sf-hidden"));
		const stop = focusTarget ?? (this.selected && visible.includes(this.selected) ? this.selected : visible[0]);
		for (const [id, row] of this.rowEls) row.tabIndex = id === stop?.id ? 0 : -1;
	}

	// ---------------------------------------------------------------------------
	// Selection
	// ---------------------------------------------------------------------------

	/** A click, Enter or Space: select, and on the stacked layout open the detail screen. */
	private _choose(entry: CatalogEntry): void {
		this._select(entry);
		this.splitEl?.addClass("is-detail");
		this.contentEl.addClass("is-detail");
	}

	private _select(entry: CatalogEntry): void {
		this.selected = entry;
		for (const [id, row] of this.rowEls) {
			row.setAttribute("aria-selected", String(id === entry.id));
			row.toggleClass("is-selected", id === entry.id);
		}
		this._updateTabStops();
		this._renderDetail(entry, null);
	}

	private _deselect(): void {
		this.selected = null;
		for (const row of this.rowEls.values()) {
			row.setAttribute("aria-selected", "false");
			row.removeClass("is-selected");
		}
		this._back(false);
		this._renderPlaceholder();
	}

	/** "← All collections": back to the list, focus on the row you came from (L10h). */
	private _back(focusRow: boolean): void {
		this.splitEl?.removeClass("is-detail");
		this.contentEl.removeClass("is-detail");
		if (focusRow && this.selected) this.rowEls.get(this.selected.id)?.focus();
	}

	// ---------------------------------------------------------------------------
	// Detail (right pane)
	// ---------------------------------------------------------------------------

	private _renderPlaceholder(): void {
		const pane = this.detailEl;
		if (!pane) return;
		pane.empty();
		pane.removeAttribute("role");
		pane.removeAttribute("aria-labelledby");
		const empty = pane.createDiv({ cls: "sf-catalog-placeholder" });
		empty.createEl("b", { text: "Nothing selected" });
		empty.createSpan({ text: "Select a collection to see what it shows and where it goes." });
	}

	private _renderDetail(entry: CatalogEntry, feedback: Feedback | null): void {
		const pane = this.detailEl;
		if (!pane) return;
		pane.empty();
		const titleId = `sf-catalog-title-${entry.id}`;
		pane.setAttribute("role", "region");
		pane.setAttribute("aria-labelledby", titleId);
		// eslint-disable-next-line obsidianmd/ui/sentence-case -- mockup L10 text; the rule misreads the leading glyph
		const back = pane.createEl("button", { cls: "sf-catalog-back", text: "← All collections", attr: { type: "button" } });
		back.addEventListener("click", () => this._back(true));
		this._renderHead(pane, entry, titleId);
		const status = this._status(entry);
		this._renderDest(pane, entry, status);
		if (status !== "installed") this._renderBody(pane, entry, status);
		if (feedback) this._renderFeedback(pane, feedback);
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
		const dest = pane.createDiv({ cls: "sf-catalog-preview-dest" });
		const label = status === "installed" ? "Installed at" : status === "update" ? "Updates" : "Installs to";
		dest.createDiv({ cls: "sf-catalog-label", text: label });
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
		const q = pane.createDiv();
		q.createDiv({ cls: "sf-catalog-label", text: status === "update" ? "Query (new version)" : "Query" });
		q.createEl("pre", { cls: "sf-catalog-preview-src", text: queryOf(entry) });
		if (entry.engine === "dataviewjs") {
			const note = pane.createDiv({ cls: "sf-catalog-consent" });
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- mockup L10 text; the rule misreads the leading glyph
			note.createEl("strong", { text: "▲ Runs JavaScript." });
			note.appendText(" This collection runs code with full vault access. ");
			note.createEl("em", { text: "Review and install…" });
			note.appendText(" shows you its code first. Nothing is written until you enable it.");
		} else {
			pane.createDiv({ cls: "sf-catalog-safe", text: "Safe: declarative query, no code." });
		}
		const label = status === "update" ? "Update" : entry.engine === "dataviewjs" ? "Review and install…" : "Install";
		const btn = pane.createDiv({ cls: "sf-catalog-act" })
			.createEl("button", { cls: "mod-cta", text: label, attr: { type: "button" } });
		btn.addEventListener("click", () => void this._doInstall(entry, btn));
	}

	private _renderFeedback(pane: HTMLElement, fb: Feedback): HTMLElement {
		const el = pane.createDiv({
			cls: FEEDBACK_CLS[fb.tone],
			attr: { role: fb.tone === "error" ? "alert" : "status", tabindex: "-1" },
		});
		el.createSpan({ cls: "sf-catalog-feedback-text", text: fb.text });
		if (fb.raw !== undefined) el.createSpan({ cls: "sf-catalog-raw", text: fb.raw });
		return el;
	}

	private _renderDetails(pane: HTMLElement, entry: CatalogEntry): void {
		const box = pane.createDiv({ cls: "sf-catalog-preview-details" });
		const toggle = box.createEl("button", {
			cls: "sf-catalog-details-toggle",
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- mockup L10 text; the rule misreads the leading glyph
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

	private async _doInstall(entry: CatalogEntry, btn: HTMLButtonElement): Promise<void> {
		const update = this._status(entry) === "update";
		const path = this._pathOf(entry);
		btn.disabled = true;
		const result = await this.service.install(entry.id);
		if (result.ok) {
			this.installedNow.set(entry.id, result.path ?? path);
			this._refreshRowStatus(entry);
		}
		// The user moved on to another entry: its pane is not this result's place (the row still updated).
		if (this.selected?.id === entry.id) this._showResult(entry, result, update, path);
	}

	private _showResult(entry: CatalogEntry, result: InstallResult, update: boolean, path: string): void {
		if (result.ok) {
			const written = result.path ?? path;
			const text = update ? `Updated ${written}.` : `Installed to ${written}. It is in Library › Collections.`;
			this._renderDetail(entry, { text, tone: "success" });
			this.detailEl?.querySelector<HTMLElement>(".sf-picker-feedback")?.focus();
			return;
		}
		const note = describeRefusal(result.reason, path, update);
		this._renderDetail(entry, { text: note.text, ...(note.raw !== undefined ? { raw: note.raw } : {}), tone: note.tone });
		this.detailEl?.querySelector<HTMLButtonElement>(".sf-catalog-act button")?.focus();
	}
}
