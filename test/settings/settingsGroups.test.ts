/**
 * T7.1 live-test fix (A) — the Behaviour, Scope and Library tabs group their rows with
 * Obsidian's native `SettingGroup`, as the core settings do (spec 008 Phase 7, 2026-11-12).
 * Every setting, label and description is unchanged; only the container is new.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { App } from "../__mocks__/obsidian";
import { SettingsTab } from "../../src/settings/SettingsTab";
import { ViewStore } from "../../src/store/ViewStore";
import type { ConsentGate } from "../../src/consent/ConsentGate";
import type { ViewImporter } from "../../src/import/ViewImporter";
import { DEFAULT_SETTINGS, type PluginSettings } from "../../src/types/index";

afterEach(() => { document.body.innerHTML = ""; });

async function render(): Promise<HTMLElement> {
	const app = new App();
	const data = { views: {} };
	const store = new ViewStore({ load: vi.fn(async () => data), save: vi.fn(async () => {}) });
	const plugin = {
		app,
		manifest: { id: "story-forge", name: "Story Forge", version: "0.0.0", minAppVersion: "1.12.7" },
		settings: { ...DEFAULT_SETTINGS } as PluginSettings,
		saveSettings: vi.fn(async () => {}),
	};
	const none = { setPersistence: async () => {}, clear: async () => {} };
	const tab = new SettingsTab(app, plugin as never, store, {} as unknown as ConsentGate, {} as unknown as ViewImporter, () => {}, () => {}, none);
	await tab.displayAsync();
	document.body.appendChild(tab.containerEl);
	return tab.containerEl;
}

const panel = (root: HTMLElement, tab: string): HTMLElement =>
	root.querySelector<HTMLElement>(`[role=tabpanel][data-tab="${tab}"]`)!;
const names = (el: ParentNode): string[] =>
	[...el.querySelectorAll("[data-setting-name]")].map((e) => e.getAttribute("data-setting-name") ?? "");
/** The groups of a tab as `[heading, setting names]`, in document order. */
const groups = (el: HTMLElement): Array<[string, string[]]> =>
	[...el.querySelectorAll<HTMLElement>(".setting-group")].map((g) => [
		g.querySelector(".setting-item-heading")?.textContent?.trim() ?? "",
		names(g.querySelector(".setting-items")!),
	]);

describe("T7.1 · settings groups", () => {
	it("groups Behaviour into Links and cards, and Undo history", async () => {
		const root = await render();
		expect(groups(panel(root, "behaviour"))).toEqual([
			["Links and cards", ["Link click action", "Open note from card title"]],
			["Undo history", ["Keep undo history across restarts", "Clear undo history"]],
		]);
	});

	it("groups Scope into one group of vault folders", async () => {
		const root = await render();
		expect(groups(panel(root, "scope"))).toEqual([["Vault folders", ["FileClasses folder", "Excluded folders"]]]);
	});

	it("puts the repo folder row in its own Library group, after the Collections and Cards lists", async () => {
		const root = await render();
		const lib = panel(root, "library");
		expect(groups(lib)).toEqual([["Collections from the repo", ["Folder for collections from the repo"]]]);
		const slot = lib.querySelector(".sf-lb-cards-slot")!;
		const group = lib.querySelector(".setting-group")!;
		expect(slot.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	});

	it("keeps every setting exactly once, and no setting outside a group on these tabs", async () => {
		const root = await render();
		const all = names(root);
		for (const name of [
			"Folder for collections from the repo", "FileClasses folder", "Excluded folders", "Link click action",
			"Open note from card title", "Keep undo history across restarts", "Clear undo history",
		]) expect(all.filter((n) => n === name), name).toHaveLength(1);
		for (const tab of ["scope", "behaviour"]) {
			const rows = [...panel(root, tab).querySelectorAll(".setting-item[data-setting-name]")];
			expect(rows.every((r) => r.closest(".setting-group")), tab).toBe(true);
		}
	});
});
