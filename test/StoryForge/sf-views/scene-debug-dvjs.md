---
sf-view: true
sf-version: 1
sf-name: Scene debug (DataviewJS)
sf-engine: dataviewjs
sf-description: Shows the active note's name — a safe, read-only DataviewJS debug view.
---

Displays the active note's name for debugging. Safe read-only script; does not write to the vault. Changed

```dataviewjs
dv.paragraph("Active note: " + (dv.current()?.file?.name ?? "not Indexed"));
```
