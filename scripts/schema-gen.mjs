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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const vIdx = args.indexOf('--vault');
const VAULT = vIdx !== -1 ? args[vIdx + 1] : 'test/StoryForge';

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
      optionsBlock = `    options:\n      dvQueryString: ${query(f.relation)}`;
      break;
    case 'list':
      if (f.relation) {
        type = 'MultiFile';
        optionsBlock = `    options:\n      dvQueryString: ${query(f.relation)}`;
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
extends:
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

function genTemplate(s) {
  const fm = s.fields.map((f) => tplLine(f, s.tag)).join('\n');
  const nameField = s.fields.find((f) => f.name === 'title' || f.name === 'name');
  const heading = nameField ? `# %${nameField.name}%` : `# ${cap(s.entity)}`;
  return `---
${fm}
---

${heading}

<!-- Prose below. Facts belong in the frontmatter above / in Canon, not here.
     Link entities with [[wikilinks]] so the reference panel and continuity checks resolve them. -->
`;
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
for (const file of files.sort()) {
  const s = JSON.parse(readFileSync(join(SCHEMA_DIR, file), 'utf8'));
  const prefix = s.idPrefix ?? s.entity[0];
  const tplName = s.template ?? (s.entity === 'scene' ? 'scene.md' : `entity-${s.entity}.md`);

  writeFileSync(join(OUT.fileclasses, `fc-${s.entity}.md`), genFileClass(s, prefix));
  written.push(`FileClasses/fc-${s.entity}.md`);

  if (s.hasTemplate !== false) {
    writeFileSync(join(OUT.templates, tplName), genTemplate(s));
    written.push(`Templates/${tplName}`);
  }

  writeFileSync(join(OUT.docs, `${s.entity}.md`), genDoc(s));
  written.push(`Schema/${s.entity}.md`);
}

console.log(`schema-gen → ${VAULT}/00 Meta/\n`);
console.log(written.map((w) => `  ✓ ${w}`).join('\n'));
console.log(`\n${files.length} schema file(s) → ${written.length} artifact(s).`);
