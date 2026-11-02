/**
 * AnvilView.absentField.test.ts — a field the FileClass declares but the note
 * does not hold is an ordinary EMPTY control: not marked "not set", not dimmed,
 * not hidden. Typing into it creates the key.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "obsidian";
import { cellIn, closePanes, inputIn, mara, openPane, seedFrontmatter, seedVault, typeInto } from "../helpers/paneFixture";

beforeEach(() => { vi.useFakeTimers(); });
afterEach(async () => {
	await closePanes();
	vi.useRealTimers();
});

const ABSENT = ["name", "role", "level", "active", "born"] as const;

function seedWithoutDeclaredKeys(app: App): void {
	seedVault(app);
	const present = { ...seedFrontmatter() };
	for (const key of ABSENT) delete present[key];
	app.fileManager._setFrontmatter(mara.path, present);
}

/** Every marker a UI could use to flag "no value": words, state classes, data attributes. */
const NOT_SET_MARKING = /not[-_ ]?set|unset|missing|absent|undefined|placeholder|empty|dim|muted/i;

describe("a declared field the note does not hold", () => {
	it.each(ABSENT)("%s renders as an ordinary control with no value and no 'not set' marking", async (name) => {
		const app = new App();
		seedWithoutDeclaredKeys(app);
		const view = await openPane(app);
		const cell = cellIn(view.contentEl, name);

		expect(cell.textContent ?? "").not.toMatch(NOT_SET_MARKING);
		const everything = [cell, ...Array.from(cell.querySelectorAll("*"))];
		for (const el of everything) {
			expect(el.className.toString()).not.toMatch(NOT_SET_MARKING);
			expect(el.getAttribute("placeholder")).toBeNull();
			for (const attr of Array.from(el.attributes)) {
				if (attr.name.startsWith("data-") && attr.name !== "data-sf-ed-field") {
					expect(attr.name).not.toMatch(NOT_SET_MARKING);
				}
			}
		}
		expect(cell.hidden).toBe(false);
	});

	it("holds an empty/off control, so nothing is shown that the file does not hold", async () => {
		const app = new App();
		seedWithoutDeclaredKeys(app);
		const view = await openPane(app);

		expect(inputIn(view.contentEl, "name").value).toBe("");
		expect(inputIn(view.contentEl, "level").value).toBe("");
		expect(inputIn(view.contentEl, "born").value).toBe("");
		expect(inputIn(view.contentEl, "active").checked).toBe(false);
		expect(cellIn(view.contentEl, "role").querySelector("select")!.value).toBe("");
	});

	it("creates the key in the note when the user types into it", async () => {
		const app = new App();
		seedWithoutDeclaredKeys(app);
		const view = await openPane(app);
		expect(Object.keys(app.fileManager._getFrontmatter(mara.path))).not.toContain("level");

		typeInto(view.contentEl, "level", "7");
		await vi.runAllTimersAsync();

		expect(app.fileManager._getFrontmatter(mara.path)["level"]).toBe(7);
		expect(Object.keys(app.fileManager._getFrontmatter(mara.path))).not.toContain("name");
	});

	it("writes nothing just from rendering or focusing the empty control", async () => {
		const app = new App();
		seedWithoutDeclaredKeys(app);
		const view = await openPane(app);

		inputIn(view.contentEl, "level").focus();
		inputIn(view.contentEl, "level").dispatchEvent(new MouseEvent("click", { bubbles: true }));
		await vi.runAllTimersAsync();

		expect(vi.mocked(app.fileManager.processFrontMatter)).not.toHaveBeenCalled();
	});
});
