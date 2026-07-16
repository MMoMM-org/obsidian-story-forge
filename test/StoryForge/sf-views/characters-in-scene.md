---
sf-view: true
sf-version: 1
sf-name: Characters in scene
sf-engine: dataview-dql
---

Lists all canon characters linked from the active scene note.

```dataview
TABLE file.name AS Character
FROM [[this]]
WHERE contains(tags, "canon/character")
SORT file.name ASC
```
