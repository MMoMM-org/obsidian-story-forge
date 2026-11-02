/**
 * AnvilView.focusOutClick.test.ts — the owed reconcile must not eat a click.
 *
 * A mousedown on a pane header tool or a card moves focus there, so `focusout`
 * fires BEFORE the click. Rendering inside that `focusout` rebuilds the DOM
 * under the pointer: mouseup lands on a different element, no click fires, and
 * the user's first click is lost. The reconcile therefore runs synchronously
 * only when focus leaves the view; when it lands on another element inside the
 * view it waits until the gesture has finished.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "obsidian";
import { closePanes, draftInto, elke, inputIn, openPane, seedVault, typeInto } from "../helpers/paneFixture";

beforeEach(() => { vi.useFakeTimers(); });
afterEach(async () => {
	await closePanes();
	vi.useRealTimers();
});

function focusOut(from: HTMLElement, to: HTMLElement | null): void {
	from.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: to }));
}

function tool(host: HTMLElement, name: string): HTMLElement {
	const el = host.querySelector<HTMLElement>(`[data-sf-ed-tool="${name}"]`);
	if (!el) throw new Error(`no tool ${name}`);
	return el;
}

/** A pane whose name box is focused with a reconcile owed (an unrelated note changed). */
async function owedPane(): Promise<{ view: Awaited<ReturnType<typeof openPane>>; nameBox: HTMLInputElement }> {
	const app = new App();
	seedVault(app);
	const view = await openPane(app);
	const nameBox = inputIn(view.contentEl, "name");
	nameBox.focus();
	app.metadataCache._trigger("changed", elke);
	await vi.runAllTimersAsync();
	expect(inputIn(view.contentEl, "name")).toBe(nameBox);
	return { view, nameBox };
}

function press(target: HTMLElement): void {
	target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
	target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
	target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

describe("focus moving to another element of the view while a reconcile is owed", () => {
	it("keeps the DOM so a header tool's click acts, then reconciles", async () => {
		const { view, nameBox } = await owedPane();
		const fullscreen = tool(view.contentEl, "fullscreen");

		focusOut(nameBox, fullscreen);
		expect(fullscreen.isConnected).toBe(true);
		expect(inputIn(view.contentEl, "name")).toBe(nameBox);

		// The mouse button is held a human-length time before it is released.
		await vi.advanceTimersByTimeAsync(300);
		expect(fullscreen.isConnected).toBe(true);
		press(fullscreen);
		expect(tool(view.contentEl, "fullscreen").getAttribute("aria-label")).toBe("Exit fullscreen");

		await vi.runAllTimersAsync();
		expect(view.contentEl.querySelector(".sf-ed")).not.toBeNull();
	});

	it("keeps the DOM so the close tool's click acts", async () => {
		const { view, nameBox } = await owedPane();
		const close = tool(view.contentEl, "close");

		focusOut(nameBox, close);
		await vi.advanceTimersByTimeAsync(300);
		press(close);

		expect(view.contentEl.querySelector(".sf-ed")).toBeNull();
	});

	it("reconciles promptly once the gesture ends, not only at the fallback", async () => {
		const { view, nameBox } = await owedPane();
		const dock = tool(view.contentEl, "dock");

		focusOut(nameBox, dock);
		dock.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
		expect(inputIn(view.contentEl, "name")).toBe(nameBox);
		await vi.advanceTimersByTimeAsync(10);

		expect(inputIn(view.contentEl, "name")).not.toBe(nameBox);
	});

	it("still reconciles afterwards when no click ever follows", async () => {
		const { view, nameBox } = await owedPane();

		focusOut(nameBox, tool(view.contentEl, "dock"));
		await vi.advanceTimersByTimeAsync(5000);

		expect(inputIn(view.contentEl, "name")).not.toBe(nameBox);
	});

	it("reconciles at once when focus leaves the view entirely", async () => {
		const { view, nameBox } = await owedPane();

		focusOut(nameBox, null);

		expect(inputIn(view.contentEl, "name")).not.toBe(nameBox);
	});
});

describe("a user-initiated render", () => {
	it("leaves no reconcile owed, so a later focusout re-renders nothing", async () => {
		const { view } = await owedPane();

		view.setLayout("codex");
		const box = inputIn(view.contentEl, "name");
		box.focus();
		focusOut(box, null);

		expect(inputIn(view.contentEl, "name")).toBe(box);
	});
});

describe("the deferred reconcile and a live draft", () => {
	it("keeps a draft typed after focus returned to the pane, and reconciles once focus leaves", async () => {
		const { view, nameBox } = await owedPane();
		focusOut(nameBox, tool(view.contentEl, "dock"));

		const box = draftInto(view.contentEl, "name", "Mara Stoneway, typing");
		box.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
		await vi.advanceTimersByTimeAsync(5000);

		expect(inputIn(view.contentEl, "name")).toBe(box);
		expect(box.value).toBe("Mara Stoneway, typing");

		focusOut(box, null);
		expect(inputIn(view.contentEl, "name")).not.toBe(box);
	});

	// KNOWN LIMIT, not a promise: the fallback fires mid-press when the button is
	// held past DEFER_FALLBACK_MS (1500), so the pressed element is rebuilt under
	// the pointer and that click is lost. The committed value survives.
	it("known limit: a press held past the fallback loses its click, but not the committed value", async () => {
		const app = new App();
		seedVault(app);
		const view = await openPane(app);
		typeInto(view.contentEl, "name", "Mara Renamed");
		await vi.runAllTimersAsync();
		const nameBox = inputIn(view.contentEl, "name");
		nameBox.focus();
		app.metadataCache._trigger("changed", elke);
		await vi.runAllTimersAsync();
		const dock = tool(view.contentEl, "dock");

		focusOut(nameBox, dock);
		dock.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
		await vi.advanceTimersByTimeAsync(1400);
		expect(dock.isConnected).toBe(true);
		await vi.advanceTimersByTimeAsync(200);

		expect(dock.isConnected).toBe(false);
		expect(inputIn(view.contentEl, "name").value).toBe("Mara Renamed");
	});
});

describe("closing the view while a reconcile is deferred", () => {
	it("cancels the fallback timer, so nothing renders after close", async () => {
		const { view, nameBox } = await owedPane();
		focusOut(nameBox, tool(view.contentEl, "dock"));
		expect(vi.getTimerCount()).toBeGreaterThan(0);

		await view.onClose();
		expect(vi.getTimerCount()).toBe(0);
		const mutations: MutationRecord[] = [];
		const watch = new MutationObserver((m) => { mutations.push(...m); });
		watch.observe(view.contentEl, { childList: true, subtree: true });
		await vi.advanceTimersByTimeAsync(5000);

		expect(vi.getTimerCount()).toBe(0);
		expect([...mutations, ...watch.takeRecords()]).toHaveLength(0);
		watch.disconnect();
	});
});
