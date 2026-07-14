---
type: meta
name: "Scene status — Workflow"
tags: [meta/doc]
---

# Scene status

A scene's `status` field (`10 Manuscript/…`, in the frontmatter) marks how far along it is in the writing process. **Canonical order:**

## `idea → init → structure → draft → revise → done`

| Stage | Meaning |
|---|---|
| `idea` | concept/note only, no content yet |
| `init` | created, raw material present — **not yet revised** |
| `structure` | structured/ordered — the build stands |
| `draft` | fully written prose draft |
| `revise` | under revision |
| `done` | finished |

## Setting & advancing
- **metadata-menu:** `status` is a select — directly in the property (dropdown) or via the command "Metadata Menu: Update status" (hotkey recommended).
- **QuickAdd:** "Scene: Set status" (suggester) or "Scene: Advance status" (bumps one stage forward).
Both are bindable to hotkeys as commands.

## Source of truth
This document defines the status vocabulary. The value is encoded in several places — when changing it, align **all** of them:
- `00 Meta/FileClasses/fc-scene.md` — enum order in the dropdown
- `00 Meta/Templates/t_scene.md` — suggester on creation
- `00 Meta/Scripts/scene-status-*.js` — QuickAdd actions (the `STATUS` list determines the "advance")
