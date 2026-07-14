---
type: meta
name: "Continuity-Check — Workflow"
tags: [meta/doc]
---

# Continuity-Check

Der Abgleich einer Entwurfsszene gegen den **Canon**, bevor sie finalisiert wird — prüft Widersprüche zwischen Prosa und etablierten Fakten. Ausgeführt wird er über den Skill **`/continuity-check`** (liegt in `../_forge/skills/`, read-only); dieses Dokument ordnet ihn in den Schreib-Flow ein. Mechanik und Prüfregeln sind im Skill die Quelle der Wahrheit.

> **Read-only:** Der Check **ändert nie** Prosa oder Canon. Er liefert eine nach Schwere sortierte Fundliste. Fixes werden vorgeschlagen (Diff oder Notiz in `90 Inbox/`), nicht geschrieben — `30 Canon/`/`40 Timeline/` bleiben Write-Zone-geschützt.

## Wann

Vor dem Schritt einer Szene auf `status: done` (→ [[Szenen-Status]]) — der letzte Schritt in [[Szene-Anlegen]]. Außerdem jederzeit, wenn du wissen willst, ob ein Entwurf etablierten Fakten widerspricht. Trigger: `/continuity-check`, „continuity check", „check this scene against canon".

## Was hinein- und herauskommt

- **Ziel:** eine Szenen-Notiz in `10 Manuscript/` (oder ein Kapitel / eine Spanne).
- **Canon:** alles unter `30 Canon/` und `40 Timeline/`.
- **Ergebnis:** eine gerankte Fundliste (blocker / inconsistency / nit) — je Fund: Fundstelle im Entwurf, die widersprochene Canon-Notiz, der konkrete Konflikt. Keine Edits.

## Was geprüft wird

Aus den `[[wikilinks]]` und dem Frontmatter der Szene (`characters`, `location`, `pov`, `beat`) werden die verlinkten Canon-Notizen aufgelöst und deren Fakten geladen. Geprüft wird mindestens:

- **Figurenverhalten** konsistent mit etablierter `role` / Merkmalen / Beziehungen.
- **Physische Fakten** (Aussehen, Alter, Namen, Besitz) stimmen mit der Canon überein.
- **Timeline:** Ereignisse widersprechen nicht der Ordnung in `40 Timeline/` oder früheren Szenen.
- **Objekte/Verträge:** in der Prosa zitierte Bedingungen decken sich mit der Notiz in `33 Objects/`.
- **Namen/Aliase** korrekt verwendet (kein Drift, kein falscher Alias).

**Canon-Lücke statt Widerspruch:** Fehlt ein Fakt in der Canon (statt widersprochen zu werden), wird er als *„canon gap"* gemeldet — **nicht erfunden**. Eine fehlende Angabe ist ein Fund, keine Auffüllung.

## Aktuelle Einschränkung

`40 Timeline/` existiert als **relatives Tag-Modell** (das Timeline-Modell in `40 Timeline/README.md`, abgeleitet aus den `day`-Feldern) — noch **kein** absolutes Calendarium. Die Zeitprüfung stützt sich daher auf `day`, `order`, `prev`/`next` und die Tag↔Wochentag-Zuordnung in `40 Timeline/README.md`.

## Nach dem Check

Bei Funden: Prosa auf dem Branch korrigieren und erneut prüfen. Betrifft ein Fund die **Canon** (z. B. ein Fakt muss ergänzt/geändert werden), nicht direkt in `30 Canon/` schreiben, sondern als Vorschlag (Diff) bzw. Notiz in `90 Inbox/` festhalten — der Autor pflegt die Canon.

## Verwandt

- [[Szene-Anlegen]] — der Schreib-Flow, dessen letzter Schritt dieser Check ist.
- [[Szenen-Status]] — `done` wird erst nach bestandenem Check gesetzt.
