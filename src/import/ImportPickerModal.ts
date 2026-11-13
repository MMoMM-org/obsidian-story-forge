/**
 * ImportPickerModal — "Import a collection" from the vault, built to the signed-off mockup
 * `docs/XDD/specs/008-codex-surface/mockups-import.html` L11a–L11i (proposals R1–R6), the sibling
 * of the L10 catalog browser.
 *
 * The list | detail browser (two panes stacking below about 560px, search and engine filter above
 * 5 files, nothing selected on open, keyboard, "← All collections") is `BrowserList`, shared with
 * `BrowseOfficialModal`. This modal decides:
 * - Rows (R3): name, engine pill and vault path, sorted by path. Every candidate is parsed when the
 *   modal opens; one that fails is still listed, as "Can't import" (R2), and its reason plus a fix
 *   line show as soon as it is selected (R6).
 * - Detail: source file (it stays where it is), a read-only "Shows in" with the P2 default (R5),
 *   the query or `.base` preview, and one action (R1): "Import" for Bases and Dataview, which saves
 *   at once; "Review and import…" for DataviewJS, which opens today's full disclosure first.
 * - Import re-parses the file (it may have changed since the scan), then runs `runImportFlow`. The
 *   result is shown inline and the modal stays open (R4): "✓ Imported" and a success line, or a
 *   refusal under the button (R6).
 *
 * The picker performs no store write itself; `runImportFlow` commits through ViewImporter.
 *
 * @ref SDD/Runtime View — Flow C (import leg)
 * @ref PRD/AC-F3.1, AC-F3.3, AC-F3.4, F7 AC 8
 * @ref mockups-import.html L11a–L11i, R1–R6
 */

import { Modal } from "obsidian";
import type { App, TFile } from "obsidian";
import { BrowserList, renderFeedback, renderLabelled } from "catalog/browserList";
import type { Feedback } from "catalog/browserList";
import type { CatalogEngine } from "catalog/catalogView";
import type { ConsentGate } from "consent/ConsentGate";
import { runImportFlow } from "import/ImportFlow";
import type { ImportOutcome } from "import/ImportFlow";
import { CLOSED_REVIEW, refusalFor, successText } from "import/importMessages";
import { ImportError } from "import/ViewDefinition";
import type { ViewDefinition } from "import/ViewDefinition";
import type { ViewImporter } from "import/ViewImporter";
import { ENGINE_LABEL } from "settings/libraryShared";
import { defaultSurfaces } from "store/types";

/** A file the scan offered, with what parsing it gave. */
interface Candidate {
	file: TFile;
	path: string;
	/** sf-name / the `.base` name; the file name when it could not be parsed. */
	name: string;
	description?: string | undefined;
	/** Unknown for a note whose query can't be read (it counts only in "All"). */
	engine?: CatalogEngine | undefined;
	/** What the scan parsed (its preview), or null when the file can't be imported. */
	def: ViewDefinition | null;
	/** The parse refusal, when the file can't be imported (R2). */
	problem: Feedback | null;
}

const BASE_EXTENSION = "base";

/** What the action does (R1): DataviewJS asks first, hence the ellipsis. */
function actionLabel(engine: CatalogEngine): string {
	return engine === "dataviewjs" ? "Review and import…" : "Import";
}

export class ImportPickerModal extends Modal {
	private list: BrowserList<Candidate> | null = null;
	/** Candidates imported while the modal is open (R4). */
	private imported = new Set<string>();
	/** Candidates whose import has not settled: their button stays disabled across re-renders. */
	private inFlight = new Set<string>();
	/** Set by onClose: a scan still in flight must not draw into a closed modal (W2). */
	private closed = false;

	constructor(
		app: App,
		private readonly importer: ViewImporter,
		private readonly gate: ConsentGate,
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
		el.createEl("h2", { text: "Import a collection" });
		el.createEl("p", { text: "Notes in your vault marked sf-view: true, and .base files", cls: "sf-picker-sub" });
		const candidates = await this._scan();
		if (this.closed || candidates === null) return;

		if (candidates.length === 0) this._renderEmpty(el);
		else this._mountList(el, candidates);

		const close = el.createDiv({ cls: "sf-picker-foot" }).createEl("button", { text: "Close", attr: { type: "button" } });
		close.addEventListener("click", () => this.close());
		if (this.list) this.list.focusStart(close);
		else close.focus();
	}

	/** Scan and parse every candidate (R2), sorted by path (R3). Null when the modal closed meanwhile. */
	private async _scan(): Promise<Candidate[] | null> {
		const files = await this.importer.scanVault();
		const out: Candidate[] = [];
		for (const file of files) {
			if (this.closed) return null;
			out.push(await this._candidate(file));
		}
		return out.sort((a, b) => a.path.localeCompare(b.path));
	}

	private async _candidate(file: TFile): Promise<Candidate> {
		try {
			const def = await this.importer.parse(file);
			return { file, path: file.path, name: def.name, description: def.description, engine: def.engine, def, problem: null };
		} catch (err) {
			console.debug("Story Forge: could not parse view candidate", file.path, err);
			const engine = file.extension === BASE_EXTENSION ? "bases" : undefined;
			return { file, path: file.path, name: file.basename, engine, def: null, problem: { ...refusalFor(err, file.path), role: "note" } };
		}
	}

	private _renderEmpty(el: HTMLElement): void {
		el.createDiv({ cls: "sf-catalog-split is-single" }).createEl("p", {
			text: "Nothing to import — add sf-view: true to a vault note, or create a .base file, to make it available here.",
			cls: "sf-picker-empty sf-catalog-empty",
		});
	}

	private _mountList(el: HTMLElement, candidates: Candidate[]): void {
		this.list = new BrowserList(el, candidates, {
			keyOf: (c) => c.path,
			listLabel: "Importable collections",
			titleIdPrefix: "sf-import-title",
			renderRow: (row, c) => this._renderRow(row, c),
			renderDetail: (pane, c, titleId, feedback) => this._renderDetail(pane, c, titleId, feedback),
		});
		this.list.mount();
	}

	// ---------------------------------------------------------------------------
	// Row (R2, R3)
	// ---------------------------------------------------------------------------

	private _renderRow(row: HTMLElement, c: Candidate): void {
		row.createSpan({ cls: "sf-catalog-name", text: c.name });
		this._renderStatus(row, c);
		const line2 = row.createSpan({ cls: "sf-catalog-line2" });
		if (c.engine !== undefined) line2.createSpan({ cls: "sf-catalog-engine", text: ENGINE_LABEL[c.engine] });
		line2.createSpan({ cls: "sf-picker-path", text: c.path });
	}

	private _renderStatus(host: HTMLElement, c: Candidate): void {
		if (c.problem) host.createSpan({ cls: ["sf-catalog-status", "is-bad"], text: "Can't import" });
		else if (this.imported.has(c.path)) host.createSpan({ cls: ["sf-catalog-status", "is-installed"], text: "✓ Imported" });
		else host.createSpan({ cls: "sf-catalog-status" });
	}

	// ---------------------------------------------------------------------------
	// Detail (R1, R2, R5)
	// ---------------------------------------------------------------------------

	private _renderDetail(pane: HTMLElement, c: Candidate, titleId: string, feedback: Feedback | null): void {
		const head = pane.createDiv({ cls: "sf-catalog-preview-head" });
		head.createSpan({ cls: "sf-catalog-preview-title", text: c.name, attr: { id: titleId } });
		if (c.engine !== undefined) head.createSpan({ cls: "sf-catalog-engine", text: ENGINE_LABEL[c.engine] });
		if (c.problem || this.imported.has(c.path)) this._renderStatus(head, c);
		if (c.description) pane.createEl("p", { cls: "sf-catalog-preview-desc", text: c.description });

		const source = renderLabelled(pane, "Source file", "sf-catalog-preview-dest");
		source.createDiv().createSpan({ cls: "sf-catalog-path", text: c.path });
		source.createDiv({ cls: "sf-catalog-hint", text: "Stays where it is. The Library links to it, so editing the file changes the collection." });

		if (c.problem) {
			renderFeedback(pane, c.problem);
			pane.createDiv({ cls: "sf-catalog-act" }).createSpan({ cls: "sf-catalog-aside", text: "Fix the file, then open this window again." });
			return;
		}
		this._renderShowsIn(pane, c.engine!);
		if (!this.imported.has(c.path)) this._renderBody(pane, c);
		if (feedback) renderFeedback(pane, feedback);
	}

	/** R5: the P2 default, read-only; the switches live in Library › Collections. */
	private _renderShowsIn(pane: HTMLElement, engine: CatalogEngine): void {
		const block = renderLabelled(pane, "Shows in");
		const surfaces = defaultSurfaces(engine);
		const row = block.createDiv({ cls: "sf-import-surfaces" });
		row.createSpan({ cls: surfaces.anvil ? "is-on" : "is-off", text: surfaces.anvil ? "Anvil on" : "Anvil off" });
		row.createSpan({ cls: surfaces.workbench ? "is-on" : "is-off", text: surfaces.workbench ? "Workbench on" : "Workbench off" });
		block.createDiv({ cls: "sf-catalog-hint", text: "Change this per collection in Library › Collections." });
	}

	/** The preview, the safe / consent note and the one action (not drawn once imported). */
	private _renderBody(pane: HTMLElement, c: Candidate): void {
		const engine = c.engine!;
		renderLabelled(pane, engine === "bases" ? "Preview" : "Query")
			.createEl("pre", { cls: "sf-catalog-preview-src", text: (c.def?.querySource ?? "").trimEnd() });
		if (engine === "dataviewjs") {
			const note = pane.createDiv({ cls: "sf-catalog-consent" });
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- mockup L11 text; the rule misreads the leading glyph
			note.createEl("strong", { text: "▲ Runs JavaScript." });
			note.appendText(" This collection runs code with full vault access. ");
			note.createEl("em", { text: actionLabel(engine) });
			note.appendText(" shows you its code first. Nothing is saved until you enable it.");
		} else {
			pane.createDiv({ cls: "sf-catalog-safe", text: "Safe: declarative query, no code." });
		}
		const btn = pane.createDiv({ cls: "sf-catalog-act" })
			.createEl("button", { cls: "mod-cta", text: actionLabel(engine), attr: { type: "button" } });
		btn.disabled = this.inFlight.has(c.path);
		btn.addEventListener("click", () => void this._doImport(c));
	}

	// ---------------------------------------------------------------------------
	// Import (R1, R4, R6)
	// ---------------------------------------------------------------------------

	/**
	 * Import `c` once. While it runs its button stays disabled, however often its pane is redrawn
	 * (re-selecting it rebuilds the button), so it imports once.
	 */
	private async _doImport(c: Candidate): Promise<void> {
		if (this.inFlight.has(c.path)) return;
		this.inFlight.add(c.path);
		this._disableAction(c);
		let result: { outcome: ImportOutcome; def: ViewDefinition | null };
		try {
			result = await this._runImport(c);
		} finally {
			this.inFlight.delete(c.path);
		}
		if (result.outcome.status === "imported") {
			this.imported.add(c.path);
			this.list?.repaintRow(c);
		}
		// The user moved on to another file: its pane is not this result's place (the row still updated).
		if (this.list?.isSelected(c)) this._showOutcome(c, result.outcome, result.def);
	}

	/** Re-parse the file (it may have changed since the scan), then run the flow. Never throws. */
	private async _runImport(c: Candidate): Promise<{ outcome: ImportOutcome; def: ViewDefinition | null }> {
		let def: ViewDefinition;
		try {
			def = await this.importer.parse(c.file);
		} catch (err) {
			if (!(err instanceof ImportError)) console.error(err);
			return { outcome: { status: "failed", error: err }, def: null };
		}
		return { outcome: await runImportFlow({ app: this.app, importer: this.importer, gate: this.gate }, def), def };
	}

	private _disableAction(c: Candidate): void {
		if (!this.list?.isSelected(c)) return;
		const btn = this.list.pane?.querySelector<HTMLButtonElement>(".sf-catalog-act button");
		if (btn) btn.disabled = true;
	}

	private _showOutcome(c: Candidate, outcome: ImportOutcome, def: ViewDefinition | null): void {
		const list = this.list!;
		if (outcome.status === "imported") {
			list.showDetail(c, { text: successText(def ?? { ...c.def!, name: c.name }), tone: "success" });
			list.pane?.querySelector<HTMLElement>(".sf-picker-feedback")?.focus();
			return;
		}
		const fb: Feedback = outcome.status === "declined"
			? { text: CLOSED_REVIEW, tone: "neutral" }
			: refusalFor(outcome.error, c.path);
		list.showDetail(c, fb);
		list.pane?.querySelector<HTMLButtonElement>(".sf-catalog-act button")?.focus();
	}
}
