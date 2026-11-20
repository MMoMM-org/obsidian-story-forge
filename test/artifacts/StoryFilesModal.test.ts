/**
 * T3.2 – StoryFilesModal: the "Set up story files" dialog (spec 010 mockups S2–S5).
 *
 * Real planSetup, executePlan, managedFileWriter and ArtifactStore over the in-memory vault and
 * a fake data.json port; only the settings and the excluded-folders call are injected doubles.
 *
 * @ref PRD/F2.3 (per-file preview), F2.5 (deselect), F2.6 (cancel), F2.7 (result notice),
 *      F3.2 (folder change saved — on confirm only, O1), F3.3 (not-excluded warning), F4.5
 * @ref mockups.html S2–S5, D4–D10, O1, O3–O6
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, Notice, wireMemoryVault, type MemoryVault } from "obsidian";
import { ArtifactStore } from "../../src/artifacts/ArtifactStore";
import type {
	ArtifactEntry,
	ArtifactFolders,
	ArtifactIndex,
	ArtifactRecord,
	ArtifactRecords,
	ArtifactSet,
} from "../../src/artifacts/artifactTypes";
import { StoryFilesModal, openStoryFiles, type StoryFilesDeps, type StoryFilesSettings } from "../../src/artifacts/StoryFilesModal";
import { computeChecksum } from "../../src/consent/checksum";
import { createDataFile } from "../../src/store/dataFileQueue";
import type { PluginDataPort } from "../../src/store/types";
import { sentenceCaseViolations } from "../helpers/sentenceCase";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VERSION = "0.2.0";
const DEFAULTS: ArtifactFolders = {
	fileClassesFolder: "00 Meta/FileClasses",
	templatesFolder: "00 Meta/Templates",
	schemaFolder: "00 Meta/Schema",
};

async function entry(set: ArtifactSet, relPath: string, source = `---\nkind: ${relPath}\n---\nbody\n`): Promise<ArtifactEntry> {
	return { id: `${set}/${relPath}`, set, relPath, source, checksum: await computeChecksum(source), placeholders: [] };
}

/** fc-b uses fc-list as a value list (as fc-character-fantasy uses fc-armor). README sits last in index order. */
async function makeIndex(): Promise<ArtifactIndex> {
	return {
		version: "1",
		entries: [
			await entry("fileclasses", "fc-a.md"),
			await entry("fileclasses", "fc-b.md", "---\nfields:\n  - valuesListNotePath: {{sf:fileClassesFolder}}/fc-list.md\n---\n"),
			await entry("templates", "t-a.md"),
			await entry("schema", "s-a.md"),
			await entry("fileclasses", "fc-list.md", ""),
			await entry("schema", "README.md"),
		],
	};
}

interface Port extends PluginDataPort {
	data: unknown;
	saves: number;
}

function fakePort(initial: unknown = {}): Port {
	let data: unknown = structuredClone(initial);
	const port: Port = {
		get data() { return data; },
		saves: 0,
		async load() { return structuredClone(data); },
		async save(d: unknown) {
			port.saves++;
			data = structuredClone(d);
		},
	};
	return port;
}

async function record(path: string, sourceText: string, instanceText: string, params = DEFAULTS): Promise<ArtifactRecord> {
	return {
		path,
		sourceChecksum: await computeChecksum(sourceText),
		instanceChecksum: await computeChecksum(instanceText),
		params: { ...params },
		pluginVersion: "0.1.0",
	};
}

let app: App;
let mem: MemoryVault;
let index: ArtifactIndex;
let settings: StoryFilesSettings;
let saveFolders: ReturnType<typeof vi.fn<(folders: ArtifactFolders) => Promise<void>>>;
let addExcludedFolder: ReturnType<typeof vi.fn<(folder: string) => Promise<void>>>;
let port: Port;
let modal: StoryFilesModal | null;

beforeEach(async () => {
	document.body.empty();
	Notice._reset();
	app = new App();
	mem = wireMemoryVault(app);
	index = await makeIndex();
	settings = { ...DEFAULTS, excludedFolders: ["00 Meta"] };
	saveFolders = vi.fn(async (folders: ArtifactFolders) => {
		settings = { ...settings, ...folders };
	});
	addExcludedFolder = vi.fn(async (folder: string) => {
		settings = { ...settings, excludedFolders: [...settings.excludedFolders, folder] };
	});
	port = fakePort();
	modal = null;
});

afterEach(() => {
	vi.restoreAllMocks();
});

let store: ArtifactStore;

function deps(): StoryFilesDeps {
	store = new ArtifactStore(createDataFile(port));
	return {
		app,
		settings: () => settings,
		saveFolders,
		addExcludedFolder,
		store,
		index,
		pluginVersion: VERSION,
	};
}

async function open(): Promise<StoryFilesModal> {
	modal = openStoryFiles(deps());
	await vi.waitFor(() => expect(document.querySelectorAll(".sf-story-set")).toHaveLength(3));
	return modal;
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document): T => {
	const el = root.querySelector<T>(sel);
	if (!el) throw new Error(`not found: ${sel}`);
	return el;
};
const setEl = (set: ArtifactSet): HTMLElement => $(`.sf-story-set[data-set="${set}"]`);
const setBox = (set: ArtifactSet): HTMLInputElement => $<HTMLInputElement>(".sf-story-set-cb", setEl(set));
const rowEl = (path: string): HTMLElement => $(`.sf-story-row[data-path="${path}"]`);
const rowBox = (path: string): HTMLInputElement | null => rowEl(path).querySelector<HTMLInputElement>(".sf-story-row-cb");
const actOf = (path: string): string => $(".sf-story-act", rowEl(path)).textContent ?? "";
const whyOf = (path: string): string => rowEl(path).querySelector(".sf-story-why")?.textContent ?? "";
const chips = (set: ArtifactSet): string[] => [...setEl(set).querySelectorAll(".sf-story-chip")].map((c) => c.textContent ?? "");
const primary = (): HTMLButtonElement => $<HTMLButtonElement>(".sf-picker-foot button.mod-cta");
const cancel = (): HTMLButtonElement => $<HTMLButtonElement>(".sf-picker-foot button:not(.mod-cta)");
const folderInput = (set: ArtifactSet): HTMLInputElement => $<HTMLInputElement>(".sf-story-folder input", setEl(set));
const rowPaths = (set: ArtifactSet): string[] =>
	[...setEl(set).querySelectorAll<HTMLElement>(".sf-story-row")].map((r) => r.dataset["path"] ?? "");

function toggle(box: HTMLInputElement): void {
	box.click(); // jsdom flips `checked` and fires input + change, as a browser does
}

function typeFolder(set: ArtifactSet, value: string): void {
	const input = folderInput(set);
	input.value = value;
	input.dispatchEvent(new Event("input", { bubbles: true }));
	input.dispatchEvent(new Event("change", { bubbles: true }));
}

/** Type `value` into the set's folder field and wait for the set's replan (`data-folder`). */
async function changeFolder(set: ArtifactSet, value: string, expected = value.replace(/\/+$/, "")): Promise<void> {
	typeFolder(set, value);
	await vi.waitFor(() => expect(setEl(set).dataset["folder"]).toBe(expected));
}

/** Every vault mutator in the mock, plus the data.json saves. */
function writes(): number {
	const v = app.vault;
	return (
		vi.mocked(v.create).mock.calls.length +
		vi.mocked(v.process).mock.calls.length +
		vi.mocked(v.modify).mock.calls.length +
		vi.mocked(v.createFolder).mock.calls.length +
		vi.mocked(v.delete).mock.calls.length +
		vi.mocked(v.trash).mock.calls.length +
		vi.mocked(v.rename).mock.calls.length +
		vi.mocked(v.append).mock.calls.length +
		vi.mocked(app.fileManager.trashFile).mock.calls.length +
		port.saves
	);
}

/** Reading any of `paths` throws "EACCES: permission denied" (each file is put in the vault). */
function unreadable(...paths: string[]): void {
	for (const p of paths) if (!mem.files.has(p)) mem.files.set(p, "x");
	const read = vi.mocked(app.vault.read).getMockImplementation()!;
	vi.mocked(app.vault.read).mockImplementation(async (file) => {
		if (paths.includes(file.path)) throw new Error("EACCES: permission denied");
		return read(file);
	});
}

async function confirm(): Promise<void> {
	primary().click();
	await vi.waitFor(() => expect(Notice._instances).toHaveLength(1));
}

// ---------------------------------------------------------------------------
// S2 — fresh vault
// ---------------------------------------------------------------------------

describe("StoryFilesModal — fresh vault (S2)", () => {
	it("opens with three sets, each with checkbox, name, count, folder and chips, collapsed", async () => {
		await open();
		expect($(".sf-story h2").textContent).toBe("Set up story files");
		const names = [...document.querySelectorAll(".sf-story-set-name")].map((n) => n.textContent);
		expect(names).toEqual(["FileClasses", "Templates", "Schema reference"]);
		expect([...document.querySelectorAll(".sf-story-set-count")].map((n) => n.textContent)).toEqual(["3 files", "1 file", "2 files"]);
		expect(folderInput("fileclasses").value).toBe("00 Meta/FileClasses");
		expect(folderInput("templates").value).toBe("00 Meta/Templates");
		expect(folderInput("schema").value).toBe("00 Meta/Schema");
		expect(setBox("fileclasses").checked).toBe(true);
		expect(chips("fileclasses")).toEqual(["3 create"]);
		expect(chips("schema")).toEqual(["2 create"]);
		for (const set of ["fileclasses", "templates", "schema"] as const) {
			expect($(".sf-story-rows", setEl(set)).classList.contains("sf-hidden")).toBe(true);
			expect($(".sf-story-toggle", setEl(set)).textContent).toBe("▸ Show files");
		}
		expect(primary().textContent).toBe("Set up 6 files");
		expect(cancel().textContent).toBe("Cancel");
		expect($(".sf-story-foot-aside").textContent).toBe("Folders that do not exist yet are created.");
		expect($(".sf-story-foot-aside").classList.contains("sf-hidden")).toBe(false);
		expect($(".sf-picker-foot").firstElementChild?.classList.contains("sf-story-foot-aside")).toBe(true);
		expect(document.activeElement).toBe(setBox("fileclasses"));
	});

	it("has one row per file from planSetup: own ticked checkbox, file name, Create; README first", async () => {
		await open();
		expect(rowPaths("fileclasses")).toEqual(["00 Meta/FileClasses/fc-a.md", "00 Meta/FileClasses/fc-b.md", "00 Meta/FileClasses/fc-list.md"]);
		expect(rowPaths("schema")).toEqual(["00 Meta/Schema/README.md", "00 Meta/Schema/s-a.md"]);
		const row = rowEl("00 Meta/FileClasses/fc-a.md");
		expect($(".sf-story-file", row).textContent).toBe("fc-a.md");
		expect(actOf("00 Meta/FileClasses/fc-a.md")).toBe("Create");
		expect(rowBox("00 Meta/FileClasses/fc-a.md")?.checked).toBe(true);
	});

	it("labels a value list with the FileClass that uses it (S2b)", async () => {
		await open();
		expect($(".sf-story-hint", rowEl("00 Meta/FileClasses/fc-list.md")).textContent).toBe("value list for fc-b");
		expect(rowEl("00 Meta/FileClasses/fc-a.md").querySelector(".sf-story-hint")).toBeNull();
	});

	it("Show files expands the set's rows and flips its label", async () => {
		await open();
		const tog = $<HTMLButtonElement>(".sf-story-toggle", setEl("templates"));
		tog.click();
		expect($(".sf-story-rows", setEl("templates")).classList.contains("sf-hidden")).toBe(false);
		expect(tog.textContent).toBe("▾ Hide files");
		expect(tog.getAttribute("aria-expanded")).toBe("true");
	});

	it("omits the folder aside when every create goes into an existing folder", async () => {
		for (const f of ["00 Meta", "00 Meta/FileClasses", "00 Meta/Templates", "00 Meta/Schema"]) mem.folders.add(f);
		await open();
		expect($(".sf-story-foot-aside").classList.contains("sf-hidden")).toBe(true);
	});

	it("clicking rows, names, chips, the toggle and checkboxes writes nothing", async () => {
		await open();
		for (const el of document.querySelectorAll<HTMLElement>(".sf-story-row, .sf-story-file, .sf-story-set-name, .sf-story-chip, .sf-story-toggle")) el.click();
		toggle(rowBox("00 Meta/FileClasses/fc-a.md")!);
		toggle(setBox("schema"));
		await Promise.resolve();
		expect(writes()).toBe(0);
		expect(saveFolders).not.toHaveBeenCalled();
		expect(addExcludedFolder).not.toHaveBeenCalled();
		expect(Notice._instances).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// Deselect (F2.5) and per-file choice (D5)
// ---------------------------------------------------------------------------

describe("StoryFilesModal — deselect and per-file choice", () => {
	it("unticking a set dims it, keeps its chips, drops its count, and its files are not written", async () => {
		await open();
		toggle(setBox("schema"));
		expect(setEl("schema").classList.contains("is-off")).toBe(true);
		expect(chips("schema")).toEqual(["2 create"]);
		expect(rowBox("00 Meta/Schema/s-a.md")?.checked).toBe(false);
		expect(primary().textContent).toBe("Set up 4 files");
		await confirm();
		expect(mem.files.has("00 Meta/FileClasses/fc-a.md")).toBe(true);
		expect(mem.files.has("00 Meta/Schema/s-a.md")).toBe(false);
		expect(mem.files.has("00 Meta/Schema/README.md")).toBe(false);
	});

	it("unticking one row makes the set checkbox mixed and leaves only that file unwritten", async () => {
		await open();
		toggle(rowBox("00 Meta/FileClasses/fc-list.md")!);
		expect(setBox("fileclasses").indeterminate).toBe(true);
		expect(primary().textContent).toBe("Set up 5 files");
		await confirm();
		expect(mem.files.has("00 Meta/FileClasses/fc-list.md")).toBe(false);
		expect(mem.files.has("00 Meta/FileClasses/fc-b.md")).toBe(true);
	});

	it("ticking a set again ticks all its rows", async () => {
		await open();
		toggle(rowBox("00 Meta/FileClasses/fc-a.md")!);
		toggle(setBox("fileclasses"));
		expect(setBox("fileclasses").checked).toBe(true);
		expect(setBox("fileclasses").indeterminate).toBe(false);
		expect(rowBox("00 Meta/FileClasses/fc-a.md")?.checked).toBe(true);
		expect(primary().textContent).toBe("Set up 6 files");
	});

	it("with nothing ticked the primary button reads Nothing to set up and is disabled", async () => {
		await open();
		for (const set of ["fileclasses", "templates", "schema"] as const) toggle(setBox(set));
		expect(primary().textContent).toBe("Nothing to set up");
		expect(primary().disabled).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Cancel (F2.6) and folder change (D7, O1)
// ---------------------------------------------------------------------------

describe("StoryFilesModal — cancel and folder change", () => {
	it("Cancel closes and writes nothing", async () => {
		const m = await open();
		cancel().click();
		expect(m.close).toHaveBeenCalled();
		expect(writes()).toBe(0);
		expect(Notice._instances).toHaveLength(0);
	});

	it("closing (Escape / ✕) writes nothing", async () => {
		const m = await open();
		m.close();
		await Promise.resolve();
		expect(writes()).toBe(0);
		expect(Notice._instances).toHaveLength(0);
	});

	it("a folder change replans the set as a preview and saves nothing", async () => {
		await open();
		await changeFolder("templates", "Writing/Templates");
		expect(rowPaths("templates")).toEqual(["Writing/Templates/t-a.md"]);
		expect(saveFolders).not.toHaveBeenCalled();
		expect(writes()).toBe(0);
	});

	it("Cancel after a folder change changes no setting (O1)", async () => {
		const m = await open();
		await changeFolder("templates", "Writing/Templates");
		cancel().click();
		expect(m.close).toHaveBeenCalled();
		expect(saveFolders).not.toHaveBeenCalled();
		expect(settings.templatesFolder).toBe("00 Meta/Templates");
		expect(writes()).toBe(0);
	});

	it("confirm saves the changed folder and writes into it", async () => {
		await open();
		await changeFolder("templates", "Writing/Templates/");
		await confirm();
		expect(saveFolders).toHaveBeenCalledWith({ ...DEFAULTS, templatesFolder: "Writing/Templates" });
		expect(mem.files.has("Writing/Templates/t-a.md")).toBe(true);
		expect(mem.files.has("00 Meta/Templates/t-a.md")).toBe(false);
	});

	it("confirm without a folder change saves no setting", async () => {
		await open();
		await confirm();
		expect(saveFolders).not.toHaveBeenCalled();
	});

	it("an emptied folder field falls back to the set's default folder, as the settings fields do", async () => {
		settings = { ...settings, templatesFolder: "Writing/Templates" };
		await open();
		await changeFolder("templates", "   ", "00 Meta/Templates");
		expect(folderInput("templates").value).toBe("00 Meta/Templates");
		expect(rowPaths("templates")).toEqual(["00 Meta/Templates/t-a.md"]);
	});

	it("a malformed folder field (slashes only) falls back to the default folder", async () => {
		settings = { ...settings, schemaFolder: "Writing/Schema", fileClassesFolder: "Writing/Classes" };
		await open();
		await changeFolder("schema", "///", "00 Meta/Schema");
		await changeFolder("fileclasses", "  ", "00 Meta/FileClasses");
		expect(folderInput("schema").value).toBe("00 Meta/Schema");
		expect(folderInput("fileclasses").value).toBe("00 Meta/FileClasses");
	});
});

describe("StoryFilesModal — replan failure", () => {
	async function failReplan(): Promise<void> {
		await open();
		vi.spyOn(store, "all").mockImplementationOnce(() => {
			throw new Error("store gone");
		});
		vi.spyOn(console, "error").mockImplementation(() => {});
		typeFolder("templates", "Writing/Templates");
		await vi.waitFor(() => expect(setEl("templates").querySelector(".sf-story-error")).not.toBeNull());
	}

	it("restores the previous folder in the field and shows the error in the set card", async () => {
		await failReplan();
		expect(folderInput("templates").value).toBe("00 Meta/Templates");
		const err = $(".sf-story-error", setEl("templates"));
		expect(err.getAttribute("role")).toBe("alert");
		expect(err.textContent).toBe("Could not check Writing/Templates: store gone. The folder stays 00 Meta/Templates.");
		expect(setEl("fileclasses").querySelector(".sf-story-error")).toBeNull();
	});

	it("restores the folder state too: no warning for the folder that was not planned", async () => {
		await failReplan();
		expect(setEl("templates").querySelector(".sf-story-warn")).toBeNull();
	});

	it("confirm then writes the plan's folder and saves no setting", async () => {
		await failReplan();
		expect(primary().disabled).toBe(false);
		await confirm();
		expect(saveFolders).not.toHaveBeenCalled();
		expect(mem.files.has("00 Meta/Templates/t-a.md")).toBe(true);
		expect(mem.files.has("Writing/Templates/t-a.md")).toBe(false);
	});

	it("a later successful replan clears the error", async () => {
		await failReplan();
		await changeFolder("templates", "00 Meta/Other");
		expect(setEl("templates").querySelector(".sf-story-error")).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// S4 — folder not excluded (F3.3, D9)
// ---------------------------------------------------------------------------

describe("StoryFilesModal — folder not excluded (S4)", () => {
	it("shows no warning for folders inside the excluded folders", async () => {
		await open();
		expect(document.querySelector(".sf-story-warn")).toBeNull();
	});

	it("warns in the set card when the folder is outside the excluded folders, after a change too", async () => {
		await open();
		await changeFolder("templates", "Templates");
		const warn = $(".sf-story-warn", setEl("templates"));
		expect(warn.getAttribute("role")).toBe("note");
		expect(warn.textContent).toContain("▲ Not in your excluded folders.");
		expect(warn.textContent).toContain(
			"Notes in Templates will be treated as story entities: they show up in the Anvil, the Workbench and your collections next to your real characters and scenes. Your excluded folders are 00 Meta.",
		);
		expect(setEl("fileclasses").querySelector(".sf-story-warn")).toBeNull();
		expect(primary().disabled).toBe(false);
	});

	it("uses the scopes' path-segment match: a sibling with the same prefix is not excluded", async () => {
		await open();
		await changeFolder("schema", "00 Metadata/Schema");
		expect(setEl("schema").querySelector(".sf-story-warn")).not.toBeNull();
	});

	it("with no excluded folders it warns for every set and says so", async () => {
		settings = { ...settings, excludedFolders: [] };
		await open();
		expect(document.querySelectorAll(".sf-story-warn")).toHaveLength(3);
		expect($(".sf-story-warn").textContent).toContain("You have no excluded folders.");
	});

	it("Add … to excluded folders changes that setting only and replaces the warning (S4b)", async () => {
		await open();
		await changeFolder("templates", "Templates");
		const before = writes();
		$<HTMLButtonElement>(".sf-story-warn button", setEl("templates")).click();
		await vi.waitFor(() => expect(setEl("templates").querySelector(".sf-story-warn")).toBeNull());
		expect(addExcludedFolder).toHaveBeenCalledWith("Templates");
		expect($(".sf-story-note", setEl("templates")).textContent).toBe(
			"✓ Templates added to your excluded folders. Change them in Settings › Scope › Excluded folders.",
		);
		expect(writes()).toBe(before);
		expect(saveFolders).not.toHaveBeenCalled();
	});

	it("a failed add says so in a notice and keeps the warning", async () => {
		addExcludedFolder.mockRejectedValueOnce(new Error("store busy"));
		vi.spyOn(console, "error").mockImplementation(() => {});
		await open();
		await changeFolder("templates", "Templates");
		const btn = $<HTMLButtonElement>(".sf-story-warn button", setEl("templates"));
		btn.click();
		await vi.waitFor(() => expect(Notice._instances).toHaveLength(1));
		expect(Notice._instances[0]!.message).toBe("Could not add Templates to excluded folders: store busy");
		expect(setEl("templates").querySelector(".sf-story-warn")).not.toBeNull();
		expect(setEl("templates").querySelector(".sf-story-note")).toBeNull();
		expect(btn.disabled).toBe(false);
	});

	it("the warning button is labelled with the folder", async () => {
		await open();
		await changeFolder("templates", "Writing/Templates");
		expect($(".sf-story-warn button", setEl("templates")).textContent).toBe("Add Writing/Templates to excluded folders");
	});
});

// ---------------------------------------------------------------------------
// S3 — mixed
// ---------------------------------------------------------------------------

async function mixedVault(): Promise<void> {
	const [fcA, fcB, tA, sA, fcList, readme] = index.entries as [ArtifactEntry, ArtifactEntry, ArtifactEntry, ArtifactEntry, ArtifactEntry, ArtifactEntry];
	const records: ArtifactRecords = {};
	// fc-a: update available (installed an older source, file unchanged since).
	mem.files.set("00 Meta/FileClasses/fc-a.md", "old fc-a");
	records[fcA.id] = await record("00 Meta/FileClasses/fc-a.md", "old source", "old fc-a");
	// fc-b: edited after install.
	mem.files.set("00 Meta/FileClasses/fc-b.md", "my edits");
	records[fcB.id] = await record("00 Meta/FileClasses/fc-b.md", "old source", "old fc-b");
	// fc-list: set up, then deleted.
	records[fcList.id] = await record("00 Meta/FileClasses/fc-list.md", fcList.source, fcList.source);
	// t-a: up to date.
	mem.files.set("00 Meta/Templates/t-a.md", tA.source);
	records[tA.id] = await record("00 Meta/Templates/t-a.md", tA.source, tA.source);
	// README: the user's own file.
	mem.files.set("00 Meta/Schema/README.md", "mine");
	// s-a: unreadable.
	mem.files.set("00 Meta/Schema/s-a.md", "x");
	void sA;
	void readme;
	for (const f of ["00 Meta", "00 Meta/FileClasses", "00 Meta/Templates", "00 Meta/Schema"]) mem.folders.add(f);
	port = fakePort({ artifacts: records });
	const read = vi.mocked(app.vault.read).getMockImplementation()!;
	vi.mocked(app.vault.read).mockImplementation(async (file) => {
		if (file.path === "00 Meta/Schema/s-a.md") throw new Error("EACCES: permission denied");
		return read(file);
	});
}

describe("StoryFilesModal — mixed (S3)", () => {
	beforeEach(mixedVault);

	it("labels every action, with checkboxes only on rows that write", async () => {
		await open();
		expect(actOf("00 Meta/FileClasses/fc-a.md")).toBe("Update");
		expect(rowBox("00 Meta/FileClasses/fc-a.md")?.checked).toBe(true);
		expect(actOf("00 Meta/FileClasses/fc-b.md")).toBe("Not updated");
		expect(rowBox("00 Meta/FileClasses/fc-b.md")).toBeNull();
		expect(whyOf("00 Meta/FileClasses/fc-b.md")).toBe(
			"Not updated: 00 Meta/FileClasses/fc-b.md was edited after it was installed, and updating would overwrite those edits.",
		);
		expect(actOf("00 Meta/Templates/t-a.md")).toBe("Up to date");
		expect(rowBox("00 Meta/Templates/t-a.md")).toBeNull();
		expect(rowEl("00 Meta/Templates/t-a.md").classList.contains("is-dim")).toBe(true);
		expect(actOf("00 Meta/Schema/README.md")).toBe("Already there");
		expect(rowBox("00 Meta/Schema/README.md")).toBeNull();
		expect(rowEl("00 Meta/Schema/README.md").classList.contains("is-dim")).toBe(true);
		expect($(".sf-story-act", rowEl("00 Meta/Schema/README.md")).classList.contains("is-ok")).toBe(true);
		expect(whyOf("00 Meta/Schema/README.md")).toBe("Your own file, different from Story Forge's copy. Story Forge never overwrites it.");
		expect(actOf("00 Meta/Schema/s-a.md")).toBe("Unreadable");
		expect(rowBox("00 Meta/Schema/s-a.md")).toBeNull();
		expect(whyOf("00 Meta/Schema/s-a.md")).toBe("Not installed: could not read 00 Meta/Schema/s-a.md: EACCES: permission denied");
	});

	it("shows a missing file unticked with the visible label Set up again (F4.5, O5)", async () => {
		await open();
		const path = "00 Meta/FileClasses/fc-list.md";
		expect(actOf(path)).toBe("Missing");
		const box = rowBox(path)!;
		expect(box.checked).toBe(false);
		const label = $<HTMLLabelElement>("label.sf-story-again", rowEl(path));
		expect(label.textContent).toBe("Set up again");
		expect(label.htmlFor).toBe(box.id);
		expect(whyOf(path)).toBe(`${path} was set up but is no longer there. It is not recreated unless you tick Set up again.`);
	});

	it("chips count each action and a set with something to look at opens on its own (D4)", async () => {
		await open();
		expect(chips("fileclasses")).toEqual(["1 update", "1 edited", "1 missing"]);
		expect(chips("templates")).toEqual(["1 up to date"]);
		expect(chips("schema")).toEqual(["1 already there", "1 unreadable"]);
		expect($(".sf-story-rows", setEl("fileclasses")).classList.contains("sf-hidden")).toBe(false);
		expect($(".sf-story-rows", setEl("schema")).classList.contains("sf-hidden")).toBe(false);
		expect($(".sf-story-rows", setEl("templates")).classList.contains("sf-hidden")).toBe(true);
	});

	it("orders rows: writes first, then rows that need you, then up to date", async () => {
		await open();
		expect(rowPaths("fileclasses")).toEqual([
			"00 Meta/FileClasses/fc-a.md",
			"00 Meta/FileClasses/fc-list.md",
			"00 Meta/FileClasses/fc-b.md",
		]);
	});

	it("puts Already there with the dimmed rows, after the rows that need you (R1)", async () => {
		await open();
		expect(rowPaths("schema")).toEqual(["00 Meta/Schema/s-a.md", "00 Meta/Schema/README.md"]);
	});

	it("set checkbox is mixed while the missing row is unticked; the button counts updates", async () => {
		await open();
		expect(setBox("fileclasses").indeterminate).toBe(true);
		expect(primary().textContent).toBe("Update 1 file");
		toggle(rowBox("00 Meta/FileClasses/fc-list.md")!);
		expect(primary().textContent).toBe("Set up and update 2 files");
	});

	it("a set with nothing to write has a disabled checkbox", async () => {
		await open();
		expect(setBox("templates").disabled).toBe(true);
		expect(setBox("schema").disabled).toBe(true);
	});

	it("does not recreate a missing file unless it is ticked", async () => {
		await open();
		await confirm();
		expect(mem.files.has("00 Meta/FileClasses/fc-list.md")).toBe(false);
		expect(mem.files.get("00 Meta/FileClasses/fc-a.md")).toBe(index.entries[0]!.source);
	});

	it("recreates a missing file when Set up again is ticked", async () => {
		await open();
		toggle(rowBox("00 Meta/FileClasses/fc-list.md")!);
		await confirm();
		expect(mem.files.get("00 Meta/FileClasses/fc-list.md")).toBe("");
	});

	it("shows a damaged bundled file as Damaged with the raw reason", async () => {
		index.entries[3] = { ...index.entries[3]!, checksum: `sha256:${"0".repeat(64)}` };
		await open();
		const path = "00 Meta/Schema/s-a.md";
		expect(actOf(path)).toBe("Damaged");
		expect(rowBox(path)).toBeNull();
		expect($(".sf-story-why", rowEl(path)).firstChild?.textContent).toBe(
			"Not installed: the bundled copy of this file is damaged, so nothing was written. Reinstalling Story Forge restores it.",
		);
		expect($(".sf-catalog-raw", rowEl(path)).textContent).toBe("checksum mismatch");
	});
});

describe("StoryFilesModal — setting now points elsewhere (S3, D8)", () => {
	it("shows one note per set when its files were set up in another folder", async () => {
		const tA = index.entries[2]!;
		mem.files.set("00 Meta/Templates/t-a.md", tA.source);
		port = fakePort({ artifacts: { [tA.id]: await record("00 Meta/Templates/t-a.md", tA.source, tA.source) } });
		settings = { ...settings, templatesFolder: "Writing/Templates" };
		await open();
		expect($(".sf-story-moved", setEl("templates")).textContent).toBe(
			"These files were set up in 00 Meta/Templates. The setting now points to Writing/Templates; updates stay where the files are. Files set up from now on go to the new folder.",
		);
		expect(setEl("fileclasses").querySelector(".sf-story-moved")).toBeNull();
		expect($(".sf-story-file", rowEl("00 Meta/Templates/t-a.md")).textContent).toBe("t-a.md");
	});
});

// ---------------------------------------------------------------------------
// R1 — files already there, not written by Story Forge
// ---------------------------------------------------------------------------

describe("StoryFilesModal — files already there (R1)", () => {
	it("says a file with the shipped bytes has the same content but was not written by Story Forge", async () => {
		mem.files.set("00 Meta/Schema/README.md", index.entries[5]!.source);
		await open();
		expect(actOf("00 Meta/Schema/README.md")).toBe("Already there");
		expect(whyOf("00 Meta/Schema/README.md")).toBe("Same content as Story Forge's copy, but not written by Story Forge.");
	});

	it("says once under the folder when every file of a set is already there, and disables the set", async () => {
		for (const e of index.entries.filter((x) => x.set === "fileclasses")) mem.files.set(`00 Meta/FileClasses/${e.relPath}`, e.source);
		await open();
		const line = $(".sf-story-there", setEl("fileclasses"));
		expect(line.getAttribute("role")).toBe("note");
		expect(line.textContent).toBe(
			"All 3 files are already in 00 Meta/FileClasses, and Story Forge did not write them, so it leaves them alone and will not update them. To get Story Forge's copies, choose another folder, or move these files away first.",
		);
		expect($(".sf-story-path", line).textContent).toBe("00 Meta/FileClasses");
		expect(sentenceCaseViolations(line.textContent ?? "", ["00 Meta/FileClasses"])).toEqual([]);
		expect(setBox("fileclasses").disabled).toBe(true);
		expect(chips("fileclasses")).toEqual(["3 already there"]);
		expect(setEl("schema").querySelector(".sf-story-there")).toBeNull();
	});

	it("uses the singular for a set of one file", async () => {
		mem.files.set("00 Meta/Templates/t-a.md", "mine");
		await open();
		expect($(".sf-story-there", setEl("templates")).textContent).toBe(
			"The file is already in 00 Meta/Templates, and Story Forge did not write it, so it leaves it alone and will not update it. To get Story Forge's copy, choose another folder, or move this file away first.",
		);
	});

	it("draws no set line when only some files of the set are already there", async () => {
		mem.files.set("00 Meta/FileClasses/fc-a.md", "mine");
		await open();
		expect(setEl("fileclasses").querySelector(".sf-story-there")).toBeNull();
		expect(setBox("fileclasses").disabled).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// S5 — result notice (F2.7, D10)
// ---------------------------------------------------------------------------

describe("StoryFilesModal — result notice (S5)", () => {
	it("confirm writes every ticked file, records it, closes and shows one success notice", async () => {
		const m = await open();
		await confirm();
		expect([...mem.files.keys()].sort()).toEqual([
			"00 Meta/FileClasses/fc-a.md",
			"00 Meta/FileClasses/fc-b.md",
			"00 Meta/FileClasses/fc-list.md",
			"00 Meta/Schema/README.md",
			"00 Meta/Schema/s-a.md",
			"00 Meta/Templates/t-a.md",
		]);
		const stored = await new ArtifactStore(createDataFile(port)).load();
		expect(Object.keys(stored)).toHaveLength(6);
		expect(stored["templates/t-a.md"]?.pluginVersion).toBe(VERSION);
		expect(m.close).toHaveBeenCalled();
		expect(Notice._instances).toHaveLength(1);
		expect($(".sf-story-notice-head", Notice._instances[0]!.messageEl).textContent).toBe("Set up 6 story files.");
		expect(Notice._instances[0]!.timeout).toBeUndefined();
		expect($(".sf-story-notice", Notice._instances[0]!.messageEl).getAttribute("role")).toBe("status");
	});

	it("builds the notice from a string and fills messageEl, never from a fragment (realm-safe)", async () => {
		await open();
		await confirm();
		const notice = Notice._instances[0]!;
		// A fragment from another window's document fails Obsidian's instanceof check and shows
		// as "[object DocumentFragment]" (seen live after a popout).
		expect(notice._message).toBe("");
		expect($(".sf-story-notice-head", notice.messageEl).textContent).toBe("Set up 6 story files.");
	});

	it("says under the first line what was written into which folder, per set (R2)", async () => {
		await open();
		await confirm();
		const el = Notice._instances[0]!.messageEl;
		const texts = [...el.querySelectorAll(".sf-story-notice-head, .sf-story-notice-set")].map((e) => e.textContent);
		expect(texts).toEqual([
			"Set up 6 story files.",
			"3 FileClasses in 00 Meta/FileClasses",
			"1 template in 00 Meta/Templates",
			"2 schema reference notes in 00 Meta/Schema",
		]);
	});

	it("names updates with the record's folder, not the folder the setting now names (R2)", async () => {
		const tA = index.entries[2]!;
		mem.files.set("00 Meta/Templates/t-a.md", "old t-a");
		port = fakePort({ artifacts: { [tA.id]: await record("00 Meta/Templates/t-a.md", "old source", "old t-a") } });
		settings = { ...settings, templatesFolder: "Writing/Templates" };
		await open();
		toggle(setBox("fileclasses"));
		toggle(setBox("schema"));
		await confirm();
		const texts = [...Notice._instances[0]!.messageEl.querySelectorAll(".sf-story-notice-set")].map((e) => e.textContent);
		expect(texts).toEqual(["1 template updated in 00 Meta/Templates"]);
	});

	it("disables the primary button while writing, so a second click writes nothing more", async () => {
		await open();
		primary().click();
		expect(primary().disabled).toBe(true);
		primary().click();
		await vi.waitFor(() => expect(Notice._instances).toHaveLength(1));
		expect(vi.mocked(app.vault.create).mock.calls).toHaveLength(6);
	});

	it("says Updated N story files for updates only", async () => {
		await mixedVault();
		await open();
		await confirm();
		const notice = Notice._instances[0]!;
		expect($(".sf-story-notice-head", notice.messageEl).textContent).toBe("Updated 1 story file.");
	});

	it("lists failed then skipped files with reasons, stays until clicked, and logs each (S5c)", async () => {
		await mixedVault();
		const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
		await open();
		toggle(rowBox("00 Meta/FileClasses/fc-list.md")!);
		vi.mocked(app.vault.create).mockRejectedValueOnce(new Error("disk full"));
		await confirm();
		const notice = Notice._instances[0]!;
		expect(notice.timeout).toBe(0);
		expect($(".sf-story-notice", notice.messageEl).getAttribute("role")).toBe("alert");
		const texts = [...notice.messageEl.querySelectorAll(".sf-story-notice-head, .sf-story-notice-line")].map((e) => e.textContent);
		expect(texts).toEqual([
			"Updated 1 story file.",
			"Failed (1):",
			"Not installed: could not write 00 Meta/FileClasses/fc-list.md: disk full",
			"Skipped (2):",
			"Not updated: 00 Meta/FileClasses/fc-b.md was edited after it was installed, and updating would overwrite those edits.",
			"Not installed: could not read 00 Meta/Schema/s-a.md: EACCES: permission denied",
		]);
		expect(notice.messageEl.querySelector(".sf-story-notice-more")).toBeNull();
		expect(debug).toHaveBeenCalledWith("[StoryForge] Not installed: could not write 00 Meta/FileClasses/fc-list.md: disk full");
		expect(debug).toHaveBeenCalledWith("[StoryForge] Not installed: could not read 00 Meta/Schema/s-a.md: EACCES: permission denied");
	});

	it("does not list up-to-date files, unticked rows or unticked sets as skipped", async () => {
		await mixedVault();
		await open();
		await confirm();
		const text = Notice._instances[0]!.message;
		expect(text).not.toContain("t-a.md");
		expect(text).not.toContain("fc-list.md");
	});

	it("does not list the refusals of a set the user unticked", async () => {
		unreadable("00 Meta/Schema/s-a.md");
		await open();
		toggle(setBox("schema"));
		await confirm();
		expect(Notice._instances[0]!.message).not.toContain("s-a.md");
		expect(Notice._instances[0]!.timeout).toBeUndefined();
	});

	it("does not list files that were already there as skipped (R1)", async () => {
		mem.files.set("00 Meta/Schema/README.md", "mine");
		await open();
		await confirm();
		const notice = Notice._instances[0]!;
		expect(notice.message).not.toContain("README.md");
		expect(notice.message).not.toContain("Skipped");
		expect(notice.timeout).toBeUndefined();
		expect($(".sf-story-notice", notice.messageEl).getAttribute("role")).toBe("status");
	});

	it("names the path of a damaged file in the notice", async () => {
		await mixedVault();
		index.entries[3] = { ...index.entries[3]!, checksum: `sha256:${"0".repeat(64)}` };
		await open();
		await confirm();
		expect(Notice._instances[0]!.message).toContain(
			"Not installed: the bundled copy of 00 Meta/Schema/s-a.md is damaged, so nothing was written. Reinstalling Story Forge restores it.",
		);
	});

	it("lists at most 5 lines, then says how many more (D10, O6)", async () => {
		const extra = await Promise.all(["s-b.md", "s-c.md", "s-d.md", "s-e.md", "s-f.md"].map((n) => entry("schema", n)));
		index.entries.push(...extra);
		unreadable(...[...extra, index.entries[3]!].map((e) => `00 Meta/Schema/${e.relPath}`));
		await open();
		await confirm();
		const el = Notice._instances[0]!.messageEl;
		expect(el.querySelectorAll(".sf-story-notice-line")).toHaveLength(5);
		expect($(".sf-story-notice-head", el).textContent).toBe("Set up 5 story files.");
		expect([...el.querySelectorAll(".sf-story-notice-head")].map((h) => h.textContent)).toContain("Skipped (6):");
		expect($(".sf-story-notice-more", el).textContent).toBe("and 1 more. Open Set up story files again to see each file.");
	});

	it("collapses one folder failure into one line plus the same-reason line (S5d)", async () => {
		mem.folders.add("00 Meta");
		vi.mocked(app.vault.createFolder).mockImplementation(async (p: string) => {
			if (p === "00 Meta/FileClasses") throw new Error("permission denied");
			mem.folders.add(p);
			return null as never;
		});
		await open();
		await confirm();
		const el = Notice._instances[0]!.messageEl;
		const texts = [...el.querySelectorAll(".sf-story-notice-head, .sf-story-notice-line, .sf-story-notice-more")].map((e) => e.textContent);
		expect(texts).toEqual([
			"Set up 3 story files.",
			"Failed (3):",
			"Not installed: could not create folder 00 Meta/FileClasses: permission denied",
			"The same reason for 2 more files in 00 Meta/FileClasses.",
		]);
	});

	it("says No story files written. when nothing was written", async () => {
		vi.mocked(app.vault.create).mockRejectedValue(new Error("read-only"));
		await open();
		await confirm();
		expect($(".sf-story-notice-head", Notice._instances[0]!.messageEl).textContent).toBe("No story files written.");
	});
});

/** A promise with its resolve / reject handed out. */
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
	let resolve!: (v: T) => void;
	let reject!: (e: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

describe("StoryFilesModal — confirm locks the dialog", () => {
	it("disables folder fields and every checkbox while confirming", async () => {
		const save = deferred<void>();
		saveFolders.mockImplementationOnce(() => save.promise);
		await open();
		await changeFolder("templates", "00 Meta/Other");
		primary().click();
		for (const input of document.querySelectorAll<HTMLInputElement>(".sf-story-folder input")) expect(input.disabled).toBe(true);
		for (const box of document.querySelectorAll<HTMLInputElement>(".sf-story-set-cb, .sf-story-row-cb")) expect(box.disabled).toBe(true);
		save.resolve();
		await vi.waitFor(() => expect(Notice._instances).toHaveLength(1));
	});

	it("writes and reports what was ticked when confirm was pressed, whatever changes during the save", async () => {
		unreadable("00 Meta/Schema/README.md");
		const save = deferred<void>();
		saveFolders.mockImplementationOnce(() => save.promise);
		await open();
		await changeFolder("templates", "00 Meta/Other");
		primary().click();
		// A change that slips past the lock (dispatched directly) must not alter this confirm.
		const box = setBox("schema");
		box.checked = false;
		box.dispatchEvent(new Event("change"));
		save.resolve();
		await vi.waitFor(() => expect(Notice._instances).toHaveLength(1));
		expect(mem.files.has("00 Meta/Schema/s-a.md")).toBe(true);
		expect(Notice._instances[0]!.message).toContain("could not read 00 Meta/Schema/README.md");
	});

	it("a failed folder save writes nothing, says so and keeps the dialog usable", async () => {
		saveFolders.mockRejectedValueOnce(new Error("data.json locked"));
		const m = await open();
		await changeFolder("templates", "00 Meta/Other");
		primary().click();
		await vi.waitFor(() => expect(Notice._instances).toHaveLength(1));
		expect(Notice._instances[0]!.message).toBe("Could not save the folder settings: data.json locked. Nothing was written.");
		expect(app.vault.create).not.toHaveBeenCalled();
		expect(m.close).not.toHaveBeenCalled();
		expect(document.querySelector(".sf-story")).not.toBeNull();
		expect(primary().disabled).toBe(false);
		expect(folderInput("templates").disabled).toBe(false);
		expect(setBox("fileclasses").disabled).toBe(false);
	});
});

describe("StoryFilesModal — async edges", () => {
	it("renders only the latest of two overlapping replans; the button waits for both", async () => {
		mem.files.set("A/t-a.md", "slow");
		const slow = deferred<string>();
		const read = vi.mocked(app.vault.read).getMockImplementation()!;
		vi.mocked(app.vault.read).mockImplementation(async (file) => (file.path === "A/t-a.md" ? slow.promise : read(file)));
		await open();
		typeFolder("templates", "A");
		await changeFolder("templates", "B");
		expect(rowPaths("templates")).toEqual(["B/t-a.md"]);
		expect(primary().disabled).toBe(true);
		slow.resolve("slow");
		await vi.waitFor(() => expect(primary().disabled).toBe(false));
		expect(rowPaths("templates")).toEqual(["B/t-a.md"]);
		expect(setEl("templates").dataset["folder"]).toBe("B");
		expect(actOf("B/t-a.md")).toBe("Create");
	});

	it("a failed load shows the error and a Cancel-only footer", async () => {
		const d = deps();
		vi.spyOn(d.store, "load").mockRejectedValueOnce(new Error("disk gone"));
		modal = openStoryFiles(d);
		await vi.waitFor(() => expect(document.querySelector(".sf-story .sf-picker-feedback")).not.toBeNull());
		expect($(".sf-story .sf-picker-feedback").textContent).toBe("Could not read the story files: disk gone");
		expect(document.querySelectorAll(".sf-story-set")).toHaveLength(0);
		const buttons = [...document.querySelectorAll(".sf-picker-foot button")].map((b) => b.textContent);
		expect(buttons).toEqual(["Cancel"]);
	});

	it("closing during the first plan draws nothing afterwards", async () => {
		const d = deps();
		const load = deferred<Awaited<ReturnType<ArtifactStore["load"]>>>();
		vi.spyOn(d.store, "load").mockImplementationOnce(() => load.promise);
		const m = openStoryFiles(d);
		m.close();
		load.resolve({});
		await new Promise((r) => setTimeout(r, 20));
		expect(m.contentEl.childElementCount).toBe(0);
		expect(writes()).toBe(0);
	});

	it("closing during a replan draws nothing afterwards", async () => {
		mem.files.set("A/t-a.md", "slow");
		const slow = deferred<string>();
		const read = vi.mocked(app.vault.read).getMockImplementation()!;
		vi.mocked(app.vault.read).mockImplementation(async (file) => (file.path === "A/t-a.md" ? slow.promise : read(file)));
		const m = await open();
		typeFolder("templates", "A");
		m.close();
		slow.resolve("slow");
		await new Promise((r) => setTimeout(r, 20));
		expect(m.contentEl.childElementCount).toBe(0);
	});

	it("closing during the write still reports the result and draws nothing", async () => {
		const gate = deferred<void>();
		const create = vi.mocked(app.vault.create).getMockImplementation()!;
		vi.mocked(app.vault.create).mockImplementation(async (p: string, data: string) => {
			await gate.promise;
			return create(p, data);
		});
		const m = await open();
		primary().click();
		await vi.waitFor(() => expect(app.vault.create).toHaveBeenCalled());
		m.close();
		gate.resolve();
		await vi.waitFor(() => expect(Notice._instances).toHaveLength(1));
		expect($(".sf-story-notice-head", Notice._instances[0]!.messageEl).textContent).toBe("Set up 6 story files.");
		expect(m.contentEl.childElementCount).toBe(0);
	});
});

describe("StoryFilesModal — construction", () => {
	it("openStoryFiles returns an opened StoryFilesModal", async () => {
		const m = await open();
		expect(m).toBeInstanceOf(StoryFilesModal);
		expect(m.open).toHaveBeenCalledTimes(1);
	});
});
