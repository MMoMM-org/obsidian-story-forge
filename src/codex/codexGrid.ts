/**
 * codexGrid — pure-DOM grid builder for Codex category views.
 *
 * CON-3 FIREWALL: This module has ZERO Bases typings. It accepts only plain
 * data (category string + CodexRow[]) and renders a DOM grid. All mapping
 * from BasesEntry → CodexRow happens in CodexBasesView (src/bases/).
 *
 * Columns come from kindFields for the given category. Rows are stamped with
 * `data-path` so click delegation can resolve the target file path. The grid
 * is read-only — no <input>, <select>, or contenteditable.
 *
 * Uses `activeDocument` (Obsidian's popout-window-aware document reference)
 * so element creation works correctly when the view is in a popout window.
 *
 * @ref SDD/CON-3   — no Bases typings outside src/bases/
 * @ref SDD/CON-4   — container emptied by caller before buildCodexGrid is called
 * @ref PRD/AC-F2.1 — category grid renders
 * @ref PRD/AC-F2.3 — empty-state shown (S45)
 * @ref PRD/AC-F2.4 — read-only
 */

import { kindFields } from "panel/kindFields";
import type { EntityKind } from "scoping/NoteContext";
import { isEntityKind } from "scoping/NoteContext";

// Obsidian's popout-window-aware document — the mock polyfills this to
// globalThis.document in jsdom test environments (see test/__mocks__/obsidian.ts).
declare const activeDocument: Document;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A single plain row record passed to buildCodexGrid. No Bases typings. */
export interface CodexRow {
	/** Vault-relative file path mapped from the source entry by the caller. */
	path: string;
	/** Display field values keyed by property ID (plain scalars or null). */
	fields: Record<string, unknown>;
}

export interface CodexGridOptions {
	/** Entity kind determining which columns to show. */
	category: string;
	/** Plain rows — no upstream typing references here. */
	rows: CodexRow[];
	/** Called with the file path when a row is clicked. */
	onRowClick: (path: string) => void;
}

// ---------------------------------------------------------------------------
// Empty-state messages per category (S45 spec)
// ---------------------------------------------------------------------------

const EMPTY_MESSAGES: Record<EntityKind, string> = {
	character: "No characters found in this base.",
	location: "No locations found in this base.",
	object: "No objects found in this base.",
	lore: "No lore entries found in this base.",
	scene: "No scenes found in this base.",
	plotline: "No plotlines found in this base.",
	book: "No books found in this base.",
	unknown: "No entries found in this base.",
};

function emptyMessage(category: string): string {
	if (isEntityKind(category)) {
		return EMPTY_MESSAGES[category];
	}
	return "No entries found in this base.";
}

/**
 * Safely convert a field value to a display string.
 * Avoids [object Object] for non-scalar values.
 */
function toDisplayString(value: unknown): string {
	if (value === null || value === undefined) return "";
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	// For arrays or objects, use JSON (better than "[object Object]")
	try {
		return JSON.stringify(value);
	} catch {
		return "";
	}
}

// ---------------------------------------------------------------------------
// Grid builder
// ---------------------------------------------------------------------------

/**
 * Build a read-only category grid into `container`.
 *
 * Callers must empty `container` before calling this function (CON-4).
 * A single delegated click listener is added to `container`; it resolves
 * the nearest `[data-path]` ancestor and calls `onRowClick(path)`.
 */
export function buildCodexGrid(container: HTMLElement, opts: CodexGridOptions): void {
	const { category, rows, onRowClick } = opts;

	const safeKind: EntityKind = isEntityKind(category) ? category : "unknown";
	const { facts, relations } = kindFields(safeKind);
	const columns = [...facts, ...relations];

	if (rows.length === 0) {
		renderEmptyState(container, category);
		return;
	}

	renderHeader(container, columns);
	renderRows(container, rows, columns);

	// Single delegated click listener on the container.
	container.addEventListener("click", (evt) => {
		const target = evt.target as HTMLElement | null;
		const rowEl = target?.closest("[data-path]") as HTMLElement | null;
		if (!rowEl) return;
		const path = rowEl.getAttribute("data-path");
		if (path) onRowClick(path);
	});
}

// ---------------------------------------------------------------------------
// Private rendering helpers
// ---------------------------------------------------------------------------

function renderEmptyState(container: HTMLElement, category: string): void {
	const emptyEl = activeDocument.createElement("div");
	emptyEl.setAttribute("data-empty-state", category);
	emptyEl.className = "sf-codex-empty";
	emptyEl.textContent = emptyMessage(category);
	container.appendChild(emptyEl);
}

function renderHeader(container: HTMLElement, columns: string[]): void {
	const headerEl = activeDocument.createElement("div");
	headerEl.className = "sf-codex-header";
	for (const col of columns) {
		const cell = activeDocument.createElement("div");
		cell.className = "sf-codex-header-cell";
		cell.setAttribute("data-column-id", col);
		cell.textContent = col;
		headerEl.appendChild(cell);
	}
	container.appendChild(headerEl);
}

function renderRows(container: HTMLElement, rows: CodexRow[], columns: string[]): void {
	for (const row of rows) {
		const rowEl = activeDocument.createElement("div");
		rowEl.className = "sf-codex-row";
		rowEl.setAttribute("data-path", row.path);

		for (const col of columns) {
			const cell = activeDocument.createElement("div");
			cell.className = "sf-codex-cell";
			cell.setAttribute("data-cell", col);
			cell.textContent = toDisplayString(row.fields[col]);
			rowEl.appendChild(cell);
		}

		container.appendChild(rowEl);
	}
}
