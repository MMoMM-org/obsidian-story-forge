import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { isEditableText } from "../../src/undo/undoKeys";

/**
 * The mock does not provide Node.prototype.instanceOf, which real Obsidian
 * does. This stand-in behaves like it: it checks against the constructor of
 * the NODE'S OWN window, so an element from another realm (a popout, here an
 * iframe) answers correctly where the main window's `instanceof` would not.
 */
const installInstanceOf = (win: Window): void => {
	const proto = (win as unknown as { Node: { prototype: Record<string, unknown> } }).Node.prototype;
	proto["instanceOf"] = function (this: Node, type: { name: string }): boolean {
		const win = (this.ownerDocument?.defaultView ?? window) as unknown as Record<string, new () => unknown>;
		const ctor = win[type.name];
		return ctor !== undefined && this instanceof ctor;
	};
};
beforeAll(() => installInstanceOf(window));

afterEach(() => {
	document.body.replaceChildren();
});

const make = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}): HTMLElementTagNameMap[K] => {
	const el = document.createElement(tag);
	for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
	document.body.appendChild(el);
	return el;
};

/** An element created in another window's realm, as in a popout. */
const makeForeign = (tag: string, attrs: Record<string, string> = {}): HTMLElement => {
	const frame = document.createElement("iframe");
	document.body.appendChild(frame);
	installInstanceOf(frame.contentWindow!); // Obsidian installs its helpers in every window
	const el = frame.contentDocument!.createElement(tag);
	for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
	frame.contentDocument!.body.appendChild(el);
	return el;
};

describe("isEditableText", () => {
	it.each(["text", "search", "url", "email", "tel", "number", "password", "date", "datetime-local", "time"])(
		"is true for an input of type %s",
		type => {
			expect(isEditableText(make("input", { type }))).toBe(true);
		},
	);

	it("is true for an input with no type attribute", () => {
		expect(isEditableText(make("input"))).toBe(true);
	});

	it("is true for a textarea", () => {
		expect(isEditableText(make("textarea"))).toBe(true);
	});

	it.each(["", "true", "plaintext-only"])("is true for contenteditable=%j", value => {
		expect(isEditableText(make("div", { contenteditable: value }))).toBe(true);
	});

	it("trusts the browser's isContentEditable for an element inside an editable region", () => {
		const span = make("span");
		Object.defineProperty(span, "isContentEditable", { value: true });
		expect(isEditableText(span)).toBe(true);
	});

	it("is false for contenteditable=false", () => {
		expect(isEditableText(make("div", { contenteditable: "false" }))).toBe(false);
	});

	it.each(["checkbox", "radio", "range", "button", "submit", "color", "file"])(
		"is false for an input of type %s",
		type => {
			expect(isEditableText(make("input", { type }))).toBe(false);
		},
	);

	it("is false for a button, a select and a card", () => {
		expect(isEditableText(make("button"))).toBe(false);
		expect(isEditableText(make("select"))).toBe(false);
		expect(isEditableText(make("div", { class: "sf-card", role: "button", tabindex: "0" }))).toBe(false);
	});

	it("is false for null and for a target that is not an element", () => {
		expect(isEditableText(null)).toBe(false);
		expect(isEditableText(window)).toBe(false);
		expect(isEditableText(document)).toBe(false);
	});

	it("recognises text controls that live in another window", () => {
		expect(isEditableText(makeForeign("input", { type: "text" }))).toBe(true);
		expect(isEditableText(makeForeign("textarea"))).toBe(true);
		expect(isEditableText(makeForeign("input", { type: "checkbox" }))).toBe(false);
	});
});
