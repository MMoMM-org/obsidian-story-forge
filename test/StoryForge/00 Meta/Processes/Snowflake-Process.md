---
type: meta
name: "Snowflake process — Workflow"
tags: [meta/doc]
---

# Snowflake process

How a book is plotted — **from coarse to fine**, each stage refining the previous one. The documents live in `20 Planning/0X <Book>/` and carry an emoji prefix marking the stage (❄️🔍🎬📋). This document defines the **order** of work; the vocabulary of the stages and the folder structure are in [[README]] (`20 Planning`).

> Snowflake is **iterative**, not linear: if something strikes you at a late stage, go back and fix the earlier stage. The order below is the *first* direction — not a one-way street.

## The chain at a glance

| # | Stage | Document | `type` | Template | Location |
|---|---|---|---|---|---|
| 0 | Series | Plot · Structure · Book titles · Analysis | `plot` / `structure` / … | — | `20 Planning/00 Serie/` |
| 1 | ❄️ Snowflake | `20X ❄️ <Book>` | `snowflake` | `t_snowflake` | `20 Planning/0X <Book>/` |
| 2 | 🔍 Synopsis | `20X 🔍 <Book>` | `synopsis` | `t_synopsis` | `20 Planning/0X <Book>/` |
| 3 | 🎬 Beats | `20X 🎬 <Beat>` (several) | `beat` | `t_beat` | `20 Planning/0X <Book>/` |
| 4 | 📋 Outline | `20X 📋 <Book>` | `outline` | — | `20 Planning/0X <Book>/` |
| 5 | Book note | `20X <Book>` (dashboard) | `book` | — | `20 Planning/0X <Book>/` |
| → | Prose | Scenes | `scene` | `t_scene` | `10 Manuscript/0X <Book>/` |

This work feeds the tidied-up **series bible** in `00 Meta/`; the **entity facts** (characters, locations, objects) move to `30 Canon/`.

---

## Level 0 — Series (once, up front)

Before an individual book is plotted, the series-wide frame stands in `20 Planning/00 Serie/`.

Order:

1. **Series - Plot** (`type: plot`) — the story arc across all volumes.
2. **Series - Structure** (`type: structure`) — how the arc is distributed across the books.
3. **Series - Book titles** (`type: titles`) — working title per volume.
4. **Series - Analysis** (`type: analysis`) — accompanying evaluation.

These notes are `status: reference`. If something fundamental changes here, update the bible in `00 Meta/` afterwards.

---

## Stage 1 — ❄️ Snowflake

- **File:** `20 Planning/0X <Book>/20X ❄️ <Book>.md`
- **Template:** `t_snowflake`
- **type:** `snowflake`

The four classic snowflake steps in *one* file, in this order:

1. **One Sentence Summary** → field `Summary::`.
	1. One sentence, < 15 words, no character names.
2. **The Story** → field `Story::`.
	1. One paragraph (~5 sentences): setup · 3 turning points · resolution.
3. **The Main Characters** → field `MainCharacters::` as `[[Wikilinks]]`.
	1. For each main character a short profile (goal, motivation, conflict, epiphany).
4. **The Main Plot** → the paragraph from (2) expanded to ~one page (one paragraph per sentence).

**Ready enough for the next stage** once `The Main Plot` stands — the synopsis builds directly on it. `Summary::`/`Story::` also feed the book note (dashboard) and the bible.

## Stage 2 — 🔍 Synopsis

- **File:** `20X 🔍 <Book>.md`
- **Template:** `t_synopsis`
- **type:** `synopsis`

Links back via the `snowflake:` property and **embeds** `![[… ❄️ …#The Main Plot]]` as a starting point.

Task: expand each paragraph of the Main Plot to ~one page (`The Synopsis`).

This is where the structural decisions fall — logic gaps that surface here get fixed back in **stage 1**.

## Stage 3 — 🎬 Beats

- **Files:** `20X 🎬 <Beat name>.md`
	- — **several**, one per beat/act
- **Template:** `t_beat`
- **type:** `beat`

Work the beats out of the synopsis. Example, book 1: `🎬 Introduction`, `🎬 Catalytic Event`, `🎬 Building Tension`, `🎬 Conflict and Shift in Dynamics`, `🎬 Major Turning Points`.

Each beat carries:

- **Setting** (location `[[…]]`, time, atmosphere, `Date::` for the timeline),
- **Characters Involved** (role · motivation · development),
- **Scene → Sequel:** Goal → Conflict → Disaster, then Reaction → Dilemma → Decision,
- **Plot Points** — the chapters this beat covers.

Beats have their own `status` (idea/draft/revise …) and are the **bridge to the prose**:

Scenes in `10 Manuscript/` point back via `beat::`; the Dataview table at the foot of each beat lists them automatically.

## Stage 4 — 📋 Outline

- **File:** `20X 📋 <Book>.md`
- **type:** `outline`

The chapter outline: **links all 🎬 beats** in reading order and lists the chapters per beat with a line or two of content + POV. This is the chapter map from which the scenes in the manuscript grow.

## Stage 5 — Book note (dashboard)

- **File:** `20X <Book>.md` (no emoji)
- **type:** `book`

Not a work step in the narrow sense, but the **overview**: pulls `Summary::`/`Story::` from the snowflake, lists the chapter scenes and their status via Dataview (the reference viewer's scene/chronology reference view, DESIGN §7, under construction). This is where you steer the book from.

---

## From beats to prose (transition to `10 Manuscript/`)

The 🎬 beats **guide** the scenes — they do not themselves become prose. Once writing begins, scenes are created in `10 Manuscript/0X <Book>/` (`type: scene`, `t_scene`) with their own status flow → [[Scene-Status]]. **Plot** belongs in beats/scenes, **entity facts** (characters, locations, objects) in `30 Canon/` — don't mix them.

Before finalizing a scene: **`/continuity-check`** (read-only) against the canon.

## Order in brief

1. **Series** (00 Serie) — Plot → Structure → Book titles → Analysis *(once)*
2. **❄️ Snowflake** — sentence → paragraph → characters → Main Plot
3. **🔍 Synopsis** — Main Plot, one page per paragraph
4. **🎬 Beats** — per beat: Setting · characters · Scene/Sequel · Plot Points
5. **📋 Outline** — beats + chapters in reading order
6. **Book note** — dashboard maintains itself
7. **10 Manuscript** — write scenes (own status flow) → continuity-check

> **Always feed back:** new insight at one stage → update the earlier stage.
