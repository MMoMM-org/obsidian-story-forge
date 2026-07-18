#!/usr/bin/env node
// schema-gen — derive the vault schema artifacts from the canonical schema/*.json.
//
// One canonical JSON per entity type (schema/<type>.json) is the single source of
// truth. This script generates, into the test vault (00 Meta/), the three artifacts
// schema-check.mjs validates:
//   - Template   00 Meta/Templates/<scene.md | entity-<type>.md>   (author frontmatter)
//   - FileClass  00 Meta/FileClasses/fc-<type>.md                  (metadata-menu schema)
//   - Reference  00 Meta/Schema/<type>.md                          (human property doc)
//
// Field `type` in the JSON is the only abstraction; it maps to metadata-menu type,
// template default, and the doc note. `id:` is generated deterministically (internal).
//
// Usage: node scripts/schema-gen.mjs [--vault <path>]   (default test/StoryForge)

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveNativeTypes, diffTypes } from './schema-types-json.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const vIdx = args.indexOf('--vault');
const VAULT = vIdx !== -1 ? args[vIdx + 1] : 'test/StoryForge';
const FORCE = args.includes('--force'); // also overwrite conflicting types.json keys

const SCHEMA_DIR = join(ROOT, 'schema');
const META = join(ROOT, VAULT, '00 Meta');
const OUT = {
  templates: join(META, 'Templates'),
  fileclasses: join(META, 'FileClasses'),
  docs: join(META, 'Schema'),
};

// Relation target entity → the tag its notes carry (drives the dvQueryString).
const RELATION_TAG = {
  character: 'canon/character',
  location: 'canon/location',
  object: 'canon/object',
  lore: 'canon/lore',
  book: 'planning/book',
  scene: 'manuscript/scene',
  plotline: 'planning/plotline',
};

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const query = (rel) => `dv.pages("#${RELATION_TAG[rel] ?? `canon/${rel}`}")`;

// ── metadata-menu FileClass field (skips `tags`, a classifier) ──────────────
function fcField(f, prefix) {
  const id = `${prefix}-${f.name.toLowerCase()}`;
  let type;
  let optionsBlock;
  switch (f.type) {
    case 'fixed':
      type = 'Select';
      optionsBlock = `    options:\n      sourceType: ValuesList\n      valuesList:\n        "1": ${f.value}`;
      break;
    case 'select': {
      type = 'Select';
      const vl = f.values.map((v, i) => `        "${i + 1}": ${v}`).join('\n');
      optionsBlock = `    options:\n      sourceType: ValuesList\n      valuesList:\n${vl}`;
      break;
    }
    case 'number':
      type = 'Number';
      optionsBlock = '    options: {}';
      break;
    case 'boolean':
      type = 'Boolean';
      optionsBlock = '    options: {}';
      break;
    case 'relation':
      type = 'File';
      optionsBlock = `    options:\n      dvQueryString: ${f.query ?? query(f.relation)}`;
      break;
    case 'list':
      if (f.relation || f.query) {
        type = 'MultiFile';
        optionsBlock = `    options:\n      dvQueryString: ${f.query ?? query(f.relation)}`;
      } else if (f.valuesFrom) {
        type = 'Multi';
        optionsBlock = `    options:\n      sourceType: ValuesListNotePath\n      valuesList: {}\n      valuesListNotePath: ${f.valuesFrom}`;
      } else {
        type = 'Multi';
        optionsBlock = '    options:\n      sourceType: ValuesList\n      valuesList: {}';
      }
      break;
    case 'text':
    default:
      type = 'Input';
      optionsBlock = '    options: {}';
  }
  return { id, text: `  - name: ${f.name}\n    type: ${type}\n${optionsBlock}\n    path: ""\n    id: ${id}` };
}

function genFileClass(s, prefix) {
  const fields = s.fields.filter((f) => f.type !== 'tags');
  const built = fields.map((f) => fcField(f, prefix));
  const order = built.map((b) => `  - ${b.id}`).join('\n');
  const body = built.map((b) => b.text).join('\n');
  return `---
limit: 20
mapWithTag: false
icon: ${s.icon ?? 'file'}
tagNames:
  - ${s.tag}
filesPaths:
  - ${s.folder}
bookmarksGroups:
excludes:
extends:${s.extends ? ` fc-${s.extends}` : ''}
savedViews: []
favoriteView:
fieldsOrder:
${order}
version: "3.0"
fields:
${body}
---
`;
}

// ── author-facing template frontmatter ──────────────────────────────────────
function tplLine(f, tag) {
  const rel = f.relation ? `[[${cap(f.relation)}]]` : null;
  switch (f.type) {
    case 'fixed':
      return `${f.name}: ${f.value}`;
    case 'number':
      return `${f.name}: ${f.default ?? 'null'}`;
    case 'boolean':
      return `${f.name}: ${f.default ?? 'false'}`;
    case 'select':
      return `${f.name}: ${f.default ?? f.values[0]}        # ${f.values.join(' | ')}`;
    case 'relation':
      return `${f.name}: ""${rel ? `           # "${rel}"` : ''}`;
    case 'list':
      return `${f.name}: []${rel ? `           # ["${rel}"]` : ''}`;
    case 'tags':
      return `tags: [${tag}]`;
    case 'text':
    default:
      return `${f.name}: ${f.default != null ? `"${f.default}"` : '""'}`;
  }
}

// The frontmatter is generated from the schema; the note BODY (prose scaffolding,
// meta-bind display lines) is author content — preserve it when regenerating, and
// only emit a minimal default body when the template does not exist yet.
function genTemplate(s, existingBody) {
  const fm = s.fields.map((f) => tplLine(f, s.tag)).join('\n');
  const nameField = s.fields.find((f) => f.name === 'title' || f.name === 'name');
  const heading = nameField ? `# %${nameField.name}%` : `# ${cap(s.entity)}`;
  const body =
    existingBody != null && existingBody.trim()
      ? existingBody
      : `\n${heading}\n\n<!-- Prose below. Facts belong in the frontmatter above / in Canon, not here.\n     Link entities with [[wikilinks]] so the reference panel and continuity checks resolve them. -->\n`;
  return `---\n${fm}\n---\n${body}`;
}

// ── human reference doc ─────────────────────────────────────────────────────
function genDoc(s) {
  const sections = s.fields
    .map((f) => `### \`${f.name}\`\n${f.description}`)
    .join('\n\n');
  return `# ${cap(s.entity)} — property reference

${s.note}

## Properties

${sections}
`;
}

// ── run ─────────────────────────────────────────────────────────────────────
function ensure(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

const files = readdirSync(SCHEMA_DIR).filter((f) => f.endsWith('.json'));
if (!files.length) {
  console.error(`No schema/*.json found in ${SCHEMA_DIR}`);
  process.exit(1);
}
Object.values(OUT).forEach(ensure);

const written = [];
const allSchemas = [];
for (const file of files.sort()) {
  const rawText = readFileSync(join(SCHEMA_DIR, file), 'utf8');
  const s = JSON.parse(rawText);
  allSchemas.push(s);
  const prefix = s.idPrefix ?? s.entity[0];
  const tplName = s.template ?? (s.entity === 'scene' ? 'scene.md' : `entity-${s.entity}.md`);

  writeFileSync(join(OUT.fileclasses, `fc-${s.entity}.md`), genFileClass(s, prefix));
  written.push(`FileClasses/fc-${s.entity}.md`);

  if (s.hasTemplate !== false) {
    const tplPath = join(OUT.templates, tplName);
    const prior = existsSync(tplPath) ? readFileSync(tplPath, 'utf8') : null;
    const bodyMatch = prior && prior.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
    writeFileSync(tplPath, genTemplate(s, bodyMatch ? bodyMatch[1] : null));
    written.push(`Templates/${tplName}`);
  }

  writeFileSync(join(OUT.docs, `${s.entity}.md`), genDoc(s));
  written.push(`Schema/${s.entity}.md`);

  // Q6a — raw machine-readable schema JSON in the vault. This is the runtime
  // enum source-of-truth the QuickAdd status scripts read (`Schema/<type>.json
  // → fields[name=status].values`); byte-identical to the canonical schema/*.json.
  writeFileSync(join(OUT.docs, `${s.entity}.json`), rawText);
  written.push(`Schema/${s.entity}.json`);
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
const OBSIDIAN = join(ROOT, VAULT, '.obsidian');
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
