---
type: meta
name: "Snowflake-Prozess — Workflow"
tags: [meta/doc]
---

# Snowflake-Prozess

Wie ein Buch geplottet wird — **von grob nach fein**, jede Stufe verfeinert die vorige. Die Dokumente liegen in `20 Planning/0X <Buch>/` und tragen ein Emoji-Präfix, das die Stufe markiert (❄️🔍🎬📋). Dieses Dokument definiert die **Reihenfolge** der Bearbeitung; das Vokabular der Stufen und die Ordnerstruktur stehen in [[README]] (`20 Planning`).

> Snowflake ist **iterativ**, nicht linear: Wenn dir auf einer späten Stufe etwas auffällt, geh zurück und korrigiere die frühere Stufe. Die Reihenfolge unten ist die *erste* Richtung — keine Einbahnstraße.

## Die Kette auf einen Blick

| # | Stufe | Dokument | `type` | Template | Ort |
|---|---|---|---|---|---|
| 0 | Serie | Plot · Struktur · Buchtitel · Analyse | `plot` / `structure` / … | — | `20 Planning/00 Serie/` |
| 1 | ❄️ Snowflake | `20X ❄️ <Buch>` | `snowflake` | `t_snowflake` | `20 Planning/0X <Buch>/` |
| 2 | 🔍 Synopsis | `20X 🔍 <Buch>` | `synopsis` | `t_synopsis` | `20 Planning/0X <Buch>/` |
| 3 | 🎬 Beats | `20X 🎬 <Beat>` (mehrere) | `beat` | `t_beat` | `20 Planning/0X <Buch>/` |
| 4 | 📋 Outline | `20X 📋 <Buch>` | `outline` | — | `20 Planning/0X <Buch>/` |
| 5 | Buch-Notiz | `20X <Buch>` (Dashboard) | `book` | — | `20 Planning/0X <Buch>/` |
| → | Prosa | Szenen | `scene` | `t_scene` | `10 Manuscript/0X <Buch>/` |

Aus dieser Arbeit speist sich die aufgeräumte **Serien-Bibel** in `00 Meta/`; die **Entitäts-Fakten** (Figuren, Orte, Objekte) wandern nach `30 Canon/`.

---

## Ebene 0 — Serie (einmal, vorab)

Bevor ein einzelnes Buch geplottet wird, steht der serienweite Rahmen in `20 Planning/00 Serie/`. 

Reihenfolge:

1. **Serie - Plot** (`type: plot`) — der Handlungsbogen über alle Bände.
2. **Serie - Struktur** (`type: structure`) — wie sich der Bogen auf die Bücher verteilt.
3. **Serie - Buchtitel** (`type: titles`) — Arbeitstitel je Band.
4. **Serie - Analyse** (`type: analysis`) — begleitende Auswertung.

Diese Notizen sind `status: reference`. Ändert sich hier etwas Grundlegendes, danach die Bibel in `00 Meta/` nachziehen.

---

## Stufe 1 — ❄️ Snowflake

- **Datei:** `20 Planning/0X <Buch>/20X ❄️ <Buch>.md`
- **Template:** `t_snowflake`
- **type:** `snowflake`

Die vier klassischen Snowflake-Schritte in *einer* Datei, in dieser Reihenfolge:

1. **One Sentence Summary** → Feld `Summary::`. 
	1. Ein Satz, < 15 Wörter, keine Figurennamen.
2. **The Story** → Feld `Story::`.
	1. Ein Absatz (~5 Sätze): Setup · 3 Wendepunkte · Auflösung.
3. **The Main Characters** → Feld `MainCharacters::` als `[[Wikilinks]]`. 
	1. Je Hauptfigur ein kurzer Steckbrief (Ziel, Motivation, Konflikt, Epiphanie).
4. **The Main Plot** → der Absatz aus (2) auf ~eine Seite ausgebaut (ein Absatz je Satz).

**Fertig genug für die nächste Stufe,** wenn `The Main Plot` steht — die Synopsis baut direkt darauf auf. `Summary::`/`Story::` speisen außerdem die Buch-Notiz (Dashboard) und die Bibel.

## Stufe 2 — 🔍 Synopsis

- **Datei:** `20X 🔍 <Buch>.md`
- **Template:** `t_synopsis`
- **type:** `synopsis`

Verlinkt per Property `snowflake:` zurück und **embeddet** `![[… ❄️ …#The Main Plot]]` als Ausgangspunkt.

Aufgabe: jeden Absatz des Main Plot auf ~eine Seite ausbauen (`The Synopsis`).

Hier fallen die strukturellen Entscheidungen — Logiklücken, die hier auftauchen, zurück in **Stufe 1** korrigieren.

## Stufe 3 — 🎬 Beats

- **Dateien:** `20X 🎬 <Beat-Name>.md`
	- — **mehrere**, eine je Beat/Akt
- **Template:** `t_beat`
- **type:** `beat`

Aus der Synopsis die Beats herausarbeiten. Beispiel Buch 1: `🎬 Einleitung`, `🎬 Katalysierendes Ereignis`, `🎬 Spannungen aufbauen`, `🎬 Konflikt und Dynamikwechsel`, `🎬 Wichtige Wendepunkte`.

Jeder Beat trägt:

- **Setting** (Ort `[[…]]`, Zeit, Atmosphäre, `Date::` für die Timeline),
- **Characters Involved** (Rolle · Motivation · Entwicklung),
- **Scene → Sequel:** Goal → Conflict → Disaster, dann Reaction → Dilemma → Decision,
- **Plot Points** — die Kapitel, die dieser Beat abdeckt.

Beats haben einen eigenen `status` (idea/draft/revise …) und sind die **Brücke zur Prosa**:

Szenen in `10 Manuscript/` verweisen per `beat::` zurück; die Dataview-Tabelle am Fuß jedes Beats listet sie automatisch.

## Stufe 4 — 📋 Outline

- **Datei:** `20X 📋 <Buch>.md`
- **type:** `outline`

Die Kapitel-Outline: **verlinkt alle 🎬-Beats** in Lesereihenfolge und listet je Beat die Kapitel mit ein, zwei Zeilen Inhalt + POV. Das ist die Kapitel-Landkarte, aus der die Szenen im Manuskript entstehen.

## Stufe 5 — Buch-Notiz (Dashboard)

- **Datei:** `20X <Buch>.md` (ohne Emoji)
- **type:** `book`

Kein Bearbeitungsschritt im engeren Sinn, sondern die **Übersicht**: zieht `Summary::`/`Story::` aus dem Snowflake, listet per Dataview die Kapitel-Szenen und ihren Status (die Szenen-/Chronologie-Referenzansicht des Reference-Viewers, DESIGN §7, im Aufbau). Von hier steuert man das Buch.

---

## Von Beats zu Prosa (Übergang nach `10 Manuscript/`)

Die 🎬-Beats **leiten** die Szenen an — sie werden nicht selbst zu Prosa. Sobald geschrieben wird, entstehen Szenen in `10 Manuscript/0X <Buch>/` (`type: scene`, `t_scene`) mit eigenem Status-Flow → [[Szenen-Status]]. **Handlung** gehört in Beats/Szenen, **Entitäts-Fakten** (Figuren, Orte, Objekte) nach `30 Canon/` — nicht vermischen.

Vor dem Finalisieren einer Szene: **`/continuity-check`** (read-only) gegen den Canon.

## Reihenfolge kompakt

1. **Serie** (00 Serie) — Plot → Struktur → Buchtitel → Analyse *(einmal)*
2. **❄️ Snowflake** — Satz → Absatz → Figuren → Main Plot
3. **🔍 Synopsis** — Main Plot je Absatz auf eine Seite
4. **🎬 Beats** — je Beat: Setting · Figuren · Scene/Sequel · Plot Points
5. **📋 Outline** — Beats + Kapitel in Lesereihenfolge
6. **Buch-Notiz** — Dashboard pflegt sich selbst
7. **10 Manuscript** — Szenen schreiben (eigener Status-Flow) → Continuity-Check

> **Immer rückkoppeln:** neue Erkenntnis auf einer Stufe → frühere Stufe nachziehen.
