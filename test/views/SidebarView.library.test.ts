/**
 * SidebarView.library.test.ts — the Workbench takes the Library (spec 008 T7.1d3;
 * mockups-library.html L7a, L7b, P6, P7, D3 and the L9 table, on top of S95/S96).
 *
 * A REAL `SidebarView` over a REAL wired Library (`wireLibrary`) and a real `ViewStore`. Only
 * Obsidian is stood in for (the mock vault) and the query engines, which write a marker so a
 * stale render is visible.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { App, Plugin, WorkspaceLeaf, createMockCachedMetadata, createMockTFile, type TFile } from "obsidian";
import { SidebarView } from "views/SidebarView";
import { SIDEBAR_VIEW_TYPE } from "pluginConstants";
import { workbenchTabs } from "library/collectionStore";
import { wireLibrary, type LibraryHost, type LibraryWiring } from "library/wireLibrary";
import { ViewStore } from "store/ViewStore";
import type { PluginDataPort, StoryForgeData, ViewRecord } from "store/types";
import { DEFAULT_SETTINGS, normalizeSettings } from "types/index";
import type { QueryEngine, EngineRegistry } from "engines/QueryEngine";
import type { ConsentGate } from "consent/ConsentGate";
import type { NativeScopingEngine } from "engines/NativeScopingEngine";

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

async function makeWorld(views: Record<string, ViewRecord> = standardViews()): Promise<World> {
	const app = new App();
	vi.mocked(app.metadataCache.getFileCache).mockImplementation(() =>
		createMockCachedMetadata({ tags: [{ tag: "#canon/character" }], frontmatter: {} }));
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
	const native = { kind: "native", teardown: vi.fn(), render: vi.fn(async (_v: unknown, _c: unknown, el: HTMLElement) => { el.textContent = "native"; }) } as unknown as NativeScopingEngine;
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
			const view = new SidebarView(leaf, registry, gate, native, store, () => "drill", undefined, undefined, undefined, counted);
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
