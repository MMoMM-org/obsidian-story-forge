/**
 * Seed-note parse tests — T5.2 (Phase 5, Integration & validation)
 *
 * Verifies that the live-vault seed notes in test/StoryForge/sf-views/ are
 * parseable by ViewImporter.parse() without throwing ImportError, and that
 * each note's inferred engine kind is correct.
 *
 * Test idiom: read the real seed-note files via Node `fs.readFileSync`, feed
 * the content into the Obsidian vault mock via wireVaultRead, extract
 * frontmatter manually for wireCache, then call parse().
 *
 * @ref SDD/ADR-6 — view-definition format (sf-view, sf-version, sf-name, one fenced block)
 * @ref SDD/ADR-9 — engine inference from fence language
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { App, TFile, createMockTFile } from "../__mocks__/obsidian";
import { ViewImporter } from "import/ViewImporter";
import { ImportError } from "import/ViewDefinition";

// ---------------------------------------------------------------------------
// Paths to actual seed notes in the live test vault
// ---------------------------------------------------------------------------

const VAULT_ROOT = resolve(__dirname, "../../test/StoryForge");
const DQL_PATH = "sf-views/characters-in-scene.md";
const DVJS_PATH = "sf-views/scene-debug-dvjs.md";

// ---------------------------------------------------------------------------
// Helpers (mirrors the idiom in ViewImporter.test.ts)
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
 * sufficient for sf-view, sf-version, sf-name, sf-engine.
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Seed note parse — characters-in-scene.md (DQL)", () => {
	let app: App;
	let importer: ViewImporter;

	beforeEach(() => {
		app = new App();
		// ViewStore is unused in parse(); supply a minimal stub.
		const store = {
			getViews: vi.fn(async () => ({})),
			setRecord: vi.fn(async () => {}),
		} as unknown as import("store/ViewStore").ViewStore;
		importer = new ViewImporter(app, store);
	});

	it("parses without ImportError", async () => {
		const content = readFileSync(resolve(VAULT_ROOT, DQL_PATH), "utf8");
		const file = makeFile(DQL_PATH);
		const fm = parseFrontmatter(content);
		wireVaultRead(app, file, content);
		wireCache(app, file, fm);

		await expect(importer.parse(file)).resolves.not.toThrow();
	});

	it("infers engine:'dataview-dql' from the dataview fence", async () => {
		const content = readFileSync(resolve(VAULT_ROOT, DQL_PATH), "utf8");
		const file = makeFile(DQL_PATH);
		const fm = parseFrontmatter(content);
		wireVaultRead(app, file, content);
		wireCache(app, file, fm);

		const def = await importer.parse(file);
		expect(def.engine).toBe("dataview-dql");
	});

	it("sf-engine frontmatter matches the inferred engine (no ENGINE_MISMATCH)", async () => {
		const content = readFileSync(resolve(VAULT_ROOT, DQL_PATH), "utf8");
		const fm = parseFrontmatter(content);
		// This assertion verifies the seed note itself declares sf-engine correctly.
		// If not, parse() would throw ENGINE_MISMATCH — caught by the test above.
		expect(fm["sf-engine"]).toBe("dataview-dql");
	});
});

describe("Seed note parse — scene-debug-dvjs.md (DataviewJS)", () => {
	let app: App;
	let importer: ViewImporter;

	beforeEach(() => {
		app = new App();
		const store = {
			getViews: vi.fn(async () => ({})),
			setRecord: vi.fn(async () => {}),
		} as unknown as import("store/ViewStore").ViewStore;
		importer = new ViewImporter(app, store);
	});

	it("parses without ImportError", async () => {
		const content = readFileSync(resolve(VAULT_ROOT, DVJS_PATH), "utf8");
		const file = makeFile(DVJS_PATH);
		const fm = parseFrontmatter(content);
		wireVaultRead(app, file, content);
		wireCache(app, file, fm);

		await expect(importer.parse(file)).resolves.not.toThrow();
	});

	it("infers engine:'dataviewjs' from the dataviewjs fence", async () => {
		const content = readFileSync(resolve(VAULT_ROOT, DVJS_PATH), "utf8");
		const file = makeFile(DVJS_PATH);
		const fm = parseFrontmatter(content);
		wireVaultRead(app, file, content);
		wireCache(app, file, fm);

		const def = await importer.parse(file);
		expect(def.engine).toBe("dataviewjs");
	});

	it("sf-engine frontmatter matches the inferred engine (no ENGINE_MISMATCH)", async () => {
		const content = readFileSync(resolve(VAULT_ROOT, DVJS_PATH), "utf8");
		const fm = parseFrontmatter(content);
		expect(fm["sf-engine"]).toBe("dataviewjs");
	});
});

describe("Seed note parse — mutation guard (negative path)", () => {
	it("throws ImportError(ENGINE_MISMATCH) when DQL seed content is mutated to use a dataviewjs fence", async () => {
		// Read the real DQL seed note — valid on disk.
		const realContent = readFileSync(resolve(VAULT_ROOT, DQL_PATH), "utf8");
		// Corrupt ONLY an in-memory copy: swap the fence language so the declared
		// sf-engine: dataview-dql now contradicts the dataviewjs fence. The real
		// file on disk is untouched; this test validates that parse() catches the
		// mismatch rather than silently accepting bad content.
		const corruptedContent = realContent.replace(/^```dataview\s*$/m, "```dataviewjs");

		const app = new App();
		const store = {
			getViews: vi.fn(async () => ({})),
			setRecord: vi.fn(async () => {}),
		} as unknown as import("store/ViewStore").ViewStore;
		const importer = new ViewImporter(app, store);

		const file = makeFile(DQL_PATH);
		const fm = parseFrontmatter(realContent); // frontmatter is still dataview-dql
		wireVaultRead(app, file, corruptedContent); // body now has a dataviewjs fence
		wireCache(app, file, fm);

		await expect(importer.parse(file)).rejects.toBeInstanceOf(ImportError);
		await expect(importer.parse(file)).rejects.toMatchObject({ code: "ENGINE_MISMATCH" });
	});
});

describe("Seed note contract — both notes together", () => {
	it("each seed note has sf-view: true and sf-version: 1", () => {
		for (const p of [DQL_PATH, DVJS_PATH]) {
			const content = readFileSync(resolve(VAULT_ROOT, p), "utf8");
			const fm = parseFrontmatter(content);
			expect(fm["sf-view"], `${p}: sf-view must be true`).toBe(true);
			expect(fm["sf-version"], `${p}: sf-version must be 1`).toBe(1);
		}
	});

	it("each seed note has exactly one fenced query block", () => {
		for (const p of [DQL_PATH, DVJS_PATH]) {
			const content = readFileSync(resolve(VAULT_ROOT, p), "utf8");
			const fences = [...content.matchAll(/^```(dataview|dataviewjs)\s*$/gm)];
			expect(fences.length, `${p}: must have exactly one fenced query block`).toBe(1);
		}
	});

	it("DQL note uses ```dataview fence and DVJS note uses ```dataviewjs fence", () => {
		const dqlContent = readFileSync(resolve(VAULT_ROOT, DQL_PATH), "utf8");
		const dvjsContent = readFileSync(resolve(VAULT_ROOT, DVJS_PATH), "utf8");

		expect(dqlContent).toMatch(/^```dataview\s*$/m);
		expect(dvjsContent).toMatch(/^```dataviewjs\s*$/m);
	});
});
