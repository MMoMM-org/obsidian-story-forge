---
sf-view: true
sf-version: 1
sf-name: Scenes with this note
sf-engine: dataview-dql
sf-description: Scenes that name the open note as point of view, a character, the location or a plotline.
---

Scenes that name the open note as their point of view, one of their characters, their location
or one of their plotlines, in story order. Open a character, a place or a plotline to see where
it appears.

```dataview
TABLE WITHOUT ID file.link AS Scene, storyDay AS "Story day", status AS Status, pov AS POV
FROM #manuscript/scene
WHERE contains(pov, this.file.link) OR contains(characters, this.file.link) OR contains(location, this.file.link) OR contains(plotlines, this.file.link)
SORT storyDay ASC, file.name ASC
```
