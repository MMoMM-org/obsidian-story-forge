/**
 * BrowserList — the list | detail browser both Library modals share: the catalog browser
 * (`mockups-catalog.html` L10) and the vault import modal (`mockups-import.html` L11, which
 * inherits L10's Q1–Q3 without asking again).
 *
 * It owns what the two draw and do the same way, and nothing either modal decides itself:
 * - search plus engine filter, only above `SEARCH_THRESHOLD` items (Q2), with the live count and
 *   the no-match text;
 * - a `listbox` of rows with a roving tabindex, Enter / Space to choose, Up / Down to move, and
 *   selection following focus unless the panes are stacked (Q1);
 * - nothing selected on open, and the placeholder (Q3);
 * - the stacked layout below about 560px: `is-detail` and "← All collections";
 * - the detail pane frame (region, title id, back button) and the feedback line under an action.
 *
 * Rows and the detail body are drawn by the modal (`renderRow`, `renderDetail`), so each keeps its
 * own wording. Popout-safe: Obsidian element helpers and `activeWindow` only.
 */

import { FILTERS, filterEntries } from "catalog/catalogView";
import type { CatalogEngine, EngineCounts, EngineFilter, Filterable } from "catalog/catalogView";

/** Search and the engine filter show only above this many items (Q2). */
const SEARCH_THRESHOLD = 5;

/**
 * The widest content box that stacks the panes (Q1). The CSS rule is
 * `@container (max-width: 559px)` on `.sf-catalog`, whose query measures the content box.
 */
const STACK_MAX_WIDTH = 559;

const PLACEHOLDER = "Select a collection to see what it shows and where it goes.";

/** A segment of a fix line: plain text, or `{ code }` drawn as code (L11f). */
export type FixPart = string | { code: string };

/** A message in the detail pane: under the action, or (L11 R2) about the file itself. */
export interface Feedback {
	text: string;
	/** The raw reason, as a faint second line (L10 Q8). */
	raw?: string;
	/** How to fix it (L11 R6). */
	fix?: readonly FixPart[];
	tone: "success" | "error" | "neutral";
	/** "note" for a refusal that belongs to the file and is read with the pane (L11f). */
	role?: "note";
}

const FEEDBACK_CLS: Record<Feedback["tone"], string[]> = {
	success: ["sf-picker-feedback", "sf-catalog-success"],
	error: ["sf-picker-feedback"],
	neutral: ["sf-picker-feedback", "sf-catalog-neutral"],
};

/** Draw `fb` into `pane`: role alert for an error, status for success / neutral, unless overridden. */
export function renderFeedback(pane: HTMLElement, fb: Feedback): void {
	const role = fb.role ?? (fb.tone === "error" ? "alert" : "status");
	const el = pane.createDiv({ cls: FEEDBACK_CLS[fb.tone], attr: { role, tabindex: "-1" } });
	el.createSpan({ cls: "sf-catalog-feedback-text", text: fb.text });
	if (fb.raw !== undefined) el.createSpan({ cls: "sf-catalog-raw", text: fb.raw });
	if (fb.fix !== undefined) renderFix(el.createDiv({ cls: "sf-import-fix" }), fb.fix);
}

function renderFix(host: HTMLElement, parts: readonly FixPart[]): void {
	for (const part of parts) {
		if (typeof part === "string") host.appendText(part);
		else host.createEl("code", { text: part.code });
	}
}

/** A labelled block in the detail pane: "Installs to", "Source file", "Shows in", "Query"… */
export function renderLabelled(pane: HTMLElement, label: string, cls?: string): HTMLElement {
	const block = pane.createDiv(cls !== undefined ? { cls } : {});
	block.createDiv({ cls: "sf-catalog-label", text: label });
	return block;
}

export interface BrowserListOptions<T> {
	/** A stable key per item (catalog id, vault path). */
	keyOf: (item: T) => string;
	/** The listbox's accessible name. */
	listLabel: string;
	/** Prefix of the detail title's element id. */
	titleIdPrefix: string;
	/** Fill a row (it arrives empty, already a focusable `option`). */
	renderRow: (row: HTMLElement, item: T) => void;
	/** Fill the detail pane below the back button; `titleId` names the region. */
	renderDetail: (pane: HTMLElement, item: T, titleId: string, feedback: Feedback | null) => void;
}

/**
 * The list | detail browser over `items` (shown in the given order), mounted into `host` (the
 * modal's content, which carries `.sf-catalog` and its container query).
 */
export class BrowserList<T extends Filterable<CatalogEngine>> {
	private splitEl: HTMLElement | null = null;
	private listEl: HTMLElement | null = null;
	private paneEl: HTMLElement | null = null;
	private searchEl: HTMLInputElement | null = null;
	private liveEl: HTMLElement | null = null;
	private noMatchEl: HTMLElement | null = null;
	private rowEls = new Map<string, HTMLElement>();
	private filterEls = new Map<EngineFilter<CatalogEngine>, HTMLButtonElement>();
	private filter: EngineFilter<CatalogEngine> = "all";
	private shown: readonly T[] = [];
	selected: T | null = null;

	constructor(
		private readonly host: HTMLElement,
		private readonly items: readonly T[],
		private readonly opts: BrowserListOptions<T>,
	) {}

	/** The detail pane (null before `mount`). */
	get pane(): HTMLElement | null {
		return this.paneEl;
	}

	/** Draw the tools (above the threshold), the list and the placeholder pane. */
	mount(): void {
		if (this.items.length > SEARCH_THRESHOLD) this._renderTools();
		this.splitEl = this.host.createDiv({ cls: "sf-catalog-split" });
		this.listEl = this.splitEl.createDiv({ cls: "sf-catalog-list", attr: { role: "listbox", "aria-label": this.opts.listLabel } });
		for (const item of this.items) this._renderRow(item);
		this.noMatchEl = this.listEl.createEl("p", { cls: "sf-picker-empty sf-catalog-nomatch" });
		this.noMatchEl.hide();
		this.paneEl = this.splitEl.createDiv({ cls: "sf-catalog-preview" });
		this._renderPlaceholder();
		this._applyFilter();
	}

	/** Focus where the keyboard starts (Q3): the search field, else the first row, else `fallback`. */
	focusStart(fallback: HTMLElement): void {
		const first = this.listEl?.querySelector<HTMLElement>(".sf-catalog-row");
		(this.searchEl ?? first ?? fallback).focus();
	}

	/** Redraw one row (its status changed). */
	repaintRow(item: T): void {
		const row = this.rowEls.get(this.opts.keyOf(item));
		if (!row) return;
		row.empty();
		this.opts.renderRow(row, item);
	}

	/** Redraw the detail pane for `item`, with an optional message. */
	showDetail(item: T, feedback: Feedback | null): void {
		const pane = this.paneEl;
		if (!pane) return;
		pane.empty();
		const titleId = `${this.opts.titleIdPrefix}-${this.opts.keyOf(item)}`;
		pane.setAttribute("role", "region");
		pane.setAttribute("aria-labelledby", titleId);
		const back = pane.createEl("button", { cls: "sf-catalog-back", text: "← All collections", attr: { type: "button" } });
		back.addEventListener("click", () => this._back(true));
		this.opts.renderDetail(pane, item, titleId, feedback);
	}

	/** Is `item` the one on show? */
	isSelected(item: T): boolean {
		return this.selected !== null && this.opts.keyOf(this.selected) === this.opts.keyOf(item);
	}

	/** Do the panes stack? Measured on the host's content box, as its `@container` rule is. */
	isStacked(): boolean {
		const el = this.host;
		if (el.clientWidth === 0) return false; // Not laid out (or not in a window): treat as wide.
		const style = activeWindow.getComputedStyle(el);
		const padding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
		return el.clientWidth - padding <= STACK_MAX_WIDTH;
	}

	// ---------------------------------------------------------------------------
	// Search + engine filter (Q2)
	// ---------------------------------------------------------------------------

	private _renderTools(): void {
		const tools = this.host.createDiv({ cls: "sf-catalog-tools" });
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
		this.liveEl = this.host.createDiv({ cls: "sf-lb-sr sf-catalog-live", attr: { "aria-live": "polite" } });
	}

	private _setFilter(key: EngineFilter<CatalogEngine>): void {
		this.filter = key;
		for (const [k, btn] of this.filterEls) btn.setAttribute("aria-checked", String(k === key));
		this._applyFilter();
	}

	private _applyFilter(): void {
		const raw = this.searchEl?.value.trim() ?? "";
		const result = filterEntries(this.items, raw, this.filter);
		const shown = result.shown;
		// T's engine is one of CatalogEngine (the class bound), so its counts are keyed within it.
		const counts = result.counts as EngineCounts<CatalogEngine>;
		this.shown = shown;
		for (const item of this.items) this._rowOf(item)?.toggle(shown.includes(item));
		for (const f of FILTERS) {
			const count = this.filterEls.get(f.key)?.querySelector(".sf-catalog-filter-count");
			if (count) count.textContent = String(counts[f.key] ?? 0);
		}
		if (this.liveEl) this.liveEl.textContent = `${shown.length} of ${this.items.length} collections`;
		this._renderNoMatch(shown.length === 0, raw);
		if (this.selected && !shown.includes(this.selected)) this._deselect();
		this._updateTabStops();
	}

	private _renderNoMatch(none: boolean, raw: string): void {
		if (!this.noMatchEl) return;
		this.noMatchEl.toggle(none);
		const label = FILTERS.find((f) => f.key === this.filter)?.label ?? "";
		this.noMatchEl.textContent = raw.length > 0 ? `No collections match "${raw}".` : `No ${label} collections.`;
	}

	// ---------------------------------------------------------------------------
	// Rows, keyboard, selection
	// ---------------------------------------------------------------------------

	private _rowOf(item: T): HTMLElement | undefined {
		return this.rowEls.get(this.opts.keyOf(item));
	}

	private _renderRow(item: T): void {
		const row = this.listEl!.createDiv({
			cls: "sf-catalog-row",
			attr: { role: "option", "aria-selected": "false", tabindex: "-1" },
		});
		this.opts.renderRow(row, item);
		row.addEventListener("click", () => this._choose(item));
		row.addEventListener("keydown", (e) => this._onRowKey(e, item));
		this.rowEls.set(this.opts.keyOf(item), row);
	}

	private _onRowKey(e: KeyboardEvent, item: T): void {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			this._choose(item);
		} else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
			e.preventDefault();
			this._moveFocus(item, e.key === "ArrowDown" ? 1 : -1);
		}
	}

	/** Move focus to the next / previous visible row; selection follows focus when both panes show. */
	private _moveFocus(from: T, step: 1 | -1): void {
		const next = this.shown[this.shown.indexOf(from) + step];
		if (!next) return;
		if (!this.isStacked()) this._select(next);
		this._updateTabStops(next);
		this._rowOf(next)?.focus();
	}

	/** Roving tabindex: one row in the Tab order — the given one, else the selected, else the first shown. */
	private _updateTabStops(focusTarget?: T): void {
		const stop = focusTarget ?? (this.selected && this.shown.includes(this.selected) ? this.selected : this.shown[0]);
		const stopKey = stop !== undefined ? this.opts.keyOf(stop) : null;
		for (const [key, row] of this.rowEls) row.tabIndex = key === stopKey ? 0 : -1;
	}

	/** A click, Enter or Space: select, and on the stacked layout open the detail screen. */
	private _choose(item: T): void {
		this._select(item);
		this.splitEl?.addClass("is-detail");
		this.host.addClass("is-detail");
	}

	private _select(item: T): void {
		this.selected = item;
		const key = this.opts.keyOf(item);
		for (const [k, row] of this.rowEls) {
			row.setAttribute("aria-selected", String(k === key));
			row.toggleClass("is-selected", k === key);
		}
		this._updateTabStops();
		this.showDetail(item, null);
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

	/** "← All collections": back to the list, focus on the row you came from (L10h / L11h). */
	private _back(focusRow: boolean): void {
		this.splitEl?.removeClass("is-detail");
		this.host.removeClass("is-detail");
		if (focusRow && this.selected) this._rowOf(this.selected)?.focus();
	}

	private _renderPlaceholder(): void {
		const pane = this.paneEl;
		if (!pane) return;
		pane.empty();
		pane.removeAttribute("role");
		pane.removeAttribute("aria-labelledby");
		const empty = pane.createDiv({ cls: "sf-catalog-placeholder" });
		empty.createEl("b", { text: "Nothing selected" });
		empty.createSpan({ text: PLACEHOLDER });
	}
}
