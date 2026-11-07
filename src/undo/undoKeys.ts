/**
 * undoKeys — the Mod+Z policy for the Anvil and the Workbench (ADR-37).
 *
 * `createUndoKeyHandler` is the global capture-phase keydown handler; `isEditableText` is the
 * text-control test the hosts' `undoKeyPolicy` uses.
 */
import { Keymap } from "obsidian";

/** A view the key handler may act for: the Anvil or the Workbench. */
export interface UndoKeyHost {
	readonly containerEl: HTMLElement;
	/** "text": let the element's own text undo run; "journal": Story Forge undo. */
	undoKeyPolicy(target: EventTarget | null): "text" | "journal";
}

export interface UndoKeyDeps {
	/** The Anvil or Workbench when it is the active view, otherwise null. */
	activeHost: () => UndoKeyHost | null;
	undo: () => void;
	redo: () => void;
}

/** `input` types that take typed text. Checkbox, radio, range, button and the like do not. */
const TEXT_INPUT_TYPES: ReadonlySet<string> = new Set([
	"text", "search", "url", "email", "tel", "number", "password", "date", "datetime-local", "time",
]);

const EDITABLE_ATTR_VALUES: ReadonlySet<string> = new Set(["", "true", "plaintext-only"]);

/**
 * Obsidian's cross-window `instanceOf`. Never `instanceof HTMLElement` on an
 * event target: in a popout the element comes from that window's realm, so
 * the main window's constructor answers false. Targets without the helper
 * (the window, a document) are not elements.
 */
function isInstance<T>(target: EventTarget | null, type: new () => T): target is EventTarget & T {
	const node = target as { instanceOf?: (type: new () => T) => boolean } | null;
	return typeof node?.instanceOf === "function" && node.instanceOf(type);
}

function isHtmlElement(target: EventTarget | null): target is HTMLElement {
	return isInstance(target, HTMLElement);
}

function isContentEditable(el: HTMLElement): boolean {
	if (el.isContentEditable === true) return true;
	const attr = el.getAttribute("contenteditable");
	return attr !== null && EDITABLE_ATTR_VALUES.has(attr.toLowerCase());
}

/** True when `target` takes typed text, so the field's own text undo should run. */
export function isEditableText(target: EventTarget | null): boolean {
	if (!isHtmlElement(target)) return false;
	const tag = target.tagName.toLowerCase();
	if (tag === "textarea") return true;
	if (tag === "input") return TEXT_INPUT_TYPES.has((target as HTMLInputElement).type);
	return isContentEditable(target);
}

/** Mod+Z or Mod+Shift+Z, nothing else: no Alt, no Ctrl+Y, no handled key. Reads no DOM. */
function isUndoChord(e: KeyboardEvent): boolean {
	if (e.defaultPrevented || e.altKey || e.key.toLowerCase() !== "z") return false;
	return Keymap.isModifier(e, "Mod"); // Cmd on macOS, Ctrl elsewhere
}

/**
 * Inside the host, or on its window's body: after a card click nothing keeps focus, so the
 * target is the body, which belongs to the active view (Phase 1 spike).
 */
function isHostTarget(host: UndoKeyHost, t: EventTarget | null): boolean {
	if (isInstance(t, Node) && host.containerEl.contains(t)) return true;
	const doc = host.containerEl.ownerDocument; // the host's own window, main or popout
	return t === doc.body || t === doc.documentElement;
}

/**
 * The global keydown handler (ADR-37). Register it capture-phase on every window's document so
 * it runs before a field's own text undo. It never moves focus.
 */
export function createUndoKeyHandler(deps: UndoKeyDeps): (e: KeyboardEvent) => void {
	return (e: KeyboardEvent): void => {
		if (!isUndoChord(e)) return;
		const host = deps.activeHost();
		if (host === null) return; // a Markdown note: Obsidian's own undo
		if (!isHostTarget(host, e.target)) return; // a modal, the palette, another leaf
		if (host.undoKeyPolicy(e.target) === "text") return; // a draft: the field's own text undo
		e.preventDefault();
		if (e.shiftKey) deps.redo(); else deps.undo();
	};
}
