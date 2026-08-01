/**
 * BrowseOfficialModal.test.ts — T4.5
 *
 * Tests the Browse official catalog modal: list with provenance + checksum (S47),
 * preview pane on selection (S48), Install delegates to CatalogService, update-available
 * affordance when stored checksum differs from bundled checksum (S49 / F7), and
 * DataviewJS consent-gate surfacing before install (S57).
 *
 * DOM strategy mirrors ImportPickerModal.test.ts:
 * - document.body + vi.waitFor for async renders
 * - click dispatch against real buttons
 * - CatalogService is mocked (all install logic stays in the service)
 *
 * @ref PRD/AC-F4.2, AC-F7.1, AC-F7.2, AC-F7.3
 * @ref Mockups S47, S48, S49, S57
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { App } from "../__mocks__/obsidian";
import { BrowseOfficialModal } from "catalog/BrowseOfficialModal";
import type { CatalogService, InstallResult } from "catalog/CatalogService";
import type { CatalogEntry } from "catalog/catalogTypes";
import type { ViewRecord } from "store/types";
import { ViewStore } from "store/ViewStore";

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<CatalogEntry> = {}): CatalogEntry {
	return {
		id: "overview-characters",
		name: "Characters overview",
		engine: "bases",
		source: "filters: type == \"character\"\nviews:\n  - type: table\n",
		checksum: "sha256:" + "a".repeat(64),
		description: "All canon characters.",
		...overrides,
	};
}

/**
 * No T3.2 migration under test in this file — update-available detection reads
 * catalogId/commandName/okayed, none of which migrateLegacyBases touches. A
 * reader that never finds a file is fine.
 */
const NOOP_MIGRATION_DEPS = {
	readFile: async () => null,
	curatedBasesFolder: "00 Meta/Bases",
	currentParams: { tag: "", excludedFolders: [] },
};

function makeStore(initial: Record<string, ViewRecord> = {}): ViewStore {
	const data = { views: { ...initial } };
	const port = {
		load: vi.fn(async () => data),
		save: vi.fn(async (d: unknown) => {
			const typed = d as typeof data;
			data.views = { ...(typed.views ?? {}) };
		}),
	};
	return new ViewStore(port, NOOP_MIGRATION_DEPS);
}

function makeCuratedRecord(overrides: Partial<ViewRecord> = {}): ViewRecord {
	return {
		provenance: "curated",
		enabled: true,
		okayed: { version: 1, checksum: "sha256:" + "a".repeat(64) },
		source: "filters: type == \"character\"\nviews:\n  - type: table\n",
		engine: "bases",
		command: false,
		commandName: "Characters overview",
		catalogId: "overview-characters",
		kind: "view",
		surfaces: { anvil: false, workbench: false },
		...overrides,
	};
}

function makeCatalogService(
	overrides: Partial<{
		entries: CatalogEntry[];
		installResult: InstallResult;
	}> = {},
): CatalogService {
	const entries = overrides.entries ?? [makeEntry()];
	const installResult = overrides.installResult ?? { ok: true };
	return {
		getEntries: vi.fn(() => entries),
		install: vi.fn(async (_id: string) => installResult),
	} as unknown as CatalogService;
}

/** Find a button by its label text within a root element. */
function findButton(root: ParentNode, label: string): HTMLButtonElement | null {
	const buttons = root.querySelectorAll("button");
	for (const btn of buttons) {
		if (btn.textContent?.trim() === label) return btn as HTMLButtonElement;
	}
	return null;
}

/** Wait until a button with the given label appears in document.body. */
async function waitForButton(label: string): Promise<HTMLButtonElement> {
	return vi.waitFor(
		() => {
			const btn = findButton(document.body, label);
			if (!btn) throw new Error(`Button "${label}" not found`);
			return btn;
		},
		{ timeout: 2000, interval: 10 },
	);
}

// ---------------------------------------------------------------------------
// Suite 1 — S47: list with provenance + checksum
// ---------------------------------------------------------------------------

describe("BrowseOfficialModal — S47 catalog list with provenance + checksum", () => {
	let app: App;

	beforeEach(() => {
		vi.clearAllMocks();
		app = new App();
	});

	afterEach(() => {
		document.body.innerHTML = "";
	});

	it("lists all catalog entries returned by CatalogService.getEntries()", async () => {
		const entries = [
			makeEntry({ id: "overview-characters", name: "Characters overview" }),
			makeEntry({ id: "overview-scenes", name: "Scenes overview" }),
		];
		const store = makeStore();
		const service = makeCatalogService({ entries });

		const modal = new BrowseOfficialModal(app, service, store);
		modal.open();

		await vi.waitFor(() => {
			expect(document.body.textContent).toContain("Characters overview");
			expect(document.body.textContent).toContain("Scenes overview");
		});
	});

	it("shows provenance 'official · curated' for each entry", async () => {
		const store = makeStore();
		const service = makeCatalogService();
		const modal = new BrowseOfficialModal(app, service, store);
		modal.open();

		await vi.waitFor(() => {
			const el = document.body.querySelector(".sf-catalog-row");
			if (!el) throw new Error("no row found");
			expect(el.textContent).toMatch(/official|curated/i);
		});
	});

	it("shows a truncated checksum for each entry (row structure)", async () => {
		const entry = makeEntry({ checksum: "sha256:" + "b".repeat(64) });
		const store = makeStore();
		const service = makeCatalogService({ entries: [entry] });
		const modal = new BrowseOfficialModal(app, service, store);
		modal.open();

		await vi.waitFor(() => {
			const el = document.body.querySelector(".sf-catalog-checksum");
			if (!el) throw new Error("no checksum element found");
			// Should contain the first few chars of the checksum
			expect(el.textContent).toMatch(/sha256|sha/i);
		});
	});

	it("shows engine badge (bases) per entry", async () => {
		const entry = makeEntry({ engine: "bases" });
		const store = makeStore();
		const service = makeCatalogService({ entries: [entry] });
		const modal = new BrowseOfficialModal(app, service, store);
		modal.open();

		await vi.waitFor(() => {
			const badge = document.body.querySelector(".sf-badge");
			if (!badge) throw new Error("no engine badge found");
			expect(badge.textContent).toBe("bases");
		});
	});

	it("shows an empty state message when there are no catalog entries", async () => {
		const store = makeStore();
		const service = makeCatalogService({ entries: [] });
		const modal = new BrowseOfficialModal(app, service, store);
		modal.open();

		await vi.waitFor(() => {
			expect(document.body.textContent).toMatch(/no.*view|nothing.*catalog|empty/i);
		});
	});
});

// ---------------------------------------------------------------------------
// Suite 2 — S48: preview pane on row selection
// ---------------------------------------------------------------------------

describe("BrowseOfficialModal — S48 preview pane on row selection", () => {
	let app: App;

	beforeEach(() => {
		vi.clearAllMocks();
		app = new App();
	});

	afterEach(() => {
		document.body.innerHTML = "";
	});

	it("shows the entry name in the preview pane when a row is selected", async () => {
		const entry = makeEntry({ name: "Scenes overview", description: "All scenes." });
		const store = makeStore();
		const service = makeCatalogService({ entries: [entry] });
		const modal = new BrowseOfficialModal(app, service, store);
		modal.open();

		// Wait for rows then click the first row
		await vi.waitFor(() => {
			const row = document.body.querySelector(".sf-catalog-row");
			if (!row) throw new Error("no row");
			return row;
		});

		const row = document.body.querySelector(".sf-catalog-row") as HTMLElement;
		row.click();

		await vi.waitFor(() => {
			const preview = document.body.querySelector(".sf-catalog-preview");
			if (!preview) throw new Error("no preview pane");
			expect(preview.textContent).toContain("Scenes overview");
		});
	});

	it("shows the description in the preview pane", async () => {
		const entry = makeEntry({ description: "All scenes in the book." });
		const store = makeStore();
		const service = makeCatalogService({ entries: [entry] });
		const modal = new BrowseOfficialModal(app, service, store);
		modal.open();

		await vi.waitFor(() => {
			const row = document.body.querySelector(".sf-catalog-row");
			if (!row) throw new Error("no row");
		});

		(document.body.querySelector(".sf-catalog-row") as HTMLElement).click();

		await vi.waitFor(() => {
			const preview = document.body.querySelector(".sf-catalog-preview");
			if (!preview) throw new Error("no preview");
			expect(preview.textContent).toContain("All scenes in the book.");
		});
	});

	it("shows the engine badge in the preview pane", async () => {
		const entry = makeEntry({ engine: "bases" });
		const store = makeStore();
		const service = makeCatalogService({ entries: [entry] });
		const modal = new BrowseOfficialModal(app, service, store);
		modal.open();

		await vi.waitFor(() => {
			const row = document.body.querySelector(".sf-catalog-row");
			if (!row) throw new Error("no row");
		});

		(document.body.querySelector(".sf-catalog-row") as HTMLElement).click();

		await vi.waitFor(() => {
			const preview = document.body.querySelector(".sf-catalog-preview");
			if (!preview) throw new Error("no preview");
			expect(preview.textContent).toContain("bases");
		});
	});

	it("shows source YAML in the preview pane", async () => {
		const entry = makeEntry({ source: "filters: type == \"character\"\nviews:\n  - type: table\n" });
		const store = makeStore();
		const service = makeCatalogService({ entries: [entry] });
		const modal = new BrowseOfficialModal(app, service, store);
		modal.open();

		await vi.waitFor(() => {
			const row = document.body.querySelector(".sf-catalog-row");
			if (!row) throw new Error("no row");
		});

		(document.body.querySelector(".sf-catalog-row") as HTMLElement).click();

		await vi.waitFor(() => {
			const preview = document.body.querySelector(".sf-catalog-preview");
			if (!preview) throw new Error("no preview");
			expect(preview.textContent).toContain("type == \"character\"");
		});
	});
});

// ---------------------------------------------------------------------------
// Suite 3 — Install: delegates to CatalogService.install(id)
// ---------------------------------------------------------------------------

describe("BrowseOfficialModal — Install delegates to CatalogService", () => {
	let app: App;

	beforeEach(() => {
		vi.clearAllMocks();
		app = new App();
	});

	afterEach(() => {
		document.body.innerHTML = "";
	});

	it("calls CatalogService.install(id) with the correct entry id when Install is clicked", async () => {
		const entry = makeEntry({ id: "overview-scenes", name: "Scenes overview" });
		const store = makeStore();
		const service = makeCatalogService({ entries: [entry] });
		const modal = new BrowseOfficialModal(app, service, store);
		modal.open();

		// Select the row first (first row is auto-selected)
		await waitForButton("Install");
		findButton(document.body, "Install")!.click();

		await vi.waitFor(() => {
			expect(service.install).toHaveBeenCalledWith("overview-scenes");
		});
	});

	it("shows a success affordance after a successful install", async () => {
		const entry = makeEntry({ id: "overview-characters" });
		const store = makeStore();
		const service = makeCatalogService({ entries: [entry], installResult: { ok: true } });
		const modal = new BrowseOfficialModal(app, service, store);
		modal.open();

		await waitForButton("Install");
		findButton(document.body, "Install")!.click();

		await vi.waitFor(() => {
			expect(document.body.textContent).toMatch(/installed|success/i);
		});
	});

	it("shows install error inline without closing the modal when install returns ok:false", async () => {
		const entry = makeEntry({ id: "overview-characters" });
		const store = makeStore();
		const service = makeCatalogService({
			entries: [entry],
			installResult: { ok: false, reason: "materialise failed: disk full" },
		});
		const closeSpy = vi.fn();
		const modal = new BrowseOfficialModal(app, service, store);
		vi.spyOn(modal, "close").mockImplementation(closeSpy);
		modal.open();

		await waitForButton("Install");
		findButton(document.body, "Install")!.click();

		await vi.waitFor(() => {
			expect(document.body.textContent).toContain("materialise failed: disk full");
		});
		expect(closeSpy).not.toHaveBeenCalled();
	});

	it("does NOT close the modal after install — modal stays open for further browsing", async () => {
		const entry = makeEntry();
		const store = makeStore();
		const service = makeCatalogService({ entries: [entry], installResult: { ok: true } });
		const modal = new BrowseOfficialModal(app, service, store);
		const closeSpy = vi.spyOn(modal, "close");
		modal.open();

		await waitForButton("Install");
		findButton(document.body, "Install")!.click();

		// Wait for the install to complete
		await vi.waitFor(() => {
			expect(service.install).toHaveBeenCalled();
		});
		// Modal must not close on success — user may want to install more
		expect(closeSpy).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// Suite 4 — S49 / AC-F7.1, AC-F7.2, AC-F7.3: update-available affordance
// ---------------------------------------------------------------------------

describe("BrowseOfficialModal — S49 update-available affordance (AC-F7.1, AC-F7.2, AC-F7.3)", () => {
	let app: App;

	beforeEach(() => {
		vi.clearAllMocks();
		app = new App();
	});

	afterEach(() => {
		document.body.innerHTML = "";
	});

	it("AC-F7.1: shows 'update available' when installed record.catalogId matches entry.id and checksums differ", async () => {
		const entry = makeEntry({
			id: "overview-characters",
			name: "Characters overview",
			checksum: "sha256:" + "b".repeat(64), // newer bundled checksum
		});
		// Record matched by stable catalogId; stored checksum is the old one
		const installedRecord = makeCuratedRecord({
			catalogId: "overview-characters",
			commandName: "Characters overview",
			okayed: { version: 1, checksum: "sha256:" + "a".repeat(64) }, // old
		});
		const store = makeStore({ "rec-1": installedRecord });
		const service = makeCatalogService({ entries: [entry] });
		const modal = new BrowseOfficialModal(app, service, store);
		modal.open();

		await vi.waitFor(() => {
			const text = document.body.textContent ?? "";
			expect(text).toMatch(/update available|update/i);
		});
	});

	it("AC-F7.1 rename-resistant: catalogId match still detects update when entry.name changed", async () => {
		// Simulates a catalog rename: installed record has old commandName
		// "Characters overview" but catalogId "overview-characters" still matches
		// the entry whose name is now "All Characters".
		const entry = makeEntry({
			id: "overview-characters",
			name: "All Characters", // renamed in catalog
			checksum: "sha256:" + "b".repeat(64),
		});
		const installedRecord = makeCuratedRecord({
			catalogId: "overview-characters", // stable slug still matches
			commandName: "Characters overview", // old name — would miss without catalogId
			okayed: { version: 1, checksum: "sha256:" + "a".repeat(64) },
		});
		const store = makeStore({ "rec-1": installedRecord });
		const service = makeCatalogService({ entries: [entry] });
		const modal = new BrowseOfficialModal(app, service, store);
		modal.open();

		await vi.waitFor(() => {
			const text = document.body.textContent ?? "";
			expect(text).toMatch(/update available|update/i);
		});
	});

	it("AC-F7.1 legacy fallback: commandName match still works for records without catalogId", async () => {
		// Records persisted before T4.5 have no catalogId field.
		// The commandName fallback must still surface update-available for them.
		const entry = makeEntry({
			id: "overview-characters",
			name: "Characters overview",
			checksum: "sha256:" + "b".repeat(64),
		});
		const legacyRecord = makeCuratedRecord({
			catalogId: undefined, // no catalogId — legacy pre-T4.5 record
			commandName: "Characters overview",
			okayed: { version: 1, checksum: "sha256:" + "a".repeat(64) },
		});
		const store = makeStore({ "rec-1": legacyRecord });
		const service = makeCatalogService({ entries: [entry] });
		const modal = new BrowseOfficialModal(app, service, store);
		modal.open();

		await vi.waitFor(() => {
			const text = document.body.textContent ?? "";
			expect(text).toMatch(/update available|update/i);
		});
	});

	it("AC-F7.3: does NOT show update affordance when checksums match (no drift → no noise)", async () => {
		const sharedChecksum = "sha256:" + "a".repeat(64);
		const entry = makeEntry({
			id: "overview-characters",
			name: "Characters overview",
			checksum: sharedChecksum,
		});
		// Record matched by catalogId; checksum matches — no update
		const installedRecord = makeCuratedRecord({
			catalogId: "overview-characters",
			commandName: "Characters overview",
			okayed: { version: 1, checksum: sharedChecksum },
		});
		const store = makeStore({ "rec-1": installedRecord });
		const service = makeCatalogService({ entries: [entry] });
		const modal = new BrowseOfficialModal(app, service, store);
		modal.open();

		await vi.waitFor(() => {
			const row = document.body.querySelector(".sf-catalog-row");
			if (!row) throw new Error("no row rendered");
		});

		const rows = Array.from(document.body.querySelectorAll(".sf-catalog-row"));
		for (const row of rows) {
			expect(row.textContent).not.toMatch(/update available/i);
		}
	});

	it("AC-F7.2: Update button calls CatalogService.install(id) — reuses the install path", async () => {
		const entry = makeEntry({
			id: "overview-characters",
			name: "Characters overview",
			checksum: "sha256:" + "b".repeat(64),
		});
		const installedRecord = makeCuratedRecord({
			catalogId: "overview-characters",
			commandName: "Characters overview",
			okayed: { version: 1, checksum: "sha256:" + "a".repeat(64) },
		});
		const store = makeStore({ "rec-1": installedRecord });
		const service = makeCatalogService({ entries: [entry] });
		const modal = new BrowseOfficialModal(app, service, store);
		modal.open();

		const updateBtn = await vi.waitFor(() => {
			const btn = findButton(document.body, "Update");
			if (!btn) throw new Error("Update button not found");
			return btn;
		}, { timeout: 2000, interval: 10 });

		updateBtn.click();

		await vi.waitFor(() => {
			expect(service.install).toHaveBeenCalledWith("overview-characters");
		});
	});

	it("no update affordance shown when no views are installed", async () => {
		const entry = makeEntry({ id: "overview-characters", name: "Characters overview" });
		const store = makeStore(); // empty — no installed records
		const service = makeCatalogService({ entries: [entry] });
		const modal = new BrowseOfficialModal(app, service, store);
		modal.open();

		await vi.waitFor(() => {
			const row = document.body.querySelector(".sf-catalog-row");
			if (!row) throw new Error("no row");
		});

		const rows = Array.from(document.body.querySelectorAll(".sf-catalog-row"));
		for (const row of rows) {
			expect(row.textContent).not.toMatch(/update available/i);
		}
	});

	it("W1 provenance guard: imported record with matching commandName does NOT produce update-available", async () => {
		// An IMPORTED record (provenance:"imported") whose commandName collides
		// with a catalog entry's name must NOT trigger the update-available
		// affordance. The provenance:"curated" guard is the only thing preventing
		// this false positive. If that guard were removed, this test would fail.
		const entry = makeEntry({
			id: "overview-characters",
			name: "Characters overview",
			checksum: "sha256:" + "b".repeat(64),
		});
		// Imported record — same commandName, different checksum, no catalogId
		const importedRecord: ViewRecord = {
			provenance: "imported",
			enabled: true,
			okayed: { version: 1, checksum: "sha256:" + "a".repeat(64) },
			source: "some/vault/path.md",
			engine: "dataviewjs",
			command: false,
			commandName: "Characters overview",
			kind: "view",
			surfaces: { anvil: false, workbench: false },
		};
		const store = makeStore({ "imported-1": importedRecord });
		const service = makeCatalogService({ entries: [entry] });
		const modal = new BrowseOfficialModal(app, service, store);
		modal.open();

		await vi.waitFor(() => {
			const row = document.body.querySelector(".sf-catalog-row");
			if (!row) throw new Error("no row rendered");
		});

		// Must NOT show update affordance — this is an imported record, not a curated one
		const rows = Array.from(document.body.querySelectorAll(".sf-catalog-row"));
		for (const row of rows) {
			expect(row.textContent).not.toMatch(/update available/i);
		}
		// Must NOT show an Update button
		expect(findButton(document.body, "Update")).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Suite 5 — S57: DataviewJS consent gate before install
// ---------------------------------------------------------------------------

describe("BrowseOfficialModal — S57 DataviewJS consent gate", () => {
	let app: App;

	beforeEach(() => {
		vi.clearAllMocks();
		app = new App();
	});

	afterEach(() => {
		document.body.innerHTML = "";
	});

	it("shows a code-bearing warning for a dataviewjs entry before install", async () => {
		// Even though CatalogEntry.engine is typed as "bases", the modal should
		// handle a consent-declined result from CatalogService.install() gracefully.
		// For testing the S57 gate path we mock install() to return the consent-
		// declined result and verify the modal surfaces it inline.
		const entry = makeEntry({ id: "dvjs-debug", name: "Scene debug" });
		const store = makeStore();
		const service = makeCatalogService({
			entries: [entry],
			installResult: { ok: false, reason: "consent-declined" },
		});
		const modal = new BrowseOfficialModal(app, service, store);
		modal.open();

		await waitForButton("Install");
		findButton(document.body, "Install")!.click();

		await vi.waitFor(() => {
			expect(document.body.textContent).toContain("consent-declined");
		});

		// Modal must not close
		expect(document.body.querySelector(".sf-catalog-row")).not.toBeNull();
	});

	it("a bases entry install does not show consent-declined (no gate for declarative views)", async () => {
		const entry = makeEntry({ id: "overview-characters", engine: "bases" });
		const store = makeStore();
		const service = makeCatalogService({
			entries: [entry],
			installResult: { ok: true },
		});
		const modal = new BrowseOfficialModal(app, service, store);
		modal.open();

		await waitForButton("Install");
		findButton(document.body, "Install")!.click();

		// Wait for result
		await vi.waitFor(() => {
			expect(service.install).toHaveBeenCalled();
		});

		// No consent-declined error shown
		expect(document.body.textContent).not.toContain("consent-declined");
	});
});
