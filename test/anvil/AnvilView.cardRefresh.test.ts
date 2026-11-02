/**
 * AnvilView.cardRefresh.test.ts — a field committed in the editor pane reaches
 * the card for the same note in the grid beside it (PRD/F5: the two surfaces
 * show one fact, not two copies).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "obsidian";
import { cellIn, closePanes, mara, openPane, seedVault } from "../helpers/paneFixture";

beforeEach(() => { vi.useFakeTimers(); });
afterEach(async () => {
	await closePanes();
	vi.useRealTimers();
});

function cardFor(root: HTMLElement, path: string): HTMLElement {
	const card = root.querySelector<HTMLElement>(`.sf-cx-card[data-sf-card-body="${path}"]`);
	if (!card) throw new Error(`no card for ${path}`);
	return card;
}

describe("a field committed in the pane", () => {
	it("shows its new value on the note's card in the grid", async () => {
		const app = new App();
		seedVault(app);
		const view = await openPane(app);
		view.setLayout("codex");
		expect(cardFor(view.contentEl, mara.path).textContent).toContain("protagonist");

		const select = cellIn(view.contentEl, "role").querySelector("select")!;
		select.value = "supporting";
		select.dispatchEvent(new Event("change", { bubbles: true }));
		await vi.runAllTimersAsync();

		expect(app.fileManager._getFrontmatter(mara.path)["role"]).toBe("supporting");
		const card = cardFor(view.contentEl, mara.path).textContent ?? "";
		expect(card).toContain("supporting");
		expect(card).not.toContain("protagonist");
	});
});
