/**
 * T7.1b — the settings tab strip and the Library › Collections list (spec 008, Phase 7;
 * mockups-library.html L1, L2, L3, L8a, L9 and proposals P1, P4, P10–P14, P16, P17).
 *
 * The tab runs against a real `ViewStore` and a real `CollectionStore` over an in-memory
 * data blob, so "a click wrote something" is read back from the store, never from a spy alone.
 * The Cards list and the surfaces are T7.1c/T7.1d and are not exercised here.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { App, Notice, TFile } from "../__mocks__/obsidian";
import { SettingsTab, type LibraryDeps } from "../../src/settings/SettingsTab";
import { ViewStore } from "../../src/store/ViewStore";
import type { PluginDataPort, StoryForgeData, ViewRecord } from "../../src/store/types";
import type { ConsentGate, ConsentDecision } from "../../src/consent/ConsentGate";
import type { ViewImporter } from "../../src/import/ViewImporter";
import type { IndexedNote } from "../../src/codex/collectionResolver";
import { CollectionStore } from "../../src/library/collectionStore";
import { createLibraryPort } from "../../src/library/settingsPort";
import { DEFAULT_SETTINGS, LIBRARY_MIGRATED_HINT_ID, type PluginSettings } from "../../src/types/index";

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

const rec = (o: Partial<ViewRecord> = {}): ViewRecord => ({
	provenance: "imported",
	enabled: true,
	okayed: null,
	source: "30 Canon/Organizations/Organizations.base",
	engine: "bases",
	command: false,
	kind: "collection",
	surfaces: { anvil: true, workbench: false },
	...o,
});

/** The mockup's seed (L2a): Creatures from repo, Organizations a .base, Skills DQL, a DataviewJS script. */
function seedViews(): Record<string, ViewRecord> {
	return {
		creatures: rec({
			provenance: "curated",
			source: "00 Meta/Bases/Creatures.base",
			commandName: "Creatures",
			generated: {
				sourceChecksum: "s",
				params: { tag: "canon/creature", excludedFolders: ["00 Meta"] },
				instanceChecksum: "i",
				filePath: "00 Meta/Bases/Creatures.base",
				verify: true,
			},
		}),
		organizations: rec({ commandName: "Organizations" }),
		skills: rec({
			engine: "dataview-dql",
			source: "90 Views/Skills.md",
			commandName: "Skills",
			surfaces: { anvil: false, workbench: true },
			command: true,
			commandLabel: "Open skills",
		}),
		web: rec({
			engine: "dataviewjs",
			source: "90 Views/Relationship web.md",
			commandName: "Relationship web",
			okayed: { version: 2, checksum: "c" },
			surfaces: { anvil: false, workbench: true },
		}),
	};
}

const NOTES: IndexedNote[] = [
	{ path: "30 Canon/Characters/Mara.md", tags: ["canon/character"] },
	{ path: "30 Canon/Characters/Tobias.md", tags: ["canon/character"] },
	{ path: "30 Canon/Characters/Ilse.md", tags: ["canon/character"] },
	{ path: "00 Meta/Templates/Character.md", tags: ["canon/character"] },
	{ path: "30 Canon/Places/Harbor.md", tags: ["canon/location"] },
];

interface WorldOptions {
	views?: Record<string, ViewRecord>;
	settings?: Partial<PluginSettings>;
	/** Decision the gate returns for a record, by source path; the default is "consented". */
	decisions?: Record<string, ConsentDecision["status"]>;
	notes?: IndexedNote[];
}

function makeWorld(opts: WorldOptions = {}) {
	let data: StoryForgeData = { views: structuredClone(opts.views ?? seedViews()) };
	const port: PluginDataPort = {
		load: async () => structuredClone(data),
		save: async (d) => { data = structuredClone(d as StoryForgeData); },
	};
	const views = new ViewStore(port);
	const app = new App();
	const plugin = {
		app,
		manifest: { id: "story-forge", name: "Story Forge", version: "0.0.0", minAppVersion: "1.5.7" },
		settings: { ...DEFAULT_SETTINGS, ...opts.settings } as PluginSettings,
		saveSettings: vi.fn(async () => {}),
	};
	const collections = new CollectionStore(createLibraryPort(views, plugin));
	const gate = {
		evaluate: vi.fn(async (r: ViewRecord): Promise<ConsentDecision> => {
			const status = opts.decisions?.[r.source] ?? "consented";
			return status === "drift" ? { status, reason: "checksum" } : ({ status } as ConsentDecision);
		}),
		requestConsent: vi.fn(async () => true),
		requestReConsent: vi.fn(async () => true),
	};
	const importer = { scanVault: vi.fn(async () => []) };
	const registerCommand = vi.fn();
	const removeCommand = vi.fn();
	const openCapabilities = vi.fn();
	const deps: LibraryDeps = { collections, notes: () => opts.notes ?? NOTES, openCapabilities };
	const noUndo = { setPersistence: async () => {}, clear: async () => {} };
	const tab = new SettingsTab(
		app, plugin as never, views, gate as unknown as ConsentGate, importer as unknown as ViewImporter, registerCommand, removeCommand, noUndo, deps,
	);
	return {
		tab, app, plugin, views, collections, gate, importer, registerCommand, removeCommand, openCapabilities,
		stored: () => data.views ?? {},
	};
}

type World = ReturnType<typeof makeWorld>;

async function open(opts: WorldOptions = {}): Promise<World & { root: HTMLElement }> {
	const w = makeWorld(opts);
	await w.tab.displayAsync();
	document.body.appendChild(w.tab.containerEl);
	return { ...w, root: w.tab.containerEl };
}

afterEach(() => {
	document.body.innerHTML = "";
	Notice._reset();
});

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

const item = (root: ParentNode, id: string): HTMLElement => {
	const el = root.querySelector<HTMLElement>(`[data-collection-id="${id}"]`);
	if (!el) throw new Error(`no row for ${id}`);
	return el;
};
const q = <T extends HTMLElement = HTMLElement>(root: ParentNode, sel: string): T | null => root.querySelector<T>(sel);
const text = (el: Element | null | undefined): string => (el?.textContent ?? "").trim();
const rowIds = (root: ParentNode): string[] =>
	[...root.querySelectorAll<HTMLElement>("[data-collection-id]")].map((e) => e.dataset["collectionId"] ?? "");
const switchOf = (root: ParentNode, id: string, surface: "Anvil" | "Workbench"): HTMLElement => {
	const el = [...item(root, id).querySelectorAll<HTMLElement>("[role=switch]")].find((s) => text(s).startsWith(surface));
	if (!el) throw new Error(`no ${surface} switch on ${id}`);
	return el;
};
const checkbox = (root: ParentNode, id: string): HTMLInputElement =>
	item(root, id).querySelector<HTMLInputElement>("input[type=checkbox]")!;
const button = (root: ParentNode, label: string): HTMLButtonElement | null =>
	[...root.querySelectorAll<HTMLButtonElement>("button")].find((b) => text(b).replace(/\s*[▾▸]$/, "") === label) ?? null;
const flush = async (): Promise<void> => { await vi.waitFor(() => undefined); await new Promise((r) => setTimeout(r, 0)); };
async function click(el: Element | null): Promise<void> {
	if (!el) throw new Error("click target missing");
	el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	await flush();
}
async function configure(root: ParentNode, id: string): Promise<HTMLElement> {
	await click(button(item(root, id), "Configure"));
	const panel = q(item(root, id), "[role=region]");
	if (!panel) throw new Error(`configure panel for ${id} did not open`);
	return panel;
}
const panelOf = (root: ParentNode, tab: string): HTMLElement => q(root, `[role=tabpanel][data-tab="${tab}"]`)!;
const settingNames = (el: ParentNode): string[] =>
	[...el.querySelectorAll("[data-setting-name]")].map((e) => e.getAttribute("data-setting-name") ?? "");

// ---------------------------------------------------------------------------
// (1) L1 — the tab strip and where every setting went
// ---------------------------------------------------------------------------

describe("L1 · the tab strip", () => {
	it("shows Library, Scope and Behaviour under the plugin header, Library first and selected", async () => {
		const { root } = await open();
		const tabs = [...root.querySelectorAll<HTMLElement>("[role=tablist] [role=tab]")];
		expect(tabs.map(text)).toEqual(["Library", "Scope", "Behaviour"]);
		expect(tabs.map((t) => t.getAttribute("aria-selected"))).toEqual(["true", "false", "false"]);
		const header = q(root, ".sf-settings-header")!;
		const strip = q(root, "[role=tablist]")!;
		expect(header.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	});

	it("places every pre-existing setting exactly once, under its mapped tab (L1c)", async () => {
		const { root } = await open();
		const mapped: Record<string, string[]> = {
			library: ["Folder for collections from the repo"],
			scope: ["FileClasses folder", "Excluded folders"],
			behaviour: [
				"Link click action",
				"Open note from card title",
				"Undo history",
				"Keep undo history across restarts",
				"Clear undo history",
			],
		};
		for (const [tab, names] of Object.entries(mapped)) {
			for (const name of names) {
				expect(settingNames(panelOf(root, tab)).filter((n) => n === name), `${name} in ${tab}`).toHaveLength(1);
				expect(settingNames(root).filter((n) => n === name), `${name} overall`).toHaveLength(1);
			}
		}
		// Nothing of the old long page is left: no Views list, no Curated bases folder row.
		const all = settingNames(root);
		for (const gone of ["Views", "Curated bases folder"]) expect(all).not.toContain(gone);
	});

	it("shows only the selected panel, and the arrow keys move between tabs", async () => {
		const { root } = await open();
		const hidden = (t: string): boolean => panelOf(root, t).hidden;
		expect([hidden("library"), hidden("scope"), hidden("behaviour")]).toEqual([false, true, true]);

		const library = q(root, "[role=tab]")!;
		library.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
		await flush();
		expect([hidden("library"), hidden("scope"), hidden("behaviour")]).toEqual([true, false, true]);
		expect(document.activeElement?.textContent).toBe("Scope");
		expect(q(root, "[role=tab][aria-selected=true]")?.getAttribute("tabindex")).toBe("0");

		q(root, "[role=tab][aria-selected=true]")!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
		await flush();
		expect(hidden("library")).toBe(false);
	});

	it("opens a given tab with a given collection's panel expanded (the S98 deep link)", async () => {
		const w = await open();
		await w.tab.openTab("library", { configure: "character" });
		expect(panelOf(w.root, "library").hidden).toBe(false);
		expect(q(item(w.root, "character"), "[role=region]")).not.toBeNull();
		expect((document.activeElement as HTMLInputElement | null)?.getAttribute("aria-label")).toBe("Tag for Characters");
	});

	it("keeps the Scope note about a per-collection override", async () => {
		const { root } = await open();
		const desc = q(root, '[data-setting-name="Excluded folders"] > div:nth-child(2)');
		expect(text(desc)).toContain("A collection can use its own list instead");
	});
});

// ---------------------------------------------------------------------------
// (2) L2 / P11 — rows and badges
// ---------------------------------------------------------------------------

describe("L2 · rows and badges", () => {
	it("lists the rows in store order", async () => {
		const w = await open();
		const expected = (await w.collections.collections()).map((c) => c.id);
		expect(rowIds(w.root)).toEqual(expected);
		expect(rowIds(w.root)).toEqual(["character", "location", "object", "lore", "creatures", "organizations", "skills", "web"]);
		expect([...w.root.querySelectorAll(".sf-lb-name")].map(text)).toEqual([
			"Characters", "Locations", "Objects", "Lore", "Creatures", "Organizations", "Skills", "Relationship web",
		]);
	});

	it("gives every row a provenance badge, and an engine badge to non-built-ins only", async () => {
		const { root } = await open();
		const prov = (id: string): string => text(q(item(root, id), ".sf-lb-prov"));
		const eng = (id: string): string | null => { const e = q(item(root, id), ".sf-lb-eng"); return e ? text(e) : null; };
		expect(["character", "lore", "creatures", "organizations", "skills", "web"].map(prov)).toEqual(
			["built-in", "built-in", "from repo", "imported", "imported", "imported"],
		);
		expect(["character", "lore"].map(eng)).toEqual([null, null]);
		expect(["creatures", "organizations", "skills", "web"].map(eng)).toEqual(["Bases", "Bases", "Dataview", "DataviewJS"]);
	});

	it("shows a status badge only when something blocks the entry, and no Active/Disabled pill", async () => {
		const w = await open({ decisions: { "90 Views/Relationship web.md": "drift", "90 Views/Skills.md": "engine-missing" } });
		const stat = (id: string): string | null => { const e = q(item(w.root, id), ".sf-lb-stat"); return e ? text(e) : null; };
		expect(stat("web")).toBe("▲ Consent required");
		expect(stat("skills")).toBe("■ Dataview not installed");
		expect(["character", "creatures", "organizations"].map(stat)).toEqual([null, null, null]);
		expect(w.root.textContent).not.toMatch(/\bActive\b/);
		expect(w.root.querySelectorAll(".sf-lb-stat")).toHaveLength(2);
	});

	it("words the other blocked states: DataviewJS disabled and not on mobile", async () => {
		const w = await open({ decisions: { "90 Views/Relationship web.md": "dvjs-off", "30 Canon/Organizations/Organizations.base": "platform-restricted" } });
		expect(text(q(item(w.root, "web"), ".sf-lb-stat"))).toBe("○ DataviewJS disabled");
		expect(text(q(item(w.root, "organizations"), ".sf-lb-stat"))).toBe("○ Not available on mobile");
	});

	it("does not call a Bases or DQL row 'Consent required' (consent is a DataviewJS gate)", async () => {
		const w = await open({ decisions: { "90 Views/Skills.md": "not-consented", "30 Canon/Organizations/Organizations.base": "not-consented" } });
		expect(q(item(w.root, "skills"), ".sf-lb-stat")).toBeNull();
		expect(q(item(w.root, "organizations"), ".sf-lb-stat")).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// (3) L2 / P1 / P4 — checkbox and switches
// ---------------------------------------------------------------------------

describe("L2 · the checkbox and the two switches", () => {
	it("the checkbox calls setEnabled and the row shows the stored state", async () => {
		const w = await open();
		const spy = vi.spyOn(w.collections, "setEnabled");
		await click(checkbox(w.root, "organizations"));
		expect(spy).toHaveBeenCalledWith("organizations", false);
		await vi.waitFor(() => expect(w.stored()["organizations"]?.enabled).toBe(false));
		expect(checkbox(w.root, "organizations").checked).toBe(false);
	});

	it("labels the checkbox and the switches with the row name (P4)", async () => {
		const { root } = await open();
		expect(checkbox(root, "organizations").getAttribute("aria-label")).toBe("Enable Organizations");
		const anvil = switchOf(root, "organizations", "Anvil");
		expect(anvil.getAttribute("aria-label")).toBe("Show Organizations in the Anvil");
		expect(switchOf(root, "organizations", "Workbench").getAttribute("aria-label")).toBe("Show Organizations in the Workbench");
		expect(text(anvil)).toBe("Anvil");
	});

	it("the switches are role=switch with aria-checked from the stored values", async () => {
		const { root } = await open();
		const state = (id: string): string[] =>
			(["Anvil", "Workbench"] as const).map((s) => switchOf(root, id, s).getAttribute("aria-checked") ?? "");
		expect(state("character")).toEqual(["true", "true"]);
		expect(state("organizations")).toEqual(["true", "false"]);
		expect(state("skills")).toEqual(["false", "true"]);
		expect(switchOf(root, "organizations", "Anvil").getAttribute("role")).toBe("switch");
	});

	it("a switch saves at once, and flips its own state only", async () => {
		const w = await open();
		const spy = vi.spyOn(w.collections, "setSurface");
		await click(switchOf(w.root, "organizations", "Workbench"));
		expect(spy).toHaveBeenCalledWith("organizations", "workbench", true);
		await vi.waitFor(() => expect(w.stored()["organizations"]?.surfaces).toEqual({ anvil: true, workbench: true }));
		expect(switchOf(w.root, "organizations", "Workbench").getAttribute("aria-checked")).toBe("true");
		expect(switchOf(w.root, "organizations", "Anvil").getAttribute("aria-checked")).toBe("true");
	});

	it("a built-in's switch writes to the settings, not to a record", async () => {
		const w = await open();
		await click(switchOf(w.root, "object", "Workbench"));
		await vi.waitFor(() => expect(w.plugin.settings.builtInCollections["object"]?.workbench).toBe(false));
		expect(w.plugin.saveSettings).toHaveBeenCalled();
	});

	it("while the checkbox is off the switches are aria-disabled, keep their values, and ignore clicks", async () => {
		const w = await open({ settings: { builtInCollections: { lore: { enabled: false, anvil: true, workbench: false } } } });
		const anvil = switchOf(w.root, "lore", "Anvil");
		const bench = switchOf(w.root, "lore", "Workbench");
		expect([anvil, bench].map((s) => s.getAttribute("aria-disabled"))).toEqual(["true", "true"]);
		expect([anvil, bench].map((s) => s.getAttribute("aria-checked"))).toEqual(["true", "false"]);
		const spy = vi.spyOn(w.collections, "setSurface");
		await click(bench);
		expect(spy).not.toHaveBeenCalled();
		expect(checkbox(w.root, "lore").checked).toBe(false);
	});

	it("re-checking restores the kept switches", async () => {
		const w = await open({ settings: { builtInCollections: { lore: { enabled: false, anvil: true, workbench: false } } } });
		await click(checkbox(w.root, "lore"));
		await vi.waitFor(() => expect(checkbox(w.root, "lore").checked).toBe(true));
		expect(switchOf(w.root, "lore", "Anvil").getAttribute("aria-disabled")).not.toBe("true");
		expect(switchOf(w.root, "lore", "Anvil").getAttribute("aria-checked")).toBe("true");
	});

	it("enabled with both switches off says 'Shown nowhere' and stays checked", async () => {
		const w = await open({ views: { off: rec({ commandName: "Parked", surfaces: { anvil: false, workbench: false } }) } });
		expect(checkbox(w.root, "off").checked).toBe(true);
		expect(text(q(item(w.root, "off"), ".sf-lb-hint"))).toBe("Shown nowhere. Turn on Anvil or Workbench to see it.");
	});

	it("turning the last switch off writes it but does not uncheck the row", async () => {
		const w = await open();
		await click(switchOf(w.root, "skills", "Workbench"));
		await vi.waitFor(() => expect(text(q(item(w.root, "skills"), ".sf-lb-hint"))).toContain("Shown nowhere"));
		expect(w.stored()["skills"]?.enabled).toBe(true);
	});

	it("ticking an unconsented DataviewJS row opens the consent modal first; cancel leaves it unticked", async () => {
		const w = await open({
			views: { web: { ...seedViews()["web"]!, enabled: false, okayed: null } },
			decisions: { "90 Views/Relationship web.md": "not-consented" },
		});
		w.gate.requestConsent.mockResolvedValueOnce(false);
		await click(checkbox(w.root, "web"));
		expect(w.gate.requestConsent).toHaveBeenCalledWith("web", expect.objectContaining({ engine: "dataviewjs" }));
		await flush();
		expect(w.stored()["web"]?.enabled).toBe(false);
		expect(checkbox(w.root, "web").checked).toBe(false);
	});

	it("ticking a drifted DataviewJS row opens the re-consent modal", async () => {
		const w = await open({
			views: { web: { ...seedViews()["web"]!, enabled: false } },
			decisions: { "90 Views/Relationship web.md": "drift" },
		});
		await click(checkbox(w.root, "web"));
		expect(w.gate.requestReConsent).toHaveBeenCalledWith("web", expect.anything());
	});
});

// ---------------------------------------------------------------------------
// (4) provenance governs remove
// ---------------------------------------------------------------------------

describe("L2 · configure and remove by provenance", () => {
	it("a built-in offers configure and no remove; from-repo and imported offer both", async () => {
		const { root } = await open();
		const actions = (id: string): string[] =>
			[...item(root, id).querySelectorAll<HTMLButtonElement>(".sf-lb-row > button.sf-lb-action")].map((b) => text(b).replace(/\s*[▾▸]$/, ""));
		for (const id of ["character", "location", "object", "lore"]) expect(actions(id)).toEqual(["Configure"]);
		for (const id of ["creatures", "organizations", "skills", "web"]) expect(actions(id)).toEqual(["Configure", "Remove"]);
	});

	it("configure is a disclosure button wired to its panel", async () => {
		const { root } = await open();
		const btn = button(item(root, "character"), "Configure")!;
		expect(btn.getAttribute("aria-expanded")).toBe("false");
		await click(btn);
		const open1 = button(item(root, "character"), "Configure")!;
		expect(open1.getAttribute("aria-expanded")).toBe("true");
		const panel = q(item(root, "character"), "[role=region]")!;
		expect(open1.getAttribute("aria-controls")).toBe(panel.id);
		expect(panel.getAttribute("aria-label")).toBe("Configure Characters");
		await click(open1);
		expect(q(item(root, "character"), "[role=region]")).toBeNull();
	});

	it("several panels can stay open together, each toggling on its own", async () => {
		const { root } = await open();
		await configure(root, "character");
		await configure(root, "skills");
		expect(root.querySelectorAll("[role=region]")).toHaveLength(2);
		await click(button(item(root, "character"), "Configure"));
		expect(root.querySelectorAll("[role=region]")).toHaveLength(1);
	});
});

// ---------------------------------------------------------------------------
// (5) L3 — the configure panels
// ---------------------------------------------------------------------------

describe("L3a · a built-in", () => {
	it("shows the tag, 'Same as Scope' and a live count that excludes the Scope folders", async () => {
		const { root } = await open();
		const panel = await configure(root, "character");
		expect((q(panel, "input[aria-label='Tag for Characters']") as HTMLInputElement).value).toBe("canon/character");
		expect(text(panel)).toContain("Same as Scope (00 Meta)");
		expect((q(panel, "input[type=checkbox]") as HTMLInputElement).checked).toBe(true);
		expect(text(q(panel, ".sf-lb-count"))).toBe("3 notes match: tagged canon/character, outside 00 Meta.");
	});

	it("says 'No notes match this tag.' in the warning style when nothing matches, and 1 note in the singular", async () => {
		const w = await open();
		const lore = await configure(w.root, "lore");
		expect(text(q(lore, ".sf-lb-count"))).toBe("No notes match this tag.");
		expect(q(lore, ".sf-lb-count")?.classList.contains("is-warn")).toBe(true);
		const loc = await configure(w.root, "location");
		expect(text(q(loc, ".sf-lb-count"))).toBe("1 note matches: tagged canon/location, outside 00 Meta.");
		expect(q(loc, ".sf-lb-count")?.classList.contains("is-warn")).toBe(false);
	});

	it("strips a leading # from the typed tag, saves it, and refreshes the count", async () => {
		const w = await open();
		const panel = await configure(w.root, "character");
		const input = q<HTMLInputElement>(panel, "input[aria-label='Tag for Characters']")!;
		input.value = "#canon/location";
		input.dispatchEvent(new Event("change", { bubbles: true }));
		await vi.waitFor(() => expect(w.plugin.settings.builtInCollections["character"]?.tag).toBe("canon/location"));
		const again = q<HTMLInputElement>(item(w.root, "character"), "input[aria-label='Tag for Characters']")!;
		expect(again.value).toBe("canon/location");
		expect(text(q(item(w.root, "character"), ".sf-lb-count"))).toContain("1 note matches");
	});

	it("unchecking 'Same as Scope' reveals a list prefilled with Scope's, saved on change, and the count follows", async () => {
		const w = await open();
		const panel = await configure(w.root, "character");
		await click(q(panel, "input[type=checkbox]"));
		const list = q<HTMLInputElement>(item(w.root, "character"), "input[aria-label='Excluded folders for Characters']")!;
		expect(list.value).toBe("00 Meta");
		list.value = "30 Canon/Characters, Drafts";
		list.dispatchEvent(new Event("change", { bubbles: true }));
		await vi.waitFor(() => expect(w.plugin.settings.builtInCollections["character"]?.excludedFolders).toEqual(["30 Canon/Characters", "Drafts"]));
		expect(text(q(item(w.root, "character"), ".sf-lb-count"))).toBe(
			"1 note matches: tagged canon/character, outside 30 Canon/Characters, Drafts.",
		);
	});

	it("re-checking 'Same as Scope' drops the own list", async () => {
		const w = await open({ settings: { builtInCollections: { character: { excludedFolders: ["Drafts"] } } } });
		const panel = await configure(w.root, "character");
		const box = q<HTMLInputElement>(panel, "input[type=checkbox]")!;
		expect(box.checked).toBe(false);
		await click(box);
		await vi.waitFor(() => expect(w.plugin.settings.builtInCollections["character"]?.excludedFolders).toBeUndefined());
	});

	it("explains that folders only exclude, and that a built-in is disabled, not removed or renamed", async () => {
		const { root } = await open();
		const panel = await configure(root, "character");
		expect(text(panel)).toContain("Selection is by tag; folders only ever exclude.");
		expect(text(panel)).toContain("A built-in can be disabled but not removed or renamed.");
		expect(q(panel, "input[aria-label='Name']")).toBeNull();
	});
});

describe("L3b · an imported .base", () => {
	it("shows the name, the file read-only and Open file, and no tag or folders", async () => {
		const w = await open();
		w.app.vault.getFileByPath.mockReturnValue(new TFile());
		const panel = await configure(w.root, "organizations");
		expect((q(panel, "input[aria-label='Name']") as HTMLInputElement).value).toBe("Organizations");
		expect(text(q(panel, ".sf-lb-file"))).toBe("30 Canon/Organizations/Organizations.base");
		expect(text(panel)).toContain("read from the file on every render");
		expect(text(panel)).toContain("Story Forge reads it and never changes it");
		expect(q(panel, "input[aria-label^='Tag']")).toBeNull();
		expect(text(panel)).not.toContain("Same as Scope");
	});

	it("Open file opens the .base in a new tab", async () => {
		const w = await open();
		const panel = await configure(w.root, "organizations");
		await click(button(panel, "Open file"));
		expect(w.app.workspace.openLinkText).toHaveBeenCalledWith("30 Canon/Organizations/Organizations.base", "", true);
	});

	it("reports a missing file in the warning style", async () => {
		const w = await open();
		w.app.vault.getFileByPath.mockReturnValue(null);
		const panel = await configure(w.root, "organizations");
		const line = q(panel, ".sf-lb-count")!;
		expect(text(line)).toBe("File not found: 30 Canon/Organizations/Organizations.base");
		expect(line.classList.contains("is-warn")).toBe(true);
	});

	it("renaming saves the name as the pill text and the tab label", async () => {
		const w = await open();
		const panel = await configure(w.root, "organizations");
		const name = q<HTMLInputElement>(panel, "input[aria-label='Name']")!;
		name.value = "Guilds";
		name.dispatchEvent(new Event("change", { bubbles: true }));
		await vi.waitFor(() => expect(w.stored()["organizations"]?.commandName).toBe("Guilds"));
		await vi.waitFor(() => expect(text(q(item(w.root, "organizations"), ".sf-lb-name"))).toBe("Guilds"));
	});

	it("a from-repo collection shows its template's tag and folders read-only, and its file path", async () => {
		const w = await open();
		const panel = await configure(w.root, "creatures");
		expect(text(q(panel, ".sf-lb-file"))).toBe("00 Meta/Bases/Creatures.base");
		expect((q(panel, "input[aria-label='Tag']") as HTMLInputElement).readOnly).toBe(true);
		expect((q(panel, "input[aria-label='Tag']") as HTMLInputElement).value).toBe("canon/creature");
		expect((q(panel, "input[aria-label='Excluded folders']") as HTMLInputElement).value).toBe("00 Meta");
	});
});

describe("L3c · a migrated Dataview entry", () => {
	it("shows name, source with Open file, and the command switch with its name; no consent row for DQL", async () => {
		const w = await open();
		const panel = await configure(w.root, "skills");
		expect((q(panel, "input[aria-label='Name']") as HTMLInputElement).value).toBe("Skills");
		expect(text(q(panel, ".sf-lb-file"))).toBe("90 Views/Skills.md");
		const sw = q(panel, "[role=switch]")!;
		expect(text(sw)).toBe("Add to command palette");
		expect(sw.getAttribute("aria-checked")).toBe("true");
		expect((q(panel, "input[aria-label='Command name']") as HTMLInputElement).value).toBe("Open skills");
		expect(text(panel)).not.toContain("Review consent");
	});

	it("Open file opens the source note", async () => {
		const w = await open();
		const panel = await configure(w.root, "skills");
		await click(button(panel, "Open file"));
		expect(w.app.workspace.openLinkText).toHaveBeenCalledWith("90 Views/Skills.md", "", true);
	});

	it("shows the Command name field only while the switch is on, and reconciles the palette command", async () => {
		const w = await open({ views: { skills: { ...seedViews()["skills"]!, command: false, commandLabel: undefined } } });
		const panel = await configure(w.root, "skills");
		expect(q(panel, "input[aria-label='Command name']")).toBeNull();
		await click(q(panel, "[role=switch]"));
		const field = q<HTMLInputElement>(item(w.root, "skills"), "input[aria-label='Command name']")!;
		expect(field.value).toBe("Skills");
		await vi.waitFor(() => expect(w.stored()["skills"]).toMatchObject({ command: true, commandLabel: "Skills" }));
		expect(w.removeCommand).toHaveBeenCalledWith("skills");
		expect(w.registerCommand).toHaveBeenCalledWith("skills", "Skills");

		field.value = "Open skills";
		field.dispatchEvent(new Event("change", { bubbles: true }));
		await vi.waitFor(() => expect(w.registerCommand).toHaveBeenLastCalledWith("skills", "Open skills"));
		expect(w.stored()["skills"]?.commandLabel).toBe("Open skills");
	});

	it("switching the command off removes the palette entry", async () => {
		const w = await open();
		const panel = await configure(w.root, "skills");
		await click(q(panel, "[role=switch]"));
		await vi.waitFor(() => expect(w.stored()["skills"]?.command).toBe(false));
		expect(w.removeCommand).toHaveBeenCalledWith("skills");
		expect(w.registerCommand).not.toHaveBeenCalled();
	});

	it("a DataviewJS entry shows a consent line with Review consent…, and the button reopens the modal", async () => {
		const w = await open({ decisions: { "90 Views/Relationship web.md": "drift" } });
		const panel = await configure(w.root, "web");
		expect(text(panel)).toContain("The script changed since you approved v2.");
		await click(button(panel, "Review consent…"));
		expect(w.gate.requestReConsent).toHaveBeenCalledWith("web", expect.anything());
	});

	it("a never-approved DataviewJS entry offers the first consent instead", async () => {
		const w = await open({
			views: { web: { ...seedViews()["web"]!, okayed: null } },
			decisions: { "90 Views/Relationship web.md": "not-consented" },
		});
		const panel = await configure(w.root, "web");
		expect(text(panel)).toContain("You have not approved this script yet.");
		await click(button(panel, "Review consent…"));
		expect(w.gate.requestConsent).toHaveBeenCalledWith("web", expect.anything());
	});

	it("says the script is approved when consent is current", async () => {
		const w = await open();
		const panel = await configure(w.root, "web");
		expect(text(panel)).toContain("Approved v2.");
	});
});

describe("L3 · behaviour carried over from the old Views menu", () => {
	it("ticking a disabled, already-consented row re-enables it without opening a modal", async () => {
		const w = await open({ views: { skills: { ...seedViews()["skills"]!, enabled: false } } });
		await click(checkbox(w.root, "skills"));
		await vi.waitFor(() => expect(w.stored()["skills"]?.enabled).toBe(true));
		expect(w.gate.requestConsent).not.toHaveBeenCalled();
		expect(w.gate.requestReConsent).not.toHaveBeenCalled();
	});

	it("Review consent… is reachable for a consented DataviewJS entry and re-reviews it", async () => {
		const w = await open();
		const panel = await configure(w.root, "web");
		await click(button(panel, "Review consent…"));
		expect(w.gate.requestReConsent).toHaveBeenCalledWith("web", expect.anything());
		expect(w.gate.requestConsent).not.toHaveBeenCalled();
	});

	it("a blank name falls back to the source file's basename; an unchanged field writes nothing", async () => {
		const w = await open();
		const panel = await configure(w.root, "skills");
		const spy = vi.spyOn(w.views, "setRecord");
		const name = q<HTMLInputElement>(panel, "input[aria-label='Name']")!;
		name.value = "  ";
		name.dispatchEvent(new Event("change", { bubbles: true }));
		await vi.waitFor(() => expect(w.stored()["skills"]?.commandName).toBeUndefined());
		await vi.waitFor(() => expect(text(q(item(w.root, "skills"), ".sf-lb-name"))).toBe("Skills"));
		spy.mockClear();
		await w.tab.displayAsync();
		expect(spy).not.toHaveBeenCalled();
	});

	it("a stale palette entry is cleared even when the record says there is no command", async () => {
		const w = await open({ views: { skills: { ...seedViews()["skills"]!, command: false } } });
		const panel = await configure(w.root, "skills");
		await click(q(panel, "[role=switch]"));
		await vi.waitFor(() => expect(w.removeCommand).toHaveBeenCalledWith("skills"));
		expect(w.removeCommand.mock.invocationCallOrder[0]).toBeLessThan(w.registerCommand.mock.invocationCallOrder[0]!);
	});
});

describe("L3 · the live count", () => {
	it("is taken from the injected note index and follows the tag", async () => {
		const w = await open({ notes: [{ path: "a.md", tags: ["canon/lore"] }, { path: "b.md", tags: ["canon/lore"] }] });
		const panel = await configure(w.root, "lore");
		expect(text(q(panel, ".sf-lb-count"))).toBe("2 notes match: tagged canon/lore, outside 00 Meta.");
	});
});

// ---------------------------------------------------------------------------
// (6) L8a — inline remove confirmation
// ---------------------------------------------------------------------------

describe("L8a · remove", () => {
	it("a bare click on remove opens a confirmation and writes nothing", async () => {
		const w = await open();
		const before = JSON.stringify(w.stored());
		const rm = vi.spyOn(w.collections, "remove");
		await click(button(item(w.root, "organizations"), "Remove"));
		expect(rm).not.toHaveBeenCalled();
		expect(JSON.stringify(w.stored())).toBe(before);
		expect(q(item(w.root, "organizations"), "[role=group]")).not.toBeNull();
		expect(w.removeCommand).not.toHaveBeenCalled();
	});

	it("names the surface that is on, the file, and states nothing is deleted", async () => {
		const w = await open();
		await click(button(item(w.root, "organizations"), "Remove"));
		const box = q(item(w.root, "organizations"), "[role=group]")!;
		expect(text(box)).toBe(
			"Remove Organizations from the Library? It leaves the Anvil now, and its Card choice is forgotten. " +
			"Your file 30 Canon/Organizations/Organizations.base stays in your vault. Nothing is deleted.RemoveCancel",
		);
	});

	it("builds the sentence from the row: Workbench and a command for Skills, and a note not a file", async () => {
		const w = await open();
		await click(button(item(w.root, "skills"), "Remove"));
		expect(text(q(item(w.root, "skills"), "[role=group] > div"))).toBe(
			"Remove Skills from the Library? It leaves the Workbench now, and its command is removed too. " +
			"Your note 90 Views/Skills.md stays in your vault. Nothing is deleted.",
		);
	});

	it("names both surfaces when both are on, and none when the row shows nowhere", async () => {
		const w = await open({
			views: {
				both: rec({ commandName: "Both", surfaces: { anvil: true, workbench: true } }),
				none: rec({ commandName: "None", surfaces: { anvil: false, workbench: false }, source: "n.base" }),
			},
		});
		await click(button(item(w.root, "both"), "Remove"));
		expect(text(q(item(w.root, "both"), "[role=group] > div"))).toContain("It leaves the Anvil and the Workbench now");
		await click(button(item(w.root, "none"), "Remove"));
		const none = text(q(item(w.root, "none"), "[role=group] > div"));
		expect(none).not.toContain("leaves");
		expect(none).toContain("Nothing is deleted.");
	});

	it("says a from-repo entry's installed file stays", async () => {
		const w = await open();
		await click(button(item(w.root, "creatures"), "Remove"));
		expect(text(q(item(w.root, "creatures"), "[role=group] > div"))).toContain("Your file 00 Meta/Bases/Creatures.base stays in your vault.");
	});

	it("puts focus on Cancel; Cancel and Escape close it without a write and return focus to remove", async () => {
		const w = await open();
		const rm = vi.spyOn(w.collections, "remove");
		await click(button(item(w.root, "organizations"), "Remove"));
		const box = q(item(w.root, "organizations"), "[role=group]")!;
		expect(document.activeElement).toBe(button(box, "Cancel"));
		await click(button(box, "Cancel"));
		expect(q(item(w.root, "organizations"), "[role=group]")).toBeNull();
		expect(document.activeElement).toBe(button(item(w.root, "organizations"), "Remove"));

		await click(button(item(w.root, "organizations"), "Remove"));
		q(item(w.root, "organizations"), "[role=group]")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
		await flush();
		expect(q(item(w.root, "organizations"), "[role=group]")).toBeNull();
		expect(rm).not.toHaveBeenCalled();
		expect(w.stored()["organizations"]).toBeDefined();
	});

	it("Remove calls the store, the command is removed, a notice repeats that the file stays, and focus moves on", async () => {
		const w = await open();
		const rm = vi.spyOn(w.collections, "remove");
		await click(button(item(w.root, "organizations"), "Remove"));
		await click(button(q(item(w.root, "organizations"), "[role=group]")!, "Remove"));
		expect(rm).toHaveBeenCalledWith("organizations");
		await vi.waitFor(() => expect(w.stored()["organizations"]).toBeUndefined());
		expect(rowIds(w.root)).not.toContain("organizations");
		expect(w.removeCommand).toHaveBeenCalledWith("organizations");
		expect(Notice._instances.map((n) => n.message)).toContain("Removed Organizations from the Library. The file is still in your vault.");
		expect(document.activeElement).toBe(checkbox(w.root, "skills"));
	});

	it("never touches the vault: no create, modify, delete or trash", async () => {
		const w = await open();
		await click(button(item(w.root, "organizations"), "Remove"));
		await click(button(q(item(w.root, "organizations"), "[role=group]")!, "Remove"));
		await flush();
		for (const fn of [w.app.vault.create, w.app.vault.modify]) expect(fn).not.toHaveBeenCalled();
	});

	it("removing the last row moves focus to the add controls", async () => {
		const w = await open({ views: { only: rec({ commandName: "Only" }) } });
		await click(button(item(w.root, "only"), "Remove"));
		await click(button(q(item(w.root, "only"), "[role=group]")!, "Remove"));
		await vi.waitFor(() => expect(rowIds(w.root)).not.toContain("only"));
		expect(document.activeElement).toBe(button(w.root, "+ Import from vault…"));
	});

	it("a refused removal shows the reason and keeps the row", async () => {
		const w = await open();
		vi.spyOn(w.collections, "remove").mockResolvedValue({ ok: false, reason: "No collection \"organizations\"" });
		await click(button(item(w.root, "organizations"), "Remove"));
		await click(button(q(item(w.root, "organizations"), "[role=group]")!, "Remove"));
		expect(Notice._instances.map((n) => n.message)).toContain("No collection \"organizations\"");
		expect(w.removeCommand).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// (7) P13 — the migration notice
// ---------------------------------------------------------------------------

describe("P13 · the migration notice", () => {
	it("shows when views moved, with the count", async () => {
		const { root } = await open({ settings: { libraryMigratedCount: 2 } });
		const note = q(root, ".sf-lb-mig")!;
		expect(note.getAttribute("role")).toBe("status");
		expect(text(note)).toContain("Your views are now collections.");
		expect(text(note)).toContain("2 views moved here as imported collections and still show in the Workbench.");
	});

	it("uses the singular for one view", async () => {
		const { root } = await open({ settings: { libraryMigratedCount: 1 } });
		expect(text(q(root, ".sf-lb-mig"))).toContain("1 view moved here as an imported collection and still shows in the Workbench.");
	});

	it("is absent when nothing moved, and when it was dismissed", async () => {
		expect(q((await open()).root, ".sf-lb-mig")).toBeNull();
		const dismissed = await open({ settings: { libraryMigratedCount: 2, dismissedHints: [LIBRARY_MIGRATED_HINT_ID] } });
		expect(q(dismissed.root, ".sf-lb-mig")).toBeNull();
	});

	it("Dismiss calls dismissMigrationNotice, removes the line, and keeps it away", async () => {
		const w = await open({ settings: { libraryMigratedCount: 2 } });
		const spy = vi.spyOn(w.collections, "dismissMigrationNotice");
		await click(q(w.root, ".sf-lb-mig button[aria-label='Dismiss']"));
		expect(spy).toHaveBeenCalledTimes(1);
		await vi.waitFor(() => expect(q(w.root, ".sf-lb-mig")).toBeNull());
		expect(w.plugin.settings.dismissedHints).toContain(LIBRARY_MIGRATED_HINT_ID);
		await w.tab.displayAsync();
		expect(q(w.root, ".sf-lb-mig")).toBeNull();
	});

	it("a bare view of the tab does not migrate or dismiss anything", async () => {
		const w = await open({ settings: { libraryMigratedCount: 2 } });
		const migrate = vi.spyOn(w.collections, "migrate");
		const dismiss = vi.spyOn(w.collections, "dismissMigrationNotice");
		await w.tab.displayAsync();
		expect(migrate).not.toHaveBeenCalled();
		expect(dismiss).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// (8) P14 — curated folder and the capability link
// ---------------------------------------------------------------------------

describe("P14 · the curated folder and the capability link", () => {
	it("keeps the folder setting in the Library tab under the lists, renamed, and saves it", async () => {
		const w = await open({ settings: { curatedBasesFolder: "Custom/Bases" } });
		const lib = panelOf(w.root, "library");
		const row = q(lib, '[data-setting-name="Folder for collections from the repo"]')!;
		expect(text(row)).toContain("Where Browse repo… places the .base files it installs. Default: 00 Meta/Bases");
		const input = q<HTMLInputElement>(row, "input")!;
		expect(input.value).toBe("Custom/Bases");
		expect(q(lib, ".sf-lb-list")!.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		input.value = "  ";
		input.dispatchEvent(new Event("input"));
		await vi.waitFor(() => expect(w.plugin.settings.curatedBasesFolder).toBe("00 Meta/Bases"));
		expect(w.plugin.saveSettings).toHaveBeenCalled();
	});

	it("shows 'What optional plugins add…' at the foot of the Library and calls the T7.4 hook", async () => {
		const w = await open();
		const link = button(panelOf(w.root, "library"), "What optional plugins add…")!;
		const folder = q(panelOf(w.root, "library"), '[data-setting-name="Folder for collections from the repo"]')!;
		expect(folder.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		await click(link);
		expect(w.openCapabilities).toHaveBeenCalledTimes(1);
	});

	it("is a no-op without a T7.4 hook (the screen does not exist yet)", async () => {
		const w = makeWorld();
		const bare = new SettingsTab(w.app, w.plugin as never, w.views, w.gate as unknown as ConsentGate, {} as ViewImporter, vi.fn(), vi.fn(), { setPersistence: async () => {}, clear: async () => {} }, { collections: w.collections, notes: () => [] });
		await bare.displayAsync();
		await expect(click(button(bare.containerEl, "What optional plugins add…"))).resolves.toBeUndefined();
	});

	it("leaves a marked place for the Cards list between the collections and the folder (T7.1c)", async () => {
		const { root } = await open();
		const slot = q(panelOf(root, "library"), "[data-slot='cards']")!;
		expect(slot).not.toBeNull();
		expect(q(root, ".sf-lb-list")!.compareDocumentPosition(slot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect(slot.compareDocumentPosition(q(root, '[data-setting-name="Folder for collections from the repo"]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect(slot.children).toHaveLength(0);
	});

	it("offers + Import from vault… and a disabled + Browse repo… under the list", async () => {
		const { root } = await open();
		expect(button(root, "+ Import from vault…")).not.toBeNull();
		const browse = button(root, "+ Browse repo…")!;
		expect(browse.disabled).toBe(true);
		// The visible name is the accessible name; the reason is its description.
		expect(browse.hasAttribute("aria-label")).toBe(false);
		const note = browse.getAttribute("aria-describedby");
		expect(text(document.getElementById(note ?? ""))).toBe("Coming in a future release");
		expect(browse.title).toBe("Coming in a future release");
	});
});

// ---------------------------------------------------------------------------
// (9) L9 — edge states
// ---------------------------------------------------------------------------

describe("L9 · edge states", () => {
	it("(a) enabled and shown nowhere: a hint, still checked, the switches live", async () => {
		const w = await open({ views: { c: rec({ provenance: "curated", commandName: "Creatures", surfaces: { anvil: false, workbench: false } }) } });
		expect(text(q(item(w.root, "c"), ".sf-lb-hint"))).toBe("Shown nowhere. Turn on Anvil or Workbench to see it.");
		expect(checkbox(w.root, "c").checked).toBe(true);
		expect(switchOf(w.root, "c", "Anvil").getAttribute("aria-disabled")).not.toBe("true");
	});

	it("(b) disabled: the hint says where it will return, the switches are inert and keep their values", async () => {
		const w = await open({ settings: { builtInCollections: { lore: { enabled: false, anvil: true, workbench: false } } } });
		expect(text(q(item(w.root, "lore"), ".sf-lb-hint"))).toBe("Disabled. Enable it to choose where it shows; it will return to the Anvil.");
		expect(item(w.root, "lore").classList.contains("is-off")).toBe(true);
		expect(q(item(w.root, "character"), ".sf-lb-hint")).toBeNull();
	});

	it("(b) disabled with both kept values off keeps the hint short", async () => {
		const w = await open({ settings: { builtInCollections: { lore: { enabled: false, anvil: false, workbench: false } } } });
		expect(text(q(item(w.root, "lore"), ".sf-lb-hint"))).toBe("Disabled. Enable it to choose where it shows.");
	});

	it("(c) engine missing: badge, install link, and the switches stay live", async () => {
		const w = await open({ decisions: { "90 Views/Skills.md": "engine-missing" } });
		const hint = q(item(w.root, "skills"), ".sf-lb-hint")!;
		expect(text(hint)).toBe("Install Dataview to run this collection. Until then its Workbench tab says the same.");
		const link = q<HTMLAnchorElement>(hint, "a")!;
		expect(text(link)).toBe("Install Dataview");
		expect(link.getAttribute("href")).toBe("https://obsidian.md/plugins?id=dataview");
		expect(switchOf(w.root, "skills", "Workbench").getAttribute("aria-disabled")).not.toBe("true");
		await click(switchOf(w.root, "skills", "Anvil"));
		await vi.waitFor(() => expect(w.stored()["skills"]?.surfaces.anvil).toBe(true));
	});

	it("(c) the same row covers DataviewJS disabled and not on mobile", async () => {
		const w = await open({ decisions: { "90 Views/Relationship web.md": "dvjs-off", "90 Views/Skills.md": "platform-restricted" } });
		expect(text(q(item(w.root, "web"), ".sf-lb-hint"))).toBe("DataviewJS is disabled in Dataview settings.");
		expect(text(q(item(w.root, "skills"), ".sf-lb-hint"))).toBe("Not available on mobile.");
	});

	it("(b) wins over (c) on a disabled row: one hint only", async () => {
		const w = await open({
			views: { skills: { ...seedViews()["skills"]!, enabled: false } },
			decisions: { "90 Views/Skills.md": "engine-missing" },
		});
		expect(item(w.root, "skills").querySelectorAll(".sf-lb-hint")).toHaveLength(1);
		expect(text(q(item(w.root, "skills"), ".sf-lb-hint"))).toContain("Disabled.");
		expect(text(q(item(w.root, "skills"), ".sf-lb-stat"))).toBe("■ Dataview not installed");
	});

	it("an empty library shows only the built-ins and the add controls", async () => {
		const { root } = await open({ views: {} });
		expect(rowIds(root)).toEqual(["character", "location", "object", "lore"]);
		expect(button(root, "+ Import from vault…")).not.toBeNull();
	});
});

// ---------------------------------------------------------------------------
// (10) sentence case, over the rendered text (the lint rule covers the source literals)
// ---------------------------------------------------------------------------

/** Words that are proper nouns or UI terms the mockup writes capitalised mid-sentence. */
const PROPER = new Set([
	"Anvil", "Workbench", "Bases", "Dataview", "DataviewJS", "Scope", "Obsidian",
	"Library", "Browse", "Card", "Codex", "FileClass", "FileClasses", "Meta", "Story", "Forge",
]);

/** Capitalised words that are not at the start of a sentence and not allowed. */
function sentenceCaseViolations(raw: string, labels: readonly string[]): string[] {
	if (raw.trim().startsWith("+")) return [];
	let s = raw;
	for (const label of labels) s = s.split(label).join("");
	const words = s.split(/\s+/).filter((w) => /[A-Za-z]/.test(w));
	const bad: string[] = [];
	words.forEach((word, i) => {
		const atStart = i === 0 || /[.?!:]$/.test(words[i - 1] ?? "");
		const bare = word.replace(/[^A-Za-z]/g, "");
		if (atStart || !/^[A-Z][a-z]/.test(bare) || PROPER.has(bare)) return;
		bad.push(word);
	});
	return bad;
}

/** Own text of every visible element, minus user data (row names, paths, code) and the plugin header. */
function visibleStrings(root: HTMLElement): string[] {
	const skip = ".sf-settings-header, .sf-lb-name, .sf-lb-file, code, input";
	return [...root.querySelectorAll<HTMLElement>("*")]
		.filter((el) => !el.closest(skip))
		.map((el) => [...el.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent ?? "").join(" ").trim())
		.filter((t) => t.length > 0);
}

describe("sentence case in the rendered text (test 10)", () => {
	async function everything(): Promise<string[]> {
		const w = await open({
			settings: { libraryMigratedCount: 2, builtInCollections: { lore: { enabled: false, anvil: true, workbench: false } } },
			decisions: { "90 Views/Relationship web.md": "drift", "90 Views/Skills.md": "engine-missing" },
		});
		w.app.vault.getFileByPath.mockReturnValue(null);
		for (const id of ["character", "creatures", "organizations", "skills", "web"]) await configure(w.root, id);
		await click(button(item(w.root, "organizations"), "Remove"));
		await w.collections.setSurface("creatures", "anvil", false);
		await w.collections.setSurface("creatures", "workbench", false);
		await w.tab.displayAsync();
		return visibleStrings(w.root);
	}

	it("covers all three panels, the badges, hints, panels and the confirmation", async () => {
		const strings = await everything();
		for (const expected of [
			"Folder for collections from the repo", "FileClasses folder", "Link click action", "Keep undo history across restarts",
			"built-in", "from repo", "Bases", "Disabled. Enable it to choose where it shows; it will return to the Anvil.",
			"Shown nowhere. Turn on Anvil or Workbench to see it.", "Open file", "Review consent…",
		]) {
			expect(strings.some((t) => t.includes(expected)), expected).toBe(true);
		}
	});

	it("has no mid-sentence capital outside the mockup's proper nouns", async () => {
		const strings = await everything();
		const labels = ["Relationship web", "Organizations", "Creatures", "Characters", "Skills", "Locations", "Objects", "Lore"];
		const offenders = strings.flatMap((t) => sentenceCaseViolations(t, labels).map((w) => `${w} in "${t}"`));
		expect(offenders).toEqual([]);
	});

	it("the checker itself flags a capitalised label (guards the guard)", () => {
		expect(sentenceCaseViolations("Open Note from card title", [])).toEqual(["Note"]);
		expect(sentenceCaseViolations("Shown nowhere. Turn on Anvil or Workbench.", [])).toEqual([]);
		expect(sentenceCaseViolations("▲ Consent required", [])).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// Preserved behaviour of the old Views section
// ---------------------------------------------------------------------------

describe("a stale or partial settings object", () => {
	it("still renders every row: the Library reads settings through the normaliser", async () => {
		const partial = { builtInCollections: undefined, excludedFolders: undefined, disabledCards: undefined } as unknown as Partial<PluginSettings>;
		const w = await open({ settings: partial });
		expect(rowIds(w.root)).toHaveLength(8);
		expect(checkbox(w.root, "character").checked).toBe(true);
	});
});

describe("the list stays live and re-entrant", () => {
	it("a store change repaints the list without a second display()", async () => {
		const w = await open();
		await w.views.setRecord("fresh", rec({ commandName: "Fresh", source: "f.base" }));
		await vi.waitFor(() => expect(rowIds(w.root)).toContain("fresh"));
	});

	it("hide() unsubscribes, and re-opening subscribes exactly once", async () => {
		const w = await open();
		w.tab.hide();
		await w.views.setRecord("late", rec({ commandName: "Late", source: "l.base" }));
		await flush();
		expect(rowIds(w.root)).not.toContain("late");
		await w.tab.displayAsync();
		expect(rowIds(w.root)).toContain("late");
		await w.views.setRecord("later", rec({ commandName: "Later", source: "l2.base" }));
		await vi.waitFor(() => expect(rowIds(w.root)).toContain("later"));
		expect(rowIds(w.root).filter((i) => i === "later")).toHaveLength(1);
	});

	it("two concurrent renders produce one row per collection", async () => {
		const w = makeWorld();
		await Promise.all([w.tab.displayAsync(), w.tab.displayAsync(), w.tab.displayAsync()]);
		expect(rowIds(w.tab.containerEl)).toHaveLength(8);
		expect(w.tab.containerEl.querySelectorAll("[role=tablist]")).toHaveLength(1);
	});

	it("a slow older read never overwrites a newer paint", async () => {
		const w = await open();
		let release: () => void = () => {};
		const slow = new Promise<void>((r) => { release = r; });
		// The next evaluation (the older refresh) stalls; the refresh after it does not.
		w.gate.evaluate.mockImplementationOnce(async () => { await slow; return { status: "consented" }; });
		const older = w.tab.displayAsync();
		await flush();
		await w.views.deleteRecord("organizations");
		// The newer refresh paints 7 rows; the stalled older one has painted nothing yet.
		await vi.waitFor(() => expect(rowIds(w.root)).toHaveLength(7));
		release();
		await older;
		await flush();
		expect(rowIds(w.root)).toHaveLength(7);
		expect(rowIds(w.root)).not.toContain("organizations");
	});

	it("keeps an open panel and the selected tab across a re-render", async () => {
		const w = await open();
		await configure(w.root, "skills");
		await w.tab.displayAsync();
		expect(q(item(w.root, "skills"), "[role=region]")).not.toBeNull();
		await click([...w.root.querySelectorAll("[role=tab]")][2] ?? null);
		await w.tab.displayAsync();
		expect(panelOf(w.root, "behaviour").hidden).toBe(false);
	});

	it("Import from vault… opens today's import picker and writes nothing itself", async () => {
		const w = await open();
		const before = JSON.stringify(w.stored());
		await click(button(w.root, "+ Import from vault…"));
		// The picker's onOpen scans the vault for importable notes.
		await vi.waitFor(() => expect(w.importer.scanVault).toHaveBeenCalledTimes(1));
		expect(JSON.stringify(w.stored())).toBe(before);
	});
});
