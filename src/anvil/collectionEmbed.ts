/**
 * collectionEmbed — draws a Library collection that a query engine owns into the Anvil's Codex
 * (spec 008 T7.1d2: L6a a `.base` through Bases with a Card, L6b Dataview's own output).
 *
 * The Anvil owns the pill row, the Card dropdown and the editor pane; this module owns only what
 * goes in the grid area. A collection is run through the same consent gate as the Workbench, so
 * DataviewJS the user has not approved never runs. Every state the gate can answer is drawn with
 * the Workbench's own S11/S12/S16/S17 classes; no state is invented here.
 *
 * The engines are shared singletons whose Component is theirs to unload, so the Anvil draws with
 * engine instances of its own (`createEngine`) and a Workbench teardown cannot reach them.
 */
import type { ConsentGate } from "consent/ConsentGate";
import type { QueryEngine } from "engines/QueryEngine";
import { cardViewType } from "library/collectionBase";
import { NAVIGATION_HOST_ATTR } from "codex/cardWrapper";
import type { NoteContext } from "scoping/NoteContext";
import type { ViewRecord } from "store/types";
import type { TFile } from "obsidian";

declare const activeDocument: Document;
declare const activeWindow: Window & { MutationObserver: typeof MutationObserver };

/** The open card's class (cardWrapper.ts `selected`), the one the pane's entry is drawn with. */
const SELECTED_CLASS = "sf-cx-card--sel";
const CARD_BODY = "data-sf-card-body";

export interface CollectionEmbedDeps {
	readonly getRecord: (id: string) => Promise<ViewRecord | undefined>;
	readonly gate: Pick<ConsentGate, "evaluate" | "requestConsent" | "requestReConsent">;
	/** A fresh engine of its own for `kind`; `undefined` when that engine is not wired (Dataview absent, Bases off). */
	readonly createEngine: (kind: ViewRecord["engine"]) => QueryEngine | undefined;
}

export interface EmbedRequest {
	readonly collectionId: string;
	/** The Card the collection is shown with (a `.base` draws through its Bases view type). */
	readonly cardId: string;
	/** The note the Anvil follows; engines scope to it. `null`: none is open. */
	readonly activeFile: TFile | null;
	/** The path the editor pane shows, so its card is drawn selected. */
	readonly openPath: string | null;
}

function div(cls: string, text?: string): HTMLElement {
	const node = activeDocument.createElement("div");
	node.className = cls;
	if (text !== undefined) node.textContent = text;
	return node;
}

function contextFor(file: TFile): NoteContext {
	return { activeFile: file, activeKind: "unknown", entities: [], backlinks: [], frontmatter: {}, resolvedAt: Date.now() };
}

export class CollectionEmbed {
	private generation = 0;
	private engine: QueryEngine | null = null;
	private observer: MutationObserver | null = null;

	constructor(private readonly deps: CollectionEmbedDeps) {}

	/** Draw `request` into `host`, after releasing the previous draw. A newer draw, or `teardown`, makes an older one stop quietly. */
	async draw(host: HTMLElement, request: EmbedRequest): Promise<void> {
		this.teardown();
		const mine = this.generation;
		const live = (): boolean => mine === this.generation;
		try {
			await this.drawNow(host, request, live);
		} catch (e) {
			if (!live()) return;
			host.replaceChildren(this.errorBox(e instanceof Error ? e.message : "The collection could not be drawn."));
		}
	}

	/** Unload the engine and stop watching. Safe before any draw. */
	teardown(): void {
		this.generation++;
		this.observer?.disconnect();
		this.observer = null;
		this.engine?.teardown();
		this.engine = null;
	}

	private async drawNow(host: HTMLElement, request: EmbedRequest, live: () => boolean): Promise<void> {
		const record = await this.deps.getRecord(request.collectionId);
		if (!record) return void host.replaceChildren(div("sf-cx-empty", "This collection no longer exists."));
		const file = request.activeFile;
		if (!file) return void host.replaceChildren(div("sf-cx-empty", "Open a note to draw this collection."));
		const decision = await this.deps.gate.evaluate(record);
		if (!live()) return;
		if (decision.status !== "consented") {
			return void host.replaceChildren(this.blockedBox(decision.status, request.collectionId, record));
		}
		await this.render(host, record, { request, file }, live);
	}

	private async render(host: HTMLElement, record: ViewRecord, at: { request: EmbedRequest; file: TFile }, live: () => boolean): Promise<void> {
		const { request, file } = at;
		const engine = this.deps.createEngine(record.engine);
		if (!engine) return void host.replaceChildren(this.blockedBox("engine-missing", request.collectionId, record));
		const el = div("sf-cx-embed");
		// The Anvil's own click handler navigates; a Card view drawn in here must not (ADR-28).
		el.setAttribute(NAVIGATION_HOST_ATTR, "");
		host.replaceChildren(el);
		this.engine = engine;
		const options = record.engine === "bases" ? { cardViewType: cardViewType(request.cardId) } : {};
		try {
			await engine.render(record, contextFor(file), el, options);
		} catch (e) {
			// Overtaken while drawing: the engine made its Component after `teardown` ran. Unload it.
			if (live()) throw e;
			engine.teardown();
			return;
		}
		if (!live()) return void engine.teardown();
		if (record.engine === "bases") this.keepSelectionMarked(el, request.openPath);
	}

	/** Bases redraws its cards whenever its data moves; mark the open entry again each time. */
	private keepSelectionMarked(el: HTMLElement, openPath: string | null): void {
		if (openPath === null) return;
		const mark = (): void => {
			for (const card of el.querySelectorAll<HTMLElement>(`[${CARD_BODY}]`)) {
				card.classList.toggle(SELECTED_CLASS, card.getAttribute(CARD_BODY) === openPath);
			}
		};
		mark();
		this.observer?.disconnect();
		// The element's own window, so a popout's mutations are observed by its own observer.
		this.observer = new (el.ownerDocument.defaultView ?? activeWindow).MutationObserver(mark);
		this.observer.observe(el, { childList: true, subtree: true });
	}

	private errorBox(message: string): HTMLElement {
		const box = div("sf-engine-error sf-errbox");
		box.appendChild(div("", "⚠ Query render failed."));
		box.appendChild(div("sf-hint", message));
		return box;
	}

	private blockedBox(status: string, id: string, record: ViewRecord): HTMLElement {
		switch (status) {
			case "not-consented":
			case "drift":
				return this.consentBox(status, id, record);
			case "dvjs-off":
				return this.noteBox("sf-dvjs-off sf-errbox", "⚠ DataviewJS is disabled in Dataview settings.");
			case "platform-restricted":
				return this.noteBox("sf-platform-restricted sf-empty", "This collection is not available on mobile.");
			case "disabled":
				return this.noteBox("sf-disabled sf-empty", "This collection is turned off.");
			default:
				return this.noteBox("sf-engine-missing sf-empty", `${record.engine === "bases" ? "Bases" : "Dataview"} is not available, so this collection cannot be drawn.`);
		}
	}

	private noteBox(cls: string, text: string): HTMLElement {
		return div(cls, text);
	}

	private consentBox(status: string, id: string, record: ViewRecord): HTMLElement {
		const drift = status === "drift";
		const box = div(drift ? "sf-reconsent-required sf-warnbanner" : "sf-consent-required sf-cta-block");
		box.appendChild(div("sf-cta-title", drift ? "Query changed since you last enabled it." : "Review and enable"));
		box.appendChild(div("sf-cta-body", "The collection is not drawn until you have reviewed it."));
		const button = activeDocument.createElement("button");
		button.type = "button";
		button.className = "sf-cta-btn sf-btn";
		button.textContent = drift ? "Re-review" : "Review and enable";
		button.addEventListener("click", () => {
			void (drift ? this.deps.gate.requestReConsent(id, record) : this.deps.gate.requestConsent(id, record));
		});
		box.appendChild(button);
		return box;
	}
}
