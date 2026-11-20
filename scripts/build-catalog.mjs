#!/usr/bin/env node
/**
 * build-catalog.mjs — T4.2 checksummed bundled catalog index.
 *
 * Scans catalog/ for *.base files and curated Dataview *.md notes (T7.2),
 * validates each (a .base against BasesConfigFile via validateBasesConfig; a
 * note by the importer's own rules), computes a SHA-256 checksum over the raw
 * source bytes via computeChecksum, and emits a versioned dist/catalog-index.json.
 *
 * The CORE function (buildCatalog) is exported so tests can import and invoke
 * it directly without spawning a subprocess. The CLI wrapper at the bottom
 * calls buildCatalog() and exits non-zero on any failure.
 *
 * Design decisions (ADR-9, T4.2 notes):
 *   - Index shape: { version: "1", entries: [...] } — no build timestamp, so the
 *     same source always bundles to the same main.js (#53)
 *     "version" is the index schema version (not a semver); start at "1".
 *   - Entry shape aligns with ViewRecord / ViewDefinition field names so T4.4
 *     (CatalogService) has no impedance mismatch:
 *       { id, name, engine: "bases", source, checksum, description? }
 *       { id, name, engine: "dataview-dql" | "dataviewjs", source, checksum,
 *         description?, version, queryChecksum }      (T7.2, a curated note)
 *     - id:          slug derived from the filename (e.g. "overview-characters")
 *     - name:        first view's `name` field from the parsed YAML, or id fallback
 *     - engine:      "bases" for a .base; for a note, inferred from its block (T7.2)
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

// Import the TypeScript helpers via jiti using absolute paths.
// tsconfig baseUrl is "src", so bare imports like "consent/checksum" work in TS
// but not in Node. We resolve to absolute paths here instead.
const { computeChecksum } = jitiRunner(join(SRC, 'consent/checksum.ts'));
const { validateBasesConfig } = jitiRunner(join(SRC, 'bases/basesConfig.ts'));
// The same block parser the importer uses (no `obsidian` import, so it loads in Node).
const { extractQueryBlocks } = jitiRunner(join(SRC, 'import/queryBlocks.ts'));

// ---------------------------------------------------------------------------
// parse YAML using the same 'yaml' package used by the rest of the codebase.
// ---------------------------------------------------------------------------
const { parse: parseYaml } = await import('yaml');

// ---------------------------------------------------------------------------
// Entry builders — one per engine family. Each throws, naming the file, on
// anything the plugin could not install.
// ---------------------------------------------------------------------------

/** A curated .base: YAML that parses and passes validateBasesConfig (CON-6). */
async function basesEntry(file, source) {
  let parsed;
  try {
    parsed = parseYaml(source);
  } catch (err) {
    throw new Error(`build-catalog: YAML parse error in ${file}: ${err.message}`);
  }
  const result = validateBasesConfig(parsed);
  if (!result.ok) {
    throw new Error(`build-catalog: invalid BasesConfigFile in ${file}: ${result.error}`);
  }
  const id = basename(file, '.base');
  return { id, name: firstViewName(result.config) ?? id, engine: 'bases', source, checksum: await computeChecksum(source) };
}

/** The first view's non-empty `name`, if any. */
function firstViewName(config) {
  const first = Array.isArray(config.views) ? config.views[0] : undefined;
  return first !== null && typeof first === 'object' && typeof first.name === 'string' && first.name.length > 0
    ? first.name
    : undefined;
}

/**
 * A curated Dataview note (T7.2), held to the import's own rules (ViewImporter.parse):
 * frontmatter with an integer sf-version, exactly one dataview/dataviewjs block, and an
 * sf-engine (when given) that agrees with the block's language.
 */
async function dataviewEntry(file, source) {
  const fail = (why) => new Error(`build-catalog: invalid Dataview note ${file}: ${why}`);
  const fm = readFrontmatter(source, fail);
  if (!Number.isInteger(fm['sf-version'])) throw fail('sf-version must be an integer');
  const blocks = extractQueryBlocks(source);
  if (blocks.length !== 1) throw fail('a collection must contain exactly one query block');
  const engine = blocks[0].lang === 'dataviewjs' ? 'dataviewjs' : 'dataview-dql';
  if (typeof fm['sf-engine'] === 'string' && fm['sf-engine'] !== engine) {
    throw fail(`sf-engine "${fm['sf-engine']}" contradicts the ${blocks[0].lang} block`);
  }
  const id = basename(file, '.md');
  const name = typeof fm['sf-name'] === 'string' && fm['sf-name'].trim() !== '' ? fm['sf-name'] : id;
  return {
    id,
    name,
    engine,
    source,
    checksum: await computeChecksum(source),
    ...(typeof fm['sf-description'] === 'string' ? { description: fm['sf-description'] } : {}),
    version: fm['sf-version'],
    queryChecksum: await computeChecksum(blocks[0].body),
  };
}

/** The note's YAML frontmatter as an object; throws via `fail` when absent or unreadable. */
function readFrontmatter(source, fail) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?(\n|$)/.exec(source);
  if (!match) throw fail('no frontmatter (sf-version and sf-name live there)');
  let fm;
  try {
    fm = parseYaml(match[1]);
  } catch (err) {
    throw fail(`frontmatter YAML: ${err.message}`);
  }
  if (fm === null || typeof fm !== 'object' || Array.isArray(fm)) throw fail('frontmatter is not a mapping');
  return fm;
}

// ---------------------------------------------------------------------------
// buildCatalog — importable core function
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} CatalogEntry
 * @property {string} id
 * @property {string} name
 * @property {"bases" | "dataview-dql" | "dataviewjs"} engine
 * @property {string} source
 * @property {string} checksum
 * @property {string} [description]
 * @property {number} [version]        Dataview notes only: sf-version
 * @property {string} [queryChecksum]  Dataview notes only: checksum of the block body
 */

/**
 * @typedef {Object} CatalogIndex
 * @property {string} version
 * @property {CatalogEntry[]} entries
 */

/**
 * Build the catalog index from *.base files and *.md notes in catalogDir, writing the result
 * to <outDir>/catalog-index.json.
 *
 * @param {{ catalogDir: string, outDir: string }} opts
 * @returns {Promise<CatalogIndex>}
 *
 * Throws if any .base file fails YAML parsing or BasesConfigFile validation, or
 * any note is not a valid curated Dataview view.
 */
export async function buildCatalog({ catalogDir, outDir }) {
  // Collect *.base files and curated *.md notes, sorted for deterministic output.
  const files = existsSync(catalogDir)
    ? readdirSync(catalogDir)
        .filter((f) => f.endsWith('.base') || f.endsWith('.md'))
        .sort()
    : [];

  /** @type {CatalogEntry[]} */
  const entries = [];

  for (const file of files) {
    const source = readFileSync(join(catalogDir, file), 'utf8');
    const entry = file.endsWith('.base')
      ? await basesEntry(file, source)
      : await dataviewEntry(file, source);
    entries.push(entry);
  }

  /** @type {CatalogIndex} */
  const index = {
    version: '1',
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
