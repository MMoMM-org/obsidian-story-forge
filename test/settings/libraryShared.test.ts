/**
 * libraryShared.test.ts — focusedKey across windows (#50).
 *
 * In a popout the focused element comes from that window's realm, where the
 * main window's `instanceof HTMLElement` answers false. focusedKey must use
 * Obsidian's cross-window Node.instanceOf so a repaint keeps focus there too.
 */
import { afterEach, describe, expect, it } from "vitest";
import { installInstanceOf } from "obsidian";
import { focusedKey } from "settings/libraryShared";

afterEach(() => {
	document.body.replaceChildren();
});

function hostWith(el: HTMLElement): HTMLElement {
	const host = document.createElement("div");
	document.body.appendChild(host);
	host.appendChild(el);
	el.setAttribute("data-focus", "row-3");
	el.setAttribute("tabindex", "0");
	el.focus();
	return host;
}

describe("focusedKey", () => {
	it("reads the data-focus key of the focused element inside the host", () => {
		expect(focusedKey(hostWith(document.createElement("button")))).toBe("row-3");
	});

	it("returns null when focus is outside the host", () => {
		hostWith(document.createElement("button"));
		const other = document.createElement("div");
		document.body.appendChild(other);
		expect(focusedKey(other)).toBeNull();
	});

	it("reads it from an element of another window's realm, as in a popout", () => {
		const frame = document.createElement("iframe");
		document.body.appendChild(frame);
		installInstanceOf(frame.contentWindow!);
		const doc = frame.contentDocument!;
		const host = doc.createElement("div");
		doc.body.appendChild(host);
		const button = doc.createElement("button");
		button.setAttribute("data-focus", "row-3");
		host.appendChild(button);
		button.focus();
		expect(button instanceof HTMLElement).toBe(false);

		// Obsidian points activeDocument at the popout's document while it has focus.
		const g = globalThis as unknown as { activeDocument: Document };
		const main = g.activeDocument;
		g.activeDocument = doc;
		try {
			expect(focusedKey(host)).toBe("row-3");
		} finally {
			g.activeDocument = main;
		}
	});
});
