/**
 * fieldCommit — the editor pane's write path (T5.4).
 *
 * T5.2 built controls that *report* an edit and T5.3 mounted them from the
 * `FieldModel`; this module is the seam between that report and the file. It
 * maps a `FieldDef` to the writer's `FieldSpec`, hands the value to
 * `inspector/frontmatterWriter`, and — when the writer refuses — puts the value
 * the file actually holds back into the control.
 *
 * **CON-1: this module opens no write path of its own.** It calls `commit` and
 * nothing else; validation comes free with it, which is the point of routing
 * every write through one seam. A test greps this file for direct vault-write
 * APIs.
 *
 * **A ruled divergence from `InspectorController` — do not "fix" it back.**
 * The writer returns `keepDirty: true` on both failure reasons, and the
 * Workbench inspector honours it by preserving the user's draft. This surface
 * must NOT: the Workbench has an explicit commit button, so a preserved draft
 * is recoverable there, whereas the editor pane commits **on change**, so a
 * preserved bad draft is a control that lies about the file. PRD/F5 ("the
 * previous value is restored"), the SDD's Error Handling row ("never leave the
 * UI showing a value the file does not have") and T5.4's own success criterion
 * all require the restore — on `reason: "validation"` *and* on `reason:
 * "write"`. There is deliberately **no Retry affordance** either; the SDD for
 * this surface asks only that the reason be surfaced.
 *
 * **Why a restore rebuilds the cell.** `renderFieldControl` is the only code
 * that knows how to seed a control of any of the fourteen types from a value —
 * a text box, a checkbox, a `<select>`, or a row of chips. Rebuilding the cell
 * through it is therefore one path for every type, where an in-place value
 * write would need a second implementation of the chip row that no other code
 * exercises. The rebuild consults the committed snapshot, never `valueOf`, so
 * it is a genuine rollback and not a re-read of the note.
 *
 * @ref docs/XDD/specs/008-codex-surface/plan/phase-5.md — T5.4
 * @ref docs/XDD/specs/008-codex-surface/requirements.md — F5, F6
 * @ref docs/XDD/specs/008-codex-surface/solution.md — Error Handling
 */

import { Notice, type App, type TFile } from "obsidian";
import {
	FIELD_CONTROL_ATTR,
	renderFieldControl,
	type FieldEdit,
	type FieldValue,
	type MediaSeams,
} from "editor/fieldControls";
import type { FieldDef, FieldModel } from "editor/fieldModel";
import type { FieldType } from "fileclass/fileClassTypes";
// Relative, not the `inspector/...` alias every other internal import uses:
// eslint's `import/no-nodejs-modules` reads that bare specifier as Node's own
// `inspector` builtin. `AnvilView.ts` imports the same module the same way.
import { commit, type CommitError, type CommitResult, type FieldSpec } from "../inspector/frontmatterWriter";

// Obsidian's popout-window-aware document — the mock polyfills this to
// globalThis.document in jsdom test environments (the same local declaration
// `editorPane.ts` and `fieldControls.ts` use).
declare const activeDocument: Document;

/** Marks the inline failure message for a field; its value is the field's name. */
export const FIELD_ERROR_ATTR = "data-sf-ed-error";

// ---------------------------------------------------------------------------
// The type map
// ---------------------------------------------------------------------------

/**
 * Every metadata-menu field type this plugin renders, mapped to the writer's
 * spec type.
 *
 * A total `Record`, not a `switch` with a default: a fifteenth `FieldType`
 * fails to compile here rather than falling through to text unnoticed. The
 * fallback that IS wanted — `Unknown`, and the computed types the PRD puts out
 * of scope, which the reader already collapses into `Unknown` — is spelled out
 * as its own entry.
 *
 * `Date`/`Datetime`/`Time` are text because that is what they are in
 * frontmatter: a plain ISO-ish string a human could have typed. `Media` and
 * `MultiMedia` are relations because their stored value is a wikilink (PRD/F6
 * AC), which is what keeps them correct across a rename — their *control* is
 * T5.5's, but their write shape is decided by the type, not by the control.
 */
export const SPEC_TYPE: Readonly<Record<FieldType, FieldSpec["type"]>> = {
	Input: "text",
	Boolean: "boolean",
	Number: "number",
	Select: "select",
	Cycle: "select",
	Multi: "list",
	Date: "text",
	Datetime: "text",
	Time: "text",
	File: "relation",
	MultiFile: "relation",
	Media: "relation",
	MultiMedia: "relation",
	Unknown: "text",
};

/** The writer's descriptor for `field` — including a Select's declared vocabulary. */
export function specFor(field: FieldDef): FieldSpec {
	const type = SPEC_TYPE[field.type];
	switch (type) {
		case "select":
			return field.values === undefined
				? { name: field.name, type }
				: { name: field.name, type, values: field.values };
		// Split, not combined: each arm must narrow to ONE literal, or the
		// returned object matches no single member of the `FieldSpec` union.
		case "number":
			return { name: field.name, type };
		case "boolean":
			return { name: field.name, type };
		default:
			return { name: field.name, type };
	}
}

// ---------------------------------------------------------------------------
// The committer
// ---------------------------------------------------------------------------

export interface FieldCommitOptions {
	readonly app: App;
	/** The note being edited. A `TFile`, not a path: the host re-resolves it every render. */
	readonly file: TFile;
	/** The model the pane was rendered from — gives the `FieldDef` behind a reported name. */
	readonly model: FieldModel;
	/** The element the controls were rendered into (`.sf-ed-grid`). */
	readonly host: HTMLElement;
	/** The note's current value for a key — read ONCE per field, to snapshot. */
	readonly valueOf: (name: string) => unknown;
	/**
	 * A write for `name` has been issued and has not landed yet.
	 *
	 * The host needs this because a render can happen *during* the write —
	 * `metadataCache` has not caught up, so anything rebuilt from it would show
	 * the pre-edit value. The host is the right owner rather than this class:
	 * a render REPLACES the committer, so state kept here would be discarded at
	 * exactly the moment it matters.
	 */
	readonly onWriteIssued?: (name: string, value: FieldValue) => void;
	/** That write has settled, refused or not. Always fires, once per issue. */
	readonly onWriteSettled?: (name: string) => void;
	/**
	 * A failure was rolled back on a pane that is **no longer on screen** — the
	 * live one still shows the refused value and must be reseeded from the file.
	 */
	readonly onNeedsReseed?: () => void;
	/**
	 * The `Media` control's seams. A rollback rebuilds the cell, and a rebuilt
	 * `Media` control without them would lose its preview and picker.
	 */
	readonly media?: MediaSeams;
}

/**
 * Turns a control's reported edit into a frontmatter write.
 *
 * One instance per pane render, owning the snapshot of what the file held when
 * the pane was drawn. That snapshot is the rollback target, and it is why the
 * committer is created beside `renderFieldSections` rather than once per view.
 */
export class FieldCommitter {
	private readonly _fields = new Map<string, FieldDef>();
	/** What the file holds for each field, as far as this committer knows. */
	private readonly _committed = new Map<string, unknown>();

	constructor(private readonly _opts: FieldCommitOptions) {
		for (const section of _opts.model.sections) {
			for (const field of section.fields) {
				this._fields.set(field.name, field);
				this._committed.set(field.name, _opts.valueOf(field.name));
			}
		}
	}

	/**
	 * The `FieldSectionsDeps.onEdit` seam. An arrow property, not a method, so
	 * it can be handed to a control and to `renderFieldControl` on rollback
	 * without either needing to bind it.
	 */
	readonly onEdit = (edit: FieldEdit): void => {
		void this._commit(edit);
	};

	private async _commit(edit: FieldEdit): Promise<void> {
		const field = this._fields.get(edit.name);
		// A name no section declares cannot be rolled back to anything, so it is
		// not written either — the pane only ever renders fields from the model.
		if (field === undefined) return;

		this._clearError(edit.name);
		this._opts.onWriteIssued?.(edit.name, edit.value);
		try {
			const result: CommitResult = await commit(
				this._opts.app,
				this._opts.file,
				edit.name,
				edit.value,
				specFor(field),
			);
			if (result.ok) {
				this._committed.set(edit.name, edit.value);
				return;
			}
			this._restore(edit.name, field);
			this._surface(edit.name, this._failureText(result));
			// A render during the write rebuilt the pane, so everything above just
			// fixed a DETACHED tree — `querySelectorAll` works there, which is
			// precisely why this fails silently rather than throwing. The live pane
			// is still showing the value the file refused, and only the host can
			// put that right.
			if (!this._opts.host.isConnected) this._opts.onNeedsReseed?.();
		} finally {
			// In a `finally` so the host's in-flight record is released even if
			// something above throws. A stuck record would make the host defer
			// every reconcile from then on.
			this._opts.onWriteSettled?.(edit.name);
		}
	}

	/** The writer's reason plus what THIS surface did about it: it restored the old value. */
	private _failureText(result: CommitError): string {
		return result.reason === "write" ? `${result.message} The previous value was restored.` : result.message;
	}

	/** Rebuild the field's control from the committed snapshot (see the module docstring). */
	private _restore(name: string, field: FieldDef): void {
		const cell = this._cellFor(name);
		const parent = cell?.parentElement;
		if (!cell || !parent) return;

		const fresh = renderFieldControl(parent, field, this._committed.get(name) ?? null, {
			onEdit: this.onEdit,
			...this._opts.media,
		});
		parent.insertBefore(fresh.el, cell);
		// Carry the control's id across, or T5.3's `<label for=...>` would name an
		// element that no longer exists — an unassociated label is worse than none.
		const previous = cell.querySelector<HTMLElement>("input, select, textarea");
		const replacement = fresh.el.querySelector<HTMLElement>("input, select, textarea");
		if (previous && replacement) replacement.id = previous.id;
		cell.remove();
	}

	/** Surface the reason: inline on the field (SDD) plus a transient `Notice`. */
	private _surface(name: string, message: string): void {
		const cell = this._cellFor(name);
		if (cell) {
			const error = activeDocument.createElement("div");
			error.className = "sf-ed-err";
			error.setAttribute(FIELD_ERROR_ATTR, name);
			// The message appears without any focus change, so it needs to announce
			// itself rather than wait to be found.
			error.setAttribute("role", "alert");
			error.textContent = message;
			cell.after(error);
		}
		new Notice(message);
	}

	private _clearError(name: string): void {
		for (const el of this._scan(FIELD_ERROR_ATTR, name)) el.remove();
	}

	private _cellFor(name: string): HTMLElement | null {
		return this._scan(FIELD_CONTROL_ATTR, name)[0] ?? null;
	}

	/**
	 * Elements under the host whose `attribute` equals `name`.
	 *
	 * A manual scan rather than an attribute selector: a frontmatter key is
	 * whatever the user's file contains, quotes and brackets included, and
	 * `CSS.escape` is not reliably present in jsdom. Same call `AnvilView`
	 * already makes for card paths.
	 */
	private _scan(attribute: string, name: string): HTMLElement[] {
		const all = this._opts.host.querySelectorAll<HTMLElement>(`[${attribute}]`);
		return Array.from(all).filter((el) => el.getAttribute(attribute) === name);
	}
}
