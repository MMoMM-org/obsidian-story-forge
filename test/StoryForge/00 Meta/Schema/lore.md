# Lore — property reference

Canonical note for a world rule, concept, faction, or custom, under
`30 Canon/34 Lore/`. Machine source: `00 Meta/Templates/entity-lore.md`.

## Properties

### `type`
Fixed classifier — always `lore`. Set by the template; do not change it.

### `name`
Text. The lore entry's canonical name. Should match the note title.

### `aliases`
List of text. Other names for the concept.

### `scope`
Select — e.g. `world rule | concept | faction | custom`. What kind of lore this
is.

### `related`
List of `[[wikilinks]]` to any related canon notes (characters, locations,
objects, or other lore). A loose typed relation — always wikilinks — for
cross-referencing.

### `first_appearance`
Text — a `[[scene note]]` link. The scene where the lore first surfaces.

### `series`
Text. The series this canon belongs to.

### `tags`
List. Always includes `canon/lore` — how views and Bases select lore notes.
