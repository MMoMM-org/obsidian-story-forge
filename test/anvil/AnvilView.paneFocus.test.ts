/**
 * AnvilView.paneFocus.test.ts — the editor pane keeps focus and an uncommitted
 * draft while the vault changes under it (SDD: "the editor keeps focus").
 *
 * `metadataCache.changed` used to rebuild the whole pane through `_render`, even
 * for a different note, destroying the focused box and what had been typed into
 * it. Now: a change to a DIFFERENT note never touches a focused pane; a change
 * to the shown note waits while a control holds a draft and runs on blur; a
 * clean focused control may be refreshed but keeps focus, restored by field
 * name. A user-initiated render stays immediate (T5.4 ruling, 2026-08-06).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "obsidian";
import {
	cellIn,
	closePanes,
	draftInto,
	elke,
	inputIn,
	mara,
	openPane,
	seedFrontmatter,
	seedVault,
	typeInto,
} from "../helpers/paneFixture";

beforeEach(() => { vi.useFakeTimers(); });
afterEach(async () => {
	await closePanes();
	vi.useRealTimers();
});

function externallyRename(app: App, name: string): void {
	app.fileManager._setFrontmatter(mara.path, { ...seedFrontmatter(), name });
	app.metadataCache._trigger("changed", mara);
}

describe("a change to the shown note while another field holds a draft", () => {
	it("keeps the draft box, its text and its focus when A's own `changed` arrives", async () => {
		const app = new App();
		seedVault(app);
		const view = await openPane(app);

		typeInto(view.contentEl, "name", "Mara Ironwright");
		await vi.runAllTimersAsync();
		const levelBox = draftInto(view.contentEl, "level", "5");

		app.metadataCache._trigger("changed", mara);
		await vi.runAllTimersAsync();

		expect(inputIn(view.contentEl, "level")).toBe(levelBox);
		expect(levelBox.value).toBe("5");
		expect(document.activeElement).toBe(levelBox);
	});

	it("keeps the draft when A's own write settles while B is being typed in", async () => {
		const app = new App();
		seedVault(app);
		const view = await openPane(app);
		let releaseWrite = (): void => {};
		vi.mocked(app.fileManager.processFrontMatter).mockImplementationOnce(
			async () => new Promise<void>((res) => { releaseWrite = (): void => { res(); }; }),
		);

		typeInto(view.contentEl, "name", "Mara Ironwright");
		const levelBox = draftInto(view.contentEl, "level", "5");
		app.metadataCache._trigger("changed", mara);
		await vi.runAllTimersAsync();
		releaseWrite();
		await vi.runAllTimersAsync();

		expect(inputIn(view.contentEl, "level")).toBe(levelBox);
		expect(levelBox.value).toBe("5");
		expect(document.activeElement).toBe(levelBox);
	});

	it("applies an external edit once the draft is committed and the box blurs", async () => {
		const app = new App();
		seedVault(app);
		const view = await openPane(app);
		const levelBox = draftInto(view.contentEl, "level", "5");

		externallyRename(app, "Mara Ashford");
		await vi.runAllTimersAsync();
		expect(inputIn(view.contentEl, "name").value).toBe("Mara Stoneway");
		expect(inputIn(view.contentEl, "level")).toBe(levelBox);

		levelBox.dispatchEvent(new Event("change", { bubbles: true }));
		levelBox.blur();
		await vi.runAllTimersAsync();

		expect(inputIn(view.contentEl, "name").value).toBe("Mara Ashford");
		expect(inputIn(view.contentEl, "level").value).toBe("5");
		expect(app.fileManager._getFrontmatter(mara.path)["level"]).toBe(5);
	});
});

describe("a change to a DIFFERENT note", () => {
	it("does not touch a pane whose control holds a draft", async () => {
		const app = new App();
		seedVault(app);
		const view = await openPane(app);
		const levelBox = draftInto(view.contentEl, "level", "5");

		app.fileManager._setFrontmatter(elke.path, { ...seedFrontmatter(), name: "Elke Renamed" });
		app.metadataCache._trigger("changed", elke);
		await vi.runAllTimersAsync();

		expect(inputIn(view.contentEl, "level")).toBe(levelBox);
		expect(levelBox.value).toBe("5");
		expect(document.activeElement).toBe(levelBox);
	});

	it("does not rebuild a pane whose control is merely focused", async () => {
		const app = new App();
		seedVault(app);
		const view = await openPane(app);
		const nameBox = inputIn(view.contentEl, "name");
		nameBox.focus();

		app.metadataCache._trigger("changed", elke);
		await vi.runAllTimersAsync();

		expect(inputIn(view.contentEl, "name")).toBe(nameBox);
		expect(document.activeElement).toBe(nameBox);
	});
});

describe("the reconcile owed while the pane was protected", () => {
	it("runs when focus leaves the pane, with no write involved", async () => {
		const app = new App();
		seedVault(app);
		const view = await openPane(app);
		const nameBox = inputIn(view.contentEl, "name");
		nameBox.focus();
		app.metadataCache._trigger("changed", elke);
		await vi.runAllTimersAsync();
		expect(inputIn(view.contentEl, "name")).toBe(nameBox);

		nameBox.blur();

		expect(inputIn(view.contentEl, "name")).not.toBe(nameBox);
	});
});

describe("a clean pane", () => {
	it("shows an external edit to the shown note", async () => {
		const app = new App();
		seedVault(app);
		const view = await openPane(app);

		externallyRename(app, "Mara Ashford");
		await vi.runAllTimersAsync();

		expect(inputIn(view.contentEl, "name").value).toBe("Mara Ashford");
	});

	it("refreshes a clean focused control but returns focus to the same field", async () => {
		const app = new App();
		seedVault(app);
		const view = await openPane(app);
		const levelBox = inputIn(view.contentEl, "level");
		levelBox.focus();

		externallyRename(app, "Mara Ashford");
		await vi.runAllTimersAsync();

		expect(inputIn(view.contentEl, "name").value).toBe("Mara Ashford");
		const after = inputIn(view.contentEl, "level");
		expect(document.activeElement).toBe(after);
		expect(cellIn(view.contentEl, "level").contains(document.activeElement)).toBe(true);
	});
});

describe("a user-initiated render (T5.4 ruling)", () => {
	it("stays immediate even while a control holds a draft", async () => {
		const app = new App();
		seedVault(app);
		const view = await openPane(app);
		const levelBox = draftInto(view.contentEl, "level", "5");

		view.setLayout("codex");

		expect(inputIn(view.contentEl, "level")).not.toBe(levelBox);
	});
});
