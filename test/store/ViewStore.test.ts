/**
 * T1.2 – ViewStore (load / upsert / delete)
 *
 * Contracts under test:
 *   - getViews(): maps every entry through applyDefaults
 *   - setRecord(id, rec): read-modify-write; round-trips after reload
 *   - setRecord preserves sibling `settings` key
 *   - deleteRecord(id): removes the record
 *   - deleteRecord with absent id: safe no-op (does not throw, save still fires)
 *   - save fires exactly once per mutation (not on reads)
 *   - getViews on an empty store returns {}
 *   - getViews on a store with malformed records applies fail-closed defaults
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PluginDataPort, StoryForgeData, ViewRecord } from "../../src/store/types";
import { ViewStore } from "../../src/store/ViewStore";
import type { MigrateLegacyBasesDeps } from "../../src/store/migrateLegacyBases";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * No-op migration deps: these CRUD/subscriber tests are not about T3.2
 * legacy-bases migration, so `rec()` below deliberately defaults to a
 * non-"bases" engine to keep migration from firing underneath them. This
 * double exists only to satisfy the constructor — see migrateLegacyBases.test.ts
 * for the migration behaviour itself.
 */
const NOOP_MIGRATION_DEPS: MigrateLegacyBasesDeps = {
  readFile: async () => null,
  curatedBasesFolder: "00 Meta/Bases",
  currentParams: { tag: "", excludedFolders: [] },
};

/**
 * In-memory PluginDataPort with a save-call counter.
 * Accepts an optional initial data blob (partial StoryForgeData).
 */
function fakePort(initial: unknown = {}): PluginDataPort & { saveCount: number; data: unknown } {
  let data: unknown = structuredClone(initial);
  let saveCount = 0;
  return {
    get saveCount() {
      return saveCount;
    },
    get data() {
      return data;
    },
    async load() {
      return structuredClone(data);
    },
    async save(d: unknown) {
      data = structuredClone(d);
      saveCount++;
    },
  };
}

/**
 * Build a minimal valid ViewRecord with optional overrides.
 *
 * Default engine is "dataview-dql", not "bases" — a "bases" engine record
 * with kind:"view" is exactly the legacy shape T3.2's migration acts on
 * (src/store/migrateLegacyBases.ts), and these generic CRUD/subscriber tests
 * are not about that. Tests that DO want a bases-engine record override it
 * explicitly.
 */
function rec(overrides: Partial<ViewRecord> = {}): ViewRecord {
  return {
    provenance: "curated",
    enabled: false,
    okayed: null,
    source: "",
    engine: "dataview-dql",
    command: false,
    kind: "view",
    surfaces: { anvil: false, workbench: false },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// getViews
// ---------------------------------------------------------------------------

describe("ViewStore.getViews", () => {
  it("returns an empty record when no views are stored", async () => {
    const store = new ViewStore(fakePort({}), NOOP_MIGRATION_DEPS);
    expect(await store.getViews()).toEqual({});
  });

  it("returns an empty record when data has no 'views' key", async () => {
    const store = new ViewStore(fakePort({ settings: { exampleSetting: "x" } }), NOOP_MIGRATION_DEPS);
    expect(await store.getViews()).toEqual({});
  });

  it("applies applyDefaults to every entry", async () => {
    const port = fakePort({
      views: {
        v1: { enabled: true, engine: "dataviewjs" },
        v2: { okayed: 99 },            // malformed okayed → null
        v3: { provenance: "imported" },
      },
    });
    const store = new ViewStore(port, NOOP_MIGRATION_DEPS);
    const views = await store.getViews();

    expect(views["v1"]?.enabled).toBe(true);
    expect(views["v1"]?.engine).toBe("dataviewjs");
    expect(views["v1"]?.provenance).toBe("curated"); // default

    expect(views["v2"]?.okayed).toBeNull(); // fail-closed
    expect(views["v2"]?.enabled).toBe(false);

    expect(views["v3"]?.provenance).toBe("imported");
  });

  it("does NOT call save during a read", async () => {
    const port = fakePort({ views: { v1: rec() } });
    const store = new ViewStore(port, NOOP_MIGRATION_DEPS);
    await store.getViews();
    expect(port.saveCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getViews — T3.2 legacy-bases migration (the ADR-6 "persist on read" exception)
//
// rec()'s default engine moved to "dataview-dql" so the CRUD/subscriber suites
// above don't trip migration incidentally. That leaves ViewStore's own
// getViews()-persists-when-migrated behaviour (ViewStore.ts:64-67) uncovered
// at this level — migrateLegacyBases.test.ts only exercises the pure
// migrateLegacyBases() function, never a real ViewStore + PluginDataPort. This
// block restores that coverage: a bases-engine, kind:"view" record run through
// a real ViewStore.getViews() call.
// ---------------------------------------------------------------------------

describe("ViewStore.getViews — T3.2 legacy bases migration", () => {
  it("migrates a legacy bases record to kind:'collection' and persists once, unlike an ordinary read", async () => {
    const legacy = rec({ engine: "bases", kind: "view", source: "filters: file.hasTag(\"x\")\n" });
    const port = fakePort({ views: { v1: legacy } });
    const store = new ViewStore(port, NOOP_MIGRATION_DEPS);

    const views = await store.getViews();

    expect(views["v1"]?.kind).toBe("collection");
    expect(views["v1"]?.generated).toBeDefined();
    // The one documented exception to ADR-6: migration writes once on this read.
    expect(port.saveCount).toBe(1);
  });

  it("preserves sibling settings when the migration write fires", async () => {
    const legacy = rec({ engine: "bases", kind: "view" });
    const port = fakePort({ settings: { exampleSetting: "keep" }, views: { v1: legacy } });
    const store = new ViewStore(port, NOOP_MIGRATION_DEPS);

    await store.getViews();

    const written = port.data as StoryForgeData;
    expect(written.settings).toEqual({ exampleSetting: "keep" });
  });

  it("does not persist again on a second read once already migrated", async () => {
    const legacy = rec({ engine: "bases", kind: "view" });
    const port = fakePort({ views: { v1: legacy } });
    const store = new ViewStore(port, NOOP_MIGRATION_DEPS);

    await store.getViews();
    expect(port.saveCount).toBe(1);

    await store.getViews();
    expect(port.saveCount).toBe(1); // idempotent — no second write
  });

  // -------------------------------------------------------------------------
  // Code-review fix 1: a migrating read must not throw when the persist fails
  // -------------------------------------------------------------------------

  it("degrades gracefully when the migration persist write fails: resolves with the migrated records instead of throwing", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const legacy = rec({ engine: "bases", kind: "view", source: "filters: file.hasTag(\"x\")\n" });
    const port: PluginDataPort = {
      load: async () => ({ views: { v1: legacy } }),
      save: async () => {
        throw new Error("disk full");
      },
    };
    const store = new ViewStore(port, NOOP_MIGRATION_DEPS);

    const views = await store.getViews();

    // Migrated in-memory view is still returned even though the write failed.
    expect(views["v1"]?.kind).toBe("collection");
    expect(views["v1"]?.generated).toBeDefined();
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // Code-review fix 2: overlapping migrating reads persist at most once
  // -------------------------------------------------------------------------

  it("persists exactly once under overlapping getViews() calls, and both callers receive the migrated records", async () => {
    const legacy = rec({ engine: "bases", kind: "view", source: "filters: file.hasTag(\"x\")\n" });
    const port = fakePort({ views: { v1: legacy } });
    const store = new ViewStore(port, NOOP_MIGRATION_DEPS);

    const [viewsA, viewsB] = await Promise.all([store.getViews(), store.getViews()]);

    expect(port.saveCount).toBe(1);
    expect(viewsA["v1"]?.kind).toBe("collection");
    expect(viewsB["v1"]?.kind).toBe("collection");
  });
});

// ---------------------------------------------------------------------------
// setRecord
// ---------------------------------------------------------------------------

describe("ViewStore.setRecord", () => {
  it("stores a record and makes it retrievable via getViews", async () => {
    const port = fakePort();
    const store = new ViewStore(port, NOOP_MIGRATION_DEPS);
    await store.setRecord("v1", rec({ enabled: true, source: "views/test.md" }));
    const views = await store.getViews();
    expect(views["v1"]?.enabled).toBe(true);
    expect(views["v1"]?.source).toBe("views/test.md");
  });

  it("round-trips a record and preserves sibling settings", async () => {
    const port = fakePort({ settings: { exampleSetting: "theme-x" } });
    const store = new ViewStore(port, NOOP_MIGRATION_DEPS);
    await store.setRecord("v1", rec({ enabled: true }));

    // sibling 'settings' must survive the write
    const written = port.data as StoryForgeData;
    expect(written.settings).toEqual({ exampleSetting: "theme-x" });

    // record is retrievable
    expect((await store.getViews())["v1"]?.enabled).toBe(true);
  });

  it("fires save exactly once per setRecord call", async () => {
    const port = fakePort();
    const store = new ViewStore(port, NOOP_MIGRATION_DEPS);
    await store.setRecord("v1", rec());
    expect(port.saveCount).toBe(1);
  });

  it("fires save once per call even when called multiple times", async () => {
    const port = fakePort();
    const store = new ViewStore(port, NOOP_MIGRATION_DEPS);
    await store.setRecord("v1", rec());
    await store.setRecord("v2", rec({ engine: "dataview-dql" }));
    expect(port.saveCount).toBe(2);
  });

  it("overwrites an existing record", async () => {
    const port = fakePort({ views: { v1: rec({ enabled: false }) } });
    const store = new ViewStore(port, NOOP_MIGRATION_DEPS);
    await store.setRecord("v1", rec({ enabled: true }));
    const views = await store.getViews();
    expect(views["v1"]?.enabled).toBe(true);
  });

  it("preserves other records when writing a new one", async () => {
    const port = fakePort({ views: { existing: rec({ source: "keep-me" }) } });
    const store = new ViewStore(port, NOOP_MIGRATION_DEPS);
    await store.setRecord("new", rec({ source: "new-entry" }));
    const views = await store.getViews();
    expect(views["existing"]?.source).toBe("keep-me");
    expect(views["new"]?.source).toBe("new-entry");
  });
});

// ---------------------------------------------------------------------------
// deleteRecord
// ---------------------------------------------------------------------------

describe("ViewStore.deleteRecord", () => {
  it("removes an existing record", async () => {
    const port = fakePort({ views: { v1: rec(), v2: rec() } });
    const store = new ViewStore(port, NOOP_MIGRATION_DEPS);
    await store.deleteRecord("v1");
    const views = await store.getViews();
    expect("v1" in views).toBe(false);
    expect("v2" in views).toBe(true);
  });

  it("is a safe no-op when the id does not exist", async () => {
    const port = fakePort({ views: { v1: rec() } });
    const store = new ViewStore(port, NOOP_MIGRATION_DEPS);
    await expect(store.deleteRecord("nonexistent")).resolves.toBeUndefined();
    const views = await store.getViews();
    expect("v1" in views).toBe(true); // untouched
  });

  it("fires save exactly once per deleteRecord call (even on no-op)", async () => {
    const port = fakePort({});
    const store = new ViewStore(port, NOOP_MIGRATION_DEPS);
    await store.deleteRecord("nonexistent");
    expect(port.saveCount).toBe(1);
  });

  it("preserves sibling settings on delete", async () => {
    const port = fakePort({ settings: { exampleSetting: "keep" }, views: { v1: rec() } });
    const store = new ViewStore(port, NOOP_MIGRATION_DEPS);
    await store.deleteRecord("v1");
    const written = port.data as StoryForgeData;
    expect(written.settings).toEqual({ exampleSetting: "keep" });
  });
});

// ---------------------------------------------------------------------------
// Change observer — subscribe / _notify
// ---------------------------------------------------------------------------

describe("ViewStore.subscribe — fires after setRecord", () => {
  it("calls the subscriber after setRecord", async () => {
    const port = fakePort({});
    const store = new ViewStore(port, NOOP_MIGRATION_DEPS);
    const calls: number[] = [];
    store.subscribe(() => { calls.push(1); });
    await store.setRecord("v1", rec());
    expect(calls.length).toBe(1);
  });

  it("calls the subscriber after deleteRecord", async () => {
    const port = fakePort({ views: { v1: rec() } });
    const store = new ViewStore(port, NOOP_MIGRATION_DEPS);
    const calls: number[] = [];
    store.subscribe(() => { calls.push(1); });
    await store.deleteRecord("v1");
    expect(calls.length).toBe(1);
  });

  it("subscriber sees committed state (saveCount===1) at call time", async () => {
    const port = fakePort({});
    const store = new ViewStore(port, NOOP_MIGRATION_DEPS);
    let saveCountAtNotify = -1;
    store.subscribe(() => { saveCountAtNotify = port.saveCount; });
    await store.setRecord("v1", rec());
    expect(saveCountAtNotify).toBe(1);
  });

  it("subscriber reads committed views (getViews returns new record) at call time", async () => {
    const port = fakePort({});
    const store = new ViewStore(port, NOOP_MIGRATION_DEPS);
    let viewsPromise: Promise<Record<string, unknown>> | null = null;
    store.subscribe(() => {
      viewsPromise = store.getViews();
    });
    await store.setRecord("v1", rec({ source: "check" }));
    // subscriber was called synchronously after persist — resolve its getViews()
    expect(viewsPromise).not.toBeNull();
    const views = await viewsPromise!;
    expect(views["v1"]).toBeDefined();
    expect((views["v1"] as { source: string }).source).toBe("check");
  });

  it("unsubscribe stops future notifications", async () => {
    const port = fakePort({});
    const store = new ViewStore(port, NOOP_MIGRATION_DEPS);
    const calls: number[] = [];
    const unsub = store.subscribe(() => { calls.push(1); });
    await store.setRecord("v1", rec());
    unsub();
    await store.setRecord("v2", rec());
    expect(calls.length).toBe(1);
  });

  it("a throwing subscriber does NOT prevent persist (saveCount still 1)", async () => {
    const port = fakePort({});
    const store = new ViewStore(port, NOOP_MIGRATION_DEPS);
    store.subscribe(() => { throw new Error("bad subscriber"); });
    // should not throw
    await expect(store.setRecord("v1", rec())).resolves.toBeUndefined();
    expect(port.saveCount).toBe(1);
  });

  it("a throwing subscriber does NOT prevent sibling subscribers from firing", async () => {
    const port = fakePort({});
    const store = new ViewStore(port, NOOP_MIGRATION_DEPS);
    store.subscribe(() => { throw new Error("bad subscriber"); });
    const sibling: number[] = [];
    store.subscribe(() => { sibling.push(1); });
    await store.setRecord("v1", rec());
    expect(sibling.length).toBe(1);
  });

  it("does NOT fire subscribers during getViews (read path)", async () => {
    const port = fakePort({ views: { v1: rec() } });
    const store = new ViewStore(port, NOOP_MIGRATION_DEPS);
    const calls: number[] = [];
    store.subscribe(() => { calls.push(1); });
    await store.getViews();
    expect(calls.length).toBe(0);
  });

  it("fires subscribers once per setRecord call even when called multiple times", async () => {
    const port = fakePort({});
    const store = new ViewStore(port, NOOP_MIGRATION_DEPS);
    let count = 0;
    store.subscribe(() => { count++; });
    await store.setRecord("v1", rec());
    await store.setRecord("v2", rec());
    expect(count).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Persistence discipline (ADR-6)
// ---------------------------------------------------------------------------

describe("ViewStore persistence discipline", () => {
  it("does not save during construction", async () => {
    const port = fakePort({});
    new ViewStore(port, NOOP_MIGRATION_DEPS);
    expect(port.saveCount).toBe(0);
  });

  it("does not save during multiple getViews calls", async () => {
    const port = fakePort({ views: { v1: rec() } });
    const store = new ViewStore(port, NOOP_MIGRATION_DEPS);
    await store.getViews();
    await store.getViews();
    await store.getViews();
    expect(port.saveCount).toBe(0);
  });

  it("total save count matches number of mutations", async () => {
    const port = fakePort({});
    const store = new ViewStore(port, NOOP_MIGRATION_DEPS);

    await store.getViews();         // read — no save
    await store.setRecord("a", rec()); // save 1
    await store.getViews();         // read — no save
    await store.setRecord("b", rec()); // save 2
    await store.deleteRecord("a");  // save 3
    await store.getViews();         // read — no save

    expect(port.saveCount).toBe(3);
  });
});
