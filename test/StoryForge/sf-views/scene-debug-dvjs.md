---
sf-view: true
sf-version: 1
sf-name: Scene debug (DataviewJS)
sf-engine: dataviewjs
---

Displays the active note's name for debugging. Safe read-only script; does not write to the vault.

```dataviewjs
dv.paragraph("Active note: " + (dv.current()?.file?.name ?? "not indexed"));
```
