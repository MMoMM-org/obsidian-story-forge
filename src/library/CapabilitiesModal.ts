/**
 * CapabilitiesModal — "What Story Forge can use" (spec 008 T7.4, PRD F8, ADR-36), built to the
 * signed-off mockup `docs/XDD/specs/008-codex-surface/mockups-capabilities.html` L12a–g (S1–S6).
 *
 * One modal, two ways in (S1):
 * - first run (the first Anvil or Workbench open): "Got it" and a footer that says where to find it
 *   again; any close — Got it, ✕, Escape — calls `onDismiss`, which records it for good;
 * - the Library link: only "Close", and closing records nothing.
 *
 * Rows come from `capabilityReport`, read from `getFacts` when the modal opens (S3). The core row
 * names where Bases is turned on, as text (S4). Community rows have no action of any kind.
 *
 * DOM: Obsidian element helpers only, no innerHTML; popout-safe.
 */

import { Modal } from "obsidian";
import type { App } from "obsidian";
import { capabilityReport, storyFilesRow } from "library/capabilityReport";
import type { CapabilityFacts, CapabilityRow } from "library/capabilityReport";
import type { StoryFilesStatus } from "artifacts/storyFilesStatus";

export interface CapabilitiesModalOptions {
	/** Read when the modal opens; an open modal does not follow later changes. */
	getFacts: () => CapabilityFacts;
	/**
	 * The story files status, computed read-only when the modal opens (spec 010 S6). The row draws
	 * "Checking story files…" until it settles.
	 */
	getStoryFilesStatus: () => Promise<StoryFilesStatus>;
	/**
	 * The row's button: the screen closes, then this opens the setup dialog. Injected so this modal
	 * never imports it and writes nothing itself (PRD F2.9). Absent: the button only closes the screen.
	 */
	openStoryFiles?: () => void;
	mode: "first-run" | "settings";
	/** First run only: called once when the modal closes, however it is closed. */
	onDismiss?: () => void;
}

const TITLE_ID = "sf-cap-title";
const INTRO_ID = "sf-cap-intro";

/** Append `text` to `host`, drawing `backticked` parts as code and `_underscored_` parts in italics. */
function appendMarked(host: HTMLElement, text: string): void {
	text.split("`").forEach((part, i) => {
		if (part === "") return;
		if (i % 2 === 1) {
			host.createEl("code", { text: part });
			return;
		}
		part.split("_").forEach((piece, j) => {
			if (piece === "") return;
			if (j % 2 === 1) host.createEl("i", { text: piece });
			else host.appendText(piece);
		});
	});
}

export class CapabilitiesModal extends Modal {
	constructor(app: App, private readonly opts: CapabilitiesModalOptions) {
		super(app);
	}

	onOpen(): void {
		this.modalEl.addClass("sf-cap-modal");
		this.modalEl.setAttribute("aria-labelledby", TITLE_ID);
		this.modalEl.setAttribute("aria-describedby", INTRO_ID);
		const el = this.contentEl;
		el.empty();
		el.addClass("sf-cap");
		el.createEl("h2", { text: "What Story Forge can use", attr: { id: TITLE_ID } });
		const body = el.createDiv({ cls: "sf-cap-body" });
		body.createEl("p", {
			cls: "sf-cap-intro",
			text: "Story Forge works without any of these, and best with its story files. Each row says what it adds and what you have without it.",
			attr: { id: INTRO_ID },
		});
		this._renderStoryFiles(body);
		this._renderRows(body, capabilityReport(this.opts.getFacts()));
		this._renderFoot(el);
	}

	onClose(): void {
		this.contentEl.empty();
		if (this.opts.mode === "first-run") this.opts.onDismiss?.();
	}

	/** S6: Story Forge's own story files, first in the body; the status fills in when it is read. */
	private _renderStoryFiles(body: HTMLElement): void {
		const c = storyFilesRow();
		this._renderGroup(body, "Story Forge", " · written only when you ask");
		const nameId = "sf-cap-story-files";
		const row = body.createDiv({ cls: "sf-cap-row", attr: { role: "group", "aria-labelledby": nameId } });
		const head = row.createDiv({ cls: "sf-cap-head" });
		head.createSpan({ cls: "sf-cap-name", text: c.name, attr: { id: nameId } });
		head.createSpan({ cls: ["sf-cap-kind", "is-core"], text: c.kindLabel });
		const status = head.createSpan({ cls: "sf-cap-status", text: "Checking story files…" });
		const cols = row.createDiv({ cls: "sf-cap-cols" });
		this._renderList(cols, "What it adds", c.adds);
		this._renderList(cols, "Without it", c.lostWithout);
		const act = row.createDiv({ cls: "sf-cap-act" });
		const btn = act.createEl("button", { text: c.buttonLabel, attr: { type: "button" } });
		// The dialog opens after this one is gone; on first run that close counts as Got it.
		btn.addEventListener("click", () => {
			this.close();
			this.opts.openStoryFiles?.();
		});
		const aside = act.createSpan({ cls: "sf-cap-aside", text: c.asideNotSetUp });
		this.opts.getStoryFilesStatus().then(
			(s) => {
				status.textContent = s.short;
				if (s.tone !== "neutral") status.addClass(`is-${s.tone}`);
				aside.textContent = s.kind === "none" ? c.asideNotSetUp : c.asideSetUp;
			},
			(err: unknown) => {
				console.error("[StoryForge] capability screen: could not read the story files status", err);
				status.textContent = "Could not check story files";
			},
		);
	}

	private _renderRows(body: HTMLElement, rows: CapabilityRow[]): void {
		const core = rows.filter((r) => r.kind === "core");
		const community = rows.filter((r) => r.kind === "community");
		this._renderGroup(body, "Core plugin", " · ships with Obsidian");
		for (const r of core) this._renderRow(body, r);
		this._renderGroup(body, "Community plugins", " · installed separately, never required");
		for (const r of community) this._renderRow(body, r);
	}

	private _renderGroup(body: HTMLElement, title: string, aside: string): void {
		const grp = body.createDiv({ cls: "sf-cap-grp" });
		grp.appendText(title);
		grp.createSpan({ text: aside });
	}

	private _renderRow(body: HTMLElement, r: CapabilityRow): void {
		const nameId = `sf-cap-${r.id}`;
		const row = body.createDiv({ cls: "sf-cap-row", attr: { role: "group", "aria-labelledby": nameId } });
		const head = row.createDiv({ cls: "sf-cap-head" });
		head.createSpan({ cls: "sf-cap-name", text: r.name, attr: { id: nameId } });
		head.createSpan({ cls: r.kind === "core" ? ["sf-cap-kind", "is-core"] : "sf-cap-kind", text: r.kind });
		const tone = r.status.tone === "neutral" ? "sf-cap-status" : ["sf-cap-status", `is-${r.status.tone}`];
		head.createSpan({ cls: tone, text: r.status.text });

		const cols = row.createDiv({ cls: "sf-cap-cols" });
		this._renderList(cols, "What it adds", r.adds);
		this._renderList(cols, "Without it", r.lostWithout);
		if (r.sub) this._renderSub(row, r.sub);
		if (r.where !== undefined) {
			const how = row.createDiv({ cls: "sf-cap-how", text: "Ships with Obsidian. Turn it on in " });
			how.createEl("em", { text: r.where });
			how.appendText(".");
			// L12 amended (user): the load-time note joins this paragraph instead of a line of its own.
			if (r.note !== undefined) how.appendText(` ${r.note}`);
		}
	}

	private _renderList(cols: HTMLElement, title: string, items: readonly string[]): void {
		const col = cols.createDiv();
		col.createEl("h5", { text: title });
		const ul = col.createEl("ul");
		for (const item of items) appendMarked(ul.createEl("li"), item);
	}

	private _renderSub(row: HTMLElement, sub: NonNullable<CapabilityRow["sub"]>): void {
		const line = row.createDiv({ cls: "sf-cap-sub" });
		const setting = line.createSpan({ text: `${sub.label} ` });
		setting.createEl("b", { text: sub.value });
		setting.appendText(sub.rest);
		line.createSpan({ text: sub.lost });
	}

	private _renderFoot(el: HTMLElement): void {
		const foot = el.createDiv({ cls: "sf-picker-foot" });
		const firstRun = this.opts.mode === "first-run";
		if (firstRun) {
			foot.createSpan({ cls: "sf-cap-later", text: "Open this again from Settings › Library › What Story Forge can use…" });
		}
		const btn = foot.createEl("button", {
			...(firstRun ? { cls: "mod-cta" } : {}),
			text: firstRun ? "Got it" : "Close",
			attr: { type: "button" },
		});
		btn.addEventListener("click", () => this.close());
		btn.focus();
	}
}
