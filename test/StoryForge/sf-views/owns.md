---
sf-view: true
sf-version: 1
sf-name: Owns
sf-engine: dataview-dql
sf-description: Lists canon objects owned by the active character.
---

Lists canon objects owned by the active character.

```dataview
TABLE file.name AS Object
FROM "30 Canon/33 Objects"
WHERE contains(owner, this.file.link)
SORT file.name ASC
```
