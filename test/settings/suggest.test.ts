/**
 * T7.1 live-test fixes (B, C) — tag and folder suggesters on the settings fields
 * (spec 008 Phase 7; mockups-library.html L1, L3a). The drawn fields stay; a popover is added.
 * The mock's `AbstractInputSuggest` is driven through `_byInput` and `_suggest()`.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { AbstractInputSuggest, App, Notice, TFolder } from "../__mocks__/obsidian";
import { SettingsTab } from "../../src/settings/SettingsTab";
import { ViewStore } from "../../src/store/ViewStore";
import type { ConsentGate } from "../../src/consent/ConsentGate";
import type { ViewImporter } from "../../src/import/ViewImporter";
import type { IndexedNote } from "../../src/codex/collectionResolver";
import { CollectionStore } from "../../src/library/collectionStore";
import { createLibraryPort } from "../../src/library/settingsPort";
import { DEFAULT_SETTINGS, type PluginSettings } from "../../src/types/index";
const NOTES: IndexedNote[] = [
	{ path: "30 Canon/Characters/Mara.md", tags: ["canon/character", "draft"] },
	{ path: "30 Canon/Places/Harbor.md", tags: ["canon/location"] },
];

const folder = (path: string): TFolder => Object.assign(new TFolder(), { path, name: path.split("/").pop() ?? path });

async function open() {
	const app = new App();
	app.vault.getAllFolders.mockReturnValue([folder("00 Meta"), folder("30 Canon"), folder("30 Canon/Characters"), folder("Archive")]);
	const data = { views: {} };
	const views = new ViewStore({ load: vi.fn(async () => data), save: vi.fn(async () => {}) });
	const plugin = {
		app,
		manifest: { id: "story-forge", name: "Story Forge", version: "0.0.0", minAppVersion: "1.12.7" },
		settings: { ...DEFAULT_SETTINGS } as PluginSettings,
		saveSettings: vi.fn(async () => {}),
	};
	const collections = new CollectionStore(createLibraryPort(views, plugin));
	const none = { setPersistence: async () => {}, clear: async () => {} };
	const tab = new SettingsTab(app, plugin as never, views, {} as unknown as ConsentGate, {} as unknown as ViewImporter, () => {}, () => {}, none, {
		collections, notes: () => NOTES,
	});
	await tab.displayAsync();
	document.body.appendChild(tab.containerEl);
	return { tab, plugin, collections, root: tab.containerEl };
}

const flush = async (): Promise<void> => { await vi.waitFor(() => undefined); await new Promise((r) => setTimeout(r, 0)); };
const input = (root: ParentNode, sel: string): HTMLInputElement => {
	const el = root.querySelector<HTMLInputElement>(sel);
	if (!el) throw new Error(`no input ${sel}`);
	return el;
};
const settingInput = (root: ParentNode, name: string): HTMLInputElement => input(root, `[data-setting-name="${name}"] input`);
const suggesterOn = (el: HTMLElement) => AbstractInputSuggest._byInput.get(el);

async function configureCharacter(root: HTMLElement): Promise<HTMLElement> {
	const row = root.querySelector<HTMLElement>('[data-collection-id="character"]')!;
	const btn = [...row.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Configure")!;
	btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	await flush();
	// The list repaints on open, so read the row again.
	const panelEl = root.querySelector<HTMLElement>('[data-collection-id="character"] [role=region]');
	if (!panelEl) throw new Error("configure panel did not open");
	return panelEl;
}

afterEach(() => { document.body.innerHTML = ""; Notice._reset(); AbstractInputSuggest._byInput.clear(); });

describe("tag suggester (L3a)", () => {
	it("is attached to the Tag field and offers vault tags without '#', filtered by the typed text", async () => {
		const { root } = await open();
		const tag = input(await configureCharacter(root), '[aria-label="Tag for Characters"]');
		const s = suggesterOn(tag)!;
		expect(s).toBeDefined();
		tag.value = "";
		expect(await s._suggest()).toEqual(["canon/character", "canon/location", "draft"]);
		tag.value = "#LOC";
		expect(await s._suggest()).toEqual(["canon/location"]);
		tag.value = "zzz";
		expect(await s._suggest()).toEqual([]);
	});

	it("commits a chosen tag through configureBuiltIn", async () => {
		const { root, collections } = await open();
		const spy = vi.spyOn(collections, "configureBuiltIn");
		const tag = input(await configureCharacter(root), '[aria-label="Tag for Characters"]');
		suggesterOn(tag)!.selectSuggestion("canon/location", new MouseEvent("click"));
		await flush();
		expect(tag.value).toBe("canon/location");
		expect(spy).toHaveBeenCalledWith("character", { tag: "canon/location" });
		const stored = (await collections.collections()).find((c) => c.id === "character");
		expect(stored?.tag).toBe("canon/location");
	});

	it("still saves a custom typed tag", async () => {
		const { root, collections } = await open();
		const spy = vi.spyOn(collections, "configureBuiltIn");
		const tag = input(await configureCharacter(root), '[aria-label="Tag for Characters"]');
		tag.value = "my/own-tag";
		tag.dispatchEvent(new Event("change", { bubbles: true }));
		await flush();
		expect(spy).toHaveBeenCalledWith("character", { tag: "my/own-tag" });
	});
});

describe("folder suggester (L1, L3a)", () => {
	it("is attached to all four folder fields", async () => {
		const { root, collections } = await open();
		await collections.configureBuiltIn("character", { excludedFolders: ["Archive"] });
		const panelEl = await configureCharacter(root);
		const fields = [
			settingInput(root, "FileClasses folder"),
			settingInput(root, "Excluded folders"),
			input(panelEl, '[aria-label="Excluded folders for Characters"]'),
		];
		for (const f of fields) expect(suggesterOn(f), f.getAttribute("aria-label") ?? f.placeholder).toBeDefined();
	});

	it("offers vault folders filtered by the typed text, root excluded", async () => {
		const { root, app } = await open().then((w) => ({ root: w.root, app: w.tab.app }));
		const f = settingInput(root, "FileClasses folder");
		const s = suggesterOn(f)!;
		f.value = "30 can";
		expect(await s._suggest()).toEqual(["30 Canon", "30 Canon/Characters"]);
		f.value = "";
		expect((await s._suggest()).length).toBe(4);
		expect(app.vault.getAllFolders).toHaveBeenCalledWith();
	});

	it("selecting for the single-folder field replaces the whole value and saves it", async () => {
		const { root, plugin } = await open();
		const f = settingInput(root, "FileClasses folder");
		suggesterOn(f)!.selectSuggestion("30 Canon", new MouseEvent("click"));
		await flush();
		expect(f.value).toBe("30 Canon");
		expect(plugin.settings.fileClassesFolder).toBe("30 Canon");
	});

	it("in a comma list, suggests for and replaces only the segment being typed", async () => {
		const { root, plugin } = await open();
		const f = settingInput(root, "Excluded folders");
		const s = suggesterOn(f)!;
		f.value = "00 Meta, 30 Ca";
		expect(await s._suggest()).toEqual(["30 Canon", "30 Canon/Characters"]);
		s.selectSuggestion("30 Canon", new MouseEvent("click"));
		await flush();
		expect(f.value).toBe("00 Meta, 30 Canon");
		expect(plugin.settings.excludedFolders).toEqual(["00 Meta", "30 Canon"]);
	});

	it("in the built-in's own list, completes the segment and commits through configureBuiltIn", async () => {
		const { root, collections } = await open();
		await collections.configureBuiltIn("character", { excludedFolders: ["00 Meta"] });
		const f = input(await configureCharacter(root), '[aria-label="Excluded folders for Characters"]');
		f.value = "00 Meta, Arc";
		const spy = vi.spyOn(collections, "configureBuiltIn");
		const s = suggesterOn(f)!;
		expect(await s._suggest()).toEqual(["Archive"]);
		s.selectSuggestion("Archive", new MouseEvent("click"));
		await flush();
		expect(spy).toHaveBeenCalledWith("character", { excludedFolders: ["00 Meta", "Archive"] });
	});

	it("lets free text stand: a typed folder that is not in the vault still saves", async () => {
		const { root, plugin } = await open();
		const f = settingInput(root, "FileClasses folder");
		f.value = "Not/There";
		f.dispatchEvent(new Event("input", { bubbles: true }));
		await flush();
		expect(plugin.settings.fileClassesFolder).toBe("Not/There");
	});
});
