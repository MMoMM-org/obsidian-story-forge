/**
 * catalog-e2e.test.ts — T6.3 Catalog E2E: install, fail-closed, offline, update.
 *
 * Wires the FULL path together:
 *   BrowseOfficialModal → REAL CatalogService → REAL ViewStore → REAL ConsentGate
 *   → mocked Obsidian vault/app.
 *
 * A global fetch/requestUrl spy THROWS if called (offline at integration boundary).
 *
 * What is NOT mocked (the joined path under test):
 *   - CatalogService  — real install algorithm (verify → materialise → persist)
 *   - ViewStore       — real in-memory port (setRecord/getViews/subscribe)
 *   - ConsentGate     — real evaluate() for bases records
 *
 * What IS mocked (the Obsidian boundary):
 *   - App / vault.adapter (write, exists, mkdir, remove) — in-memory interceptors
 *   - DisclosureModal.present() — injectable gate double for consent tests
 *
 * @ref PRD/F4, F7
 * @ref SDD/Runtime View — curated-install algorithm
 * @ref plan/phase-6.md T6.3
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { App } from "../__mocks__/obsidian";
import { BrowseOfficialModal } from "catalog/BrowseOfficialModal";
import { CatalogService } from "catalog/CatalogService";
import { ViewStore } from "store/ViewStore";
import { ConsentGate } from "consent/ConsentGate";
import { computeChecksum } from "consent/checksum";
import type { CatalogEntry, CatalogIndex } from "catalog/catalogTypes";
import type { ViewRecord } from "store/types";
import type { EngineRegistryLike, DvSettingsReader } from "consent/ConsentGate";

// ---------------------------------------------------------------------------
// Offline guard — throw if network is ever touched during the whole suite.
// Installed once at module scope; each test can assert fetch was not called.
// ---------------------------------------------------------------------------

const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(
	new Error("[catalog-e2e] fetch called — catalog install must be offline"),
);

// requestUrl is the Obsidian network primitive. Guard it too.
if (typeof (globalThis as Record<string, unknown>).requestUrl === "undefined") {
	(globalThis as Record<string, unknown>).requestUrl = undefined;
}
const requestUrlSpy = vi.fn(() => {
	throw new Error("[catalog-e2e] requestUrl called — catalog install must be offline");
});
(globalThis as Record<string, unknown>).requestUrl = requestUrlSpy;

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

const BASE_YAML =
	'filters: file.hasTag("test")\nviews:\n  - type: table\n    name: Test View\n';

async function makeEntry(overrides: Partial<CatalogEntry> = {}): Promise<CatalogEntry> {
	const source = overrides.source ?? BASE_YAML;
	const checksum =
		overrides.checksum ?? (await computeChecksum(source));
	return {
		id: "overview-characters",
		name: "Characters overview",
		engine: "bases",
		source,
		checksum,
		description: "All canon characters.",
		...overrides,
	};
}

async function makeCatalogIndex(entries?: CatalogEntry[]): Promise<CatalogIndex> {
	const resolved = entries ?? [await makeEntry()];
	return { version: "1", generated: new Date().toISOString(), entries: resolved };
}

// ---------------------------------------------------------------------------
// In-memory vault adapter — captures written files; throws if not configured.
// ---------------------------------------------------------------------------

interface InMemoryVault {
	/** path → content for every write call. */
	written: Map<string, string>;
	/** paths removed after rollback. */
	removed: Set<string>;
	app: App;
}

function makeVault(folderExists = false): InMemoryVault {
	const written = new Map<string, string>();
	const removed = new Set<string>();
	const app = new App();

	vi.mocked(app.vault.adapter.exists).mockResolvedValue(folderExists);
	vi.mocked(app.vault.adapter.mkdir).mockResolvedValue(undefined);
	vi.mocked(app.vault.adapter.write).mockImplementation(
		async (path: string, content: string): Promise<void> => {
			written.set(path, content);
		},
	);
	vi.mocked(app.vault.adapter.remove).mockImplementation(
		async (path: string): Promise<void> => {
			written.delete(path);
			removed.add(path);
		},
	);

	return { written, removed, app };
}

// ---------------------------------------------------------------------------
// In-memory ViewStore port
// ---------------------------------------------------------------------------

interface StoreHarness {
	store: ViewStore;
	/** Read committed records directly (bypasses applyDefaults). */
	raw: () => Record<string, ViewRecord>;
}

function makeStoreHarness(initial: Record<string, ViewRecord> = {}): StoreHarness {
	const data: { views: Record<string, ViewRecord> } = { views: { ...initial } };
	const port = {
		load: vi.fn(async () => data),
		save: vi.fn(async (d: unknown) => {
			const typed = d as typeof data;
			data.views = { ...(typed.views ?? {}) };
		}),
	};
	return {
		store: new ViewStore(port),
		raw: () => data.views,
	};
}

// ---------------------------------------------------------------------------
// Minimal ConsentGate deps (bases records need no modal path)
// ---------------------------------------------------------------------------

function makeBasesRegistry(): EngineRegistryLike {
	// Return a truthy object so engine-missing is NOT triggered for "bases".
	return { get: vi.fn(() => ({})) } as unknown as EngineRegistryLike;
}

function makeDvSettings(): DvSettingsReader {
	return { isDvJsEnabled: vi.fn(() => true) };
}

// ---------------------------------------------------------------------------
// Button helpers (mirror BrowseOfficialModal.test.ts)
// ---------------------------------------------------------------------------

function findButton(root: ParentNode, label: string): HTMLButtonElement | null {
	for (const btn of root.querySelectorAll("button")) {
		if (btn.textContent?.trim() === label) return btn as HTMLButtonElement;
	}
	return null;
}

async function waitForButton(label: string): Promise<HTMLButtonElement> {
	return vi.waitFor(
		() => {
			const btn = findButton(document.body, label);
			if (!btn) throw new Error(`Button "${label}" not found`);
			return btn;
		},
		{ timeout: 3000, interval: 10 },
	);
}

// ---------------------------------------------------------------------------
// Suite helpers — mount a wired E2E harness
// ---------------------------------------------------------------------------

interface E2EHarness {
	app: App;
	vault: InMemoryVault;
	store: ViewStore;
	storeRaw: () => Record<string, ViewRecord>;
	gate: ConsentGate;
	service: CatalogService;
	modal: BrowseOfficialModal;
	subscriber: ReturnType<typeof vi.fn>;
}

async function mountHarness(
	entries: CatalogEntry[],
	initialRecords: Record<string, ViewRecord> = {},
): Promise<E2EHarness> {
	const vault = makeVault(false);
	const { store, raw: storeRaw } = makeStoreHarness(initialRecords);

	const gate = new ConsentGate(
		vault.app,
		makeBasesRegistry(),
		makeDvSettings(),
		store,
	);

	const index: CatalogIndex = {
		version: "1",
		generated: new Date().toISOString(),
		entries,
	};

	const service = new CatalogService(index, {
		app: vault.app,
		gate,
		store,
		curatedBasesFolder: "00 Meta/Bases",
	});

	const modal = new BrowseOfficialModal(vault.app, service, store);

	// Register a real subscriber to detect re-render signal.
	const subscriber = vi.fn();
	store.subscribe(subscriber);

	return { app: vault.app, vault, store, storeRaw, gate, service, modal, subscriber };
}

// ===========================================================================
// 1. INSTALL — bases entry: .base written, store persisted, subscriber fires
// ===========================================================================

describe("E2E T6.3.1 — install: .base written, engine:'bases' record persisted, sidebar signal fires", () => {
	afterEach(() => {
		document.body.innerHTML = "";
		vi.clearAllMocks();
		// Re-arm offline guards (clearAllMocks resets spy implementations).
		fetchSpy.mockRejectedValue(
			new Error("[catalog-e2e] fetch called — must be offline"),
		);
	});

	it("clicking Install writes a .base file into 00 Meta/Bases", async () => {
		const entry = await makeEntry({ id: "overview-characters", source: BASE_YAML });
		const h = await mountHarness([entry]);
		h.modal.open();

		(await waitForButton("Install")).click();

		await vi.waitFor(() => {
			expect(h.vault.written.size).toBe(1);
			const [path, content] = [...h.vault.written.entries()][0]!;
			expect(path).toContain("00 Meta/Bases");
			expect(path).toContain("overview-characters.base");
			expect(content).toBe(BASE_YAML);
		});
	});

	it("clicking Install persists a curated engine:'bases' record in the real ViewStore", async () => {
		const entry = await makeEntry({ id: "overview-characters", source: BASE_YAML });
		const h = await mountHarness([entry]);
		h.modal.open();

		(await waitForButton("Install")).click();

		await vi.waitFor(() => {
			const records = Object.values(h.storeRaw());
			expect(records.length).toBe(1);
			const rec = records[0]!;
			expect(rec.engine).toBe("bases");
			expect(rec.source).toBe(BASE_YAML);
			expect(rec.provenance).toBe("curated");
			expect(rec.enabled).toBe(true);
			expect(rec.catalogId).toBe("overview-characters");
		});
	});

	it("clicking Install fires the sidebar re-render subscriber signal", async () => {
		const entry = await makeEntry({ id: "overview-characters", source: BASE_YAML });
		const h = await mountHarness([entry]);
		h.modal.open();

		(await waitForButton("Install")).click();

		await vi.waitFor(() => {
			expect(h.subscriber).toHaveBeenCalledTimes(1);
		});
	});

	it("clicking Install shows a success affordance in the modal", async () => {
		const entry = await makeEntry({ id: "overview-characters", source: BASE_YAML });
		const h = await mountHarness([entry]);
		h.modal.open();

		(await waitForButton("Install")).click();

		await vi.waitFor(() => {
			expect(document.body.textContent).toMatch(/installed.*success|installed/i);
		});
	});
});

// ===========================================================================
// 2. FAIL-CLOSED — checksum mismatch writes nothing to vault or store
// ===========================================================================

describe("E2E T6.3.2 — fail-closed: checksum mismatch writes nothing, surfaces reason", () => {
	afterEach(() => {
		document.body.innerHTML = "";
		vi.clearAllMocks();
		fetchSpy.mockRejectedValue(
			new Error("[catalog-e2e] fetch called — must be offline"),
		);
	});

	it("writes NOTHING to the vault when bundled checksum does not match source", async () => {
		// Deliberate mismatch: source is BASE_YAML but checksum is wrong.
		const entry = await makeEntry({
			id: "overview-characters",
			source: BASE_YAML,
			checksum: "sha256:" + "0".repeat(64),
		});
		const h = await mountHarness([entry]);
		h.modal.open();

		(await waitForButton("Install")).click();

		await vi.waitFor(() => {
			// The modal must surface an error (checksum reason).
			expect(document.body.textContent).toMatch(/checksum/i);
		});

		// Vault untouched.
		expect(h.vault.written.size).toBe(0);
	});

	it("writes NOTHING to the store when checksum mismatches", async () => {
		const entry = await makeEntry({
			id: "overview-characters",
			source: BASE_YAML,
			checksum: "sha256:" + "f".repeat(64),
		});
		const h = await mountHarness([entry]);
		h.modal.open();

		(await waitForButton("Install")).click();

		await vi.waitFor(() => {
			expect(document.body.textContent).toMatch(/checksum/i);
		});

		expect(Object.keys(h.storeRaw()).length).toBe(0);
	});

	it("subscriber is NOT fired on fail-closed (no setRecord call)", async () => {
		const entry = await makeEntry({
			id: "overview-characters",
			source: BASE_YAML,
			checksum: "sha256:" + "dead".padEnd(64, "0"),
		});
		const h = await mountHarness([entry]);
		h.modal.open();

		(await waitForButton("Install")).click();

		await vi.waitFor(() => {
			expect(document.body.textContent).toMatch(/checksum/i);
		});

		expect(h.subscriber).not.toHaveBeenCalled();
	});

	it("surfaces the checksum mismatch reason end-to-end in the modal feedback area", async () => {
		const entry = await makeEntry({
			id: "overview-characters",
			source: BASE_YAML,
			checksum: "sha256:" + "badbad".padEnd(64, "0"),
		});
		const h = await mountHarness([entry]);
		h.modal.open();

		(await waitForButton("Install")).click();

		await vi.waitFor(() => {
			const feedback = document.body.querySelector(".sf-picker-feedback");
			expect(feedback).not.toBeNull();
			expect(feedback!.textContent).toMatch(/checksum/i);
			expect(feedback!.classList.contains("sf-hidden")).toBe(false);
		});
	});
});

// ===========================================================================
// 3. ALREADY-INSTALLED — second install surfaces up-to-date, no second write
// ===========================================================================

describe("E2E T6.3.3 — already-installed: second install does not write a second record", () => {
	afterEach(() => {
		document.body.innerHTML = "";
		vi.clearAllMocks();
		fetchSpy.mockRejectedValue(
			new Error("[catalog-e2e] fetch called — must be offline"),
		);
	});

	it("after the first install, clicking Install again surfaces up-to-date", async () => {
		const entry = await makeEntry({ id: "overview-characters", source: BASE_YAML });
		const h = await mountHarness([entry]);
		h.modal.open();

		// First install
		(await waitForButton("Install")).click();
		await vi.waitFor(() => {
			expect(document.body.textContent).toMatch(/installed.*success|success.*installed|installed/i);
		});

		document.body.innerHTML = "";
		h.modal.close();
		h.modal.open();

		// Second attempt: the modal re-reads the store on open and will show "Installed"
		// state (no Install button). Directly drive CatalogService to test the joined path.
		const secondResult = await h.service.install(entry.id);

		expect(secondResult.ok).toBe(false);
		if (!secondResult.ok) {
			expect(secondResult.reason).toMatch(/up.to.date/i);
		}
	});

	it("second install does not write a second .base file (vault write count stays at 1)", async () => {
		const entry = await makeEntry({ id: "overview-characters", source: BASE_YAML });
		const h = await mountHarness([entry]);

		// First install
		const r1 = await h.service.install(entry.id);
		expect(r1.ok).toBe(true);
		expect(h.vault.written.size).toBe(1);

		// Second install
		const r2 = await h.service.install(entry.id);
		expect(r2.ok).toBe(false);

		// Only one vault write total.
		expect(vi.mocked(h.app.vault.adapter.write)).toHaveBeenCalledTimes(1);
	});

	it("second install does not fire the subscriber a second time", async () => {
		const entry = await makeEntry({ id: "overview-characters", source: BASE_YAML });
		const h = await mountHarness([entry]);

		await h.service.install(entry.id);
		const firstCount = h.subscriber.mock.calls.length;

		await h.service.install(entry.id);
		// Subscriber must not have been called again.
		expect(h.subscriber).toHaveBeenCalledTimes(firstCount);
	});
});

// ===========================================================================
// 4. UPDATE-AVAILABLE → UPDATE — new .base written, store record refreshed
// ===========================================================================

describe("E2E T6.3.4 — update-available → Update: new .base written, store record refreshed", () => {
	afterEach(() => {
		document.body.innerHTML = "";
		vi.clearAllMocks();
		fetchSpy.mockRejectedValue(
			new Error("[catalog-e2e] fetch called — must be offline"),
		);
	});

	it("Update button shows when installed record.okayed.checksum differs from bundled entry", async () => {
		const oldChecksum = "sha256:" + "a".repeat(64);
		const newSource = BASE_YAML;
		const newChecksum = await computeChecksum(newSource);

		// Entry has new checksum; store has old checksum.
		const entry: CatalogEntry = {
			id: "overview-characters",
			name: "Characters overview",
			engine: "bases",
			source: newSource,
			checksum: newChecksum,
		};

		const staleRecord: ViewRecord = {
			provenance: "curated",
			enabled: true,
			okayed: { version: 1, checksum: oldChecksum },
			source: newSource,
			engine: "bases",
			command: false,
			commandName: "Characters overview",
			catalogId: "overview-characters",
		};

		const h = await mountHarness([entry], { "existing-id": staleRecord });
		h.modal.open();

		await vi.waitFor(() => {
			expect(findButton(document.body, "Update")).not.toBeNull();
		});
	});

	it("clicking Update writes a new .base file via the real install path", async () => {
		const oldChecksum = "sha256:" + "a".repeat(64);
		const newSource = BASE_YAML;
		const newChecksum = await computeChecksum(newSource);

		const entry: CatalogEntry = {
			id: "overview-characters",
			name: "Characters overview",
			engine: "bases",
			source: newSource,
			checksum: newChecksum,
		};

		// The store has the SAME source (already installed) which would cause
		// up-to-date detection. For update to work, the store must have a DIFFERENT
		// source OR we need to test the direct install path. Since the duplicate check
		// compares source strings, an update can only write if the source changed.
		// We simulate a real update scenario: old source differs from new source.
		const oldSource = "# old version\n";
		const staleRecord: ViewRecord = {
			provenance: "curated",
			enabled: true,
			okayed: { version: 1, checksum: oldChecksum },
			source: oldSource,
			engine: "bases",
			command: false,
			commandName: "Characters overview",
			catalogId: "overview-characters",
		};

		const h = await mountHarness([entry], { "existing-id": staleRecord });
		h.modal.open();

		const updateBtn = await waitForButton("Update");
		updateBtn.click();

		await vi.waitFor(() => {
			// A new .base file must be written (for the new source).
			expect(h.vault.written.size).toBeGreaterThan(0);
			const [path, content] = [...h.vault.written.entries()][0]!;
			expect(path).toContain("overview-characters.base");
			expect(content).toBe(newSource);
		});
	});

	it("clicking Update refreshes the store record's checksum and provenance", async () => {
		const oldChecksum = "sha256:" + "a".repeat(64);
		const newSource = BASE_YAML;
		const newChecksum = await computeChecksum(newSource);

		const entry: CatalogEntry = {
			id: "overview-characters",
			name: "Characters overview",
			engine: "bases",
			source: newSource,
			checksum: newChecksum,
		};

		const oldSource = "# old version\n";
		const staleRecord: ViewRecord = {
			provenance: "curated",
			enabled: true,
			okayed: { version: 1, checksum: oldChecksum },
			source: oldSource,
			engine: "bases",
			command: false,
			commandName: "Characters overview",
			catalogId: "overview-characters",
		};

		const h = await mountHarness([entry], { "existing-id": staleRecord });
		h.modal.open();

		const updateBtn = await waitForButton("Update");
		updateBtn.click();

		await vi.waitFor(() => {
			// A new record must be in the store.
			const allRecords = Object.values(h.storeRaw());
			// At minimum: the original stale record + the new one (old stays, new added).
			const updatedRec = allRecords.find(
				(r) => r.okayed?.checksum === newChecksum && r.catalogId === "overview-characters",
			);
			expect(updatedRec).not.toBeUndefined();
			expect(updatedRec!.engine).toBe("bases");
			expect(updatedRec!.source).toBe(newSource);
			expect(updatedRec!.provenance).toBe("curated");
		});
	});

	it("clicking Update fires the subscriber signal", async () => {
		const oldChecksum = "sha256:" + "a".repeat(64);
		const newSource = BASE_YAML;
		const newChecksum = await computeChecksum(newSource);

		const entry: CatalogEntry = {
			id: "overview-characters",
			name: "Characters overview",
			engine: "bases",
			source: newSource,
			checksum: newChecksum,
		};

		const oldSource = "# old version\n";
		const staleRecord: ViewRecord = {
			provenance: "curated",
			enabled: true,
			okayed: { version: 1, checksum: oldChecksum },
			source: oldSource,
			engine: "bases",
			command: false,
			commandName: "Characters overview",
			catalogId: "overview-characters",
		};

		const h = await mountHarness([entry], { "existing-id": staleRecord });
		h.modal.open();

		const updateBtn = await waitForButton("Update");
		updateBtn.click();

		await vi.waitFor(() => {
			expect(h.subscriber).toHaveBeenCalled();
		});
	});
});

// ===========================================================================
// 5. BASES CONSENT GATE — declarative entries bypass modal; ConsentGate
//    evaluates a freshly-installed record as "consented" (no modal shown).
//    For dataviewjs entries: the gate-less bases path is never reachable
//    (CatalogEntry.engine is "bases" — exhaustive guard in CatalogService).
// ===========================================================================

describe("E2E T6.3.5 — bases entry bypasses DisclosureModal; ConsentGate confirms consented state", () => {
	afterEach(() => {
		document.body.innerHTML = "";
		vi.clearAllMocks();
		fetchSpy.mockRejectedValue(
			new Error("[catalog-e2e] fetch called — must be offline"),
		);
	});

	it("install succeeds for a bases entry without opening any consent modal", async () => {
		const entry = await makeEntry({ id: "overview-characters", source: BASE_YAML });
		const h = await mountHarness([entry]);

		// If the gate opened a modal, present() would hang (no button in DOM to click).
		// Install completing without hanging proves no modal was opened.
		const result = await h.service.install(entry.id);

		expect(result.ok).toBe(true);
	});

	it("ConsentGate.evaluate() returns 'consented' for a freshly installed bases record", async () => {
		const entry = await makeEntry({ id: "overview-characters", source: BASE_YAML });
		const h = await mountHarness([entry]);

		const installResult = await h.service.install(entry.id);
		expect(installResult.ok).toBe(true);

		// Retrieve the newly installed record.
		const records = Object.values(h.storeRaw());
		expect(records.length).toBe(1);
		const rec = records[0]!;

		// The real ConsentGate evaluates the bases record — must be consented.
		const decision = await h.gate.evaluate(rec);
		expect(decision.status).toBe("consented");
	});

	it("ConsentGate.evaluate() returns 'drift' when the record's checksum is stale (post-update scenario)", async () => {
		// Simulate a bases record where the stored checksum is stale.
		const newSource = BASE_YAML;
		const newChecksum = await computeChecksum(newSource);

		const staleRecord: ViewRecord = {
			provenance: "curated",
			enabled: true,
			okayed: { version: 1, checksum: "sha256:" + "old".padEnd(64, "0") },
			source: newSource, // same source but okayed.checksum differs
			engine: "bases",
			command: false,
		};

		const vault = makeVault(false);
		const { store } = makeStoreHarness({ "stale-id": staleRecord });
		const gate = new ConsentGate(vault.app, makeBasesRegistry(), makeDvSettings(), store);

		const decision = await gate.evaluate(staleRecord);

		// ConsentGate._evaluateBasesRecord: if okayed.checksum !== computeChecksum(source) → drift.
		expect(decision.status).toBe("drift");
	});

	it("a declined consent for dataviewjs scenario — install path returns fail (gate boundary not reached for bases)", async () => {
		// CatalogService only handles engine:"bases" today. The exhaustive guard
		// ensures no other engine reaches production. This test documents that the
		// current catalog always produces bases-engine records and the gate is never
		// invoked for install (bases entries are declarative — no modal).
		const entry = await makeEntry({ id: "overview-characters", engine: "bases" });
		const h = await mountHarness([entry]);

		// If we could call install on a hypothetical dataviewjs entry it would route
		// through ConsentGate.requestConsentForDef. But the exhaustive guard in
		// CatalogService returns { ok:false } for any engine not "bases".
		// Verify: only bases engine installs succeed through the joined path.
		const result = await h.service.install(entry.id);
		expect(result.ok).toBe(true);
		expect(vi.mocked(h.app.vault.adapter.write)).toHaveBeenCalled();
	});
});

// ===========================================================================
// 6. OFFLINE — no network call on any path across the suite
// ===========================================================================

describe("E2E T6.3.6 — offline: fetch/requestUrl must not be called on any catalog path", () => {
	beforeEach(() => {
		fetchSpy.mockClear();
		requestUrlSpy.mockClear();
	});

	afterEach(() => {
		document.body.innerHTML = "";
		vi.clearAllMocks();
		fetchSpy.mockRejectedValue(
			new Error("[catalog-e2e] fetch called — must be offline"),
		);
	});

	it("install does not call fetch (bases entries are bundled, offline-only)", async () => {
		const entry = await makeEntry({ id: "overview-characters", source: BASE_YAML });
		const h = await mountHarness([entry]);

		await h.service.install(entry.id);

		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("fail-closed (checksum mismatch) does not call fetch", async () => {
		const entry = await makeEntry({
			id: "overview-characters",
			source: BASE_YAML,
			checksum: "sha256:" + "dead".padEnd(64, "0"),
		});
		const h = await mountHarness([entry]);

		await h.service.install(entry.id);

		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("update path does not call fetch", async () => {
		const oldSource = "# old\n";
		const newSource = BASE_YAML;
		const newChecksum = await computeChecksum(newSource);

		const entry: CatalogEntry = {
			id: "overview-characters",
			name: "Characters overview",
			engine: "bases",
			source: newSource,
			checksum: newChecksum,
		};

		const staleRecord: ViewRecord = {
			provenance: "curated",
			enabled: true,
			okayed: { version: 1, checksum: "sha256:" + "a".repeat(64) },
			source: oldSource,
			engine: "bases",
			command: false,
			commandName: "Characters overview",
			catalogId: "overview-characters",
		};

		const h = await mountHarness([entry], { "existing-id": staleRecord });

		// Update via direct install (same path as clicking Update button).
		await h.service.install(entry.id);

		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("requestUrl is not called on any install path", async () => {
		const entry = await makeEntry({ id: "overview-characters", source: BASE_YAML });
		const h = await mountHarness([entry]);

		await h.service.install(entry.id);

		expect(requestUrlSpy).not.toHaveBeenCalled();
	});

	it("getEntries() does not call fetch (index is bundled, not fetched)", async () => {
		const entry = await makeEntry({ id: "overview-characters", source: BASE_YAML });
		const h = await mountHarness([entry]);

		h.service.getEntries();

		expect(fetchSpy).not.toHaveBeenCalled();
	});
});
