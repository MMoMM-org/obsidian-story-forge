/**
 * SettingsTab — the "Undo history" section (spec 009 T5.5, mockup U11).
 *
 * @ref SDD/ADR-48 — AC-F7.1, AC-F7.4, AC-F7.9, AC-C.1
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { App, Notice } from "../__mocks__/obsidian";
import { SettingsTab } from "../../src/settings/SettingsTab";
import { ViewStore } from "../../src/store/ViewStore";
import type { ConsentGate } from "../../src/consent/ConsentGate";
import type { ViewImporter } from "../../src/import/ViewImporter";

afterEach(() => Notice._reset());

function makeStore(): ViewStore {
	const data = { views: {} };
	return new ViewStore({ load: vi.fn(async () => data), save: vi.fn(async () => {}) });
}

function makeTab(keepUndoHistory = true) {
	const settings = { keepUndoHistory };
	const plugin = {
		app: new App(),
		manifest: { id: "story-forge", name: "Story Forge", version: "0.0.0", minAppVersion: "1.5.7" },
		settings,
		saveSettings: vi.fn(async () => {}),
	};
	const undo = { setPersistence: vi.fn(async () => {}), clear: vi.fn(async () => {}) };
	const tab = new SettingsTab(
		plugin.app, plugin as never, makeStore(), {} as unknown as ConsentGate, {} as unknown as ViewImporter, () => {}, () => {}, undo,
	);
	return { tab, plugin, settings, undo };
}

async function render(tab: SettingsTab): Promise<HTMLElement> {
	await tab.displayAsync();
	return tab.containerEl;
}

const row = (root: HTMLElement, name: string): HTMLElement => {
	const el = root.querySelector<HTMLElement>(`[data-setting-name="${name}"]`);
	if (!el) throw new Error(`no setting "${name}"`);
	return el;
};
const KEEP = "Keep undo history across restarts";
const CLEAR = "Clear undo history";
const flush = async (): Promise<void> => { await new Promise((r) => setTimeout(r, 0)); };

describe("SettingsTab — Undo history section", () => {
	// T7.1: the heading is the SettingGroup's own, so the two rows sit inside the group it titles.
	it("is a group heading at the end of the tab, with the two rows inside the group", async () => {
		const root = await render(makeTab().tab);
		const names = [...root.querySelectorAll("[data-setting-name]")].map((e) => e.getAttribute("data-setting-name"));
		expect(names.slice(-2)).toEqual([KEEP, CLEAR]);
		const group = row(root, KEEP).closest(".setting-group")!;
		expect(group.querySelector(".setting-item-heading")?.textContent).toBe("Undo history");
		expect(group.contains(row(root, CLEAR))).toBe(true);
	});

	it("renders once when two renders overlap", async () => {
		const { tab } = makeTab();
		await Promise.all([tab.displayAsync(), tab.displayAsync()]);
		expect(tab.containerEl.querySelectorAll(".setting-group .setting-item-heading")).toHaveLength(5);
		expect([...tab.containerEl.querySelectorAll(".setting-item-heading")].filter((h) => h.textContent === "Undo history")).toHaveLength(1);
	});

	it("explains that the history holds copies of field values, and what off does (U11)", async () => {
		const root = await render(makeTab().tab);
		expect(row(root, KEEP).textContent).toContain(
			"Stores the undo history in the plugin folder so you can still undo after restarting Obsidian. " +
			"It holds copies of field values from your notes and is meant to stay on this device; Obsidian Sync is not expected to transfer it, but this is not verified. Turning this off deletes the stored history.",
		);
		expect(row(root, CLEAR).textContent).toContain(
			"Empties undo and redo and deletes the stored history. Your notes are not changed.",
		);
	});

	it("shows the toggle on by default and off when the setting is off", async () => {
		const on = await render(makeTab(true).tab);
		const off = await render(makeTab(false).tab);
		expect(row(on, KEEP).querySelector("[role=switch]")?.getAttribute("aria-checked")).toBe("true");
		expect(row(off, KEEP).querySelector("[role=switch]")?.getAttribute("aria-checked")).toBe("false");
	});

	it("turning it off saves the setting and calls setPersistence(false)", async () => {
		const { tab, settings, plugin, undo } = makeTab(true);
		const root = await render(tab);
		(row(root, KEEP).querySelector("[role=switch]") as HTMLElement).click();
		await flush();
		expect(settings.keepUndoHistory).toBe(false);
		expect(plugin.saveSettings).toHaveBeenCalled();
		expect(undo.setPersistence).toHaveBeenCalledWith(false);
	});

	it("turning it on again calls setPersistence(true)", async () => {
		const { tab, settings, undo } = makeTab(false);
		const root = await render(tab);
		(row(root, KEEP).querySelector("[role=switch]") as HTMLElement).click();
		await flush();
		expect(settings.keepUndoHistory).toBe(true);
		expect(undo.setPersistence).toHaveBeenCalledWith(true);
	});

	it("the Clear button empties the history and shows 'Undo history cleared'", async () => {
		const { tab, undo } = makeTab();
		const root = await render(tab);
		const button = row(root, CLEAR).querySelector("button") as HTMLButtonElement;
		expect(button.textContent).toBe("Clear");
		expect(button.classList.contains("mod-warning")).toBe(false);
		button.click();
		await flush();
		expect(undo.clear).toHaveBeenCalledTimes(1);
		expect(Notice._instances.map((n) => n.message)).toEqual(["Undo history cleared"]);
	});

	it("a clear that fails shows no 'cleared' notice", async () => {
		const { tab, undo } = makeTab();
		undo.clear.mockRejectedValueOnce(new Error("disk"));
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const root = await render(tab);
		(row(root, CLEAR).querySelector("button") as HTMLButtonElement).click();
		await flush();
		expect(Notice._instances.map((n) => n.message)).not.toContain("Undo history cleared");
		warn.mockRestore();
	});
});
