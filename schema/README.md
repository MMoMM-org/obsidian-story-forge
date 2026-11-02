# `schema/` — canonical story-entity schema

This directory is the **single source of truth** for the story-entity frontmatter
schema the plugin reads and writes. It is part of the coding process, not test data:
every artifact below is **generated** from these JSON files.

## What it drives

One `schema/<type>.json` per entity type. `npm run schema:gen` derives, into the test
vault (`test/StoryForge/00 Meta/`), these artifacts:

| Generated artifact | Scope | Purpose |
|---|---|---|
| `Templates/<type>.md` (or `entity-<type>.md`) | per type | author-facing frontmatter surface |
| `FileClasses/fc-<type>.md` | per type | metadata-menu enforced schema |
| `Schema/<type>.md` | per type | human property reference (from the `description` fields) |
| `Schema/<type>.json` | per type | raw machine schema (byte-identical to `schema/<type>.json`); the runtime enum source-of-truth vault scripts read |
| `.obsidian/types.json` | vault-wide | Obsidian's property→widget-type registry, **merge-only** (schema keys added, foreign keys preserved). Local-only — `.obsidian/` is gitignored |

`npm run schema:check` is the gate: it verifies the human doc agrees with the schema
(doc headings == template keys == FileClass field names, minus the `tags` classifier),
that `Schema/<type>.json` matches the canonical `schema/<type>.json`, and — when present
— that `.obsidian/types.json` carries every schema-derived widget type (skipped when
absent, e.g. a fresh clone / CI).

`schema:gen` also **deploys** the blueprint-managed vault infra from `infra/` (QuickAdd
`Scripts/`, Obsidian `Bases/`, `dataview-views/`) into `00 Meta/{Scripts,Bases,dataview-views}`.
It is schema-**coupled**: a `// @schema-enum <type>.<field>` marker injects the schema's current
enum values into a script's fallback list, and `schema:check` verifies every `.base` column
property + `hasTag()` filter exists in the schema (catching a renamed field/tag). The curated
Base column/view *designs* are authored, not field-derived — that belongs to M4 (Bases + Codex).

## The JSON format

```jsonc
{
  "entity": "scene",
  "icon": "clapperboard",          // metadata-menu icon
  "folder": "10 Manuscript",       // where notes of this type live
  "tag": "manuscript/scene",       // the classifier tag
  "note": "One-line description of the entity.",
  "fields": [
    { "name": "storyDay", "type": "number", "description": "..." },
    { "name": "status", "type": "select", "values": ["idea","draft","done"], "description": "..." },
    { "name": "characters", "type": "list", "relation": "character", "description": "..." },
    { "name": "tags", "type": "tags", "description": "..." }
  ]
}
```

`type` is the only abstraction — it maps to metadata-menu type, template default, and the
doc note:

| `type` | metadata-menu | template default | notes |
|---|---|---|---|
| `text` | Input | `""` | |
| `number` | Number | `null` | |
| `boolean` | Boolean | `false` | |
| `select` + `values` | Select + valuesList | first value (or `default`) | |
| `fixed` + `value` | Select (single) | the value | e.g. `type: scene` |
| `relation` + `relation` | File | `""` | single `[[link]]` |
| `media` | Media | `""` | one `[[wikilink]]` to an image file (`portrait`, `image`); a link survives a rename, a path does not. `types.json` widget stays `text`. The control comes from this type — there is no `ui: image` |
| `list` + `relation` | MultiFile | `[]` | list of `[[links]]` |
| `list` (no relation) | Multi | `[]` | free multi-value |
| `tags` | — (excluded) | `[<tag>]` | classifier; not a FileClass field |

`description` is data (not a comment) — it generates the human-reference doc. FileClass
`id:`s are generated deterministically (`<prefix>-<name>`) and are internal; never hand-edit them.

## Workflow — change the schema

1. Edit `schema/<type>.json` (add/rename/remove a field, change a value list, edit a description).
2. `npm run schema:gen` — regenerate the vault artifacts.
3. `npm run schema:check && npm run typecheck && npm run lint && npm run build` — all green.
4. On a property **rename**, also update seed notes (`rg '<oldName>:' test/StoryForge`) and the
   XDD spec (`rg '<oldName>' docs/XDD`). See `docs/schema-change-runbook.md`.
5. Commit on a branch (Conventional Commits; hooks block `main`).

## Migration status

All entity types are generated from here:

- ✅ `scene`, `character`, `character-fantasy`, `location`, `object`, `lore`.

Note the generator owns the frontmatter; a template's note **body** (prose scaffolding,
meta-bind display lines) is author content — it is preserved across regeneration, and a
minimal default body is emitted only when a template does not exist yet.

## Cross-repo flow

This schema is the plugin's contract. The wider story tooling aligns to it:

```
Lauren (story dev)  ──proposal──▶  _forge (master vault template)  ──▶  StoryForge (this repo, public)
                                                                         the plugin owns + ships the schema
```

Changes flow toward the plugin; a property the plugin needs flows back as a proposal. Each
hop is diff-checked, never blind-copied.
