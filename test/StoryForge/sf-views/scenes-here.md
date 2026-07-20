---
sf-view: true
sf-version: 1
sf-name: Scenes here
sf-engine: dataview-dql
sf-description: Lists manuscript scenes set in the active location.
---

Lists manuscript scenes set in the active location.

```dataview
TABLE file.name AS Scene, order AS Order
FROM "10 Manuscript"
WHERE contains(location, this.file.link)
SORT order ASC, file.name ASC
```
