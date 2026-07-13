# Schema — property reference

This folder is the **human-readable reference** for the `_forge` frontmatter
schema. One note per entity type explains every Property: what it means, its
type, allowed values, whether it is a `[[wikilink]]` relation, and how to use it.

## Source of truth

The **machine schema** is authoritative — these notes only describe it:

| Type | Machine source | Reference |
|---|---|---|
| character | `00 Meta/FileClasses/fc-character.md` (+ its template) | `character.md` |
| character (fantasy) | `00 Meta/FileClasses/fc-character-fantasy.md` | `character-fantasy.md` |
| location | `00 Meta/Templates/entity-location.md` | `location.md` |
| object | `00 Meta/Templates/entity-object.md` | `object.md` |
| lore | `00 Meta/Templates/entity-lore.md` | `lore.md` |
| scene | `00 Meta/Templates/scene.md` | `scene.md` |

FileClasses (metadata-menu) are the enforced schema for the types that have one;
the entity/scene **templates** carry the property surface for the rest. When you
change the schema, change the machine source **and** the matching reference note.

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
