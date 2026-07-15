---
title: "Context list — kind filter (All / character / scene …)"
status: idea
raised: 2026-07-15
target-milestone: M2
raised-by: Marcus (live testing of M1 panel)
related-spec: 001-core-infrastructure
---

# Idea: kind filter on the resolved-context list

## What

On the resolved-context view (mockup states S6/S7), add a **dropdown filter**
aligned to the **right edge of the header row** — the row that currently reads
`resolved context (stub)` — vertically in the same column as the per-row `kind`
labels below it (`character`, `scene`, …).

The dropdown filters the listed entities by kind:

```
resolved context                    [ All ▾ ]     ← filter, right-aligned
  pov          Mara Stoneway              character
  characters   Tobias Ferro               character
  location     Moonharbor Light           location
  plotlines    The Dying Light            plotline
```

Options: `All` + one entry per kind actually present in the current context
(character / location / object / lore / scene / plotline). Selecting a kind hides
the other rows.

## Why it's M2, not M1/M3

- **Not M1:** the M1 body is `StubContextTab` — a throwaway read-only dump that
  **M2 replaces entirely** with real query-engine-backed views. A filter built on
  the stub now would be discarded work.
- **Not the M3 `‹ pill ›`:** the M3 category navigation (S10) switches the
  **focused/drilled-in subject's** category, it does **not** filter the current
  note's outgoing-relation list. This idea is a genuinely separate control.
- **Natural home = M2:** once the real Context view renders the entities, a
  kind filter over a potentially long relation list gives real value, and the
  header row is the right place for it.

## Design notes / open questions

- Right-align on the context header row, same column as the row `kind` labels.
- Only show the control when there is >1 kind present? (Avoid a useless "All"
  dropdown for a single-kind note.)
- Does the filter state persist across note switches (like the selected tab
  does), or reset per note? Lean: reset per note in M2, revisit if annoying.
- Interaction with M3 backlinks/"appears in": does the filter also scope
  backlinks once they exist? (Probably yes — decide during M3.)

## Pointers

- Interface source of truth: `docs/XDD/specs/001-core-infrastructure/mockups.html`
  (S6/S7 for the target row; S10 for the *different* M3 category nav).
- Current stub renderer: `src/views/StubContextTab.ts` (to be superseded in M2).
- Kinds enum: `EntityKind` in `src/scoping/NoteContext.ts`.
