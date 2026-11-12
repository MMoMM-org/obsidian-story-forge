/**
 * CardsSection — Library › Cards (spec 008 T7.1c; mockups-library.html L4, L5a, L5b, L8c and
 * proposals P3, P11, P16, P19).
 *
 * One row per Card from `CollectionStore`: enable checkbox (Hero's is inert, P19), name,
 * provenance badge, "used by", `Preview` and, for non-built-ins, `Remove`. No surface switches:
 * a Card is "how", chosen per collection. A bare click never destroys or writes anything:
 * `Remove` opens an inline confirmation naming the collections that fall back to Hero, and only
 * its own button writes. The preview (cardPreview.ts) is read-only.
 *
 * Mirrors `LibrarySection`: focus survives a repaint by `data-focus` key, a `gen` counter drops a
 * read that a newer paint or a hidden tab superseded, and what must outlive a repaint (the open
 * preview, its chosen sample, the pending removal) lives here. Unlike the collections list it has
 * no text input, so there is no held repaint.
 */

import { Notice } from "obsidian";
import { CODEX_CARD_REGISTRY } from "codex/builtinCards";
import type { CardRegistry } from "codex/cardRegistry";
import type { CollectionStore, LibraryCard, LibraryCollection, Outcome } from "library/collectionStore";
import { pickSample, paintPreview, sampleOptions, type PreviewHost } from "./cardPreview";
import { PROVENANCE_LABEL, focusByKey, focusedKey, paintAddRow } from "./libraryShared";

export interface CardsSectionDeps extends Omit<PreviewHost, "registry"> {
	readonly collections: CollectionStore;
	readonly registry?: CardRegistry;
	/** Opens today's import picker. */
	readonly importFromVault: () => void;
}

/** A Card with what the row needs beyond the store's view of it. */
interface CardModel {
	readonly card: LibraryCard;
	readonly usedBy: readonly LibraryCollection[];
}

const HERO_WHY = "Hero is the fallback Card and cannot be disabled";

/** "A", "A and B", "A, B and C". */
function joinNames(names: readonly string[]): string {
	if (names.length < 2) return names.join("");
	return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1] ?? ""}`;
}

export class CardsSection {
	private host: HTMLElement | null = null;
	private gen = 0;
	private previewing: string | null = null;
	/** The collection chosen in "Sample from", per Card. */
	private readonly sampled = new Map<string, string>();
	private confirming: string | null = null;
	private pendingFocus: string | null = null;
	/** Row order of the last paint: where focus goes after a removal. */
	private order: string[] = [];
	private all: readonly LibraryCollection[] = [];

	constructor(private readonly d: CardsSectionDeps) {}

	/** Paint into `host` and remember it, so later writes can repaint the same place. */
	async render(host: HTMLElement): Promise<void> {
		this.host = host;
		await this.refresh();
	}

	/** Drop any read still in flight: the tab was hidden, so nothing may paint after this. */
	suspend(): void {
		this.gen++;
		this.pendingFocus = null;
	}

	async refresh(): Promise<void> {
		const host = this.host;
		if (!host) return;
		const gen = ++this.gen;
		const [cards, all] = await Promise.all([this.d.collections.cards(), this.d.collections.collections()]);
		const models = await Promise.all(cards.map(async (card) => ({ card, usedBy: await this.d.collections.usedBy(card.id) })));
		// A newer paint superseded this one while it was reading: do not paint stale rows.
		if (gen !== this.gen) return;
		this.all = all;
		this.paint(host, models);
	}

	// --- paint ---------------------------------------------------------------

	private paint(host: HTMLElement, models: CardModel[]): void {
		// Whatever has focus now keeps it across the repaint.
		this.pendingFocus ??= focusedKey(host);
		host.empty();
		this.order = models.map((m) => m.card.id);
		this.dropVanished();
		for (const m of models) this.paintItem(host, m);
		// No Card catalog yet: Browse stays the disabled control (T7.2 decision).
		paintAddRow(host, { importFromVault: this.d.importFromVault }, "sf-lb-browse-note-cards");
		focusByKey(host, this.pendingFocus);
		this.pendingFocus = null;
	}

	/** A preview or a confirmation for a Card that is gone has nothing to show. */
	private dropVanished(): void {
		if (this.previewing !== null && !this.order.includes(this.previewing)) this.previewing = null;
		if (this.confirming !== null && !this.order.includes(this.confirming)) this.confirming = null;
	}

	private paintItem(host: HTMLElement, m: CardModel): void {
		const { card } = m;
		const item = host.createDiv({ cls: card.enabled ? "sf-lb-item" : "sf-lb-item is-off", attr: { "data-card-id": card.id } });
		this.paintRow(item, m);
		if (this.previewing === card.id) this.paintPreview(item, m);
		if (this.confirming === card.id) this.paintConfirm(item, m);
	}

	private paintRow(item: HTMLElement, m: CardModel): void {
		const { card } = m;
		const row = item.createDiv({ cls: "sf-lb-row" });
		this.paintCheckbox(row, card);
		row.createSpan({ cls: "sf-lb-name", text: card.label });
		row.createSpan({ cls: card.provenance === "built-in" ? "sf-lb-prov is-builtin" : "sf-lb-prov", text: PROVENANCE_LABEL[card.provenance] });
		if (m.usedBy.length > 0) row.createSpan({ cls: "sf-lb-used", text: `used by ${m.usedBy.map((c) => c.label).join(", ")}` });
		row.createSpan({ cls: "sf-lb-sp" });
		this.paintActions(row, card);
	}

	private paintCheckbox(row: HTMLElement, card: LibraryCard): void {
		const box = row.createEl("input", {
			cls: "sf-lb-cb",
			attr: { type: "checkbox", "aria-label": `Enable ${card.label}`, "data-focus": `cb:${card.id}` },
		});
		box.checked = card.enabled;
		if (!card.canDisable) this.markFallback(row, box, card.id);
		box.addEventListener("change", () => { void this.onEnable(card.id, box.checked); });
	}

	/** P19: inert, and the reason is its description, not a replacement for its name. */
	private markFallback(row: HTMLElement, box: HTMLInputElement, id: string): void {
		const noteId = `sf-lb-why-${id}`;
		box.disabled = true;
		box.addClass("is-greyed");
		box.title = HERO_WHY;
		box.setAttribute("aria-describedby", noteId);
		row.createSpan({ cls: "sf-lb-sr", text: HERO_WHY, attr: { id: noteId } });
	}

	private paintActions(row: HTMLElement, card: LibraryCard): void {
		const open = this.previewing === card.id;
		const prev = row.createEl("button", {
			cls: "sf-lb-action is-first",
			text: "Preview",
			attr: { type: "button", "aria-expanded": String(open), "data-focus": `preview:${card.id}` },
		});
		if (open) prev.createSpan({ cls: "sf-lb-caret", text: "▾", attr: { "aria-hidden": "true" } });
		prev.addEventListener("click", () => this.onPreview(card.id));
		if (card.provenance === "built-in") return;
		const confirming = this.confirming === card.id;
		const rm = row.createEl("button", {
			cls: "sf-lb-action is-remove",
			text: "Remove",
			attr: { type: "button", "aria-expanded": String(confirming), "data-focus": `remove:${card.id}` },
		});
		if (confirming) rm.createSpan({ cls: "sf-lb-caret", text: "▾", attr: { "aria-hidden": "true" } });
		rm.addEventListener("click", () => this.onRemoveClick(card.id));
	}

	private paintPreview(item: HTMLElement, m: CardModel): void {
		const id = m.card.id;
		const options = sampleOptions(this.all);
		const sample = pickSample(options, m.usedBy, this.sampled.get(id));
		const host: PreviewHost = { app: this.d.app, notes: this.d.notes, registry: this.registry(), ...(this.d.fileClasses ? { fileClasses: this.d.fileClasses } : {}) };
		paintPreview(item, { card: m.card, options, sample, anyEnabled: this.all.some((c) => c.enabled) }, host, {
			onSample: (collectionId) => this.onSample(id, collectionId),
			onClose: () => this.closePreview(id),
		});
	}

	private registry(): CardRegistry {
		return this.d.registry ?? CODEX_CARD_REGISTRY;
	}

	// --- L8c: the inline removal confirmation ---------------------------------

	private paintConfirm(item: HTMLElement, m: CardModel): void {
		const { card, usedBy } = m;
		const box = item.createDiv({ cls: "sf-lb-confirm", attr: { role: "group", "aria-labelledby": `sf-lb-q-card-${card.id}` } });
		const q = box.createDiv({ attr: { id: `sf-lb-q-card-${card.id}` } });
		q.createEl("b", { text: `Remove ${card.label} from the Library?` });
		const fallback = usedBy.length > 0 ? ` ${joinNames(usedBy.map((c) => c.label))} will be drawn with Hero.` : "";
		q.appendText(`${fallback} Your Card file stays in your vault. Nothing is deleted.`);
		const bt = box.createDiv({ cls: "sf-lb-bt" });
		const ok = bt.createEl("button", { cls: "sf-lb-btn is-warn", text: "Remove", attr: { type: "button" } });
		const cancel = bt.createEl("button", { cls: "sf-lb-btn", text: "Cancel", attr: { type: "button", "data-focus": `cancel:${card.id}` } });
		ok.addEventListener("click", () => { void this.onConfirmRemove(card); });
		cancel.addEventListener("click", () => { void this.closeConfirm(card.id); });
		box.addEventListener("keydown", (e) => { if (e.key === "Escape") void this.closeConfirm(card.id); });
	}

	// --- handlers ------------------------------------------------------------

	private async onEnable(id: string, checked: boolean): Promise<void> {
		await this.after(await this.d.collections.setCardEnabled(id, checked), `cb:${id}`);
	}

	/** P3: one preview at a time; opening focuses Close preview, closing returns to Preview. */
	private onPreview(id: string): void {
		if (this.previewing === id) return this.closePreview(id);
		this.previewing = id;
		this.pendingFocus = `close:${id}`;
		void this.refresh();
	}

	private closePreview(id: string): void {
		this.previewing = null;
		this.pendingFocus = `preview:${id}`;
		void this.refresh();
	}

	private onSample(id: string, collectionId: string): void {
		this.sampled.set(id, collectionId);
		this.pendingFocus = `sample:${id}`;
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

	private async onConfirmRemove(card: LibraryCard): Promise<void> {
		const next = this.order[this.order.indexOf(card.id) + 1];
		const outcome = await this.d.collections.removeCard(card.id);
		this.confirming = null;
		if (outcome.ok) {
			this.sampled.delete(card.id);
			new Notice(`Removed ${card.label} from the Library. The file is still in your vault.`);
		}
		// A refusal leaves the row where it was: focus goes back to its Remove button.
		await this.after(outcome, !outcome.ok ? `remove:${card.id}` : next ? `cb:${next}` : "add");
	}

	/** Surface a refusal, remember what to refocus, and repaint. */
	private async after(outcome: Outcome | null, focus: string | null): Promise<void> {
		if (outcome && !outcome.ok) new Notice(outcome.reason);
		this.pendingFocus = focus;
		await this.refresh();
	}
}
