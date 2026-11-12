/**
 * T7.1a — the Library's collection store (spec 008, Phase 7; mockups-library.html
 * P1, P2, P5, P10, P13, P16, P19 and the L9 table).
 *
 * Every test runs the store against a real `ViewStore` over an in-memory data blob, and
 * reads the persisted blob back: a green return value with nothing written would pass a
 * weaker test.
 */

import { describe, expect, it, vi } from "vitest";
import { ViewStore } from "../../src/store/ViewStore";
import { defaultSurfaces, type PluginDataPort, type StoryForgeData, type ViewRecord } from "../../src/store/types";
import {
	DEFAULT_SETTINGS,
	LIBRARY_MIGRATED_HINT_ID,
	normalizeSettings,
	type PluginSettings,
} from "../../src/types/index";
import {
	CollectionStore,
	anvilPills,
	workbenchSections,
	workbenchTabs,
	type LibraryPort,
} from "../../src/library/collectionStore";

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

function makeRecord(overrides: Partial<ViewRecord> = {}): ViewRecord {
	return {
		provenance: "imported",
		enabled: true,
		okayed: null,
		source: "30 Canon/Organizations/Organizations.base",
		engine: "bases",
		command: false,
		kind: "collection",
		surfaces: { anvil: true, workbench: false },
		...overrides,
	};
}

function makeHarness(init: { views?: Record<string, ViewRecord>; settings?: Partial<PluginSettings>; failSaveSettingsOnce?: boolean } = {}) {
	let failNext = init.failSaveSettingsOnce === true;
	let data: StoryForgeData = structuredClone({ views: init.views ?? {}, settings: { ...DEFAULT_SETTINGS, ...init.settings } });
	const port: PluginDataPort = {
		load: async () => structuredClone(data),
		save: async (d) => { data = structuredClone(d as StoryForgeData); },
	};
	const views = new ViewStore(port);
	const calls: string[] = [];
	const libraryPort: LibraryPort = {
		getViews: () => views.getViews(),
		setRecord: async (id, rec) => { calls.push("setRecord"); await views.setRecord(id, rec); },
		deleteRecord: async (id) => { calls.push("deleteRecord"); await views.deleteRecord(id); },
		loadSettings: async () => normalizeSettings((await port.load() as StoryForgeData).settings),
		saveSettings: async (patch) => {
			if (failNext) { failNext = false; throw new Error("disk full"); }
			calls.push("saveSettings");
			const current = normalizeSettings(data.settings);
			data = { ...data, settings: { ...current, ...patch } };
		},
	};
	return {
		store: new CollectionStore(libraryPort),
		calls,
		persistedViews: () => data.views ?? {},
		persistedSettings: () => normalizeSettings(data.settings),
		/** What is on disk, before the read-side normaliser repairs it. */
		rawBuiltIn: (id: string) => data.settings?.builtInCollections?.[id],
	};
}

const ids = (list: readonly { id: string }[]): string[] => list.map((c) => c.id);

// ---------------------------------------------------------------------------
// (a) order
// ---------------------------------------------------------------------------

describe("collection list", () => {
	it("is the four built-ins, then user collections in record order (cards and legacy views excluded)", async () => {
		const h = makeHarness({
			views: {
				z: makeRecord({ commandName: "Zeta", provenance: "curated" }),
				card: makeRecord({ kind: "card", commandName: "Stat block" }),
				a: makeRecord({ commandName: "Alpha" }),
				legacy: makeRecord({ kind: "view", engine: "bases", source: "views:" }),
			},
		});

		const list = await h.store.collections();

		expect(ids(list)).toEqual(["character", "location", "object", "lore", "z", "a"]);
		expect(list.map((c) => c.provenance)).toEqual([
			"built-in", "built-in", "built-in", "built-in", "from-repo", "imported",
		]);
		expect(list.slice(4).map((c) => c.label)).toEqual(["Zeta", "Alpha"]);
	});

	it("names an unnamed record after its file's basename", async () => {
		const h = makeHarness({ views: { a: makeRecord() } });
		expect((await h.store.collections())[4]?.label).toBe("Organizations");
	});
});

// ---------------------------------------------------------------------------
// (b) checkbox is the master; the toggles are kept (P1, L9)
// ---------------------------------------------------------------------------

describe("checkbox and surface toggles", () => {
	it("a surface is effective only when the collection is enabled and the toggle is on", async () => {
		const h = makeHarness({
			views: { a: makeRecord({ surfaces: { anvil: true, workbench: false } }) },
		});
		const a = (await h.store.collections()).find((c) => c.id === "a");
		expect(a?.effective).toEqual({ anvil: true, workbench: false });

		await h.store.setEnabled("a", false);
		const off = (await h.store.collections()).find((c) => c.id === "a");
		expect(off?.effective).toEqual({ anvil: false, workbench: false });
	});

	it("keeps the toggle values across a disable/enable cycle, for a record and for a built-in", async () => {
		const h = makeHarness({ views: { a: makeRecord({ surfaces: { anvil: true, workbench: true } }) } });
		await h.store.setSurface("a", "workbench", false);
		await h.store.setSurface("location", "anvil", false);

		await h.store.setEnabled("a", false);
		await h.store.setEnabled("location", false);
		expect(h.persistedViews()["a"]?.enabled).toBe(false);
		expect(h.persistedViews()["a"]?.surfaces).toEqual({ anvil: true, workbench: false });
		expect(h.persistedSettings().builtInCollections["location"]).toMatchObject({ enabled: false, anvil: false });

		await h.store.setEnabled("a", true);
		await h.store.setEnabled("location", true);
		const list = await h.store.collections();
		expect(list.find((c) => c.id === "a")?.effective).toEqual({ anvil: true, workbench: false });
		expect(list.find((c) => c.id === "location")?.effective).toEqual({ anvil: false, workbench: true });
	});

	it("persists two un-awaited toggles in a row, for a record and for a built-in", async () => {
		const h = makeHarness({ views: { a: makeRecord({ surfaces: { anvil: true, workbench: false } }) } });

		await Promise.all([
			h.store.setSurface("a", "anvil", false),
			h.store.setSurface("a", "workbench", true),
			h.store.setSurface("lore", "anvil", false),
			h.store.setEnabled("lore", false),
		]);

		expect(h.persistedViews()["a"]?.surfaces).toEqual({ anvil: false, workbench: true });
		expect(h.persistedSettings().builtInCollections["lore"]).toMatchObject({ anvil: false, enabled: false });
	});

	it("keeps the queue alive after a failed write", async () => {
		const h = makeHarness({ failSaveSettingsOnce: true });
		const failed = h.store.setEnabled("lore", false);
		const next = h.store.setEnabled("object", false);

		await expect(failed).rejects.toThrow("disk full");
		await expect(next).resolves.toEqual({ ok: true });
		expect(h.persistedSettings().builtInCollections["object"]?.enabled).toBe(false);
	});

	it("refuses an unknown id and writes nothing", async () => {
		const h = makeHarness();
		const result = await h.store.setEnabled("nope", false);
		expect(result.ok).toBe(false);
		expect(h.calls).toEqual([]);
	});

	it("ships the built-ins enabled and shown on both surfaces", async () => {
		const h = makeHarness();
		for (const c of await h.store.collections()) {
			expect(c.enabled).toBe(true);
			expect(c.effective).toEqual({ anvil: true, workbench: true });
		}
	});
});

// ---------------------------------------------------------------------------
// (c) engine defaults (P2)
// ---------------------------------------------------------------------------

describe("defaultSurfaces", () => {
	it("puts a Bases collection in the Anvil and a Dataview one in the Workbench", () => {
		expect(defaultSurfaces("bases")).toEqual({ anvil: true, workbench: false });
		expect(defaultSurfaces("dataview-dql")).toEqual({ anvil: false, workbench: true });
		expect(defaultSurfaces("dataviewjs")).toEqual({ anvil: false, workbench: true });
	});
});

// ---------------------------------------------------------------------------
// (d) built-in tag / excluded folders (P10)
// ---------------------------------------------------------------------------

describe("built-in configuration", () => {
	it("defaults to the shipped tag and 'same as Scope' excluded folders", async () => {
		const h = makeHarness({ settings: { excludedFolders: ["00 Meta", "Drafts"] } });
		const character = (await h.store.collections())[0];
		expect(character).toMatchObject({ tag: "canon/character", sameAsScope: true, excludedFolders: ["00 Meta", "Drafts"] });
	});

	it("a tag override wins over the default tag, and persists", async () => {
		const h = makeHarness();
		await h.store.configureBuiltIn("character", { tag: "story/person" });
		expect((await h.store.collections())[0]?.tag).toBe("story/person");
		expect(h.persistedSettings().builtInCollections["character"]?.tag).toBe("story/person");
	});

	it("strips a leading # from a typed tag, so the tag matches the note index's vocabulary", async () => {
		const h = makeHarness();
		await h.store.configureBuiltIn("character", { tag: " #story/person " });
		expect((await h.store.collections())[0]?.tag).toBe("story/person");
		expect(h.rawBuiltIn("character")?.tag).toBe("story/person");
		await h.store.configureBuiltIn("character", { tag: "#" });
		expect((await h.store.collections())[0]?.tag).toBe("canon/character");
	});

	it("an own excluded-folder list replaces Scope's, and null returns to 'same as Scope'", async () => {
		const h = makeHarness();
		await h.store.configureBuiltIn("lore", { excludedFolders: ["Drafts"] });
		expect((await h.store.collections())[3]).toMatchObject({ sameAsScope: false, excludedFolders: ["Drafts"] });

		await h.store.configureBuiltIn("lore", { excludedFolders: null });
		expect((await h.store.collections())[3]).toMatchObject({ sameAsScope: true, excludedFolders: ["00 Meta"] });
	});

	it("an empty tag falls back to the default; a non-built-in id is refused", async () => {
		const h = makeHarness({ views: { a: makeRecord() } });
		await h.store.configureBuiltIn("object", { tag: "  " });
		expect((await h.store.collections())[2]?.tag).toBe("canon/object");
		expect((await h.store.configureBuiltIn("a", { tag: "x" })).ok).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// (e) migration (D2, P13)
// ---------------------------------------------------------------------------

describe("migration of old views", () => {
	const legacy = (engine: ViewRecord["engine"]): ViewRecord =>
		makeRecord({ kind: "view", engine, source: "90 Views/Skills.md", surfaces: { anvil: false, workbench: false } });

	it("turns a Dataview view into a collection with Workbench on and Anvil off, and sets the notice once", async () => {
		const h = makeHarness({ views: { dql: legacy("dataview-dql"), js: legacy("dataviewjs") } });

		const moved = await h.store.migrate();

		expect(moved).toBe(2);
		expect(h.persistedViews()["dql"]).toMatchObject({ kind: "collection", surfaces: { anvil: false, workbench: true }, provenance: "imported" });
		expect(h.persistedViews()["js"]?.kind).toBe("collection");
		expect(h.persistedSettings().libraryMigratedCount).toBe(2);
		expect(await h.store.migrationNotice()).toEqual({ moved: 2 });
	});

	it("cannot lose the notice when saving settings fails: a retry still migrates and announces", async () => {
		const h = makeHarness({ views: { dql: legacy("dataview-dql") }, failSaveSettingsOnce: true });

		await expect(h.store.migrate()).rejects.toThrow("disk full");
		expect(h.persistedViews()["dql"]?.kind).toBe("view");

		expect(await h.store.migrate()).toBe(1);
		expect(await h.store.migrationNotice()).toEqual({ moved: 1 });
	});

	it("is idempotent: a second run changes and writes nothing", async () => {
		const h = makeHarness({ views: { dql: legacy("dataview-dql") } });
		await h.store.migrate();
		const viewsAfterFirst = structuredClone(h.persistedViews());
		const settingsAfterFirst = h.persistedSettings();
		h.calls.length = 0;

		expect(await h.store.migrate()).toBe(0);

		expect(h.persistedViews()).toEqual(viewsAfterFirst);
		expect(h.persistedSettings()).toEqual(settingsAfterFirst);
		expect(h.calls).toEqual([]);
	});

	it("lists a migrated curated Dataview view as imported (D2)", async () => {
		const h = makeHarness({ views: { dql: { ...legacy("dataview-dql"), provenance: "curated" } } });

		await h.store.migrate();

		expect(h.persistedViews()["dql"]?.provenance).toBe("imported");
		expect((await h.store.collections()).find((c) => c.id === "dql")?.provenance).toBe("imported");
	});

	it("leaves a Bases view, a collection and a card alone, and sets no notice", async () => {
		const bases = legacy("bases");
		const h = makeHarness({ views: { b: bases, c: makeRecord(), k: makeRecord({ kind: "card" }) } });
		const before = structuredClone(h.persistedViews());

		expect(await h.store.migrate()).toBe(0);

		expect(h.persistedViews()).toEqual(before);
		expect(await h.store.migrationNotice()).toBeNull();
	});

	it("keeps a disabled view disabled and migrated views show as imported collections", async () => {
		const h = makeHarness({ views: { dql: { ...legacy("dataview-dql"), enabled: false } } });
		await h.store.migrate();
		const c = (await h.store.collections()).find((x) => x.id === "dql");
		expect(c).toMatchObject({ enabled: false, provenance: "imported", effective: { anvil: false, workbench: false } });
		expect(c?.surfaces).toEqual({ anvil: false, workbench: true });
	});

	it("hides the notice once it is dismissed, for good", async () => {
		const h = makeHarness({ views: { dql: legacy("dataview-dql") } });
		await h.store.migrate();

		await h.store.dismissMigrationNotice();
		await h.store.dismissMigrationNotice();

		expect(await h.store.migrationNotice()).toBeNull();
		expect(h.persistedSettings().dismissedHints.filter((x) => x === LIBRARY_MIGRATED_HINT_ID)).toHaveLength(1);
	});
});

// ---------------------------------------------------------------------------
// (f) remove (P5, P16)
// ---------------------------------------------------------------------------

describe("remove", () => {
	it("refuses a built-in", async () => {
		const h = makeHarness();
		const result = await h.store.remove("character");
		expect(result).toEqual({ ok: false, reason: expect.stringContaining("built-in") });
		expect(ids(await h.store.collections())).toContain("character");
		expect(h.calls).toEqual([]);
	});

	it.each(["curated", "imported"] as const)(
		"drops only a %s record and its cardByCollection entry",
		async (provenance) => {
			const h = makeHarness({
				views: { gone: makeRecord({ provenance }), kept: makeRecord() },
				settings: { cardByCollection: { gone: "table", kept: "compact", character: "hero" } },
			});

			const result = await h.store.remove("gone");

			expect(result.ok).toBe(true);
			expect(h.persistedViews()["gone"]).toBeUndefined();
			expect(h.persistedViews()["kept"]).toBeDefined();
			expect(h.persistedSettings().cardByCollection).toEqual({ kept: "compact", character: "hero" });
			expect(h.calls).toEqual(["deleteRecord", "saveSettings"]);
			// The store has no vault access: the port calls above are the whole of it (P16).
		},
	);

	it("refuses an unknown id and a card record", async () => {
		const h = makeHarness({ views: { k: makeRecord({ kind: "card" }) } });
		expect((await h.store.remove("nope")).ok).toBe(false);
		expect((await h.store.remove("k")).ok).toBe(false);
		expect(h.persistedViews()["k"]).toBeDefined();
	});
});

// ---------------------------------------------------------------------------
// (g) cards (P19)
// ---------------------------------------------------------------------------

describe("cards", () => {
	it("lists the built-in Cards first, then card records, with provenance", async () => {
		const h = makeHarness({ views: { k: makeRecord({ kind: "card", commandName: "Stat block", enabled: false }), c: makeRecord() } });
		const cards = await h.store.cards();
		expect(ids(cards)).toEqual(["hero", "table", "compact", "k"]);
		expect(cards.map((c) => c.provenance)).toEqual(["built-in", "built-in", "built-in", "imported"]);
		expect(cards[3]).toMatchObject({ label: "Stat block", enabled: false });
	});

	it("refuses to disable Hero, even if the persisted settings already list it", async () => {
		const h = makeHarness({ settings: { disabledCards: ["hero"] } });
		expect((await h.store.cards())[0]).toMatchObject({ id: "hero", enabled: true, canDisable: false });

		const result = await h.store.setCardEnabled("hero", false);

		expect(result.ok).toBe(false);
		expect(h.calls).toEqual([]);
	});

	it("disables and re-enables the other built-in Cards and a card record", async () => {
		const h = makeHarness({ views: { k: makeRecord({ kind: "card" }) } });

		expect((await h.store.setCardEnabled("table", false)).ok).toBe(true);
		expect((await h.store.setCardEnabled("k", false)).ok).toBe(true);
		let cards = await h.store.cards();
		expect(cards.map((c) => c.enabled)).toEqual([true, false, true, false]);
		expect(h.persistedSettings().disabledCards).toEqual(["table"]);

		await h.store.setCardEnabled("table", true);
		cards = await h.store.cards();
		expect(cards[1]?.enabled).toBe(true);
		expect(h.persistedSettings().disabledCards).toEqual([]);
	});

	it("usedBy lists the collections whose chosen Card it is, ignoring Dataview collections", async () => {
		const h = makeHarness({
			views: {
				org: makeRecord({ commandName: "Organizations" }),
				skills: makeRecord({ engine: "dataview-dql", commandName: "Skills" }),
			},
			settings: { cardByCollection: { lore: "table", skills: "table", org: "table", object: "gone-card" } },
		});

		expect(ids(await h.store.usedBy("table"))).toEqual(["lore", "org"]);
		expect(ids(await h.store.usedBy("hero"))).toEqual(["character", "location", "object"]);
		expect(await h.store.usedBy("compact")).toEqual([]);
	});

	it("removing a card record drops it and the cardByCollection entries that chose it, never a file", async () => {
		const h = makeHarness({
			views: { k: makeRecord({ kind: "card" }) },
			settings: { cardByCollection: { character: "k", lore: "table" } },
		});

		expect((await h.store.removeCard("hero")).ok).toBe(false);
		expect((await h.store.removeCard("k")).ok).toBe(true);

		expect(h.persistedViews()["k"]).toBeUndefined();
		expect(h.persistedSettings().cardByCollection).toEqual({ lore: "table" });
	});
});

// ---------------------------------------------------------------------------
// (h) selectors (L9 table, P6, P7)
// ---------------------------------------------------------------------------

describe("surface selectors", () => {
	async function fixture() {
		const h = makeHarness({
			views: {
				anvilOnly: makeRecord({ commandName: "Organizations", surfaces: { anvil: true, workbench: false } }),
				wbOnly: makeRecord({ engine: "dataview-dql", commandName: "Skills", surfaces: { anvil: false, workbench: true } }),
				both: makeRecord({ commandName: "Both", surfaces: { anvil: true, workbench: true } }),
				parked: makeRecord({ commandName: "Parked", surfaces: { anvil: false, workbench: false } }),
				off: makeRecord({ commandName: "Off", enabled: false, surfaces: { anvil: true, workbench: true } }),
			},
		});
		await h.store.setSurface("object", "workbench", false);
		await h.store.setEnabled("lore", false);
		await h.store.setSurface("location", "anvil", false);
		return h;
	}

	it("anvilPills returns exactly the enabled collections with Anvil on, in Library order", async () => {
		const h = await fixture();
		expect(ids(anvilPills(await h.store.collections()))).toEqual(["character", "object", "anvilOnly", "both"]);
		expect(ids(await h.store.anvilPills())).toEqual(["character", "object", "anvilOnly", "both"]);
	});

	it("workbenchSections returns only built-ins with Workbench on", async () => {
		const h = await fixture();
		expect(ids(workbenchSections(await h.store.collections()))).toEqual(["character", "location"]);
		expect(ids(await h.store.workbenchSections())).toEqual(["character", "location"]);
	});

	it("workbenchTabs returns only imported and from-repo collections with Workbench on", async () => {
		const h = await fixture();
		expect(ids(workbenchTabs(await h.store.collections()))).toEqual(["wbOnly", "both"]);
		expect(ids(await h.store.workbenchTabs())).toEqual(["wbOnly", "both"]);
	});

	it("an anvil pill is assignable to the Codex tab's collection shape", async () => {
		const h = await fixture();
		const pill = (await h.store.anvilPills())[0];
		expect(pill).toMatchObject({ id: "character", label: "Characters", tag: "canon/character", enabled: true });
	});
});

// ---------------------------------------------------------------------------
// New settings fail closed
// ---------------------------------------------------------------------------

describe("Library settings normalisation", () => {
	it("falls back to the shipped defaults for malformed persisted values", () => {
		const s = normalizeSettings({
			builtInCollections: { lore: { enabled: "yes", anvil: false, tag: "", excludedFolders: [1], extra: 1 }, bad: 7 },
			disabledCards: ["table", 3],
			libraryMigratedCount: -2,
		});
		expect(s.builtInCollections).toEqual({ lore: { anvil: false } });
		expect(s.disabledCards).toEqual([]);
		expect(s.libraryMigratedCount).toBe(0);
		expect(normalizeSettings({ builtInCollections: [] }).builtInCollections).toEqual({});
	});

	it("trims a tag, strips a leading #, and drops it when nothing is left", () => {
		const tags = (tag: string) =>
			normalizeSettings({ builtInCollections: { lore: { tag } } }).builtInCollections["lore"];
		expect(tags("   ")).toEqual({});
		expect(tags("#")).toEqual({});
		expect(tags("#x")).toEqual({ tag: "x" });
		expect(tags("  #story/lore ")).toEqual({ tag: "story/lore" });
	});

	it("keeps only built-in collection ids, including against __proto__", () => {
		const raw = JSON.parse('{"lore":{"enabled":false},"stale":{"enabled":false},"__proto__":{"enabled":false}}');
		const out = normalizeSettings({ builtInCollections: raw }).builtInCollections;
		expect(Object.keys(out)).toEqual(["lore"]);
		expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
		expect(Object.prototype.hasOwnProperty.call(out, "__proto__")).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// (z) one change signal (T7.1d1)
// ---------------------------------------------------------------------------

describe("CollectionStore.subscribe", () => {
	const legacy = (): ViewRecord => makeRecord({ kind: "view", engine: "dataview-dql", surfaces: { anvil: false, workbench: false } });
	const seed = () => ({
		mine: makeRecord(),
		card: makeRecord({ kind: "card", source: "00 Meta/Cards/Isekai.md" }),
		legacy: legacy(),
	});

	const writes: ReadonlyArray<[string, (s: CollectionStore) => Promise<unknown>]> = [
		["setEnabled", (s) => s.setEnabled("mine", false)],
		["setSurface", (s) => s.setSurface("mine", "workbench", true)],
		["configureBuiltIn", (s) => s.configureBuiltIn("character", { tag: "canon/person" })],
		["setScope", (s) => s.setScope(["Archive"])],
		["remove", (s) => s.remove("mine")],
		["setCardEnabled", (s) => s.setCardEnabled("card", false)],
		["removeCard", (s) => s.removeCard("card")],
		["migrate", (s) => s.migrate()],
		["dismissMigrationNotice", (s) => s.dismissMigrationNotice()],
	];

	it.each(writes)("fires exactly once after %s", async (_name, write) => {
		const { store } = makeHarness({ views: seed() });
		const listener = vi.fn();
		store.subscribe(listener);
		await write(store);
		expect(listener).toHaveBeenCalledTimes(1);
	});

	it("fires only after the write is readable", async () => {
		const { store } = makeHarness({ views: seed() });
		const seen: boolean[] = [];
		store.subscribe(() => { void store.collections().then((l) => seen.push(l.find((c) => c.id === "mine")?.enabled === false)); });
		await store.setEnabled("mine", false);
		await Promise.resolve();
		await new Promise((r) => setTimeout(r, 0));
		expect(seen).toEqual([true]);
	});

	it("does not fire for a refused write, or a migrate that moved nothing", async () => {
		const { store } = makeHarness({ views: { mine: makeRecord() } });
		const listener = vi.fn();
		store.subscribe(listener);
		expect((await store.remove("character")).ok).toBe(false);
		expect((await store.setCardEnabled("hero", false)).ok).toBe(false);
		expect(await store.migrate()).toBe(0);
		expect(listener).not.toHaveBeenCalled();
	});

	it("stops firing after unsubscribe, and one bad listener does not hide the signal from the next", async () => {
		const { store } = makeHarness({ views: seed() });
		const first = vi.fn();
		const unsubscribe = store.subscribe(first);
		const err = vi.spyOn(console, "error").mockImplementation(() => {});
		store.subscribe(() => { throw new Error("boom"); });
		const last = vi.fn();
		store.subscribe(last);
		await store.setEnabled("mine", false);
		unsubscribe();
		await store.setEnabled("mine", true);
		expect(first).toHaveBeenCalledTimes(1);
		expect(last).toHaveBeenCalledTimes(2);
		err.mockRestore();
	});

	it("does not fire when the notice was already dismissed", async () => {
		const { store } = makeHarness({ views: seed() });
		await store.dismissMigrationNotice();
		const listener = vi.fn();
		store.subscribe(listener);
		await store.dismissMigrationNotice();
		expect(listener).not.toHaveBeenCalled();
	});

	it("reports a write in flight, so a host can drop the record signal the write itself caused", async () => {
		const { store } = makeHarness({ views: seed() });
		expect(store.writing).toBe(false);
		const p = store.setEnabled("mine", false);
		expect(store.writing).toBe(true);
		await p;
		expect(store.writing).toBe(false);
	});
});
