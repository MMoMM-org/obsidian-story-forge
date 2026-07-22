#!/usr/bin/env node
/**
 * build-catalog.mjs — T4.2 checksummed bundled catalog index.
 *
 * Scans catalog/ for *.base files, validates each against BasesConfigFile via
 * validateBasesConfig, computes a SHA-256 checksum over the raw source bytes
 * via computeChecksum, and emits a versioned dist/catalog-index.json.
 *
 * The CORE function (buildCatalog) is exported so tests can import and invoke
 * it directly without spawning a subprocess. The CLI wrapper at the bottom
 * calls buildCatalog() and exits non-zero on any failure.
 *
 * Design decisions (ADR-9, T4.2 notes):
 *   - Index shape: { version: "1", generated: <ISO>, entries: [...] }
 *     "version" is the index schema version (not a semver); start at "1".
 *   - Entry shape aligns with ViewRecord / ViewDefinition field names so T4.4
 *     (CatalogService) has no impedance mismatch:
 *       { id, name, engine: "bases", source, checksum, description? }
 *     - id:          slug derived from the filename (e.g. "overview-characters")
 *     - name:        first view's `name` field from the parsed YAML, or id fallback
 *     - engine:      always "bases" — all catalog entries are Bases .base files
 *     - source:      raw .base YAML string (byte-exact; checksum is over this)
 *     - checksum:    "sha256:<hex>" via computeChecksum(source)
 *     - description: not present in the five overview .base files; omitted
 *   - dist/ is gitignored (added by this task); catalog-index.json is a build
 *     artifact uploaded with releases, not committed to git (mirrors main.js).
 *   - computeChecksum and validateBasesConfig are imported via jiti (already a
 *     devDependency) which provides on-the-fly TypeScript compilation; no
 *     duplication of logic.
 *
 * @ref PRD/AC-F4.1
 * @ref SDD/ADR-9
 * @ref SDD/ADR-4 (byte-exact SHA-256)
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Bootstrap jiti to import TypeScript source files at build time.
// jiti is pinned to 2.x in devDependencies — import directly, no CJS fallback.
// ---------------------------------------------------------------------------

// jiti 2.x exports a default factory function via ESM.
const jitiMod = await import('jiti');
const jiti = jitiMod.default ?? jitiMod.createJiti;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');

// Create a jiti runner anchored to the repo root.
const jitiRunner = jiti(ROOT, {
  // Disable ESM interop warnings; we just want TS → CJS for the two helpers.
  interopDefault: true,
});

// Import the two TypeScript helpers via jiti using absolute paths.
// tsconfig baseUrl is "src", so bare imports like "consent/checksum" work in TS
// but not in Node. We resolve to absolute paths here instead.
const { computeChecksum } = jitiRunner(join(SRC, 'consent/checksum.ts'));
const { validateBasesConfig } = jitiRunner(join(SRC, 'bases/basesConfig.ts'));

// ---------------------------------------------------------------------------
// parse YAML using the same 'yaml' package used by the rest of the codebase.
// ---------------------------------------------------------------------------
const { parse: parseYaml } = await import('yaml');

// ---------------------------------------------------------------------------
// buildCatalog — importable core function
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} CatalogEntry
 * @property {string} id
 * @property {string} name
 * @property {"bases"} engine
 * @property {string} source
 * @property {string} checksum
 * @property {string} [description]
 */

/**
 * @typedef {Object} CatalogIndex
 * @property {string} version
 * @property {string} generated
 * @property {CatalogEntry[]} entries
 */

/**
 * Build the catalog index from *.base files in catalogDir, writing the result
 * to <outDir>/catalog-index.json.
 *
 * @param {{ catalogDir: string, outDir: string }} opts
 * @returns {Promise<CatalogIndex>}
 *
 * Throws if any .base file fails YAML parsing or BasesConfigFile validation.
 */
export async function buildCatalog({ catalogDir, outDir }) {
  // Collect *.base files, sorted for deterministic output.
  const files = existsSync(catalogDir)
    ? readdirSync(catalogDir)
        .filter((f) => f.endsWith('.base'))
        .sort()
    : [];

  /** @type {CatalogEntry[]} */
  const entries = [];

  for (const file of files) {
    const filePath = join(catalogDir, file);
    const source = readFileSync(filePath, 'utf8');

    // 1. Parse YAML — throws on invalid YAML (syntax error).
    let parsed;
    try {
      parsed = parseYaml(source);
    } catch (err) {
      throw new Error(`build-catalog: YAML parse error in ${file}: ${err.message}`);
    }

    // 2. Validate against BasesConfigFile — throws on invalid shape.
    const result = validateBasesConfig(parsed);
    if (!result.ok) {
      throw new Error(`build-catalog: invalid BasesConfigFile in ${file}: ${result.error}`);
    }

    // 3. Compute checksum over raw source bytes (byte-exact, ADR-4).
    const checksum = await computeChecksum(source);

    // 4. Derive id from filename (strip .base extension).
    const id = basename(file, '.base');

    // 5. Derive display name from the first view's name field, or fall back to id.
    const config = result.config;
    let name = id;
    if (
      Array.isArray(config.views) &&
      config.views.length > 0 &&
      config.views[0] !== null &&
      typeof config.views[0] === 'object' &&
      'name' in config.views[0] &&
      typeof config.views[0].name === 'string' &&
      config.views[0].name.length > 0
    ) {
      name = config.views[0].name;
    }

    /** @type {CatalogEntry} */
    const entry = {
      id,
      name,
      engine: 'bases',
      source,
      checksum,
    };

    entries.push(entry);
  }

  /** @type {CatalogIndex} */
  const index = {
    version: '1',
    generated: new Date().toISOString(),
    entries,
  };

  // Write to outDir/catalog-index.json.
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }
  writeFileSync(join(outDir, 'catalog-index.json'), JSON.stringify(index, null, 2) + '\n', 'utf8');

  return index;
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

// Only run when invoked directly (not imported by tests).
const isMain =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  const args = process.argv.slice(2);
  // Guard: indexOf returns -1 when flag is absent; -1+1=0 would pick up a
  // sibling argument. Use undefined (→ default) when the flag is missing.
  const catalogIdx = args.indexOf('--catalog');
  const catalogArg = catalogIdx !== -1 ? args[catalogIdx + 1] : undefined;
  const outIdx = args.indexOf('--out');
  const outArg = outIdx !== -1 ? args[outIdx + 1] : undefined;

  const catalogDir = catalogArg ?? join(ROOT, 'catalog');
  const outDir = outArg ?? join(ROOT, 'dist');

  console.log(`build-catalog → scanning ${catalogDir}`);

  buildCatalog({ catalogDir, outDir })
    .then((index) => {
      console.log(`build-catalog → dist/catalog-index.json`);
      console.log(`  version:  ${index.version}`);
      console.log(`  entries:  ${index.entries.length}`);
      for (const e of index.entries) {
        console.log(`  ✓ ${e.id}  ${e.checksum.slice(0, 16)}…`);
      }
    })
    .catch((err) => {
      console.error(`build-catalog FAILED: ${err.message}`);
      process.exit(1);
    });
}
