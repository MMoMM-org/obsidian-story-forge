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
 *   - App / vault (wireMemoryVault: getAbstractFileByPath, read, create, process, createFolder,
 *     fileManager.trashFile) — an in-memory vault on the real Vault API
 *   - DisclosureModal.present() — injectable gate double for consent tests
 *
 * @ref PRD/F4, F7
 * @ref SDD/Runtime View — curated-install algorithm
 * @ref plan/phase-6.md T6.3
 */

import { join, resolve } from "node:path";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { App, TFile, wireMemoryVault } from "../__mocks__/obsidian";
import { BrowseOfficialModal } from "catalog/BrowseOfficialModal";
import { CatalogService } from "catalog/CatalogService";
import { ViewStore } from "store/ViewStore";
import { ConsentGate } from "consent/ConsentGate";
import { DisclosureModal } from "consent/DisclosureModal";
import { installCurated } from "import/ImportFlow";
import { computeChecksum } from "consent/checksum";
import type { BasesCatalogEntry, CatalogEntry, CatalogIndex } from "catalog/catalogTypes";
import type { ViewRecord } from "store/types";
import type { EngineRegistryLike, DvSettingsReader } from "consent/ConsentGate";
import type { ViewImporter } from "import/ViewImporter";
import { inertConsentGateSeams } from "../helpers/viewFixtures";

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

async function makeEntry(overrides: Partial<BasesCatalogEntry> = {}): Promise<BasesCatalogEntry> {
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

// ---------------------------------------------------------------------------
// In-memory vault — the files CatalogService wrote through the Vault API.
// ---------------------------------------------------------------------------

interface InMemoryVault {
	/** path → content of every file in the vault (a rollback trashes it again). */
	written: Map<string, string>;
	app: App;
}

function makeVault(): InMemoryVault {
	const app = new App();
	return { written: wireMemoryVault(app).files, app };
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

/**
 * Wait for the catalog modal's action button. The L10 browser opens with nothing selected (Q3)
 * and draws the one Install / Update button in the detail pane (Q4), so select the first row the
 * way a user would before looking for it.
 */
async function waitForButton(label: string): Promise<HTMLButtonElement> {
	return vi.waitFor(
		() => {
			const row = document.body.querySelector<HTMLElement>(".sf-catalog-row");
			if (row && row.getAttribute("aria-selected") !== "true") row.click();
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
	subscriber: Mock;
}

async function mountHarness(
	entries: CatalogEntry[],
	initialRecords: Record<string, ViewRecord> = {},
): Promise<E2EHarness> {
	const vault = makeVault();
	const { store, raw: storeRaw } = makeStoreHarness(initialRecords);

	// The two classify() seams only matter for records installed before T7.3 (with a
	// `generated` block); a curated install no longer writes one, so they are inert here.
	const gate = new ConsentGate(
		vault.app,
		makeBasesRegistry(),
		makeDvSettings(),
		store,
		async () => null,
		() => ({ tag: "", excludedFolders: [] }),
	);

	const index: CatalogIndex = {
		version: "1",
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
		requestUrlSpy.mockImplementation(() => {
			throw new Error("[catalog-e2e] requestUrl called — must be offline");
		});
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
			// ADR-35: source is the vault path, not the YAML — the double-copy defect.
			expect(rec.source).not.toBe(BASE_YAML);
			expect(rec.source).toContain("overview-characters.base");
			expect(rec.kind).toBe("collection");
			expect(rec.generated).toBeUndefined();
			expect(rec.installedSourceChecksum).toBe(rec.okayed?.checksum);
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
		requestUrlSpy.mockImplementation(() => {
			throw new Error("[catalog-e2e] requestUrl called — must be offline");
		});
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
		requestUrlSpy.mockImplementation(() => {
			throw new Error("[catalog-e2e] requestUrl called — must be offline");
		});
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
		expect(vi.mocked(h.app.vault.create)).toHaveBeenCalledTimes(1);
		expect(vi.mocked(h.app.vault.process)).not.toHaveBeenCalled();
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
		requestUrlSpy.mockImplementation(() => {
			throw new Error("[catalog-e2e] requestUrl called — must be offline");
		});
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
			kind: "view",
			surfaces: { anvil: false, workbench: false },
		};

		const h = await mountHarness([entry], { "existing-id": staleRecord });
		h.modal.open();

		expect(await waitForButton("Update")).not.toBeNull();
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

		// The duplicate check (T4.5, since b6d387c) matches on catalogId ===
		// entry.id paired with okayed.checksum === entry.checksum — NOT on
		// source equality (see CatalogService._installBasesEntry). A stale
		// record with the same catalogId but an outdated okayed.checksum must
		// be updated (in place, since T7.2) rather than being reported as an
		// already-installed duplicate, which is what makes "Update" work.
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
			kind: "view",
			surfaces: { anvil: false, workbench: false },
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
			kind: "view",
			surfaces: { anvil: false, workbench: false },
		};

		const h = await mountHarness([entry], { "existing-id": staleRecord });
		h.modal.open();

		const updateBtn = await waitForButton("Update");
		updateBtn.click();

		await vi.waitFor(() => {
			// A new record must be in the store.
			const allRecords = Object.values(h.storeRaw());
			// T7.2: the stale record is replaced in place under its own id.
			expect(Object.keys(h.storeRaw())).toEqual(["existing-id"]);
			const updatedRec = allRecords.find(
				(r) => r.okayed?.checksum === newChecksum && r.catalogId === "overview-characters",
			);
			expect(updatedRec).not.toBeUndefined();
			expect(updatedRec!.engine).toBe("bases");
			// ADR-35: source is the vault path, not the YAML.
			expect(updatedRec!.source).not.toBe(newSource);
			expect(updatedRec!.source).toContain("overview-characters.base");
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
			kind: "view",
			surfaces: { anvil: false, workbench: false },
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
//
//    DataviewJS compile-time enforcement note (Req 5):
//      CatalogEntry.engine is typed "bases"-only and CatalogService carries an
//      exhaustive `never` guard — no DataviewJS CatalogEntry can be constructed
//      at compile time, so the catalog never reaches a gate-less path for
//      dataviewjs. The "decline → nothing written" behavior at the gated layer
//      is the real regression risk. This suite asserts:
//        (a) bases installs bypass the modal entirely (no DisclosureModal.present call),
//        (b) ConsentGate.evaluate() returns "consented" for a freshly-installed
//            bases record (the joined path across CatalogService + ConsentGate),
//        (c) ConsentGate.evaluate() returns "drift" when the stored checksum is stale.
//      The actual "decline → nothing written" assertion for the gated-engine path
//      lives in Suite 7 below (drives real ConsentGate.requestConsentForDef +
//      installCurated with a DataviewJS ViewDefinition and a declined modal).
// ===========================================================================

describe("E2E T6.3.5 — bases entry bypasses DisclosureModal; ConsentGate confirms consented state", () => {
	afterEach(() => {
		document.body.innerHTML = "";
		vi.restoreAllMocks(); // restore prototype spies (DisclosureModal.present) before clearAllMocks
		vi.clearAllMocks();
		fetchSpy.mockRejectedValue(
			new Error("[catalog-e2e] fetch called — must be offline"),
		);
		requestUrlSpy.mockImplementation(() => {
			throw new Error("[catalog-e2e] requestUrl called — must be offline");
		});
	});

	it("install succeeds for a bases entry without opening any consent modal", async () => {
		// Spy on DisclosureModal.present — it must NOT be called for a bases entry.
		// If the gate opened a modal, present() would hang (no button in DOM to click).
		// Install completing (not hanging) AND present spy not called proves no modal.
		const presentSpy = vi.spyOn(DisclosureModal.prototype, "present").mockResolvedValue(false);
		const entry = await makeEntry({ id: "overview-characters", source: BASE_YAML });
		const h = await mountHarness([entry]);

		const result = await h.service.install(entry.id);

		expect(result.ok).toBe(true);
		expect(presentSpy).not.toHaveBeenCalled();
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

		const staleRecord: ViewRecord = {
			provenance: "curated",
			enabled: true,
			okayed: { version: 1, checksum: "sha256:" + "old".padEnd(64, "0") },
			source: newSource, // same source but okayed.checksum differs
			engine: "bases",
			command: false,
			kind: "view",
			surfaces: { anvil: false, workbench: false },
		};

		const vault = makeVault();
		const { store } = makeStoreHarness({ "stale-id": staleRecord });
		const gate = new ConsentGate(vault.app, makeBasesRegistry(), makeDvSettings(), store, ...inertConsentGateSeams());

		const decision = await gate.evaluate(staleRecord);

		// ConsentGate._evaluateBasesRecord: if okayed.checksum !== computeChecksum(source) → drift.
		expect(decision.status).toBe("drift");
	});

	it("committed real-world .base sources: every entry.engine is 'bases' (real-world manifestation of the bases-only guard)", async () => {
		// Run the SAME build pipeline the catalog:build command drives, over
		// committed .base sources, entirely in-memory (no dist/ dependency).
		// catalog/ no longer ships .base files (moved to the test vault as an
		// alternate Bases view, see docs/XDD/specs/008-codex-surface, Phase 3);
		// this points at the test vault's Bases folder, which still holds
		// committed, real-world .base sources.
		//
		// Why this matters: CatalogService has an exhaustive `never` guard — any
		// future engine variant must be handled at compile time before it reaches
		// production. The type system enforces it at compile time; this test enforces
		// the same invariant at runtime against the real committed source files.
		//
		// The behavioral "decline → nothing written" for the gated-engine path is
		// asserted in Suite 7 against the real ConsentGate + installCurated path.
		// The unit-level proof lives in T4.3: ImportFlow.test.ts
		// "dataviewjs: declined consent (null) writes NOTHING" (line ~201).
		const mod = await import("../../scripts/build-catalog.mjs");
		const buildCatalog = mod.buildCatalog as (opts: {
			catalogDir: string;
			outDir: string;
		}) => Promise<CatalogIndex>;

		const catalogDir = resolve(__dirname, "../../test/StoryForge/00 Meta/Bases");
		const outDir = join(tmpdir(), `sf-e2e-bases-guard-${Date.now()}`);
		mkdirSync(outDir, { recursive: true });
		try {
			const index = await buildCatalog({ catalogDir, outDir });
			expect(index.entries.length).toBeGreaterThan(0);
			expect(index.entries.every((e: CatalogEntry) => e.engine === "bases")).toBe(true);
		} finally {
			rmSync(outDir, { recursive: true, force: true });
		}
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
		requestUrlSpy.mockImplementation(() => {
			throw new Error("[catalog-e2e] requestUrl called — must be offline");
		});
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
			kind: "view",
			surfaces: { anvil: false, workbench: false },
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

// ===========================================================================
// 7. CONSENT-DECLINE CONTRACT — "decline → nothing written" (Req 5)
//
//    WHY THIS LAYER: CatalogEntry.engine is "bases"-only at compile time, so
//    CatalogService never reaches ConsentGate for any install. The decline
//    behavior is enforced by the gate mechanism itself (installCurated +
//    ConsentGate.requestConsentForDef). This suite exercises that contract at
//    the real gate layer — the same mechanism the catalog would use for any
//    future gated engine — using:
//      - REAL ConsentGate (requestConsentForDef path)
//      - REAL ViewStore (in-memory port)
//      - REAL installCurated (ImportFlow — the gated-engine install path)
//      - DisclosureModal.present() stubbed to decline (return false)
//      - A DataviewJS ViewDefinition with vault content wired via App mock
//
//    The unit-level proof for installCurated itself lives in T4.3:
//    test/import/ImportFlow.test.ts "dataviewjs: declined consent (null) writes
//    NOTHING". This suite is the E2E assertion at the integration boundary.
// ===========================================================================

const DVJS_BODY = "dv.paragraph('hello')\n";
const DVJS_FENCED_CONTENT = "---\nsf-version: 1\nsf-name: Fancy View\n---\n\n```dataviewjs\n" + DVJS_BODY + "```\n";
const DECLINED_DEF = {
	sourcePath: "views/fancy-view.md",
	engine: "dataviewjs" as const,
	version: 1,
	name: "Fancy View",
	command: false,
	querySource: DVJS_BODY,
	checksum: `sha256:${"a".repeat(64)}` as const,
};

/**
 * Wire an App mock so vault.read returns fenced content for the given path.
 *
 * getAbstractFileByPath returns a real TFile instance — readFencedBlock uses
 * `instanceof TFile` to guard against folders; a plain object cast fails that check.
 */
function makeAppWithVaultContent(sourcePath: string, content: string): App {
	const app = new App();

	vi.mocked(app.vault.read).mockResolvedValue(content);

	const mockFile = new TFile();
	mockFile.path = sourcePath;
	mockFile.name = "fancy-view.md";
	mockFile.basename = "fancy-view";
	vi.mocked(app.vault.getAbstractFileByPath).mockReturnValue(mockFile);

	return app;
}

interface DeclinedGateHarness {
	app: App;
	store: ViewStore;
	storeRaw: () => Record<string, ViewRecord>;
	gate: ConsentGate;
	/** importToStore spy — asserts it was never called on decline. */
	importToStore: Mock;
	importer: ViewImporter;
	/** The DisclosureModal.present spy (returns false). */
	presentSpy: ReturnType<typeof vi.spyOn>;
}

/**
 * Build a harness for Suite 7: real ConsentGate wired to a vault that returns
 * the DVJS fenced content, DisclosureModal.present() stubbed to decline, and
 * an importToStore spy for asserting no-write.
 */
function makeDeclinedGateHarness(): DeclinedGateHarness {
	const presentSpy = vi.spyOn(DisclosureModal.prototype, "present").mockResolvedValue(false);
	const app = makeAppWithVaultContent(DECLINED_DEF.sourcePath, DVJS_FENCED_CONTENT);
	const { store, raw: storeRaw } = makeStoreHarness();
	const gate = new ConsentGate(app, makeBasesRegistry(), makeDvSettings(), store, ...inertConsentGateSeams());
	const importToStore = vi.fn(async () => "new-id");
	const importer: ViewImporter = { importToStore } as unknown as ViewImporter;
	return { app, store, storeRaw, gate, importToStore, importer, presentSpy };
}

describe("E2E T6.3.7 — consent-decline contract: decline → nothing written (Req 5)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		fetchSpy.mockRejectedValue(
			new Error("[catalog-e2e] fetch called — must be offline"),
		);
		requestUrlSpy.mockImplementation(() => {
			throw new Error("[catalog-e2e] requestUrl called — must be offline");
		});
	});

	afterEach(() => {
		document.body.innerHTML = "";
		vi.restoreAllMocks();
	});

	it("ConsentGate.requestConsentForDef: decline returns null — no store write", async () => {
		// Real ConsentGate with DisclosureModal.present() returning false (decline).
		const { gate, store } = makeDeclinedGateHarness();

		const result = await gate.requestConsentForDef(DECLINED_DEF);

		// Declined gate must return null — the caller commits nothing.
		expect(result).toBeNull();
		// Verify at the store level — no record was committed.
		const views = await store.getViews();
		expect(Object.keys(views).length).toBe(0);
	});

	it("installCurated with dataviewjs + declined gate writes NOTHING to the store", async () => {
		// Drive real ConsentGate.requestConsentForDef with a declined DisclosureModal.
		// installCurated (ImportFlow) checks the return and aborts with no write
		// when the gate returns null.
		const { app, gate, importToStore, importer, storeRaw } = makeDeclinedGateHarness();

		await installCurated({ app, importer, gate }, DECLINED_DEF);

		// importToStore must NOT have been called — decline aborts before any write.
		expect(importToStore).not.toHaveBeenCalled();
		// Store has no records (double-check via the port).
		expect(Object.keys(storeRaw()).length).toBe(0);
	});

	it("installCurated with dataviewjs + declined gate does NOT call vault.write", async () => {
		const { app, gate, importer } = makeDeclinedGateHarness();

		await installCurated({ app, importer, gate }, DECLINED_DEF);

		// Nothing materialised: no vault write, through the Vault API or the adapter.
		expect(vi.mocked(app.vault.create)).not.toHaveBeenCalled();
		expect(vi.mocked(app.vault.process)).not.toHaveBeenCalled();
		expect(vi.mocked(app.vault.adapter.write)).not.toHaveBeenCalled();
	});

	it("DisclosureModal.present was invoked (consent WAS requested, then declined)", async () => {
		// This asserts the gate was actually exercised — not bypassed silently.
		// A decline that silently bypassed the modal would NOT satisfy Req 5.
		const { gate, presentSpy } = makeDeclinedGateHarness();

		await gate.requestConsentForDef(DECLINED_DEF);

		// Modal was opened and present() was called — then declined.
		expect(presentSpy).toHaveBeenCalledTimes(1);
	});
});
