---
sf-view: true
sf-version: 1
sf-name: Inhabitants
sf-engine: dataview-dql
sf-description: Lists characters who inhabit the active location. Because inhabitants is stored on the location note itself, this view reads this.inhabitants directly (forward-field form) rather than a reverse contains() query.
---

Lists characters who inhabit the active location.

```dataview
TABLE file.name AS Character
FLATTEN this.inhabitants AS inhabitant
WHERE file.link = inhabitant
SORT file.name ASC
```
