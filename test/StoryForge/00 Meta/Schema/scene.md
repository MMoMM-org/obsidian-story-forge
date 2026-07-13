# Scene — property reference

A manuscript scene, under `10 Manuscript/<book>/`. Facts live in frontmatter;
the prose is the body. Machine source: `00 Meta/Templates/scene.md`. Scenes are
the notes the reference panel follows: their relation fields (`pov`, `characters`,
`location`, `plotlines`) drive which canon entities the panel surfaces.

## Properties

### `type`
Fixed classifier — always `scene`. Set by the template; do not change it.

### `title`
Text. The scene's title. Should match the note title.

### `subtitle`
Text. A short logline for the scene.

### `book`
A single `[[Book note]]` link (in `20 Planning/`). Which book the scene belongs
to.

### `act`
Number. The act this scene sits in.

### `chapter`
Text. The chapter label (kept as text to allow "1a", "Prologue", etc.).

### `order`
Number. The scene's order within the book — the primary reading-order sort key.
Distinct from the manuscript order Longform maintains, and from chronology
(`storyDay`).

### `storyDay`
Number. The ordinal day the scene happens on in the story (Day 1 = 1). This drives
timeline placement and chronological sort; a relative jump is authored as
`prev + 14` ("two weeks later"). Works without any calendar. Timeline falls back to
`order` when `storyDay` is empty.

### `when`
Text. A free-text display label for the scene's time — "Day 1", "Two weeks later",
or a date. Shown on the timeline; does not affect placement (that's `storyDay`). A
calendar-aware absolute date (`storyDate`, Calendarium, two-calendar-capable) is a
planned optional addition — not part of the schema yet.

### `status`
Select — one of `idea | outline | draft | revised | done | final`. Drafting
progress; drives board columns and stats.

### `pov`
A single `[[Character]]` link — the point-of-view character. A typed relation the
panel highlights.

### `characters`
List of `[[Character]]` links present in the scene. The reference panel resolves
these to the Characters-in-scene view.

### `location`
A single `[[Location]]` link — where the scene takes place.

### `plotlines`
List of `[[plotline]]` links (in `20 Planning/`). Which story arcs this scene
advances; drives the Plotlines view.

### `arc`
Text. The character/story arc this scene advances (free text note, not a link).

### `beat`
Text — a `[[beat note]]` link in `20 Planning/`, or empty. The planning beat this
scene realises.

### `wordcount`
Number. Maintained by the word-count plugin; leave empty and let it fill in.

### `series`
Text. The series this scene belongs to.

### `tags`
List. Always includes `manuscript/scene` — how views and Bases select scene
notes.
