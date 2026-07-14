# `schema/` — canonical story-entity schema

This directory is the **single source of truth** for the story-entity frontmatter
schema the plugin reads and writes. It is part of the coding process, not test data:
every artifact below is **generated** from these JSON files.

## What it drives

One `schema/<type>.json` per entity type. `npm run schema:gen` derives, into the test
vault (`test/StoryForge/00 Meta/`), three artifacts per type:

| Generated artifact | Purpose |
|---|---|
| `Templates/<type>.md` (or `entity-<type>.md`) | author-facing frontmatter surface |
| `FileClasses/fc-<type>.md` | metadata-menu enforced schema |
| `Schema/<type>.md` | human property reference (from the `description` fields) |

`npm run schema:check` is the gate: it verifies those artifacts agree (doc headings ==
template keys == FileClass field names, minus the `tags` classifier).

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
