# Book — property reference

Canonical note for a book (volume) in the series. Scenes link here via their `book` field; the reference panel can surface book metadata alongside scene context.

## Properties

### `type`
Fixed classifier — always `book`. Set by the template; do not change it.

### `name`
Text. The book's canonical short name — used in `[[wikilinks]]` from scene notes. Should match the note title.

### `title`
Text. The full published title of the book.

### `subtitle`
Text. The subtitle, if any (e.g. "A Tale of the Forge").

### `author`
Text. Author name(s) as they will appear on the cover.

### `order`
Number. The book's position in the series reading order (1 = first). Used to sort book notes and scenes by volume.

### `status`
Select — one of `planning | drafting | revising | done`. Current production state of the book.

### `series`
Text. The series this book belongs to.

### `tags`
List. Always includes `planning/book` — how views and Bases select book notes.
