/**
 * keyboardRouting.test.ts — which key presses the delegated router may claim.
 */

import { describe, expect, it } from "vitest";
import { isActivationKey, isFormControl } from "navigation/keyboardRouting";

/**
 * jsdom does not implement `isContentEditable` (it is undefined on every
 * element), so the property is defined on the instance the way a browser
 * reports it for an element inside a `contenteditable` region.
 */
function editable(): HTMLElement {
	const el = document.createElement("div");
	Object.defineProperty(el, "isContentEditable", { value: true });
	return el;
}

describe("isFormControl", () => {
	it("is true for a contenteditable element, which also needs Enter and Space", () => {
		expect(isFormControl(editable())).toBe(true);
	});

	it("is false for a plain element", () => {
		expect(isFormControl(document.createElement("div"))).toBe(false);
	});

	it("is true for a native input", () => {
		expect(isFormControl(document.createElement("input"))).toBe(true);
	});
});

describe("isActivationKey", () => {
	it("leaves Space inside a contenteditable element alone", () => {
		const el = editable();
		document.body.appendChild(el);
		let claimed: boolean | null = null;
		el.addEventListener("keydown", (e) => { claimed = isActivationKey(e); });
		el.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
		el.remove();
		expect(claimed).toBe(false);
	});
});
