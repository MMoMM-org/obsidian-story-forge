# Schema — property reference

This folder is the human-readable reference for your story's Properties. One note per
entity type explains every Property: what it means, its type, its allowed values, and
whether it is a `[[wikilink]]` relation.

## Entity types

Every type has a metadata-menu FileClass (the enforced schema) and, except where noted,
a template (the Properties a new note starts with). The two agree, and the reference note
here describes them:

| Type | FileClass | Template | Reference |
|---|---|---|---|
| `book` | `fc-book.md` | `entity-book.md` | `book.md` |
| `character-fantasy` | `fc-character-fantasy.md` | — (extends `fc-character`) | `character-fantasy.md` |
| `character` | `fc-character.md` | `entity-character.md` | `character.md` |
| `location` | `fc-location.md` | `entity-location.md` | `location.md` |
| `lore` | `fc-lore.md` | `entity-lore.md` | `lore.md` |
| `object` | `fc-object.md` | `entity-object.md` | `object.md` |
| `plotline` | `fc-plotline.md` | `entity-plotline.md` | `plotline.md` |
| `scene` | `fc-scene.md` | `scene.md` | `scene.md` |

FileClasses live in `00 Meta/FileClasses`, templates in `00 Meta/Templates`.
A FileClass finds its notes by tag (or by a note's `fileClass` Property), so your
notes can live in any folder.

## Conventions

- Each Property is documented under a `` ### `property` `` heading.
- **Facts live in frontmatter**; prose lives in the note body. The reference panel and
  Bases/Dataview views read the frontmatter, so keep it clean.
- **Relations are `[[wikilinks]]`** in the frontmatter (single value or a list), never
  free text, so they resolve as links.
