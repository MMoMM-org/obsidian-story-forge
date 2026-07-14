---
type: meta
name: "Rework flow (revision) — Workflow"
tags: [meta/doc]
---

# Rework flow (revision)

How an existing version of a book is revised — from style analysis, through chapter-by-chapter revision planning, to the new draft version. Creating individual scenes is covered in [[Create-Scene]], the status stages in [[Scene-Status]]; this is about the **revision** of an already-written version.

> **Principle — lossless:** The old version is kept. A book has **two complete Longform drafts** — `V1` (original) and `V2` (rework) — both under `Chapters/V1|V2/` with their own `IndexV*.md`. The rework writes **V2** without touching V1 (draft details: [[README]] · `10 Manuscript`).

## The artifacts

| Role | Note / location | `type` |
|---|---|---|
| Target voice | `00 Meta/Writing Style.md` | (meta) |
| Current-state analysis | `Book N - Style Analysis` (`20 Planning/0N …`) | `analysis` |
| Revision plan | `Book N - Chapter Revision` (`20 Planning/0N …`) | `revision` |
| Old version | `Chapters/V1/` + `IndexV1.md` | `scene` |
| New version | `Chapters/V2/` + `IndexV2.md` | `scene` |

## Flow

**1. Style analysis** (`type: analysis`). Hold the existing version against the target voice in `00 Meta/Writing Style.md`: tone, sentence structure, perspective, repetitions, character/dialogue quality. Entries are **dated** (`## YYYY-MM-DD`) so several analysis rounds stay traceable. Result: what works, what must change.

**2. Revision plan** (`type: revision`). Record chapter by chapter *what* concretely changes — ideally with **example passages** (before/after, or "this is how the scene should sound"). This is the working template for the actual rewrite, not a prose substitute.

**3. Rewrite into V2.** Create version `V2` (if not yet present: `Chapters/V2/` + `IndexV2.md`, see [[Create-New-Book]] · Longform part). Then revise **scene by scene** per the plan — on a `claude/<slug>` branch, **English in the author's voice**. The revised scene stays at `status: revise` (→ [[Scene-Status]]) until it fits. V1 stays untouched.

**4. Continuity-Check.** Check each revised scene before `done` against the canon with **`/continuity-check`** (→ [[Continuity-Check]]) — a rewrite can easily shift facts.

**5. Wrap-up.** The author merges. Both versions are kept; to compile, select the desired draft (`V2`) in the Longform panel. Which version "counts" is the author's decision — the vault holds both.

## Order in brief

1. **Style analysis** (`analysis`) — hold current state against `Writing Style`, dated.
2. **Revision plan** (`revision`) — chapter by chapter, with example passages.
3. **Rewrite into V2** — scene by scene, `status: revise`, branch, author's voice.
4. **`/continuity-check`** per scene → `done`.
5. **Author merges** — V1 + V2 remain, draft selection steers the compile.

## Related

- [[Create-Scene]] · [[Scene-Status]] — scene handling and the `revise` status.
- [[Continuity-Check]] — fact reconciliation after the rewrite.
- `00 Meta/Writing Style.md` — the target voice the rework is measured against.
