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
}

type Decision = ConsentDecision["status"];

const ENGINE_LABEL: Record<ViewRecord["engine"], string> = {
	bases: "Bases",
	"dataview-dql": "Dataview",
	dataviewjs: "DataviewJS",
};

const PROVENANCE_LABEL: Record<LibraryCollection["provenance"], string> = {
	"built-in": "built-in",
	"from-repo": "from repo",
	imported: "imported",
};

/** P11: what blocks an entry, in the words of the old blocked-reason row ("view" became "collection"). */
interface Block {
	readonly badge: string;
	readonly warn: boolean;
	readonly hint: string | null;
}

function blockOf(record: ViewRecord | undefined, decision: Decision | undefined): Block | null {
	if (!record || !decision) return null;
	switch (decision) {
		case "engine-missing": return { badge: "■ Dataview not installed", warn: true, hint: null };
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
		await this.refresh();
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
		if (m.decision === "engine-missing") return this.paintInstallHint(item);
		if (block?.hint) {
			item.createDiv({ cls: "sf-lb-hint", text: block.hint });
			return;
		}
		if (!c.effective.anvil && !c.effective.workbench) {
			item.createDiv({ cls: "sf-lb-hint", text: "Shown nowhere. Turn on Anvil or Workbench to see it." });
		}
	}

	private paintInstallHint(item: HTMLElement): void {
		const hint = item.createDiv({ cls: "sf-lb-hint" });
		hint.createEl("a", {
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- 'Dataview' is a proper product name
			text: "Install Dataview",
			href: "https://obsidian.md/plugins?id=dataview",
		});
		hint.appendText(" to run this collection. Until then its Workbench tab says the same.");
	}

	private paintAdd(host: HTMLElement): void {
		const add = host.createDiv({ cls: "sf-lb-add" });
		const browse = add.createEl("button", {
			cls: "sf-lb-addbtn",
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- mockup L2 text; the rule misreads the leading '+' glyph
			text: "+ Browse repo…",
			// The visible name stays the accessible name; the reason is a description, not a replacement.
			attr: { type: "button", title: "Coming in a future release", "aria-describedby": "sf-lb-browse-note" },
		});
		browse.disabled = true;
		add.createSpan({ cls: "sf-lb-sr", text: "Coming in a future release", attr: { id: "sf-lb-browse-note" } });
		const imp = add.createEl("button", {
			cls: "sf-lb-addbtn",
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- mockup L2 text; the rule misreads the leading '+' glyph
			text: "+ Import from vault…",
			attr: { type: "button", "data-focus": "add" },
		});
		imp.addEventListener("click", () => this.d.importFromVault());
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
		await this.after(outcome, next ? `cb:${next}` : "add");
	}

	/** Surface a refusal, remember what to refocus, and repaint. */
	private async after(outcome: Outcome | null, focus: string): Promise<void> {
		if (outcome && !outcome.ok) new Notice(outcome.reason);
		this.pendingFocus = focus;
		await this.refresh();
	}

	private applyFocus(host: HTMLElement): void {
		const key = this.pendingFocus;
		this.pendingFocus = null;
		if (key === null) return;
		host.querySelector<HTMLElement>(`[data-focus="${key}"]`)?.focus();
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
			done: (focus) => this.after(null, focus ?? ""),
		};
	}
}
