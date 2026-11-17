/**
 * LibrarySection — Library › Collections (spec 008 T7.1b; mockups-library.html L2, L8a, L9
 * and proposals P1, P4, P11, P13, P16, P17).
 *
 * One row per collection from `CollectionStore`: enable checkbox (the master), two surface
 * switches (kept while the checkbox is off), provenance and engine badges, a status badge only
 * when something blocks the entry, `configure` and, for non-built-ins, `remove`. A bare click
 * never destroys anything: `remove` opens an inline confirmation, and only its own button writes.
 *
 * The section owns the UI state that must outlive a repaint (open panels, the pending removal,
 * which control to refocus). Everything else is read fresh from the stores on every paint.
 */

import { Notice, type App } from "obsidian";
import type { ConsentDecision, ConsentGate } from "consent/ConsentGate";
import type { IndexedNote } from "codex/collectionResolver";
import type { CollectionStore, LibraryCollection, Outcome, Surface } from "library/collectionStore";
import type { ViewStore } from "store/ViewStore";
import type { ViewRecord } from "store/types";
import { renderPanel, type PanelHost, type RowModel } from "./libraryPanels";
import { ENGINE_LABEL, PROVENANCE_LABEL, focusByKey, focusedKey, paintAddRow } from "./libraryShared";

export interface LibrarySectionDeps {
	readonly app: App;
	readonly collections: CollectionStore;
	readonly views: ViewStore;
	readonly gate: ConsentGate;
	readonly notes: () => readonly IndexedNote[];
	/** Scope's excluded folders, read fresh. */
	readonly scopeFolders: () => readonly string[];
	readonly registerCommand: (id: string, name: string) => void;
	readonly removeCommand: (id: string) => void;
	/** Opens today's import picker. */
	readonly importFromVault: () => void;
	/** "+ Browse repo…": opens the catalog (T7.2). Absent, the button is the disabled control. */
	readonly browseRepo?: () => void;
	/** "What optional plugins add…" in a Dataview row's cause (T7.4 S5). Absent: the link does nothing. */
	readonly openCapabilities?: () => void;
}

type Decision = ConsentDecision["status"];

/** P11: what blocks an entry, in the words of the old blocked-reason row ("view" became "collection"). */
interface Block {
	readonly badge: string;
	readonly warn: boolean;
	readonly hint: string | null;
}

function blockOf(record: ViewRecord | undefined, decision: Decision | undefined): Block | null {
	if (!record || !decision) return null;
	switch (decision) {
		// T7.4 S5 (L12e(b)): a cause in neutral grey, not a warning; the hint links the capability screen.
		// T8.2: the cause names the engine the record needs; a `.base` is never blamed on Dataview.
		case "engine-missing": return { badge: record.engine === "bases" ? "○ Needs Bases" : "○ Needs Dataview", warn: false, hint: null };
		case "dvjs-off": return { badge: "○ DataviewJS disabled", warn: false, hint: "DataviewJS is disabled in Dataview settings." };
		case "platform-restricted": return { badge: "○ Not available on mobile", warn: false, hint: "Not available on mobile." };
		case "drift":
		case "not-consented":
			// Consent is a DataviewJS gate; Bases and DQL are enable/disable only (PRD F7).
			return record.engine === "dataviewjs" ? { badge: "▲ Consent required", warn: true, hint: null } : null;
		default: return null;
	}
}

const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

function surfaceNames(flags: { anvil: boolean; workbench: boolean }): string {
	if (flags.anvil && flags.workbench) return "the Anvil and the Workbench";
	return flags.anvil ? "the Anvil" : flags.workbench ? "the Workbench" : "";
}

export class LibrarySection {
	private host: HTMLElement | null = null;
	private gen = 0;
	private readonly open = new Set<string>();
	private confirming: string | null = null;
	private pendingFocus: string | null = null;
	/** A repaint was held back because an input in the list holds an unsaved edit. */
	private deferred = false;
	/** Focus left a held field for a control in the list; its click has not arrived yet. */
	private awaitingClick = false;
	/** Row order of the last paint: where focus goes after a removal. */
	private order: string[] = [];

	constructor(private readonly d: LibrarySectionDeps) {}

	// --- public --------------------------------------------------------------

	/** Expand a collection's panel and, once painted, focus its tag field (the S98 deep link). */
	expand(id: string): void {
		this.open.add(id);
		this.pendingFocus = `tag:${id}`;
	}

	/** Paint into `host` and remember it, so later writes can repaint the same place. */
	async render(host: HTMLElement): Promise<void> {
		this.host = host;
		// A held-back repaint runs once the edit is committed or abandoned.
		host.addEventListener("focusout", (e) => this.onFocusOut(e, host));
		// Focus moved onto a control in the list: let its click finish before repainting under it.
		host.addEventListener("click", () => {
			if (this.awaitingClick) window.setTimeout(() => this.flushDeferred(), 0);
		});
		await this.refresh();
	}

	private onFocusOut(e: FocusEvent, host: HTMLElement): void {
		if (!this.deferred) return;
		const to = e.relatedTarget;
		const staysInside = to instanceof Node && host.contains(to);
		// A mouse press moves focus to its button first and clicks later; repainting now would
		// destroy the button before the click lands. A second move inside the list is a keyboard one.
		if (staysInside && !this.awaitingClick) {
			this.awaitingClick = true;
			return;
		}
		this.flushDeferred();
	}

	private flushDeferred(): void {
		this.awaitingClick = false;
		if (!this.deferred) return;
		this.deferred = false;
		void this.refresh();
	}

	/** Drop any read still in flight: the tab was hidden, so nothing may paint after this. */
	suspend(): void {
		this.gen++;
	}

	async refresh(): Promise<void> {
		const host = this.host;
		if (!host) return;
		const gen = ++this.gen;
		const [list, views, notice] = await Promise.all([
			this.d.collections.collections(),
			this.d.views.getViews(),
			this.d.collections.migrationNotice(),
		]);
		const rows = await Promise.all(list.map((c) => this.modelOf(c, views[c.id])));
		// A newer paint superseded this one while it was reading: do not paint stale rows.
		if (gen !== this.gen) return;
		// A half-typed value is not data the stores know yet: repainting would wipe it.
		if (this.hasUnsavedInput(host)) {
			this.deferred = true;
			return;
		}
		this.paint(host, rows, notice);
	}

	// --- model ---------------------------------------------------------------

	private async modelOf(c: LibraryCollection, record: ViewRecord | undefined): Promise<RowModel> {
		if (c.provenance === "built-in" || !record) return { c };
		return { c, record, decision: await this.decide(record) };
	}

	/** The consent state the record WOULD have if enabled, so a disabled row still shows what blocks it. */
	private async decide(record: ViewRecord): Promise<Decision> {
		try {
			return (await this.d.gate.evaluate({ ...record, enabled: true })).status;
		} catch (err) {
			console.error("[StoryForge] could not evaluate a collection", err);
			return "not-consented";
		}
	}

	// --- paint ---------------------------------------------------------------

	private paint(host: HTMLElement, rows: RowModel[], notice: { moved: number } | null): void {
		// Whatever has focus now keeps it across the repaint (a panel field tabbed out of, say).
		this.pendingFocus ??= focusedKey(host);
		host.empty();
		this.order = rows.map((r) => r.c.id);
		if (notice) this.paintNotice(host, notice.moved);
		for (const row of rows) this.paintItem(host, row);
		this.paintAdd(host);
		this.applyFocus(host);
	}

	private paintNotice(host: HTMLElement, moved: number): void {
		const line = host.createDiv({ cls: "sf-lb-mig", attr: { role: "status" } });
		const msg = line.createSpan();
		msg.createEl("b", { text: "Your views are now collections." });
		msg.appendText(moved === 1
			? " 1 view moved here as an imported collection and still shows in the Workbench."
			: ` ${moved} views moved here as imported collections and still show in the Workbench.`);
		const x = line.createEl("button", { cls: "sf-lb-x", text: "✕", attr: { type: "button", "aria-label": "Dismiss" } });
		x.addEventListener("click", () => { void this.d.collections.dismissMigrationNotice().then(() => this.refresh()); });
	}

	private paintItem(host: HTMLElement, m: RowModel): void {
		const { c } = m;
		const item = host.createDiv({ cls: c.enabled ? "sf-lb-item" : "sf-lb-item is-off", attr: { "data-collection-id": c.id } });
		this.paintRow(item, m);
		this.paintHint(item, m);
		if (this.open.has(c.id)) renderPanel(item, m, this.panelHost(), `sf-lb-panel-${c.id}`);
		if (this.confirming === c.id) this.paintConfirm(item, m);
	}

	private paintRow(item: HTMLElement, m: RowModel): void {
		const { c } = m;
		const row = item.createDiv({ cls: "sf-lb-row" });
		this.paintCheckbox(row, m);
		row.createSpan({ cls: "sf-lb-name", text: c.label });
		row.createSpan({ cls: c.provenance === "built-in" ? "sf-lb-prov is-builtin" : "sf-lb-prov", text: PROVENANCE_LABEL[c.provenance] });
		if (c.engine) row.createSpan({ cls: "sf-lb-eng", text: ENGINE_LABEL[c.engine] });
		const block = blockOf(m.record, m.decision);
		if (block) row.createSpan({ cls: block.warn ? "sf-lb-stat is-warn" : "sf-lb-stat", text: block.badge });
		row.createSpan({ cls: "sf-lb-break" });
		this.paintSwitches(row, c);
		this.paintActions(row, c);
	}

	private paintCheckbox(row: HTMLElement, m: RowModel): void {
		const box = row.createEl("input", {
			cls: "sf-lb-cb",
			attr: { type: "checkbox", "aria-label": `Enable ${m.c.label}`, "data-focus": `cb:${m.c.id}` },
		});
		box.checked = m.c.enabled;
		box.addEventListener("change", () => { void this.onEnable(m, box.checked); });
	}

	private paintSwitches(row: HTMLElement, c: LibraryCollection): void {
		const group = row.createSpan({ cls: "sf-lb-surf" });
		const defs: Array<[Surface, string]> = [["anvil", "Anvil"], ["workbench", "Workbench"]];
		for (const [surface, name] of defs) {
			const on = c.surfaces[surface];
			const sw = group.createEl("button", {
				cls: on ? "sf-lb-sw is-on" : "sf-lb-sw",
				attr: {
					type: "button",
					role: "switch",
					"aria-checked": String(on),
					"aria-label": `Show ${c.label} in the ${name}`,
					"data-focus": `${surface}:${c.id}`,
				},
			});
			if (!c.enabled) sw.setAttribute("aria-disabled", "true");
			sw.createEl("i");
			sw.appendText(name);
			sw.addEventListener("click", () => { void this.onSwitch(c, surface); });
		}
	}

	private paintActions(row: HTMLElement, c: LibraryCollection): void {
		const isOpen = this.open.has(c.id);
		const cfg = row.createEl("button", {
			cls: "sf-lb-action is-first",
			text: "Configure",
			attr: { type: "button", "aria-expanded": String(isOpen), "aria-controls": `sf-lb-panel-${c.id}`, "data-focus": `configure:${c.id}` },
		});
		if (isOpen) cfg.createSpan({ cls: "sf-lb-caret", text: "▾", attr: { "aria-hidden": "true" } });
		cfg.addEventListener("click", () => this.onConfigure(c.id));
		if (c.provenance === "built-in") return;
		const confirming = this.confirming === c.id;
		const rm = row.createEl("button", {
			cls: "sf-lb-action is-remove",
			text: "Remove",
			attr: { type: "button", "aria-expanded": String(confirming), "data-focus": `remove:${c.id}` },
		});
		if (confirming) rm.createSpan({ cls: "sf-lb-caret", text: "▾", attr: { "aria-hidden": "true" } });
		rm.addEventListener("click", () => this.onRemoveClick(c.id));
	}

	/** L9: one line under the row, (b) before (c) before (a). */
	private paintHint(item: HTMLElement, m: RowModel): void {
		const { c } = m;
		if (!c.enabled) {
			const back = surfaceNames(c.surfaces);
			item.createDiv({
				cls: "sf-lb-hint is-faint",
				text: back ? `Disabled. Enable it to choose where it shows; it will return to ${back}.` : "Disabled. Enable it to choose where it shows.",
			});
			return;
		}
		const block = blockOf(m.record, m.decision);
		if (m.decision === "engine-missing") return this.paintNeedsEngine(item, m.record?.engine);
		if (block?.hint) {
			item.createDiv({ cls: "sf-lb-hint", text: block.hint });
			return;
		}
		if (!c.effective.anvil && !c.effective.workbench) {
			item.createDiv({ cls: "sf-lb-hint", text: "Shown nowhere. Turn on Anvil or Workbench to see it." });
		}
	}

	/**
	 * T7.4 S5 (PRD F8 AC 5: the capability list is the only mention of a community plugin): the
	 * cause, and a button to the capability screen. No outbound link and no install wording.
	 * T8.2: a `.base` needs the core Bases plugin, and says so in the same pattern.
	 */
	private paintNeedsEngine(item: HTMLElement, engine: ViewRecord["engine"] | undefined): void {
		const hint = item.createDiv({ cls: "sf-lb-hint is-faint" });
		hint.appendText(engine === "bases" ? "Needs the core Bases plugin, which is off. " : "Needs Dataview, which is not active. ");
		const link = hint.createEl("button", { cls: "sf-lb-link", text: "What optional plugins add…", attr: { type: "button" } });
		link.addEventListener("click", () => this.d.openCapabilities?.());
	}

	private paintAdd(host: HTMLElement): void {
		paintAddRow(host, { importFromVault: this.d.importFromVault, ...(this.d.browseRepo ? { browseRepo: this.d.browseRepo } : {}) }, "sf-lb-browse-note");
	}

	// --- L8a: the inline removal confirmation ---------------------------------

	private paintConfirm(item: HTMLElement, m: RowModel): void {
		const { c, record } = m;
		const box = item.createDiv({ cls: "sf-lb-confirm", attr: { role: "group", "aria-labelledby": `sf-lb-q-${c.id}` } });
		const q = box.createDiv({ attr: { id: `sf-lb-q-${c.id}` } });
		q.createEl("b", { text: `Remove ${c.label} from the Library?` });
		q.appendText(` ${this.consequences(m)}`);
		q.createEl("code", { text: record?.source ?? "" });
		q.appendText(` stays in your vault. Nothing is deleted.`);
		const bt = box.createDiv({ cls: "sf-lb-bt" });
		const ok = bt.createEl("button", { cls: "sf-lb-btn is-warn", text: "Remove", attr: { type: "button" } });
		const cancel = bt.createEl("button", { cls: "sf-lb-btn", text: "Cancel", attr: { type: "button", "data-focus": `cancel:${c.id}` } });
		ok.addEventListener("click", () => { void this.onConfirmRemove(m); });
		cancel.addEventListener("click", () => { void this.closeConfirm(c.id); });
		box.addEventListener("keydown", (e) => { if (e.key === "Escape") void this.closeConfirm(c.id); });
	}

	/** "It leaves the Anvil now, and its Card choice is forgotten. Your file " — built from the row. */
	private consequences(m: RowModel): string {
		const { c, record } = m;
		const leaves = surfaceNames(c.effective);
		const extras: string[] = [];
		if (c.engine === "bases") extras.push("its Card choice is forgotten");
		if (record?.command) extras.push("its command is removed too");
		const head = leaves ? `It leaves ${leaves} now` : "";
		let lead = "";
		if (head && extras.length) lead = `${head}, and ${extras.join(" and ")}.`;
		else if (head) lead = `${head}.`;
		else if (extras.length) lead = `${capitalise(extras.join(" and "))}.`;
		const noun = record?.source.endsWith(".md") ? "note" : "file";
		return `${lead ? `${lead} ` : ""}Your ${noun} `;
	}

	// --- handlers ------------------------------------------------------------

	private async onEnable(m: RowModel, checked: boolean): Promise<void> {
		const { record, decision } = m;
		const needsConsent = checked && record?.engine === "dataviewjs" && (decision === "not-consented" || decision === "drift");
		if (needsConsent && record) {
			// Cancelling leaves the row unticked: the paint below restores the stored state.
			const ask = decision === "drift" ? this.d.gate.requestReConsent(m.c.id, record) : this.d.gate.requestConsent(m.c.id, record);
			await ask.catch((err: unknown) => console.error("[StoryForge] consent request failed", err));
			await this.after(null, `cb:${m.c.id}`);
			return;
		}
		await this.after(await this.d.collections.setEnabled(m.c.id, checked), `cb:${m.c.id}`);
	}

	private async onSwitch(c: LibraryCollection, surface: Surface): Promise<void> {
		// While the checkbox is off the switches are inert: the value is kept, not edited (P1, L9b).
		if (!c.enabled) return;
		await this.after(await this.d.collections.setSurface(c.id, surface, !c.surfaces[surface]), `${surface}:${c.id}`);
	}

	private onConfigure(id: string): void {
		if (this.open.has(id)) this.open.delete(id);
		else this.open.add(id);
		this.pendingFocus = `configure:${id}`;
		void this.refresh();
	}

	private onRemoveClick(id: string): void {
		const closing = this.confirming === id;
		this.confirming = closing ? null : id;
		this.pendingFocus = closing ? `remove:${id}` : `cancel:${id}`;
		void this.refresh();
	}

	private async closeConfirm(id: string): Promise<void> {
		this.confirming = null;
		await this.after(null, `remove:${id}`);
	}

	private async onConfirmRemove(m: RowModel): Promise<void> {
		const id = m.c.id;
		const next = this.order[this.order.indexOf(id) + 1];
		const outcome = await this.d.collections.remove(id);
		this.confirming = null;
		if (outcome.ok) {
			this.open.delete(id);
			this.d.removeCommand(id);
			new Notice(`Removed ${m.c.label} from the Library. The file is still in your vault.`);
		}
		// A refusal leaves the row where it was: focus goes back to its Remove button.
		const focus = !outcome.ok ? `remove:${id}` : next ? `cb:${next}` : "add";
		await this.after(outcome, focus);
	}

	/** Surface a refusal, remember what to refocus, and repaint. */
	private async after(outcome: Outcome | null, focus: string | null): Promise<void> {
		if (outcome && !outcome.ok) new Notice(outcome.reason);
		this.pendingFocus = focus;
		await this.refresh();
	}

	/** An editable field that has focus and differs from what was last committed. */
	private hasUnsavedInput(host: HTMLElement): boolean {
		return [...host.querySelectorAll<HTMLInputElement>("input[data-committed]")].some(
			(input) => input === activeDocument.activeElement && input.value !== input.dataset["committed"],
		);
	}

	private applyFocus(host: HTMLElement): void {
		const key = this.pendingFocus;
		this.pendingFocus = null;
		focusByKey(host, key);
	}

	private panelHost(): PanelHost {
		return {
			app: this.d.app,
			collections: this.d.collections,
			views: this.d.views,
			gate: this.d.gate,
			notes: this.d.notes,
			scopeFolders: this.d.scopeFolders,
			registerCommand: this.d.registerCommand,
			removeCommand: this.d.removeCommand,
			done: (focus) => this.after(null, focus ?? null),
		};
	}
}
