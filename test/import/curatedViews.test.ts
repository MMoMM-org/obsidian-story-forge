/**
 * Curated reverse-relation sf-view seed notes — T5.1 (Phase 5)
 *
 * TDD order: these tests were written BEFORE the view notes exist.
 * Each test reads the real note file, parses it through ViewImporter.parse(),
 * and asserts the structural contract:
 *   - engine: 'dataview-dql'
 *   - non-empty sf-name
 *   - exactly one fenced query block
 *   - DQL body contains the expected reverse-query marker
 *
 * The `inhabitants` view (note 3) uses `this.inhabitants` (the active
 * location's own field) rather than the standard `this.file.link` reverse
 * form — it is asserted separately with `this.inhabitants`.
 *
 * @ref PRD/F7, spec 004-contextual-panel phase 5, T5.1
 * @ref SDD/ADR-6 — view-definition format
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { App, TFile, createMockTFile } from "../__mocks__/obsidian";
import { ViewImporter } from "import/ViewImporter";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VAULT_ROOT = resolve(__dirname, "../../test/StoryForge");

/** All six new curated reverse-relation view note paths (relative to vault root). */
const VIEW_PATHS = {
	appearsIn: "sf-views/appears-in.md",
	owns: "sf-views/owns.md",
	inhabitants: "sf-views/inhabitants.md",
	scenesHere: "sf-views/scenes-here.md",
	plotlineScenes: "sf-views/plotline-scenes.md",
	bookScenes: "sf-views/book-scenes.md",
} as const;

// ---------------------------------------------------------------------------
// Helpers (mirrored from seedNotes.test.ts)
// ---------------------------------------------------------------------------

function makeFile(path: string): TFile {
	return createMockTFile({
		path,
		basename: path.split("/").pop()!.replace(/\.md$/, ""),
		name: path.split("/").pop()!,
	});
}

function wireVaultRead(app: App, file: TFile, content: string): void {
	vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((p: string) =>
		p === file.path ? file : null,
	);
	vi.mocked(app.vault.read).mockResolvedValue(content);
}

/**
 * Parse YAML-style frontmatter from a seed note string.
 * Handles simple scalar values (string, integer, boolean) only —
 * sufficient for sf-view, sf-version, sf-name, sf-engine, sf-description.
 */
function parseFrontmatter(content: string): Record<string, unknown> {
	const m = content.match(/^---\n([\s\S]*?)\n---/);
	if (!m || m[1] === undefined) return {};
	const fm: Record<string, unknown> = {};
	for (const line of m[1].split("\n")) {
		const kv = line.match(/^([A-Za-z_-][A-Za-z0-9_-]*):\s*(.+)$/);
		if (!kv) continue;
		const key = kv[1]!;
		const raw = kv[2]!.trim();
		if (raw === "true") fm[key] = true;
		else if (raw === "false") fm[key] = false;
		else if (/^\d+$/.test(raw)) fm[key] = Number(raw);
		else fm[key] = raw.replace(/^["']|["']$/g, "");
	}
	return fm;
}

function wireCache(app: App, file: TFile, fm: Record<string, unknown>): void {
	vi.mocked(app.metadataCache.getFileCache).mockImplementation((f: TFile) =>
		f.path === file.path ? { frontmatter: fm } : null,
	);
}

/** Build a minimal ViewStore stub (parse() does not use store). */
function makeStoreStub() {
	return {
		getViews: vi.fn(async () => ({})),
		setRecord: vi.fn(async () => {}),
	} as unknown as import("store/ViewStore").ViewStore;
}

/**
 * Shared assertion helper: parse the note at `relativePath` through
 * ViewImporter.parse() and return the resulting ViewDefinition.
 */
async function parseNote(app: App, relativePath: string) {
	const content = readFileSync(resolve(VAULT_ROOT, relativePath), "utf8");
	const file = makeFile(relativePath);
	const fm = parseFrontmatter(content);
	wireVaultRead(app, file, content);
	wireCache(app, file, fm);
	const importer = new ViewImporter(app, makeStoreStub());
	return importer.parse(file);
}

// ---------------------------------------------------------------------------
// Shared structural contract tests for all six notes
// ---------------------------------------------------------------------------

describe("Curated reverse-relation sf-views — structural contract", () => {
	let app: App;

	beforeEach(() => {
		app = new App();
	});

	for (const [key, relativePath] of Object.entries(VIEW_PATHS)) {
		describe(`${key} (${relativePath})`, () => {
			it("parses without ImportError", async () => {
				await expect(parseNote(app, relativePath)).resolves.not.toThrow();
			});

			it("has engine: dataview-dql", async () => {
				const def = await parseNote(app, relativePath);
				expect(def.engine).toBe("dataview-dql");
			});

			it("has a non-empty sf-name", async () => {
				const def = await parseNote(app, relativePath);
				expect(def.name.length).toBeGreaterThan(0);
			});

			it("has exactly one fenced query block", () => {
				const content = readFileSync(resolve(VAULT_ROOT, relativePath), "utf8");
				const fences = [...content.matchAll(/^```(dataview|dataviewjs)\s*$/gm)];
				expect(fences.length).toBe(1);
			});

			it("frontmatter sf-view is true and sf-version is 1", () => {
				const content = readFileSync(resolve(VAULT_ROOT, relativePath), "utf8");
				const fm = parseFrontmatter(content);
				expect(fm["sf-view"]).toBe(true);
				expect(fm["sf-version"]).toBe(1);
			});
		});
	}
});

// ---------------------------------------------------------------------------
// Per-note DQL body assertions
// ---------------------------------------------------------------------------

describe("appears-in — reverse query marker", () => {
	let app: App;
	beforeEach(() => { app = new App(); });

	it("DQL body references this.file.link (reverse-relation marker)", async () => {
		const def = await parseNote(app, VIEW_PATHS.appearsIn);
		expect(def.querySource).toContain("this.file.link");
	});

	it("DQL body queries FROM 10 Manuscript", async () => {
		const def = await parseNote(app, VIEW_PATHS.appearsIn);
		expect(def.querySource).toContain("10 Manuscript");
	});

	it("DQL body checks pov OR characters fields", async () => {
		const def = await parseNote(app, VIEW_PATHS.appearsIn);
		expect(def.querySource).toContain("pov");
		expect(def.querySource).toContain("characters");
	});
});

describe("owns — reverse query marker", () => {
	let app: App;
	beforeEach(() => { app = new App(); });

	it("DQL body references this.file.link (reverse-relation marker)", async () => {
		const def = await parseNote(app, VIEW_PATHS.owns);
		expect(def.querySource).toContain("this.file.link");
	});

	it("DQL body queries FROM 30 Canon/33 Objects", async () => {
		const def = await parseNote(app, VIEW_PATHS.owns);
		expect(def.querySource).toContain("30 Canon");
	});

	it("DQL body checks owner field", async () => {
		const def = await parseNote(app, VIEW_PATHS.owns);
		expect(def.querySource).toContain("owner");
	});
});

describe("inhabitants — active-location forward query", () => {
	let app: App;
	beforeEach(() => { app = new App(); });

	/**
	 * inhabitants is stored on the location note itself, not on the character.
	 * The DQL therefore reads the active location's own `inhabitants` field
	 * (e.g. FLATTEN this.inhabitants) rather than a standard reverse-link form.
	 * We assert `this.inhabitants` instead of `this.file.link`.
	 */
	it("DQL body uses this.inhabitants (forward-field form, not reverse-link)", async () => {
		const def = await parseNote(app, VIEW_PATHS.inhabitants);
		expect(def.querySource).toContain("this.inhabitants");
	});

	it("DQL body does NOT use this.file.link (not a reverse-link query)", async () => {
		const def = await parseNote(app, VIEW_PATHS.inhabitants);
		expect(def.querySource).not.toContain("this.file.link");
	});
});

describe("scenes-here — reverse query marker", () => {
	let app: App;
	beforeEach(() => { app = new App(); });

	it("DQL body references this.file.link (reverse-relation marker)", async () => {
		const def = await parseNote(app, VIEW_PATHS.scenesHere);
		expect(def.querySource).toContain("this.file.link");
	});

	it("DQL body queries FROM 10 Manuscript", async () => {
		const def = await parseNote(app, VIEW_PATHS.scenesHere);
		expect(def.querySource).toContain("10 Manuscript");
	});

	it("DQL body checks location field", async () => {
		const def = await parseNote(app, VIEW_PATHS.scenesHere);
		expect(def.querySource).toContain("location");
	});
});

describe("plotline-scenes — reverse query marker", () => {
	let app: App;
	beforeEach(() => { app = new App(); });

	it("DQL body references this.file.link (reverse-relation marker)", async () => {
		const def = await parseNote(app, VIEW_PATHS.plotlineScenes);
		expect(def.querySource).toContain("this.file.link");
	});

	it("DQL body queries FROM 10 Manuscript", async () => {
		const def = await parseNote(app, VIEW_PATHS.plotlineScenes);
		expect(def.querySource).toContain("10 Manuscript");
	});

	it("DQL body checks plotlines field", async () => {
		const def = await parseNote(app, VIEW_PATHS.plotlineScenes);
		expect(def.querySource).toContain("plotlines");
	});
});

describe("book-scenes — reverse query marker", () => {
	let app: App;
	beforeEach(() => { app = new App(); });

	it("DQL body references this.file.link (reverse-relation marker)", async () => {
		const def = await parseNote(app, VIEW_PATHS.bookScenes);
		expect(def.querySource).toContain("this.file.link");
	});

	it("DQL body queries FROM 10 Manuscript", async () => {
		const def = await parseNote(app, VIEW_PATHS.bookScenes);
		expect(def.querySource).toContain("10 Manuscript");
	});

	it("DQL body checks book field", async () => {
		const def = await parseNote(app, VIEW_PATHS.bookScenes);
		expect(def.querySource).toContain("book");
	});
});
