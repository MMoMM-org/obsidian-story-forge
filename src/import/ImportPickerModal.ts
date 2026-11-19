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

/** A file the scan offered. */
interface CandidateBase {
	file: TFile;
	path: string;
	/** sf-name / the `.base` name; the file name when it could not be parsed. */
	name: string;
	description?: string | undefined;
}

/** A file that parsed: it can be imported. `def` is the scan's parse (the preview). */
interface Importable extends CandidateBase {
	kind: "ok";
	engine: CatalogEngine;
	def: ViewDefinition;
}

/**
 * A file that did not parse (R2): listed as "Can't import" with its refusal. Its engine is known
 * only for a `.base`; a note whose query can't be read has none (it counts only in "All").
 */
interface Unimportable extends CandidateBase {
	kind: "failed";
	engine?: CatalogEngine | undefined;
	problem: Feedback;
}

type Candidate = Importable | Unimportable;

/** What one Import came to: the freshly parsed definition when it was saved. */
type ImportResult =
	| { status: "imported"; def: ViewDefinition }
	| { status: "declined" }
	| { status: "failed"; error: unknown };

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
		const scanned = await this._scanSafely();
		if (this.closed || scanned === null) return;

		if (!Array.isArray(scanned)) this._renderScanError(el, scanned.error);
		else if (scanned.length === 0) this._renderEmpty(el);
		else this._mountList(el, scanned);

		const close = el.createDiv({ cls: "sf-picker-foot" }).createEl("button", { text: "Close", attr: { type: "button" } });
		close.addEventListener("click", () => this.close());
		if (this.list) this.list.focusStart(close);
		else close.focus();
	}

	/** `_scan`, with a failing scan (or store read) reported instead of thrown (A2). */
	private async _scanSafely(): Promise<Candidate[] | null | { error: unknown }> {
		try {
			return await this._scan();
		} catch (err) {
			console.error(err);
			return { error: err };
		}
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
			return { kind: "ok", file, path: file.path, name: def.name, description: def.description, engine: def.engine, def };
		} catch (err) {
			console.debug("[StoryForge] could not parse collection candidate", file.path, err);
			const engine = file.extension === BASE_EXTENSION ? "bases" : undefined;
			return { kind: "failed", file, path: file.path, name: file.basename, engine, problem: { ...refusalFor(err, file.path), role: "note" } };
		}
	}

	/** A2: the vault could not be listed. Not drawn in the mockup; the modal still offers Close. */
	private _renderScanError(el: HTMLElement, err: unknown): void {
		const raw = err instanceof Error ? err.message : String(err);
		renderFeedback(el.createDiv({ cls: "sf-catalog-split is-single" }), {
			text: "Could not list the vault's collections.",
			raw,
			tone: "error",
		});
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
		if (c.kind === "failed") host.createSpan({ cls: ["sf-catalog-status", "is-bad"], text: "Can't import" });
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
		if (c.kind === "failed" || this.imported.has(c.path)) this._renderStatus(head, c);
		if (c.description) pane.createEl("p", { cls: "sf-catalog-preview-desc", text: c.description });

		const source = renderLabelled(pane, "Source file", "sf-catalog-preview-dest");
		source.createDiv().createSpan({ cls: "sf-catalog-path", text: c.path });
		source.createDiv({ cls: "sf-catalog-hint", text: "Stays where it is. Story Forge links to it, so editing the file changes the collection." });

		if (c.kind === "failed") {
			renderFeedback(pane, c.problem);
			pane.createDiv({ cls: "sf-catalog-act" }).createSpan({ cls: "sf-catalog-aside", text: "Fix the file, then open this window again." });
			return;
		}
		this._renderShowsIn(pane, c.engine);
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
	private _renderBody(pane: HTMLElement, c: Importable): void {
		const engine = c.engine;
		renderLabelled(pane, engine === "bases" ? "Preview" : "Query")
			.createEl("pre", { cls: "sf-catalog-preview-src", text: c.def.querySource.trimEnd() });
		if (engine === "dataviewjs") {
			const note = pane.createDiv({ cls: "sf-catalog-consent" });
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
	 * (re-selecting it rebuilds the button), so it imports once. Whatever happens, the id is released
	 * and the pane redrawn, so the button is usable again after a failure.
	 */
	private async _doImport(c: Importable): Promise<void> {
		if (this.inFlight.has(c.path)) return;
		this.inFlight.add(c.path);
		this._disableAction(c);
		let result: ImportResult;
		try {
			result = await this._runImport(c);
		} finally {
			this.inFlight.delete(c.path);
		}
		if (result.status === "imported") {
			this.imported.add(c.path);
			this.list?.repaintRow(c);
		}
		// The user moved on to another file: its pane is not this result's place (the row still updated).
		if (this.list?.isSelected(c)) this._showOutcome(c, result);
	}

	/**
	 * Re-parse the file (it may have changed since the scan), then run the flow. Never throws: any
	 * rejection on the way (parse, the consent dialog, the store) is `failed`, and logged when it is
	 * not an ImportError.
	 */
	private async _runImport(c: Importable): Promise<ImportResult> {
		try {
			const def = await this.importer.parse(c.file);
			const outcome: ImportOutcome = await runImportFlow({ app: this.app, importer: this.importer, gate: this.gate }, def);
			return outcome.status === "imported" ? { status: "imported", def } : outcome;
		} catch (err) {
			if (!(err instanceof ImportError)) console.error(err);
			return { status: "failed", error: err };
		}
	}

	private _disableAction(c: Candidate): void {
		if (!this.list?.isSelected(c)) return;
		const btn = this.list.pane?.querySelector<HTMLButtonElement>(".sf-catalog-act button");
		if (btn) btn.disabled = true;
	}

	private _showOutcome(c: Importable, result: ImportResult): void {
		const list = this.list;
		if (!list) return;
		if (result.status === "imported") {
			list.showDetail(c, { text: successText(result.def), tone: "success" });
			list.pane?.querySelector<HTMLElement>(".sf-picker-feedback")?.focus();
			return;
		}
		const fb: Feedback = result.status === "declined"
			? { text: CLOSED_REVIEW, tone: "neutral" }
			: refusalFor(result.error, c.path);
		list.showDetail(c, fb);
		list.pane?.querySelector<HTMLButtonElement>(".sf-catalog-act button")?.focus();
	}
}
