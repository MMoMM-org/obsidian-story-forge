/**
 * SidebarView.library.test.ts — the Workbench takes the Library (spec 008 T7.1d3;
 * mockups-library.html L7a, L7b, P6, P7, D3 and the L9 table, on top of S95/S96).
 *
 * A REAL `SidebarView` over a REAL wired Library (`wireLibrary`) and a real `ViewStore`. Only
 * Obsidian is stood in for (the mock vault) and the query engines, which write a marker so a
 * stale render is visible.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { App, Plugin, WorkspaceLeaf, createMockCachedMetadata, createMockFrontmatterLink, createMockTFile, type CachedMetadata, type TFile } from "obsidian";
import { SidebarView } from "views/SidebarView";
import { SIDEBAR_VIEW_TYPE } from "pluginConstants";
import { workbenchTabs } from "library/collectionStore";
import { wireLibrary, type LibraryHost, type LibraryWiring } from "library/wireLibrary";
import { ViewStore } from "store/ViewStore";
import type { PluginDataPort, StoryForgeData, ViewRecord } from "store/types";
import { DEFAULT_FILE_CLASSES_FOLDER, DEFAULT_SETTINGS, normalizeSettings } from "types/index";
import { createFileClassCache } from "fileclass/fileClassVault";
import type { QueryEngine, EngineRegistry } from "engines/QueryEngine";
import type { ConsentGate } from "consent/ConsentGate";
import { NativeScopingEngine } from "engines/NativeScopingEngine";

const MARA = createMockTFile({ basename: "Mara Stoneway", path: "30 Canon/31 Characters/Mara Stoneway.md" });

function record(over: Partial<ViewRecord> = {}): ViewRecord {
	return {
		provenance: "imported",
		enabled: true,
		okayed: { version: 1, checksum: "sha256:abc" },
		source: "90 Views/Skills.md",
		engine: "dataview-dql",
		command: false,
		commandName: "Skills",
		kind: "collection",
		surfaces: { anvil: false, workbench: true },
		...over,
	};
}

/** Skills (Dataview, Workbench), Creatures (from repo .base, Workbench), Organizations (.base, Anvil only), a Card and a disabled one. */
function standardViews(): Record<string, ViewRecord> {
	return {
		skills: record(),
		creatures: record({ provenance: "curated", engine: "bases", source: "Creatures.base", commandName: "Creatures" }),
		orgs: record({ engine: "bases", source: "Orgs.base", commandName: "Organizations", surfaces: { anvil: true, workbench: false } }),
		hero2: record({ kind: "card", commandName: "Fancy card", source: "Fancy.base", engine: "bases" }),
		parked: record({ commandName: "Parked", source: "90 Views/Parked.md", enabled: false }),
	};
}

/** A vault for the Codex sections: Mara and what links to or from her. */
interface Vault {
	readonly notes: ReadonlyMap<TFile, CachedMetadata>;
	/** The registered native engine reads the real panel, with the Library's sections. */
	readonly native: true;
	/** Give the view the FileClass cache, so edit mode has fields to draw. */
	readonly fileClasses?: boolean;
}

interface World {
	readonly app: App;
	readonly views: ViewStore;
	readonly library: LibraryWiring;
	readonly subscribers: { count: number };
	readonly engineSeen: string[];
	open(): Promise<SidebarView>;
}

const opened: SidebarView[] = [];
afterEach(async () => {
	while (opened.length > 0) await opened.pop()?.onClose();
	vi.restoreAllMocks();
});

const settle = async (): Promise<void> => { for (let i = 0; i < 20; i++) await new Promise<void>((r) => setTimeout(r, 0)); };

async function makeWorld(views: Record<string, ViewRecord> = standardViews(), vault?: Vault): Promise<World> {
	const app = new App();
	vi.mocked(app.metadataCache.getFileCache).mockImplementation((f: TFile) =>
		vault?.notes.get(f) ?? createMockCachedMetadata({ tags: [{ tag: "#canon/character" }], frontmatter: {} }));
	if (vault) wireVault(app, vault);
	app.workspace.getActiveFile = vi.fn(() => MARA);
	let data: StoryForgeData = { views: structuredClone(views), settings: { ...DEFAULT_SETTINGS } };
	const port: PluginDataPort = {
		load: async () => structuredClone(data),
		save: async (d) => { data = structuredClone(d as StoryForgeData); },
	};
	const store = new ViewStore(port);
	const host: LibraryHost = Object.assign(new Plugin(app), { settings: normalizeSettings({}), saveSettings: async (): Promise<void> => {} });
	const library = await wireLibrary(host, store);
	const subscribers = { count: 0 };
	const engineSeen: string[] = [];
	const engine = (kind: QueryEngine["kind"]): QueryEngine => ({
		kind,
		teardown: vi.fn(),
		render: vi.fn(async (rec: ViewRecord, _c: unknown, el: HTMLElement) => { engineSeen.push(rec.source); el.textContent = `drawn:${rec.source}`; }),
	});
	const registry = { get: (kind: QueryEngine["kind"]) => engine(kind) } as unknown as EngineRegistry;
	const gate = { evaluate: vi.fn(async () => ({ status: "consented" })) } as unknown as ConsentGate;
	const stub = { kind: "native", teardown: vi.fn(), render: vi.fn(async (_v: unknown, _c: unknown, el: HTMLElement) => { el.textContent = "native"; }) } as unknown as NativeScopingEngine;
	const native = vault ? new NativeScopingEngine(app, undefined, () => library.snapshot()) : stub;
	return {
		app, views: store, library, subscribers, engineSeen,
		open: async () => {
			const leaf = new WorkspaceLeaf();
			leaf.app = app;
			leaf.view.getViewType = vi.fn(() => SIDEBAR_VIEW_TYPE);
			const counted: Pick<LibraryWiring, "snapshot" | "onChange"> = {
				snapshot: library.snapshot,
				onChange: (l) => {
					subscribers.count++;
					const off = library.onChange(l);
					return () => { subscribers.count--; off(); };
				},
			};
			const fileClasses = vault?.fileClasses ? createFileClassCache(app, () => DEFAULT_FILE_CLASSES_FOLDER, () => {}) : undefined;
			const view = new SidebarView(leaf, registry, gate, native, store, () => "drill", undefined, fileClasses, undefined, counted);
			opened.push(view);
			await view.onOpen();
			await settle();
			return view;
		},
	};
}

const tabs = (v: SidebarView): HTMLElement[] => [...v.contentEl.querySelectorAll<HTMLElement>(".sf-tab")];
const labels = (v: SidebarView): string[] => tabs(v).map((t) => t.textContent ?? "");
const tab = (v: SidebarView, label: string): HTMLElement => {
	const found = tabs(v).find((t) => t.textContent === label);
	if (!found) throw new Error(`no tab ${label}; have ${labels(v).join(", ")}`);
	return found;
};
const selected = (v: SidebarView): string[] => tabs(v).filter((t) => t.getAttribute("aria-selected") === "true").map((t) => t.textContent ?? "");
const click = (el: Element): void => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); };
const bodyText = (v: SidebarView): string => v.contentEl.querySelector(".sf-body")?.textContent ?? "";

// ---------------------------------------------------------------------------
// 1 · the tabs are the Library's
// ---------------------------------------------------------------------------

describe("the Workbench tabs", () => {
	it("are Codex, Navigator, then workbenchTabs of the Library in Library order", async () => {
		const w = await makeWorld();
		const view = await w.open();

		const expected = workbenchTabs(w.library.snapshot()).map((c) => c.label);
		expect(expected).toEqual(["Skills", "Creatures"]);
		expect(labels(view)).toEqual(["Codex", "Navigator", ...expected]);
	});

	it("give no tab to a Workbench-off collection, a disabled one or a Card; a migrated Dataview collection keeps its tab", async () => {
		const view = await (await makeWorld()).open();

		const have = labels(view);
		expect(have).not.toContain("Organizations");
		expect(have).not.toContain("Parked");
		expect(have).not.toContain("Fancy card");
		expect(have).toContain("Skills");
		expect(selected(view)).toEqual(["Codex"]);
	});

	it("select a collection tab and draw it through its own engine", async () => {
		const w = await makeWorld();
		const view = await w.open();

		click(tab(view, "Skills"));
		await settle();

		expect(selected(view)).toEqual(["Skills"]);
		expect(bodyText(view)).toContain("drawn:90 Views/Skills.md");
	});
});

// ---------------------------------------------------------------------------
// L7b · the Source row
// ---------------------------------------------------------------------------

describe("a collection tab's Source row", () => {
	const source = (v: SidebarView): string | null => {
		const sec = [...v.contentEl.querySelectorAll<HTMLElement>(".sf-section")].find((s) => s.querySelector(".sf-sec-label")?.textContent === "Source");
		return sec?.querySelector(".sf-source-line")?.textContent ?? null;
	};

	it("names the path, the engine and the provenance, as L7b draws it", async () => {
		const view = await (await makeWorld()).open();

		click(tab(view, "Skills"));
		await settle();

		expect(source(view)).toBe("90 Views/Skills.md · Dataview · imported collection");
	});

	it("uses the Library's own words for a from-repo .base", async () => {
		const view = await (await makeWorld()).open();

		click(tab(view, "Creatures"));
		await settle();

		expect(source(view)).toBe("Creatures.base · Bases · from repo collection");
	});

	it("is not on the Codex tab", async () => {
		const view = await (await makeWorld()).open();

		expect(source(view)).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// 3 · a Library write rebuilds the tabs live
// ---------------------------------------------------------------------------

describe("a Library write", () => {
	it("setSurface adds and removes a tab without reopening the view", async () => {
		const w = await makeWorld();
		const view = await w.open();

		await w.library.collections.setSurface("orgs", "workbench", true);
		await settle();
		expect(labels(view)).toEqual(["Codex", "Navigator", "Skills", "Creatures", "Organizations"]);

		await w.library.collections.setSurface("orgs", "workbench", false);
		await settle();
		expect(labels(view)).toEqual(["Codex", "Navigator", "Skills", "Creatures"]);
	});

	it("setEnabled removes and restores a tab without reopening the view", async () => {
		const w = await makeWorld();
		const view = await w.open();

		await w.library.collections.setEnabled("skills", false);
		await settle();
		expect(labels(view)).not.toContain("Skills");

		await w.library.collections.setEnabled("skills", true);
		await settle();
		expect(labels(view)).toEqual(["Codex", "Navigator", "Skills", "Creatures"]);
	});

	it("an import appears as a tab at once", async () => {
		const w = await makeWorld({});
		const view = await w.open();
		expect(labels(view)).toEqual(["Codex", "Navigator"]);

		await w.views.setRecord("new", record({ commandName: "Fresh", source: "90 Views/Fresh.md" }));
		await settle();

		expect(labels(view)).toEqual(["Codex", "Navigator", "Fresh"]);
	});
});

// ---------------------------------------------------------------------------
// 4 · the fallback
// ---------------------------------------------------------------------------

describe("the shown collection's tab", () => {
	async function showSkills(): Promise<{ w: World; view: SidebarView }> {
		const w = await makeWorld();
		const view = await w.open();
		click(tab(view, "Skills"));
		await settle();
		expect(bodyText(view)).toContain("drawn:90 Views/Skills.md");
		return { w, view };
	}

	it("falls back to the first tab when its collection is turned off: no dangling selection, no stale render", async () => {
		const { w, view } = await showSkills();

		await w.library.collections.setSurface("skills", "workbench", false);
		await settle();

		expect(selected(view)).toEqual(["Codex"]);
		expect(bodyText(view)).not.toContain("drawn:");
		expect(bodyText(view)).toContain("native");
	});

	it("falls back to the first tab when its collection is disabled", async () => {
		const { w, view } = await showSkills();

		await w.library.collections.setEnabled("skills", false);
		await settle();

		expect(selected(view)).toEqual(["Codex"]);
		expect(bodyText(view)).not.toContain("drawn:");
	});

	it("falls back to the first tab when its collection is removed", async () => {
		const { w, view } = await showSkills();

		await w.library.collections.remove("skills");
		await settle();

		expect(selected(view)).toEqual(["Codex"]);
		expect(labels(view)).toEqual(["Codex", "Navigator", "Creatures"]);
		expect(bodyText(view)).not.toContain("drawn:");
	});

	it("keeps the selection when another collection's switch moves", async () => {
		const { w, view } = await showSkills();

		await w.library.collections.setSurface("creatures", "workbench", false);
		await settle();

		expect(selected(view)).toEqual(["Skills"]);
		expect(bodyText(view)).toContain("drawn:90 Views/Skills.md");
	});
});

// ---------------------------------------------------------------------------
// 7 · the subscription
// ---------------------------------------------------------------------------

describe("the Library subscription", () => {
	it("is taken on open and released on close", async () => {
		const w = await makeWorld();
		expect(w.subscribers.count).toBe(0);
		const view = await w.open();
		expect(w.subscribers.count).toBe(1);

		await view.onClose();
		expect(w.subscribers.count).toBe(0);
	});

	it("is released on unload too, and a later write redraws nothing", async () => {
		const w = await makeWorld();
		const view = await w.open();

		view.unload();
		expect(w.subscribers.count).toBe(0);
		const before = view.contentEl.innerHTML;
		await w.library.collections.setSurface("orgs", "workbench", true);
		await settle();
		expect(view.contentEl.innerHTML).toBe(before);
	});
});

// ---------------------------------------------------------------------------
// 2 · the Codex tab's sections (P6, D3, L7a)
// ---------------------------------------------------------------------------

const note = (name: string, folder: string): TFile => createMockTFile({ basename: name, path: `${folder}/${name}.md` });
const CHARACTERS = "30 Canon/31 Characters";
const TOBIAS = note("Tobias Ferro", CHARACTERS);
const ELKE = note("Elke Stoneway", CHARACTERS);
const HARBOR = note("Moonharbor", "30 Canon/32 Locations");
const SEAL = note("The Warden's Seal", "30 Canon/33 Objects");
const OATH = note("The Warden's Oath", "30 Canon/34 Lore");
const SCENE = note("The Extinguished Fire", "10 Manuscript");
const FC = note("fc-character", DEFAULT_FILE_CLASSES_FOLDER);
const FILES = [MARA, TOBIAS, ELKE, HARBOR, SEAL, OATH, SCENE, FC];

const cache = (tag: string, links: Array<[string, string]> = []): CachedMetadata =>
	createMockCachedMetadata({ tags: [{ tag }], frontmatter: {}, frontmatterLinks: links.map(([k, l]) => createMockFrontmatterLink(k, l)) });

function maraVault(over: Array<[TFile, CachedMetadata]> = []): Vault {
	const notes = new Map<TFile, CachedMetadata>([
		[MARA, cache("#canon/character", [["allies.0", "Tobias Ferro"], ["family.0", "Elke Stoneway"]])],
		[TOBIAS, cache("#canon/character")],
		[ELKE, cache("#canon/character")],
		[HARBOR, cache("#canon/location", [["inhabitants.0", "Mara Stoneway"]])],
		[SEAL, cache("#canon/object", [["owner", "Mara Stoneway"]])],
		[OATH, cache("#canon/lore", [["related.0", "Mara Stoneway"]])],
		[SCENE, cache("#manuscript/scene", [["pov", "Mara Stoneway"]])],
		...over,
	]);
	return { notes, native: true };
}

/** Mara, in edit mode: her FileClass declares `age`, so the editor has a field to type into. */
function editableVault(): Vault {
	const declared = createMockCachedMetadata({ frontmatter: {
		tagNames: ["canon/character"],
		fieldsOrder: ["f-age"],
		fields: [{ id: "f-age", name: "age", type: "Number", options: {} }],
	} });
	const base = maraVault([[FC, declared]]);
	return { ...base, fileClasses: true };
}

function wireVault(app: App, vault: Vault): void {
	const byLink = new Map(FILES.map((f) => [f.basename, f]));
	const byPath = new Map(FILES.map((f) => [f.path, f]));
	vi.mocked(app.metadataCache.getFirstLinkpathDest).mockImplementation((l: string) => byLink.get(l) ?? null);
	vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((p: string) => byPath.get(p) ?? null);
	vi.mocked(app.vault.getMarkdownFiles).mockReturnValue(FILES);
	app.metadataCache.resolvedLinks = Object.fromEntries(
		[HARBOR, SEAL, OATH, SCENE].map((f) => [f.path, { [MARA.path]: 1 }]));
	void vault;
}

interface Drawn { readonly label: string; readonly count: string | null; readonly rows: Array<[string, string | null]> }
const sections = (v: SidebarView): Drawn[] =>
	[...v.contentEl.querySelectorAll<HTMLElement>(".sf-section")].map((s) => ({
		label: s.querySelector(".sf-sec-label")?.textContent ?? "",
		count: s.querySelector(".sf-count")?.textContent ?? null,
		rows: [...s.querySelectorAll<HTMLElement>(".sf-lrow-lnk")].map((l): [string, string | null] =>
			[l.textContent ?? "", l.parentElement?.querySelector(".sf-trail")?.textContent ?? null]),
	}));
const labelsOf = (v: SidebarView): string[] => sections(v).map((s) => s.label);
const BUILT_IN_LABELS = ["Characters", "Locations", "Objects", "Lore"];
const builtInSections = (v: SidebarView): string[] => labelsOf(v).filter((l) => BUILT_IN_LABELS.includes(l));

describe("the Codex tab's sections", () => {
	it("are the built-ins with Workbench on, in Library order, each listing only the note's links into it", async () => {
		const view = await (await makeWorld({}, maraVault())).open();

		const byLabel = Object.fromEntries(sections(view).map((s) => [s.label, s]));
		expect(builtInSections(view)).toEqual(["Characters", "Locations", "Objects", "Lore"]);
		expect(byLabel["Characters"]).toMatchObject({ count: "2", rows: [["Tobias Ferro", "allies"], ["Elke Stoneway", "family"]] });
		expect(byLabel["Locations"]?.rows).toEqual([["Moonharbor", "inhabitants"]]);
		expect(byLabel["Objects"]?.rows).toEqual([["The Warden's Seal", "owns"]]);
		expect(byLabel["Lore"]?.rows).toEqual([["The Warden's Oath", "related"]]);
	});

	it("drop the single Relations grouping, and keep Appears in", async () => {
		const view = await (await makeWorld({}, maraVault())).open();

		expect(labelsOf(view)).not.toContain("Relationships");
		expect(labelsOf(view)).not.toContain("Relations");
		expect(labelsOf(view)).not.toContain("Owns");
		expect(labelsOf(view)).toContain("Appears in");
	});

	it("leave out a built-in whose Workbench switch is off, and show its links nowhere else", async () => {
		const w = await makeWorld({}, maraVault());
		const view = await w.open();

		await w.library.collections.setSurface("object", "workbench", false);
		await settle();

		expect(builtInSections(view)).toEqual(["Characters", "Locations", "Lore"]);
		expect(bodyText(view)).not.toContain("The Warden's Seal");
	});

	it("rebuild live when a switch or a checkbox moves, and bring the section back", async () => {
		const w = await makeWorld({}, maraVault());
		const view = await w.open();

		await w.library.collections.setEnabled("lore", false);
		await settle();
		expect(builtInSections(view)).toEqual(["Characters", "Locations", "Objects"]);

		await w.library.collections.setEnabled("lore", true);
		await settle();
		expect(builtInSections(view)).toEqual(["Characters", "Locations", "Objects", "Lore"]);
	});

	it("redraw around an edit in progress: the typed field survives a switch, and the new sections show once it is saved", async () => {
		const w = await makeWorld({}, editableVault());
		const view = await w.open();
		view.toggleEditMode();
		const age = (): HTMLInputElement => {
			const input = view.contentEl.querySelector<HTMLInputElement>('[data-sf-inspector-input="age"]');
			if (!input) throw new Error("no age field");
			return input;
		};
		const typed = age();
		typed.value = "41";
		typed.dispatchEvent(new Event("input", { bubbles: true }));

		await w.library.collections.setSurface("object", "workbench", false);
		await settle();

		expect(age()).toBe(typed);
		expect(age().value).toBe("41");

		view.contentEl.querySelector<HTMLElement>('[data-sf-inspector-commit="age"]')?.click();
		await settle();
		view.toggleEditMode();
		await settle();
		expect(builtInSections(view)).toEqual(["Characters", "Locations", "Lore"]);
	});

	it("follow the built-in's own tag: a note outside it moves out of the section, not out of the panel", async () => {
		const w = await makeWorld({}, maraVault([[ELKE, cache("#cast")]]));
		const view = await w.open();

		await w.library.collections.configureBuiltIn("character", { tag: "cast" });
		await settle();

		const drawn = sections(view);
		expect(drawn.find((s) => s.label === "Characters")?.rows).toEqual([["Elke Stoneway", "family"]]);
		expect(drawn.find((s) => s.label === "Relationships")?.rows.map((r) => r[0])).toEqual(["Tobias Ferro"]);
	});

	it("follow the built-in's own excluded folders", async () => {
		const w = await makeWorld({}, maraVault());
		const view = await w.open();

		await w.library.collections.configureBuiltIn("location", { excludedFolders: ["30 Canon/32 Locations"] });
		await settle();

		expect(builtInSections(view)).not.toContain("Locations");
		expect(sections(view).find((s) => s.label === "Related")?.rows).toEqual([["Moonharbor", null]]);
	});

	it("keep a link that no built-in claims where it is, and omit a section with nothing in it", async () => {
		const view = await (await makeWorld({}, maraVault([[TOBIAS, cache("#draft")], [ELKE, cache("#draft")]]))).open();

		expect(builtInSections(view)).toEqual(["Locations", "Objects", "Lore"]);
		expect(sections(view).find((s) => s.label === "Relationships")?.rows.map((r) => r[0])).toEqual(["Elke Stoneway", "Tobias Ferro"]);
	});

	it("keep an owned object no built-in claims in Owns, as before", async () => {
		const w = await makeWorld({}, maraVault());
		const view = await w.open();

		await w.library.collections.configureBuiltIn("object", { excludedFolders: ["30 Canon/33 Objects"] });
		await settle();

		expect(builtInSections(view)).not.toContain("Objects");
		expect(sections(view).find((s) => s.label === "Owns")?.rows).toEqual([["The Warden's Seal", null]]);
	});

	it("keep an unresolved link in Relationships, where it always was", async () => {
		const view = await (await makeWorld({}, maraVault([[MARA, cache("#canon/character", [["allies.0", "Tobias Ferro"], ["enemies.0", "Nobody Known"]])]]))).open();

		const relationships = [...view.contentEl.querySelectorAll<HTMLElement>(".sf-section")].find((e) => e.querySelector(".sf-sec-label")?.textContent === "Relationships");
		expect(relationships?.querySelectorAll(".sf-unres")).toHaveLength(1);
		expect(sections(view).find((s) => s.label === "Characters")?.rows).toEqual([["Tobias Ferro", "allies"]]);
	});
});

// ---------------------------------------------------------------------------
// 5 · a row click goes through the NavigationController's markers (F2)
// ---------------------------------------------------------------------------

describe("a Codex section row", () => {
	const row = (v: SidebarView, name: string): HTMLElement => {
		const found = [...v.contentEl.querySelectorAll<HTMLElement>(".sf-section .sf-lrow-lnk")].find((l) => l.textContent === name);
		if (!found) throw new Error(`no row ${name}`);
		return found;
	};

	it("carries the name marker the NavigationController classifies, with the entry's path", async () => {
		const view = await (await makeWorld({}, maraVault())).open();

		const link = row(view, "Tobias Ferro");
		expect(link.getAttribute("data-sf-link")).toBe(TOBIAS.path);
		expect(link.getAttribute("role")).toBe("link");
		expect(link.getAttribute("tabindex")).toBe("0");
	});

	it("inspects in place on a bare click: the panel re-subjects and follow is suspended", async () => {
		const w = await makeWorld({}, maraVault());
		const view = await w.open();

		click(row(view, "Tobias Ferro"));
		await settle();

		expect(view.contentEl.querySelector(".sf-trailrow")?.textContent).toBe("from Mara Stoneway › Tobias Ferro");
		expect(vi.mocked(w.app.workspace.openLinkText)).not.toHaveBeenCalled();
	});

	it("opens the note on a modifier click, and a click writes nothing", async () => {
		const w = await makeWorld({}, maraVault());
		const view = await w.open();

		row(view, "Tobias Ferro").dispatchEvent(new MouseEvent("click", { bubbles: true, metaKey: true }));

		expect(vi.mocked(w.app.workspace.openLinkText)).toHaveBeenCalledWith(TOBIAS.path, expect.any(String), false);
		expect(vi.mocked(w.app.fileManager.processFrontMatter)).not.toHaveBeenCalled();
		expect(vi.mocked(w.app.vault.modify)).not.toHaveBeenCalled();
	});
});
