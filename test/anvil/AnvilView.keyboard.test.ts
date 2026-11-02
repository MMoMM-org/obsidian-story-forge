/**
 * AnvilView.keyboard.test.ts — the delegated Enter/Space router must leave
 * form controls alone: a space has to be typeable, Enter has to settle a box,
 * and Space has to toggle a checkbox — while role="link"/"button" chrome that
 * is NOT a form control keeps activating from the keyboard.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "obsidian";
import { cellIn, closePanes, inputIn, openPane, seedVault, elke } from "../helpers/paneFixture";

beforeEach(() => { vi.useFakeTimers(); });
afterEach(async () => {
	await closePanes();
	vi.useRealTimers();
});

function press(target: Element, key: string): KeyboardEvent {
	const evt = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
	target.dispatchEvent(evt);
	return evt;
}

describe("AnvilView keyboard router — form controls keep their keys", () => {
	it.each(["Enter", " "])("does not swallow %j in a text input", async (key) => {
		const app = new App();
		seedVault(app);
		const view = await openPane(app);
		expect(press(inputIn(view.contentEl, "name"), key).defaultPrevented).toBe(false);
	});

	it.each(["Enter", " "])("does not swallow %j in a number input", async (key) => {
		const app = new App();
		seedVault(app);
		const view = await openPane(app);
		expect(press(inputIn(view.contentEl, "level"), key).defaultPrevented).toBe(false);
	});

	it("does not swallow Space on a checkbox", async () => {
		const app = new App();
		seedVault(app);
		const view = await openPane(app);
		expect(press(inputIn(view.contentEl, "active"), " ").defaultPrevented).toBe(false);
	});

	it.each(["Enter", " "])("does not swallow %j on a select", async (key) => {
		const app = new App();
		seedVault(app);
		const view = await openPane(app);
		const select = cellIn(view.contentEl, "role").querySelector("select")!;
		expect(press(select, key).defaultPrevented).toBe(false);
	});

	it.each(["Enter", " "])("does not swallow %j in the chip entry box", async (key) => {
		const app = new App();
		seedVault(app);
		const view = await openPane(app);
		cellIn(view.contentEl, "allies")
			.querySelector("[data-sf-ed-chip-add]")!
			.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		const entry = cellIn(view.contentEl, "allies").querySelector<HTMLInputElement>("[data-sf-ed-chip-input]")!;
		expect(press(entry, key).defaultPrevented).toBe(false);
	});

	it("does not swallow Enter on the Media buttons, so the native click fires", async () => {
		const app = new App();
		seedVault(app);
		const view = await openPane(app);
		const buttons = cellIn(view.contentEl, "portrait").querySelectorAll("button");
		expect(buttons.length).toBeGreaterThan(0);
		for (const button of Array.from(buttons)) {
			expect(press(button, "Enter").defaultPrevented).toBe(false);
		}
	});
});

describe("AnvilView keyboard router — chrome still activates", () => {
	it("Enter on a role=button / role=link element is routed and prevented", async () => {
		const app = new App();
		seedVault(app);
		const view = await openPane(app);
		view.setLayout("codex");
		const name = view.contentEl.querySelector<HTMLElement>(`.sf-cx-name[data-sf-link="${elke.path}"]`);
		expect(name).not.toBeNull();
		const evt = press(name!, "Enter");
		expect(evt.defaultPrevented).toBe(true);
		// The route did something: the name click opens the note's pane.
		expect(view.contentEl.querySelector(".sf-ed")).not.toBeNull();
	});

	it("Space on a role=button card is prevented (no page scroll) and routed", async () => {
		const app = new App();
		seedVault(app);
		const view = await openPane(app);
		view.setLayout("codex");
		const card = view.contentEl.querySelector<HTMLElement>('.sf-cx-card[role="button"]');
		expect(card).not.toBeNull();
		expect(press(card!, " ").defaultPrevented).toBe(true);
	});
});
