/**
 * keyboardRouting — which key presses a view's delegated Enter/Space router
 * may claim.
 *
 * The Anvil and the Workbench each route Enter/Space on a focused `role="link"`
 * / `role="button"` element to the same handler as a click. Those elements are
 * not form controls, so the browser does nothing with the key and the router
 * has to. A real form control is the opposite: Space must be typeable, Enter
 * must settle a box, Space must toggle a checkbox or open a select, and Enter
 * on a native `<button>` must fire its own click. `preventDefault()` on any of
 * those breaks them, so the router stands aside.
 */

/**
 * True when `target` is an HTMLElement of any window. In a popout the element comes from that
 * window's realm, so `instanceof HTMLElement` answers false; Obsidian's `instanceOf` does not.
 * Falls back to `instanceof` where the helper is not installed (unit-test DOMs).
 */
export function isHtmlElement(target: EventTarget | null): target is HTMLElement {
	const node = target as { instanceOf?: (type: typeof HTMLElement) => boolean } | null;
	if (typeof node?.instanceOf === "function") return node.instanceOf(HTMLElement);
	return target instanceof HTMLElement;
}

const FORM_CONTROL_TAGS: ReadonlySet<string> = new Set(["INPUT", "SELECT", "TEXTAREA", "BUTTON"]);

/** True when `target` is an element the browser gives Enter/Space meaning to (including editable text). */
export function isFormControl(target: EventTarget | null): boolean {
	if (!isHtmlElement(target)) return false;
	return FORM_CONTROL_TAGS.has(target.tagName) || target.isContentEditable === true;
}

/** True when this keydown is one the delegated router should activate. */
export function isActivationKey(event: KeyboardEvent): boolean {
	return (event.key === "Enter" || event.key === " ") && !isFormControl(event.target);
}
