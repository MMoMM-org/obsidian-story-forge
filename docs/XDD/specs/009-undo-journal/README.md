# Specification: 009-undo-journal

## Status

| Field | Value |
|-------|-------|
| **Created** | 2026-11-04 |
| **Current Phase** | SDD |
| **Last Updated** | 2026-11-04 |

## Documents

| Document | Status | Notes |
|----------|--------|-------|
| requirements.md | completed | 10 must-have features, Gherkin ACs, Storyline comparison |
| solution.md | pending | |
| plan/ | pending | |

**Status values**: `pending` | `in_progress` | `completed` | `skipped`

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-11-04 | Scaffold spec 009 from the brainstormed design `docs/XDD/ideas/2026-11-04-undo-journal.md` | Issue #17 (gap G22), epic #16; the precondition for #7 and #8. Branch `feat/undo-journal`, cut from `codex-surface` because the journal builds on the writer and editor code there. |
| 2026-11-04 | **PRD approved** (user) | Adds two decisions beyond the design. A notice follows every undo and redo, as Storyline does, because one stack spans all notes and the writer needs to see which note changed. Ctrl+Y is not built in: the commands have no default hotkey, so a user binds it, and the docs warn that a global binding shadows editor redo. Kept the PRD's "Clear undo history" button (Could) and dropped its large-value notice as too much UI for a rare case. #30 is expected to close with 009, since the Workbench's stale draft after a save has the same cause; the live walk confirms it. Turning the persistence setting off deletes the stored history. |

## Context

The brainstormed design settles the behaviour: a journal inside `frontmatterWriter` (`commit` /
`commitMany`), one global undo stack and a redo stack, persisted across restarts behind a setting
that is on by default; undo restores even on a conflict and the overwritten value goes on redo;
Cmd/Ctrl+Z on the Anvil and Workbench scopes, text undo while a field holds unsaved text; undo waits
while a draft exists on a target note; ↶/↷ on the Anvil tab strip and Workbench header, behind a
mockup sign-off. Open for the SDD: the grouping seam, the size numbers, and scheduling the mockup gate.

---
*This file is managed by the xdd-meta skill.*
