#!/usr/bin/env node
/**
 * build-artifacts.mjs — the shipped vault-artifact index (spec 010, ADR-38).
 *
 * Renders every shippable artifact (FileClasses, Templates, Schema reference)
 * from schema/*.json via schema-artifacts.mjs and writes dist/artifact-index.json,
 * which src/main.ts imports statically so the set ships offline inside main.js.
 *
 * Index shape (deterministic: no timestamp, stable order):
 *   { version: "1", entries: [{ id, set, relPath, source, checksum, placeholders }] }
 *   - id:           "<set-prefix>/<relPath without .md>", prefixes fileclass | template | schema
 *                   (e.g. "fileclass/fc-scene", "template/scene", "schema/scene")
 *   - source:       UNRESOLVED text, folders as `{{sf:<name>}}` placeholders
 *   - checksum:     "sha256:<hex>" over `source` via computeChecksum
 *   - placeholders: distinct placeholder names used in `source`
 * Dev-only vault files (Processes, CLAUDE.md, Bases, Scripts, dataview-views, the
 * Schema/<type>.json copies) are never rendered by schema-artifacts, hence never shipped.
 * An unknown `{{sf:…}}` placeholder fails the build.
 *
 * @ref SDD/ADR-38
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderArtifacts } from './schema-artifacts.mjs';

const jitiMod = await import('jiti');
const jiti = jitiMod.default ?? jitiMod.createJiti;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const run = jiti(ROOT, { interopDefault: true });
const { computeChecksum } = run(join(ROOT, 'src/consent/checksum.ts'));
const { placeholdersIn } = run(join(ROOT, 'src/artifacts/resolvePlaceholders.ts'));
const { ARTIFACT_PLACEHOLDERS } = run(join(ROOT, 'src/artifacts/artifactTypes.ts'));

const ID_PREFIX = { fileclasses: 'fileclass', templates: 'template', schema: 'schema' };

/**
 * @param {{ outDir: string, schemaDir?: string }} opts
 * @returns {Promise<{ version: '1', entries: object[] }>}
 */
export async function buildArtifacts({ outDir, schemaDir = join(ROOT, 'schema') }) {
  const entries = [];
  for (const { set, relPath, source } of renderArtifacts(schemaDir)) {
    const placeholders = placeholdersIn(source);
    const unknown = placeholders.filter((n) => !ARTIFACT_PLACEHOLDERS.includes(n));
    if (unknown.length > 0) {
      throw new Error(`build-artifacts: unknown placeholder(s) ${unknown.join(', ')} in ${set}/${relPath}`);
    }
    entries.push({
      id: `${ID_PREFIX[set]}/${relPath.replace(/\.md$/, '')}`,
      set,
      relPath,
      source,
      checksum: await computeChecksum(source),
      placeholders,
    });
  }
  const ids = new Set(entries.map((e) => e.id));
  if (ids.size !== entries.length) throw new Error('build-artifacts: duplicate artifact id');

  const index = { version: '1', entries };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'artifact-index.json'), JSON.stringify(index, null, 2) + '\n', 'utf8');
  return index;
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf('--out');
  const outDir = outIdx !== -1 ? args[outIdx + 1] : join(ROOT, 'dist');
  buildArtifacts({ outDir })
    .then((index) => console.log(`build-artifacts → ${outDir}/artifact-index.json (${index.entries.length} entries)`))
    .catch((err) => {
      console.error(`build-artifacts FAILED: ${err.message}`);
      process.exit(1);
    });
}
