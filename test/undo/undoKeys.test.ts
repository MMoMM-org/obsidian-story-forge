import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { Platform, installInstanceOf } from "obsidian";
import { createUndoKeyHandler, isEditableText, type UndoKeyHost } from "../../src/undo/undoKeys";

// The mock installs Node.instanceOf on the main window; makeForeign installs it
// in each iframe, as Obsidian does in every popout.

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

// ---------------------------------------------------------------------------
// createUndoKeyHandler (ADR-37, "Example: the key policy")
// ---------------------------------------------------------------------------

type Policy = "text" | "journal";

interface Rig {
	host: UndoKeyHost & { undoKeyPolicy: Mock };
	activeHost: Mock;
	undo: Mock;
	redo: Mock;
	/** Dispatch a keydown on `target` and return the event (to read `defaultPrevented`). */
	press: (target: EventTarget, init: KeyboardEventInit) => KeyboardEvent;
}

const detach: Array<() => void> = [];
afterEach(() => {
	for (const off of detach.splice(0)) off();
	Platform.isMacOS = false;
});

/** A host whose container lives in `doc`, with the handler on `doc` in the capture phase. */
const rig = (opts: { doc?: Document; policy?: Policy; active?: boolean } = {}): Rig => {
	const doc = opts.doc ?? document;
	const containerEl = doc.createElement("div");
	doc.body.appendChild(containerEl);
	const host = { containerEl, undoKeyPolicy: vi.fn((): Policy => opts.policy ?? "journal") };
	const activeHost = vi.fn(() => (opts.active === false ? null : host));
	const undo = vi.fn();
	const redo = vi.fn();
	const handler = createUndoKeyHandler({ activeHost, undo, redo });
	doc.addEventListener("keydown", handler, { capture: true });
	detach.push(() => { doc.removeEventListener("keydown", handler, { capture: true }); });
	const press = (target: EventTarget, init: KeyboardEventInit): KeyboardEvent => {
		const view = (target as Node).ownerDocument?.defaultView ?? window;
		const e = new view.KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
		target.dispatchEvent(e);
		return e;
	};
	return { host, activeHost, undo, redo, press };
};

const inside = (r: Rig, tag = "div"): HTMLElement => {
	const el = r.host.containerEl.ownerDocument.createElement(tag);
	r.host.containerEl.appendChild(el);
	return el;
};

const MOD_Z = { key: "z", ctrlKey: true } as const;
const MOD_SHIFT_Z = { key: "Z", ctrlKey: true, shiftKey: true } as const;

describe("createUndoKeyHandler — keys", () => {
	it("Mod+Z on a target inside the active host undoes and prevents the default", () => {
		const r = rig();
		const e = r.press(inside(r), MOD_Z);
		expect(r.undo).toHaveBeenCalledTimes(1);
		expect(r.redo).not.toHaveBeenCalled();
		expect(e.defaultPrevented).toBe(true);
	});

	it("Mod+Shift+Z redoes and prevents the default", () => {
		const r = rig();
		const e = r.press(inside(r), MOD_SHIFT_Z);
		expect(r.redo).toHaveBeenCalledTimes(1);
		expect(r.undo).not.toHaveBeenCalled();
		expect(e.defaultPrevented).toBe(true);
	});

	it("Mod is Cmd on macOS: Cmd+Z undoes there, Ctrl+Z does not", () => {
		Platform.isMacOS = true;
		const r = rig();
		r.press(inside(r), { key: "z", ctrlKey: true });
		expect(r.undo).not.toHaveBeenCalled();
		r.press(inside(r), { key: "z", metaKey: true });
		expect(r.undo).toHaveBeenCalledTimes(1);
	});

	it("there is no Ctrl+Y", () => {
		const r = rig();
		const e = r.press(inside(r), { key: "y", ctrlKey: true });
		expect(r.undo).not.toHaveBeenCalled();
		expect(r.redo).not.toHaveBeenCalled();
		expect(e.defaultPrevented).toBe(false);
	});

	it.each([
		["plain Z", { key: "z" }],
		["Alt+Mod+Z", { key: "z", ctrlKey: true, altKey: true }],
		["Meta+Z off macOS", { key: "z", metaKey: true }],
		["Mod+X", { key: "x", ctrlKey: true }],
	])("ignores %s without asking for the active view", (_name, init) => {
		const r = rig();
		const e = r.press(inside(r), init);
		expect(r.activeHost).not.toHaveBeenCalled();
		expect(r.undo).not.toHaveBeenCalled();
		expect(r.redo).not.toHaveBeenCalled();
		expect(e.defaultPrevented).toBe(false);
	});

	it("ignores a key some earlier handler already handled", () => {
		const r = rig();
		const target = inside(r);
		const pre = (e: Event): void => { e.preventDefault(); };
		window.addEventListener("keydown", pre, { capture: true }); // runs before the document's capture listener
		detach.push(() => { window.removeEventListener("keydown", pre, { capture: true }); });
		r.press(target, MOD_Z);
		expect(r.undo).not.toHaveBeenCalled();
	});
});

describe("createUndoKeyHandler — active view and target", () => {
	it("ignores the key while another view is active, and reads no DOM before that check", () => {
		const r = rig({ active: false });
		const target = inside(r);
		const instanceOf = vi.spyOn(target as unknown as { instanceOf: () => boolean }, "instanceOf");
		const contains = vi.spyOn(r.host.containerEl, "contains");
		const e = r.press(target, MOD_Z);
		expect(r.activeHost).toHaveBeenCalledTimes(1);
		expect(instanceOf).not.toHaveBeenCalled();
		expect(contains).not.toHaveBeenCalled();
		expect(r.host.undoKeyPolicy).not.toHaveBeenCalled();
		expect(r.undo).not.toHaveBeenCalled();
		expect(e.defaultPrevented).toBe(false);
	});

	it("ignores a target outside the host, such as a modal or another leaf", () => {
		const r = rig();
		const modal = make("div");
		const e = r.press(modal, MOD_Z);
		expect(r.undo).not.toHaveBeenCalled();
		expect(r.host.undoKeyPolicy).not.toHaveBeenCalled();
		expect(e.defaultPrevented).toBe(false);
	});

	it("treats the document body as the active view's: nothing is focused after a card click", () => {
		const r = rig();
		const e = r.press(document.body, MOD_Z);
		expect(r.undo).toHaveBeenCalledTimes(1);
		expect(e.defaultPrevented).toBe(true);
	});

	it("treats the document element like the body", () => {
		const r = rig();
		r.press(document.documentElement, MOD_Z);
		expect(r.undo).toHaveBeenCalledTimes(1);
	});
});

describe("createUndoKeyHandler — key policy", () => {
	it("a text policy lets the key through to the field's own undo", () => {
		const r = rig({ policy: "text" });
		const input = inside(r, "input");
		const e = r.press(input, MOD_Z);
		expect(r.host.undoKeyPolicy).toHaveBeenCalledWith(input);
		expect(r.undo).not.toHaveBeenCalled();
		expect(e.defaultPrevented).toBe(false);
	});

	it("a journal policy on a saved, focused field undoes and leaves the focus where it was", () => {
		const r = rig({ policy: "journal" });
		const input = inside(r, "input");
		input.focus();
		const e = r.press(input, MOD_Z);
		expect(r.host.undoKeyPolicy).toHaveBeenCalledWith(input);
		expect(r.undo).toHaveBeenCalledTimes(1);
		expect(e.defaultPrevented).toBe(true);
		expect(document.activeElement).toBe(input);
	});
});

describe("createUndoKeyHandler — popout windows", () => {
	const popout = (): Document => {
		const frame = document.createElement("iframe");
		document.body.appendChild(frame);
		installInstanceOf(frame.contentWindow!);
		return frame.contentDocument!;
	};

	it("handles a target inside a host that lives in another window", () => {
		const r = rig({ doc: popout() });
		const e = r.press(inside(r), MOD_Z);
		expect(r.undo).toHaveBeenCalledTimes(1);
		expect(e.defaultPrevented).toBe(true);
	});

	it("treats the popout's own body as the host's", () => {
		const doc = popout();
		const r = rig({ doc });
		r.press(doc.body, MOD_SHIFT_Z);
		expect(r.redo).toHaveBeenCalledTimes(1);
	});

	it("does not treat the main window's body as a popout host's", () => {
		const r = rig({ doc: popout() });
		// The handler is on the popout document; call it as if the main document had it too.
		const handler = createUndoKeyHandler({ activeHost: r.activeHost, undo: r.undo, redo: r.redo });
		document.addEventListener("keydown", handler, { capture: true });
		detach.push(() => { document.removeEventListener("keydown", handler, { capture: true }); });
		r.press(document.body, MOD_Z);
		expect(r.undo).not.toHaveBeenCalled();
	});
});
