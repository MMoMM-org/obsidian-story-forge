// schema-artifacts — pure renderers for the shipped vault artifacts.
//
// Every artifact Story Forge can set up in a user's vault is rendered here, from
// schema/*.json and the template bodies in schema/templates/, as an UNRESOLVED
// source: folders appear only as `{{sf:<folder>}}` placeholders (closed list in
// src/artifacts/artifactTypes.ts). schema-gen.mjs resolves these sources with the
// default folders to write the dev vault; the artifact index build reuses them.
//
// Sets (one per configured folder):
//   fileclasses  fc-<type>.md, plus the empty value-list notes a FileClass points at
//   templates    scene.md | entity-<type>.md   (frontmatter from the schema, body from schema/templates/)
//   schema       <type>.md (property reference) and README.md (the index note)
//
// No file is written and nothing outside schemaDir is read.
//
// @ref docs/XDD/specs/010-ship-vault-artifacts/solution.md — ADR-38, ADR-43

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

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

/** The placeholder a value-list note path must start with to ship in the FileClass set. */
const FILECLASSES_PREFIX = '{{sf:fileClassesFolder}}/';

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const query = (rel) => `dv.pages("#${RELATION_TAG[rel] ?? `canon/${rel}`}")`;

/** The template file name of a schema type. */
export const templateNameOf = (s) =>
  s.template ?? (s.entity === 'scene' ? 'scene.md' : `entity-${s.entity}.md`);

/** schema/*.json, sorted by file name, each with its raw text. */
export function loadSchemas(schemaDir) {
  return readdirSync(schemaDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((file) => {
      const rawText = readFileSync(join(schemaDir, file), 'utf8');
      return { file, rawText, schema: JSON.parse(rawText) };
    });
}

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
    case 'media':
      type = 'Media';
      // metadata-menu's Media defaults, written out: its FileClass form reads them without
      // falling back (0.8.12 fails on a missing `folders`).
      optionsBlock = '    options:\n      embed: false\n      folders: []\n      display: card\n      thumbnailSize: "100"';
      break;
    case 'text':
    default:
      type = 'Input';
      optionsBlock = '    options: {}';
  }
  return { id, text: `  - name: ${f.name}\n    type: ${type}\n${optionsBlock}\n    path: ""\n    id: ${id}` };
}

// FileClasses match notes by tag only: no `filesPaths`, so they work in any layout.
// A type without a tag (character-fantasy, applied via `fileClass:`) has no tagNames.
function genFileClass(s, prefix) {
  const fields = s.fields.filter((f) => f.type !== 'tags');
  const built = fields.map((f) => fcField(f, prefix));
  const order = built.map((b) => `  - ${b.id}`).join('\n');
  const body = built.map((b) => b.text).join('\n');
  const tagNames = s.tag ? `tagNames:\n  - ${s.tag}` : 'tagNames:';
  return `---
limit: 20
mapWithTag: false
icon: ${s.icon ?? 'file'}
${tagNames}
filesPaths:
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

/** Value-list note names (`fc-armor.md`) the schema's FileClasses point at. */
function valueListNotes(schemas) {
  const names = [];
  for (const s of schemas) {
    for (const f of s.fields) {
      if (!f.valuesFrom) continue;
      if (!f.valuesFrom.startsWith(FILECLASSES_PREFIX)) {
        throw new Error(`${s.entity}.${f.name}: valuesFrom must start with ${FILECLASSES_PREFIX}`);
      }
      const name = f.valuesFrom.slice(FILECLASSES_PREFIX.length);
      if (!names.includes(name)) names.push(name);
    }
  }
  return names.sort();
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
    case 'select': {
      // `"default": ""` presets no value; otherwise the first value (or `default`).
      const value = f.default === '' ? '""' : (f.default ?? f.values[0]);
      return `${f.name}: ${value}        # ${f.values.join(' | ')}`;
    }
    case 'relation':
      return `${f.name}: ""${rel ? `           # "${rel}"` : ''}`;
    case 'list':
      return `${f.name}: []${rel ? `           # ["${rel}"]` : ''}`;
    case 'tags':
      return `tags: [${tag}]`;
    case 'media': // a [[wikilink]] to the file, stored as a string
    case 'text':
    default:
      return `${f.name}: ${f.default != null ? `"${f.default}"` : '""'}`;
  }
}

// The body comes from schema/templates/<template>; a type without one gets a minimal
// default. `{{title}}` is core Templates' own placeholder, never resolved by us.
const DEFAULT_BODY = `# {{title}}

<!-- Prose below. Facts belong in the frontmatter above / in Canon, not here.
     Link entities with [[wikilinks]] so the reference panel and continuity checks resolve them. -->
`;

function genTemplate(s, body) {
  const fm = s.fields.map((f) => tplLine(f, s.tag)).join('\n');
  return `---\n${fm}\n---\n\n${body ?? DEFAULT_BODY}`;
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

// ── the Schema index note (user-facing; folders only through placeholders) ─
function genIndex(schemas) {
  const rows = schemas.map((s) => {
    const template = s.hasTemplate === false
      ? `— (extends \`fc-${s.extends}\`)`
      : `\`${templateNameOf(s)}\``;
    return `| \`${s.entity}\` | \`fc-${s.entity}.md\` | ${template} | \`${s.entity}.md\` |`;
  });
  return `# Schema — property reference

This folder is the human-readable reference for your story's Properties. One note per
entity type explains every Property: what it means, its type, its allowed values, and
whether it is a \`[[wikilink]]\` relation.

## Entity types

Every type has a metadata-menu FileClass (the enforced schema) and, except where noted,
a template (the Properties a new note starts with). The two agree, and the reference note
here describes them:

| Type | FileClass | Template | Reference |
|---|---|---|---|
${rows.join('\n')}

FileClasses live in \`{{sf:fileClassesFolder}}\`, templates in \`{{sf:templatesFolder}}\`.
A FileClass finds its notes by tag (or by a note's \`fileClass\` Property), so your
notes can live in any folder.

## Conventions

- Each Property is documented under a \`\` ### \`property\` \`\` heading.
- **Facts live in frontmatter**; prose lives in the note body. The reference panel and
  Bases/Dataview views read the frontmatter, so keep it clean.
- **Relations are \`[[wikilinks]]\`** in the frontmatter (single value or a list), never
  free text, so they resolve as links.
`;
}

/** Template bodies from `<schemaDir>/templates/`, keyed by template file name. */
function loadTemplateBodies(schemaDir) {
  const dir = join(schemaDir, 'templates');
  const bodies = new Map();
  if (!existsSync(dir)) return bodies;
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
    bodies.set(name, readFileSync(join(dir, name), 'utf8'));
  }
  return bodies;
}

/**
 * Every shipped artifact, unresolved: `{ set, relPath, source }`, in a stable order.
 * Dev-only vault files (Schema/<type>.json copies, infra) are not artifacts.
 */
export function renderArtifacts(schemaDir) {
  const schemas = loadSchemas(schemaDir).map((e) => e.schema);
  const bodies = loadTemplateBodies(schemaDir);
  const out = [];
  for (const s of schemas) {
    const prefix = s.idPrefix ?? s.entity[0];
    out.push({ set: 'fileclasses', relPath: `fc-${s.entity}.md`, source: genFileClass(s, prefix) });
    if (s.hasTemplate !== false) {
      const name = templateNameOf(s);
      out.push({ set: 'templates', relPath: name, source: genTemplate(s, bodies.get(name)) });
    }
    out.push({ set: 'schema', relPath: `${s.entity}.md`, source: genDoc(s) });
  }
  for (const name of valueListNotes(schemas)) {
    out.push({ set: 'fileclasses', relPath: name, source: '' });
  }
  out.push({ set: 'schema', relPath: 'README.md', source: genIndex(schemas) });
  return out;
}
