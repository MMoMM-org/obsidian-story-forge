---
sf-view: true
sf-version: 1
sf-name: Plotline scenes
sf-engine: dataview-dql
sf-description: Lists manuscript scenes that belong to the active plotline, sorted by scene order.
---

Lists manuscript scenes that belong to the active plotline, sorted by scene order.

```dataview
TABLE file.name AS Scene, order AS Order
FROM "10 Manuscript"
WHERE contains(plotlines, this.file.link)
SORT order ASC, file.name ASC
```
