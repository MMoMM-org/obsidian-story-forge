/**
 * AnvilView.undeclaredKeys.test.ts — editing an undeclared ("Other properties")
 * key must not change its YAML type: a number stays a number, a list stays a
 * list, and a value no control can represent is never rewritten.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "obsidian";
import { FieldCommitter } from "editor/fieldCommit";
import { createMediaSeams } from "editor/mediaPicker";
import { cellIn, closePanes, inputIn, mara, openPane, seedFrontmatter, seedVault, typeInto } from "../helpers/paneFixture";

beforeEach(() => { vi.useFakeTimers(); });
afterEach(async () => {
	await closePanes();
	vi.useRealTimers();
});

function seedExtras(app: App): void {
	seedVault(app);
	app.fileManager._setFrontmatter(mara.path, {
		...seedFrontmatter(),
		age: 34,
		nicknames: ["Em", "Ash"],
		scores: [1, 2],
		meta: { rank: "captain" },
	});
}

describe("editing an undeclared key through a real AnvilView", () => {
	it("keeps a number a number", async () => {
		const app = new App();
		seedExtras(app);
		const view = await openPane(app);

		typeInto(view.contentEl, "age", "35");
		await vi.runAllTimersAsync();

		expect(app.fileManager._getFrontmatter(mara.path)["age"]).toBe(35);
	});

	it("keeps a list a list when a chip is removed", async () => {
		const app = new App();
		seedExtras(app);
		const view = await openPane(app);

		cellIn(view.contentEl, "nicknames")
			.querySelector(".sf-ed-chip-x")!
			.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		await vi.runAllTimersAsync();

		expect(app.fileManager._getFrontmatter(mara.path)["nicknames"]).toEqual(["Ash"]);
	});

	it("never rewrites a value no control can represent", async () => {
		const app = new App();
		seedExtras(app);
		const view = await openPane(app);

		for (const key of ["meta", "scores"]) {
			const box = inputIn(view.contentEl, key);
			expect(box.readOnly).toBe(true);
			box.value = "clobber";
			box.dispatchEvent(new Event("input", { bubbles: true }));
			box.dispatchEvent(new Event("change", { bubbles: true }));
		}
		await vi.runAllTimersAsync();

		expect(vi.mocked(app.fileManager.processFrontMatter)).not.toHaveBeenCalled();
		const after = app.fileManager._getFrontmatter(mara.path);
		expect(after["meta"]).toEqual({ rank: "captain" });
		expect(after["scores"]).toEqual([1, 2]);
	});
});

describe("FieldCommitter and a read-only field", () => {
	it("refuses an edit reported for it, whatever the control did", async () => {
		const app = new App();
		seedExtras(app);
		const model = { sections: [{ label: "Other properties", source: "other", origin: "other" as const, fields: [
			{ name: "meta", type: "Unknown" as const, width: "full" as const, readOnly: true as const },
		] }] };
		const committer = new FieldCommitter({
			app, file: mara, model, host: document.createElement("div"),
			valueOf: () => ({ rank: "captain" }), media: createMediaSeams(app, mara),
		});

		committer.onEdit({ name: "meta", value: "clobber" });
		await vi.runAllTimersAsync();

		expect(vi.mocked(app.fileManager.processFrontMatter)).not.toHaveBeenCalled();
	});
});
