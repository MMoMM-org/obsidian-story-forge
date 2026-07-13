# Schema — property reference

This folder is the **human-readable reference** for the `_forge` frontmatter
schema. One note per entity type explains every Property: what it means, its
type, allowed values, whether it is a `[[wikilink]]` relation, and how to use it.

## Source of truth

The **machine schema** is authoritative — these notes only describe it. Every
type has a metadata-menu FileClass (enforced schema) plus an entity/scene
template (the author-facing property surface); the two are kept in agreement:

| Type | FileClass | Template | Reference |
|---|---|---|---|
| character | `fc-character.md` | `entity-character.md` | `character.md` |
| character (fantasy) | `fc-character-fantasy.md` | — (extends fc-character) | `character-fantasy.md` |
| location | `fc-location.md` | `entity-location.md` | `location.md` |
| object | `fc-object.md` | `entity-object.md` | `object.md` |
| lore | `fc-lore.md` | `entity-lore.md` | `lore.md` |
| scene | `fc-scene.md` | `scene.md` | `scene.md` |

(FileClasses live in `00 Meta/FileClasses/`, templates in `00 Meta/Templates/`.)
When you change the schema, change the machine source **and** the matching
reference note.

## Staying in sync

`npm run schema:check` (in the plugin repo) fails if any reference note drifts
from its machine source — an undocumented Property, or a documented Property that
no longer exists. Run it after any schema edit.

## Conventions

- Each Property is documented under a `### \`property\`` heading (the checker keys
  off these).
- **Facts live in frontmatter**; prose lives in the note body. The reference
  panel and Bases/Dataview views read the frontmatter — keep it clean.
- **Relations are `[[wikilinks]]`** in the frontmatter (single value or a list),
  never free text, so they resolve as links.
