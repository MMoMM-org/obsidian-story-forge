/**
 * A curated `.base` installs verbatim (spec 008 T7.3, reduced: README decision row 2026-11-13).
 *
 * (a) The install writes the catalog's bytes and records a from-repo Bases collection with no
 *     `generated` block: `okayed` and `installedSourceChecksum` are the written bytes' checksum,
 *     and the consent gate lets it draw — Bases runs no code (PRD F7 AC 8).
 * (b) Nothing regenerates it: Library and Scope changes after the install write nothing to the vault.
 * (c) Update replaces the file and the record in place, and refuses a file the user edited.
 * (d) A record installed before T7.3 (with a `generated` block) still evaluates and still updates
 *     in place at its `generated.filePath`.
 */

import { describe, it, expect, vi } from "vitest";
import { App, wireMemoryVault } from "../__mocks__/obsidian";
import { computeChecksum } from "consent/checksum";
import { ConsentGate } from "consent/ConsentGate";
import { CatalogService } from "catalog/CatalogService";
import type { BasesCatalogEntry } from "catalog/catalogTypes";
import { CollectionStore } from "library/collectionStore";
import { createLibraryPort } from "library/settingsPort";
import { ViewStore } from "store/ViewStore";
import type { PluginDataPort, StoryForgeData, ViewRecord } from "store/types";
import { DEFAULT_SETTINGS, type PluginSettings } from "types/index";

const FOLDER = "00 Meta/Bases";
const PATH = `${FOLDER}/characters-by-role.base`;
const V1 = 'filters: file.hasTag("canon/character")\nviews:\n  - type: table\n    name: Characters by role\n';
const V2 = V1.replace("name: Characters by role", "name: Characters by role\n    groupBy:\n      property: role\n      direction: ASC");

async function entry(source = V1): Promise<BasesCatalogEntry> {
	return { id: "characters-by-role", name: "Characters by role", engine: "bases", source, checksum: await computeChecksum(source) };
}

/** An in-memory vault (Vault API); every way of writing a file is a spy. */
function makeVault() {
	const app = new App();
	const { files } = wireMemoryVault(app);
	return { app, files };
}

function makeStore() {
	let data: StoryForgeData = { views: {} };
	const port: PluginDataPort = { load: async () => structuredClone(data), save: async (d) => { data = structuredClone(d as StoryForgeData); } };
	return { store: new ViewStore(port), views: (): Record<string, ViewRecord> => data.views ?? {} };
}

function service(app: App, store: ViewStore, e: BasesCatalogEntry): CatalogService {
	return new CatalogService({ version: "1", entries: [e] }, {
		app, gate: {} as unknown as ConsentGate, store, curatedBasesFolder: FOLDER,
	});
}

function gate(app: App, store: ViewStore): ConsentGate {
	return new ConsentGate(app, { get: () => ({}) }, { isDvJsEnabled: () => true }, store, async () => null, () => ({ tag: "", excludedFolders: [] }));
}

const EDIT_REFUSAL = `Not updated: ${PATH} was edited after it was installed, and updating would overwrite those edits.`;

describe("(a) installing a curated .base", () => {
	it("writes the catalog's bytes and records a from-repo Bases collection with no generated block", async () => {
		const { app, files } = makeVault();
		const { store, views } = makeStore();
		const e = await entry();
		expect(await service(app, store, e).install(e.id)).toEqual({ ok: true, path: PATH });

		expect(files.get(PATH)).toBe(V1);
		const [record] = Object.values(views());
		expect(record).toEqual({
			provenance: "curated", kind: "collection", engine: "bases", enabled: true, command: false,
			source: PATH, commandName: "Characters by role", catalogId: "characters-by-role",
			okayed: { version: 1, checksum: e.checksum }, installedSourceChecksum: e.checksum,
			surfaces: { anvil: true, workbench: false },
		});
	});

	it("is consented: a from-repo .base is enable/disable only, even after an edit in Bases", async () => {
		const { app, files } = makeVault();
		const { store, views } = makeStore();
		const e = await entry();
		await service(app, store, e).install(e.id);
		const [record] = Object.values(views());
		expect(await gate(app, store).evaluate(record!)).toEqual({ status: "consented" });
		files.set(PATH, `${V1}# mine\n`);
		expect(await gate(app, store).evaluate(record!)).toEqual({ status: "consented" });
		expect(await gate(app, store).evaluate({ ...record!, enabled: false })).toEqual({ status: "disabled" });
	});
});

describe("(b) nothing regenerates a curated .base", () => {
	// Regression tripwire: no code path from the Library or Scope reaches the vault today. If a
	// regeneration path is ever added back, this fails before it can overwrite a curated file.
	it("tripwire: a Library or Scope change after the install touches no vault file", async () => {
		const { app } = makeVault();
		const { store, views } = makeStore();
		const e = await entry();
		await service(app, store, e).install(e.id);
		const id = Object.keys(views())[0]!;
		const a = app.vault.adapter;
		const mutators = [
			a.write, a.writeBinary, a.append, a.appendBinary, a.process, a.mkdir, a.trashSystem, a.trashLocal,
			a.rmdir, a.remove, a.rename, a.copy, app.vault.modify, app.vault.create, app.vault.process,
			app.vault.delete, app.vault.trash, app.vault.createFolder, app.fileManager.trashFile,
		];
		const writes = (): number[] => mutators.map((f) => vi.mocked(f).mock.calls.length);
		const before = writes();

		const plugin = { settings: { ...DEFAULT_SETTINGS } as PluginSettings, saveSettings: vi.fn(async () => {}) };
		const library = new CollectionStore(createLibraryPort(store, plugin));
		expect((await library.setScope(["Archive", "00 Meta"])).ok).toBe(true);
		expect((await library.configureBuiltIn("character", { tag: "people", excludedFolders: ["Drafts"] })).ok).toBe(true);
		expect((await library.setSurface(id, "workbench", true)).ok).toBe(true);
		expect((await library.setEnabled(id, false)).ok).toBe(true);

		expect(writes()).toEqual(before);
		expect(views()[id]!.okayed?.checksum).toBe(e.checksum);
	});
});

describe("(c) updating a curated .base", () => {
	it("replaces the file and the record in place, keeping what the user set", async () => {
		const { app, files } = makeVault();
		const { store, views } = makeStore();
		await service(app, store, await entry()).install("characters-by-role");
		const id = Object.keys(views())[0]!;
		await store.setRecord(id, { ...views()[id]!, enabled: false, surfaces: { anvil: true, workbench: true } });

		const v2 = await entry(V2);
		expect(await service(app, store, v2).install(v2.id)).toEqual({ ok: true, path: PATH });
		expect(Object.keys(views())).toEqual([id]);
		expect(views()[id]).toMatchObject({
			okayed: { checksum: v2.checksum }, installedSourceChecksum: v2.checksum, enabled: false, surfaces: { anvil: true, workbench: true },
		});
		expect(views()[id]!.generated).toBeUndefined();
		expect(files.get(PATH)).toBe(V2);
	});

	it("refuses to update a file the user edited, and changes nothing", async () => {
		const { app, files } = makeVault();
		const { store, views } = makeStore();
		await service(app, store, await entry()).install("characters-by-role");
		files.set(PATH, `${V1}# mine\n`);
		const before = structuredClone(views());
		const v2 = await entry(V2);
		expect(await service(app, store, v2).install(v2.id)).toEqual({ ok: false, reason: EDIT_REFUSAL });
		expect(files.get(PATH)).toBe(`${V1}# mine\n`);
		expect(views()).toEqual(before);
	});
});

describe("(d) a record installed before T7.3, with a generated block", () => {
	const LEGACY_PATH = "Old Folder/characters-by-role.base";

	async function legacy() {
		const { app, files } = makeVault();
		const { store, views } = makeStore();
		const e = await entry();
		files.set(LEGACY_PATH, V1);
		await store.setRecord("legacy", {
			provenance: "curated", enabled: true, okayed: { version: 1, checksum: e.checksum }, source: LEGACY_PATH,
			engine: "bases", command: false, commandName: "Characters by role", kind: "collection",
			surfaces: { anvil: true, workbench: false }, catalogId: e.id,
			generated: { sourceChecksum: e.checksum, params: { tag: "", excludedFolders: [] }, instanceChecksum: e.checksum, filePath: LEGACY_PATH, verify: true },
		});
		return { app, files, store, views };
	}

	it("still evaluates without error", async () => {
		const { app, store, views } = await legacy();
		expect(await gate(app, store).evaluate(views()["legacy"]!)).toEqual({ status: "consented" });
	});

	it("updates in place at its generated.filePath, and refuses when that file was edited", async () => {
		const { app, files, store, views } = await legacy();
		const v2 = await entry(V2);
		expect(await service(app, store, v2).install(v2.id)).toEqual({ ok: true, path: LEGACY_PATH });
		expect(files.get(LEGACY_PATH)).toBe(V2);
		expect(files.has(PATH)).toBe(false);
		expect(Object.keys(views())).toEqual(["legacy"]);
		expect(views()["legacy"]).toMatchObject({ okayed: { checksum: v2.checksum }, installedSourceChecksum: v2.checksum });
		expect(views()["legacy"]!.generated).toBeUndefined();
	});

	it("refuses an update when its file was edited", async () => {
		const { app, files, store } = await legacy();
		files.set(LEGACY_PATH, `${V1}# mine\n`);
		const v2 = await entry(V2);
		expect(await service(app, store, v2).install(v2.id)).toEqual({
			ok: false,
			reason: `Not updated: ${LEGACY_PATH} was edited after it was installed, and updating would overwrite those edits.`,
		});
	});
});
