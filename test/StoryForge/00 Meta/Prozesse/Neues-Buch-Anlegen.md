---
type: meta
name: "Neues Buch anlegen — Workflow"
tags: [meta/doc]
---

# Neues Buch anlegen

Die Reihenfolge, in der ein neuer Band der Serie eingerichtet wird — von der Planung (`20 Planning/`) bis zum leeren Longform-Manuskript (`10 Manuscript/`). Das eigentliche *Plotten* danach läuft über [[Snowflake-Prozess]], das *Schreiben* der Szenen über [[Szenen-Status]]. Dieses Dokument beschreibt nur das **Gerüst**: welche Ordner und Dateien in welcher Reihenfolge entstehen.

> **Voraussetzung:** Der serienweite Rahmen in `20 Planning/00 Serie/` (Plot · Struktur · Buchtitel · Analyse) steht — daraus ergeben sich Bandnummer, Titel und grober Inhalt. Ist das nicht der Fall, zuerst dort arbeiten (Ebene 0 in [[Snowflake-Prozess]]).

## Was entsteht

`0X` = Bandnummer zweistellig (`01`, `02`, …), `20X` = Planungs-Präfix (`201` = Buch 1). `<Buch>` = sauberer Titel ohne Nummer/Sonderzeichen.

| # | Ort / Datei | `type` | Template | Zweck |
|---|---|---|---|---|
| 1 | `20 Planning/0X <Buch>/` | — | — | Planungs-Ordner des Bandes |
| 2 | `20X <Buch>` (Buch-Notiz) | `book` | — | Dashboard: Summary/Story + Szenen-Tabellen |
| 3 | `20X ❄️ <Buch>` | `snowflake` | `t_snowflake` | Snowflake-Kette → [[Snowflake-Prozess]] |
| 4 | `20X 🔍 <Buch>` | `synopsis` | `t_synopsis` | " |
| 5 | `20X 🎬 <Beat>` (mehrere) | `beat` | `t_beat` | " |
| 6 | `20X 📋 <Buch>` | `outline` | — | " |
| 7 | `10 Manuscript/0X <Buch>/` | — | — | Manuskript-Ordner des Bandes |
| 8 | `Chapters/V1/` (ggf. `V2/`) | — | — | Szenen-Dateien der Fassung |
| 9 | `IndexV1.md` (ggf. `IndexV2.md`) | — | — | Longform-Draft-Definition |
| 10 | `manuscript.md` | — | — | kompilierter Output (Compile schreibt hierher) |

## Ablauf

**Zuerst die Planung.** Ordner `20 Planning/0X <Buch>/` anlegen und darin die Buch-Notiz (`type: book`) erstellen — am einfachsten als Kopie einer bestehenden (z. B. `201 Forge - <Buchtitel>`), dann Frontmatter anpassen: `title`, `subtitle`, `book_number`, `aliases`. Die Buch-Notiz zieht `Summary::`/`Story::` per Inline-DQL aus dem Snowflake und listet die Szenen über die geteilte Szenen-/Chronologie-Referenzansicht des Reference-Viewers (DESIGN §7, im Aufbau) — sie funktioniert also erst vollständig, wenn Snowflake und Manuskript existieren, das ist normal. Ein eigenes `t_book`-Template gibt es (noch) nicht; die Notiz wird von Hand bzw. per Kopie erstellt.

**Dann die Snowflake-Kette** ❄️ → 🔍 → 🎬 → 📋 mit den jeweiligen Templates durchziehen, wie in [[Snowflake-Prozess]] beschrieben. Das ist der eigentliche Plot-Aufwand; hier nur der Vollständigkeit halber als Teil des Gerüsts genannt.

**Dann das Manuskript.** Ordner `10 Manuscript/0X <Buch>/` mit `Chapters/V1/` anlegen (eine zweite Fassung `V2/` erst, wenn ein Rework beginnt). Darin die Longform-Draft-Definition `IndexV1.md` erstellen — am besten aus einer bestehenden `IndexV1.md` kopieren und anpassen. Wichtig im `longform`-Frontmatter:

- `sceneFolder: Chapters/V1` — **relativ**, damit der Buch-Ordner verschiebbar bleibt.
- `scenes:` — die Szenen-Dateinamen in Lesereihenfolge (anfangs leer; Longform füllt beim Anlegen).
- `sceneTemplate: 00 Meta/Templates/t_scene.md` — damit neue Szenen dem sauberen Scene-Schema folgen.
- `ignoredFiles:` — Planungs-Notizen, die (historisch) im selben Ordner lagen; bei sauberer Trennung meist leer.

**Zum Schluss verdrahten.** In der Buch-Notiz die Links auf Planung und Manuskript setzen (`[[20X 📋 …]]`, `[[Buch X - Entwurf]]` o. ä.), und im Longform-Panel den Draft dieses Buchs einmal **auswählen** — das schreibt den absoluten `selectedDraftVaultPath` in `.obsidian/plugins/longform/data.json`. Erst danach greifen die Szenen-Tabellen des Reference-Viewers (DESIGN §7), die dem *aktiven* Draft folgen.

## Konventionen

- **Nummerierung:** Planungs-Dateien tragen das `20X`-Präfix (Buch 1 = `201`), Ordner das `0X`-Präfix. Buch 1 ist die Referenz für die Benennung; die früh angelegten Bücher 2–3 sind noch minimal (nur Buch-Notiz, Outline, Entwurf-Stub) und weichen teils ab.
- **Saubere Titel** in Wikilinks/`aliases`: ohne Nummer, ohne Emoji, ohne `(…)`-Suffix.
- **V1 und V2** sind zwei vollständige Fassungen desselben Buchs — beide bleiben erhalten (Details in [[README]] · `10 Manuscript`).

## Git

Auf einem `claude/<slug>`-Branch anlegen, präzise die neuen Pfade stagen (nie blind `git add -A` — der Repo trackt auch `.obsidian/`-Churn), der Autor merged. Die Draft-Auswahl in Longform verändert `.obsidian/plugins/longform/data.json`; diese Änderung bewusst behandeln (mit-committen oder verwerfen), nicht versehentlich mitnehmen.

## Verwandt

- [[Snowflake-Prozess]] — die Plot-Kette, die dieses Gerüst füllt.
- [[Szenen-Status]] — der Status-Flow der einzelnen Szenen im Manuskript.
- [[README]] (`20 Planning`) und [[README]] (`10 Manuscript`) — Strukturüberblick beider Zonen.
