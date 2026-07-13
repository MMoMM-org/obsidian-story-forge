#!/usr/bin/env node
// schema-check — verify the human property reference stays in sync with the
// machine schema (metadata-menu FileClasses + entity/scene templates).
//
// The machine schema is the source of truth:
//   - `character`          → FileClass fc-character (cross-checked vs its template)
//   - `character-fantasy`  → FileClass fc-character-fantasy (extension fields)
//   - location/object/lore/scene → the template frontmatter (no FileClass yet)
//
// The human reference (00 Meta/Schema/<type>.md) must document EXACTLY those
// properties, one `### \`prop\`` subsection each. Drift → non-zero exit.
//
// Usage: node scripts/schema-check.mjs [--vault <path>]   (default test/StoryForge)

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const vaultIdx = args.indexOf('--vault');
const VAULT = vaultIdx !== -1 ? args[vaultIdx + 1] : 'test/StoryForge';

const META = join(VAULT, '00 Meta');
const TEMPLATES = join(META, 'Templates');
const FILECLASSES = join(META, 'FileClasses');
const SCHEMA = join(META, 'Schema');

// type → sources. `template` = author-facing frontmatter; `fileclass` = enforced
// metadata-menu schema; `doc` = the human reference note.
const TYPES = [
  { type: 'character', template: 'entity-character.md', fileclass: 'fc-character.md', doc: 'character.md' },
  { type: 'character-fantasy', fileclass: 'fc-character-fantasy.md', doc: 'character-fantasy.md' },
  { type: 'location', template: 'entity-location.md', fileclass: 'fc-location.md', doc: 'location.md' },
  { type: 'object', template: 'entity-object.md', fileclass: 'fc-object.md', doc: 'object.md' },
  { type: 'lore', template: 'entity-lore.md', fileclass: 'fc-lore.md', doc: 'lore.md' },
  { type: 'scene', template: 'scene.md', fileclass: 'fc-scene.md', doc: 'scene.md' },
];

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

console.log(`schema-check — vault: ${VAULT}\n`);
console.log(log.join('\n'));
console.log(
  `\n${errors === 0 ? 'PASS' : 'FAIL'} — ${errors} error(s), ${warnings} warning(s)`,
);
process.exit(errors === 0 ? 0 : 1);
