/**
 * anvilLibrary.test.ts — the Anvil's Codex reads its pills from the Library (spec 008 T7.1d2;
 * mockups-library.html L6a, L6b, L8b, P5, P8, P9, P15 on top of S93/S98).
 *
 * A REAL `AnvilView`, built from the same `buildAnvilCodexOpts` the plugin uses, over a REAL
 * wired Library (`wireLibrary`), a real `ConsentGate` and the real engines. Only Obsidian is
 * stood in for: a vault holding the `.base` and note files, a metadata cache, `MarkdownRenderer`
 * (records the fence it was handed) and Dataview's API (writes a table).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	App,
	MarkdownRenderer,
	Menu,
	Plugin,
	WorkspaceLeaf,
	createMockCachedMetadata,
	createMockDataviewApi,
	createMockTFile,
	wireDataviewApi,
	type MockDataviewApi,
	type TFile,
} from "obsidian";
import { AnvilView } from "anvil/AnvilView";
import { buildAnvilCodexOpts } from "anvil/anvilCodexOpts";
import { CollectionEmbed } from "anvil/collectionEmbed";
import { BasesFenceEngine } from "engines/BasesFenceEngine";
import { CardBasesView } from "bases/CardBasesView";
import { CODEX_CARD_REGISTRY } from "codex/builtinCards";
import { BasesEntry, BasesQueryResult, Component, QueryController } from "obsidian";
import type { QueryEngine } from "engines/QueryEngine";
import { ConsentGate } from "consent/ConsentGate";
import { computeChecksum } from "consent/checksum";
import { buildEngineRegistry, createEngineFor } from "engines/EngineRegistry";
import { addableCollections, anvilPills, type LibraryCollection } from "library/collectionStore";
import { wireLibrary, type LibraryHost, type LibraryWiring } from "library/wireLibrary";
import { ViewStore } from "store/ViewStore";
import { type PluginDataPort, type StoryForgeData, type ViewRecord } from "store/types";
import { DEFAULT_SETTINGS, normalizeSettings } from "types/index";
import type { BasesCapability } from "bases/basesCapability";

// ---------------------------------------------------------------------------
// The world
// ---------------------------------------------------------------------------

const BASE_PATH = "30 Canon/Organizations/Organizations.base";
const SKILLS_NOTE = "00 Meta/Views/Skills.md";
const MARA = createMockTFile({ basename: "Mara Stoneway", path: "30 Canon/31 Characters/Mara Stoneway.md" });

/** A user's file with two views of its own: only the global parts and the first view apply (P9). */
const BASE_YAML = [
	'filters: file.hasTag("canon/organization")',
	"formulas:",
	"  size: 1 + 1",
	"properties:",
	"  formula.size:",
	"    displayName: Size",
	"views:",
	"  - type: table",
	"    name: Active only",
	'    filters: \'status == "active"\'',
	"    sort:",
	"      - property: file.name",
	"        direction: ASC",
	"  - type: cards",
	"    name: Everything else",
	"",
].join("\n");

/** The fenced block's body is byte-exact, so it ends in the newline before the closing fence. */
const DQL_BODY = "TABLE rank FROM #skill\n";

function record(over: Partial<ViewRecord> = {}): ViewRecord {
	return {
		provenance: "imported",
		enabled: true,
		okayed: null,
		source: BASE_PATH,
		engine: "bases",
		command: false,
		commandName: "Organizations",
		kind: "collection",
		surfaces: { anvil: true, workbench: false },
		...over,
	};
}

async function baseRecord(over: Partial<ViewRecord> = {}): Promise<ViewRecord> {
	return record({ okayed: { version: 0, checksum: await computeChecksum(BASE_YAML) }, ...over });
}

async function skillsRecord(over: Partial<ViewRecord> = {}): Promise<ViewRecord> {
	return record({
		engine: "dataview-dql",
		source: SKILLS_NOTE,
		commandName: "Skills",
		okayed: { version: 1, checksum: await computeChecksum(DQL_BODY) },
		surfaces: { anvil: true, workbench: true },
		...over,
	});
}

interface WorldOptions {
	readonly views?: Record<string, ViewRecord>;
	readonly bases?: BasesCapability;
	readonly cardByCollection?: Record<string, string>;
}

interface World {
	readonly app: App;
	readonly views: ViewStore;
	readonly library: LibraryWiring;
	readonly host: LibraryHost;
	readonly bodies: Map<string, string>;
	readonly dv: MockDataviewApi;
	readonly manage: ReturnType<typeof vi.fn>;
	readonly changeTag: ReturnType<typeof vi.fn>;
	readonly subscribers: { count: number };
	/** Every engine the Anvil created, with how many times its `teardown` ran. */
	readonly engines: Array<{ kind: string; teardown: { mock: { calls: unknown[][] } } }>;
	open(linkClickAction?: "drill" | "open"): Promise<AnvilView>;
}

const opened: AnvilView[] = [];

afterEach(async () => {
	while (opened.length > 0) {
		const view = opened.pop();
		view?.contentEl.remove();
		await view?.onClose();
	}
	vi.restoreAllMocks();
	vi.mocked(MarkdownRenderer.render).mockClear();
});

async function makeWorld(opts: WorldOptions = {}): Promise<World> {
	const app = new App();
	const bodies = new Map<string, string>([[BASE_PATH, BASE_YAML], [SKILLS_NOTE, `# Skills\n\n\`\`\`dataview\n${DQL_BODY}\`\`\`\n`]]);
	const files = new Map<string, TFile>([...bodies.keys()].map((p) => [p, createMockTFile({ path: p, basename: p.split("/").pop() ?? p })]));
	vi.mocked(app.vault.getFileByPath).mockImplementation((p: string) => files.get(p) ?? null);
	vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((p: string) => files.get(p) ?? null);
	vi.mocked(app.vault.read).mockImplementation(async (f: TFile) => bodies.get(f.path) ?? "");
	vi.mocked(app.vault.cachedRead).mockImplementation(async (f: TFile) => bodies.get(f.path) ?? "");
	vi.mocked(app.metadataCache.getFileCache).mockImplementation((f: TFile) =>
		createMockCachedMetadata({ frontmatter: f.path === SKILLS_NOTE ? { "sf-version": 1 } : {} }));
	app.workspace.getActiveFile = vi.fn(() => MARA);
	const dv = createMockDataviewApi({ enableDataviewJs: true });
	dv.execute.mockImplementation(async (_q: string, el: HTMLElement) => {
		el.innerHTML = '<table class="dv-out"><tr><td>Ember Sight</td></tr></table>';
	});
	wireDataviewApi(app, dv);

	let data: StoryForgeData = { views: structuredClone(opts.views ?? {}), settings: { ...DEFAULT_SETTINGS } };
	const port: PluginDataPort = {
		load: async () => structuredClone(data),
		save: async (d) => { data = structuredClone(d as StoryForgeData); },
	};
	const views = new ViewStore(port);
	const host: LibraryHost = Object.assign(new Plugin(app), {
		settings: normalizeSettings({ cardByCollection: opts.cardByCollection ?? {} }),
		saveSettings: async (): Promise<void> => {},
	});
	const library = await wireLibrary(host, views);

	const capability = opts.bases ?? "enabled";
	const registry = buildEngineRegistry(app, capability === "enabled");
	const gate = new ConsentGate(app, registry, { isDvJsEnabled: () => dv.settings.enableDataviewJs }, views, async () => null, () => ({ tag: "", excludedFolders: [] }));
	const manage = vi.fn();
	const changeTag = vi.fn();
	const subscribers = { count: 0 };
	const engines: World["engines"] = [];
	const codex = buildAnvilCodexOpts({
		library: {
			...library,
			onChange: (l) => {
				subscribers.count++;
				const off = library.onChange(l);
				return () => { subscribers.count--; off(); };
			},
		},
		getRecord: async (id) => (await views.getViews())[id],
		gate,
		createEngine: (kind) => {
			const engine = createEngineFor(app, kind, capability === "enabled");
			if (engine) engines.push({ kind, teardown: vi.spyOn(engine, "teardown") });
			return engine;
		},
		getCardByCollection: () => host.settings.cardByCollection,
		onCardSelect: (id, card) => { host.settings.cardByCollection = { ...host.settings.cardByCollection, [id]: card }; },
		openLibrary: manage as (o?: { configure?: string }) => void,
	});
	return {
		app, views, library, host, bodies, dv, manage, changeTag, subscribers, engines,
		open: async (linkClickAction = "drill") => {
			const leaf = new WorkspaceLeaf();
			leaf.app = app;
			const view = new AnvilView(leaf, {
				codex: { ...codex, onChangeTag: changeTag as (id: string) => void },
				bases: { getCapability: () => capability },
				settings: { getLinkClickAction: () => linkClickAction },
			});
			opened.push(view);
			await view.onOpen();
			document.body.appendChild(view.contentEl);
			view.setLayout("codex");
			return view;
		},
	};
}

const pills = (view: AnvilView): HTMLElement[] => [...view.contentEl.querySelectorAll<HTMLElement>("[data-sf-collection]")];
const labels = (view: AnvilView): string[] => pills(view).map((p) => p.textContent ?? "");
const selected = (view: AnvilView): string | undefined => pills(view).find((p) => p.getAttribute("aria-pressed") === "true")?.textContent ?? undefined;
const pill = (view: AnvilView, label: string): HTMLElement => {
	const found = pills(view).find((p) => p.textContent === label);
	if (!found) throw new Error(`no pill ${label}; have ${labels(view).join(", ")}`);
	return found;
};
const click = (el: Element | null): void => {
	if (!el) throw new Error("nothing to click");
	el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
};
const body = (view: AnvilView): HTMLElement => view.contentEl.querySelector<HTMLElement>(".sf-ws-body")!;
const lastFence = (): string => String(vi.mocked(MarkdownRenderer.render).mock.calls.at(-1)?.[1] ?? "");

/** Let the Library's snapshot rebuild and the embed's async draw land. */
const settle = async (): Promise<void> => { for (let i = 0; i < 20; i++) await new Promise<void>((r) => setTimeout(r, 0)); };

// ---------------------------------------------------------------------------
// 1 · the pills are the Library's
// ---------------------------------------------------------------------------

describe("the Anvil pills", () => {
	it("equal anvilPills of the Library in Library order; a disabled or Anvil-off collection has none", async () => {
		const w = await makeWorld({
			views: {
				orgs: await baseRecord(),
				skills: await skillsRecord({ surfaces: { anvil: false, workbench: true } }),
				later: await baseRecord({ commandName: "Creatures", source: "x.base" }),
			},
		});
		await w.library.collections.setEnabled("lore", false);
		await settle();
		const view = await w.open();

		expect(labels(view)).toEqual(anvilPills(w.library.snapshot()).map((c) => c.label));
		expect(labels(view)).toEqual(["Characters", "Locations", "Objects", "Organizations", "Creatures"]);
		// S93: a collection the user added is drawn dashed; the shipped ones are not.
		expect(pills(view).map((p) => p.classList.contains("sf-cx-pill--usr"))).toEqual([false, false, false, true, true]);
	});
});

// ---------------------------------------------------------------------------
// 2 · a Library write repaints
// ---------------------------------------------------------------------------

describe("a Library write", () => {
	it("repaints the pills without reopening the view", async () => {
		const w = await makeWorld();
		const view = await w.open();
		expect(labels(view)).toContain("Lore");
		await w.library.collections.setEnabled("lore", false);
		await settle();
		expect(labels(view)).not.toContain("Lore");
		await w.library.collections.setEnabled("lore", true);
		await settle();
		expect(labels(view)).toContain("Lore");
	});

	it("stops listening once the view closes", async () => {
		const w = await makeWorld();
		const view = await w.open();
		expect(w.subscribers.count).toBe(1);
		await view.onClose();
		expect(w.subscribers.count).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// 3 · an imported .base (L6a, D1, P9)
// ---------------------------------------------------------------------------

describe("a .base collection", () => {
	it("embeds the user's file through Bases with the chosen Card, applying only the global parts and the first view", async () => {
		const w = await makeWorld({ views: { orgs: await baseRecord() } });
		const view = await w.open();
		click(pill(view, "Organizations"));
		await settle();

		const fence = lastFence();
		expect(fence).toContain("type: story-forge-hero");
		expect(fence).toContain('file.hasTag("canon/organization")');
		expect(fence).toContain("formula.size");
		expect(fence).toContain('status == "active"');
		expect(fence).toContain("file.name");
		expect(fence).not.toContain("Everything else");
		expect(fence).not.toContain("type: table");
		expect(fence).not.toContain("type: cards");
		expect(selected(view)).toBe("Organizations");
		expect(body(view).querySelector(".sf-cx-cardsel")).not.toBeNull();
	});

	it("draws with the Card the dropdown picks, and never writes the user's file", async () => {
		const w = await makeWorld({ views: { orgs: await baseRecord() } });
		const view = await w.open();
		click(pill(view, "Organizations"));
		await settle();
		click(body(view).querySelector('[data-sf-card="table"]'));
		await settle();

		expect(lastFence()).toContain("type: story-forge-table");
		expect(w.host.settings.cardByCollection).toEqual({ orgs: "table" });
		expect(w.app.vault.modify).not.toHaveBeenCalled();
		expect(w.bodies.get(BASE_PATH)).toBe(BASE_YAML);
	});

	it("marks the card the editor pane shows, after Bases has drawn it", async () => {
		const w = await makeWorld({ views: { orgs: await baseRecord() } });
		const view = await w.open();
		click(pill(view, "Organizations"));
		await settle();
		view.inspect(MARA);
		await settle();
		const drawn = document.createElement("div");
		drawn.setAttribute("data-sf-card-body", MARA.path);
		body(view).querySelector(".sf-cx-embed")!.replaceChildren(drawn);
		await settle();
		expect(drawn.classList.contains("sf-cx-card--sel")).toBe(true);
	});

	// T7.2 reverses d2's "drift after a hand edit": an imported .base is enable/disable only (PRD F7
	// AC 8) and the user's to edit in Bases (L3b). Drift here had no way out — re-consent reads a
	// fenced block a .base does not have.
	it("stays drawable after the user edits the file in Bases: no drift, no consent", async () => {
		const w = await makeWorld({ views: { orgs: await baseRecord() } });
		const gate = new ConsentGate(w.app, buildEngineRegistry(w.app, true), { isDvJsEnabled: () => true }, w.views, async () => null, () => ({ tag: "", excludedFolders: [] }));
		const rec = (await w.views.getViews())["orgs"]!;
		expect(await gate.evaluate(rec)).toEqual({ status: "consented" });
		w.bodies.set(BASE_PATH, `${BASE_YAML}# edited\n`);
		expect(await gate.evaluate(rec)).toEqual({ status: "consented" });
		expect(await gate.evaluate({ ...rec, enabled: false })).toEqual({ status: "disabled" });
	});

	it("shows the engine's error when the file is missing", async () => {
		const w = await makeWorld({ views: { orgs: await baseRecord({ source: "gone/Missing.base" }) } });
		const view = await w.open();
		click(pill(view, "Organizations"));
		await settle();
		expect(body(view).textContent).toContain("Collection file not found: gone/Missing.base");
		expect(MarkdownRenderer.render).not.toHaveBeenCalled();
	});

	it("degrades like every Bases surface when Bases is off: nothing is embedded and the hint shows", async () => {
		const w = await makeWorld({ views: { orgs: await baseRecord() }, bases: "disabled" });
		const view = await w.open();
		click(pill(view, "Organizations"));
		await settle();
		expect(MarkdownRenderer.render).not.toHaveBeenCalled();
		expect(body(view).querySelector(".sf-cx-embed")).toBeNull();
		expect(body(view).querySelector(".sf-cx-empty")?.textContent).toContain("Bases");
		expect(body(view).querySelector(".sf-cx-hint")).not.toBeNull();
	});
});

// ---------------------------------------------------------------------------
// 4 · a Dataview collection (L6b, P8)
// ---------------------------------------------------------------------------

describe("a Dataview collection", () => {
	it("shows Dataview's own output and 'Drawn by Dataview' in place of the Card dropdown", async () => {
		const w = await makeWorld({ views: { skills: await skillsRecord() } });
		const view = await w.open();
		click(pill(view, "Skills"));
		await settle();

		expect(body(view).querySelector(".dv-out")?.textContent).toContain("Ember Sight");
		expect(body(view).textContent).toContain("Drawn by Dataview");
		expect(body(view).querySelector(".sf-cx-cardsel")).toBeNull();
		expect(w.dv.execute).toHaveBeenCalledWith(DQL_BODY, expect.anything(), expect.anything(), MARA.path);
	});

	it("does not run DataviewJS the user has not approved", async () => {
		const w = await makeWorld({ views: { script: await skillsRecord({ engine: "dataviewjs", commandName: "Script", okayed: null }) } });
		const view = await w.open();
		click(pill(view, "Script"));
		await settle();

		expect(w.dv.executeJs).not.toHaveBeenCalled();
		expect(body(view).querySelector(".sf-consent-required")).not.toBeNull();
	});
});

// ---------------------------------------------------------------------------
// 5 · + Collection (P15)
// ---------------------------------------------------------------------------

describe("+ Collection", () => {
	async function arrange(): Promise<{ w: World; view: AnvilView }> {
		const w = await makeWorld({
			views: {
				skills: await skillsRecord({ surfaces: { anvil: false, workbench: true } }),
				archived: await skillsRecord({ enabled: false, commandName: "Archive", source: "a.md", surfaces: { anvil: false, workbench: true } }),
			},
		});
		await w.library.collections.setSurface("lore", "anvil", false);
		await settle();
		return { w, view: await w.open() };
	}

	it("lists the enabled collections whose Anvil switch is off, then Manage in settings", async () => {
		const { w, view } = await arrange();
		const show = vi.spyOn(Menu.prototype, "showAtPosition");
		click(view.contentEl.querySelector("[data-sf-cx-add]"));

		const menu = show.mock.instances[0] as Menu;
		expect(menu._items.map((i) => i.title)).toEqual(["Lore", "Skills", "Manage in settings…"]);
		expect(addableCollections(w.library.snapshot()).map((c) => c.label)).toEqual(["Lore", "Skills"]);
		menu._items.at(-1)!.onClickFn!(new MouseEvent("click"));
		expect(w.manage).toHaveBeenCalledWith();
	});

	it("writes nothing on the bare click", async () => {
		const { w, view } = await arrange();
		const write = vi.spyOn(w.views, "setRecord");
		const before = structuredClone(w.host.settings);
		click(view.contentEl.querySelector("[data-sf-cx-add]"));
		await settle();
		expect(write).not.toHaveBeenCalled();
		expect(w.host.settings).toEqual(before);
		expect(labels(view)).not.toContain("Skills");
	});

	it("turns the Anvil switch on for the picked collection and selects it", async () => {
		const { w, view } = await arrange();
		const show = vi.spyOn(Menu.prototype, "showAtPosition");
		click(view.contentEl.querySelector("[data-sf-cx-add]"));
		const menu = show.mock.instances[0] as Menu;
		menu._items.find((i) => i.title === "Skills")!.onClickFn!(new MouseEvent("click"));
		await settle();

		const row = w.library.snapshot().find((c: LibraryCollection) => c.id === "skills");
		expect(row?.surfaces).toEqual({ anvil: true, workbench: true });
		expect((await w.views.getViews())["skills"]?.surfaces.anvil).toBe(true);
		expect(selected(view)).toBe("Skills");
	});
});

// ---------------------------------------------------------------------------
// 6 · fallback (L8b, P5)
// ---------------------------------------------------------------------------

describe("when the shown collection goes away", () => {
	const ways: Array<[string, (w: World) => Promise<unknown>]> = [
		["is removed", (w) => w.library.collections.remove("orgs")],
		["is disabled", (w) => w.library.collections.setEnabled("orgs", false)],
		["has its Anvil switch turned off", (w) => w.library.collections.setSurface("orgs", "anvil", false)],
	];

	it.each(ways)("falls back to the first enabled pill when it %s", async (_name, act) => {
		const w = await makeWorld({ views: { orgs: await baseRecord() }, cardByCollection: { orgs: "table" } });
		const view = await w.open();
		click(pill(view, "Organizations"));
		await settle();
		expect(selected(view)).toBe("Organizations");

		await act(w);
		await settle();

		expect(labels(view)).not.toContain("Organizations");
		expect(selected(view)).toBe("Characters");
		expect(view.contentEl.querySelector(".sf-cx-embed")).toBeNull();
	});

	it("unloads the engine that drew the collection it leaves", async () => {
		const w = await makeWorld({ views: { orgs: await baseRecord() } });
		const view = await w.open();
		click(pill(view, "Organizations"));
		await settle();
		const drawn = w.engines.filter((e) => e.kind === "bases");
		expect(drawn.length).toBeGreaterThan(0);
		click(pill(view, "Characters"));
		await settle();
		expect(drawn.every((e) => e.teardown.mock.calls.length > 0)).toBe(true);
	});

	it("forgets a removed collection's Card choice", async () => {
		const w = await makeWorld({ views: { orgs: await baseRecord() }, cardByCollection: { orgs: "table", character: "compact" } });
		await w.library.collections.remove("orgs");
		expect(w.host.settings.cardByCollection).toEqual({ character: "compact" });
	});
});

// ---------------------------------------------------------------------------
// 7 · a draw that is overtaken
// ---------------------------------------------------------------------------

describe("an embed draw that has been overtaken", () => {
	const request = { collectionId: "orgs", cardId: "hero", activeFile: MARA, openPath: MARA.path };
	const consented = { evaluate: async () => ({ status: "consented" as const }), requestConsent: async () => true, requestReConsent: async () => true };

	function slow(): { release: () => void; wait: Promise<void> } {
		let release!: () => void;
		const wait = new Promise<void>((r) => { release = r; });
		return { release, wait };
	}

	it("lands nowhere and creates no engine once a newer draw has started", async () => {
		const held = slow();
		const rec = await baseRecord();
		let reads = 0;
		const created: QueryEngine[] = [];
		const embed = new CollectionEmbed({
			getRecord: async () => { if (reads++ === 0) await held.wait; return rec; },
			gate: consented,
			createEngine: () => {
				const engine: QueryEngine = { kind: "bases", render: async (_v, _c, el) => { el.textContent = "drawn"; }, teardown: vi.fn() };
				created.push(engine);
				return engine;
			},
		});
		const older = document.createElement("div");
		const newer = document.createElement("div");
		const first = embed.draw(older, request);
		await embed.draw(newer, request);
		held.release();
		await first;

		expect(created).toHaveLength(1);
		expect(older.textContent).toBe("");
		expect(newer.textContent).toBe("drawn");
	});

	it("unloads the Component a real BasesFenceEngine made after teardown had already run", async () => {
		const w = await makeWorld({ views: { orgs: await baseRecord() } });
		const held = slow();
		// Teardown lands while the engine is still reading the file, before it has a Component.
		vi.mocked(w.app.vault.cachedRead).mockImplementationOnce(async () => { await held.wait; return BASE_YAML; });
		const unload = vi.spyOn(Component.prototype, "_unload");
		const embed = new CollectionEmbed({
			getRecord: async () => baseRecord(),
			gate: consented,
			createEngine: () => new BasesFenceEngine(w.app),
		});
		const drawing = embed.draw(document.createElement("div"), request);
		await settle();
		embed.teardown();
		expect(unload).not.toHaveBeenCalled();
		held.release();
		await drawing;
		expect(unload).toHaveBeenCalled();
	});

	it("unloads the engine whose render fails after teardown had already run", async () => {
		const held = slow();
		const teardown = vi.fn();
		const embed = new CollectionEmbed({
			getRecord: async () => baseRecord(),
			gate: consented,
			createEngine: () => ({ kind: "bases", render: async () => { await held.wait; throw new Error("late failure"); }, teardown }),
		});
		const host = document.createElement("div");
		const drawing = embed.draw(host, request);
		await settle();
		embed.teardown();
		teardown.mockClear();
		held.release();
		await drawing;
		expect(teardown).toHaveBeenCalledTimes(1);
		expect(host.textContent).not.toContain("late failure");
	});

	it("releases the previous draw by itself, with no teardown call in between", async () => {
		const torn: string[] = [];
		let n = 0;
		const embed = new CollectionEmbed({
			getRecord: async () => baseRecord(),
			gate: consented,
			createEngine: () => {
				const id = `engine-${++n}`;
				return { kind: "bases", render: async () => {}, teardown: () => { torn.push(id); } };
			},
		});
		await embed.draw(document.createElement("div"), request);
		await embed.draw(document.createElement("div"), request);
		expect(torn).toEqual(["engine-1"]);
	});

	it("does not watch or mark anything after teardown arrived while Bases was drawing", async () => {
		const held = slow();
		const card = document.createElement("div");
		card.setAttribute("data-sf-card-body", MARA.path);
		const embed = new CollectionEmbed({
			getRecord: async () => baseRecord(),
			gate: consented,
			createEngine: () => ({
				kind: "bases",
				render: async (_v, _c, el) => { await held.wait; el.appendChild(card); },
				teardown: vi.fn(),
			}),
		});
		const host = document.createElement("div");
		const drawing = embed.draw(host, request);
		await settle();
		embed.teardown();
		held.release();
		await drawing;
		expect(card.classList.contains("sf-cx-card--sel")).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// 8 · one click, one navigation (PRD F2, ADR-28)
// ---------------------------------------------------------------------------

describe("a name click inside an embedded .base with linkClickAction 'open'", () => {
	it("opens the note once through the Anvil and never through the Bases view's own opener", async () => {
		const w = await makeWorld({ views: { orgs: await baseRecord() } });
		vi.mocked(w.app.vault.getAbstractFileByPath).mockImplementation((p: string) => (p === MARA.path ? MARA : null));
		const openLinkText = vi.fn(async () => {});
		w.app.workspace.openLinkText = openLinkText;
		const view = await w.open("open");
		click(pill(view, "Organizations"));
		await settle();

		// Bases is not running here: draw the real Card view into the container the embed made for it.
		const revealAndShowFile = vi.fn();
		const container = document.createElement("div");
		body(view).querySelector(".sf-cx-embed")!.appendChild(container);
		const cards = new CardBasesView("story-forge-hero", new QueryController(), container, {
			app: w.app, registry: CODEX_CARD_REGISTRY, cardId: "hero", onEntryClick: revealAndShowFile, getLinkClickAction: () => "open",
		});
		const entry = new BasesEntry();
		entry.file = MARA;
		entry.getValue.mockImplementation(() => null);
		const result = new BasesQueryResult();
		result.data = [entry];
		cards.data = result;
		cards.onDataUpdated();
		click(container.querySelector(`[data-sf-link="${MARA.path}"]`));

		expect(openLinkText).toHaveBeenCalledTimes(1);
		expect(openLinkText).toHaveBeenCalledWith(MARA.path, "", true);
		expect(revealAndShowFile).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// 9 · an engine of the Anvil's own
// ---------------------------------------------------------------------------

describe("createEngineFor", () => {
	it("builds only the engine asked for, and only when it is wired", () => {
		const app = new App();
		expect(createEngineFor(app, "bases", true)?.kind).toBe("bases");
		expect(createEngineFor(app, "bases", false)).toBeUndefined();
		expect(createEngineFor(app, "dataview-dql", true)).toBeUndefined();
		wireDataviewApi(app, createMockDataviewApi());
		expect(createEngineFor(app, "dataview-dql", false)?.kind).toBe("dataview-dql");
		expect(createEngineFor(app, "dataviewjs", false)?.kind).toBe("dataviewjs");
	});
});
