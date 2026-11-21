/**
 * Tests for ImportPickerModal — the vault import modal ("Import a collection"), rebuilt to the
 * signed-off mockup `mockups-import.html` L11a–L11i (R1–R6), the sibling of the L10 catalog browser.
 *
 * SDD/Flow C: scanVault → parse every candidate (R2) → pick → Import (re-parse, then
 * runImportFlow: Bases and DQL save at once, DataviewJS asks first, R1) → the result inline (R4, R6).
 *
 * Test strategy (mirrors BrowseOfficialModal.test.ts):
 * - A real ViewImporter with `scanVault`, `parse` and `importToStore` spied, so each test states
 *   which files the vault offers, what parsing them gives, and what saving does.
 * - The consent gate is a double whose only method is `requestConsentForDef`.
 *
 * @ref PRD/AC-F3.1, AC-F3.3, AC-F3.4, F7 AC 8
 * @ref mockups-import.html L11a–L11i, R1–R6
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { App, Notice, TFile, createMockTFile } from "../__mocks__/obsidian";
import { ImportPickerModal } from "import/ImportPickerModal";
import { ViewImporter } from "import/ViewImporter";
import { ImportError } from "import/ViewDefinition";
import type { ViewDefinition } from "import/ViewDefinition";
import { ViewStore } from "store/ViewStore";
import type { ConsentGate } from "consent/ConsentGate";

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

const PLACEHOLDER = "Select a collection to see what it shows and where it goes.";
const STAYS = "Stays where it is. Story Forge links to it, so editing the file changes the collection.";
const CHANGE = "Change this per collection in Library › Collections.";
const FIX_FILE = "Fix the file, then open this window again.";

const BASE_YAML = "filters:\n  and:\n    - type == \"character\"\nviews:\n  - type: cards\n    name: Characters by faction\n";
const DQL_BODY = "TABLE status\nFROM #manuscript/scene\nWHERE contains(location, this.file.link)\n";
const DVJS_BODY = "const me = dv.current();\ndv.list(me.allies ?? []);\n";

function makeFile(path: string): TFile {
	const name = path.split("/").pop()!;
	const extension = name.split(".").pop()!;
	return createMockTFile({ path, name, basename: name.slice(0, -(extension.length + 1)), extension });
}

function baseDef(path: string, name = path.split("/").pop()!.replace(/\.base$/, "")): ViewDefinition {
	return {
		sourcePath: path, engine: "bases", version: 0, name, command: false,
		querySource: BASE_YAML, checksum: ("sha256:" + "b".repeat(64)) as `sha256:${string}`,
	};
}

function dqlDef(path: string, overrides: Partial<ViewDefinition> = {}): ViewDefinition {
	return {
		sourcePath: path, engine: "dataview-dql", version: 2, name: "Scenes at this location",
		description: "Scenes set at the open location, in story order.", command: false,
		querySource: DQL_BODY, checksum: ("sha256:" + "d".repeat(64)) as `sha256:${string}`,
		...overrides,
	};
}

function dvjsDef(path: string, overrides: Partial<ViewDefinition> = {}): ViewDefinition {
	return {
		sourcePath: path, engine: "dataviewjs", version: 1, name: "Family tree",
		description: "Parents, grandparents and children of the open character.", command: false,
		querySource: DVJS_BODY, checksum: ("sha256:" + "e".repeat(64)) as `sha256:${string}`,
		...overrides,
	};
}

/** What parsing a path gives: a definition, or the error parse throws. */
type Parsed = ViewDefinition | Error;

function makeStore(): ViewStore {
	const data = { views: {} };
	return new ViewStore({ load: vi.fn(async () => data), save: vi.fn(async () => {}) });
}

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
	let resolve!: (v: T) => void;
	const promise = new Promise<T>((r) => { resolve = r; });
	return { promise, resolve };
}

interface Harness {
	modal: ImportPickerModal;
	importer: ViewImporter;
	gate: ConsentGate;
	/** What `parse` gives per path; change it to make the import-time re-parse differ from the scan. */
	parsed: Map<string, Parsed>;
}

async function openPicker(
	vault: Record<string, Parsed>,
	opts: {
		consent?: { version: number; checksum: string } | null;
		importToStore?: () => Promise<string>;
		width?: number;
	} = {},
): Promise<Harness> {
	const app = new App();
	const importer = new ViewImporter(app, makeStore());
	const parsed = new Map(Object.entries(vault));
	vi.spyOn(importer, "scanVault").mockResolvedValue(Object.keys(vault).map(makeFile));
	vi.spyOn(importer, "parse").mockImplementation(async (file: TFile) => {
		const r = parsed.get(file.path);
		if (r === undefined || r instanceof Error) throw r ?? new Error("no such file");
		return r;
	});
	vi.spyOn(importer, "importToStore").mockImplementation(opts.importToStore ?? (async () => "new-id"));
	const gate = {
		requestConsentForDef: vi.fn(async () => (opts.consent === undefined ? null : opts.consent)),
	} as unknown as ConsentGate;
	const modal = new ImportPickerModal(app, importer, gate);
	if (opts.width !== undefined) {
		Object.defineProperty(modal.contentEl, "clientWidth", { value: opts.width, configurable: true });
	}
	modal.open();
	await vi.waitFor(() => {
		if (!document.body.querySelector(".sf-picker-foot")) throw new Error("not rendered");
	});
	return { modal, importer, gate, parsed };
}

function rows(): HTMLElement[] {
	return Array.from(document.body.querySelectorAll<HTMLElement>(".sf-catalog-row"));
}

function visibleNames(): string[] {
	return rows().filter((r) => r.style.display !== "none").map((r) => r.querySelector(".sf-catalog-name")?.textContent ?? "");
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

function actionButtons(): HTMLButtonElement[] {
	return Array.from(detail().querySelectorAll<HTMLButtonElement>(".sf-catalog-act button"));
}

function feedback(): HTMLElement {
	const el = detail().querySelector<HTMLElement>(".sf-picker-feedback");
	if (!el) throw new Error("no feedback");
	return el;
}

async function waitForFeedback(): Promise<HTMLElement> {
	return vi.waitFor(() => feedback());
}

function typeSearch(text: string): void {
	const input = document.body.querySelector<HTMLInputElement>(".sf-picker-search")!;
	input.value = text;
	input.dispatchEvent(new Event("input"));
}

function filterCount(label: string): string {
	const btn = Array.from(document.body.querySelectorAll<HTMLButtonElement>(".sf-catalog-filter button"))
		.find((b) => b.querySelector(".sf-catalog-filter-label")?.textContent === label);
	return btn?.querySelector(".sf-catalog-filter-count")?.textContent ?? "";
}

/** Six importable files plus a broken note: above the search threshold. */
function sixFiles(): Record<string, Parsed> {
	return {
		"00 Meta/Views/scenes-at-this-location.md": dqlDef("00 Meta/Views/scenes-at-this-location.md"),
		"00 Meta/Views/family-tree.md": dvjsDef("00 Meta/Views/family-tree.md"),
		"00 Meta/Views/pacing-chart.md": new ImportError("ENGINE_MISMATCH", "sf-engine \"dataview-dql\" contradicts the fenced block language \"dataviewjs\""),
		"20 Manuscript/draft-board.base": baseDef("20 Manuscript/draft-board.base", "Draft board"),
		"30 Canon/31 Characters/characters-by-faction.base": baseDef("30 Canon/31 Characters/characters-by-faction.base", "Characters by faction"),
		"30 Canon/Broken test.base": new ImportError("INVALID_BASE", "This .base file is not a valid Bases file: Invalid BasesConfigFile: must have at least one of views, filters, or formulas", "base-invalid"),
	};
}

afterEach(() => {
	document.body.innerHTML = "";
	Notice._reset();
	vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// L11a — opening
// ---------------------------------------------------------------------------

describe("ImportPickerModal — L11a opening", () => {
	it("opens with nothing selected, the placeholder, and Close as the only footer button", async () => {
		const { modal } = await openPicker({
			"00 Meta/Views/scenes-at-this-location.md": dqlDef("00 Meta/Views/scenes-at-this-location.md"),
			"30 Canon/x.base": baseDef("30 Canon/x.base"),
		});
		expect(document.body.querySelector(".modal-title")?.textContent).toBe("Import a collection");
		expect(document.body.querySelector(".sf-picker-sub")?.textContent).toBe("Notes in your vault marked sf-view: true, and .base files");
		expect(document.body.querySelector(".sf-catalog-list")?.getAttribute("aria-label")).toBe("Importable collections");
		expect(document.body.querySelector('[aria-selected="true"]')).toBeNull();
		expect(detail().textContent).toContain("Nothing selected");
		expect(detail().textContent).toContain(PLACEHOLDER);
		expect(Array.from(document.body.querySelectorAll(".sf-picker-foot button")).map((b) => b.textContent)).toEqual(["Close"]);
		expect(document.body.textContent).not.toContain("Next →");
		expect(activeDocument.activeElement).toBe(rows()[0]);
		expect(modal.modalEl.classList.contains("sf-catalog-modal")).toBe(true);
	});

	it("L11g(a): with nothing to import shows today's text, no placeholder, and focuses Close", async () => {
		await openPicker({});
		expect(document.body.textContent).toContain(
			"Nothing to import — add sf-view: true to a vault note, or create a .base file, to make it available here.",
		);
		expect(document.body.textContent).not.toContain(PLACEHOLDER);
		expect(activeDocument.activeElement?.textContent).toBe("Close");
	});

	it.each([
		["with files to parse", [makeFile("views/a.md")]],
		["with nothing to import", []],
	])("draws nothing, and parses nothing, when the modal closed before the scan finished (W2) — %s", async (_l, files) => {
		const app = new App();
		const importer = new ViewImporter(app, makeStore());
		const scan = deferred<TFile[]>();
		vi.spyOn(importer, "scanVault").mockImplementation(() => scan.promise);
		const parse = vi.spyOn(importer, "parse");
		const modal = new ImportPickerModal(app, importer, { requestConsentForDef: vi.fn() } as unknown as ConsentGate);
		modal.open();
		modal.close();
		scan.resolve(files);
		await new Promise((r) => setTimeout(r, 0));
		expect(modal.contentEl.childElementCount).toBe(0);
		expect(parse).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// L11a/b — rows (R2, R3)
// ---------------------------------------------------------------------------

describe("ImportPickerModal — rows", () => {
	it("R3: a row shows name, engine label and vault path, sorted by path, with no description and no button", async () => {
		await openPicker({
			"30 Canon/31 Characters/characters-by-faction.base": baseDef("30 Canon/31 Characters/characters-by-faction.base", "Characters by faction"),
			"00 Meta/Views/scenes-at-this-location.md": dqlDef("00 Meta/Views/scenes-at-this-location.md"),
			"00 Meta/Views/family-tree.md": dvjsDef("00 Meta/Views/family-tree.md"),
		});
		expect(rows().map((r) => r.querySelector(".sf-picker-path")?.textContent)).toEqual([
			"00 Meta/Views/family-tree.md",
			"00 Meta/Views/scenes-at-this-location.md",
			"30 Canon/31 Characters/characters-by-faction.base",
		]);
		expect(rows().map((r) => r.querySelector(".sf-catalog-engine")?.textContent)).toEqual(["DataviewJS", "Dataview", "Bases"]);
		const row = rowNamed("Scenes at this location");
		expect(row.getAttribute("role")).toBe("option");
		expect(row.textContent).toBe("Scenes at this locationDataview00 Meta/Views/scenes-at-this-location.md");
		expect(row.querySelectorAll("button")).toHaveLength(0);
	});

	it("R2: a file that can't be parsed is listed as 'Can't import', by file name; a .base keeps its Bases pill", async () => {
		await openPicker({
			"00 Meta/Views/pacing-chart.md": new ImportError("ENGINE_MISMATCH", "sf-engine \"x\" contradicts the fenced block language \"y\""),
			"30 Canon/Broken test.base": new ImportError("INVALID_BASE", "This .base file is not a valid Bases file: bad"),
		});
		const note = rowNamed("pacing-chart");
		expect(note.querySelector(".sf-catalog-status")?.textContent).toBe("Can't import");
		expect(note.querySelector(".sf-catalog-status")?.classList.contains("is-bad")).toBe(true);
		expect(note.querySelector(".sf-catalog-engine")).toBeNull();
		expect(rowNamed("Broken test").querySelector(".sf-catalog-engine")?.textContent).toBe("Bases");
	});
});

// ---------------------------------------------------------------------------
// L11f(a)–(e) — parse refusals on selection (R2, R6)
// ---------------------------------------------------------------------------

describe("ImportPickerModal — a file that can't be imported, selected", () => {
	const cases: Array<{ name: string; error: Error; text: string; fix: string | null }> = [
		{
			name: "an invalid .base",
			error: new ImportError("INVALID_BASE", "This .base file is not a valid Bases file: Invalid BasesConfigFile: must have at least one of views, filters, or formulas", "base-invalid"),
			text: "This .base file is not a valid Bases file: Invalid BasesConfigFile: must have at least one of views, filters, or formulas",
			fix: "Add a views: list, filters: or formulas:, or open it in Bases to check it.",
		},
		{
			name: "no query block",
			error: new ImportError("NO_QUERY_BLOCK", "No query block found"),
			text: "No query block found",
			fix: "Add one ```dataview or ```dataviewjs block to the note.",
		},
		{
			name: "several query blocks",
			error: new ImportError("MULTIPLE_QUERY_BLOCKS", "A collection must contain exactly one query block"),
			text: "A collection must contain exactly one query block",
			fix: "Keep one block, or split the note into one note per query.",
		},
		{
			name: "an engine mismatch",
			error: new ImportError("ENGINE_MISMATCH", "sf-engine \"dataview-dql\" contradicts the fenced block language \"dataviewjs\""),
			text: "sf-engine \"dataview-dql\" contradicts the fenced block language \"dataviewjs\"",
			fix: "Make sf-engine match the block, or remove sf-engine: the block's language decides.",
		},
		{
			name: "a bad sf-version",
			error: new ImportError("INVALID_FRONTMATTER", "sf-version must be an integer", "sf-version"),
			text: "sf-version must be an integer",
			fix: "Use a whole number, like sf-version: 1.",
		},
		{
			name: "a bad sf-name",
			error: new ImportError("INVALID_FRONTMATTER", "sf-name must be a non-empty string", "sf-name"),
			text: "sf-name must be a non-empty string",
			fix: "Give it a name, or remove sf-name to use the file name.",
		},
		{
			name: "unreadable YAML (no fix line)",
			error: new ImportError("INVALID_BASE", "This .base file could not be read: bad indentation", "base-unreadable"),
			text: "This .base file could not be read: bad indentation",
			fix: null,
		},
	];

	for (const c of cases) {
		it(`L11f: ${c.name} shows the reason and its fix line as soon as it is selected, with no button`, async () => {
			const path = c.error instanceof ImportError && c.error.code === "INVALID_BASE" ? "30 Canon/broken.base" : "00 Meta/Views/broken.md";
			await openPicker({ [path]: c.error });
			rows()[0]!.click();
			const pane = detail();
			expect(pane.querySelector(".sf-catalog-preview-head .sf-catalog-status")?.textContent).toBe("Can't import");
			expect(pane.querySelector(".sf-catalog-label")?.textContent).toBe("Source file");
			expect(pane.querySelector(".sf-catalog-path")?.textContent).toBe(path);
			expect(pane.querySelector(".sf-catalog-hint")?.textContent).toBe(STAYS);
			const fb = feedback();
			expect(fb.getAttribute("role")).toBe("note");
			expect(fb.querySelector(".sf-catalog-feedback-text")?.textContent).toBe(c.text);
			expect(fb.querySelector(".sf-import-fix")?.textContent ?? null).toBe(c.fix);
			expect(actionButtons()).toHaveLength(0);
			expect(pane.querySelector(".sf-catalog-act")?.textContent).toBe(FIX_FILE);
			expect(pane.querySelector(".sf-import-surfaces")).toBeNull();
			expect(pane.querySelector("pre")).toBeNull();
		});
	}

	it("A3: picks the fix line by the error's detail, not by its message text", async () => {
		await openPicker({ "00 Meta/Views/x.md": new ImportError("INVALID_FRONTMATTER", "sf-version must be an integer", "sf-name") });
		rows()[0]!.click();
		expect(feedback().querySelector(".sf-catalog-feedback-text")?.textContent).toBe("sf-version must be an integer");
		expect(feedback().querySelector(".sf-import-fix")?.textContent).toBe("Give it a name, or remove sf-name to use the file name.");
	});

	it("draws the fix line's code as code", async () => {
		await openPicker({ "00 Meta/Views/x.md": new ImportError("NO_QUERY_BLOCK", "No query block found") });
		rows()[0]!.click();
		expect(Array.from(feedback().querySelectorAll(".sf-import-fix code")).map((c) => c.textContent))
			.toEqual(["```dataview", "```dataviewjs"]);
	});

	it("a scan-time failure that is not an ImportError reads 'Import failed: unexpected error'", async () => {
		vi.spyOn(console, "debug").mockImplementation(() => {});
		await openPicker({ "00 Meta/Views/x.md": new Error("boom") });
		rows()[0]!.click();
		expect(feedback().querySelector(".sf-catalog-feedback-text")?.textContent).toBe("Import failed: unexpected error");
		expect(feedback().querySelector(".sf-import-fix")).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// L11b / L11g(b) — search and engine filter (L10 Q2)
// ---------------------------------------------------------------------------

describe("ImportPickerModal — search and engine filter", () => {
	it("with 5 files or fewer there is no search and no filter", async () => {
		const five = Object.fromEntries(Object.entries(sixFiles()).slice(0, 5));
		await openPicker(five);
		expect(document.body.querySelector(".sf-picker-search")).toBeNull();
		expect(document.body.querySelector(".sf-catalog-filter")).toBeNull();
	});

	it("above 5: search takes focus; counts put a note with no engine in All only", async () => {
		await openPicker(sixFiles());
		expect(activeDocument.activeElement).toBe(document.body.querySelector(".sf-picker-search"));
		// 6 = 3 Bases (Broken test is a .base) + 1 Dataview + 1 DataviewJS + pacing-chart (no engine).
		expect(["All", "Bases", "Dataview", "DataviewJS"].map(filterCount)).toEqual(["6", "3", "1", "1"]);
	});

	it("search matches the name, the description and the path", async () => {
		await openPicker(sixFiles());
		typeSearch("faction");
		expect(visibleNames()).toEqual(["Characters by faction"]);
		typeSearch("grandparents");
		expect(visibleNames()).toEqual(["Family tree"]);
		typeSearch("manuscript");
		expect(visibleNames()).toEqual(["Draft board"]);
	});

	it("L11g(b): no match shows the L10 text and the placeholder", async () => {
		await openPicker(sixFiles());
		rowNamed("Draft board").click();
		typeSearch("relationship");
		expect(visibleNames()).toEqual([]);
		expect(document.body.querySelector(".sf-catalog-nomatch")?.textContent).toBe("No collections match \"relationship\".");
		expect(["All", "Bases", "Dataview", "DataviewJS"].map(filterCount)).toEqual(["0", "0", "0", "0"]);
		expect(detail().textContent).toContain(PLACEHOLDER);
	});
});

// ---------------------------------------------------------------------------
// L11c–e — the detail pane (R1, R5)
// ---------------------------------------------------------------------------

describe("ImportPickerModal — detail pane", () => {
	it("L11c: a .base shows source path, engine, Shows in (Anvil on), the YAML preview and Import", async () => {
		const path = "30 Canon/31 Characters/characters-by-faction.base";
		await openPicker({ [path]: baseDef(path, "Characters by faction") });
		rows()[0]!.click();
		const pane = detail();
		expect(pane.getAttribute("role")).toBe("region");
		expect(pane.querySelector(".sf-catalog-preview-title")?.textContent).toBe("Characters by faction");
		expect(pane.querySelector(".sf-catalog-preview-head .sf-catalog-engine")?.textContent).toBe("Bases");
		expect(pane.querySelector(".sf-catalog-preview-desc")).toBeNull();
		expect(Array.from(pane.querySelectorAll(".sf-catalog-label")).map((l) => l.textContent)).toEqual(["Source file", "Shows in", "Preview"]);
		expect(pane.querySelector(".sf-catalog-path")?.textContent).toBe(path);
		expect(Array.from(pane.querySelectorAll(".sf-catalog-hint")).map((h) => h.textContent)).toEqual([STAYS, CHANGE]);
		const surfaces = Array.from(pane.querySelectorAll(".sf-import-surfaces span"));
		expect(surfaces.map((s) => [s.textContent, s.className])).toEqual([["Anvil on", "is-on"], ["Workbench off", "is-off"]]);
		expect(pane.querySelector("pre.sf-catalog-preview-src")?.textContent).toBe(BASE_YAML.trimEnd());
		expect(pane.querySelector(".sf-catalog-safe")?.textContent).toBe("Safe: declarative query, no code.");
		expect(actionButtons().map((b) => b.textContent)).toEqual(["Import"]);
	});

	it("L11d: a Dataview note shows its description, Shows in (Workbench on), the query block and Import", async () => {
		const path = "00 Meta/Views/scenes-at-this-location.md";
		await openPicker({ [path]: dqlDef(path) });
		rows()[0]!.click();
		const pane = detail();
		expect(pane.querySelector(".sf-catalog-preview-desc")?.textContent).toBe("Scenes set at the open location, in story order.");
		expect(Array.from(pane.querySelectorAll(".sf-import-surfaces span")).map((s) => s.textContent)).toEqual(["Anvil off", "Workbench on"]);
		expect(Array.from(pane.querySelectorAll(".sf-catalog-label")).map((l) => l.textContent)).toEqual(["Source file", "Shows in", "Query"]);
		expect(pane.querySelector("pre")?.textContent).toBe(DQL_BODY.trimEnd());
		expect(actionButtons().map((b) => b.textContent)).toEqual(["Import"]);
	});

	it("L11e: a DataviewJS note shows the consent note and 'Review and import…'", async () => {
		const path = "00 Meta/Views/family-tree.md";
		await openPicker({ [path]: dvjsDef(path) });
		rows()[0]!.click();
		expect(detail().querySelector(".sf-catalog-safe")).toBeNull();
		expect(detail().querySelector(".sf-catalog-consent")?.textContent).toBe(
			"▲ Runs JavaScript. This collection runs code with full vault access. "
			+ "Review and import… shows you its code first. Nothing is saved until you enable it.",
		);
		expect(actionButtons().map((b) => b.textContent)).toEqual(["Review and import…"]);
	});
});

// ---------------------------------------------------------------------------
// R1 — what Import does
// ---------------------------------------------------------------------------

describe("ImportPickerModal — Import (R1)", () => {
	it("a .base saves at once, with no disclosure, its tokens from the parsed file", async () => {
		const path = "30 Canon/x.base";
		const def = baseDef(path);
		const { importer, gate } = await openPicker({ [path]: def });
		rows()[0]!.click();
		actionButtons()[0]!.click();
		await waitForFeedback();
		expect(gate.requestConsentForDef).not.toHaveBeenCalled();
		expect(importer.importToStore).toHaveBeenCalledWith(def, {
			okayed: { version: 0, checksum: def.checksum }, enabled: true, commandName: def.name,
		});
	});

	it("a Dataview note saves at once, with no disclosure, its tokens = { sf-version, block checksum }", async () => {
		const path = "00 Meta/Views/s.md";
		const def = dqlDef(path);
		const { importer, gate } = await openPicker({ [path]: def });
		rows()[0]!.click();
		actionButtons()[0]!.click();
		await waitForFeedback();
		expect(gate.requestConsentForDef).not.toHaveBeenCalled();
		expect(importer.importToStore).toHaveBeenCalledWith(def, {
			okayed: { version: 2, checksum: def.checksum }, enabled: true, commandName: def.name,
		});
	});

	it("a DataviewJS note opens the full disclosure with the freshly parsed definition first", async () => {
		const path = "00 Meta/Views/family-tree.md";
		const tokens = { version: 1, checksum: "sha256:ok" };
		const { importer, gate, parsed } = await openPicker({ [path]: dvjsDef(path) }, { consent: tokens });
		const fresh = dvjsDef(path, { name: "Family tree (edited)" });
		parsed.set(path, fresh);
		rows()[0]!.click();
		actionButtons()[0]!.click();
		await waitForFeedback();
		expect(gate.requestConsentForDef).toHaveBeenCalledWith(fresh);
		expect(importer.importToStore).toHaveBeenCalledWith(fresh, { okayed: tokens, enabled: true, commandName: fresh.name });
	});
});

// ---------------------------------------------------------------------------
// R4 — success
// ---------------------------------------------------------------------------

describe("ImportPickerModal — after a successful import (R4)", () => {
	it("L11f(i): the modal stays open, the row and header say ✓ Imported, and the message names the Anvil", async () => {
		const path = "30 Canon/31 Characters/characters-by-faction.base";
		const { modal } = await openPicker({ [path]: baseDef(path, "Characters by faction") });
		const closeSpy = vi.spyOn(modal, "close");
		rows()[0]!.click();
		actionButtons()[0]!.click();
		const fb = await waitForFeedback();
		expect(fb.textContent).toBe("Imported Characters by faction. It is in Library › Collections and shows in the Anvil.");
		expect(fb.classList.contains("sf-catalog-success")).toBe(true);
		expect(fb.getAttribute("role")).toBe("status");
		expect(activeDocument.activeElement).toBe(fb);
		expect(actionButtons()).toHaveLength(0);
		expect(detail().querySelector(".sf-catalog-preview-head .sf-catalog-status")?.textContent).toBe("✓ Imported");
		expect(rows()[0]!.querySelector(".sf-catalog-status")?.textContent).toBe("✓ Imported");
		expect(closeSpy).not.toHaveBeenCalled();
	});

	it("a Dataview import says it shows in the Workbench", async () => {
		const path = "00 Meta/Views/s.md";
		await openPicker({ [path]: dqlDef(path) });
		rows()[0]!.click();
		actionButtons()[0]!.click();
		expect((await waitForFeedback()).textContent)
			.toBe("Imported Scenes at this location. It is in Library › Collections and shows in the Workbench.");
	});
});

// ---------------------------------------------------------------------------
// L11f(f)–(h) — import-time refusals (R6)
// ---------------------------------------------------------------------------

describe("ImportPickerModal — refusals at Import", () => {
	async function importAndRefuse(
		changeTo: Parsed | null,
		opts: { importToStore?: () => Promise<string>; consent?: null } = {},
		def: ViewDefinition = baseDef("30 Canon/x.base"),
	): Promise<HTMLElement> {
		const h = await openPicker({ [def.sourcePath]: def }, opts);
		if (changeTo !== null) h.parsed.set(def.sourcePath, changeTo);
		rows()[0]!.click();
		actionButtons()[0]!.click();
		return waitForFeedback();
	}

	it.each([
		["could not be read", "This .base file could not be read: EACCES: permission denied", "base-unreadable"],
		["could not be found", "This .base file could not be found", "base-not-found"],
	] as const)("L11f(f): a .base that %s at Import shows today's text under the button, with no fix line", async (_l, message, why) => {
		const fb = await importAndRefuse(new ImportError("INVALID_BASE", message, why));
		expect(fb.getAttribute("role")).toBe("alert");
		expect(fb.querySelector(".sf-catalog-feedback-text")?.textContent).toBe(message);
		expect(fb.querySelector(".sf-import-fix")).toBeNull();
		expect(actionButtons().map((b) => b.textContent)).toEqual(["Import"]);
		expect(detail().querySelector(".sf-catalog-act")?.nextElementSibling).toBe(fb);
		expect(activeDocument.activeElement).toBe(actionButtons()[0]);
	});

	it("a note that changed since the scan is refused with its reason and fix line", async () => {
		const def = dqlDef("00 Meta/Views/s.md");
		const fb = await importAndRefuse(new ImportError("MULTIPLE_QUERY_BLOCKS", "A collection must contain exactly one query block"), {}, def);
		expect(fb.querySelector(".sf-catalog-feedback-text")?.textContent).toBe("A collection must contain exactly one query block");
		expect(fb.querySelector(".sf-import-fix")?.textContent).toBe("Keep one block, or split the note into one note per query.");
	});

	it("L11f(g): already in the Library is refused inline — no Notice", async () => {
		const fb = await importAndRefuse(null, {
			importToStore: async () => { throw new ImportError("DUPLICATE", "Collection already imported"); },
		});
		expect(fb.getAttribute("role")).toBe("alert");
		expect(fb.textContent).toBe("Not imported: 30 Canon/x.base is already in Library › Collections.");
		expect(Notice._instances).toHaveLength(0);
	});

	it("an unexpected error reads 'Import failed: unexpected error' inline — no Notice", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const fb = await importAndRefuse(null, { importToStore: async () => { throw new Error("disk full"); } });
		expect(fb.textContent).toBe("Import failed: unexpected error");
		expect(Notice._instances).toHaveLength(0);
	});

	it("L11f(h): a closed DataviewJS review is a neutral note; focus returns to the button", async () => {
		const fb = await importAndRefuse(null, { consent: null }, dvjsDef("00 Meta/Views/family-tree.md"));
		expect(fb.textContent).toBe("Not imported. You closed the review, so nothing was saved.");
		expect(fb.classList.contains("sf-catalog-neutral")).toBe(true);
		expect(fb.getAttribute("role")).toBe("status");
		expect(activeDocument.activeElement).toBe(actionButtons()[0]);
	});

	it("selecting another file clears an import-time message", async () => {
		const h = await openPicker({ "30 Canon/a.base": baseDef("30 Canon/a.base"), "30 Canon/b.base": baseDef("30 Canon/b.base") }, {
			importToStore: async () => { throw new ImportError("DUPLICATE", "x"); },
		});
		void h;
		rowNamed("a").click();
		actionButtons()[0]!.click();
		await waitForFeedback();
		rowNamed("b").click();
		expect(detail().querySelector(".sf-picker-feedback")).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// In flight (L10 carry-over)
// ---------------------------------------------------------------------------

describe("ImportPickerModal — an import in flight", () => {
	it("re-selecting a file whose import is in flight keeps its button disabled, and imports once", async () => {
		const pending = deferred<string>();
		const { importer } = await openPicker(
			{ "30 Canon/a.base": baseDef("30 Canon/a.base"), "30 Canon/b.base": baseDef("30 Canon/b.base") },
			{ importToStore: () => pending.promise },
		);
		rowNamed("a").click();
		actionButtons()[0]!.click();
		await vi.waitFor(() => expect(importer.importToStore).toHaveBeenCalledTimes(1));
		expect(actionButtons()[0]!.disabled).toBe(true);
		rowNamed("b").click();
		rowNamed("a").click();
		const again = actionButtons()[0]!;
		expect(again.disabled).toBe(true);
		again.click();
		// A raw event reaches the listener even on a disabled button: the guard, not the attribute, holds.
		again.dispatchEvent(new MouseEvent("click"));
		await new Promise((r) => setTimeout(r, 0));
		expect(importer.importToStore).toHaveBeenCalledTimes(1);
		expect(importer.parse).toHaveBeenCalledTimes(3); // the scan (two files), and one Import
		pending.resolve("id");
		await waitForFeedback();
	});

	it("an import that finishes after you moved on marks its row, and leaves the other pane alone", async () => {
		const pending = deferred<string>();
		await openPicker(
			{ "30 Canon/a.base": baseDef("30 Canon/a.base"), "30 Canon/b.base": baseDef("30 Canon/b.base") },
			{ importToStore: () => pending.promise },
		);
		rowNamed("a").click();
		actionButtons()[0]!.click();
		rowNamed("b").click();
		pending.resolve("id");
		await vi.waitFor(() => expect(rowNamed("a").querySelector(".sf-catalog-status")?.textContent).toBe("✓ Imported"));
		expect(detail().querySelector(".sf-catalog-preview-title")?.textContent).toBe("b");
		expect(detail().querySelector(".sf-picker-feedback")).toBeNull();
		expect(actionButtons().map((b) => [b.textContent, b.disabled])).toEqual([["Import", false]]);
	});
});

// ---------------------------------------------------------------------------
// L11h — stacked (L10 Q1 carry-over)
// ---------------------------------------------------------------------------

describe("ImportPickerModal — stacked layout", () => {
	const two = (): Record<string, Parsed> => ({ "30 Canon/a.base": baseDef("30 Canon/a.base"), "30 Canon/b.base": baseDef("30 Canon/b.base") });

	it("Down moves focus and the tab stop without selecting", async () => {
		await openPicker(two(), { width: 400 });
		const [a, b] = rows();
		a!.focus();
		a!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
		expect(activeDocument.activeElement).toBe(b);
		expect([a!.tabIndex, b!.tabIndex]).toEqual([-1, 0]);
		expect(rows().map((r) => r.getAttribute("aria-selected"))).toEqual(["false", "false"]);
		expect(detail().textContent).toContain(PLACEHOLDER);
	});

	it("Enter selects and opens the detail screen; '← All collections' goes back to that row", async () => {
		await openPicker(two(), { width: 400 });
		const b = rows()[1]!;
		b.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
		const split = document.body.querySelector(".sf-catalog-split")!;
		expect(b.getAttribute("aria-selected")).toBe("true");
		expect(split.classList.contains("is-detail")).toBe(true);
		const back = Array.from(detail().querySelectorAll("button")).find((x) => x.textContent === "← All collections")!;
		back.click();
		expect(split.classList.contains("is-detail")).toBe(false);
		expect(activeDocument.activeElement).toBe(b);
	});

	it("wide: Down selects (selection follows focus)", async () => {
		await openPicker(two());
		rows()[0]!.focus();
		rows()[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
		expect(rows()[1]!.getAttribute("aria-selected")).toBe("true");
	});
});

// ---------------------------------------------------------------------------
// Robustness: a throw never leaves the pane stuck (review fix 1, A1, A2)
// ---------------------------------------------------------------------------

describe("ImportPickerModal — when something throws", () => {
	it("the DataviewJS review rejecting shows the failure, re-enables the button, and a second click works", async () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const path = "00 Meta/Views/family-tree.md";
		const h = await openPicker({ [path]: dvjsDef(path) });
		vi.mocked(h.gate.requestConsentForDef)
			.mockRejectedValueOnce(new Error("modal blew up"))
			.mockResolvedValueOnce({ version: 1, checksum: "sha256:ok" });
		rows()[0]!.click();
		actionButtons()[0]!.click();
		const fb = await waitForFeedback();
		expect(fb.textContent).toBe("Import failed: unexpected error");
		expect(fb.getAttribute("role")).toBe("alert");
		expect(errorSpy).toHaveBeenCalled();
		expect(actionButtons()[0]!.disabled).toBe(false);
		actionButtons()[0]!.click();
		await vi.waitFor(() => expect(feedback().textContent).toContain("Imported Family tree."));
		expect(h.gate.requestConsentForDef).toHaveBeenCalledTimes(2);
	});

	it("parse rejecting at Import with a plain Error shows the failure, re-enables the button, and a second click works", async () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const path = "30 Canon/x.base";
		const h = await openPicker({ [path]: baseDef(path) });
		h.parsed.set(path, new Error("disk gone"));
		rows()[0]!.click();
		actionButtons()[0]!.click();
		expect((await waitForFeedback()).textContent).toBe("Import failed: unexpected error");
		expect(errorSpy).toHaveBeenCalled();
		expect(actionButtons()[0]!.disabled).toBe(false);
		h.parsed.set(path, baseDef(path));
		actionButtons()[0]!.click();
		await vi.waitFor(() => expect(feedback().textContent).toContain("Imported x."));
	});

	it.each([
		["scanVault rejects", "scan"],
		["the store cannot be read", "store"],
	] as const)("A2: when %s, an error line and Close are shown", async (_label, how) => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const app = new App();
		const store = makeStore();
		const importer = new ViewImporter(app, store);
		if (how === "scan") vi.spyOn(importer, "scanVault").mockRejectedValue(new Error("vault offline"));
		else vi.spyOn(store, "getViews").mockRejectedValue(new Error("data.json corrupt"));
		const modal = new ImportPickerModal(app, importer, { requestConsentForDef: vi.fn() } as unknown as ConsentGate);
		modal.open();
		const fb = await vi.waitFor(() => {
			const el = document.body.querySelector<HTMLElement>(".sf-picker-feedback");
			if (!el) throw new Error("no error line");
			return el;
		});
		expect(fb.getAttribute("role")).toBe("alert");
		expect(fb.querySelector(".sf-catalog-feedback-text")?.textContent).toBe("Could not list the vault's collections.");
		expect(fb.querySelector(".sf-catalog-raw")?.textContent).toBe(how === "scan" ? "vault offline" : "data.json corrupt");
		expect(document.body.querySelector(".sf-catalog-list")).toBeNull();
		expect(activeDocument.activeElement?.textContent).toBe("Close");
	});

	it("A1: closing while an import is in flight, then resolving, draws nothing and throws nothing", async () => {
		const pending = deferred<string>();
		const { modal } = await openPicker({ "30 Canon/a.base": baseDef("30 Canon/a.base") }, { importToStore: () => pending.promise });
		rows()[0]!.click();
		actionButtons()[0]!.click();
		await vi.waitFor(() => expect(document.body.querySelector(".sf-catalog-act button")).not.toBeNull());
		modal.close();
		pending.resolve("id");
		await new Promise((r) => setTimeout(r, 0));
		expect(modal.contentEl.childElementCount).toBe(0);
	});
});

describe("ImportPickerModal — unparseable candidate log", () => {
	it("logs with the [StoryForge] prefix the rest of the code uses", async () => {
		const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
		await openPicker({ "Views/Broken.md": new Error("nope") });
		const logged = spy.mock.calls.map((c) => String(c[0])).filter((m) => m.includes("could not parse"));
		expect(logged).toEqual(["[StoryForge] could not parse collection candidate"]);
		spy.mockRestore();
	});
});

