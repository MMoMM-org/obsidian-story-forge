/**
 * InspectorController — edit-mode overlay hosted inside SidebarView.
 *
 * Hosts transient in-memory per-field dirty/saving/saved/error state.
 * Renders M3 read-only detail plus editable scalar/enum controls for the
 * active entity. Delegates writes to frontmatterWriter.commit.
 *
 * Listener discipline (CON-4):
 *   Delegated DOM listeners are attached via container.addEventListener with an
 *   AbortSignal. A new AbortController is created at the start of each render()
 *   call and its previous controller is aborted, so listeners from a prior
 *   container are released immediately (no accumulation across re-renders). The
 *   controller is also aborted in teardown() and via owner.register() on
 *   Component unload — three layers of cleanup.
 *
 * Dirty-guard (SDD/ADR-3, SDD §Interaction Design):
 *   The controller exposes `notifyFileChanged(file)` so SidebarView can forward
 *   metadataCache.changed events. The controller ignores these notifications when
 *   any field is in a dirty/saving/error state, mirroring _renderRelevantEqual's
 *   generation-guard approach (SidebarView.ts:838). This prevents the writer's
 *   own processFrontMatter fan-out from wiping an in-flight edit.
 *
 * Out-of-vocab advisory (ADR-7 carry-over):
 *   When a select field is committed successfully ({ok:true}) but the value is
 *   not in the declared vocabulary, the controller shows a non-blocking inline
 *   advisory cue ([data-sf-inspector-advisory]). Detection uses editableFields'
 *   selectVocab — no changes to frontmatterWriter's return shape.
 *
 * @ref SDD/ADR-3 — Inspector home = edit-mode overlay inside SidebarView
 * @ref SDD/ADR-7 — block type errors, warn vocab; out-of-vocab advisory visible
 * @ref PRD/AC-F6.1 — read-only detail + editable scalar/enum
 * @ref PRD/AC-F6.2 — dirty state
 * @ref PRD/AC-F6.4 — committed edit fans out via metadataCache
 * @ref CON-1 — transient in-memory state only, NEVER persisted
 * @ref CON-4 — teardown discipline: AbortSignal + owner.register, no registerDomEvent
 */

import type { App, TFile, Component } from "obsidian";
import type { NoteContext } from "scoping/NoteContext";
import { commit } from "./frontmatterWriter";
import { isScalarEditable, selectVocab } from "./editableFields";
import type { FieldSpec } from "./frontmatterWriter";
import { unresolvedEl, stampLinkEl } from "../panel/components";

declare const activeDocument: Document;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Per-field transient state (never persisted — CON-1). */
type FieldStatus =
	| { kind: "clean" }
	| { kind: "dirty" }
	| { kind: "saving" }
	| { kind: "saved" }
	| { kind: "error"; reason: "validation" | "write"; message: string };

interface FieldState {
	spec: FieldSpec;
	committedValue: unknown;
	draftValue: unknown;
	status: FieldStatus;
	/** DOM: the commit affordance element for this field, if rendered. */
	commitEl: HTMLElement | null;
	/** DOM: the error/advisory element for this field, if rendered. */
	feedbackEl: HTMLElement | null;
	/** DOM: the retry element for this field, if rendered. */
	retryEl: HTMLElement | null;
	/** DOM: the input/select for this field. */
	inputEl: HTMLElement | null;
	/**
	 * True when the last successful commit was an out-of-vocab select value.
	 * Drives the inline advisory cue (ADR-7 carry-over). Never persisted (CON-1).
	 */
	_outOfVocabAdvisory: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Stringify a frontmatter value to a displayable string. */
function displayValue(v: unknown): string {
	if (v === null || v === undefined) return "";
	if (Array.isArray(v)) return (v as unknown[]).map(item => String(item)).join(", ");
	if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
	return "[complex value]";
}

/** Read the scalar input value from an input or select element. */
function readInputValue(el: HTMLElement, _fieldType: FieldSpec["type"]): unknown {
	// Distinguish input vs select by tag name — avoids cross-window .instanceOf()
	// issues in test environments while matching behaviour in the real runtime.
	const tag = el.tagName.toLowerCase();
	if (tag === "input") {
		const inputEl = el as HTMLInputElement;
		if (inputEl.type === "checkbox") return inputEl.checked;
		// Number fields use type="text" with data-sf-field-type="number"
		// to preserve the raw string during editing. The value is parsed only
		// when the user commits (frontmatterWriter validates the type).
		const isNumericField = el.getAttribute("data-sf-field-type") === "number";
		if (isNumericField) {
			if (inputEl.value === "") return null;
			// Try to parse; if it's a valid number return it, else return the raw string
			// (will fail validation in frontmatterWriter, but is preserved in the input)
			const n = parseFloat(inputEl.value);
			return isNaN(n) ? inputEl.value : n;
		}
		return inputEl.value === "" ? null : inputEl.value;
	}
	if (tag === "select") {
		const selEl = el as HTMLSelectElement;
		return selEl.value === "" ? null : selEl.value;
	}
	return null;
}

/** Return true if the given value is out of the declared select vocabulary. */
function isOutOfVocab(spec: FieldSpec, value: unknown): boolean {
	const vocab = selectVocab(spec);
	if (!vocab || vocab.length === 0) return false;
	return typeof value === "string" && !vocab.includes(value);
}

/** Safely convert a known-primitive unknown value to string for comparison. */
function toComparableString(v: unknown): string {
	if (v === null || v === undefined) return "";
	if (typeof v === "string") return v;
	if (typeof v === "number" || typeof v === "boolean") return String(v);
	return "";
}

// ---------------------------------------------------------------------------
// InspectorController
// ---------------------------------------------------------------------------

export class InspectorController {
	private readonly app: App;
	/** Per-field state keyed by field name. Transient — cleared on teardown. */
	private fieldStates: Map<string, FieldState> = new Map();
	/** Current context snapshot. */
	private ctx: NoteContext | null = null;
	/**
	 * Generation counter. Incremented on every render/teardown. Async commit
	 * callbacks capture the gen at dispatch time and bail if stale.
	 */
	private gen = 0;
	/**
	 * AbortController for the current set of delegated DOM listeners.
	 *
	 * Aborted at the start of each render() and teardown() so old listeners on
	 * a recreated container are released immediately — preventing accumulation
	 * on the owner Component across re-renders. The owner's unload also calls
	 * abort() via owner.register() (registered once in the constructor).
	 */
	private _listenerController: AbortController | null = null;

	constructor(app: App, owner: Component) {
		this.app = app;
		// Ensure DOM listeners are cleaned up when the owning Component is unloaded.
		owner.register(() => { this._listenerController?.abort(); });
	}

	// -------------------------------------------------------------------------
	// Public API
	// -------------------------------------------------------------------------

	/**
	 * Render the Inspector into `container` for the given context and fields.
	 *
	 * Delegated listeners are attached via container.addEventListener with an
	 * AbortSignal (replaced on each render — no per-field-per-render accumulation).
	 *
	 * Re-rendering (new subject) should be preceded by teardown() to clear state.
	 *
	 * @param headings  field name -> a heading to draw above that field's row
	 */
	render(
		container: HTMLElement,
		ctx: NoteContext,
		fields: FieldSpec[],
		headings: ReadonlyMap<string, string> = new Map(),
	): void {
		this.ctx = ctx;

		// Build fresh per-field state for fields not already tracked.
		// Existing dirty/error state for the same field key is PRESERVED across
		// re-renders of the same subject (dirty-guard — see notifyFileChanged).
		for (const spec of fields) {
			if (!this.fieldStates.has(spec.name)) {
				this.fieldStates.set(spec.name, {
					spec,
					committedValue: ctx.frontmatter[spec.name] ?? null,
					draftValue: ctx.frontmatter[spec.name] ?? null,
					status: { kind: "clean" },
					commitEl: null,
					feedbackEl: null,
					retryEl: null,
					inputEl: null,
					_outOfVocabAdvisory: false,
				});
			} else {
				// Update spec + committedValue (may have changed after a write fan-out)
				// BUT preserve draftValue + status so an in-flight edit survives.
				const existing = this.fieldStates.get(spec.name)!;
				existing.spec = spec;
				// Only refresh committedValue when field is clean (guard dirty edits)
				if (existing.status.kind === "clean") {
					existing.committedValue = ctx.frontmatter[spec.name] ?? null;
					existing.draftValue = ctx.frontmatter[spec.name] ?? null;
				}
			}
		}

		this._renderFields(container, fields, headings);
		// Abort any previous listener set (prevents accumulation across re-renders).
		this._listenerController?.abort();
		this._listenerController = new AbortController();
		this._registerDelegatedListeners(container, this._listenerController.signal);
	}

	/**
	 * Tear down transient state. Called by SidebarView on onClose or re-subject.
	 * Clears all dirty/error state from memory (never persisted — CON-1).
	 */
	teardown(): void {
		this.fieldStates.clear();
		this.ctx = null;
		this.gen++;
		this._listenerController?.abort();
		this._listenerController = null;
	}

	/**
	 * Notify the controller that a file has changed in metadataCache.
	 *
	 * Dirty-guard: if the file matches the current subject AND any field is
	 * dirty/saving/error, the notification is silently dropped. This prevents
	 * the writer's own metadataCache.changed fan-out from wiping an in-flight edit.
	 *
	 * @returns `true` if the guard fired (caller MUST skip re-render to preserve
	 *   the in-flight edit); `false` if all fields are clean/saved and the caller
	 *   should proceed with re-rendering to pick up new frontmatter values.
	 */
	notifyFileChanged(file: TFile): boolean {
		if (!this.ctx || file.path !== this.ctx.activeFile.path) return false;

		// Dirty-guard: any field in a non-clean/saved state → preserve in-flight edits
		for (const state of this.fieldStates.values()) {
			if (state.status.kind !== "clean" && state.status.kind !== "saved") {
				return true; // Guard fired — caller must skip re-render
			}
		}

		// All fields are clean/saved — caller should proceed with re-render.
		return false;
	}

	// -------------------------------------------------------------------------
	// DOM rendering
	// -------------------------------------------------------------------------

	private _renderFields(
		container: HTMLElement,
		fields: FieldSpec[],
		headings: ReadonlyMap<string, string>,
	): void {
		for (const spec of fields) {
			const state = this.fieldStates.get(spec.name)!;
			const heading = headings.get(spec.name);
			if (heading !== undefined) {
				const headingEl = activeDocument.createElement("h4");
				headingEl.className = "sf-inspector-section";
				headingEl.textContent = heading;
				container.appendChild(headingEl);
			}
			const fieldRow = activeDocument.createElement("div");
			fieldRow.className = "sf-inspector-field";

			const labelEl = activeDocument.createElement("span");
			labelEl.className = "sf-inspector-label";
			labelEl.textContent = spec.name;
			labelEl.setAttribute("data-sf-inspector-field-label", spec.name);
			fieldRow.appendChild(labelEl);

			if (isScalarEditable(spec)) {
				this._renderEditableField(fieldRow, spec, state);
			} else {
				this._renderReadOnlyField(fieldRow, spec, state);
			}

			container.appendChild(fieldRow);
		}
	}

	private _renderEditableField(
		fieldRow: HTMLElement,
		spec: FieldSpec,
		state: FieldState,
	): void {
		const value = state.draftValue;

		if (spec.type === "select") {
			const vocab = selectVocab(spec) ?? [];
			const sel = activeDocument.createElement("select");
			sel.className = "sf-inspector-input sf-inspector-select";
			sel.setAttribute("data-sf-inspector-input", spec.name);

			// Add an empty option for null/undefined
			const emptyOpt = activeDocument.createElement("option");
			emptyOpt.value = "";
			emptyOpt.textContent = "—";
			sel.appendChild(emptyOpt);

			// Add vocab options
			for (const v of vocab) {
				const opt = activeDocument.createElement("option");
				opt.value = v;
				opt.textContent = v;
				sel.appendChild(opt);
			}

			// Handle pre-existing out-of-vocab value
			const strValue = typeof value === "string" ? value : "";
			if (strValue && !vocab.includes(strValue)) {
				const outOpt = activeDocument.createElement("option");
				outOpt.value = strValue;
				outOpt.textContent = strValue;
				sel.appendChild(outOpt);
			}

			sel.value = strValue;
			fieldRow.appendChild(sel);
			state.inputEl = sel;
		} else if (spec.type === "boolean") {
			// A real checkbox: the writer rejects the string "true" for a boolean field.
			const input = activeDocument.createElement("input");
			input.type = "checkbox";
			input.className = "sf-inspector-checkbox";
			input.setAttribute("data-sf-inspector-input", spec.name);
			input.checked = value === true;
			fieldRow.appendChild(input);
			state.inputEl = input;
		} else if (spec.type === "number") {
			const input = activeDocument.createElement("input");
			// Use type="text" to allow intermediate values (e.g. "12.", "-5", "thirty")
			// and preserve the edit on validation error. Numeric validation runs in
			// frontmatterWriter.commit, not in the DOM. This is intentional for UX
			// (user can see their invalid entry when the error appears) and matches
			// the "preserve the edit" requirement (AC-F6.5).
			input.type = "text";
			input.inputMode = "numeric";
			input.className = "sf-inspector-input sf-inspector-number";
			input.setAttribute("data-sf-field-type", "number");
			input.setAttribute("data-sf-inspector-input", spec.name);
			input.value = value !== null && value !== undefined ? toComparableString(value) : "";
			fieldRow.appendChild(input);
			state.inputEl = input;
		} else {
			// text and other scalar types
			const input = activeDocument.createElement("input");
			input.type = "text";
			input.className = "sf-inspector-input sf-inspector-text";
			input.setAttribute("data-sf-inspector-input", spec.name);
			input.value = value !== null && value !== undefined ? toComparableString(value) : "";
			fieldRow.appendChild(input);
			state.inputEl = input;
		}

		// Render affordance elements based on current state
		this._updateFieldAffordances(fieldRow, spec, state);
	}

	private _renderReadOnlyField(
		fieldRow: HTMLElement,
		spec: FieldSpec,
		state: FieldState,
	): void {
		// A `relation` covers one link and many (`SPEC_TYPE.MultiFile`), and only the
		// value says which. The single chip would join a list into one broken link.
		if (spec.type === "relation" && !Array.isArray(state.committedValue)) {
			this._renderRelationChip(fieldRow, spec, state);
		} else if (spec.type === "relation" || spec.type === "list" || spec.type === "tags") {
			this._renderListChips(fieldRow, state);
		} else {
			// fixed and any other read-only types: plain text display
			const valueEl = activeDocument.createElement("span");
			valueEl.className = "sf-inspector-readonly-value";
			valueEl.textContent = displayValue(state.committedValue) || "—";
			fieldRow.appendChild(valueEl);
		}
	}

	/** Render a relation field as a resolved link chip or an unresolved muted element. */
	private _renderRelationChip(
		fieldRow: HTMLElement,
		spec: FieldSpec,
		state: FieldState,
	): void {
		const raw = state.committedValue;
		const rawStr = displayValue(raw);
		if (!rawStr) {
			const emptyEl = activeDocument.createElement("span");
			emptyEl.className = "sf-inspector-readonly-value";
			emptyEl.textContent = "—";
			fieldRow.appendChild(emptyEl);
			return;
		}
		// Strip [[wikilink]] brackets if present (Obsidian may store them raw)
		const linkText = rawStr.replace(/^\[\[(.+?)\]\]$/, "$1");
		const sourcePath = this.ctx?.activeFile.path ?? "";
		const resolvedFile = this.app.metadataCache.getFirstLinkpathDest(linkText, sourcePath);
		if (resolvedFile) {
			// Resolved: read-only link chip using stampLinkEl (activeDocument.createElement,
			// no Obsidian createEl augmentation needed — safe in tests and runtime). The chip
			// carries data-sf-link so the SidebarView delegated handler can route it (AC-F8.1).
			const chipEl = activeDocument.createElement("div");
			chipEl.className = "sf-inspector-ro-chip";
			chipEl.setAttribute("aria-label", spec.name);
			chipEl.appendChild(stampLinkEl(resolvedFile.basename, resolvedFile.path));
			fieldRow.appendChild(chipEl);
		} else {
			// Unresolved: muted, non-clickable M3 treatment (AC-F8.2). unresolvedEl uses
			// activeDocument.createElement — safe in tests and runtime.
			fieldRow.appendChild(unresolvedEl(linkText));
		}
	}

	/**
	 * Render a list or tags field as read-only chips.
	 *
	 * Items written as `[[wikilinks]]` (relation lists — characters, plotlines,
	 * prev, next, family, …) resolve to clickable link chips carrying data-sf-link
	 * (routed by SidebarView's delegated handler), mirroring _renderRelationChip.
	 * Plain-string lists (aliases, tags, distinctive_features) stay as text chips.
	 */
	private _renderListChips(
		fieldRow: HTMLElement,
		state: FieldState,
	): void {
		const raw = state.committedValue;
		const items = Array.isArray(raw)
			? (raw as unknown[]).map(displayValue).filter(Boolean)
			: displayValue(raw)
				? [displayValue(raw)]
				: [];
		if (items.length === 0) {
			const emptyEl = activeDocument.createElement("span");
			emptyEl.className = "sf-inspector-readonly-value";
			emptyEl.textContent = "—";
			fieldRow.appendChild(emptyEl);
			return;
		}
		const sourcePath = this.ctx?.activeFile.path ?? "";
		const chipsEl = activeDocument.createElement("div");
		chipsEl.className = "sf-inspector-chips";
		for (const item of items) {
			const linkMatch = /^\[\[(.+?)\]\]$/.exec(item);
			const linkText = linkMatch?.[1];
			if (linkText) {
				// Wikilink item → clickable chip (or muted unresolved treatment).
				const resolved = this.app.metadataCache.getFirstLinkpathDest(linkText, sourcePath);
				if (resolved) {
					const chip = activeDocument.createElement("span");
					chip.className = "sf-inspector-chip sf-inspector-chip-link";
					chip.appendChild(stampLinkEl(resolved.basename, resolved.path));
					chipsEl.appendChild(chip);
				} else {
					chipsEl.appendChild(unresolvedEl(linkText));
				}
			} else {
				// Plain-string list item → non-clickable text chip.
				const chip = activeDocument.createElement("span");
				chip.className = "sf-inspector-chip";
				chip.setAttribute("data-sf-inspector-ro", "true");
				chip.textContent = item;
				chipsEl.appendChild(chip);
			}
		}
		fieldRow.appendChild(chipsEl);
	}

	/** Update (or create) the commit/error/retry/advisory elements for a field. */
	private _updateFieldAffordances(
		fieldRow: HTMLElement,
		spec: FieldSpec,
		state: FieldState,
	): void {
		// Remove stale affordances
		state.commitEl?.remove();
		state.feedbackEl?.remove();
		state.retryEl?.remove();
		state.commitEl = null;
		state.feedbackEl = null;
		state.retryEl = null;

		if (state.status.kind === "dirty") {
			// Commit affordance
			const btn = activeDocument.createElement("button");
			btn.className = "sf-inspector-commit-btn";
			btn.setAttribute("data-sf-inspector-commit", spec.name);
			btn.textContent = "Save";
			fieldRow.appendChild(btn);
			state.commitEl = btn;
		} else if (state.status.kind === "error") {
			const err = state.status;

			// Commit affordance stays visible so user can fix + retry
			const btn = activeDocument.createElement("button");
			btn.className = "sf-inspector-commit-btn";
			btn.setAttribute("data-sf-inspector-commit", spec.name);
			btn.textContent = "Save";
			fieldRow.appendChild(btn);
			state.commitEl = btn;

			// Error feedback
			const errEl = activeDocument.createElement("span");
			errEl.className = "sf-inspector-error";
			errEl.setAttribute("data-sf-inspector-error", spec.name);
			errEl.textContent = err.message;
			fieldRow.appendChild(errEl);
			state.feedbackEl = errEl;

			// Retry button for write errors
			if (err.reason === "write") {
				const retryBtn = activeDocument.createElement("button");
				retryBtn.className = "sf-inspector-retry-btn";
				retryBtn.setAttribute("data-sf-inspector-retry", spec.name);
				retryBtn.textContent = "Retry";
				fieldRow.appendChild(retryBtn);
				state.retryEl = retryBtn;
			}
		} else if (state.status.kind === "saved") {
			// Saved: show advisory if out-of-vocab, otherwise clean (no affordances)
			if (state._outOfVocabAdvisory) {
				const advisoryEl = activeDocument.createElement("span");
				advisoryEl.className = "sf-inspector-advisory";
				advisoryEl.setAttribute("data-sf-inspector-advisory", spec.name);
				advisoryEl.textContent = `"${toComparableString(state.draftValue)}" is not in the declared vocabulary (written anyway).`;
				fieldRow.appendChild(advisoryEl);
				state.feedbackEl = advisoryEl;
			}
		}
	}

	// -------------------------------------------------------------------------
	// Delegated event listener (registered once per render, not per field)
	// -------------------------------------------------------------------------

	private _registerDelegatedListeners(container: HTMLElement, signal: AbortSignal): void {
		// Input changes — track dirty state.
		// Use container.addEventListener with { signal } so the old listeners from a
		// prior render are aborted when _listenerController is aborted — no accumulation.
		container.addEventListener("input", (e: Event) => {
			const target = e.target as HTMLElement;
			const fieldName = target.getAttribute("data-sf-inspector-input");
			if (!fieldName) return;
			const state = this.fieldStates.get(fieldName);
			if (!state) return;

			const newValue = readInputValue(target, state.spec.type);
			state.draftValue = newValue;

			// Special: both null-ish → clean
			const committedNullish = state.committedValue === null || state.committedValue === undefined;
			const draftNullish = newValue === null || newValue === "";

			if (committedNullish && draftNullish) {
				state.status = { kind: "clean" };
			} else if (toComparableString(newValue) === toComparableString(state.committedValue)) {
				state.status = { kind: "clean" };
			} else {
				state.status = { kind: "dirty" };
			}

			this._updateFieldAffordances(target.closest(".sf-inspector-field") as HTMLElement ?? container, state.spec, state);
		}, { signal });

		// Select changes
		container.addEventListener("change", (e: Event) => {
			const target = e.target as HTMLElement;
			if (target.tagName.toLowerCase() !== "select") return;
			const fieldName = target.getAttribute("data-sf-inspector-input");
			if (!fieldName) return;
			const state = this.fieldStates.get(fieldName);
			if (!state) return;

			const selValue = (target as HTMLSelectElement).value;
			const newValue = selValue === "" ? null : selValue;
			state.draftValue = newValue;

			const committedNullish = state.committedValue === null || state.committedValue === undefined;
			const draftNullish = newValue === null;

			if (committedNullish && draftNullish) {
				state.status = { kind: "clean" };
			} else if (toComparableString(newValue) === toComparableString(state.committedValue)) {
				state.status = { kind: "clean" };
			} else {
				state.status = { kind: "dirty" };
			}

			this._updateFieldAffordances(target.closest(".sf-inspector-field") as HTMLElement ?? container, state.spec, state);
		}, { signal });

		// Commit button clicks
		container.addEventListener("click", (e: Event) => {
			const target = e.target as HTMLElement;

			// Commit button
			const commitTarget = target.closest("[data-sf-inspector-commit]");
			if (commitTarget) {
				const fieldName = commitTarget.getAttribute("data-sf-inspector-commit");
				if (fieldName) void this._commitField(fieldName, container);
				return;
			}

			// Retry button
			const retryTarget = target.closest("[data-sf-inspector-retry]");
			if (retryTarget) {
				const fieldName = retryTarget.getAttribute("data-sf-inspector-retry");
				if (fieldName) void this._commitField(fieldName, container);
			}
		}, { signal });
	}

	// -------------------------------------------------------------------------
	// Commit logic
	// -------------------------------------------------------------------------

	private async _commitField(fieldName: string, container: HTMLElement): Promise<void> {
		const state = this.fieldStates.get(fieldName);
		const ctx = this.ctx;
		if (!state || !ctx) return;

		// Capture generation — bail if stale after awaits
		const capturedGen = this.gen;

		state.status = { kind: "saving" };

		const result = await commit(
			this.app,
			ctx.activeFile,
			fieldName,
			state.draftValue,
			state.spec,
		);

		// Dirty-guard: bail if this render context is stale
		if (this.gen !== capturedGen) return;

		if (result.ok) {
			// Check out-of-vocab advisory (ADR-7)
			const outOfVocab = isOutOfVocab(state.spec, state.draftValue);
			state._outOfVocabAdvisory = outOfVocab;

			state.status = { kind: "saved" };
			// Update committed value — the write succeeded
			state.committedValue = state.draftValue;
		} else {
			// Error: validation or write — preserve draft (keepDirty)
			state._outOfVocabAdvisory = false;
			state.status = {
				kind: "error",
				reason: result.reason,
				message: result.reason === "write" ? `${result.message} Your edits are kept.` : result.message,
			};
		}

		// Update affordances in the field row.
		// Use the input element's parent (.sf-inspector-field) as the anchor.
		// Avoid :has() pseudo-class (not universally supported in jsdom).
		const inputEl = container.querySelector(`[data-sf-inspector-input="${fieldName}"]`);
		const targetRow = (
			inputEl?.closest(".sf-inspector-field") ??
			state.commitEl?.closest(".sf-inspector-field") ??
			state.retryEl?.closest(".sf-inspector-field")
		) as HTMLElement | null;

		if (targetRow) {
			this._updateFieldAffordances(targetRow, state.spec, state);
		}
	}
}

