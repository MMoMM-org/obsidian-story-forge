/**
 * ViewImporter tests — Phase 2 (T2.1, T2.2, T2.3)
 *
 * TDD order: RED tests written before implementation (phase-2.md).
 *
 * T2.1 — ViewImporter.parse(): ViewDefinition shape, engine inference, ImportError codes
 * T2.2 — ViewImporter.toRecord() + importToStore(): ViewRecord mapping, duplicate guard
 * T2.3 — ViewImporter.scanVault(): metadataCache-only scan, sf-view:true filter, already-imported exclusion
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { App, TFile, createMockTFile } from "../__mocks__/obsidian";
import { ViewImporter } from "import/ViewImporter";
import { ImportError } from "import/ViewDefinition";
import type { ViewDefinition } from "import/ViewDefinition";
import { ViewStore } from "store/ViewStore";
import type { ViewRecord } from "store/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a fake port that backs a ViewStore with the given initial views map. */
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

/** Build a TFile with given path/basename. */
function makeFile(path: string, basename?: string): TFile {
	return createMockTFile({
		path,
		basename: basename ?? path.split("/").pop()!.replace(/\.md$/, ""),
		name: path.split("/").pop()!,
	});
}

/**
 * Set up vault.getAbstractFileByPath to return the file for its path,
 * and vault.read to return `content`.
 */
function wireVaultRead(app: App, file: TFile, content: string): void {
	vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((p: string) =>
		p === file.path ? file : null,
	);
	vi.mocked(app.vault.read).mockResolvedValue(content);
}

/** Set frontmatter for a file in the metadataCache mock. */
function wireCache(
	app: App,
	file: TFile,
	frontmatter: Record<string, unknown>,
): void {
	vi.mocked(app.metadataCache.getFileCache).mockImplementation((f: TFile) =>
		f.path === file.path ? { frontmatter } : null,
	);
}

// ---------------------------------------------------------------------------
// T2.1 — parse()
// ---------------------------------------------------------------------------

describe("ViewImporter.parse()", () => {
	let app: App;
	let store: ViewStore;
	let importer: ViewImporter;

	beforeEach(() => {
		app = new App();
		store = makeStore();
		importer = new ViewImporter(app, store);
	});

	// -------------------------------------------------------------------------
	// Happy paths — engine inference
	// -------------------------------------------------------------------------

	it("returns engine:'dataviewjs' when fenced block language is 'dataviewjs'", async () => {
		const file = makeFile("views/my-view.md");
		const content = [
			"---",
			"sf-view: true",
			"sf-version: 1",
			"sf-name: My View",
			"---",
			"",
			"```dataviewjs",
			"dv.list(dv.pages())",
			"```",
		].join("\n");
		wireVaultRead(app, file, content);
		wireCache(app, file, { "sf-view": true, "sf-version": 1, "sf-name": "My View" });

		const def = await importer.parse(file);
		expect(def.engine).toBe("dataviewjs");
	});

	it("returns engine:'dataview-dql' when fenced block language is 'dataview'", async () => {
		const file = makeFile("views/my-dql.md");
		const content = [
			"---",
			"sf-view: true",
			"sf-version: 2",
			"sf-name: DQL View",
			"---",
			"",
			"```dataview",
			"LIST FROM #character",
			"```",
		].join("\n");
		wireVaultRead(app, file, content);
		wireCache(app, file, { "sf-view": true, "sf-version": 2, "sf-name": "DQL View" });

		const def = await importer.parse(file);
		expect(def.engine).toBe("dataview-dql");
	});

	it("returns a ViewDefinition with all expected fields", async () => {
		const file = makeFile("views/full.md");
		const content = [
			"---",
			"sf-view: true",
			"sf-version: 3",
			"sf-name: Full View",
			"sf-description: A complete view",
			"sf-command: true",
			"---",
			"",
			"```dataviewjs",
			"dv.current()",
			"```",
		].join("\n");
		wireVaultRead(app, file, content);
		wireCache(app, file, {
			"sf-view": true,
			"sf-version": 3,
			"sf-name": "Full View",
			"sf-description": "A complete view",
			"sf-command": true,
		});

		const def = await importer.parse(file);
		expect(def.sourcePath).toBe("views/full.md");
		expect(def.engine).toBe("dataviewjs");
		expect(def.version).toBe(3);
		expect(def.name).toBe("Full View");
		expect(def.description).toBe("A complete view");
		expect(def.command).toBe(true);
		expect(def.querySource).toBe("dv.current()\n");
		expect(def.checksum).toMatch(/^sha256:[a-f0-9]{64}$/);
	});

	it("defaults sf-name to file.basename when frontmatter field is absent", async () => {
		const file = makeFile("views/no-name.md", "no-name");
		const content = [
			"---",
			"sf-view: true",
			"sf-version: 1",
			"---",
			"",
			"```dataviewjs",
			"dv.list([])",
			"```",
		].join("\n");
		wireVaultRead(app, file, content);
		wireCache(app, file, { "sf-view": true, "sf-version": 1 });

		const def = await importer.parse(file);
		expect(def.name).toBe("no-name");
	});

	it("checksum matches computeChecksum(block.body)", async () => {
		const file = makeFile("views/cksum.md");
		const blockBody = "dv.list(dv.pages())\n";
		const content = [
			"---",
			"sf-view: true",
			"sf-version: 1",
			"sf-name: Cksum",
			"---",
			"",
			"```dataviewjs",
			blockBody.trimEnd(),
			"```",
		].join("\n");
		wireVaultRead(app, file, content);
		wireCache(app, file, { "sf-view": true, "sf-version": 1, "sf-name": "Cksum" });

		const { computeChecksum } = await import("consent/checksum");
		const expected = await computeChecksum(blockBody);

		const def = await importer.parse(file);
		expect(def.checksum).toBe(expected);
	});

	// -------------------------------------------------------------------------
	// ImportError — NO_QUERY_BLOCK
	// -------------------------------------------------------------------------

	it("throws ImportError(NO_QUERY_BLOCK) when readFencedBlock returns null (no block)", async () => {
		const file = makeFile("views/no-block.md");
		const content = [
			"---",
			"sf-view: true",
			"sf-version: 1",
			"sf-name: No Block",
			"---",
			"",
			"No fenced query block here.",
		].join("\n");
		wireVaultRead(app, file, content);
		wireCache(app, file, { "sf-view": true, "sf-version": 1, "sf-name": "No Block" });

		await expect(importer.parse(file)).rejects.toMatchObject({
			code: "NO_QUERY_BLOCK",
		});
		await expect(importer.parse(file)).rejects.toBeInstanceOf(ImportError);
	});

	// -------------------------------------------------------------------------
	// ImportError — MULTIPLE_QUERY_BLOCKS
	// -------------------------------------------------------------------------

	it("throws ImportError(MULTIPLE_QUERY_BLOCKS) when more than one query block exists", async () => {
		const file = makeFile("views/multi.md");
		const content = [
			"---",
			"sf-view: true",
			"sf-version: 1",
			"sf-name: Multi",
			"---",
			"",
			"```dataview",
			"LIST FROM #tag1",
			"```",
			"",
			"```dataviewjs",
			"dv.list([])",
			"```",
		].join("\n");
		wireVaultRead(app, file, content);
		wireCache(app, file, { "sf-view": true, "sf-version": 1, "sf-name": "Multi" });

		await expect(importer.parse(file)).rejects.toMatchObject({
			code: "MULTIPLE_QUERY_BLOCKS",
			message: "View definitions must contain exactly one query block",
		});
		await expect(importer.parse(file)).rejects.toBeInstanceOf(ImportError);
	});

	// -------------------------------------------------------------------------
	// ImportError — INVALID_FRONTMATTER (sf-version)
	// -------------------------------------------------------------------------

	it("throws ImportError(INVALID_FRONTMATTER) when sf-version is missing", async () => {
		const file = makeFile("views/no-version.md");
		const content = [
			"---",
			"sf-view: true",
			"sf-name: No Version",
			"---",
			"",
			"```dataviewjs",
			"dv.list([])",
			"```",
		].join("\n");
		wireVaultRead(app, file, content);
		wireCache(app, file, { "sf-view": true, "sf-name": "No Version" });

		await expect(importer.parse(file)).rejects.toMatchObject({
			code: "INVALID_FRONTMATTER",
		});
	});

	it("throws ImportError(INVALID_FRONTMATTER) when sf-version is a string", async () => {
		const file = makeFile("views/str-version.md");
		const content = [
			"---",
			"sf-view: true",
			"sf-version: 'v1'",
			"sf-name: String Version",
			"---",
			"",
			"```dataviewjs",
			"dv.list([])",
			"```",
		].join("\n");
		wireVaultRead(app, file, content);
		wireCache(app, file, { "sf-view": true, "sf-version": "v1", "sf-name": "String Version" });

		await expect(importer.parse(file)).rejects.toMatchObject({
			code: "INVALID_FRONTMATTER",
		});
	});

	it("throws ImportError(INVALID_FRONTMATTER) when sf-version is a float (non-integer)", async () => {
		const file = makeFile("views/float-version.md");
		const content = [
			"---",
			"sf-view: true",
			"sf-version: 1.5",
			"sf-name: Float Version",
			"---",
			"",
			"```dataviewjs",
			"dv.list([])",
			"```",
		].join("\n");
		wireVaultRead(app, file, content);
		wireCache(app, file, { "sf-view": true, "sf-version": 1.5, "sf-name": "Float Version" });

		await expect(importer.parse(file)).rejects.toMatchObject({
			code: "INVALID_FRONTMATTER",
		});
	});

	// -------------------------------------------------------------------------
	// ImportError — INVALID_FRONTMATTER (sf-name)
	// -------------------------------------------------------------------------

	it("throws ImportError(INVALID_FRONTMATTER) when sf-name is empty string", async () => {
		const file = makeFile("views/empty-name.md");
		const content = [
			"---",
			"sf-view: true",
			"sf-version: 1",
			"sf-name: ''",
			"---",
			"",
			"```dataviewjs",
			"dv.list([])",
			"```",
		].join("\n");
		wireVaultRead(app, file, content);
		wireCache(app, file, { "sf-view": true, "sf-version": 1, "sf-name": "" });

		await expect(importer.parse(file)).rejects.toMatchObject({
			code: "INVALID_FRONTMATTER",
		});
	});

	// -------------------------------------------------------------------------
	// ImportError — ENGINE_MISMATCH
	// -------------------------------------------------------------------------

	it("throws ImportError(ENGINE_MISMATCH) when sf-engine contradicts the fence language", async () => {
		const file = makeFile("views/mismatch.md");
		const content = [
			"---",
			"sf-view: true",
			"sf-version: 1",
			"sf-name: Mismatch",
			"sf-engine: dataview-dql",
			"---",
			"",
			"```dataviewjs",
			"dv.list([])",
			"```",
		].join("\n");
		wireVaultRead(app, file, content);
		wireCache(app, file, {
			"sf-view": true,
			"sf-version": 1,
			"sf-name": "Mismatch",
			"sf-engine": "dataview-dql",
		});

		await expect(importer.parse(file)).rejects.toMatchObject({
			code: "ENGINE_MISMATCH",
		});
		await expect(importer.parse(file)).rejects.toBeInstanceOf(ImportError);
	});

	it("does NOT throw ENGINE_MISMATCH when sf-engine matches the fence language", async () => {
		const file = makeFile("views/match.md");
		const content = [
			"---",
			"sf-view: true",
			"sf-version: 1",
			"sf-name: Match",
			"sf-engine: dataviewjs",
			"---",
			"",
			"```dataviewjs",
			"dv.list([])",
			"```",
		].join("\n");
		wireVaultRead(app, file, content);
		wireCache(app, file, {
			"sf-view": true,
			"sf-version": 1,
			"sf-name": "Match",
			"sf-engine": "dataviewjs",
		});

		await expect(importer.parse(file)).resolves.toMatchObject({ engine: "dataviewjs" });
	});

	it("does NOT throw ENGINE_MISMATCH when sf-engine is a non-string value (silently ignored)", async () => {
		const file = makeFile("views/nonstring-engine.md");
		const content = [
			"---",
			"sf-view: true",
			"sf-version: 1",
			"sf-name: Non-string Engine",
			"sf-engine: 42",
			"---",
			"",
			"```dataviewjs",
			"dv.list([])",
			"```",
		].join("\n");
		wireVaultRead(app, file, content);
		wireCache(app, file, {
			"sf-view": true,
			"sf-version": 1,
			"sf-name": "Non-string Engine",
			// Non-string sf-engine — intentionally ignored (only string values
			// are cross-checked; a number never triggers ENGINE_MISMATCH).
			"sf-engine": 42,
		});

		// parse() must RESOLVE to a valid ViewDefinition; engine is inferred
		// from the fence language, not the ignored non-string sf-engine field.
		const def = await importer.parse(file);
		expect(def.engine).toBe("dataviewjs");
	});
});

// ---------------------------------------------------------------------------
// T2.2 — toRecord() + importToStore()
// ---------------------------------------------------------------------------

describe("ViewImporter.toRecord()", () => {
	let app: App;
	let store: ViewStore;
	let importer: ViewImporter;

	const sampleDef: ViewDefinition = {
		sourcePath: "views/sample.md",
		engine: "dataviewjs",
		version: 1,
		name: "Sample",
		description: "A sample view",
		command: true,
		querySource: "dv.list([])\n",
		checksum: "sha256:abc123" as `sha256:${string}`,
	};

	beforeEach(() => {
		app = new App();
		store = makeStore();
		importer = new ViewImporter(app, store);
	});

	it("returns a ViewRecord with provenance:'imported'", () => {
		const rec = importer.toRecord(sampleDef);
		expect(rec.provenance).toBe("imported");
	});

	it("returns a ViewRecord with enabled:false", () => {
		const rec = importer.toRecord(sampleDef);
		expect(rec.enabled).toBe(false);
	});

	it("returns a ViewRecord with okayed:null", () => {
		const rec = importer.toRecord(sampleDef);
		expect(rec.okayed).toBeNull();
	});

	it("returns a ViewRecord with source === def.sourcePath", () => {
		const rec = importer.toRecord(sampleDef);
		expect(rec.source).toBe(sampleDef.sourcePath);
	});

	it("returns a ViewRecord with engine === def.engine", () => {
		const rec = importer.toRecord(sampleDef);
		expect(rec.engine).toBe(sampleDef.engine);
	});

	it("returns a ViewRecord with command === def.command", () => {
		const rec = importer.toRecord(sampleDef);
		expect(rec.command).toBe(sampleDef.command);
	});

	it("returns a ViewRecord with commandName === def.name", () => {
		const rec = importer.toRecord(sampleDef);
		expect(rec.commandName).toBe(sampleDef.name);
	});

	it("returns a ViewRecord with description === def.description", () => {
		const rec = importer.toRecord(sampleDef);
		expect(rec.description).toBe(sampleDef.description);
	});

	it("the generated id (returned implicitly via importToStore) is a non-empty string different from sourcePath", async () => {
		const id = await importer.importToStore(sampleDef);
		expect(typeof id).toBe("string");
		expect(id.length).toBeGreaterThan(0);
		expect(id).not.toBe(sampleDef.sourcePath);
	});

	it("calling toRecord twice on the same def produces different ids (non-deterministic store-generated)", async () => {
		// We test this via importToStore which generates the id
		const store1 = makeStore();
		const imp1 = new ViewImporter(app, store1);
		const id1 = await imp1.importToStore(sampleDef);

		const store2 = makeStore();
		const imp2 = new ViewImporter(app, store2);
		const id2 = await imp2.importToStore({ ...sampleDef, sourcePath: "views/other.md" });

		// ids must be different (crypto.randomUUID generates unique values)
		expect(id1).not.toBe(id2);
	});
});

describe("ViewImporter.importToStore()", () => {
	let app: App;
	let importer: ViewImporter;

	const sampleDef: ViewDefinition = {
		sourcePath: "views/sample.md",
		engine: "dataviewjs",
		version: 1,
		name: "Sample",
		description: "A sample view",
		command: true,
		querySource: "dv.list([])\n",
		checksum: "sha256:abc123" as `sha256:${string}`,
	};

	beforeEach(() => {
		app = new App();
	});

	it("calls store.setRecord exactly once with okayed:null on non-duplicate", async () => {
		const store = makeStore();
		const setRecordSpy = vi.spyOn(store, "setRecord");
		importer = new ViewImporter(app, store);

		const id = await importer.importToStore(sampleDef);

		expect(setRecordSpy).toHaveBeenCalledTimes(1);
		const [calledId, calledRec] = setRecordSpy.mock.calls[0]!;
		expect(calledId).toBe(id);
		expect(calledRec.okayed).toBeNull();
	});

	it("throws ImportError(DUPLICATE) without calling setRecord when source already in store", async () => {
		const existingRecord: ViewRecord = {
			provenance: "imported",
			enabled: false,
			okayed: null,
			source: "views/sample.md",
			engine: "dataviewjs",
			command: false,
		};
		const store = makeStore({ "existing-id": existingRecord });
		const setRecordSpy = vi.spyOn(store, "setRecord");
		importer = new ViewImporter(app, store);

		await expect(importer.importToStore(sampleDef)).rejects.toMatchObject({
			code: "DUPLICATE",
			message: "View already imported",
		});
		await expect(importer.importToStore(sampleDef)).rejects.toBeInstanceOf(ImportError);
		expect(setRecordSpy).not.toHaveBeenCalled();
	});

	it("setRecord is never called with okayed set (okayed must be null at import time)", async () => {
		const store = makeStore();
		const setRecordSpy = vi.spyOn(store, "setRecord");
		importer = new ViewImporter(app, store);

		await importer.importToStore(sampleDef);

		for (const call of setRecordSpy.mock.calls) {
			const rec = call[1] as ViewRecord;
			expect(rec.okayed).toBeNull();
		}
	});
});

// ---------------------------------------------------------------------------
// T2.3 — scanVault()
// ---------------------------------------------------------------------------

describe("ViewImporter.scanVault()", () => {
	let app: App;
	let importer: ViewImporter;

	beforeEach(() => {
		app = new App();
	});

	it("returns TFile objects whose frontmatter sf-view === true (strict boolean)", async () => {
		const file1 = makeFile("views/a.md", "a");
		const file2 = makeFile("views/b.md", "b");
		const file3 = makeFile("views/c.md", "c");

		vi.mocked(app.vault.getMarkdownFiles).mockReturnValue([file1, file2, file3]);
		vi.mocked(app.metadataCache.getFileCache).mockImplementation((f: TFile) => {
			if (f.path === "views/a.md") return { frontmatter: { "sf-view": true } };
			if (f.path === "views/b.md") return { frontmatter: { "sf-view": false } };
			if (f.path === "views/c.md") return { frontmatter: { "sf-view": true } };
			return null;
		});

		const store = makeStore();
		importer = new ViewImporter(app, store);
		const result = await importer.scanVault();

		expect(result).toHaveLength(2);
		expect(result.map((f) => f.path)).toContain("views/a.md");
		expect(result.map((f) => f.path)).toContain("views/c.md");
	});

	it("excludes files where sf-view is absent", async () => {
		const file = makeFile("views/no-flag.md");

		vi.mocked(app.vault.getMarkdownFiles).mockReturnValue([file]);
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue({ frontmatter: {} });

		const store = makeStore();
		importer = new ViewImporter(app, store);
		expect(await importer.scanVault()).toHaveLength(0);
	});

	it("excludes files where sf-view is a non-boolean truthy value (string 'true')", async () => {
		const file = makeFile("views/truthy.md");

		vi.mocked(app.vault.getMarkdownFiles).mockReturnValue([file]);
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue({
			frontmatter: { "sf-view": "true" },
		});

		const store = makeStore();
		importer = new ViewImporter(app, store);
		expect(await importer.scanVault()).toHaveLength(0);
	});

	it("excludes files where sf-view is a number 1 (non-boolean-truthy)", async () => {
		const file = makeFile("views/num.md");

		vi.mocked(app.vault.getMarkdownFiles).mockReturnValue([file]);
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue({
			frontmatter: { "sf-view": 1 },
		});

		const store = makeStore();
		importer = new ViewImporter(app, store);
		expect(await importer.scanVault()).toHaveLength(0);
	});

	it("excludes paths already present in store.getViews() (already imported)", async () => {
		const file = makeFile("views/imported.md");

		vi.mocked(app.vault.getMarkdownFiles).mockReturnValue([file]);
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue({
			frontmatter: { "sf-view": true },
		});

		const existingRecord: ViewRecord = {
			provenance: "imported",
			enabled: false,
			okayed: null,
			source: "views/imported.md",
			engine: "dataviewjs",
			command: false,
		};
		const store = makeStore({ "some-id": existingRecord });
		importer = new ViewImporter(app, store);
		const result = await importer.scanVault();

		expect(result).toHaveLength(0);
	});

	it("returns an empty array when no vault notes have sf-view:true", async () => {
		vi.mocked(app.vault.getMarkdownFiles).mockReturnValue([]);

		const store = makeStore();
		importer = new ViewImporter(app, store);
		expect(await importer.scanVault()).toHaveLength(0);
	});

	it("does NOT call app.vault.read() — scan is cache-only", async () => {
		const file = makeFile("views/cache-only.md");

		vi.mocked(app.vault.getMarkdownFiles).mockReturnValue([file]);
		vi.mocked(app.metadataCache.getFileCache).mockReturnValue({
			frontmatter: { "sf-view": true },
		});

		const store = makeStore();
		importer = new ViewImporter(app, store);
		await importer.scanVault();

		expect(app.vault.read).not.toHaveBeenCalled();
	});
});
