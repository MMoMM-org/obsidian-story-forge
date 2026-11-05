/**
 * undoKeys — the Mod+Z policy for the Anvil and the Workbench (ADR-37).
 *
 * This file holds only `isEditableText` so far; the key handler follows.
 */

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
function isHtmlElement(target: EventTarget | null): target is HTMLElement {
	const node = target as { instanceOf?: (type: typeof HTMLElement) => boolean } | null;
	return typeof node?.instanceOf === "function" && node.instanceOf(HTMLElement);
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
