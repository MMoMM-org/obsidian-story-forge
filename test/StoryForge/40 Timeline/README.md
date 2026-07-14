---
type: meta
name: "40 Timeline — README"
tags: [meta/doc]
---

# 40 Timeline/ — Chronology

> The **series-wide** timeline: when something happens, in what order. **Write-zone:** read-only — changes are proposed, not written directly (like `30 Canon/`). `/continuity-check` reads this zone for the order check.

## Time model: one axis, two forms

The story counts **relatively**, not in absolute calendar dates — as most fiction does (book 2 is "the first week", not a concrete date). A scene's `day` field sits on **one** timeline and, depending on `flashback`, takes two forms:

- **Present** — `day: "<n> <weekday>"`, e.g. `"4 Friday"`. `n` is a **series-wide running** day counter (gaps allowed when a day has no scene). The first present-day of the series is `1`.
- **Flashback** — `flashback: true`, `day: "<N> years|months|weeks|days ago"` (e.g. `"3 years ago"`). Sorted as a **negative offset** before the present; without such a value, the flashback falls back to `order`.

## How scenes dock in

Scene frontmatter: `day` (timeline, forms as above), `flashback` (bool), `order` (reading/fine order within the same point in time). A chronicle view sorts flashbacks (furthest first) → present by `n`. Rendering is handled by the reference/chronicle viewer (DESIGN §7); until a dedicated viewer exists, the model already carries the order check of `/continuity-check`.

## Calendarium (optional, later)

An absolute, Gregorian Calendarium would need an **anchor**: day 1 = a concrete date. Because the story counts relatively, this anchor is a story decision by the author — until then, the relative model above is the source of truth.

## Related

- `00 Meta/Processes/Continuity-Check.md` — uses this zone for the time check.
- `00 Meta/Processes/Create-Scene.md` — the scene's `day` field.
