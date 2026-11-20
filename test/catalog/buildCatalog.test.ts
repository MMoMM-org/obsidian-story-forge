/**
 * buildCatalog.test.ts — T4.2 build-catalog.mjs core validation.
 *
 * Tests the importable buildCatalog() core function from scripts/build-catalog.mjs.
 * No Obsidian runtime required; no network; reads from disk only.
 *
 * Coverage:
 *   (a) Checksums: each emitted index entry's checksum === computeChecksum(source)
 *       BYTE-FOR-BYTE (ADR-4 byte-exact).
 *   (b) Validation gate: a malformed .base (invalid vs BasesConfigFile) causes the
 *       build core to throw / reject.
 *   (c) All entries validate against BasesConfigFile (validateBasesConfig passes
 *       for every entry's source when re-parsed).
 *   (d) No network calls (jsdom environment, no fetch interception needed — purely
 *       synchronous disk reads + crypto).
 *
 * @ref PRD/AC-F4.1
 * @ref SDD/ADR-9 (checksummed index, build-time validation gate)
 * @ref SDD/ADR-4  (byte-exact SHA-256; CRLF ≠ LF)
 */

import { describe, it, expect, vi } from "vitest";
import { writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { computeChecksum } from "consent/checksum";
import { validateBasesConfig } from "bases/basesConfig";
import { parse as parseYaml } from "yaml";

// ---------------------------------------------------------------------------
// Import the build core under test.
// The module does not exist yet (RED phase) — this import will fail until
// scripts/build-catalog.mjs is implemented (GREEN phase).
// ---------------------------------------------------------------------------

// Dynamic import so vitest can collect this file even if the module is absent
// (only the actual test bodies will throw). We use a top-level await at the
// describe scope so the error surfaces at test execution, not collection time.

let buildCatalog: (opts: { catalogDir: string; outDir: string }) => Promise<CatalogIndex>;

interface CatalogEntry {
	id: string;
	name: string;
	engine: "bases";
	source: string;
	checksum: string;
	description?: string;
}

interface CatalogIndex {
	version: string;
	entries: CatalogEntry[];
}

// We load the build module dynamically so a missing module produces an error
// only when a test runs, not at collection time. This keeps vitest able to
// collect and report (RED: all tests fail; GREEN: all tests pass).
async function loadBuildModule(): Promise<void> {
	const mod = await import("../../scripts/build-catalog.mjs");
	// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
	buildCatalog = mod.buildCatalog as typeof buildCatalog;
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const REPO_ROOT = resolve(__dirname, "../..");
// catalog/ no longer ships .base files (moved to the test vault as an
// alternate Bases view, see docs/XDD/specs/008-codex-surface); Suite A below
// exercises buildCatalog() against real-world .base sources by pointing at
// the test vault's Bases folder instead.
const TEST_VAULT_BASES_DIR = join(REPO_ROOT, "test/StoryForge/00 Meta/Bases");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a temporary directory for outDir; clean up after each suite. */
function makeTempDir(suffix: string): string {
	const dir = join(tmpdir(), `sf-catalog-test-${suffix}-${Date.now()}`);
	mkdirSync(dir, { recursive: true });
	return dir;
}

// ---------------------------------------------------------------------------
// Suite A — real-world .base sources: checksum fidelity
//
// catalog/ no longer ships .base files (see docs/XDD/specs/008-codex-surface,
// Phase 3); this suite instead reads the real .base files retained in the
// test vault (test/StoryForge/00 Meta/Bases/) to exercise buildCatalog()
// against real-world, non-synthetic sources.
// ---------------------------------------------------------------------------

describe("buildCatalog — real-world .base sources: checksums are byte-exact", () => {
	it("loads the build module (module must exist for GREEN)", async () => {
		await loadBuildModule();
		expect(buildCatalog, "buildCatalog export must be a function").toBeTypeOf("function");
	});

	it("returns a CatalogIndex with a version field and a non-empty entries array", async () => {
		await loadBuildModule();
		const outDir = makeTempDir("shape");
		try {
			const index = await buildCatalog({ catalogDir: TEST_VAULT_BASES_DIR, outDir });
			expect(index).toHaveProperty("version");
			expect(typeof index.version).toBe("string");
			expect(index).toHaveProperty("entries");
			expect(Array.isArray(index.entries)).toBe(true);
			expect(index.entries.length).toBeGreaterThan(0);
		} finally {
			rmSync(outDir, { recursive: true, force: true });
		}
	});

	it("emits one entry per *.base file in the source dir (count derived from disk)", async () => {
		await loadBuildModule();
		const outDir = makeTempDir("count");
		try {
			const expectedCount = readdirSync(TEST_VAULT_BASES_DIR).filter((f) => f.endsWith(".base")).length;
			const index = await buildCatalog({ catalogDir: TEST_VAULT_BASES_DIR, outDir });
			expect(index.entries).toHaveLength(expectedCount);
		} finally {
			rmSync(outDir, { recursive: true, force: true });
		}
	});

	it("each entry's checksum equals computeChecksum(entry.source) byte-for-byte", async () => {
		await loadBuildModule();
		const outDir = makeTempDir("checksum");
		try {
			const index = await buildCatalog({ catalogDir: TEST_VAULT_BASES_DIR, outDir });
			for (const entry of index.entries) {
				// entry.source is the raw .base file content (YAML string, byte-exact).
				const expected = await computeChecksum(entry.source);
				expect(
					entry.checksum,
					`Checksum mismatch for entry id=${entry.id}`,
				).toBe(expected);
			}
		} finally {
			rmSync(outDir, { recursive: true, force: true });
		}
	});

	it("each entry's source re-parses and passes validateBasesConfig", async () => {
		await loadBuildModule();
		const outDir = makeTempDir("validate");
		try {
			const index = await buildCatalog({ catalogDir: TEST_VAULT_BASES_DIR, outDir });
			for (const entry of index.entries) {
				const parsed = parseYaml(entry.source);
				const result = validateBasesConfig(parsed);
				const errMsg = result.ok ? "" : (result as { ok: false; error: string }).error;
				expect(result.ok, `Entry id=${entry.id}: ${errMsg}`).toBe(true);
			}
		} finally {
			rmSync(outDir, { recursive: true, force: true });
		}
	});

	it("each entry carries at minimum: id, name, engine, source, checksum", async () => {
		await loadBuildModule();
		const outDir = makeTempDir("fields");
		try {
			const index = await buildCatalog({ catalogDir: TEST_VAULT_BASES_DIR, outDir });
			for (const entry of index.entries) {
				expect(entry).toHaveProperty("id");
				expect(typeof entry.id).toBe("string");
				expect(entry.id.length).toBeGreaterThan(0);

				expect(entry).toHaveProperty("name");
				expect(typeof entry.name).toBe("string");

				expect(entry).toHaveProperty("engine");
				expect(entry.engine).toBe("bases");

				expect(entry).toHaveProperty("source");
				expect(typeof entry.source).toBe("string");
				expect(entry.source.length).toBeGreaterThan(0);

				expect(entry).toHaveProperty("checksum");
				expect(entry.checksum).toMatch(/^sha256:[0-9a-f]{64}$/);
			}
		} finally {
			rmSync(outDir, { recursive: true, force: true });
		}
	});

	it("writes dist/catalog-index.json to the outDir", async () => {
		await loadBuildModule();
		const outDir = makeTempDir("output");
		try {
			await buildCatalog({ catalogDir: TEST_VAULT_BASES_DIR, outDir });
			const indexPath = join(outDir, "catalog-index.json");
			expect(existsSync(indexPath), `Expected ${indexPath} to exist`).toBe(true);
		} finally {
			rmSync(outDir, { recursive: true, force: true });
		}
	});

	it("the written catalog-index.json parses to the same index returned by buildCatalog", async () => {
		await loadBuildModule();
		const outDir = makeTempDir("consistency");
		try {
			const index = await buildCatalog({ catalogDir: TEST_VAULT_BASES_DIR, outDir });
			const { readFileSync } = await import("node:fs");
			const indexPath = join(outDir, "catalog-index.json");
			const written = JSON.parse(readFileSync(indexPath, "utf8")) as CatalogIndex;
			// Round-trip: entries length and checksums must match.
			expect(written.entries.length).toBe(index.entries.length);
			for (let i = 0; i < index.entries.length; i++) {
				expect(written.entries[i]!.checksum).toBe(index.entries[i]!.checksum);
			}
		} finally {
			rmSync(outDir, { recursive: true, force: true });
		}
	});

	// #53: the index is bundled into main.js, so anything that varies per build
	// run (a timestamp) makes the release asset differ from a rebuild of the
	// tagged source, and the community hub's build verification fails.
	it("is byte-identical when the same source is built at two different times", async () => {
		await loadBuildModule();
		const { readFileSync } = await import("node:fs");
		const first = makeTempDir("repro-a");
		const second = makeTempDir("repro-b");
		vi.useFakeTimers({ toFake: ["Date"] });
		try {
			vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
			await buildCatalog({ catalogDir: TEST_VAULT_BASES_DIR, outDir: first });
			vi.setSystemTime(new Date("2026-06-15T12:34:56.789Z"));
			await buildCatalog({ catalogDir: TEST_VAULT_BASES_DIR, outDir: second });
			const a = readFileSync(join(first, "catalog-index.json"), "utf8");
			const b = readFileSync(join(second, "catalog-index.json"), "utf8");
			expect(b).toBe(a);
		} finally {
			vi.useRealTimers();
			rmSync(first, { recursive: true, force: true });
			rmSync(second, { recursive: true, force: true });
		}
	});
});

// ---------------------------------------------------------------------------
// Suite B — malformed .base: build must FAIL
// ---------------------------------------------------------------------------

describe("buildCatalog — malformed .base: build must reject", () => {
	it("throws when catalogDir contains a .base file with invalid BasesConfigFile YAML (missing views/filters/formulas)", async () => {
		await loadBuildModule();

		// Create an isolated catalog dir with one valid and one malformed .base.
		const tmpCatalog = makeTempDir("malformed-catalog");
		const outDir = makeTempDir("malformed-out");
		try {
			// Valid entry (to confirm the failure is from the malformed one).
			writeFileSync(
				join(tmpCatalog, "valid.base"),
				"filters: file.hasTag(\"test\")\nviews:\n  - type: table\n    name: Test\n",
				"utf8",
			);
			// Malformed: no views, no filters, no formulas key at all — passes
			// YAML parse but fails validateBasesConfig.
			writeFileSync(
				join(tmpCatalog, "malformed.base"),
				"completely_unknown_key: true\nanother_key: 42\n",
				"utf8",
			);

			await expect(
				buildCatalog({ catalogDir: tmpCatalog, outDir }),
			).rejects.toThrow();
		} finally {
			rmSync(tmpCatalog, { recursive: true, force: true });
			rmSync(outDir, { recursive: true, force: true });
		}
	});

	it("throws when a .base file contains invalid YAML (syntax error)", async () => {
		await loadBuildModule();

		const tmpCatalog = makeTempDir("invalid-yaml-catalog");
		const outDir = makeTempDir("invalid-yaml-out");
		try {
			writeFileSync(
				join(tmpCatalog, "broken.base"),
				"filters: [\nunclosed bracket and invalid yaml: {\n",
				"utf8",
			);

			await expect(
				buildCatalog({ catalogDir: tmpCatalog, outDir }),
			).rejects.toThrow();
		} finally {
			rmSync(tmpCatalog, { recursive: true, force: true });
			rmSync(outDir, { recursive: true, force: true });
		}
	});
});

// ---------------------------------------------------------------------------
// Suite C — empty catalog dir: graceful behaviour
// ---------------------------------------------------------------------------

describe("buildCatalog — empty catalog dir", () => {
	it("returns an index with zero entries when no .base files are present", async () => {
		await loadBuildModule();

		const tmpCatalog = makeTempDir("empty-catalog");
		const outDir = makeTempDir("empty-out");
		try {
			const index = await buildCatalog({ catalogDir: tmpCatalog, outDir });
			expect(index.entries).toHaveLength(0);
		} finally {
			rmSync(tmpCatalog, { recursive: true, force: true });
			rmSync(outDir, { recursive: true, force: true });
		}
	});
});
