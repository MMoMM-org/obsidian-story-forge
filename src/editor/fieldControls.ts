/**
 * fieldControls — one editing control per metadata-menu field type (T5.2).
 *
 * The editor pane's contents. `renderFieldControl` takes a `FieldDef` (the pure
 * model, T1.3) plus the note's current value and builds the control that type
 * deserves: a text box, a number box, a checkbox, a date box, a `<select>` over
 * the declared values, or a row of chips for the list types. A type this plugin
 * does not render — `Unknown`, or one of the computed types the PRD puts out of
 * scope (`Lookup`/`Formula`/`Canvas`) — falls back to plain text rather than
 * failing: a FileClass written by a newer metadata-menu must degrade one field,
 * never break the pane (PRD/F6 AC).
 *
 * **Writes nothing (CON-1).** Controls render and *report*: an edit is handed to
 * `deps.onEdit`, and `handle.value()` returns what would be written. T5.4 wires
 * that seam to `frontmatterWriter.commit`, which stays the single write path.
 *
 * **The `editableField` marker's first producer** (recorded 2026-07-31). Every
 * control cell carries `FIELD_CONTROL_ATTR`; `markerVocabulary.ts` maps it to
 * `"editableField"` and the Anvil's whitelist recognises it, so a click on a
 * control resolves through the shared `NavigationController` to `focusField`
 * instead of inspecting or opening a note. Until this module existed that F2
 * matrix row was green in unit tests while unreachable from any real click —
 * which is why the marker is emitted here rather than described.
 *
 * **The out-of-list `Select`** (reconciled 2026-08-05, do not re-derive):
 * *selectable* is the declared list exactly, *displayed* is the declared list
 * plus the note's current value when that value is undeclared — shown marked
 * and **disabled**, so it is visible but cannot be re-chosen. The plugin
 * therefore never becomes the author of a value it does not declare, while the
 * control never shows an empty selection over a file that holds a value.
 *
 * **Listener discipline (CON-4).** Every listener is attached to an element this
 * module created, so it dies with the pane's DOM on the next `_render`; none
 * touch `document`, `window` or the app, and none survive the element they are
 * on. An `AbortSignal` seam was written and then removed: no host produced one,
 * so it was an untestable public option whose failure mode — a host passing a
 * signal that silently did nothing — nothing could have caught. Add it back
 * with a producer and a test when a host actually needs it.
 *
 * **The `Media` control (T5.5)** is selected by the field's declared **type**
 * and nothing else — not its name (`portrait` on a character, `image` on a
 * location/object) and not a `ui` hint (withdrawn, ADR-32 revised 2026-07-29).
 * It shows a preview, the stored wikilink as text, and Choose image… / Clear.
 * Resolving a link to a URL and picking a file need the vault, so both arrive
 * as seams (`resolveImage`, `pickImage`); a host that supplies no picker gets a
 * control without the Choose button rather than one that cannot do what it
 * says. `MultiMedia` stays on the text fallback: neither the mockup nor the
 * spec draws a multi-image control.
 *
 * Scope: controls only. Sections and the two-column layout are T5.3 and the
 * commit path T5.4.
 *
 * @ref docs/XDD/specs/008-codex-surface/plan/phase-5.md — T5.2
 * @ref docs/XDD/specs/008-codex-surface/requirements.md — F2, F5, F6
 * @ref docs/mockups/anvil-workbench-codex.html — S102, S103
 */

import type { FieldDef } from "editor/fieldModel";
import { portraitTile } from "panel/components";

// Obsidian's popout-window-aware document — the mock polyfills this to
// globalThis.document in jsdom test environments (the same local declaration
// `codexTab.ts`, `cardWrapper.ts` and `editorPane.ts` use).
declare const activeDocument: Document;

// ---------------------------------------------------------------------------
// Marker attributes — the single declaration site
// ---------------------------------------------------------------------------

/**
 * Marks a field control. Hosts classify it as `"editableField"`; its value is
 * the frontmatter key the control edits, so a host can tell which field was
 * clicked without the controller ever seeing one.
 */
export const FIELD_CONTROL_ATTR = "data-sf-ed-field";

/** The stored link shown as text beside a `Media` preview. */
export const MEDIA_PATH_ATTR = "data-sf-ed-media-path";

/** A chip's remove affordance (the mockup's `×`). */
export const CHIP_REMOVE_ATTR = "data-sf-ed-chip-remove";
/** The "+ link" / "+ add" affordance. */
export const CHIP_ADD_ATTR = "data-sf-ed-chip-add";
/** The inline entry box the add affordance reveals. */
export const CHIP_INPUT_ATTR = "data-sf-ed-chip-input";

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

/** A value as it would be written to frontmatter — always a plain YAML scalar or list. */
export type FieldValue = string | number | boolean | string[] | null;

/** One reported edit. T5.4 turns this into a `commit`; T5.2 only reports it. */
export interface FieldEdit {
	readonly name: string;
	readonly value: FieldValue;
}

/** Vault-dependent seams of the `Media` control. Both optional (CON-3, tests). */
export interface MediaSeams {
	/**
	 * Link target (`mara.png`, no brackets) → a URL an `<img>` can load, or `""`
	 * when it cannot be resolved.
	 */
	readonly resolveImage?: (target: string) => string;
	/** Open an image chooser; resolves to the `[[wikilink]]` to store, or null if dismissed. */
	readonly pickImage?: () => Promise<string | null>;
	/** The edited note's name: the preview's monogram and accessible name. Falls back to the field name. */
	readonly label?: string;
}

export interface FieldControlDeps extends MediaSeams {
	/** Called whenever the user changes the control. Defaults to a no-op (CON-1: no write path here). */
	readonly onEdit?: (edit: FieldEdit) => void;
}

export interface FieldControlHandle {
	/** The control cell — this is the element carrying the `editableField` marker. */
	readonly el: HTMLElement;
	/** The value the control currently holds, in the shape frontmatter would take. */
	value(): FieldValue;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Render the control for `field` into `host`, seeded with `value`.
 *
 * `value` is `unknown` on purpose: it comes from a note's frontmatter, which is
 * whatever the user's file happens to contain (CON-8 — narrow at the boundary,
 * never trust the shape). Every branch coerces defensively rather than casting.
 */
export function renderFieldControl(
	host: HTMLElement,
	field: FieldDef,
	value: unknown,
	deps: FieldControlDeps = {},
): FieldControlHandle {
	const cell = el("div", `sf-ed-f sf-ed-f--${field.width}`);
	cell.setAttribute(FIELD_CONTROL_ATTR, field.name);
	// The cell is what the marker walk lands on, so it carries the field's name
	// for assistive tech as well as the inner control does. `tabindex="-1"` keeps
	// it out of the tab order while making `focus()` on it actually do something
	// — a chip-only cell (a `File` at its cap) has no input to fall back to.
	cell.setAttribute("aria-label", field.name);
	// An aria-label on a role-less <div> is ignored outright — the same fix the
	// chip row needed. Without this the label is an attribute that does nothing.
	cell.setAttribute("role", "group");
	cell.setAttribute("tabindex", "-1");
	host.appendChild(cell);

	const read = buildControl(cell, field, value, deps);
	return { el: cell, value: read };
}

/** Route a field to its control, returning that control's value reader. */
function buildControl(
	cell: HTMLElement,
	field: FieldDef,
	value: unknown,
	deps: FieldControlDeps,
): () => FieldValue {
	switch (field.type) {
		case "Select":
		case "Cycle":
			return selectControl(cell, field, value, deps);
		case "Boolean":
			return booleanControl(cell, field, value, deps);
		case "Number":
			return numberControl(cell, field, value, deps);
		case "Date":
			return dateControl(cell, field, value, deps, "date");
		case "Datetime":
			return dateControl(cell, field, value, deps, "datetime-local");
		case "Time":
			return dateControl(cell, field, value, deps, "time");
		case "Multi":
			return chipControl(cell, field, value, deps, { link: false });
		case "MultiFile":
			return chipControl(cell, field, value, deps, { link: true });
		case "File":
			return singleLinkControl(cell, field, value, deps);
		case "Media":
			return mediaControl(cell, field, value, deps);
		// `Input`, `MultiMedia`, `Unknown` and any type a newer metadata-menu
		// invents land here. Falling back beats failing (PRD/F6 AC).
		default:
			return textControl(cell, field, value, deps);
	}
}

// ---------------------------------------------------------------------------
// Scalar controls
// ---------------------------------------------------------------------------

function textControl(
	cell: HTMLElement,
	field: FieldDef,
	value: unknown,
	deps: FieldControlDeps,
): () => FieldValue {
	const input = inputEl(cell, field, "text");
	input.value = asText(value);
	onSettled(input, () => report(deps, field, emptyToNull(input.value)));
	return () => emptyToNull(input.value);
}

function numberControl(
	cell: HTMLElement,
	field: FieldDef,
	value: unknown,
	deps: FieldControlDeps,
): () => FieldValue {
	const input = inputEl(cell, field, "number");
	input.value = asText(value);
	// `<input type="number">` sanitizes its own value: anything unparseable
	// reads back as "", which the guard below turns into null. There is no
	// NaN path to defend against.
	const read = (): FieldValue => (input.value.trim() === "" ? null : Number(input.value));
	onSettled(input, () => report(deps, field, read()));
	return read;
}

function booleanControl(
	cell: HTMLElement,
	field: FieldDef,
	value: unknown,
	deps: FieldControlDeps,
): () => FieldValue {
	const input = inputEl(cell, field, "checkbox");
	input.checked = value === true || value === "true";
	listen(input, "change", () => report(deps, field, input.checked));
	return () => input.checked;
}

function dateControl(
	cell: HTMLElement,
	field: FieldDef,
	value: unknown,
	deps: FieldControlDeps,
	type: "date" | "datetime-local" | "time",
): () => FieldValue {
	const input = inputEl(cell, field, type);
	input.value = asText(value);
	onSettled(input, () => report(deps, field, emptyToNull(input.value)));
	return () => emptyToNull(input.value);
}

/**
 * `<select>` over the declared values.
 *
 * The empty option is "no value" — clearing a field, not offering an undeclared
 * one. An out-of-list current value is appended **disabled and marked** (see the
 * module docstring): displayed so the control never reads as empty over a file
 * that holds a value, unselectable so leaving it is one-way through this UI.
 */
function selectControl(
	cell: HTMLElement,
	field: FieldDef,
	value: unknown,
	deps: FieldControlDeps,
): () => FieldValue {
	const select = activeDocument.createElement("select");
	select.className = "dropdown sf-ed-select";
	select.setAttribute("aria-label", field.name);
	cell.appendChild(select);

	const declared = field.values ?? [];
	addOption(select, "", "—");
	for (const v of declared) addOption(select, v, v);

	const current = asText(value);
	if (current !== "" && !declared.includes(current)) {
		// Visible words, not colour alone — the T5.1 accessibility bar.
		const marked = addOption(select, current, `${current} (not in list)`);
		marked.disabled = true;
		marked.className = "sf-ed-opt--outoflist";
	}
	select.value = current;

	listen(select, "change", () => report(deps, field, emptyToNull(select.value)));
	return () => emptyToNull(select.value);
}

// ---------------------------------------------------------------------------
// Media control (T5.5) — S102's preview + path + Choose image… / Clear
// ---------------------------------------------------------------------------

/**
 * A preview tile, the stored link as text, and two buttons. State is the one
 * `current` value; every change redraws the cell and reports through `onEdit`,
 * so T5.4's commit and rollback treat it like any other control.
 */
function mediaControl(
	cell: HTMLElement,
	field: FieldDef,
	value: unknown,
	deps: FieldControlDeps,
): () => FieldValue {
	let current = emptyToNull(asText(value).trim());
	const box = el("div", "sf-ed-media");
	cell.appendChild(box);

	const change = (next: FieldValue): void => {
		current = next;
		draw();
		report(deps, field, current);
	};
	const draw = (): void => {
		empty(box);
		const text = typeof current === "string" ? current : "";
		previewTile(box, deps.label ?? field.name, text, deps);
		const side = el("div", "sf-ed-media-side");
		const path = el("div", "sf-ed-media-path");
		path.setAttribute(MEDIA_PATH_ATTR, field.name);
		path.textContent = text;
		side.appendChild(path);
		side.appendChild(mediaButtons(deps, change));
		box.appendChild(side);
	};
	draw();
	return () => current;
}

/** The preview: the existing portrait tile, with its monogram as every fallback. */
function previewTile(box: HTMLElement, name: string, stored: string, deps: FieldControlDeps): void {
	const target = linkTarget(stored);
	const url = target === "" ? "" : (deps.resolveImage?.(target) ?? "");
	const tile = portraitTile(box, name, url || undefined);
	// An unresolvable target comes back unchanged and a corrupt file resolves
	// fine, so only the load itself can say the image is unusable.
	const img = tile.querySelector("img");
	if (!img) return;
	listen(img, "error", () => {
		const fallback = portraitTile(box, name, undefined);
		box.replaceChild(fallback, tile);
	});
}

function mediaButtons(deps: FieldControlDeps, change: (next: FieldValue) => void): HTMLElement {
	const row = el("div", "sf-ed-media-btns");
	const pick = deps.pickImage;
	if (pick) {
		const choose = buttonEl("Choose image…", true);
		listen(choose, "click", () => {
			void pick().then((link) => { if (link !== null) change(link); });
		});
		row.appendChild(choose);
	}
	const clear = buttonEl("Clear", false);
	listen(clear, "click", () => change(null));
	row.appendChild(clear);
	return row;
}

function buttonEl(label: string, primary: boolean): HTMLButtonElement {
	const button = activeDocument.createElement("button");
	button.type = "button";
	button.className = primary ? "sf-ed-media-btn sf-ed-media-btn--pri" : "sf-ed-media-btn";
	button.textContent = label;
	return button;
}

/** `![[a/b.png|alias#x]]` → `a/b.png`; plain text is returned trimmed. */
function linkTarget(raw: string): string {
	const inner = /^!?\[\[(.*)\]\]$/.exec(raw.trim())?.[1] ?? raw;
	return (inner.split("|")[0] ?? "").split("#")[0]?.trim() ?? "";
}

// ---------------------------------------------------------------------------
// List controls — chips (S102's `chipx` + `addx`)
// ---------------------------------------------------------------------------

/**
 * A row of chips plus an add affordance.
 *
 * `link: true` (MultiFile) stores `[[wikilinks]]`, so Obsidian keeps the value
 * correct when the target is renamed; `link: false` (Multi) stores the plain
 * strings the user typed. Either way the stored form is one a human could have
 * typed into the file by hand (PRD/F5 AC) — no paths, no aliases, no escaping.
 */
function chipControl(
	cell: HTMLElement,
	field: FieldDef,
	value: unknown,
	deps: FieldControlDeps,
	opts: ChipOptions,
): () => FieldValue {
	const values = asList(value);
	const row = el("div", "sf-ed-chips");
	// A bare div's aria-label is ignored; `role="group"` is what makes the name
	// reach assistive tech.
	row.setAttribute("role", "group");
	row.setAttribute("aria-label", field.name);
	cell.appendChild(row);
	const read = (): FieldValue => (opts.project ?? ((v): FieldValue => [...v]))(values);

	const redraw = (): void => {
		empty(row);
		values.forEach((raw, i) => row.appendChild(chipEl(raw, i, () => {
			values.splice(i, 1);
			redraw();
			// Focus has to be placed deliberately: the × the user just operated is
			// gone from the DOM, so nothing else can put it anywhere — a keyboard
			// user would otherwise be dropped on <body> mid-edit. The host's click
			// router cannot help either, because a walk from a detached node finds
			// no markers at all (`domTargetWalk.ts`).
			cell.focus();
			report(deps, field, read());
		})));
		// A field that holds one link offers no second one: the control must
		// never show state it cannot write (only the first would ever reach the
		// file). Removing the chip brings the affordance back.
		if (values.length < (opts.max ?? Number.POSITIVE_INFINITY)) {
			row.appendChild(addEl(opts.link, (entry) => {
				values.push(opts.link ? toWikilink(entry) : entry);
				redraw();
				report(deps, field, read());
			}));
		}
	};
	redraw();
	return read;
}

/**
 * A single link (File): the same chip vocabulary as `MultiFile`, capped at one
 * entry and projected back to a scalar — so `book: "[[Wardens of Moonharbor]]"`
 * stays a scalar in the file rather than becoming a one-element list.
 *
 * The projection is passed INTO `chipControl` rather than wrapped around it, so
 * `value()` and the reported edit are the same shape by construction. Wrapping
 * only the reader would have left `onEdit` reporting a list to T5.4's commit
 * path while `value()` said scalar.
 */
function singleLinkControl(
	cell: HTMLElement,
	field: FieldDef,
	value: unknown,
	deps: FieldControlDeps,
): () => FieldValue {
	return chipControl(cell, field, value, deps, {
		link: true,
		max: 1,
		project: (values) => values[0] ?? null,
	});
}

/** How a chip row behaves: link-shaped values, how many fit, and what it reports. */
interface ChipOptions {
	/** MultiFile/File store `[[wikilinks]]`; Multi stores the plain strings typed. */
	readonly link: boolean;
	/** Maximum entries. Unset means unbounded (Multi/MultiFile). */
	readonly max?: number;
	/** Turn the chip list into the value the file holds. Defaults to a copy of the list. */
	readonly project?: (values: readonly string[]) => FieldValue;
}

/** One chip: its label plus the remove affordance. */
function chipEl(raw: string, index: number, onRemove: () => void): HTMLElement {
	const chip = el("span", "sf-ed-chip");
	const label = el("span", "sf-ed-chip-label");
	label.textContent = linkLabel(raw);
	chip.appendChild(label);

	const remove = el("span", "sf-ed-chip-x");
	remove.setAttribute(CHIP_REMOVE_ATTR, String(index));
	remove.setAttribute("role", "button");
	remove.setAttribute("tabindex", "0");
	remove.setAttribute("aria-label", `Remove ${linkLabel(raw)}`);
	remove.textContent = "×";
	activate(remove, onRemove);
	chip.appendChild(remove);
	return chip;
}

/**
 * The add affordance: a button that reveals an inline entry box (S102's
 * "+ link" / "+ add"). Deliberately not a file-picker modal — the value must be
 * one a human could have typed, and a plain box makes that literally true while
 * keeping the control usable with metadata-menu and Bases absent (CON-3).
 */
function addEl(link: boolean, onAdd: (entry: string) => void): HTMLElement {
	const wrap = el("span", "sf-ed-chip-addwrap");

	const button = el("span", "sf-ed-chip-add");
	button.setAttribute(CHIP_ADD_ATTR, link ? "link" : "value");
	button.setAttribute("role", "button");
	button.setAttribute("tabindex", "0");
	button.setAttribute("aria-label", link ? "Add link" : "Add value");
	button.textContent = link ? "+ link" : "+ add";
	wrap.appendChild(button);

	activate(button, () => {
		// One box at a time: a second click (or Enter) on the affordance while the
		// box is open must not stack another one over the first.
		if (wrap.querySelector(`[${CHIP_INPUT_ATTR}]`)) return;
		// (2) Focus AFTER appending — `focus()` does nothing to a detached node,
		// which made the call inside `entryEl` inert and left the control leaning
		// on the host's router to focus its own affordance.
		wrap.appendChild(entryEl(link, onAdd)).focus();
	});
	return wrap;
}

/** The inline entry box: Enter adds, Escape cancels, blank is ignored. */
function entryEl(link: boolean, onAdd: (entry: string) => void): HTMLInputElement {
	const entry = activeDocument.createElement("input");
	entry.type = "text";
	entry.className = "sf-ed-chip-input";
	entry.setAttribute(CHIP_INPUT_ATTR, link ? "link" : "value");
	entry.setAttribute("aria-label", link ? "Link to add" : "Value to add");
	listen(entry, "keydown", (event) => {
		const key = (event as KeyboardEvent).key;
		if (key === "Escape") entry.remove();
		if (key !== "Enter") return;
		const typed = entry.value.trim();
		entry.remove();
		if (typed !== "") onAdd(typed);
	});
	return entry;
}

// ---------------------------------------------------------------------------
// Value coercion — everything here crosses the frontmatter boundary (CON-8)
// ---------------------------------------------------------------------------

/** `[[Elke Stoneway]]` → `Elke Stoneway`; anything else unchanged. */
function linkLabel(raw: string): string {
	const match = /^\[\[(.+)\]\]$/.exec(raw.trim());
	return match ? (match[1] ?? raw) : raw;
}

/** Wrap in brackets unless the user already typed them — never double-bracket. */
function toWikilink(entry: string): string {
	const trimmed = entry.trim();
	return /^\[\[.+\]\]$/.test(trimmed) ? trimmed : `[[${trimmed}]]`;
}

function asText(value: unknown): string {
	if (value === null || value === undefined) return "";
	if (Array.isArray(value)) return value.map((v) => asText(v)).join(", ");
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	// Objects, functions, symbols: a Property should never hold one, and
	// "[object Object]" in an editable box would be worse than an empty one.
	return "";
}

function asList(value: unknown): string[] {
	if (value === null || value === undefined) return [];
	if (Array.isArray(value)) return value.filter((v) => v !== null && v !== undefined).map((v) => asText(v));
	const text = asText(value);
	return text === "" ? [] : [text];
}

/** An empty box means "no value", not the empty string. */
function emptyToNull(raw: string): FieldValue {
	return raw === "" ? null : raw;
}

// ---------------------------------------------------------------------------
// Small DOM + wiring helpers
// ---------------------------------------------------------------------------

function el(tag: "div" | "span", cls: string): HTMLElement {
	const node = activeDocument.createElement(tag);
	node.className = cls;
	return node;
}

function empty(node: HTMLElement): void {
	while (node.firstChild) node.removeChild(node.firstChild);
}

function inputEl(cell: HTMLElement, field: FieldDef, type: string): HTMLInputElement {
	const input = activeDocument.createElement("input");
	input.type = type;
	input.className = `sf-ed-input sf-ed-input--${type}`;
	input.setAttribute("aria-label", field.name);
	cell.appendChild(input);
	return input;
}

function addOption(select: HTMLSelectElement, value: string, text: string): HTMLOptionElement {
	const option = activeDocument.createElement("option");
	option.value = value;
	option.textContent = text;
	select.appendChild(option);
	return option;
}

function listen(
	target: HTMLElement,
	type: "click" | "change" | "input" | "keydown" | "error",
	handler: (event: Event) => void,
): void {
	target.addEventListener(type, handler);
}

/**
 * Wire an affordance that is a `<span role="button">` rather than a `<button>`:
 * click AND Enter/Space, or a keyboard user can reach something that announces
 * itself as a button and cannot operate it (WCAG 2.1.1).
 *
 * `preventDefault` stops Space scrolling the pane. Propagation is deliberately
 * left alone: this handler is on the deeper element so it has already acted by
 * the time the Anvil's Enter/Space parity handler sees the key — it cannot
 * swallow anything, and an earlier comment here claiming otherwise overstated
 * the case (measured, both ways).
 */
function activate(target: HTMLElement, handler: () => void): void {
	listen(target, "click", handler);
	listen(target, "keydown", (event) => {
		const key = (event as KeyboardEvent).key;
		if (key !== "Enter" && key !== " ") return;
		event.preventDefault();
		handler();
	});
}

/**
 * Report a scalar box's value when it **settles** — blur or Enter — not on
 * every keystroke.
 *
 * T5.2 originally bound `input` here, reasoning that `change` "would miss an
 * edit until blur". T5.4 turned a report into a vault write, and that reversed
 * the argument: waiting for blur is not a missed edit, it is the whole point.
 * Per-keystroke reporting meant typing a name wrote the file once per
 * character, and because those writes were issued unserialized the file could
 * settle on an intermediate value (`Marcu` for `Marcus`). **Undo is out of
 * scope (#17)** and this phase's Key Decisions state outright that the editor
 * must not make writes easy to trigger accidentally — so the trigger moved
 * rather than the write path. Debouncing and serializing the writes were both
 * offered and declined: `change` makes both unnecessary.
 *
 * The checkbox and the `<select>` already report on `change`, and the chip row
 * reports on a discrete click or Enter, so this is the one binding that had to
 * move. `value()` is unaffected — it still reads whatever the box holds right
 * now, mid-edit included.
 *
 * @ref docs/XDD/specs/008-codex-surface/plan/phase-5.md — Key Decisions (#17)
 * @ref docs/XDD/specs/008-codex-surface/README.md — decision log, 2026-08-06
 */
function onSettled(target: HTMLElement, handler: () => void): void {
	listen(target, "change", handler);
}

function report(deps: FieldControlDeps, field: FieldDef, value: FieldValue): void {
	deps.onEdit?.({ name: field.name, value });
}
