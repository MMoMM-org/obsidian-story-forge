# Location — property reference

Canonical note for a place, under `30 Canon/32 Locations/`. Machine source: `00 Meta/Templates/entity-location.md`.

## Properties

### `type`
Fixed classifier — always `location`. Set by the template; do not change it.

### `name`
Text. The location's canonical name. Should match the note title.

### `aliases`
List of text. Other names for the place.

### `world`
A single `[[Location]]` link to the parent place, forming a hierarchy (room → building → area → world). Leave empty for a top-level location. The hierarchical Locations view walks this chain.

### `locationType`
Select — one of `world | realm | area | landmark | building | room`. The tier in the place hierarchy; pair it with `world` to nest correctly.

### `region`
Text. A human-readable region/address that need not be its own note.

### `inhabitants`
List of `[[Character]]` links. Characters who live in or are strongly associated with this place. A typed relation — always wikilinks.

### `first_appearance`
Text — a `[[scene note]]` link. The scene where the location first appears.

### `series`
Text. The series this canon belongs to.

### `tags`
List. Always includes `canon/location` — how views and Bases select location notes.
