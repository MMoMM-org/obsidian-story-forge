---
type: meta
name: "Create scene (beat → prose) — Workflow"
tags: [meta/doc]
---

# Create scene (beat → prose)

The transition from planning to prose: from a 🎬 beat, the individual scenes in `10 Manuscript/` are created. This document describes **how a scene is created and wired up** — the chain before it is in [[Snowflake-Process]], the status flow after it in [[Scene-Status]], the book's scaffold in [[Create-New-Book]].

> **Prerequisite:** The book's beats (🎬) and outline (📋) exist, and the Longform draft (`IndexV*.md`) is set up and selected. The outline says **which** scenes a beat covers and in what order.

## Basic principle

A scene is a file in `Chapters/V*/` with `type: scene` and `tags: [manuscript/scene]`. It is hooked into the structure via two things: the field **`beat`** (back-reference to the 🎬 beat) and the field **`order`** (global reading order). The beats are the *plot*; the scene is the *prose* for it — **facts about characters/locations/objects do not belong here, they go to `30 Canon/`**.

## Creating

Two ways, both producing the file per the clean scene schema (`t_scene`):

- **Longform panel → "New Scene"** (recommended): automatically enters the scene into the active draft's `scenes:` list, creates the file in the `sceneFolder`, and applies `sceneTemplate: t_scene`. The template prompts via suggester for POV, characters, location (from the canon), and status.
- **Template `t_scene` directly** (`00 Meta/Templates/t_scene.md`): produces the same structure, but without the Longform entry — then add the scene by hand to the `scenes:` list in `IndexV*.md`.

## Wiring up (frontmatter)

After creating, set the link fields — they control sorting, beat assignment, and the Dataview tables (the reference viewer's scene/chronology reference view, DESIGN §7, under construction):

| Field | Value | Role |
|---|---|---|
| `book` | `"[[<Book>]]"` | assignment to the volume |
| `beat` | `"<Beat name>"` (string, **without** 🎬) | back-reference; the table at the foot of the beat matches by "text contains" |
| `order` | integer | global reading order — drives **every** scene sort |
| `act` / `chapter` | integer | act/chapter number from the outline |
| `pov` | `"[[Character]]"` | POV character (single) |
| `characters` | `[[Character]]` list | characters present |
| `location` | `"[[Location]]"` | setting |
| `day` | present `"4 Friday"` · flashback `"3 years ago"` | timeline → `40 Timeline/README.md` |
| `flashback` | `true` (only for a flashback) | removes the scene from the present-day count |
| `prev` / `next` | `[[Scene]]` | reading-order chain to the neighboring scene |
| `status` | `idea` … `done` | progress → [[Scene-Status]] |

**Important about `beat`:** The value is the plain beat name as a string (e.g. `"Major Turning Points"`), **without** the 🎬 prefix. On render, the view passes the full beat title (with emoji) and matches by "contains" — a missing or differently spelled `beat` makes the scene disappear from the beat table.

## Writing prose

On a `claude/<slug>` branch. Before writing, **read the linked canon** (characters, locations, objects) so details are correct. Prose is **English, in the author's voice** — Claude drafts/revises, the author merges. The `status` moves through the stages in [[Scene-Status]] (`idea → init → structure → draft → revise → done`).

## Before finalizing

Run **`/continuity-check`** (read-only) against the canon — it checks for contradictions with established facts (character traits, timeline, object/contract consistency) before a scene goes to `done`.

## Order in brief

1. Read the outline (📋) — which scenes the beat covers, in what order.
2. Create the scene (Longform "New Scene" or `t_scene`).
3. Wire up the frontmatter — above all `beat`, `order`, `book`, POV/characters/location.
4. Set `prev`/`next` to the neighboring scene.
5. Write prose (branch, English, author's voice) — carry the `status` along.
6. `/continuity-check` → to `done`, author merges.

## Related

- [[Snowflake-Process]] — where the beats come from.
- [[Scene-Status]] — the status stages in detail.
- [[Create-New-Book]] — draft/`sceneFolder`/`sceneTemplate` setup.
- [[README]] (`10 Manuscript`) — Longform structure, V1/V2, compile.
