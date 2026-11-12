/**
 * libraryPanels — the inline "configure" panel of a Library collection row
 * (spec 008 T7.1b; mockups-library.html L3a built-in, L3b imported or from-repo .base,
 * L3c Dataview entry; proposals P10, P12).
 *
 * One panel under its row, the same pattern for all three provenances. The panels hold no
 * state of their own: every edit writes through the stores and asks the host to repaint.
 */

import type { App } from "obsidian";
import type { ConsentDecision, ConsentGate } from "consent/ConsentGate";
import { resolveCollection, type IndexedNote } from "codex/collectionResolver";
import type { CollectionStore, LibraryCollection } from "library/collectionStore";
import type { ViewStore } from "store/ViewStore";
import type { ViewRecord } from "store/types";

/** A collection row together with what the panel needs beyond the store's view of it. */
export interface RowModel {
	readonly c: LibraryCollection;
	/** Absent for a built-in. */
	readonly record?: ViewRecord;
	/** The consent decision of the enabled projection; absent for a built-in. */
	readonly decision?: ConsentDecision["status"];
}

export interface PanelHost {
	readonly app: App;
	readonly collections: CollectionStore;
	readonly views: ViewStore;
	readonly gate: ConsentGate;
	notes(): readonly IndexedNote[];
	/** Scope's excluded folders, the default a built-in follows while "Same as Scope" is on. */
	scopeFolders(): readonly string[];
	registerCommand(id: string, name: string): void;
	removeCommand(id: string): void;
	/** Repaint after a write; `focus` names the control that should keep focus. */
	done(focus?: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Small builders
// ---------------------------------------------------------------------------

function field(panel: HTMLElement, label: string): HTMLElement {
	panel.createEl("label", { text: label });
	return panel.createDiv({ cls: "sf-lb-cell" });
}

function textInput(
	cell: HTMLElement,
	ariaLabel: string,
	value: string,
	onCommit: ((value: string) => void) | null,
	focusKey?: string,
): HTMLInputElement {
	const input = cell.createEl("input", { cls: "sf-lb-input", attr: { type: "text", "aria-label": ariaLabel } });
	input.value = value;
	if (focusKey) input.dataset["focus"] = focusKey;
	if (onCommit === null) {
		input.readOnly = true;
		return input;
	}
	// The last committed value: a repaint is held back while the field differs from it.
	input.dataset["committed"] = value;
	input.addEventListener("change", () => {
		input.dataset["committed"] = input.value;
		onCommit(input.value);
	});
	return input;
}

function toggleButton(cell: HTMLElement, label: string, on: boolean, focusKey: string, onToggle: () => void): HTMLButtonElement {
	const sw = cell.createEl("button", {
		cls: on ? "sf-lb-sw is-on" : "sf-lb-sw",
		attr: { type: "button", role: "switch", "aria-checked": String(on), "data-focus": focusKey },
	});
	sw.createEl("i");
	sw.appendText(label);
	sw.addEventListener("click", onToggle);
	return sw;
}

function actionButton(cell: HTMLElement, label: string, focusKey: string, onClick: () => void, cta = false): void {
	const b = cell.createEl("button", {
		cls: cta ? "sf-lb-btn mod-cta" : "sf-lb-btn",
		text: label,
		attr: { type: "button", "data-focus": focusKey },
	});
	b.addEventListener("click", onClick);
}

const splitFolders = (value: string): string[] =>
	value.split(",").map((s) => s.trim()).filter((s) => s.length > 0);

// ---------------------------------------------------------------------------
// L3a — a built-in
// ---------------------------------------------------------------------------

/** P10: "3 notes match: tagged canon/character, outside 00 Meta." */
function countLine(c: LibraryCollection, notes: readonly IndexedNote[]): { text: string; warn: boolean } {
	const res = resolveCollection(c.id, { [c.id]: { tag: c.tag } }, { excludedFolders: c.excludedFolders }, notes);
	if (res.status === "misconfigured") return { text: res.reason, warn: true };
	const n = res.notes.length;
	if (n === 0) return { text: "No notes match this tag.", warn: true };
	const outside = c.excludedFolders.length > 0 ? `, outside ${c.excludedFolders.join(", ")}` : "";
	return { text: `${n} ${n === 1 ? "note matches" : "notes match"}: tagged ${c.tag}${outside}.`, warn: false };
}

function renderCount(panel: HTMLElement, line: { text: string; warn: boolean }): void {
	panel.createSpan();
	panel.createDiv({ cls: line.warn ? "sf-lb-count is-warn" : "sf-lb-count", text: line.text });
}

function renderFolders(panel: HTMLElement, c: LibraryCollection, h: PanelHost): void {
	const cell = field(panel, "Excluded folders");
	const same = cell.createEl("label", { cls: "sf-lb-check" });
	const box = same.createEl("input", { attr: { type: "checkbox", "data-focus": `same:${c.id}` } });
	box.checked = c.sameAsScope;
	same.appendText(`Same as Scope (${h.scopeFolders().join(", ") || "none"})`);
	box.addEventListener("change", () => {
		const patch = { excludedFolders: box.checked ? null : [...c.excludedFolders] };
		void h.collections.configureBuiltIn(c.id, patch).then(() => h.done());
	});
	if (c.sameAsScope) return;
	textInput(cell, `Excluded folders for ${c.label}`, c.excludedFolders.join(", "), (v) => {
		void h.collections.configureBuiltIn(c.id, { excludedFolders: splitFolders(v) }).then(() => h.done());
	}, `folders:${c.id}`);
}

function renderBuiltIn(panel: HTMLElement, m: RowModel, h: PanelHost): void {
	const { c } = m;
	textInput(field(panel, "Tag"), `Tag for ${c.label}`, c.tag, (v) => {
		void h.collections.configureBuiltIn(c.id, { tag: v }).then(() => h.done());
	}, `tag:${c.id}`);
	renderFolders(panel, c, h);
	renderCount(panel, countLine(c, h.notes()));
	panel.createDiv({
		cls: "sf-lb-desc full",
		text: "Selection is by tag; folders only ever exclude. A built-in can be disabled but not removed or renamed.",
	});
}

// ---------------------------------------------------------------------------
// L3b / L3c — records
// ---------------------------------------------------------------------------

async function rename(m: RowModel, h: PanelHost, value: string): Promise<void> {
	if (!m.record) return;
	const next: ViewRecord = { ...m.record };
	const name = value.trim();
	if (name) next.commandName = name;
	else delete next.commandName;
	await h.views.setRecord(m.c.id, next);
	await h.done();
}

function renderFile(panel: HTMLElement, m: RowModel, h: PanelHost, label: string): void {
	const source = m.record?.source ?? "";
	const cell = field(panel, label);
	cell.addClass("sf-lb-filecell");
	cell.createDiv({ cls: "sf-lb-file", text: source });
	actionButton(cell, "Open file", `open:${m.c.id}`, () => { void h.app.workspace.openLinkText(source, "", true); });
}

/** The generated template's parameters, shown read-only: changing them regenerates the file (T7.3). */
function renderParams(panel: HTMLElement, record: ViewRecord): void {
	const params = record.generated?.params;
	if (!params) return;
	textInput(field(panel, "Tag"), "Tag", params.tag, null);
	textInput(field(panel, "Excluded folders"), "Excluded folders", params.excludedFolders.join(", "), null);
}

function renderBases(panel: HTMLElement, m: RowModel, h: PanelHost, record: ViewRecord): void {
	renderFile(panel, m, h, "File");
	renderParams(panel, record);
	const found = Boolean(h.app.vault.getFileByPath(record.source));
	renderCount(panel, found
		? { text: "File found · read from the file on every render", warn: false }
		: { text: `File not found: ${record.source}`, warn: true });
	panel.createDiv({
		cls: "sf-lb-desc full",
		text: "What it shows is decided by the file: edit it in Bases. Story Forge reads it and never changes it. " +
			"Its filters are used; its own views are not.",
	});
}

async function setCommand(m: RowModel, h: PanelHost, on: boolean, label?: string): Promise<void> {
	const record = m.record;
	if (!record) return;
	const name = label ?? record.commandLabel ?? m.c.label;
	const next: ViewRecord = on ? { ...record, command: true, commandLabel: name } : { ...record, command: false };
	await h.views.setRecord(m.c.id, next);
	// removeCommand is idempotent: always clear first so a stale registration cannot linger.
	h.removeCommand(m.c.id);
	if (on) h.registerCommand(m.c.id, name);
	await h.done();
}

function renderCommand(panel: HTMLElement, m: RowModel, h: PanelHost, record: ViewRecord): void {
	const cell = field(panel, "Command");
	toggleButton(cell, "Add to command palette", record.command, `cmd:${m.c.id}`, () => { void setCommand(m, h, !record.command); });
	if (!record.command) return;
	textInput(cell, "Command name", record.commandLabel ?? m.c.label, (v) => { void setCommand(m, h, true, v.trim() || m.c.label); }, `cmdname:${m.c.id}`);
}

function consentLine(record: ViewRecord, decision: ConsentDecision["status"] | undefined): string {
	if (record.okayed === null) return "You have not approved this script yet.";
	if (decision === "drift") return `The script changed since you approved v${record.okayed.version}.`;
	return `Approved v${record.okayed.version}.`;
}

function renderConsent(panel: HTMLElement, m: RowModel, h: PanelHost, record: ViewRecord): void {
	const cell = field(panel, "Consent");
	cell.createSpan({ cls: "sf-lb-consent", text: consentLine(record, m.decision) });
	actionButton(cell, "Review consent…", `consent:${m.c.id}`, () => {
		const ask = record.okayed === null ? h.gate.requestConsent(m.c.id, record) : h.gate.requestReConsent(m.c.id, record);
		void ask.then(() => h.done()).catch((err: unknown) => console.error("[StoryForge] consent review failed", err));
	}, true);
}

function renderDataview(panel: HTMLElement, m: RowModel, h: PanelHost, record: ViewRecord): void {
	renderFile(panel, m, h, "Source");
	if (record.engine === "dataviewjs") renderConsent(panel, m, h, record);
	renderCommand(panel, m, h, record);
	const block = record.engine === "dataviewjs" ? "dataviewjs" : "dataview";
	panel.createDiv({
		cls: "sf-lb-desc full",
		text: `Runs the first ${block} block in the source note. Edit the note to change the query.`,
	});
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/** Build the panel for `m` as the next child of `parent`; returns it so the caller can name it. */
export function renderPanel(parent: HTMLElement, m: RowModel, h: PanelHost, panelId: string): HTMLElement {
	const panel = parent.createDiv({
		cls: "sf-lb-panel",
		attr: { id: panelId, role: "region", "aria-label": `Configure ${m.c.label}` },
	});
	const { record } = m;
	if (!record) {
		renderBuiltIn(panel, m, h);
		return panel;
	}
	textInput(field(panel, "Name"), "Name", m.c.label, (v) => { void rename(m, h, v); }, `name:${m.c.id}`);
	if (record.engine === "bases") renderBases(panel, m, h, record);
	else renderDataview(panel, m, h, record);
	return panel;
}
