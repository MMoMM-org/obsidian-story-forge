# Plotline — property reference

Canonical note for a story arc or plot thread, under `20 Planning/`. A plotline groups the scenes that advance a single narrative question; scenes link to it via their `plotlines` field.

## Properties

### `type`
Fixed classifier — always `plotline`. Set by the template; do not change it.

### `name`
Text. The plotline's canonical short name — used in `[[wikilinks]]` from scene notes. Should match the note title.

### `title`
Text. A longer display title for the plotline (e.g. "The Heir's Hidden Past"). Distinct from `name`, which is the wikilink handle.

### `logline`
Text. A one-sentence summary of the arc's dramatic question and stakes.

### `status`
Select — one of `seed | active | resolved | abandoned`. Current development state of the plotline: `seed` = idea only, `active` = being written, `resolved` = narrative question answered, `abandoned` = cut from the story.

### `series`
Text. The series this plotline belongs to (defaults to the vault's series name).

### `tags`
List. Always includes `planning/plotline` — how views and Bases select plotline notes.
