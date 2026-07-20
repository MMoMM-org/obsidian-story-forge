---
sf-view: true
sf-version: 1
sf-name: Appears in
sf-engine: dataview-dql
sf-description: Lists manuscript scenes that reference the active character, either as point-of-view or as a named participant.
---

Lists manuscript scenes that reference the active character, either as point-of-view or as a named participant.

```dataview
TABLE file.name AS Scene, order AS Order
FROM "10 Manuscript"
WHERE contains(pov, this.file.link) OR contains(characters, this.file.link)
SORT order ASC, file.name ASC
```
