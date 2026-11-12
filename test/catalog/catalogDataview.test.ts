/**
 * The catalog is no longer Bases-only (spec 008 T7.2, PRD F7 AC 9).
 *
 * (d) `buildCatalog()` reads `.base` files and curated Dataview notes from one folder, emits an
 *     entry per engine, and refuses a note it cannot turn into exactly one query.
 * (e) A curated Dataview entry installs through `CatalogService` as a from-repo collection whose
 *     consent tokens are the ones `ConsentGate` itself computes from the written note, so it draws
 *     without a modal. A DataviewJS entry still asks first and writes nothing when declined.
 * The shipped `catalog/` builds, holds a Dataview entry, and that entry's query names only fields
 * the story schema declares (read from `schema/*.json`, not listed here).
 */

import { describe, it, expect, vi } from "vitest";
import { mkdirSync, rmSync, writeFileSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { parse as parseYaml } from "yaml";
import { App, TFile, createMockTFile } from "../__mocks__/obsidian";
import { computeChecksum } from "consent/checksum";
import { ConsentGate } from "consent/ConsentGate";
import { CatalogService } from "catalog/CatalogService";
import { BrowseOfficialModal } from "catalog/BrowseOfficialModal";
import type { CatalogEntry, CatalogIndex } from "catalog/catalogTypes";
import { extractQueryBlocks } from "import/queryBlocks";
import { ViewStore } from "store/ViewStore";
import type { PluginDataPort, StoryForgeData, ViewRecord } from "store/types";

type BuildCatalog = (opts: { catalogDir: string; outDir: string }) => Promise<CatalogIndex>;

async function loadBuild(): Promise<BuildCatalog> {
	const mod = (await import("../../scripts/build-catalog.mjs")) as { buildCatalog: BuildCatalog };
	return mod.buildCatalog;
}

const REPO_ROOT = resolve(__dirname, "../..");
const BASE_YAML = 'filters:\n  and:\n    - file.hasTag("canon/character")\nviews:\n  - type: table\n    name: Characters\n';
const DQL_BODY = "TABLE status AS Status\nFROM #manuscript/scene\nWHERE contains(pov, this.file.link)\n";

function note(fm: string, ...blocks: Array<[string, string]>): string {
	return `---\n${fm}---\n\nA curated view.\n\n${blocks.map(([lang, body]) => `\`\`\`${lang}\n${body}\`\`\`\n`).join("\n")}`;
}

const DQL_NOTE = note("sf-view: true\nsf-version: 2\nsf-name: Point of view\nsf-description: Scenes told from this note.\n", ["dataview", DQL_BODY]);

/** Build `files` in a fresh folder; returns the index or the thrown error. */
async function build(files: Record<string, string>): Promise<CatalogIndex> {
	const root = join(tmpdir(), `sf-catalog-dv-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	const catalogDir = join(root, "catalog");
	mkdirSync(catalogDir, { recursive: true });
	for (const [name, content] of Object.entries(files)) writeFileSync(join(catalogDir, name), content, "utf8");
	try {
		return await (await loadBuild())({ catalogDir, outDir: join(root, "out") });
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

// ---------------------------------------------------------------------------
// (d) the builder covers the import's engines
// ---------------------------------------------------------------------------

describe("buildCatalog — a mixed-engine catalog", () => {
	it("emits a Bases entry for a .base and a Dataview entry for a curated note", async () => {
		const index = await build({ "characters.base": BASE_YAML, "point-of-view.md": DQL_NOTE, "README.txt": "ignored" });
		expect(index.entries.map((e) => [e.id, e.engine])).toEqual([
			["characters", "bases"],
			["point-of-view", "dataview-dql"],
		]);
		const dv = index.entries[1]!;
		expect(dv).toMatchObject({
			name: "Point of view",
			description: "Scenes told from this note.",
			source: DQL_NOTE,
			checksum: await computeChecksum(DQL_NOTE),
			version: 2,
			queryChecksum: await computeChecksum(DQL_BODY),
		});
	});

	it("infers DataviewJS from the block language", async () => {
		const index = await build({ "web.md": note("sf-version: 1\nsf-name: Web\n", ["dataviewjs", "dv.list([])\n"]) });
		expect(index.entries[0]!.engine).toBe("dataviewjs");
	});

	it.each([
		["no query block", note("sf-version: 1\nsf-name: X\n"), /exactly one query block/],
		["two query blocks", note("sf-version: 1\nsf-name: X\n", ["dataview", "LIST\n"], ["dataview", "LIST\n"]), /exactly one query block/],
		["no sf-version", note("sf-name: X\n", ["dataview", "LIST\n"]), /sf-version/],
		["an sf-engine that contradicts the block", note("sf-version: 1\nsf-engine: dataviewjs\n", ["dataview", "LIST\n"]), /sf-engine/],
		["no frontmatter", "```dataview\nLIST\n```\n", /frontmatter/],
	])("refuses a note with %s, naming the file", async (_label, content, reason) => {
		await expect(build({ "bad.md": content })).rejects.toThrow(/bad\.md/);
		await expect(build({ "bad.md": content })).rejects.toThrow(reason);
	});
});

describe("the shipped catalog/", () => {
	it("builds, and holds a curated Dataview view", async () => {
		const index = await build(Object.fromEntries(
			readdirSync(join(REPO_ROOT, "catalog")).map((f) => [f, readFileSync(join(REPO_ROOT, "catalog", f), "utf8")]),
		));
		expect(index.entries.some((e) => e.engine === "dataview-dql")).toBe(true);
	});

	it("queries only fields the schema of the tag it reads declares", async () => {
		const index = await build(Object.fromEntries(
			readdirSync(join(REPO_ROOT, "catalog")).map((f) => [f, readFileSync(join(REPO_ROOT, "catalog", f), "utf8")]),
		));
		const schemas = readdirSync(join(REPO_ROOT, "schema"))
			.filter((f) => f.endsWith(".json"))
			.map((f) => JSON.parse(readFileSync(join(REPO_ROOT, "schema", f), "utf8")) as { tag: string; fields: Array<{ name: string }> });
		for (const entry of index.entries.filter((e) => e.engine === "dataview-dql")) {
			const query = extractQueryBlocks(entry.source)[0]!.body;
			const tag = /FROM #([\w/-]+)/.exec(query)?.[1];
			const schema = schemas.find((s) => s.tag === tag);
			expect(schema, `${entry.id} reads a tag no schema declares`).toBeDefined();
			const declared = new Set(schema!.fields.map((f) => f.name));
			const used = [...query.matchAll(/contains\((\w+), this\.file\.link\)|(?<![.\w])(\w+) AS /g)].map((m) => m[1] ?? m[2]!);
			expect(used.length).toBeGreaterThan(0);
			for (const field of used) expect(declared, `${entry.id} uses ${field}`).toContain(field);
		}
	});
});

// ---------------------------------------------------------------------------
// (e) a curated Dataview view installs from the catalog
// ---------------------------------------------------------------------------

/** A vault whose adapter writes are real files the vault and metadata cache then see. */
function makeVault() {
	const app = new App();
	const files = new Map<string, string>();
	const tfile = (path: string): TFile | null =>
		files.has(path) ? createMockTFile({ path, name: path.split("/").pop()!, extension: path.split(".").pop()! }) : null;
	vi.mocked(app.vault.adapter.exists).mockImplementation(async () => false);
	vi.mocked(app.vault.adapter.write).mockImplementation(async (p: string, data: string) => { files.set(p, data); });
	vi.mocked(app.vault.adapter.remove).mockImplementation(async (p: string) => { files.delete(p); });
	vi.mocked(app.vault.getAbstractFileByPath).mockImplementation(tfile);
	vi.mocked(app.vault.read).mockImplementation(async (f: TFile) => files.get(f.path)!);
	vi.mocked(app.metadataCache.getFileCache).mockImplementation((f: TFile) => {
		const fm = /^---\n([\s\S]*?)\n---/.exec(files.get(f.path) ?? "")?.[1];
		return fm === undefined ? null : { frontmatter: parseYaml(fm) as Record<string, unknown> };
	});
	return { app, files };
}

function makeStore() {
	let data: StoryForgeData = { views: {} };
	const port: PluginDataPort = { load: async () => structuredClone(data), save: async (d) => { data = structuredClone(d as StoryForgeData); } };
	return { store: new ViewStore(port), views: (): Record<string, ViewRecord> => data.views ?? {} };
}

async function dataviewEntry(overrides: Partial<CatalogEntry> = {}): Promise<CatalogEntry> {
	const index = await build({ "point-of-view.md": DQL_NOTE });
	return { ...index.entries[0]!, ...overrides } as CatalogEntry;
}

function service(app: App, store: ViewStore, entry: CatalogEntry, consent = vi.fn(async () => null as { version: number; checksum: string } | null)) {
	const gate = { requestConsentForQuery: consent } as unknown as ConsentGate;
	const svc = new CatalogService({ version: "1", generated: "", entries: [entry] }, {
		app, gate, store, curatedBasesFolder: "00 Meta/Bases", collectionParams: { tag: "", excludedFolders: [] },
	});
	return { svc, consent };
}

function realGate(app: App, store: ViewStore): ConsentGate {
	return new ConsentGate(app, { get: () => ({}) }, { isDvJsEnabled: () => true }, store, async () => null, () => ({ tag: "", excludedFolders: [] }));
}

describe("CatalogService — installing a curated Dataview view", () => {
	it("writes the note into the repo folder and stores a from-repo Dataview collection for the Workbench", async () => {
		const { app, files } = makeVault();
		const { store, views } = makeStore();
		const entry = await dataviewEntry();
		const { svc, consent } = service(app, store, entry);

		expect(await svc.install(entry.id)).toEqual({ ok: true, path: "00 Meta/Bases/point-of-view.md" });
		expect(files.get("00 Meta/Bases/point-of-view.md")).toBe(DQL_NOTE);
		const [record] = Object.values(views());
		expect(record).toMatchObject({
			provenance: "curated", kind: "collection", engine: "dataview-dql", enabled: true,
			source: "00 Meta/Bases/point-of-view.md", commandName: "Point of view", catalogId: "point-of-view",
			surfaces: { anvil: false, workbench: true },
		});
		expect(record!.generated).toBeUndefined();
		// Declarative: no consent modal (PRD F7 AC 8).
		expect(consent).not.toHaveBeenCalled();
		// The gate, reading the written note itself, agrees it may draw.
		expect((await realGate(app, store).evaluate(record!)).status).toBe("consented");
	});

	it("reports an installed entry as up to date instead of installing it twice", async () => {
		const { app } = makeVault();
		const { store, views } = makeStore();
		const entry = await dataviewEntry();
		const { svc } = service(app, store, entry);
		await svc.install(entry.id);
		expect(await svc.install(entry.id)).toEqual({ ok: false, reason: "up-to-date: already installed" });
		expect(Object.keys(views())).toHaveLength(1);
	});

	it("fails closed when the query does not match the checksum the catalog recorded", async () => {
		const { app, files } = makeVault();
		const { store, views } = makeStore();
		const entry = await dataviewEntry({ queryChecksum: "sha256:" + "0".repeat(64) });
		const { svc } = service(app, store, entry);
		const result = await svc.install(entry.id);
		expect(result.ok).toBe(false);
		expect(!result.ok && result.reason).toMatch(/checksum/);
		expect(files.size).toBe(0);
		expect(views()).toEqual({});
	});

	it("asks before installing a DataviewJS entry, and writes nothing when declined", async () => {
		const { app, files } = makeVault();
		const { store, views } = makeStore();
		const index = await build({ "web.md": note("sf-version: 3\nsf-name: Web\n", ["dataviewjs", "dv.list([])\n"]) });
		const entry = index.entries[0]!;
		const { svc, consent } = service(app, store, entry);

		const result = await svc.install(entry.id);
		expect(consent).toHaveBeenCalledWith(expect.objectContaining({ engine: "dataviewjs", body: "dv.list([])\n", sourcePath: "00 Meta/Bases/web.md" }));
		expect(result).toEqual({ ok: false, reason: "consent declined" });
		expect(files.size).toBe(0);
		expect(views()).toEqual({});
	});

	it("installs a DataviewJS entry the user approved, with the approval stored", async () => {
		const { app } = makeVault();
		const { store, views } = makeStore();
		const index = await build({ "web.md": note("sf-version: 3\nsf-name: Web\n", ["dataviewjs", "dv.list([])\n"]) });
		const entry = index.entries[0]!;
		const tokens = { version: 3, checksum: await computeChecksum("dv.list([])\n") };
		const { svc } = service(app, store, entry, vi.fn(async () => tokens));
		expect((await svc.install(entry.id)).ok).toBe(true);
		const [record] = Object.values(views());
		expect(record).toMatchObject({ engine: "dataviewjs", okayed: tokens, enabled: true });
		expect((await realGate(app, store).evaluate(record!)).status).toBe("consented");
	});
});

describe("Browse repo… — a curated Dataview view in the catalog list", () => {
	const buttons = (): string[] => [...document.body.querySelectorAll("button")].map((b) => b.textContent ?? "");

	it("offers Install, and after installing lists it as installed rather than as an update", async () => {
		const { app } = makeVault();
		const { store } = makeStore();
		const entry = await dataviewEntry();
		const { svc } = service(app, store, entry);

		const before = new BrowseOfficialModal(app, svc, store);
		before.open();
		await vi.waitFor(() => expect(buttons()).toContain("Install"));
		before.close();
		document.body.innerHTML = "";

		await svc.install(entry.id);
		const after = new BrowseOfficialModal(app, svc, store);
		after.open();
		await vi.waitFor(() => expect(document.body.querySelector(".sf-catalog-installed-label")?.textContent).toBe("Installed"));
		expect(buttons()).not.toContain("Update");
		after.close();
		document.body.innerHTML = "";
	});
});
