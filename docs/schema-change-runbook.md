# Schema-change runbook

> How to change the story frontmatter schema so `npm run schema:check` stays green.
> Read this before touching the schema. Any Claude Code instance (or human) can follow
> it standalone.

## Canonical source — `schema/*.json` (generated types)

The schema is canonical in **`schema/<type>.json`** (see `schema/README.md`). For a
**migrated** type you do NOT hand-edit the vault artifacts — you edit the JSON and run
`npm run schema:gen`, which regenerates the Template, FileClass, and human doc; then
`npm run schema:check`.

All eight entity types are generated from `schema/`: `book`, `character`, `character-fantasy`,
`location`, `lore`, `object`, `plotline`, `scene`.

The flow is `edit schema/<type>.json → npm run schema:gen → npm run schema:check`; the rename /
seed-note / XDD ripple below still applies. The rest of this runbook describes the underlying
three-artifact contract — what the generator produces. (A template's note **body** comes from
`schema/templates/<template>.md`: edit it there, never in the vault — `schema:gen` overwrites the
vault template. A type without a body file gets a minimal `# {{title}}` body.)

The shipped artifacts are rendered by `scripts/schema-artifacts.mjs` with `{{sf:<folder>}}`
placeholders (`fileClassesFolder`, `templatesFolder`, `schemaFolder`) and resolved with the default
`00 Meta/…` folders for the dev vault. Keep their text folder-free: no `00 Meta/`, `30 Canon`,
`10 Manuscript`, `20 Planning` or `95 Assets` in a description or note, no dev-vault defaults
(`series`), and `{{title}}` (core Templates) for the heading. A `valuesFrom` path must start with
`{{sf:fileClassesFolder}}/`; the named value-list note is generated empty into the FileClass set.
`Schema/README.md` (the index note) is generated too.

## The generated artifacts (`test/StoryForge/00 Meta/`)

Every entity type has **three property-surface artifacts that must stay in sync** (generated for
migrated types) — plus a machine-schema JSON (`Schema/<type>.json`, the runtime enum source vault
scripts read), the vault-wide, local-only `.obsidian/types.json` widget registry, and the deployed
vault infra (`infra/` → `00 Meta/{Scripts,Bases,dataview-views}`, schema-coupled). See
`schema/README.md` for the full artifact list. One generated file sits in the repo rather than the
vault: `src/editor/generatedUiHints.ts`, the `ui` hints keyed by FileClass. The three
property-surface artifacts are:

1. **FileClass** (metadata-menu, enforced schema): `00 Meta/FileClasses/fc-<type>.md`
   - What matters is `fields:` — each field has a `name:` (**this is the Property**) and an
     `id:` (internal). `fieldsOrder:` lists the `id:`s in display order.
   - **`id:` is internal** and may be renamed freely (just keep `fieldsOrder` consistent);
     that is **not** a schema change. The schema only changes when a `name:` changes.
2. **Template** (author-facing property surface): `00 Meta/Templates/entity-<type>.md`
   (or `scene.md`) — the top-level frontmatter keys.
3. **Human reference** (per-property docs): `00 Meta/Schema/<type>.md` — every Property under a
   `### \`property\`` heading, with its meaning, allowed values, and whether it is a
   `[[wikilink]]` relation.

`character-fantasy` is FileClass-only (`"hasTemplate": false`): it has no Template. A hand-written
FileClass in the same folder is not ours: `schema:gen` leaves it alone
(`test/schema/schemaGenHandwritten.test.ts`).

## The gate

`npm run schema:check` (`scripts/schema-check.mjs`) verifies:

- **docs == authoritative** — every Property in the schema source is documented in
  `00 Meta/Schema/<type>.md` (as `### \`prop\``) and vice-versa (no orphan doc entries).
  *Authoritative* = the **template frontmatter keys** (or, for `character-fantasy`, the
  FileClass `fields[].name`).
- **FileClass == Template** (cross-check) — FileClass `fields[].name` equals the template keys
  minus `tags`. (`tags` is a classifier, not a FileClass field — it is exempted.)
- **Machine schema** — `00 Meta/Schema/<type>.json` matches `schema/<type>.json`.
- **Infra** — every deployed `infra/` file is current, and every `.base` column and `hasTag()`
  filter exists in the schema.
- **UI hints** — `src/editor/generatedUiHints.ts` equals a fresh render of the `ui` hints. A
  mismatch means `schema:gen` was not run. An unknown `ui` value fails both scripts.
- **`types.json`** — when `.obsidian/types.json` is present, it carries every schema-derived widget
  type. It is skipped when absent (a fresh clone, CI).

- **Shipped artifacts** — every FileClass, Template and Schema reference note in the dev vault
  equals the shipped artifact resolved with the default folders, byte for byte (a missing file
  fails too; unrelated files in those folders are ignored). When `dist/artifact-index.json`
  exists it must equal a fresh build (stale → run `npm run artifacts:build`). No shipped source
  may contain dev-vault-only text (`00 Meta/`, `30 Canon`, `10 Manuscript`, `20 Planning`,
  `95 Assets`, `%title%`, `%name%`, `"Forge"`).

The gate runs in CI (`.github/workflows/lint.yml`) and reads its type list from `schema/*.json`, so a new type joins it with no script change.

## Checklist by change type

All entity types are generated from `schema/<type>.json`, so every change starts in the JSON —
then `npm run schema:gen` rewrites the vault artifacts. **Never hand-edit the generated Template /
FileClass / Schema doc**; the next `schema:gen` overwrites them.

- **ADD a property** (e.g. a `mood` field on scene):
  1. `schema/scene.json`: add a field object — `{ "name": "mood", "type": "…", "description": "…" }`
     (type vocabulary in `schema/README.md`).
  2. `npm run schema:gen && npm run schema:check`.
  3. Optionally populate seed notes (`10 Manuscript/`, `30 Canon/`, `20 Planning/`) with the new
     field so the test data exercises it.
- **RENAME a property** (its `name` changes): change `name` in `schema/<type>.json`, regenerate,
  then update **every seed note** using the old key (`rg 'oldName:' test/StoryForge`) and the XDD
  spec (below).
- **REMOVE a property**: delete the field from `schema/<type>.json`, regenerate, and remove it
  from the seed notes.
- **CHANGE a value list** (`select` options): edit the field's `values` array in
  `schema/<type>.json`, regenerate, and check seed values. (`schema:check` does not validate
  values, but they must stay coherent.)
- **CHANGE a property's `type`** (e.g. `portrait` from `text` to `media`, spec 008 CON-5). Its name
  stays, but its stored value may not:
  1. `schema/<type>.json`: change `type`. A new vocabulary value also needs the generator's type
     maps in `scripts/schema-gen.mjs` and `nativeType` in `scripts/schema-types-json.mjs`.
  2. `npm run schema:gen`. If the widget type changed, `types.json` keeps the old value and reports
     a conflict: align it with `npm run schema:gen -- --force`.
  3. Rewrite every seed note whose stored value has the wrong shape
     (`rg '<name>:' test/StoryForge`). `schema:check` does not validate values. A `media` value is a
     wikilink with the full vault path, such as `[[95 Assets/Mara Stoneway.svg]]`, which
     `test/schema/mediaFields.test.ts` enforces.
  4. Check code that reads the field by name: `src/panel/kindFields.ts` and the panel renderers.
  5. `npm run schema:check`, then the XDD ripple below.
- **ADD or CHANGE a `ui` hint**: set `"ui": "wide"` on the field, the only accepted value. Run
  `npm run schema:gen`, which rewrites `src/editor/generatedUiHints.ts`, and commit that file. The
  hint never reaches a FileClass.
- **ADD an entity type**: add `schema/<type>.json`, regenerate, and add `fc-<type>` to
  `GENERATED_FILE_CLASSES` in `src/editor/generatedFileClasses.ts`. Without that, its sections read
  as the user's own, and `test/editor/generatedFileClasses.test.ts` fails.
- **FileClass `id:`s** are generated (`<prefix>-<name>`) and internal — never hand-edit them.

## Script flags

| Flag | Script | Effect |
|---|---|---|
| `--vault <path>` | gen, check | target vault (default `test/StoryForge`) |
| `--schema <dir>` | gen, check | read another schema directory (default `schema`) |
| `--no-ui-hints` | gen | skip writing the tracked `src/editor/generatedUiHints.ts` (for tests in temp vaults) |
| `--force` | gen | overwrite conflicting `types.json` keys |

Through npm, pass them after `--`: `npm run schema:gen -- --vault /tmp/vault --no-ui-hints`.

## Ripple into the XDD spec (for property-NAME and type changes, not `id`)

`docs/XDD/specs/001-core-infrastructure/` references property names (e.g. `storyDay`, `when`,
`characters`, `location`, `plotlines`) in `requirements.md`, `solution.md`, and `mockups.html`.
On a name change, `rg '<oldName>' docs/XDD` and update those too. Pure `id:` renames need nothing.

`docs/XDD/specs/008-codex-surface/` and `docs/XDD/adr/0002-fileclass-driven-editor.md` also name
fields and their types: `requirements.md` (F6), `solution.md` (CON-5, the width and FieldModel
walkthroughs) and the plan. Check them on a name or a type change, and add a dated revision note
instead of rewriting a decision.

## Project rules (important)

- **Everything English** — vault content, schema, prose, docs. No German property names, values,
  or filenames.
- **Frontmatter is the source of truth** — the plugin writes only plain Properties, never a
  plugin-owned store.
- **Branch discipline** — hooks block writes/commits on `main`. Branch first:
  `git checkout -b <feat|chore|docs>/<slug>`. Conventional Commits.
- **Release CI runs on every push to `main`** — a `feat:` commit cuts a minor release, `fix:`
  a patch; `docs:`/`chore:`/`test:` cut none. Choose the commit type accordingly.

## Procedure

1. `git status`; create a branch.
2. Make the change consistent across all three artifacts + seed notes.
3. `npm run schema:check` until green (`schema:gen` regenerates the dev vault; `npm run artifacts:build`,
   part of `build`/`predev`, regenerates `dist/artifact-index.json`), then `npm run typecheck && npm run lint && npm run build`.
4. On a property-name or type change, check the XDD-spec ripple (`rg` in `docs/XDD`).
5. Commit (Conventional Commit), **not** on `main`.

**Full verification (all green):**
```bash
npm run schema:check && npm run typecheck && npm run lint && npm run build
```
