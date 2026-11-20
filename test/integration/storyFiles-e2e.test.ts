/**
 * T6.1 (spec 010) — setup and update end to end, over the REAL bundled index.
 *
 * The index is `artifactIndex` (dist/artifact-index.json, the import production uses). Everything
 * on the way is real: the "Set up story files" dialog, planSetup, executePlan, managedFileWriter,
 * ArtifactStore over the shared data.json queue, composeNotice (drawn by the dialog), and the
 * editor's FileClass pipeline (createFileClassCache → resolveFileClassChain → buildFieldModel, as
 * AnvilView._renderFields runs it). Only Obsidian is the mock: the in-memory vault, plus a small
 * test-local indexer that does what Obsidian does after a write — fire the vault event, then
 * metadataCache "changed", and answer getFileCache from the file's frontmatter.
 *
 * Journey (PRD Primary User Journey, SDD Primary Flow):
 *  1. fresh vault → set up all three sets through the dialog → every index entry at its default
 *     path, one record per file, nothing written outside the three folders;
 *  2. a scene created from the written template (as core Templates does) gets its enum options
 *     from the written FileClass, picked up by a cache that was already running (no reload);
 *  3. a plugin update with one changed source, one user-edited file whose source also changed,
 *     and one deleted file → updated / not updated / missing, exactly; confirming with the missing
 *     row ticked writes exactly those two and leaves the edited bytes alone.
 *
 * @ref PRD/Primary User Journey, PRD/F2, PRD/F4, PRD/F5.9
 * @ref SDD/Primary Flow
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, Notice, parseYaml, wireMemoryVault, type CachedMetadata, type EventRef, type MemoryVault, type TFile } from "obsidian";
import { artifactIndex } from "../../src/artifacts/artifactIndex";
import { ArtifactStore } from "../../src/artifacts/ArtifactStore";
import type { ArtifactEntry, ArtifactFileRead, ArtifactFolders, ArtifactIndex, PlanAction } from "../../src/artifacts/artifactTypes";
import { planSetup, targetPathOf } from "../../src/artifacts/planSetup";
import { resolvePlaceholders } from "../../src/artifacts/resolvePlaceholders";
import { openStoryFiles, type StoryFilesModal } from "../../src/artifacts/StoryFilesModal";
import { computeChecksum } from "../../src/consent/checksum";
import { buildFieldModel } from "../../src/editor/fieldModel";
import { GENERATED_UI_HINTS } from "../../src/editor/generatedUiHints";
import { resolveFileClassChain } from "../../src/fileclass/fileClassReader";
import { createFileClassCache, type OwnedFileClassCache } from "../../src/fileclass/fileClassVault";
import { createDataFile } from "../../src/store/dataFileQueue";
import type { PluginDataPort } from "../../src/store/types";
import { editedRefusal } from "../../src/vault/managedFileWriter";

const VERSION = "0.2.0";
const DEFAULTS: ArtifactFolders = {
	fileClassesFolder: "00 Meta/FileClasses",
	templatesFolder: "00 Meta/Templates",
	schemaFolder: "00 Meta/Schema",
};
const ALL_SETS = ["fileclasses", "templates", "schema"] as const;
const THREE_FOLDERS = Object.values(DEFAULTS);

/** The three outcomes of the simulated update (step 3). */
const CHANGED_ID = "fileclass/fc-book";
const EDITED_ID = "template/scene";
const DELETED_ID = "schema/lore";

// ---------------------------------------------------------------------------
// World: in-memory vault, an Obsidian-like indexer, data.json, the FileClass cache
// ---------------------------------------------------------------------------

interface Port extends PluginDataPort {
	readonly data: unknown;
}

function fakePort(): Port {
	let data: unknown = {};
	return {
		get data() { return data; },
		async load() { return structuredClone(data); },
		async save(d: unknown) { data = structuredClone(d); },
	};
}

const FRONTMATTER = /^---\n([\s\S]*?)\n?---(?:\n|$)/;

/** What Obsidian's metadata cache holds for `text`: its frontmatter, when it has one. */
function cacheOf(text: string): CachedMetadata {
	const m = FRONTMATTER.exec(text);
	if (!m) return {};
	const parsed = parseYaml(m[1] ?? "");
	return parsed !== null && typeof parsed === "object" ? { frontmatter: parsed as Record<string, unknown> } : {};
}

let app: App;
let mem: MemoryVault;
let port: Port;
let cache: OwnedFileClassCache;
let modal: StoryFilesModal | null;

/**
 * Do what Obsidian does around the memory vault's writes: fire `create` / `modify` / `delete`,
 * then metadataCache `changed` with the file's new cache. Reads of the cache and the markdown
 * file list come from the memory vault's bytes.
 */
function wireIndexer(): void {
	const v = app.vault;
	const mc = app.metadataCache;
	const create = vi.mocked(v.create).getMockImplementation()!;
	vi.mocked(v.create).mockImplementation(async (path: string, data: string) => {
		const file = await create(path, data);
		v._trigger("create", file);
		mc._trigger("changed", file, data, cacheOf(data));
		return file;
	});
	const process = vi.mocked(v.process).getMockImplementation()!;
	vi.mocked(v.process).mockImplementation(async (file: TFile, fn: (data: string) => string) => {
		const next = await process(file, fn);
		v._trigger("modify", file);
		mc._trigger("changed", file, next, cacheOf(next));
		return next;
	});
	const trash = vi.mocked(app.fileManager.trashFile).getMockImplementation()!;
	vi.mocked(app.fileManager.trashFile).mockImplementation(async (file: TFile) => {
		await trash(file);
		v._trigger("delete", file);
	});
	vi.mocked(mc.getFileCache).mockImplementation((file: TFile) => {
		const text = mem.files.get(file.path);
		return text === undefined ? null : cacheOf(text);
	});
	vi.mocked(v.getMarkdownFiles).mockImplementation(() =>
		[...mem.files.keys()]
			.filter((p) => p.endsWith(".md"))
			.map((p) => v.getFileByPath(p))
			.filter((f): f is TFile => f !== null),
	);
}

beforeEach(() => {
	document.body.empty();
	Notice._reset();
	app = new App();
	mem = wireMemoryVault(app);
	wireIndexer();
	port = fakePort();
	modal = null;
	// The one cache the plugin keeps, started before anything is set up (as on plugin load).
	cache = createFileClassCache(app, () => DEFAULTS.fileClassesFolder, (_ref: EventRef) => {});
});

afterEach(() => {
	cache.dispose();
	modal?.close();
	vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Dialog helpers
// ---------------------------------------------------------------------------

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document): T => {
	const el = root.querySelector<T>(sel);
	if (!el) throw new Error(`not found: ${sel}`);
	return el;
};
const primary = (): HTMLButtonElement => $<HTMLButtonElement>(".sf-picker-foot button.mod-cta");
const rowEl = (path: string): HTMLElement => $(`.sf-story-row[data-path="${path}"]`);

/** Open the dialog over `index` with a store freshly loaded from data.json (a plugin start). */
async function openDialog(index: ArtifactIndex): Promise<ArtifactStore> {
	const store = new ArtifactStore(createDataFile(port));
	await store.load();
	let settings = { ...DEFAULTS, excludedFolders: ["00 Meta"] };
	modal = openStoryFiles({
		app,
		settings: () => settings,
		saveFolders: async (f) => { settings = { ...settings, ...f }; },
		addExcludedFolder: async () => {},
		store,
		index,
		pluginVersion: VERSION,
	});
	await vi.waitFor(() => expect(document.querySelectorAll(".sf-story-set")).toHaveLength(3));
	await vi.waitFor(() => expect(primary().disabled).toBe(false));
	return store;
}

/** Click the primary button and return the result notice's lines. */
async function confirm(): Promise<string[]> {
	const before = Notice._instances.length;
	primary().click();
	await vi.waitFor(() => expect(Notice._instances).toHaveLength(before + 1));
	modal = null;
	const notice = Notice._instances[before]!;
	return [...notice.messageEl.querySelectorAll(".sf-story-notice > span")].map((s) => s.textContent ?? "");
}

/** Set up all three sets through the dialog, as a first-time user does. */
async function setUpAll(): Promise<string[]> {
	await openDialog(artifactIndex);
	expect(primary().textContent).toBe(`Set up ${artifactIndex.entries.length} files`);
	return confirm();
}

const entryOf = (id: string): ArtifactEntry => {
	const e = artifactIndex.entries.find((x) => x.id === id);
	if (!e) throw new Error(`no index entry ${id}`);
	return e;
};
const pathOf = (id: string): string => targetPathOf(entryOf(id), DEFAULTS);

/** Paths of every vault write (file and folder) so far. */
function writtenPaths(): { files: string[]; folders: string[] } {
	const v = app.vault;
	return {
		files: [
			...vi.mocked(v.create).mock.calls.map((c) => c[0]),
			...vi.mocked(v.process).mock.calls.map((c) => c[0].path),
		],
		folders: vi.mocked(v.createFolder).mock.calls.map((c) => c[0]),
	};
}

// ---------------------------------------------------------------------------
// 1. Fresh vault → set up all
// ---------------------------------------------------------------------------

describe("story files end to end — set up all in a fresh vault", () => {
	it("writes every index entry at its default path, with one record per file", async () => {
		expect(artifactIndex.entries.length).toBeGreaterThan(0);
		const lines = await setUpAll();
		expect(lines[0]).toBe(`Set up ${artifactIndex.entries.length} story files.`);

		const records = new ArtifactStore(createDataFile(port));
		await records.load();
		expect(Object.keys(records.all()).sort()).toEqual(artifactIndex.entries.map((e) => e.id).sort());

		for (const entry of artifactIndex.entries) {
			const path = targetPathOf(entry, DEFAULTS);
			const expected = resolvePlaceholders(entry.source, DEFAULTS);
			expect(mem.files.get(path), path).toBe(expected);
			expect(expected).not.toContain("{{sf:");
			const record = records.get(entry.id)!;
			expect(record.path).toBe(path);
			expect(record.sourceChecksum).toBe(entry.checksum);
			expect(record.instanceChecksum).toBe(await computeChecksum(expected));
			expect(record.params).toEqual(DEFAULTS);
			expect(record.pluginVersion).toBe(VERSION);
		}
		expect(mem.files.size).toBe(artifactIndex.entries.length);
	});

	it("writes nothing outside the three folders", async () => {
		await setUpAll();
		const { files, folders } = writtenPaths();
		expect(files).toHaveLength(artifactIndex.entries.length);
		for (const f of files) expect(THREE_FOLDERS.some((d) => f.startsWith(`${d}/`)), f).toBe(true);
		// A folder is one of the three, or a parent one of them needs.
		for (const d of folders) expect(THREE_FOLDERS.some((t) => t === d || t.startsWith(`${d}/`)), d).toBe(true);
		const v = app.vault;
		for (const other of [v.modify, v.delete, v.trash, v.rename, v.append, v.copy, app.fileManager.trashFile]) {
			expect(vi.mocked(other)).not.toHaveBeenCalled();
		}
	});
});

// ---------------------------------------------------------------------------
// 2. A scene from the written template → the editor shows its enum options
// ---------------------------------------------------------------------------

describe("story files end to end — a scene from the written template", () => {
	it("gets the scene FileClass's enum options, picked up by the running cache without a reload", async () => {
		// The cache has already scanned the (empty) folder, as a running plugin has.
		expect(cache.count()).toBe(0);
		await setUpAll();
		expect(cache.count()).toBeGreaterThan(0);

		// Core Templates: insert the template's text with {{title}} filled in.
		const template = mem.files.get(pathOf("template/scene"))!;
		mem.folders.add("20 Manuscript");
		const note = await app.vault.create("20 Manuscript/The crossing.md", template.split("{{title}}").join("The crossing"));
		expect(mem.files.get(note.path)).toContain("# The crossing");

		// The editor's pipeline (AnvilView._renderFields).
		const startName = cache.nameFor(note);
		expect(startName).toBe("fc-scene");
		const frontmatter = app.metadataCache.getFileCache(note)?.frontmatter;
		const chain = resolveFileClassChain(startName!, cache.lookup);
		const model = buildFieldModel(chain, frontmatter, GENERATED_UI_HINTS);

		const fields = model.sections.flatMap((s) => s.fields);
		const status = fields.find((f) => f.name === "status");
		expect(status?.type).toBe("Select");
		expect(status?.values).toEqual(["idea", "outline", "draft", "revised", "done", "final"]);
		expect(frontmatter?.["status"]).toBe("idea");
		expect(model.sections[0]?.fields.map((f) => f.name)).toContain("pov");
	});
});

// ---------------------------------------------------------------------------
// 3. Plugin update: changed source, user-edited file, deleted file
// ---------------------------------------------------------------------------

/** The index a newer plugin ships: `CHANGED_ID` and `EDITED_ID` have new sources (and checksums). */
async function updatedIndex(): Promise<ArtifactIndex> {
	const entries: ArtifactEntry[] = [];
	for (const e of artifactIndex.entries) {
		if (e.id !== CHANGED_ID && e.id !== EDITED_ID) {
			entries.push(e);
			continue;
		}
		const source = `${e.source}\n<!-- changed in the next release -->\n`;
		entries.push({ ...e, source, checksum: await computeChecksum(source) });
	}
	return { version: "1", entries };
}

/** The user edits one written file and deletes another, as in Obsidian. */
async function userChanges(): Promise<string> {
	const edited = app.vault.getFileByPath(pathOf(EDITED_ID))!;
	await app.vault.process(edited, (text: string) => `${text}\nMy own scene checklist.\n`);
	const deleted = app.vault.getFileByPath(pathOf(DELETED_ID))!;
	mem.files.delete(deleted.path);
	app.vault._trigger("delete", deleted);
	return mem.files.get(edited.path)!;
}

const readFile = async (path: string): Promise<ArtifactFileRead> => {
	const text = mem.files.get(path);
	return text === undefined ? { kind: "absent" } : { kind: "content", text };
};

describe("story files end to end — a plugin update", () => {
	it("plans the changed file update, the edited one skip-edited, the deleted one missing, the rest up-to-date", async () => {
		await setUpAll();
		await userChanges();
		const next = await updatedIndex();
		const store = new ArtifactStore(createDataFile(port));
		const plan = await planSetup(next, await store.load(), readFile, DEFAULTS, ALL_SETS);

		const expected = (id: string): PlanAction =>
			id === CHANGED_ID ? "update" : id === EDITED_ID ? "skip-edited" : id === DELETED_ID ? "missing" : "up-to-date";
		expect(plan.map((i) => [i.entry.id, i.action])).toEqual(next.entries.map((e) => [e.id, expected(e.id)]));
		for (const item of plan) expect(item.path).toBe(targetPathOf(item.entry, DEFAULTS));
	});

	it("confirming with Set up again ticked writes exactly those two, keeps the edits, and says so", async () => {
		await setUpAll();
		const editedBytes = await userChanges();
		const next = await updatedIndex();
		const before = new Map(mem.files);
		vi.mocked(app.vault.create).mockClear();
		vi.mocked(app.vault.process).mockClear();

		const store = await openDialog(next);
		const label = (id: string): string => $(".sf-story-act", rowEl(pathOf(id))).textContent ?? "";
		expect(label(CHANGED_ID)).toBe("Update");
		expect(label(EDITED_ID)).toBe("Not updated");
		expect(label(DELETED_ID)).toBe("Missing");
		const missingBox = $<HTMLInputElement>(".sf-story-row-cb", rowEl(pathOf(DELETED_ID)));
		expect(missingBox.checked).toBe(false);
		missingBox.click();
		expect(primary().textContent).toBe("Set up and update 2 files");

		const lines = await confirm();

		// Exactly the update and the set-up-again file were written.
		const { files } = writtenPaths();
		expect(files.sort()).toEqual([pathOf(CHANGED_ID), pathOf(DELETED_ID)].sort());
		expect(mem.files.get(pathOf(CHANGED_ID))).toBe(resolvePlaceholders(next.entries.find((e) => e.id === CHANGED_ID)!.source, DEFAULTS));
		expect(mem.files.get(pathOf(DELETED_ID))).toBe(resolvePlaceholders(entryOf(DELETED_ID).source, DEFAULTS));
		expect(mem.files.get(pathOf(EDITED_ID))).toBe(editedBytes);
		for (const [path, text] of before) {
			if (path !== pathOf(CHANGED_ID)) expect(mem.files.get(path), path).toBe(text);
		}

		// Records: the update carries the new source; the edited file keeps its old record.
		await store.load();
		const changed = next.entries.find((e) => e.id === CHANGED_ID)!;
		expect(store.get(CHANGED_ID)?.sourceChecksum).toBe(changed.checksum);
		expect(store.get(EDITED_ID)?.sourceChecksum).toBe(entryOf(EDITED_ID).checksum);
		expect(store.get(DELETED_ID)?.instanceChecksum).toBe(await computeChecksum(mem.files.get(pathOf(DELETED_ID))!));

		// The notice (composeNotice, drawn by the dialog): updated / set up again / not updated.
		expect(lines).toEqual([
			"Set up 1 and updated 1 story file.",
			"1 FileClass updated in 00 Meta/FileClasses",
			"1 schema reference note in 00 Meta/Schema",
			"Skipped (1):",
			editedRefusal(pathOf(EDITED_ID), "Not updated"),
		]);
	});
});
