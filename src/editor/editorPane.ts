/**
 * editorPane — the Anvil's editor pane: shell, docks and header tools (T5.1).
 *
 * ADR-33: **one component with three dock modes** — bottom (S92), right (S99)
 * and fullscreen (S100). The dock is a persisted *setting* the user sets once;
 * it is **never** switched automatically, in particular never on a resize. That
 * is why nothing in this module reads a width, a media query or a resize event:
 * a layout that moves while you work is worse than one you set once.
 *
 * Fullscreen is deliberately **not** a fourth persisted dock: it is a transient
 * mode layered over whichever dock is configured, so `Back` (and the fullscreen
 * toggle) return to *the dock you came from* without having to remember a
 * previous value anywhere. `EditorPaneStore.mode(dock)` is that composition,
 * and it is the only place the three-mode vocabulary is derived.
 *
 * Like `codexTab.ts` this module owns **markup and state, never behaviour**:
 * the header tools carry `data-sf-ed-tool` markers and the host's
 * `_operateControl` enacts them, so the pane's own chrome goes through the same
 * F2 click matrix as every other control (ADR-28). It imports no Obsidian
 * runtime — a path and a title are all it needs, which keeps the whole shell
 * testable without a vault.
 *
 * **Scope (T5.1).** This is the shell only. The fields host (`.sf-ed-grid`) is
 * returned empty on purpose: field controls are T5.2, sections T5.3, the commit
 * path T5.4 and the Media control T5.5. This module contains **no write path**
 * of any kind — CON-1's single seam is `inspector/frontmatterWriter.ts` and
 * T5.4 is what wires to it.
 *
 * **Sections (T5.3).** `renderFieldSections` draws the pane's contents from a
 * `FieldModel` and nothing else (ADR-31): one heading per FileClass in chain
 * order, each field's label, and the T5.2 control for its type. This module
 * reads no FileClass and infers no layout — the label, the order, the origin
 * and the width all arrive decided, which is what keeps a user's own FileClass
 * first-class without a line of code that knows about it.
 *
 * @ref docs/mockups/anvil-workbench-codex.html — S92, S99, S100, S102, S103
 * @ref docs/XDD/specs/008-codex-surface/requirements.md — Features F2, F3, F5, F6
 * @ref docs/XDD/specs/008-codex-surface/solution.md — ADR-28, ADR-31, ADR-33
 */

import { renderFieldControl, type FieldEdit, type MediaSeams } from "editor/fieldControls";
import type { FieldDef, FieldModel, FieldSection } from "editor/fieldModel";

// Obsidian's popout-window-aware document — the mock polyfills this to
// globalThis.document in jsdom test environments (see test/__mocks__/obsidian.ts;
// the same local declaration `codexTab.ts` and `panel/components.ts` use).
declare const activeDocument: Document;

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/**
 * The persisted dock (`PluginSettings.editorDock`). Two values, not three —
 * see the module docstring on why fullscreen is a mode rather than a dock.
 */
export type EditorDock = "bottom" | "right";

/** The dock as rendered: the persisted dock, or fullscreen layered over it. */
export type EditorPaneMode = EditorDock | "fullscreen";

/**
 * Marks a pane header tool. Hosts classify it as `"structuralControl"` and read
 * the attribute's value to know which tool was used — the same shape as the
 * Codex collection pill (`CODEX_COLLECTION_ATTR`).
 */
export const EDITOR_TOOL_ATTR = "data-sf-ed-tool";

/**
 * Marks the header title as a link to the pane's note. Sits on the same element
 * as `data-sf-link` (which supplies the target and the right-click file menu);
 * hosts classify it as `"paneTitle"`, listed before the link marker.
 */
export const EDITOR_TITLE_ATTR = "data-sf-ed-title";

/** Carries the open note's vault path, so a host (or a test) can read what is shown. */
export const EDITOR_PATH_ATTR = "data-sf-ed-path";

/**
 * The four header tools (S92/S99/S100).
 *
 * `dock` toggles bottom ⇄ right and is the ONLY thing that ever changes the
 * persisted dock (ADR-33). `fullscreen` toggles the transient mode; `back` is
 * S100's `← Back`, which leaves fullscreen for the dock it came from — the same
 * transition, given its own affordance because the mockup gives it one.
 */
export type EditorTool = "dock" | "fullscreen" | "back" | "close";

const EDITOR_TOOLS: readonly EditorTool[] = ["dock", "fullscreen", "back", "close"];

/** Type guard: is `v` one of the four header tools? (CON-8: narrow at the boundary.) */
export function isEditorTool(v: unknown): v is EditorTool {
	return typeof v === "string" && (EDITOR_TOOLS as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/**
 * Which note the pane is showing, and whether it is fullscreen.
 *
 * A small class the host owns for its lifetime and `clear()`s on close, exactly
 * like `CollapseStore` and `CodexSelectionStore` — one store per host instance,
 * so two open Anvils inspect independently. It holds a **path**, never a
 * `TFile`: a stale `TFile` outlives a rename, a path re-resolves.
 *
 * The dock itself is deliberately NOT here — it is persisted settings the host
 * reads live (ADR-33), so a change made in one Anvil is honoured by the other
 * without either store knowing about the other.
 */
export class EditorPaneStore {
	private _path: string | null = null;
	private _fullscreen = false;

	/** The open note's path, or `null` when the pane is closed. */
	get path(): string | null {
		return this._path;
	}

	/**
	 * Show `path`. Keeps the current fullscreen mode: inspecting a second entry
	 * while fullscreen should stay fullscreen, not throw the user back to the
	 * grid.
	 */
	open(path: string): void {
		this._path = path;
	}

	/** Close the pane (the `✕` tool) — also leaves fullscreen. */
	close(): void {
		this._path = null;
		this._fullscreen = false;
	}

	/** Teardown alias, matching `CollapseStore.clear` / `CodexSelectionStore.clear`. */
	clear(): void {
		this.close();
	}

	/** The `⛶` tool: enter fullscreen from a dock, or return to it. */
	toggleFullscreen(): void {
		this._fullscreen = !this._fullscreen;
	}

	/** S100's `← Back`: leave fullscreen for the configured dock. A no-op otherwise. */
	exitFullscreen(): void {
		this._fullscreen = false;
	}

	/**
	 * How the pane renders given the configured `dock` — the one place the
	 * three-mode vocabulary is derived. `null` when nothing is open.
	 */
	mode(dock: EditorDock): EditorPaneMode | null {
		if (this._path === null) return null;
		return this._fullscreen ? "fullscreen" : dock;
	}
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

export interface EditorPaneOptions {
	/** The open note's vault path — shown in the header and stamped on the root. */
	readonly path: string;
	/** Display title (the note's basename); falls back to the path when unresolvable. */
	readonly title: string;
	/** How to render: the configured dock, or fullscreen layered over it. */
	readonly mode: EditorPaneMode;
}

/** What the host gets back: the pane root, and where the fields go (T5.2/T5.3). */
export interface EditorPaneHandle {
	/** The `.sf-ed` root, already appended to the container. */
	readonly root: HTMLElement;
	/**
	 * The empty `.sf-ed-grid` the field controls render into. T5.1 leaves it
	 * empty by design — this is the seam T5.2 and T5.3 fill, and the reason
	 * this function returns a handle rather than `void`.
	 */
	readonly fieldsEl: HTMLElement;
}

/**
 * Render the pane into `container` (appending, never emptying — the host owns
 * the container's other children, e.g. the grid above a bottom-docked pane).
 */
export function renderEditorPane(container: HTMLElement, opts: EditorPaneOptions): EditorPaneHandle {
	const root = el("div", `sf-ed sf-ed--${opts.mode}`);
	root.setAttribute(EDITOR_PATH_ATTR, opts.path);
	container.appendChild(root);

	root.appendChild(renderHead(opts));

	// S99's narrower two-column grid: same fields, less room (PRD/F5 — "the
	// docks differ only in room"). The width rule itself is T5.3's.
	const fieldsEl = el("div", opts.mode === "right" ? "sf-ed-grid sf-ed-grid--narrow" : "sf-ed-grid");
	root.appendChild(fieldsEl);

	return { root, fieldsEl };
}

/** The header row: Back (fullscreen only), title, path, then the tools (S92/S100). */
function renderHead(opts: EditorPaneOptions): HTMLElement {
	const head = el("div", "sf-ed-head");

	if (opts.mode === "fullscreen") {
		const backTools = el("div", "sf-ed-tools");
		backTools.appendChild(toolEl("back", "← Back", "Back"));
		head.appendChild(backTools);
	}

	const title = el("b", "sf-ed-title");
	title.textContent = opts.title;
	// A link, not a button: it goes somewhere. Enter/Space reach it through the
	// Anvil's keyboard router, the same way a chip name or a pill is reached.
	title.setAttribute(EDITOR_TITLE_ATTR, "");
	title.setAttribute("data-sf-link", opts.path);
	title.setAttribute("role", "link");
	title.setAttribute("tabindex", "0");
	head.appendChild(title);

	const path = el("span", "sf-ed-path");
	path.textContent = opts.path;
	head.appendChild(path);

	head.appendChild(el("span", "sf-ed-sp"));
	head.appendChild(renderTools(opts.mode));
	return head;
}

/**
 * The tool cluster. Fullscreen drops the dock toggle: there is no grid beside
 * or below the pane to dock against, and `Back` already returns to the dock
 * that is configured (S100 shows exactly these two plus close).
 */
function renderTools(mode: EditorPaneMode): HTMLElement {
	const tools = el("div", "sf-ed-tools");

	if (mode === "bottom") tools.appendChild(toolEl("dock", "⇱", "Dock right"));
	if (mode === "right") tools.appendChild(toolEl("dock", "⇲", "Dock bottom"));

	tools.appendChild(
		toolEl("fullscreen", "⛶", mode === "fullscreen" ? "Exit fullscreen" : "Fullscreen"),
	);
	tools.appendChild(toolEl("close", "✕", "Close"));
	return tools;
}

/**
 * One tool: a marker, a glyph, and a real accessible name. The glyphs are the
 * mockup's (⇱ ⇲ ⛶ ✕) and carry no meaning to a screen reader, so every tool
 * gets an `aria-label` and `title` — and `role`/`tabindex` so the host's
 * existing Enter/Space keyboard router reaches it exactly as it reaches a
 * collection pill.
 */
function toolEl(tool: EditorTool, glyph: string, label: string): HTMLElement {
	const node = el("span", "sf-ed-tool");
	node.setAttribute(EDITOR_TOOL_ATTR, tool);
	node.setAttribute("role", "button");
	node.setAttribute("tabindex", "0");
	node.setAttribute("aria-label", label);
	node.setAttribute("title", label);
	node.textContent = glyph;
	return node;
}

// ---------------------------------------------------------------------------
// Sections (T5.3) — the pane's contents, from the model alone
// ---------------------------------------------------------------------------

export interface FieldSectionsDeps {
	/** The note's current value for a frontmatter key. */
	readonly valueOf: (name: string) => unknown;
	/** Passed straight to every control — T5.4 turns these into commits (CON-1). */
	readonly onEdit?: (edit: FieldEdit) => void;
	/** The `Media` control's vault seams (T5.5), passed to every control. */
	readonly media?: MediaSeams;
}

/**
 * Render `model` into `host`: one section per FileClass in chain order, each
 * with its label, the file it came from, and its fields as labelled controls.
 *
 * Appends rather than clearing — `renderEditorPane` builds a fresh
 * `.sf-ed-grid` on every render, so there is never anything to clear, and a
 * clear step would be an untested claim about a state that cannot happen.
 *
 * Everything presentational that could have been a decision — which sections
 * exist, their order, their labels, whether a field is half or full width — is
 * already in the model. That is ADR-31 in practice, and it is why a user's own
 * FileClass renders identically to ours without this function knowing one
 * exists.
 */
export function renderFieldSections(host: HTMLElement, model: FieldModel, deps: FieldSectionsDeps): void {
	// Ids must be unique across every pane on screen, not just within one: two
	// Anvils can be open at once (`EditorPaneStore` is per view for exactly that
	// reason), and a shared id would make a label click in the second pane focus
	// the FIRST pane's input. A per-render counter is enough — field names are
	// already unique across a whole model (`buildFieldModel`'s `seen` set), so
	// nothing finer is needed.
	const paneId = `sf-ed-${++paneCounter}`;
	for (const section of model.sections) {
		host.appendChild(sectionHeadingEl(section));
		for (const field of section.fields) renderLabelledField(host, field, paneId, deps);
	}
}

let paneCounter = 0;

/**
 * A section heading: a REAL heading element (the SDD's accessibility line —
 * "the editor's section headings are real headings"), the FileClass file it
 * came from, and the mockup's trailing rule.
 */
function sectionHeadingEl(section: FieldSection): HTMLElement {
	const heading = activeDocument.createElement("h3");
	heading.className = `sf-ed-sec sf-ed-sec--${section.origin}`;

	const label = el("b", "sf-ed-sec-label");
	label.textContent = section.label;
	heading.appendChild(label);

	const source = el("code", "sf-ed-sec-src");
	source.textContent = sourceLine(section);
	heading.appendChild(source);

	heading.appendChild(el("span", "sf-ed-sec-ln"));
	return heading;
}

/**
 * The source line under a section label (S102/S103).
 *
 * The three origins are distinguished in WORDS here, not only by the mockup's
 * three colours: "· yours ·" for a user's FileClass, an explicit sentence for
 * the undeclared-keys section. Colour alone is invisible to a colour-blind
 * reader and to a screen reader, and this line is the one place the difference
 * is already being stated.
 */
function sourceLine(section: FieldSection): string {
	if (section.origin === "other") return "on the note, not declared by any FileClass";
	const parts = [section.source];
	if (section.origin === "user") parts.push("yours");
	if (section.extends !== undefined) parts.push(`extends ${section.extends}`);
	return parts.join(" · ");
}

/** One field: its visible label, tied to the control the label names. */
function renderLabelledField(
	host: HTMLElement,
	field: FieldDef,
	paneId: string,
	deps: FieldSectionsDeps,
): void {
	const label = activeDocument.createElement("label");
	// A full-width field's LABEL is stamped too, not just its value. The grid is
	// `96px 1fr 96px 1fr`, so a full-width value spans three columns — which only
	// fits when its label sits in column 1. After an odd number of half fields
	// the label lands in column 3 and the value is pushed to the next row,
	// orphaning it; `fc-scene`, `fc-character-fantasy` and `fc-lore` all do that
	// with their real `fieldsOrder`. The modifier forces the pair onto a fresh
	// row (styles.css).
	label.className = field.width === "full" ? "sf-ed-label sf-ed-label--full" : "sf-ed-label";
	label.textContent = field.name;
	host.appendChild(label);

	const handle = renderFieldControl(host, field, deps.valueOf(field.name), {
		...(deps.onEdit ? { onEdit: deps.onEdit } : {}),
		...deps.media,
	});

	// `for` is written only when there is something to point AT. A Multi,
	// MultiFile or File cell is a chip row with no labelable control until the
	// entry box opens, and a `for` naming an element that does not exist is an
	// unassociated label — worse for a screen reader than no attribute at all.
	// Those cells carry the field name themselves (`role="group"` +
	// `aria-label`, T5.2), so nothing is lost.
	const control = handle.el.querySelector<HTMLElement>("input, select, textarea");
	if (!control) return;
	control.id = `${paneId}-${field.name.replace(/[^\w-]/g, "_")}`;
	label.htmlFor = control.id;
}

// ---------------------------------------------------------------------------
// Small DOM helper (plain DOM only — no Obsidian element augmentation)
// ---------------------------------------------------------------------------

function el(tag: "div" | "span" | "b" | "code", cls: string): HTMLElement {
	const node = activeDocument.createElement(tag);
	node.className = cls;
	return node;
}
