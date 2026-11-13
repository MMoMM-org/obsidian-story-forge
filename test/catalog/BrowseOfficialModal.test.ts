/**
 * BrowseOfficialModal.test.ts — T4.5, rebuilt for the L10 catalog browser (spec 008, T7.2 follow-up).
 *
 * Tests the catalog modal as `mockups-catalog.html` L10a–L10i draws it: two panes (list | detail),
 * nothing selected on open (Q3), rows with status text only and no button (Q4), the detail pane's
 * destination, query block, collapsed Details and one action (Q5, Q6), the success texts and
 * DataviewJS button label (Q7), search plus engine filter above 5 entries (Q2), the refusal
 * wording (Q8) and the stacked screen's "← All collections" (Q1).
 *
 * DOM strategy mirrors ImportPickerModal.test.ts:
 * - document.body + vi.waitFor for async renders
 * - click / key dispatch against real elements
 * - CatalogService is a test double (all install logic stays in the service; its own suite
 *   tests it). The refusal WORDING is the real `describeRefusal` from CatalogService.ts.
 *
 * @ref PRD/AC-F4.2, AC-F7.1, AC-F7.2, AC-F7.3
 * @ref Mockups S47, S48, S49, S57; mockups-catalog.html L10a–L10i, Q1–Q8
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { App } from "../__mocks__/obsidian";
import { BrowseOfficialModal } from "catalog/BrowseOfficialModal";
import type { CatalogService, InstallResult } from "catalog/CatalogService";
import type { BasesCatalogEntry, CatalogEntry, DataviewCatalogEntry } from "catalog/catalogTypes";
import type { ViewRecord } from "store/types";
import { ViewStore } from "store/ViewStore";

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

const PLACEHOLDER = "Select a collection to see what it shows and where it goes.";

function makeEntry(overrides: Partial<BasesCatalogEntry> = {}): BasesCatalogEntry {
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

const DQL_BODY = "TABLE status\nFROM #story/plotline\nWHERE status != \"resolved\"\n";
const DVJS_BODY = "const me = dv.current();\ndv.list(me.allies ?? []);\n";

function makeDvEntry(overrides: Partial<DataviewCatalogEntry> = {}): DataviewCatalogEntry {
	const engine = overrides.engine ?? "dataview-dql";
	const lang = engine === "dataviewjs" ? "dataviewjs" : "dataview";
	const body = engine === "dataviewjs" ? DVJS_BODY : DQL_BODY;
	return {
		id: "open-plot-threads",
		name: "Open plot threads",
		engine,
		source: `---\nsf-version: 3\nsf-name: Open plot threads\n---\n\nIntro prose here.\n\n\`\`\`${lang}\n${body}\`\`\`\n`,
		checksum: "sha256:" + "9f1c07a4e2".repeat(6) + "abcd",
		description: "Plotlines not yet resolved, with the last scene that touched them.",
		version: 3,
		queryChecksum: "sha256:" + "c".repeat(64),
		...overrides,
	};
}

function makeStore(initial: Record<string, ViewRecord> = {}): ViewStore {
	const data = { views: { ...initial } };
	const port = {
		load: vi.fn(async () => data),
		save: vi.fn(async (d: unknown) => {
			const typed = d as typeof data;
			data.views = { ...(typed.views ?? {}) };
		}),
	};
	return new ViewStore(port);
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

/** Where the double says an entry installs: distinctive, so the test proves the modal shows the service's answer. */
function fakeTarget(entry: CatalogEntry): string {
	return `Dest Folder/${entry.id}.${entry.engine === "bases" ? "base" : "md"}`;
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
		targetPath: vi.fn((entry: CatalogEntry) => fakeTarget(entry)),
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

/** Open the modal and wait for its async render (the list is drawn after the store read). */
async function openModal(
	entries: CatalogEntry[],
	opts: { installed?: Record<string, ViewRecord>; installResult?: InstallResult } = {},
): Promise<{ service: CatalogService; modal: BrowseOfficialModal }> {
	const service = makeCatalogService({
		entries,
		...(opts.installResult ? { installResult: opts.installResult } : {}),
	});
	const modal = new BrowseOfficialModal(new App(), service, makeStore(opts.installed ?? {}));
	modal.open();
	await vi.waitFor(() => {
		if (!document.body.querySelector(".sf-picker-foot")) throw new Error("not rendered");
	});
	return { service, modal };
}

function rows(): HTMLElement[] {
	return Array.from(document.body.querySelectorAll<HTMLElement>(".sf-catalog-row"));
}

function visibleRows(): HTMLElement[] {
	return rows().filter((r) => !r.classList.contains("sf-hidden"));
}

function rowNamed(name: string): HTMLElement {
	const row = rows().find((r) => r.querySelector(".sf-catalog-name")?.textContent === name);
	if (!row) throw new Error(`no row named "${name}"`);
	return row;
}

function detail(): HTMLElement {
	const el = document.body.querySelector<HTMLElement>(".sf-catalog-preview");
	if (!el) throw new Error("no detail pane");
	return el;
}

/** The detail pane's action buttons (Install / Update / Review and install…). */
function actionButtons(): HTMLButtonElement[] {
	return Array.from(detail().querySelectorAll<HTMLButtonElement>(".sf-catalog-act button"));
}

function feedback(): HTMLElement {
	const el = detail().querySelector<HTMLElement>(".sf-picker-feedback");
	if (!el) throw new Error("no feedback");
	return el;
}

/** Six entries across the three engines (more than 5, so search and filter show). */
function sixEntries(): CatalogEntry[] {
	return [
		makeEntry({ id: "characters", name: "Character overview", description: "Every character with role." }),
		makeEntry({ id: "locations", name: "Locations by region", description: "Places grouped by region." }),
		makeEntry({ id: "lore", name: "Lore glossary", description: "Lore entries A to Z." }),
		makeDvEntry({ id: "threads", name: "Open plot threads", description: "Plotlines not yet resolved." }),
		makeDvEntry({ id: "web", name: "Relationship web", engine: "dataviewjs", description: "Allies and rivals." }),
		makeDvEntry({ id: "words", name: "Word count by chapter", engine: "dataviewjs", description: "Sums word counts." }),
	];
}

function typeSearch(text: string): void {
	const input = document.body.querySelector<HTMLInputElement>(".sf-picker-search");
	if (!input) throw new Error("no search field");
	input.value = text;
	input.dispatchEvent(new Event("input"));
}

function filterButton(label: string): HTMLButtonElement {
	const btn = Array.from(document.body.querySelectorAll<HTMLButtonElement>(".sf-catalog-filter button"))
		.find((b) => b.querySelector(".sf-catalog-filter-label")?.textContent === label);
	if (!btn) throw new Error(`no filter "${label}"`);
	return btn;
}

function filterCount(label: string): string {
	return filterButton(label).querySelector(".sf-catalog-filter-count")?.textContent ?? "";
}

afterEach(() => {
	document.body.innerHTML = "";
});

// ---------------------------------------------------------------------------
// Suite 1 — S47: list
// ---------------------------------------------------------------------------

describe("BrowseOfficialModal — S47 catalog list", () => {
	let app: App;

	beforeEach(() => {
		vi.clearAllMocks();
		app = new App();
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

	it("shows the engine's product name (ENGINE_LABEL) per entry", async () => {
		await openModal([makeEntry({ engine: "bases" })]);
		const pill = rows()[0]!.querySelector(".sf-catalog-engine");
		expect(pill?.textContent).toBe("Bases");
	});

	it("shows an empty state message when there are no catalog entries", async () => {
		await openModal([]);
		expect(document.body.textContent).toMatch(/The repo has no collections yet\./);
		// L10g(a): one pane — no detail placeholder, no search.
		expect(document.body.textContent).not.toContain(PLACEHOLDER);
		expect(document.body.querySelector(".sf-picker-search")).toBeNull();
		expect(activeDocument.activeElement?.textContent).toBe("Close");
	});
});

// ---------------------------------------------------------------------------
// Suite 2 — S48: detail pane on row selection
// ---------------------------------------------------------------------------

describe("BrowseOfficialModal — S48 detail pane on row selection", () => {
	beforeEach(() => vi.clearAllMocks());

	it("shows the entry name, description and engine in the detail pane when a row is selected", async () => {
		await openModal([makeEntry({ name: "Scenes overview", description: "All scenes in the book." })]);
		rows()[0]!.click();
		const head = detail().querySelector(".sf-catalog-preview-head");
		expect(head?.querySelector(".sf-catalog-preview-title")?.textContent).toBe("Scenes overview");
		expect(head?.querySelector(".sf-catalog-engine")?.textContent).toBe("Bases");
		expect(detail().querySelector(".sf-catalog-preview-desc")?.textContent).toBe("All scenes in the book.");
	});

	it("shows a Bases entry's YAML as its query", async () => {
		await openModal([makeEntry({ source: "filters: type == \"character\"\nviews:\n  - type: table\n" })]);
		rows()[0]!.click();
		expect(detail().querySelector("pre.sf-catalog-preview-src")?.textContent).toContain("type == \"character\"");
	});
});

// ---------------------------------------------------------------------------
// Suite 3 — Install: delegates to CatalogService.install(id)
// ---------------------------------------------------------------------------

describe("BrowseOfficialModal — Install delegates to CatalogService", () => {
	beforeEach(() => vi.clearAllMocks());

	it("calls CatalogService.install(id) with the selected entry's id when Install is clicked", async () => {
		const { service } = await openModal([makeEntry({ id: "overview-scenes", name: "Scenes overview" })]);
		rows()[0]!.click();
		findButton(detail(), "Install")!.click();
		await vi.waitFor(() => {
			expect(service.install).toHaveBeenCalledWith("overview-scenes");
		});
	});

	it("shows install error inline without closing the modal when install returns ok:false", async () => {
		const { modal } = await openModal([makeEntry()], {
			installResult: { ok: false, reason: "materialise failed: disk full" },
		});
		const closeSpy = vi.spyOn(modal, "close");
		rows()[0]!.click();
		findButton(detail(), "Install")!.click();
		await vi.waitFor(() => {
			expect(feedback().textContent).toContain("materialise failed: disk full");
		});
		expect(closeSpy).not.toHaveBeenCalled();
	});

	it("does NOT close the modal after install — modal stays open for further browsing", async () => {
		const { service, modal } = await openModal([makeEntry()], { installResult: { ok: true } });
		const closeSpy = vi.spyOn(modal, "close");
		rows()[0]!.click();
		findButton(detail(), "Install")!.click();
		await vi.waitFor(() => {
			expect(service.install).toHaveBeenCalled();
		});
		expect(closeSpy).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// Suite 4 — S49 / AC-F7.1, AC-F7.2, AC-F7.3: update-available affordance
// ---------------------------------------------------------------------------

describe("BrowseOfficialModal — S49 update-available affordance (AC-F7.1, AC-F7.2, AC-F7.3)", () => {
	beforeEach(() => vi.clearAllMocks());

	const newer = (): BasesCatalogEntry => makeEntry({
		id: "overview-characters",
		name: "Characters overview",
		checksum: "sha256:" + "b".repeat(64),
	});

	function rowStatus(): string {
		return rows()[0]!.querySelector(".sf-catalog-status")?.textContent ?? "";
	}

	it("AC-F7.1: shows 'Update available' when installed record.catalogId matches entry.id and checksums differ", async () => {
		await openModal([newer()], { installed: { "rec-1": makeCuratedRecord() } });
		expect(rowStatus()).toBe("Update available");
	});

	it("AC-F7.1 rename-resistant: catalogId match still detects update when entry.name changed", async () => {
		await openModal([makeEntry({ name: "All Characters", checksum: "sha256:" + "b".repeat(64) })], {
			installed: { "rec-1": makeCuratedRecord({ commandName: "Characters overview" }) },
		});
		expect(rowStatus()).toBe("Update available");
	});

	it("AC-F7.1 legacy fallback: commandName match still works for records without catalogId", async () => {
		await openModal([newer()], { installed: { "rec-1": makeCuratedRecord({ catalogId: undefined }) } });
		expect(rowStatus()).toBe("Update available");
	});

	it("AC-F7.3: shows '✓ Installed' and no update affordance when checksums match", async () => {
		await openModal([makeEntry()], { installed: { "rec-1": makeCuratedRecord() } });
		expect(rowStatus()).toBe("✓ Installed");
		rows()[0]!.click();
		expect(actionButtons()).toHaveLength(0);
	});

	it("AC-F7.2: Update button in the detail pane calls CatalogService.install(id) — reuses the install path", async () => {
		const { service } = await openModal([newer()], { installed: { "rec-1": makeCuratedRecord() } });
		rows()[0]!.click();
		findButton(detail(), "Update")!.click();
		await vi.waitFor(() => {
			expect(service.install).toHaveBeenCalledWith("overview-characters");
		});
	});

	it("no status shown when no views are installed", async () => {
		await openModal([makeEntry()]);
		expect(rowStatus()).toBe("");
	});

	it("W1 provenance guard: imported record with matching commandName does NOT produce update-available", async () => {
		// The provenance:"curated" guard is the only thing preventing this false positive.
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
		await openModal([newer()], { installed: { "imported-1": importedRecord } });
		expect(rowStatus()).toBe("");
		rows()[0]!.click();
		expect(findButton(detail(), "Update")).toBeNull();
		expect(findButton(detail(), "Install")).not.toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Suite 5 — L10 catalog browser (mockups-catalog.html, Q1–Q8)
// ---------------------------------------------------------------------------

describe("BrowseOfficialModal — L10 catalog browser", () => {
	beforeEach(() => vi.clearAllMocks());

	// 1 — Q3
	it("L10a: opens with nothing selected and the placeholder in the detail pane", async () => {
		await openModal([makeDvEntry()]);
		expect(rows()).toHaveLength(1);
		expect(document.body.querySelector('[aria-selected="true"]')).toBeNull();
		expect(rows()[0]!.getAttribute("aria-selected")).toBe("false");
		expect(detail().textContent).toContain("Nothing selected");
		expect(detail().textContent).toContain(PLACEHOLDER);
		expect(findButton(document.body, "Install")).toBeNull();
		// Focus starts on the first row when there is no search field.
		expect(activeDocument.activeElement).toBe(rows()[0]);
	});

	// 2 — Q4, Q6
	it("L10a/b: a row shows only name, engine label, one-line description and status — no button, no checksum", async () => {
		const entry = makeDvEntry();
		await openModal([entry], {
			installed: {
				"rec-1": makeCuratedRecord({
					catalogId: entry.id,
					engine: "dataview-dql",
					okayed: { version: 3, checksum: entry.queryChecksum },
				}),
			},
		});
		const row = rows()[0]!;
		expect(row.getAttribute("role")).toBe("option");
		expect(row.querySelector(".sf-catalog-name")?.textContent).toBe("Open plot threads");
		expect(row.querySelector(".sf-catalog-engine")?.textContent).toBe("Dataview");
		expect(row.querySelector(".sf-catalog-desc")?.textContent).toBe(entry.description);
		expect(row.querySelector(".sf-catalog-status")?.textContent).toBe("✓ Installed");
		expect(row.querySelectorAll("button")).toHaveLength(0);
		expect(row.textContent).not.toMatch(/sha256/);
		expect(row.textContent).not.toMatch(/official|curated/i);
		expect(row.textContent).toBe(
			"Open plot threads✓ InstalledDataview" + entry.description,
		);
	});

	// 3 — Q4, Q5, Q6
	it("L10c: selecting a row fills the detail pane — destination, query block only, collapsed Details, one Install", async () => {
		const entry = makeDvEntry();
		await openModal([entry]);
		rows()[0]!.click();

		expect(rows()[0]!.getAttribute("aria-selected")).toBe("true");
		const pane = detail();
		expect(pane.getAttribute("role")).toBe("region");
		expect(pane.textContent).not.toContain(PLACEHOLDER);

		const dest = pane.querySelector(".sf-catalog-preview-dest")!;
		expect(dest.querySelector(".sf-catalog-label")?.textContent).toBe("Installs to");
		expect(dest.querySelector(".sf-catalog-path")?.textContent).toBe("Dest Folder/open-plot-threads.md");
		expect(dest.querySelector(".sf-catalog-hint")?.textContent)
			.toBe("Set by Folder for collections from the repo in Settings › Library.");

		const query = pane.querySelector("pre.sf-catalog-preview-src")!;
		expect(query.textContent).toBe(DQL_BODY.trimEnd());
		expect(query.textContent).not.toContain("sf-version");
		expect(query.textContent).not.toContain("Intro prose");

		expect(pane.querySelector(".sf-catalog-safe")?.textContent).toBe("Safe: declarative query, no code.");
		expect(actionButtons().map((b) => b.textContent)).toEqual(["Install"]);

		const details = pane.querySelector(".sf-catalog-preview-details")!;
		const toggle = details.querySelector<HTMLButtonElement>("button")!;
		expect(toggle.textContent).toBe("▸ Details");
		expect(toggle.getAttribute("aria-expanded")).toBe("false");
		expect(details.querySelector("dl")!.classList.contains("sf-hidden")).toBe(true);
	});

	it("L10d: Details opens to source file, version and a shortened checksum with the full value as its title", async () => {
		const entry = makeDvEntry();
		await openModal([entry]);
		rows()[0]!.click();
		const details = detail().querySelector(".sf-catalog-preview-details")!;
		const toggle = details.querySelector<HTMLButtonElement>("button")!;
		toggle.click();
		expect(toggle.getAttribute("aria-expanded")).toBe("true");
		expect(toggle.textContent).toBe("▾ Details");
		const dl = details.querySelector("dl")!;
		expect(dl.classList.contains("sf-hidden")).toBe(false);
		const dd = Array.from(dl.querySelectorAll("dd")).map((d) => d.textContent);
		expect(Array.from(dl.querySelectorAll("dt")).map((d) => d.textContent)).toEqual(["Source", "Version", "Checksum"]);
		expect(dd).toEqual(["catalog/open-plot-threads.md", "3", "sha256:9f1c07a4e2…"]);
		expect(dl.querySelectorAll("dd")[2]!.getAttribute("title")).toBe(entry.checksum);
	});

	it("L10c: an installed, current entry has no query and no button, and reads 'Installed at'", async () => {
		const entry = makeDvEntry();
		await openModal([entry], {
			installed: {
				"rec-1": makeCuratedRecord({
					catalogId: entry.id,
					engine: "dataview-dql",
					kind: "collection",
					source: "Elsewhere/open-plot-threads.md",
					okayed: { version: 3, checksum: entry.queryChecksum },
				}),
			},
		});
		rows()[0]!.click();
		expect(detail().querySelector(".sf-catalog-preview-head .sf-catalog-status")?.textContent).toBe("✓ Installed");
		expect(detail().querySelector(".sf-catalog-label")?.textContent).toBe("Installed at");
		expect(detail().querySelector(".sf-catalog-path")?.textContent).toBe("Elsewhere/open-plot-threads.md");
		expect(detail().querySelector("pre")).toBeNull();
		expect(actionButtons()).toHaveLength(0);
	});

	it("L10e(b): an update-available entry reads 'Updates', the installed file, and one Update button", async () => {
		const entry = makeEntry({ checksum: "sha256:" + "b".repeat(64) });
		await openModal([entry], {
			installed: { "rec-1": makeCuratedRecord({ kind: "collection", source: "Old/overview-characters.base" }) },
		});
		rows()[0]!.click();
		const pane = detail();
		expect(pane.querySelector(".sf-catalog-preview-head .sf-catalog-status")?.textContent).toBe("Update available");
		expect(pane.querySelector(".sf-catalog-label")?.textContent).toBe("Updates");
		expect(pane.querySelector(".sf-catalog-path")?.textContent).toBe("Old/overview-characters.base");
		expect(pane.querySelector(".sf-catalog-hint")?.textContent)
			.toBe("The repo has a newer version. Update replaces this file with it.");
		expect(Array.from(pane.querySelectorAll(".sf-catalog-label")).map((l) => l.textContent))
			.toEqual(["Updates", "Query (new version)"]);
		expect(actionButtons().map((b) => b.textContent)).toEqual(["Update"]);
	});

	// 4 — Q7
	it("L10d: a DataviewJS entry reads 'Review and install…' with the consent note instead of the safe note", async () => {
		await openModal([makeDvEntry({ engine: "dataviewjs" })]);
		rows()[0]!.click();
		expect(actionButtons().map((b) => b.textContent)).toEqual(["Review and install…"]);
		expect(detail().querySelector(".sf-catalog-safe")).toBeNull();
		expect(detail().querySelector(".sf-catalog-consent")?.textContent).toBe(
			"▲ Runs JavaScript. This collection runs code with full vault access. "
			+ "Review and install… shows you its code first. Nothing is written until you enable it.",
		);
		expect(detail().querySelector("pre")?.textContent).toBe(DVJS_BODY.trimEnd());
	});

	// 5 — Q7
	it("L10e(a): a successful install says where the file went, drops the button and marks the row installed", async () => {
		await openModal([makeDvEntry()], { installResult: { ok: true, path: "00 Meta/Bases/open-plot-threads.md" } });
		rows()[0]!.click();
		findButton(detail(), "Install")!.click();
		await vi.waitFor(() => {
			expect(feedback().textContent).toBe("Installed to 00 Meta/Bases/open-plot-threads.md. It is in Library › Collections.");
		});
		expect(feedback().classList.contains("sf-catalog-success")).toBe(true);
		expect(feedback().getAttribute("role")).toBe("status");
		expect(activeDocument.activeElement).toBe(feedback());
		expect(actionButtons()).toHaveLength(0);
		expect(detail().querySelector(".sf-catalog-label")?.textContent).toBe("Installed at");
		expect(rows()[0]!.querySelector(".sf-catalog-status")?.textContent).toBe("✓ Installed");
	});

	it("L10e(b): a successful update says 'Updated <path>.'", async () => {
		await openModal([makeEntry({ checksum: "sha256:" + "b".repeat(64) })], {
			installed: { "rec-1": makeCuratedRecord() },
			installResult: { ok: true, path: "00 Meta/Bases/overview-characters.base" },
		});
		rows()[0]!.click();
		findButton(detail(), "Update")!.click();
		await vi.waitFor(() => {
			expect(feedback().textContent).toBe("Updated 00 Meta/Bases/overview-characters.base.");
		});
		expect(rows()[0]!.querySelector(".sf-catalog-status")?.textContent).toBe("✓ Installed");
	});

	// 6 — Q2, Q7
	it("L10a: with 5 entries or fewer there is no search and no engine filter", async () => {
		await openModal(sixEntries().slice(0, 5));
		expect(document.body.querySelector(".sf-picker-search")).toBeNull();
		expect(document.body.querySelector(".sf-catalog-filter")).toBeNull();
	});

	it("L10b: above 5 entries, search and the engine filter appear, with counts, and focus starts in search", async () => {
		await openModal(sixEntries());
		const search = document.body.querySelector<HTMLInputElement>(".sf-picker-search")!;
		expect(search.placeholder).toBe("Search collections…");
		expect(activeDocument.activeElement).toBe(search);
		expect(document.body.querySelector(".sf-catalog-filter")?.getAttribute("role")).toBe("radiogroup");
		expect(["All", "Bases", "Dataview", "DataviewJS"].map(filterCount)).toEqual(["6", "3", "1", "2"]);
		expect(filterButton("All").getAttribute("aria-checked")).toBe("true");
	});

	it("L10b: search narrows by name and description; the engine filter narrows further", async () => {
		await openModal(sixEntries());
		typeSearch("region");
		expect(visibleRows().map((r) => r.querySelector(".sf-catalog-name")?.textContent)).toEqual(["Locations by region"]);
		expect(document.body.querySelector(".sf-catalog-live")?.textContent).toBe("1 of 6 collections");
		// A match in the description only.
		typeSearch("ALLIES");
		expect(visibleRows().map((r) => r.querySelector(".sf-catalog-name")?.textContent)).toEqual(["Relationship web"]);

		typeSearch("");
		filterButton("DataviewJS").click();
		expect(filterButton("DataviewJS").getAttribute("aria-checked")).toBe("true");
		expect(filterButton("All").getAttribute("aria-checked")).toBe("false");
		expect(visibleRows().map((r) => r.querySelector(".sf-catalog-name")?.textContent))
			.toEqual(["Relationship web", "Word count by chapter"]);

		typeSearch("word");
		expect(visibleRows().map((r) => r.querySelector(".sf-catalog-name")?.textContent)).toEqual(["Word count by chapter"]);
		expect(["All", "Bases", "Dataview", "DataviewJS"].map(filterCount)).toEqual(["1", "0", "0", "1"]);
	});

	it("L10g(b): no match shows the no-match text, counts drop to 0, and a hidden selection is cleared", async () => {
		await openModal(sixEntries());
		rowNamed("Lore glossary").click();
		expect(detail().textContent).not.toContain(PLACEHOLDER);
		typeSearch("timeline");
		expect(visibleRows()).toHaveLength(0);
		const empty = document.body.querySelector(".sf-catalog-nomatch")!;
		expect(empty.classList.contains("sf-hidden")).toBe(false);
		expect(empty.textContent).toBe("No collections match \"timeline\".");
		expect(["All", "Bases", "Dataview", "DataviewJS"].map(filterCount)).toEqual(["0", "0", "0", "0"]);
		expect(document.body.querySelector('[aria-selected="true"]')).toBeNull();
		expect(detail().textContent).toContain(PLACEHOLDER);
	});

	// 7 — Q8
	const refusals: Array<{ name: string; reason: string; update: boolean; text: string; raw: string | null }> = [
		{
			name: "edited after install (unchanged)",
			reason: "Not updated: 00 Meta/Bases/x.base was edited after it was installed, and updating would overwrite those edits.",
			update: true,
			text: "Not updated: 00 Meta/Bases/x.base was edited after it was installed, and updating would overwrite those edits.",
			raw: null,
		},
		{
			name: "path occupied (unchanged)",
			reason: "Not installed: 00 Meta/Bases/x.base already exists. Move, rename or remove it, then install again.",
			update: false,
			text: "Not installed: 00 Meta/Bases/x.base already exists. Move, rename or remove it, then install again.",
			raw: null,
		},
		{
			name: "could not read (unchanged)",
			reason: "Not installed: could not read 00 Meta/Bases/x.base: EACCES: permission denied",
			update: false,
			text: "Not installed: could not read 00 Meta/Bases/x.base: EACCES: permission denied",
			raw: null,
		},
		{
			name: "checksum mismatch",
			reason: "checksum mismatch: expected sha256:51ab, got sha256:c47d",
			update: false,
			text: "Not installed: the bundled copy of this collection is damaged, so nothing was written. Reinstalling Story Forge restores it.",
			raw: "checksum mismatch: expected sha256:51ab, got sha256:c47d",
		},
		{
			name: "query checksum mismatch",
			reason: "query checksum mismatch: expected sha256:51ab, got no single query block",
			update: false,
			text: "Not installed: the bundled copy of this collection is damaged, so nothing was written. Reinstalling Story Forge restores it.",
			raw: "query checksum mismatch: expected sha256:51ab, got no single query block",
		},
		{
			name: "materialise failed",
			reason: "materialise failed: disk full",
			update: false,
			text: "Not installed: could not write Dest Folder/overview-characters.base. Nothing was changed.",
			raw: "materialise failed: disk full",
		},
		{
			name: "persist failed (install)",
			reason: "persist failed: quota",
			update: false,
			text: "Not installed: could not save it to the Library, so the file was removed again.",
			raw: "persist failed: quota",
		},
		{
			name: "persist failed (update)",
			reason: "persist failed: quota",
			update: true,
			text: "Not updated: could not save it to the Library, so the previous file was restored.",
			raw: "persist failed: quota",
		},
		{
			name: "store read failed",
			reason: "store read failed: corrupt data.json",
			update: false,
			text: "Not installed: could not read the Library's records. Nothing was written.",
			raw: "store read failed: corrupt data.json",
		},
		{
			name: "unreachable reason (fallback)",
			reason: "not-found: no catalog entry with id \"x\"",
			update: false,
			text: "Not installed.",
			raw: "not-found: no catalog entry with id \"x\"",
		},
	];

	for (const r of refusals) {
		it(`L10f: refusal "${r.name}" shows its sentence under the button, which stays focused`, async () => {
			const entry = makeEntry({ checksum: "sha256:" + (r.update ? "b" : "a").repeat(64) });
			await openModal([entry], {
				...(r.update ? { installed: { "rec-1": makeCuratedRecord() } } : {}),
				installResult: { ok: false, reason: r.reason },
			});
			rows()[0]!.click();
			const label = r.update ? "Update" : "Install";
			findButton(detail(), label)!.click();
			await vi.waitFor(() => {
				expect(detail().querySelector(".sf-picker-feedback")).not.toBeNull();
			});
			const fb = feedback();
			expect(fb.getAttribute("role")).toBe("alert");
			expect(fb.classList.contains("sf-catalog-neutral")).toBe(false);
			expect(fb.querySelector(".sf-catalog-feedback-text")?.textContent).toBe(r.text);
			expect(fb.querySelector(".sf-catalog-raw")?.textContent ?? null).toBe(r.raw);
			expect(actionButtons().map((b) => b.textContent)).toEqual([label]);
			expect(activeDocument.activeElement).toBe(actionButtons()[0]);
			// The feedback sits directly under the action row.
			expect(detail().querySelector(".sf-catalog-act")?.nextElementSibling).toBe(fb);
		});
	}

	it("L10f(e): a closed DataviewJS review is a neutral note, not an error", async () => {
		await openModal([makeDvEntry({ engine: "dataviewjs" })], {
			installResult: { ok: false, reason: "consent declined" },
		});
		rows()[0]!.click();
		findButton(detail(), "Review and install…")!.click();
		await vi.waitFor(() => {
			expect(detail().querySelector(".sf-picker-feedback")).not.toBeNull();
		});
		const fb = feedback();
		expect(fb.textContent).toBe("Not installed. You closed the review, so nothing was written.");
		expect(fb.classList.contains("sf-catalog-neutral")).toBe(true);
		expect(fb.getAttribute("role")).toBe("status");
		expect(fb.querySelector(".sf-catalog-raw")).toBeNull();
		expect(activeDocument.activeElement).toBe(actionButtons()[0]);
	});

	it("L10f: selecting another entry clears the message", async () => {
		await openModal([makeEntry(), makeEntry({ id: "two", name: "Two" })], {
			installResult: { ok: false, reason: "materialise failed: disk full" },
		});
		rows()[0]!.click();
		findButton(detail(), "Install")!.click();
		await vi.waitFor(() => {
			expect(detail().querySelector(".sf-picker-feedback")).not.toBeNull();
		});
		rows()[1]!.click();
		expect(detail().querySelector(".sf-picker-feedback")).toBeNull();
	});

	// 8 — Q1
	it("L10h(b): the detail pane has '← All collections', which returns to the list on the row you came from", async () => {
		await openModal([makeEntry(), makeEntry({ id: "two", name: "Two" })]);
		rows()[1]!.click();
		const split = document.body.querySelector(".sf-catalog-split")!;
		expect(split.classList.contains("is-detail")).toBe(true);
		const back = findButton(detail(), "← All collections");
		expect(back).not.toBeNull();
		back!.click();
		expect(split.classList.contains("is-detail")).toBe(false);
		expect(activeDocument.activeElement).toBe(rows()[1]);
		// Going back keeps the selection (the wide layout still shows it).
		expect(rows()[1]!.getAttribute("aria-selected")).toBe("true");
	});

	it("keyboard: rows are focusable, Enter and Space select, Down and Up move between rows", async () => {
		await openModal([makeEntry(), makeEntry({ id: "two", name: "Two" })]);
		const [first, second] = rows();
		expect(document.body.querySelector(".sf-catalog-list")?.getAttribute("role")).toBe("listbox");
		expect(first!.tabIndex).toBe(0);
		expect(second!.tabIndex).toBe(-1);

		second!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
		expect(second!.getAttribute("aria-selected")).toBe("true");
		first!.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
		expect(first!.getAttribute("aria-selected")).toBe("true");
		expect(second!.getAttribute("aria-selected")).toBe("false");

		first!.focus();
		first!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
		expect(activeDocument.activeElement).toBe(second);
		// Both panes visible (not stacked): selection follows focus.
		expect(second!.getAttribute("aria-selected")).toBe("true");
		second!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
		expect(activeDocument.activeElement).toBe(first);
	});

	it("widens the modal through its modalEl class", async () => {
		const { modal } = await openModal([makeEntry()]);
		expect(modal.modalEl.classList.contains("sf-catalog-modal")).toBe(true);
	});
});
