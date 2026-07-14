---
type: meta
name: "Szene anlegen (Beat → Prosa) — Workflow"
tags: [meta/doc]
---

# Szene anlegen (Beat → Prosa)

Der Übergang von der Planung zur Prosa: aus einem 🎬-Beat entstehen die einzelnen Szenen in `10 Manuscript/`. Dieses Dokument beschreibt, **wie eine Szene angelegt und verdrahtet wird** — die Kette davor steht in [[Snowflake-Prozess]], der Status-Flow danach in [[Szenen-Status]], das Gerüst des Buchs in [[Neues-Buch-Anlegen]].

> **Voraussetzung:** Für das Buch existieren die Beats (🎬) und die Outline (📋), und der Longform-Draft (`IndexV*.md`) ist eingerichtet und ausgewählt. Die Outline sagt, **welche** Szenen ein Beat abdeckt und in welcher Reihenfolge.

## Grundprinzip

Eine Szene ist eine Datei in `Chapters/V*/` mit `type: scene` und `tags: [manuscript/scene]`. Sie wird über zwei Dinge in die Struktur eingehängt: das Feld **`beat`** (Rückverweis auf den 🎬-Beat) und das Feld **`order`** (globale Lesereihenfolge). Die Beats sind die *Handlung*; die Szene ist die *Prosa* dazu — **Fakten über Figuren/Orte/Objekte gehören nicht hierher, sondern nach `30 Canon/`**.

## Anlegen

Zwei Wege, beide erzeugen die Datei nach dem sauberen Scene-Schema (`t_scene`):

- **Longform-Panel → „New Scene"** (empfohlen): trägt die Szene automatisch in die `scenes:`-Liste des aktiven Drafts ein, legt die Datei im `sceneFolder` an und wendet `sceneTemplate: t_scene` an. Das Template fragt per Suggester POV, Figuren, Ort (aus der Canon) und Status ab.
- **Template `t_scene` direkt** (`00 Meta/Templates/t_scene.md`): erzeugt dieselbe Struktur, aber ohne Longform-Eintrag — dann die Szene von Hand in die `scenes:`-Liste der `IndexV*.md` aufnehmen.

## Verdrahten (Frontmatter)

Nach dem Anlegen die Verknüpfungsfelder setzen — sie steuern Sortierung, Beat-Zuordnung und die Dataview-Tabellen (die Szenen-/Chronologie-Referenzansicht des Reference-Viewers, DESIGN §7, im Aufbau):

| Feld | Wert | Rolle |
|---|---|---|
| `book` | `"[[<Buch>]]"` | Zuordnung zum Band |
| `beat` | `"<Beat-Name>"` (String, **ohne** 🎬) | Rückverweis; die Tabelle am Fuß des Beats matcht per Textenthalten |
| `order` | Ganzzahl | globale Lesereihenfolge — treibt **jede** Szenen-Sortierung |
| `act` / `chapter` | Ganzzahl | Akt-/Kapitelnummer aus der Outline |
| `pov` | `"[[Figur]]"` | POV-Figur (einzeln) |
| `characters` | `[[Figur]]`-Liste | anwesende Figuren |
| `location` | `"[[Ort]]"` | Schauplatz |
| `day` | Gegenwart `"4 Freitag"` · Rückblende `"vor 3 Jahren"` | Zeitachse → `40 Timeline/README.md` |
| `flashback` | `true` (nur wenn Rückblende) | nimmt die Szene aus der Gegenwarts-Zählung |
| `prev` / `next` | `[[Szene]]` | Lesereihenfolge-Kette zur Nachbarszene |
| `status` | `idea` … `done` | Fortschritt → [[Szenen-Status]] |

**Wichtig zu `beat`:** Der Wert ist der reine Beat-Name als String (z. B. `"Wichtige Wendepunkte"`), **ohne** das 🎬-Präfix. Die View übergibt beim Rendern den vollen Beat-Titel (mit Emoji) und matcht per „enthält" — ein fehlendes oder abweichend geschriebenes `beat` lässt die Szene aus der Beat-Tabelle verschwinden.

## Prosa schreiben

Auf einem `claude/<slug>`-Branch. Vor dem Schreiben die **verlinkte Canon lesen** (Figuren, Orte, Objekte), damit Details stimmen. Prosa ist **Deutsch, in der Stimme des Autors** — Claude entwirft/überarbeitet, der Autor merged. Der `status` wandert dabei durch die Stufen in [[Szenen-Status]] (`idea → init → structure → draft → revise → done`).

## Vor dem Finalisieren

**`/continuity-check`** (read-only) gegen die Canon laufen lassen — prüft Widersprüche zu etablierten Fakten (Figuren-Merkmale, Timeline, Objekt-/Vertrags-Konsistenz), bevor eine Szene auf `done` geht.

## Reihenfolge kompakt

1. Outline (📋) lesen — welche Szenen deckt der Beat ab, in welcher Reihenfolge.
2. Szene anlegen (Longform „New Scene" bzw. `t_scene`).
3. Frontmatter verdrahten — v. a. `beat`, `order`, `book`, POV/Figuren/Ort.
4. `prev`/`next` zur Nachbarszene setzen.
5. Prosa schreiben (Branch, Deutsch, Autoren-Stimme) — `status` mitführen.
6. `/continuity-check` → auf `done`, Autor merged.

## Verwandt

- [[Snowflake-Prozess]] — woher die Beats kommen.
- [[Szenen-Status]] — die Status-Stufen im Detail.
- [[Neues-Buch-Anlegen]] — Draft/`sceneFolder`/`sceneTemplate`-Setup.
- [[README]] (`10 Manuscript`) — Longform-Struktur, V1/V2, Compile.
