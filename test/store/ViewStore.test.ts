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

import { beforeEach, describe, expect, it } from "vitest";
import type { PluginDataPort, StoryForgeData, ViewRecord } from "../../src/store/types";
import { ViewStore } from "../../src/store/ViewStore";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

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

/** Build a minimal valid ViewRecord with optional overrides. */
function rec(overrides: Partial<ViewRecord> = {}): ViewRecord {
  return {
    provenance: "curated",
    enabled: false,
    okayed: null,
    source: "",
    engine: "bases",
    command: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// getViews
// ---------------------------------------------------------------------------

describe("ViewStore.getViews", () => {
  it("returns an empty record when no views are stored", async () => {
    const store = new ViewStore(fakePort({}));
    expect(await store.getViews()).toEqual({});
  });

  it("returns an empty record when data has no 'views' key", async () => {
    const store = new ViewStore(fakePort({ settings: { exampleSetting: "x" } }));
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
    const store = new ViewStore(port);
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
    const store = new ViewStore(port);
    await store.getViews();
    expect(port.saveCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// setRecord
// ---------------------------------------------------------------------------

describe("ViewStore.setRecord", () => {
  it("stores a record and makes it retrievable via getViews", async () => {
    const port = fakePort();
    const store = new ViewStore(port);
    await store.setRecord("v1", rec({ enabled: true, source: "views/test.md" }));
    const views = await store.getViews();
    expect(views["v1"]?.enabled).toBe(true);
    expect(views["v1"]?.source).toBe("views/test.md");
  });

  it("round-trips a record and preserves sibling settings", async () => {
    const port = fakePort({ settings: { exampleSetting: "theme-x" } });
    const store = new ViewStore(port);
    await store.setRecord("v1", rec({ enabled: true }));

    // sibling 'settings' must survive the write
    const written = port.data as StoryForgeData;
    expect(written.settings).toEqual({ exampleSetting: "theme-x" });

    // record is retrievable
    expect((await store.getViews())["v1"]?.enabled).toBe(true);
  });

  it("fires save exactly once per setRecord call", async () => {
    const port = fakePort();
    const store = new ViewStore(port);
    await store.setRecord("v1", rec());
    expect(port.saveCount).toBe(1);
  });

  it("fires save once per call even when called multiple times", async () => {
    const port = fakePort();
    const store = new ViewStore(port);
    await store.setRecord("v1", rec());
    await store.setRecord("v2", rec({ engine: "dataview-dql" }));
    expect(port.saveCount).toBe(2);
  });

  it("overwrites an existing record", async () => {
    const port = fakePort({ views: { v1: rec({ enabled: false }) } });
    const store = new ViewStore(port);
    await store.setRecord("v1", rec({ enabled: true }));
    const views = await store.getViews();
    expect(views["v1"]?.enabled).toBe(true);
  });

  it("preserves other records when writing a new one", async () => {
    const port = fakePort({ views: { existing: rec({ source: "keep-me" }) } });
    const store = new ViewStore(port);
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
    const store = new ViewStore(port);
    await store.deleteRecord("v1");
    const views = await store.getViews();
    expect("v1" in views).toBe(false);
    expect("v2" in views).toBe(true);
  });

  it("is a safe no-op when the id does not exist", async () => {
    const port = fakePort({ views: { v1: rec() } });
    const store = new ViewStore(port);
    await expect(store.deleteRecord("nonexistent")).resolves.toBeUndefined();
    const views = await store.getViews();
    expect("v1" in views).toBe(true); // untouched
  });

  it("fires save exactly once per deleteRecord call (even on no-op)", async () => {
    const port = fakePort({});
    const store = new ViewStore(port);
    await store.deleteRecord("nonexistent");
    expect(port.saveCount).toBe(1);
  });

  it("preserves sibling settings on delete", async () => {
    const port = fakePort({ settings: { exampleSetting: "keep" }, views: { v1: rec() } });
    const store = new ViewStore(port);
    await store.deleteRecord("v1");
    const written = port.data as StoryForgeData;
    expect(written.settings).toEqual({ exampleSetting: "keep" });
  });
});

// ---------------------------------------------------------------------------
// Persistence discipline (ADR-6)
// ---------------------------------------------------------------------------

describe("ViewStore persistence discipline", () => {
  it("does not save during construction", async () => {
    const port = fakePort({});
    new ViewStore(port);
    expect(port.saveCount).toBe(0);
  });

  it("does not save during multiple getViews calls", async () => {
    const port = fakePort({ views: { v1: rec() } });
    const store = new ViewStore(port);
    await store.getViews();
    await store.getViews();
    await store.getViews();
    expect(port.saveCount).toBe(0);
  });

  it("total save count matches number of mutations", async () => {
    const port = fakePort({});
    const store = new ViewStore(port);

    await store.getViews();         // read — no save
    await store.setRecord("a", rec()); // save 1
    await store.getViews();         // read — no save
    await store.setRecord("b", rec()); // save 2
    await store.deleteRecord("a");  // save 3
    await store.getViews();         // read — no save

    expect(port.saveCount).toBe(3);
  });
});
