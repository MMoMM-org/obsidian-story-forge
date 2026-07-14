---
type: meta
name: "40 Timeline — README"
tags: [meta/doc]
---

# 40 Timeline/ — Chronologie

> Die **serienweite** Zeitachse: wann etwas passiert, in welcher Reihenfolge. **Write-Zone:** read-only — Änderungen werden vorgeschlagen, nicht direkt geschrieben (wie `30 Canon/`). `/continuity-check` liest diese Zone für die Reihenfolge-Prüfung.

## Zeit-Modell: eine Achse, zwei Formen

Die Story rechnet **relativ**, nicht in absoluten Kalenderdaten — das tut die meiste Fiction (Buch 2 heißt „die erste Woche", kein konkretes Datum). Das Feld `day` einer Szene liegt auf **einer** Zeitachse und hat je nach `flashback` zwei Formen:

- **Gegenwart** — `day: "<n> <Wochentag>"`, z. B. `"4 Freitag"`. `n` ist ein **serienweit fortlaufender** Tageszähler (Lücken erlaubt, wenn ein Tag keine Szene hat). Der erste Gegenwarts-Tag der Serie ist `1`.
- **Rückblende** — `flashback: true`, `day: "vor <N> Jahren|Monaten|Wochen|Tagen"` (z. B. `"vor 3 Jahren"`). Sortiert als **negativer Offset** vor der Gegenwart; ohne solche Angabe fällt die Rückblende auf `order` zurück.

## Wie Szenen andocken

Szene-Frontmatter: `day` (Zeitachse, Formen s. o.), `flashback` (bool), `order` (Lese-/Feinreihenfolge innerhalb desselben Zeitpunkts). Eine Chronik-Ansicht sortiert Rückblenden (fernste zuerst) → Gegenwart nach `n`. Das Rendern übernimmt der Referenz-/Chronik-Viewer (DESIGN §7); bis ein dedizierter Viewer steht, trägt das Modell schon die Reihenfolge-Prüfung von `/continuity-check`.

## Calendarium (optional, später)

Ein absolutes, gregorianisches Calendarium bräuchte einen **Anker**: Tag 1 = ein konkretes Datum. Weil die Story relativ zählt, ist dieser Anker eine Story-Entscheidung des Autors — bis dahin ist das relative Modell oben die Quelle der Wahrheit.

## Verwandt

- `00 Meta/Prozesse/Continuity-Check.md` — nutzt diese Zone für die Zeitprüfung.
- `00 Meta/Prozesse/Szene-Anlegen.md` — das `day`-Feld der Szene.
