---
sf-view: true
sf-version: 1
sf-name: Book scenes
sf-engine: dataview-dql
sf-description: Lists all manuscript scenes that belong to the active book, sorted by scene order.
---

Lists all manuscript scenes that belong to the active book, sorted by scene order.

```dataview
TABLE file.name AS Scene, order AS Order
FROM "10 Manuscript"
WHERE contains(book, this.file.link)
SORT order ASC, file.name ASC
```
