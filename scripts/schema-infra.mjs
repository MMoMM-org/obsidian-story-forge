// schema-infra — deploy + schema-couple the vault tooling (QuickAdd Scripts,
// Obsidian Bases, Dataview views) from the canonical source in `infra/` into the
// test vault's `00 Meta/`. Shared by schema-gen (deploy) and schema-check (gate).
//
// The infra is BLUEPRINT-managed, not field-derived: the curated Base column/view
// designs are authored (that belongs to M4 Codex). schema-coupling here is:
//   - enum injection: a `// @schema-enum <type>.<field>` marker keeps a script's
//     fallback list in sync with the schema (the scripts also read it at runtime);
//   - reference validation: a .base's property/tag/folder references must exist in
//     the schema (catches a field/tag/folder renamed in the schema but stale here).

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** All files under `dir`, recursively, as absolute paths. */
export function walkFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) out.push(...walkFiles(abs));
    else out.push(abs);
  }
  return out;
}

/** Infra source files as { rel, content } (rel = path under the infra root). */
export function readInfra(infraDir) {
  return walkFiles(infraDir).map((abs) => ({
    rel: relative(infraDir, abs),
    content: readFileSync(abs, 'utf8'),
  }));
}

/**
 * Replace the array literal on the line AFTER a `// @schema-enum <type>.<field>`
 * marker with the schema field's current `values`, so a deployed script's fallback
 * list stays in sync with the schema. Content without a marker is returned as-is.
 */
export function injectEnums(content, schemaByType) {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length - 1; i++) {
    const m = lines[i].match(/@schema-enum\s+([a-z][a-z-]*)\.([a-z_]+)/i);
    if (!m) continue;
    const s = schemaByType[m[1]];
    const f = s && s.fields.find((x) => x.name === m[2]);
    if (f && Array.isArray(f.values)) {
      lines[i + 1] = lines[i + 1].replace(/\[[^\]]*\]/, JSON.stringify(f.values));
    }
  }
  return lines.join('\n');
}

/**
 * Validate an Obsidian `.base` file's schema-owned references: declared column
 * PROPERTIES must be schema fields, and `hasTag()` filters must be schema tags.
 * (Folder filters like `inFolder("30 Canon")` are organizational — a Base may
 * filter a parent of the schema `folder` — so they are not validated here.)
 * `fields`/`tags` are Sets of the names the schema defines. Empty return = clean.
 */
export function baseRefErrors(content, { fields, tags }) {
  const errs = [];
  // `properties:` block keys (2-space-indented `key:` until the next top-level key).
  let inProps = false;
  for (const line of content.split('\n')) {
    if (/^properties:\s*$/.test(line)) { inProps = true; continue; }
    if (inProps) {
      if (/^\S/.test(line)) inProps = false;
      else {
        const km = line.match(/^ {2}([A-Za-z0-9_.]+):/);
        if (km && !km[1].startsWith('file.') && !fields.has(km[1])) {
          errs.push(`unknown property "${km[1]}" (not a schema field)`);
        }
      }
    }
  }
  for (const m of content.matchAll(/hasTag\("([^"]+)"\)/g)) {
    if (!tags.has(m[1])) errs.push(`unknown tag "${m[1]}" (not a schema tag)`);
  }
  return errs;
}

/** Build the schema-derived lookups the infra gate needs. */
export function schemaLookups(schemas) {
  const byType = {};
  const fields = new Set();
  const tags = new Set();
  const folders = new Set();
  for (const s of schemas) {
    byType[s.entity] = s;
    if (s.tag) tags.add(s.tag);
    if (s.folder) folders.add(s.folder);
    for (const f of s.fields) fields.add(f.name);
  }
  return { byType, fields, tags, folders };
}
