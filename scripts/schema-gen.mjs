#!/usr/bin/env node
// schema-gen — derive the vault schema artifacts from the canonical schema/*.json.
//
// One canonical JSON per entity type (schema/<type>.json) is the single source of
// truth. This script generates, into the test vault (00 Meta/), the artifacts
// schema-check.mjs validates (rendered by schema-artifacts.mjs, resolved with defaults):
//   - Template   00 Meta/Templates/<scene.md | entity-<type>.md>   (frontmatter + schema/templates/ body)
//   - FileClass  00 Meta/FileClasses/fc-<type>.md                  (metadata-menu schema)
//                00 Meta/FileClasses/fc-<list>.md                  (empty value-list notes)
//   - Reference  00 Meta/Schema/<type>.md, Schema/README.md        (human property doc + index)
//
// Field `type` in the JSON is the only abstraction; it maps to metadata-menu type,
// template default, and the doc note. `id:` is generated deterministically (internal).
//
// Usage: node scripts/schema-gen.mjs [--vault <path>] [--no-ui-hints] [--schema <dir>]   (default test/StoryForge)

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveNativeTypes, diffTypes } from './schema-types-json.mjs';
import { collectUiHints, renderUiHintsModule, UI_HINT_FILE } from './schema-ui-hints.mjs';
import { readInfra, injectEnums, schemaLookups } from './schema-infra.mjs';
import { loadSchemas, renderArtifacts } from './schema-artifacts.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const vIdx = args.indexOf('--vault');
const VAULT = vIdx !== -1 ? args[vIdx + 1] : 'test/StoryForge';
const NO_UI_HINTS = args.includes('--no-ui-hints'); // skip the tracked src/ module (tests)
const FORCE = args.includes('--force'); // also overwrite conflicting types.json keys

const sIdx = args.indexOf('--schema');
const SCHEMA_DIR = sIdx !== -1 ? resolve(args[sIdx + 1]) : join(ROOT, 'schema');
const META = join(resolve(ROOT, VAULT), '00 Meta');
const OUT = {
  templates: join(META, 'Templates'),
  fileclasses: join(META, 'FileClasses'),
  docs: join(META, 'Schema'),
};

// The shipped artifacts (FileClasses, Templates, Schema reference + index) are
// rendered unresolved by schema-artifacts.mjs; the dev vault gets the same sources
// resolved with the default folders (ADR-38), through the plugin's own resolver.
const jitiMod = await import('jiti');
const jiti = (jitiMod.default ?? jitiMod.createJiti)(ROOT, { interopDefault: true });
const { resolvePlaceholders } = jiti(join(ROOT, 'src/artifacts/resolvePlaceholders.ts'));
const { DEFAULT_ARTIFACT_FOLDERS } = jiti(join(ROOT, 'src/artifacts/artifactTypes.ts'));

const SET = {
  fileclasses: { dir: OUT.fileclasses, label: 'FileClasses' },
  templates: { dir: OUT.templates, label: 'Templates' },
  schema: { dir: OUT.docs, label: 'Schema' },
};

// ── run ─────────────────────────────────────────────────────────────────────
function ensure(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

const loaded = loadSchemas(SCHEMA_DIR);
if (!loaded.length) {
  console.error(`No schema/*.json found in ${SCHEMA_DIR}`);
  process.exit(1);
}
const files = loaded.map((e) => e.file);
Object.values(OUT).forEach(ensure);

const written = [];
const allSchemas = loaded.map((e) => e.schema);
for (const { set, relPath, source } of renderArtifacts(SCHEMA_DIR)) {
  writeFileSync(join(SET[set].dir, relPath), resolvePlaceholders(source, DEFAULT_ARTIFACT_FOLDERS));
  written.push(`${SET[set].label}/${relPath}`);
}

// Q6a — raw machine-readable schema JSON in the vault (dev-only, not shipped). This
// is the runtime enum source-of-truth the QuickAdd status scripts read
// (`Schema/<type>.json → fields[name=status].values`); byte-identical to schema/*.json.
for (const { schema: s, rawText } of loaded) {
  writeFileSync(join(OUT.docs, `${s.entity}.json`), rawText);
  written.push(`Schema/${s.entity}.json`);
}

// ── ui hints — the editor's `wide` hints, for the bundled plugin (never a FileClass) ──
if (!NO_UI_HINTS) {
  writeFileSync(join(ROOT, UI_HINT_FILE), renderUiHintsModule(collectUiHints(allSchemas)));
  written.push(`(src) ${UI_HINT_FILE}`);
}

// ── Action 3 — deploy the schema-coupled vault infra (Scripts/Bases/dataview-views)
// from infra/ into 00 Meta/, injecting schema-derived enum fallbacks. These land under
// 00 Meta/ which IS tracked, so (unlike types.json) they are committed artifacts.
const INFRA_SRC = join(ROOT, 'infra');
if (existsSync(INFRA_SRC)) {
  const { byType } = schemaLookups(allSchemas);
  for (const { rel, content } of readInfra(INFRA_SRC)) {
    const dest = join(META, rel);
    ensure(dirname(dest));
    writeFileSync(dest, injectEnums(content, byType));
    written.push(rel.split(/[\\/]/).join('/'));
  }
}

console.log(`schema-gen → ${VAULT}/00 Meta/\n`);
console.log(written.map((w) => `  ✓ ${w}`).join('\n'));
console.log(`\n${files.length} schema file(s) → ${written.length} artifact(s).`);

// ── Action 2 — merge the schema-derived widget types into the vault's types.json ──
// Local-only: .obsidian/ is gitignored, so this maintains the live test-vault
// registry (correct editor widgets for live testing) but is not a tracked artifact.
// Merge, never overwrite: existing keys survive (Breadcrumbs BC-*, Tasks, relations,
// the reserved aliases/tags/cssclasses); only safe new keys are added; a differing
// existing key is a CONFLICT — reported and KEPT unless --force. No key is removed.
const OBSIDIAN = join(resolve(ROOT, VAULT), '.obsidian');
const TYPES_JSON = join(OBSIDIAN, 'types.json');
if (existsSync(OBSIDIAN)) {
  const { derived, clashes } = deriveNativeTypes(allSchemas);
  for (const c of clashes) console.error(`  ! cross-schema type clash — ${c}`);
  const raw = existsSync(TYPES_JSON)
    ? JSON.parse(readFileSync(TYPES_JSON, 'utf8'))
    : { types: {} };
  if (!raw.types || typeof raw.types !== 'object') {
    console.error(`  ! malformed types.json (missing 'types' object): ${TYPES_JSON}`);
  } else {
    const { added, conflicts, unchanged } = diffTypes(derived, raw.types);
    for (const [name, native] of added) raw.types[name] = native; // safe adds
    if (FORCE) for (const [name, , native] of conflicts) raw.types[name] = native;
    if (added.length || (FORCE && conflicts.length)) {
      writeFileSync(TYPES_JSON, JSON.stringify(raw, null, 2) + '\n');
    }
    console.log(
      `\ntypes.json (${VAULT}/.obsidian): ${Object.keys(derived).length} schema props` +
        ` | +${added.length} added | ${conflicts.length} conflict(s)` +
        `${FORCE ? ' forced' : ' kept'} | ${unchanged} unchanged`,
    );
    for (const [name, native] of added) console.log(`  + ${name}: ${native}`);
    for (const [name, old, native] of conflicts) {
      console.log(
        `  ~ CONFLICT ${name}: types.json=${old} schema=${native}` +
          `${FORCE ? ' → OVERWRITTEN' : ' → KEPT (schema:check flags it; rerun with -- --force to align)'}`,
      );
    }
  }
} else {
  console.log(`\ntypes.json skipped — no .obsidian in ${VAULT} (local-only artifact)`);
}
