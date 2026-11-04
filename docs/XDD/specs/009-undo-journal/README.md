# Specification: 009-undo-journal

## Status

| Field | Value |
|-------|-------|
| **Created** | 2026-11-04 |
| **Current Phase** | PLAN |
| **Last Updated** | 2026-11-04 |

## Documents

| Document | Status | Notes |
|----------|--------|-------|
| requirements.md | completed | 10 must-have features, Gherkin ACs, Storyline comparison |
| solution.md | completed | ADR-37…ADR-53, mockup states U1–U11 |
| plan/ | pending | |

**Status values**: `pending` | `in_progress` | `completed` | `skipped`

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-11-04 | Scaffold spec 009 from the brainstormed design `docs/XDD/ideas/2026-11-04-undo-journal.md` | Issue #17 (gap G22), epic #16; the precondition for #7 and #8. Branch `feat/undo-journal`, cut from `codex-surface` because the journal builds on the writer and editor code there. |
| 2026-11-04 | **PRD approved** (user) | Adds two decisions beyond the design. A notice follows every undo and redo, as Storyline does, because one stack spans all notes and the writer needs to see which note changed. Ctrl+Y is not built in: the commands have no default hotkey, so a user binds it, and the docs warn that a global binding shadows editor redo. Kept the PRD's "Clear undo history" button (Could) and dropped its large-value notice as too much UI for a rare case. #30 is expected to close with 009, since the Workbench's stale draft after a save has the same cause; the live walk confirms it. Turning the persistence setting off deletes the stored history. |
| 2026-11-04 | **SDD approved; ADR-37…ADR-53 confirmed** (user) | Keyboard through a global capture-phase handler as Storyline does, not a view scope, because a scope's precedence over Obsidian's own Mod+Z is unverified; a live spike opens the plan, and commands and buttons remain if it fails. Gestures are explicit groups, and Kanban now awaits its renumber. A central registry answers "does this note have pending work". One `undo-journal.json` and no device id: Obsidian Sync carries only a plugin's known files such as `data.json`, so this file stays on the device (checked in the live walk); other sync tools are the user's business. Values compare after a YAML round trip. The Workbench takes outside changes into saved fields (#30), and a pinned Workbench refreshes too, which changes shipped behaviour. Added during review: closing a view now finishes its pending writes (a pre-existing loss of a dragged card's write), and a command arriving within 100 ms of the key trigger is ignored. |

## Context

The brainstormed design settles the behaviour: a journal inside `frontmatterWriter` (`commit` /
`commitMany`), one global undo stack and a redo stack, persisted across restarts behind a setting
that is on by default; undo restores even on a conflict and the overwritten value goes on redo;
Cmd/Ctrl+Z on the Anvil and Workbench scopes, text undo while a field holds unsaved text; undo waits
while a draft exists on a target note; ↶/↷ on the Anvil tab strip and Workbench header, behind a
mockup sign-off. Open for the SDD: the grouping seam, the size numbers, and scheduling the mockup gate.

---
*This file is managed by the xdd-meta skill.*
