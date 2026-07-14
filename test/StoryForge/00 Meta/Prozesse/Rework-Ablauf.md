---
type: meta
name: "Rework-Ablauf (Überarbeitung) — Workflow"
tags: [meta/doc]
---

# Rework-Ablauf (Überarbeitung)

Wie eine bestehende Fassung eines Buchs überarbeitet wird — von der Stilanalyse über die kapitelweise Überarbeitungsplanung bis zur neuen Draft-Fassung. Das Anlegen einzelner Szenen steht in [[Szene-Anlegen]], die Status-Stufen in [[Szenen-Status]]; hier geht es um die **Revision** einer schon geschriebenen Fassung.

> **Grundsatz — verlustfrei:** Die alte Fassung bleibt erhalten. Ein Buch hat **zwei vollständige Longform-Drafts** — `V1` (Original) und `V2` (Rework) — beide unter `Chapters/V1|V2/` mit eigener `IndexV*.md`. Der Rework schreibt **V2**, ohne V1 anzutasten (Details zu Drafts: [[README]] · `10 Manuscript`).

## Die Artefakte

| Rolle | Notiz / Ort | `type` |
|---|---|---|
| Zielstimme | `00 Meta/Writing Style.md` | (meta) |
| Ist-Analyse | `Buch N - Stilanalyse` (`20 Planning/0N …`) | `analysis` |
| Überarbeitungsplan | `Buch N - Kapitel-Überarbeitung` (`20 Planning/0N …`) | `revision` |
| alte Fassung | `Chapters/V1/` + `IndexV1.md` | `scene` |
| neue Fassung | `Chapters/V2/` + `IndexV2.md` | `scene` |

## Ablauf

**1. Stilanalyse** (`type: analysis`). Die bestehende Fassung gegen die Zielstimme in `00 Meta/Writing Style.md` halten: Tonfall, Satzbau, Perspektive, Wiederholungen, Figuren-/Dialog-Qualität. Einträge werden **datiert** (`## JJJJ-MM-TT`), damit mehrere Analyse-Runden nachvollziehbar bleiben. Ergebnis: was trägt, was muss sich ändern.

**2. Überarbeitungsplan** (`type: revision`). Kapitelweise festhalten, *was* konkret geändert wird — am besten mit **Beispielpassagen** (Vorher/Nachher bzw. „so soll die Szene klingen"). Das ist die Arbeitsvorlage für den eigentlichen Rewrite, kein Prosa-Ersatz.

**3. Rewrite in V2.** Fassung `V2` anlegen (falls noch nicht vorhanden: `Chapters/V2/` + `IndexV2.md`, siehe [[Neues-Buch-Anlegen]] · Longform-Teil). Dann **Szene für Szene** nach dem Plan überarbeiten — auf einem `claude/<slug>`-Branch, **Deutsch in der Stimme des Autors**. Die überarbeitete Szene steht auf `status: revise` (→ [[Szenen-Status]]), bis sie sitzt. V1 bleibt unberührt.

**4. Continuity-Check.** Jede überarbeitete Szene vor `done` mit **`/continuity-check`** gegen die Canon prüfen (→ [[Continuity-Check]]) — ein Rewrite kann leicht Fakten verschieben.

**5. Abschluss.** Der Autor merged. Beide Fassungen bleiben erhalten; zum Kompilieren im Longform-Panel den gewünschten Draft (`V2`) auswählen. Welche Fassung „gilt", entscheidet der Autor — der Vault hält beide.

## Reihenfolge kompakt

1. **Stilanalyse** (`analysis`) — Ist gegen `Writing Style` halten, datiert.
2. **Überarbeitungsplan** (`revision`) — kapitelweise, mit Beispielpassagen.
3. **Rewrite in V2** — Szene für Szene, `status: revise`, Branch, Autoren-Stimme.
4. **`/continuity-check`** je Szene → `done`.
5. **Autor merged** — V1 + V2 bleiben, Draft-Auswahl steuert den Compile.

## Verwandt

- [[Szene-Anlegen]] · [[Szenen-Status]] — Szenen-Handhabung und der `revise`-Status.
- [[Continuity-Check]] — Faktenabgleich nach dem Rewrite.
- `00 Meta/Writing Style.md` — die Zielstimme, an der sich der Rework misst.
