# Schema-change runbook

> How to change the story frontmatter schema so `npm run schema:check` stays green.
> Read this before touching the schema. Any Claude Code instance (or human) can follow
> it standalone.

## Canonical source — `schema/*.json` (generated types)

The schema is canonical in **`schema/<type>.json`** (see `schema/README.md`). For a
**migrated** type you do NOT hand-edit the vault artifacts — you edit the JSON and run
`npm run schema:gen`, which regenerates the Template, FileClass, and human doc; then
`npm run schema:check`.

All entity types are generated from `schema/`: `scene`, `character`, `character-fantasy`,
`location`, `object`, `lore`.

The flow is `edit schema/<type>.json → npm run schema:gen → npm run schema:check`; the rename /
seed-note / XDD ripple below still applies. The rest of this runbook describes the underlying
three-artifact contract — what the generator produces. (A template's note **body** is author
content: preserved across regeneration, not generated.)

## The three artifacts (`test/StoryForge/00 Meta/`)

Every entity type has **three artifacts that must stay in sync** (generated for migrated types):

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

Types: `character` (+ `character-fantasy`, FileClass only), `location`, `object`, `lore`, `scene`.

## The gate

`npm run schema:check` (`scripts/schema-check.mjs`) verifies:

- **docs == authoritative** — every Property in the schema source is documented in
  `00 Meta/Schema/<type>.md` (as `### \`prop\``) and vice-versa (no orphan doc entries).
  *Authoritative* = the **template frontmatter keys** (or, for `character-fantasy`, the
  FileClass `fields[].name`).
- **FileClass == Template** (cross-check) — FileClass `fields[].name` equals the template keys
  minus `tags`. (`tags` is a classifier, not a FileClass field — it is exempted.)

## Checklist by change type

- **ADD a property** (e.g. `flashback` to scene):
  1. Template `scene.md`: add the frontmatter key with a default + comment.
  2. `fc-scene.md`: add a `fields:` entry (`name: flashback`, a suitable `type:`, an `id:`) and
     add that `id` to `fieldsOrder`.
  3. `00 Meta/Schema/scene.md`: add `### \`flashback\`` with meaning, allowed values, and whether
     it is a `[[wikilink]]` relation.
  4. Optionally populate seed notes (`10 Manuscript/`, `30 Canon/`, `20 Planning/`) with the new
     field so the test data exercises it.
- **RENAME a property** (its `name` changes): rename it in all three (template key, FileClass
  `name:`, Schema `### \`...\``), then update **every seed note** using the old key.
  Find them: `rg 'oldName:' test/StoryForge`.
- **REMOVE a property**: delete from template, FileClass (`fields` + `fieldsOrder`), and the
  Schema doc; remove it from seed notes.
- **CHANGE a value list** (Select options): update the FileClass `valuesList` **and** the
  enumeration in the Schema doc; check seed values. (`schema:check` does not validate values, but
  they must stay coherent.)
- **RENAME a field `id:` only** (no `name:` change): touch only `id` + `fieldsOrder` — nothing
  else. Not a schema change.

## Ripple into the XDD spec (only for property-NAME changes, not `id`)

`docs/XDD/specs/001-core-infrastructure/` references property names (e.g. `storyDay`, `when`,
`characters`, `location`, `plotlines`) in `requirements.md`, `solution.md`, and `mockups.html`.
On a name change, `rg '<oldName>' docs/XDD` and update those too. Pure `id:` renames need nothing.

## Project rules (important)

- **Everything English** — vault content, schema, prose, docs. No German property names, values,
  or filenames.
- **Frontmatter is the source of truth** — the plugin writes only plain Properties, never a
  plugin-owned store.
- **Branch discipline** — hooks block writes/commits on `main`. Branch first:
  `git checkout -b <feat|chore|docs>/<slug>`. Conventional Commits.
- **Release CI is paused** (`workflow_dispatch`) — `feat:`/`fix:` do **not** cut a release.
  Version baseline is `0.1.0`.

## Procedure

1. `git status`; create a branch.
2. Make the change consistent across all three artifacts + seed notes.
3. `npm run schema:check` until green, then `npm run typecheck && npm run lint && npm run build`.
4. On a property-name change, check the XDD-spec ripple (`rg` in `docs/XDD`).
5. Commit (Conventional Commit), **not** on `main`.

**Full verification (all green):**
```bash
npm run schema:check && npm run typecheck && npm run lint && npm run build
```
