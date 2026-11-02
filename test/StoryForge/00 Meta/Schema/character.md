# Character — property reference

Canonical note for a person in the story, under `30 Canon/31 Characters/`.

## Properties

### `type`
Fixed classifier — always `character`. Set by the template; do not change it.

### `name`
Text. The character's canonical full name. Should match the note title so `[[wikilinks]]` resolve cleanly.

### `aliases`
List of text. Other names the character is known by (maiden name, title). Obsidian treats these as note aliases, so `[[alias]]` links resolve to this note.

### `nickname`
Text. A single informal name used in prose (e.g. "Spark").

### `role`
Select — one of `protagonist | deuteragonist | antagonist | supporting | minor`. The character's narrative weight across the series.

### `status`
Select — one of `alive | dead | missing | unknown`. Current canonical state; a continuity fact the checker can reason over.

### `age`
Number. Age in years, or empty if unknown/irrelevant.

### `gender`
Select — one of `male | female | diverse | non-binary`.

### `occupation`
Text. What the character does (job, calling).

### `height`
Number. Height in **cm**. A hard physical fact, so it is continuity-checkable and can render in the Meta Bind stat line.

### `build`
Text. Body type (e.g. "slim, wiry").

### `hair`
Text. Hair description (colour, length).

### `eyes`
Text. Eye colour.

### `distinctive_features`
List of text. Signature, recurring identifiers (scars, tattoos) — the details that must stay consistent across scenes.

### `tagline`
Text. One-line hook capturing the character in a sentence.

### `portrait`
Media. Optional `[[wikilink]]` to the portrait image with its full vault path (e.g. `[[95 Assets/Mara Stoneway.svg]]`), which Meta Bind's image view needs — a link, so it survives a rename. Shown on the portrait tile and Codex Cards; a bare vault path or URL still displays. Meta Bind `VIEW[{portrait}][image]` renders it with that full path.

### `significant_other`
List of `[[Character]]` links. Spouse / love interest. A typed relation — always wikilinks, so the relationship map and reference panel can resolve it.

### `family`
List of `[[Character]]` links. Parents, children, siblings (state the exact role in prose).

### `friends`
List of `[[Character]]` links.

### `allies`
List of `[[Character]]` links. Non-friend allies (political, situational).

### `enemies`
List of `[[Character]]` links.

### `first_appearance`
Text — a `[[scene note]]` link. The scene where the character first appears.

### `series`
Text. The series this canon belongs to (defaults to the vault's series name).

### `tags`
List. Always includes `canon/character` — this is how views and Bases select character notes. Add further tags freely.
