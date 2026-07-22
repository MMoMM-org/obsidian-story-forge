/**
 * CatalogService.test.ts — T4.4
 *
 * Tests the fail-closed checksum verify, materialise (.base → vault), persist
 * (store.setRecord with engine:"bases" + raw YAML source), and sidebar re-render.
 *
 * Design:
 *   - CatalogService receives the CatalogIndex via constructor injection — no
 *     dist/ read at runtime, fully testable without build artifacts.
 *   - Vault writes are mocked via App.vault.adapter (write + exists + mkdir + remove).
 *   - store.setRecord is mocked to capture the persisted ViewRecord.
 *   - No fetch/network calls on any path (CON-9, offline-only catalog).
 *
 * @ref PRD/AC-F4.5 (checksum mismatch fails closed)
 * @ref PRD/AC-F4.6 (install surfaced via existing view surfaces)
 * @ref PRD/AC-F4.7 (offline install works)
 * @ref SDD/Runtime View — curated-install algorithm
 * @ref SDD/ADR-5 (bases source = raw .base YAML; curatedBasesFolder setting)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { App } from "obsidian";
import { computeChecksum } from "consent/checksum";
import { CatalogService } from "catalog/CatalogService";
import type { CatalogIndex, CatalogEntry } from "catalog/catalogTypes";
import type { ViewStore } from "store/ViewStore";
import type { ViewRecord } from "store/types";
import type { ConsentGate } from "consent/ConsentGate";

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

const BASE_YAML = "filters: file.hasTag(\"test\")\nviews:\n  - type: table\n    name: Test View\n";

async function makeEntry(overrides: Partial<CatalogEntry> = {}): Promise<CatalogEntry> {
	const source = overrides.source ?? BASE_YAML;
	const checksum = overrides.checksum ?? (await computeChecksum(source));
	return {
		id: "overview-characters",
		name: "Characters",
		engine: "bases",
		source,
		checksum,
		...overrides,
	};
}

async function makeCatalogIndex(entries?: CatalogEntry[]): Promise<CatalogIndex> {
	const resolvedEntries = entries ?? [await makeEntry()];
	return {
		version: "1",
		generated: new Date().toISOString(),
		entries: resolvedEntries,
	};
}

function makeApp(): App {
	const app = new App();
	vi.mocked(app.vault.adapter.exists).mockResolvedValue(false);
	vi.mocked(app.vault.adapter.write).mockResolvedValue(undefined);
	// mkdir is properly typed on DataAdapter (obsidian.d.ts:2099) — no cast needed.
	vi.mocked(app.vault.adapter.mkdir).mockResolvedValue(undefined);
	vi.mocked(app.vault.adapter.remove).mockResolvedValue(undefined);
	return app;
}

/** A store that captures setRecord calls and surfaces them for assertions. */
function makeStore(initial: Record<string, ViewRecord> = {}): {
	store: ViewStore;
	capturedRecords: Map<string, ViewRecord>;
} {
	const capturedRecords = new Map<string, ViewRecord>();
	const views: Record<string, ViewRecord> = { ...initial };
	const store: ViewStore = {
		getViews: vi.fn(async () => ({ ...views })),
		setRecord: vi.fn(async (id: string, rec: ViewRecord) => {
			views[id] = rec;
			capturedRecords.set(id, rec);
		}),
		deleteRecord: vi.fn(async () => {}),
		subscribe: vi.fn((_cb: () => void) => {
			return () => {};
		}),
	} as unknown as ViewStore;
	return { store, capturedRecords };
}

function makeGate(): ConsentGate {
	return {
		requestConsentForDef: vi.fn(async () => ({ version: 1, checksum: "sha256:abc" })),
		requestConsent: vi.fn(),
		requestReConsent: vi.fn(),
		evaluate: vi.fn(),
	} as unknown as ConsentGate;
}

// ---------------------------------------------------------------------------
// Suite 1 — Fail-closed: checksum MISMATCH
// ---------------------------------------------------------------------------

describe("CatalogService — checksum mismatch fails closed (AC-F4.5)", () => {
	it("writes NOTHING to the vault when entry.checksum does not match computeChecksum(entry.source)", async () => {
		const app = makeApp();
		const { store } = makeStore();
		const gate = makeGate();

		// Entry with a deliberately wrong checksum.
		const entry = await makeEntry({ checksum: "sha256:deadbeef00000000000000000000000000000000000000000000000000000000" });
		const index = await makeCatalogIndex([entry]);

		const svc = new CatalogService(index, { app, gate, store, curatedBasesFolder: "00 Meta/Bases" });

		const result = await svc.install(entry.id);

		// Must not write to the vault adapter.
		expect(vi.mocked(app.vault.adapter.write)).not.toHaveBeenCalled();
		// Must not call store.setRecord.
		expect(vi.mocked(store.setRecord)).not.toHaveBeenCalled();
		// Must surface a reason.
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toMatch(/checksum/i);
		}
	});

	it("returns a result with ok:false and a reason string on mismatch", async () => {
		const app = makeApp();
		const { store } = makeStore();
		const entry = await makeEntry({ checksum: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" });
		const index = await makeCatalogIndex([entry]);

		const svc = new CatalogService(index, {
			app,

			gate: makeGate(),
			store,
			curatedBasesFolder: "00 Meta/Bases",
		});

		const result = await svc.install(entry.id);

		expect(result).toMatchObject({ ok: false });
	});
});

// ---------------------------------------------------------------------------
// Suite 2 — Bases entry persists with correct engine and source (the core bug fix)
// ---------------------------------------------------------------------------

describe("CatalogService — bases entry: ViewRecord has engine='bases' and source=raw YAML (AC-F4.5/ADR-5)", () => {
	it("store.setRecord is called with engine:'bases' for a bases catalog entry", async () => {
		const app = makeApp();
		const { store, capturedRecords } = makeStore();

		const entry = await makeEntry({ id: "overview-characters", source: BASE_YAML });
		const index = await makeCatalogIndex([entry]);

		const svc = new CatalogService(index, {
			app,

			gate: makeGate(),
			store,
			curatedBasesFolder: "00 Meta/Bases",
		});

		const result = await svc.install(entry.id);

		expect(result.ok).toBe(true);
		expect(capturedRecords.size).toBe(1);
		const [writtenRecord] = capturedRecords.values();
		expect(writtenRecord!.engine).toBe("bases");
	});

	it("store.setRecord is called with source equal to the raw .base YAML (not the entry id slug)", async () => {
		const app = makeApp();
		const { store, capturedRecords } = makeStore();

		const entry = await makeEntry({ id: "overview-characters", source: BASE_YAML });
		const index = await makeCatalogIndex([entry]);

		const svc = new CatalogService(index, {
			app,

			gate: makeGate(),
			store,
			curatedBasesFolder: "00 Meta/Bases",
		});

		await svc.install(entry.id);

		const [writtenRecord] = capturedRecords.values();
		// source must be the raw YAML — NOT the slug "overview-characters"
		expect(writtenRecord!.source).toBe(BASE_YAML);
		expect(writtenRecord!.source).not.toBe("overview-characters");
	});

	it("persisted record has provenance:'curated' and enabled:true", async () => {
		const app = makeApp();
		const { store, capturedRecords } = makeStore();

		const entry = await makeEntry();
		const index = await makeCatalogIndex([entry]);

		const svc = new CatalogService(index, {
			app,

			gate: makeGate(),
			store,
			curatedBasesFolder: "00 Meta/Bases",
		});

		await svc.install(entry.id);

		const [writtenRecord] = capturedRecords.values();
		expect(writtenRecord!.provenance).toBe("curated");
		expect(writtenRecord!.enabled).toBe(true);
	});

	it("persisted record has okayed.checksum equal to computeChecksum(entry.source)", async () => {
		const app = makeApp();
		const { store, capturedRecords } = makeStore();

		const entry = await makeEntry({ source: BASE_YAML });
		const index = await makeCatalogIndex([entry]);

		const svc = new CatalogService(index, {
			app,

			gate: makeGate(),
			store,
			curatedBasesFolder: "00 Meta/Bases",
		});

		await svc.install(entry.id);

		const expectedChecksum = await computeChecksum(BASE_YAML);
		const [writtenRecord] = capturedRecords.values();
		expect(writtenRecord!.okayed?.checksum).toBe(expectedChecksum);
	});

	it("the persisted record.engine routes to BasesFenceEngine (engine must be 'bases')", async () => {
		// BasesFenceEngine registers with kind = "bases" as const.
		// EngineRegistry.get("bases") returns it; any other engine string breaks render.
		// This test catches the original bug where "dataview-dql" was written instead.
		const app = makeApp();
		const { store, capturedRecords } = makeStore();

		const entry = await makeEntry();
		const index = await makeCatalogIndex([entry]);

		const svc = new CatalogService(index, {
			app,

			gate: makeGate(),
			store,
			curatedBasesFolder: "00 Meta/Bases",
		});

		await svc.install(entry.id);

		const [writtenRecord] = capturedRecords.values();
		// Must be "bases" — the kind string BasesFenceEngine registers with.
		// If this is "dataview-dql", the DQL engine gets called with raw .base YAML → broken render.
		expect(writtenRecord!.engine).toBe("bases");
	});

	it("persisted record has catalogId equal to entry.id (stable slug for update detection)", async () => {
		// catalogId is the stable key BrowseOfficialModal uses to match installed
		// records to catalog entries (survives catalog name renames — T4.5 fix).
		const app = makeApp();
		const { store, capturedRecords } = makeStore();

		const entry = await makeEntry({ id: "overview-characters" });
		const index = await makeCatalogIndex([entry]);

		const svc = new CatalogService(index, {
			app,
			gate: makeGate(),
			store,
			curatedBasesFolder: "00 Meta/Bases",
		});

		await svc.install(entry.id);

		const [writtenRecord] = capturedRecords.values();
		expect(writtenRecord!.catalogId).toBe("overview-characters");
	});
});

// ---------------------------------------------------------------------------
// Suite 3 — Atomic install: partial-write cleanup (C1 / W1)
// ---------------------------------------------------------------------------

describe("CatalogService — atomic install: partial-write cleanup (C1)", () => {
	it("returns ok:false (does NOT throw) when store.setRecord rejects after the .base file was written", async () => {
		const app = makeApp();
		const { store } = makeStore();

		// File write succeeds but store persist fails.
		vi.mocked(app.vault.adapter.write).mockResolvedValue(undefined);
		vi.mocked(store.setRecord).mockRejectedValue(new Error("disk full"));

		const entry = await makeEntry({ id: "overview-characters", source: BASE_YAML });
		const index = await makeCatalogIndex([entry]);

		const svc = new CatalogService(index, {
			app,

			gate: makeGate(),
			store,
			curatedBasesFolder: "00 Meta/Bases",
		});

		// Must NOT throw.
		const result = await svc.install(entry.id);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toMatch(/persist failed/i);
		}
	});

	it("removes the orphaned .base file when store.setRecord rejects (rollback)", async () => {
		const app = makeApp();
		const { store } = makeStore();

		vi.mocked(app.vault.adapter.write).mockResolvedValue(undefined);
		vi.mocked(store.setRecord).mockRejectedValue(new Error("disk full"));

		const entry = await makeEntry({ id: "overview-characters" });
		const index = await makeCatalogIndex([entry]);

		const svc = new CatalogService(index, {
			app,

			gate: makeGate(),
			store,
			curatedBasesFolder: "00 Meta/Bases",
		});

		await svc.install(entry.id);

		// adapter.remove must have been called on the path that was written.
		expect(vi.mocked(app.vault.adapter.remove)).toHaveBeenCalledTimes(1);
		const [removedPath] = vi.mocked(app.vault.adapter.remove).mock.calls[0]!;
		expect(removedPath).toContain("overview-characters.base");
	});

	it("still returns ok:false even when rollback remove also fails", async () => {
		const app = makeApp();
		const { store } = makeStore();

		vi.mocked(app.vault.adapter.write).mockResolvedValue(undefined);
		vi.mocked(store.setRecord).mockRejectedValue(new Error("disk full"));
		vi.mocked(app.vault.adapter.remove).mockRejectedValue(new Error("remove also failed"));

		const entry = await makeEntry();
		const index = await makeCatalogIndex([entry]);

		const svc = new CatalogService(index, {
			app,

			gate: makeGate(),
			store,
			curatedBasesFolder: "00 Meta/Bases",
		});

		// Double failure: persist + rollback both fail — must still not throw.
		await expect(svc.install(entry.id)).resolves.toMatchObject({ ok: false });
	});
});

// ---------------------------------------------------------------------------
// Suite 4 — Checksum MATCH: install result and duplicate handling
// ---------------------------------------------------------------------------

describe("CatalogService — checksum match: install result (AC-F4.6)", () => {
	it("returns ok:true on a matching bases entry", async () => {
		const app = makeApp();
		const entry = await makeEntry();
		const index = await makeCatalogIndex([entry]);

		const svc = new CatalogService(index, {
			app,

			gate: makeGate(),
			store: makeStore().store,
			curatedBasesFolder: "00 Meta/Bases",
		});

		const result = await svc.install(entry.id);

		expect(result.ok).toBe(true);
	});

	it("returns ok:false with reason:'not-found' when id is not in the index", async () => {
		const app = makeApp();
		const entry = await makeEntry();
		const index = await makeCatalogIndex([entry]);

		const svc = new CatalogService(index, {
			app,

			gate: makeGate(),
			store: makeStore().store,
			curatedBasesFolder: "00 Meta/Bases",
		});

		const result = await svc.install("does-not-exist");

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toMatch(/not.found/i);
		}
	});

	it("returns ok:false up-to-date when source already in store (duplicate detection)", async () => {
		const app = makeApp();
		const entry = await makeEntry({ source: BASE_YAML });

		// Pre-populate store with a record that has the same source.
		const existingRecord: ViewRecord = {
			provenance: "curated",
			enabled: true,
			okayed: null,
			source: BASE_YAML,
			engine: "bases",
			command: false,
		};
		const { store } = makeStore({ "existing-id": existingRecord });
		const index = await makeCatalogIndex([entry]);

		const svc = new CatalogService(index, {
			app,

			gate: makeGate(),
			store,
			curatedBasesFolder: "00 Meta/Bases",
		});

		const result = await svc.install(entry.id);

		// Should not write anything new.
		expect(vi.mocked(store.setRecord)).not.toHaveBeenCalled();
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toMatch(/up.to.date/i);
		}
	});
});

// ---------------------------------------------------------------------------
// Suite 5 — Materialise: bases entry writes .base into curatedBasesFolder
// ---------------------------------------------------------------------------

describe("CatalogService — materialise: bases entry writes .base file (AC-F4.5/ADR-5)", () => {
	it("writes entry.source to <curatedBasesFolder>/<entry.id>.base via vault.adapter.write", async () => {
		const app = makeApp();
		const entry = await makeEntry({ id: "overview-characters", source: BASE_YAML });
		const index = await makeCatalogIndex([entry]);

		const svc = new CatalogService(index, {
			app,

			gate: makeGate(),
			store: makeStore().store,
			curatedBasesFolder: "00 Meta/Bases",
		});

		await svc.install(entry.id);

		const writeCalls = vi.mocked(app.vault.adapter.write).mock.calls;
		expect(writeCalls).toHaveLength(1);
		const [writtenPath, writtenContent] = writeCalls[0]!;
		// Path must be normalizePath'd and point into curatedBasesFolder.
		expect(writtenPath).toContain("00 Meta/Bases");
		expect(writtenPath).toContain("overview-characters.base");
		// Content must be the raw source YAML.
		expect(writtenContent).toBe(BASE_YAML);
	});

	it("uses normalizePath on the target path (no double slashes)", async () => {
		const app = makeApp();
		const entry = await makeEntry({ id: "overview-locations" });
		const index = await makeCatalogIndex([entry]);

		const svc = new CatalogService(index, {
			app,

			gate: makeGate(),
			store: makeStore().store,
			curatedBasesFolder: "00 Meta/Bases",
		});

		await svc.install(entry.id);

		const [writtenPath] = vi.mocked(app.vault.adapter.write).mock.calls[0]!;
		expect(writtenPath).not.toContain("//");
	});

	it("creates the folder if it does not exist", async () => {
		const app = makeApp();
		vi.mocked(app.vault.adapter.exists).mockResolvedValue(false);

		const entry = await makeEntry();
		const index = await makeCatalogIndex([entry]);

		const svc = new CatalogService(index, {
			app,

			gate: makeGate(),
			store: makeStore().store,
			curatedBasesFolder: "00 Meta/Bases",
		});

		await svc.install(entry.id);

		expect(vi.mocked(app.vault.adapter.mkdir)).toHaveBeenCalled();
	});

	it("does NOT re-create the folder if it already exists", async () => {
		const app = makeApp();
		vi.mocked(app.vault.adapter.exists).mockResolvedValue(true);

		const entry = await makeEntry();
		const index = await makeCatalogIndex([entry]);

		const svc = new CatalogService(index, {
			app,

			gate: makeGate(),
			store: makeStore().store,
			curatedBasesFolder: "00 Meta/Bases",
		});

		await svc.install(entry.id);

		expect(vi.mocked(app.vault.adapter.mkdir)).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// Suite 6 — Persistence + sidebar re-render (AC-F4.6)
// ---------------------------------------------------------------------------

describe("CatalogService — persistence and sidebar re-render (AC-F4.6)", () => {
	it("store.setRecord is called exactly once after a successful bases install", async () => {
		const app = makeApp();
		const { store } = makeStore();

		const entry = await makeEntry();
		const index = await makeCatalogIndex([entry]);

		const svc = new CatalogService(index, {
			app,

			gate: makeGate(),
			store,
			curatedBasesFolder: "00 Meta/Bases",
		});

		await svc.install(entry.id);

		expect(vi.mocked(store.setRecord)).toHaveBeenCalledTimes(1);
	});

	it("store subscribers are notified after a successful install (sidebar re-render)", async () => {
		const app = makeApp();
		const subscriber = vi.fn();
		const { store } = makeStore();

		// Wire the subscriber to fire when setRecord is called.
		vi.mocked(store.setRecord).mockImplementation(async (_id, _rec) => {
			subscriber();
		});

		const entry = await makeEntry();
		const index = await makeCatalogIndex([entry]);

		const svc = new CatalogService(index, {
			app,

			gate: makeGate(),
			store,
			curatedBasesFolder: "00 Meta/Bases",
		});

		await svc.install(entry.id);

		// setRecord was called → sidebar subscriber (wired by ViewStore.subscribe) fires.
		expect(subscriber).toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// Suite 7 — Offline: no network on any path (AC-F4.7 / CON-9)
// ---------------------------------------------------------------------------

describe("CatalogService — offline: no fetch/requestUrl on any path (AC-F4.7)", () => {
	beforeEach(() => {
		vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("fetch must not be called in catalog install"));
	});

	it("installs a bases entry without any network call", async () => {
		const app = makeApp();
		const entry = await makeEntry();
		const index = await makeCatalogIndex([entry]);

		const svc = new CatalogService(index, {
			app,

			gate: makeGate(),
			store: makeStore().store,
			curatedBasesFolder: "00 Meta/Bases",
		});

		await expect(svc.install(entry.id)).resolves.toMatchObject({ ok: true });
		expect(fetch).not.toHaveBeenCalled();
	});

	it("fails closed without network even on checksum mismatch", async () => {
		const app = makeApp();
		const entry = await makeEntry({ checksum: "sha256:0000000000000000000000000000000000000000000000000000000000000000" });
		const index = await makeCatalogIndex([entry]);

		const svc = new CatalogService(index, {
			app,

			gate: makeGate(),
			store: makeStore().store,
			curatedBasesFolder: "00 Meta/Bases",
		});

		await expect(svc.install(entry.id)).resolves.toMatchObject({ ok: false });
		expect(fetch).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// Suite 8 — getEntries: surfaces the catalog list
// ---------------------------------------------------------------------------

describe("CatalogService.getEntries()", () => {
	it("returns all entries from the injected index", async () => {
		const app = makeApp();
		const entries = [
			await makeEntry({ id: "overview-characters", name: "Characters" }),
			await makeEntry({ id: "overview-locations", name: "Locations" }),
		];
		const index = await makeCatalogIndex(entries);

		const svc = new CatalogService(index, {
			app,

			gate: makeGate(),
			store: makeStore().store,
			curatedBasesFolder: "00 Meta/Bases",
		});

		const result = svc.getEntries();

		expect(result).toHaveLength(2);
		expect(result[0]!.id).toBe("overview-characters");
		expect(result[1]!.id).toBe("overview-locations");
	});

	it("returns an empty array when the index has no entries", async () => {
		const app = makeApp();
		const index: CatalogIndex = { version: "1", generated: new Date().toISOString(), entries: [] };

		const svc = new CatalogService(index, {
			app,

			gate: makeGate(),
			store: makeStore().store,
			curatedBasesFolder: "00 Meta/Bases",
		});

		expect(svc.getEntries()).toHaveLength(0);
	});
});
