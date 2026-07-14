---
type: meta
name: "Szenen-Status — Workflow"
tags: [meta/doc]
---

# Szenen-Status

Das Feld `status` einer Szene (`10 Manuscript/…`, im Frontmatter) markiert, wie weit sie im Schreibprozess ist. **Kanonische Reihenfolge:**

## `idea → init → structure → draft → revise → done`

| Stufe | Bedeutung |
|---|---|
| `idea` | nur Konzept/Notiz, noch kein Inhalt |
| `init` | angelegt, Rohmaterial vorhanden — **noch nicht überarbeitet** |
| `structure` | strukturiert/geordnet — Aufbau steht |
| `draft` | ausformulierter Prosa-Entwurf |
| `revise` | in Überarbeitung |
| `done` | fertig |

## Setzen & Weiterschalten
- **metadata-menu:** `status` ist ein Select — direkt in der Property (Dropdown) oder via Befehl „Metadata Menu: Update status" (Hotkey empfohlen).
- **QuickAdd:** „Szene: Status setzen" (Suggester) oder „Szene: Status weiterschalten" (bumpt eine Stufe weiter).
Beide als Befehle Hotkey-bindbar.

## Quelle der Wahrheit
Dieses Dokument definiert das Status-Vokabular. Der Wert ist an mehreren Stellen kodiert — bei Änderung **alle** angleichen:
- `00 Meta/FileClasses/fc-scene.md` — Enum-Reihenfolge im Dropdown
- `00 Meta/Templates/t_scene.md` — Suggester beim Anlegen
- `00 Meta/Scripts/scene-status-*.js` — QuickAdd-Actions (die `STATUS`-Liste bestimmt das „Weiterschalten")

