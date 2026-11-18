/**
 * Tests for scripts/build-artifacts.mjs (artifact index build).
 *
 * @ref SDD/ADR-38
 * @ref PRD/F1.1, PRD/F1.3
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { computeChecksum } from "../../src/consent/checksum";
import type { ArtifactIndex } from "../../src/artifacts/artifactTypes";
import { placeholdersIn } from "../../src/artifacts/resolvePlaceholders";

type BuildArtifacts = (opts: { outDir: string; schemaDir?: string }) => Promise<ArtifactIndex>;
type RenderArtifacts = (schemaDir: string) => { set: string; relPath: string; source: string }[];

const ROOT = resolve(__dirname, "../..");
const SCHEMA_DIR = join(ROOT, "schema");

let buildArtifacts: BuildArtifacts;
let renderArtifacts: RenderArtifacts;
const tmpDirs: string[] = [];
const tmp = (): string => {
	const d = mkdtempSync(join(tmpdir(), "sf-artifacts-"));
	tmpDirs.push(d);
	return d;
};

beforeAll(async () => {
	buildArtifacts = (await import("../../scripts/build-artifacts.mjs")).buildArtifacts as BuildArtifacts;
	renderArtifacts = (await import("../../scripts/schema-artifacts.mjs"))
		.renderArtifacts as RenderArtifacts;
});
afterAll(() => {
	for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
});

describe("buildArtifacts", () => {
	it("emits one entry per rendered artifact with id, set, relPath and source", async () => {
		const out = tmp();
		const index = await buildArtifacts({ outDir: out });
		const rendered = renderArtifacts(SCHEMA_DIR);
		expect(index.version).toBe("1");
		expect(index.entries.length).toBeGreaterThan(0);
		expect(index.entries.map((e) => [e.set, e.relPath, e.source])).toEqual(
			rendered.map((r) => [r.set, r.relPath, r.source]),
		);
		const prefix = { fileclasses: "fileclass", templates: "template", schema: "schema" } as const;
		for (const e of index.entries) {
			expect(e.id).toBe(`${prefix[e.set]}/${e.relPath.replace(/\.md$/, "")}`);
		}
		expect(new Set(index.entries.map((e) => e.id)).size).toBe(index.entries.length);
	});

	it("writes the same index to artifact-index.json", async () => {
		const out = tmp();
		const index = await buildArtifacts({ outDir: out });
		expect(JSON.parse(readFileSync(join(out, "artifact-index.json"), "utf8"))).toEqual(index);
	});

	it("checksums the unresolved source as sha256:<hex>", async () => {
		const index = await buildArtifacts({ outDir: tmp() });
		for (const e of index.entries) {
			expect(e.checksum).toMatch(/^sha256:[0-9a-f]{64}$/);
			expect(e.checksum).toBe(await computeChecksum(e.source));
		}
	});

	it("records exactly the placeholders each source uses", async () => {
		const index = await buildArtifacts({ outDir: tmp() });
		for (const e of index.entries) {
			expect(e.placeholders).toEqual(placeholdersIn(e.source));
		}
		expect(index.entries.some((e) => e.placeholders.length > 0)).toBe(true);
	});

	it("is byte-identical across builds and carries no timestamp", async () => {
		const a = tmp();
		const b = tmp();
		await buildArtifacts({ outDir: a });
		await buildArtifacts({ outDir: b });
		const raw = readFileSync(join(a, "artifact-index.json"), "utf8");
		expect(raw).toBe(readFileSync(join(b, "artifact-index.json"), "utf8"));
		expect(Object.keys(JSON.parse(raw) as object).sort()).toEqual(["entries", "version"]);
	});

	it("never ships dev-only files", async () => {
		const index = await buildArtifacts({ outDir: tmp() });
		const schemaJson = readdirSync(SCHEMA_DIR).filter((f) => f.endsWith(".json"));
		expect(schemaJson.length).toBeGreaterThan(0);
		for (const e of index.entries) {
			expect(e.relPath).not.toMatch(/\.(json|base|js)$/);
			expect(e.relPath).not.toMatch(/^CLAUDE\.md$/);
			expect(e.relPath).not.toMatch(/^(Processes|Bases|Scripts|dataview-views)\//);
			expect(schemaJson).not.toContain(e.relPath);
			expect(["fileclasses", "templates", "schema"]).toContain(e.set);
		}
		// Value-list notes inside the FileClass set are .md, never copies of schema JSON.
		expect(index.entries.every((e) => e.relPath.endsWith(".md"))).toBe(true);
	});

	it("fails the build on an unknown placeholder", async () => {
		const schemaDir = tmp();
		cpSync(SCHEMA_DIR, schemaDir, { recursive: true });
		const tpl = readdirSync(join(schemaDir, "templates"))[0] as string;
		const p = join(schemaDir, "templates", tpl);
		writeFileSync(p, `${readFileSync(p, "utf8")}\n{{sf:nope}}\n`);
		await expect(buildArtifacts({ outDir: tmp(), schemaDir })).rejects.toThrow(/nope/);
	});

	it("stays within the 200 KB size budget", async () => {
		const out = tmp();
		await buildArtifacts({ outDir: out });
		expect(readFileSync(join(out, "artifact-index.json")).length).toBeLessThanOrEqual(200 * 1024);
	});
});
