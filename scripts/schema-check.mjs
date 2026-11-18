#!/usr/bin/env node
// schema-check — verify the human property reference stays in sync with the
// machine schema (metadata-menu FileClasses + entity/scene templates).
//
// The machine schema is the source of truth. Every schema/<type>.json is a type:
//   - with a template → the template frontmatter (cross-checked vs its FileClass)
//   - `hasTemplate: false` → the FileClass fields
//
// The human reference (00 Meta/Schema/<type>.md) must document EXACTLY those
// properties, one `### \`prop\`` subsection each. Drift → non-zero exit.
//
// Shipped artifacts (spec 010, ADR-39): the dev vault's FileClasses / Templates / Schema
// notes must equal the rendered artifacts resolved with the default folders, byte for byte;
// dist/artifact-index.json (when present) must equal a fresh build; and no shipped source
// may carry dev-vault-only text (BANNED).
//
// Usage: node scripts/schema-check.mjs [--vault <path>] [--schema <dir>] [--dist <dir>]
//   (defaults test/StoryForge, schema, dist)

import { readFileSync, existsSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { renderArtifacts } from './schema-artifacts.mjs';
import { buildArtifacts } from './build-artifacts.mjs';
import { deriveNativeTypes, diffTypes } from './schema-types-json.mjs';
import { collectUiHints, renderUiHintsModule, UI_HINT_FILE } from './schema-ui-hints.mjs';
import { readInfra, injectEnums, baseRefErrors, schemaLookups } from './schema-infra.mjs';

const args = process.argv.slice(2);
const vaultIdx = args.indexOf('--vault');
const VAULT = vaultIdx !== -1 ? args[vaultIdx + 1] : 'test/StoryForge';

const META = join(VAULT, '00 Meta');
const TEMPLATES = join(META, 'Templates');
const FILECLASSES = join(META, 'FileClasses');
const SCHEMA = join(META, 'Schema');

// Canonical schemas, read off disk: adding schema/<type>.json adds a type to the gate.
const schemaIdx = args.indexOf('--schema');
const SCHEMA_DIR = schemaIdx !== -1 ? args[schemaIdx + 1] : 'schema';
const distIdx = args.indexOf('--dist');
const DIST_DIR = distIdx !== -1 ? args[distIdx + 1] : 'dist';
const schemas = readdirSync(SCHEMA_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(SCHEMA_DIR, f), 'utf8')))
  .sort((a, b) => a.entity.localeCompare(b.entity));

// type → sources. `template` = author-facing frontmatter (absent when the schema
// says `hasTemplate: false`); `fileclass` = enforced metadata-menu schema;
// `doc` = the human reference note. Names follow schema-gen's conventions.
const templateName = (s) => s.template ?? (s.entity === 'scene' ? 'scene.md' : `entity-${s.entity}.md`);
const TYPES = schemas.map((s) => ({
  type: s.entity,
  ...(s.hasTemplate === false ? {} : { template: templateName(s) }),
  fileclass: `fc-${s.entity}.md`,
  doc: `${s.entity}.md`,
}));

// `tags` classifies the note and is not a metadata-menu field; allow it to be
// present in a template but absent from the FileClass without flagging drift.
const FILECLASS_EXEMPT = new Set(['tags']);

function read(path) {
  if (!existsSync(path)) return null;
  return readFileSync(path, 'utf8');
}

/** Top-level frontmatter keys of a template note (flat frontmatter). */
function templateKeys(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return [];
  const keys = [];
  for (const line of m[1].split('\n')) {
    const k = line.match(/^([A-Za-z_][A-Za-z0-9_]*):/);
    if (k) keys.push(k[1]);
  }
  return keys;
}

/** Field names declared in a metadata-menu FileClass (`- name: x`). */
function fileclassFields(md) {
  return [...md.matchAll(/^\s*-\s*name:\s*(.+?)\s*$/gm)].map((m) => m[1]);
}

/** Properties documented in a reference note (`### \`prop\``). */
function documentedProps(md) {
  return [...md.matchAll(/^###\s+`([^`]+)`/gm)].map((m) => m[1]);
}

const diff = (a, b) => a.filter((x) => !b.includes(x));

let errors = 0;
let warnings = 0;
const log = [];

for (const t of TYPES) {
  const doc = read(join(SCHEMA, t.doc));
  if (doc === null) {
    log.push(`✗ ${t.type}: missing reference note 00 Meta/Schema/${t.doc}`);
    errors++;
    continue;
  }
  const documented = documentedProps(doc);

  // Authoritative property set.
  let authoritative;
  if (t.template) {
    const tpl = read(join(TEMPLATES, t.template));
    if (tpl === null) {
      log.push(`✗ ${t.type}: missing template 00 Meta/Templates/${t.template}`);
      errors++;
      continue;
    }
    authoritative = templateKeys(tpl);
  } else {
    const fc = read(join(FILECLASSES, t.fileclass));
    if (fc === null) {
      log.push(`✗ ${t.type}: missing FileClass 00 Meta/FileClasses/${t.fileclass}`);
      errors++;
      continue;
    }
    authoritative = fileclassFields(fc);
  }

  const missing = diff(authoritative, documented); // in schema, not documented
  const stray = diff(documented, authoritative); // documented, not in schema

  if (missing.length === 0 && stray.length === 0) {
    log.push(`✓ ${t.type}: ${authoritative.length} properties documented`);
  } else {
    if (missing.length) {
      log.push(`✗ ${t.type}: undocumented properties → ${missing.join(', ')}`);
      errors++;
    }
    if (stray.length) {
      log.push(`✗ ${t.type}: documented but not in schema → ${stray.join(', ')}`);
      errors++;
    }
  }

  // Q6a — the vault's machine-readable schema (00 Meta/Schema/<type>.json) must
  // match the canonical schema/<type>.json (deep-equal). It is the runtime enum
  // source-of-truth the QuickAdd status scripts read; drift → run schema:gen.
  const canon = read(join(SCHEMA_DIR, `${t.type}.json`));
  const vaultJson = read(join(SCHEMA, `${t.type}.json`));
  if (canon === null) {
    log.push(`✗ ${t.type}: missing canonical ${SCHEMA_DIR}/${t.type}.json`);
    errors++;
  } else if (vaultJson === null) {
    log.push(`✗ ${t.type}: missing machine schema 00 Meta/Schema/${t.type}.json (run schema:gen)`);
    errors++;
  } else {
    let drift = false;
    try {
      drift = JSON.stringify(JSON.parse(canon)) !== JSON.stringify(JSON.parse(vaultJson));
    } catch (e) {
      log.push(`✗ ${t.type}: invalid JSON in machine schema — ${e.message}`);
      errors++;
    }
    if (drift) {
      log.push(`✗ ${t.type}: 00 Meta/Schema/${t.type}.json drifted from ${SCHEMA_DIR}/${t.type}.json (run schema:gen)`);
      errors++;
    }
  }

  // Cross-check: for character, the FileClass and the template must agree
  // (minus the exempt `tags` classifier).
  if (t.template && t.fileclass) {
    const fc = read(join(FILECLASSES, t.fileclass));
    if (fc) {
      const fields = fileclassFields(fc);
      const tplForFc = authoritative.filter((k) => !FILECLASS_EXEMPT.has(k));
      const fcMissing = diff(tplForFc, fields);
      const fcExtra = diff(fields, authoritative);
      if (fcMissing.length) {
        log.push(`  ⚠ ${t.type}: template keys absent from ${t.fileclass} → ${fcMissing.join(', ')}`);
        warnings++;
      }
      if (fcExtra.length) {
        log.push(`  ⚠ ${t.type}: ${t.fileclass} fields absent from template → ${fcExtra.join(', ')}`);
        warnings++;
      }
    }
  }
}

// ── Action 3 — vault infra deploy + schema-coupling gate. 00 Meta/ is tracked,
// so this runs ALWAYS: the deployed infra must equal the enum-injected source,
// and every .base property/tag/folder reference must exist in the schema.
const INFRA_SRC = 'infra';
if (existsSync(INFRA_SRC)) {
  const { byType, fields, tags } = schemaLookups(schemas);
  let infraOk = 0;
  for (const { rel, content } of readInfra(INFRA_SRC)) {
    const deployed = read(join(META, rel));
    if (deployed === null) {
      log.push(`✗ infra: missing 00 Meta/${rel} (run schema:gen)`);
      errors++;
    } else if (deployed !== injectEnums(content, byType)) {
      log.push(`✗ infra: 00 Meta/${rel} drifted from infra/${rel} (run schema:gen)`);
      errors++;
    } else {
      if (rel.endsWith('.base')) {
        for (const e of baseRefErrors(content, { fields, tags })) {
          log.push(`✗ infra: ${rel} — ${e}`);
          errors++;
        }
      }
      infraOk++;
    }
  }
  if (infraOk) log.push(`✓ infra: ${infraOk} file(s) deployed + schema-coupled`);
}

// ── ui hints — src/editor/generatedUiHints.ts must equal a fresh render ──────
try {
  const want = renderUiHintsModule(collectUiHints(schemas));
  const have = existsSync(UI_HINT_FILE) ? readFileSync(UI_HINT_FILE, 'utf8') : null;
  if (have === want) {
    log.push(`✓ ui hints: ${UI_HINT_FILE} in sync`);
  } else {
    log.push(`✗ ui hints: ${UI_HINT_FILE} ${have === null ? 'missing' : 'differs from schema'} (run schema:gen)`);
    errors++;
  }
} catch (e) {
  log.push(`✗ ui hints: ${e.message}`);
  errors++;
}

// ── Action 2 — types.json drift gate (present-only; local dev-vault artifact) ──
// .obsidian/ is gitignored, so types.json may be absent in a fresh clone / CI —
// then SKIP (it is a local convenience for live testing). When present, it must
// carry every schema-derived widget type; run `npm run schema:gen` to sync.
const TYPES_JSON = join(VAULT, '.obsidian', 'types.json');
if (!existsSync(TYPES_JSON)) {
  log.push(`• types.json: not present in ${VAULT}/.obsidian — skipped (local-only artifact)`);
} else {
  const { derived, clashes } = deriveNativeTypes(schemas);
  for (const c of clashes) {
    log.push(`✗ types.json: cross-schema type clash — ${c}`);
    errors++;
  }
  let types = null;
  try {
    const raw = JSON.parse(readFileSync(TYPES_JSON, 'utf8'));
    types = raw && typeof raw.types === 'object' ? raw.types : null;
    if (!types) {
      log.push(`✗ types.json: malformed — missing 'types' object`);
      errors++;
    }
  } catch (e) {
    log.push(`✗ types.json: invalid JSON — ${e.message}`);
    errors++;
  }
  if (types) {
    const { added, conflicts } = diffTypes(derived, types);
    if (added.length === 0 && conflicts.length === 0 && clashes.length === 0) {
      log.push(`✓ types.json: ${Object.keys(derived).length} schema widget types in sync`);
    } else {
      for (const [name, native] of added) {
        log.push(`✗ types.json: missing ${name} → ${native} (run schema:gen)`);
        errors++;
      }
      for (const [name, old, native] of conflicts) {
        log.push(`✗ types.json: ${name} is ${old}, schema wants ${native} (run schema:gen -- --force)`);
        errors++;
      }
    }
  }
}

// ── shipped artifacts (ADR-39) ───────────────────────────────────────────────
const jitiMod = await import('jiti');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const jiti = (jitiMod.default ?? jitiMod.createJiti)(ROOT, { interopDefault: true });
const { resolvePlaceholders } = jiti(join(ROOT, 'src/artifacts/resolvePlaceholders.ts'));
const { DEFAULT_ARTIFACT_FOLDERS } = jiti(join(ROOT, 'src/artifacts/artifactTypes.ts'));
const SET_FOLDER = { fileclasses: 'fileClassesFolder', templates: 'templatesFolder', schema: 'schemaFolder' };

// Text that belongs to the dev vault only; a shipped (unresolved) source must not carry it.
const BANNED = ['00 Meta/', '30 Canon', '10 Manuscript', '20 Planning', '95 Assets', '%title%', '%name%', '"Forge"'];

const rendered = renderArtifacts(SCHEMA_DIR);
{
  let ok = 0;
  for (const { set, relPath, source } of rendered) {
    const folder = DEFAULT_ARTIFACT_FOLDERS[SET_FOLDER[set]];
    const label = `${folder}/${relPath}`;
    for (const b of BANNED) {
      if (source.includes(b)) {
        log.push(`✗ artifacts: shipped source ${set}/${relPath} contains banned text ${JSON.stringify(b)}`);
        errors++;
      }
    }
    const have = read(join(VAULT, folder, relPath));
    if (have === null) {
      log.push(`✗ artifacts: missing ${label} (run schema:gen)`);
      errors++;
    } else {
      let resolved = null;
      try {
        resolved = resolvePlaceholders(source, DEFAULT_ARTIFACT_FOLDERS);
      } catch (e) {
        log.push(`✗ artifacts: ${label} cannot be resolved — ${e.message}`);
        errors++;
      }
      if (resolved === null) {
        // already reported
      } else if (have !== resolved) {
        log.push(`✗ artifacts: ${label} differs from the shipped artifact resolved with defaults (run schema:gen)`);
        errors++;
      } else {
        ok++;
      }
    }
  }
  if (ok) log.push(`✓ artifacts: ${ok} dev-vault file(s) equal the shipped set`);

  // dist/ is gitignored: compare the built index with a fresh build only when it exists.
  const distIndex = join(DIST_DIR, 'artifact-index.json');
  if (!existsSync(distIndex)) {
    log.push(`• artifact index: ${distIndex} not present — skipped (run artifacts:build)`);
  } else {
    const tmp = mkdtempSync(join(tmpdir(), 'schema-check-'));
    try {
      await buildArtifacts({ outDir: tmp, schemaDir: SCHEMA_DIR });
      if (readFileSync(distIndex, 'utf8') === readFileSync(join(tmp, 'artifact-index.json'), 'utf8')) {
        log.push(`✓ artifact index: ${distIndex} equals a fresh build`);
      } else {
        log.push(`✗ artifact index: ${distIndex} is stale — differs from a fresh build (run npm run artifacts:build)`);
        errors++;
      }
    } catch (e) {
      log.push(`✗ artifact index: fresh build failed — ${e.message}`);
      errors++;
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
}

console.log(`schema-check — vault: ${VAULT}\n`);
console.log(log.join('\n'));
console.log(
  `\n${errors === 0 ? 'PASS' : 'FAIL'} — ${errors} error(s), ${warnings} warning(s)`,
);
process.exit(errors === 0 ? 0 : 1);
