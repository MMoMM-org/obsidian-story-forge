---
type: meta
name: "Create new book — Workflow"
tags: [meta/doc]
---

# Create new book

The order in which a new volume of the series is set up — from planning (`20 Planning/`) to the empty Longform manuscript (`10 Manuscript/`). The actual *plotting* afterwards runs via [[Snowflake-Process]], the *writing* of scenes via [[Scene-Status]]. This document describes only the **scaffold**: which folders and files are created, in which order.

> **Prerequisite:** The series-wide frame in `20 Planning/00 Serie/` (Plot · Structure · Book titles · Analysis) is in place — from it come the volume number, title, and rough content. If that is not the case, work there first (level 0 in [[Snowflake-Process]]).

## What gets created

`0X` = two-digit volume number (`01`, `02`, …), `20X` = planning prefix (`201` = book 1). `<Book>` = clean title without number/special characters.

| # | Location / file | `type` | Template | Purpose |
|---|---|---|---|---|
| 1 | `20 Planning/0X <Book>/` | — | — | Planning folder of the volume |
| 2 | `20X <Book>` (book note) | `book` | — | Dashboard: Summary/Story + scene tables |
| 3 | `20X ❄️ <Book>` | `snowflake` | `t_snowflake` | Snowflake chain → [[Snowflake-Process]] |
| 4 | `20X 🔍 <Book>` | `synopsis` | `t_synopsis` | " |
| 5 | `20X 🎬 <Beat>` (several) | `beat` | `t_beat` | " |
| 6 | `20X 📋 <Book>` | `outline` | — | " |
| 7 | `10 Manuscript/0X <Book>/` | — | — | Manuscript folder of the volume |
| 8 | `Chapters/V1/` (possibly `V2/`) | — | — | Scene files of the version |
| 9 | `IndexV1.md` (possibly `IndexV2.md`) | — | — | Longform draft definition |
| 10 | `manuscript.md` | — | — | compiled output (compile writes here) |

## Flow

**Planning first.** Create the folder `20 Planning/0X <Book>/` and the book note (`type: book`) inside it — easiest as a copy of an existing one (e.g. `201 Forge - <Book title>`), then adjust the frontmatter: `title`, `subtitle`, `book_number`, `aliases`. The book note pulls `Summary::`/`Story::` via inline DQL from the snowflake and lists the scenes via the reference viewer's shared scene/chronology reference view (DESIGN §7, under construction) — so it only works fully once the snowflake and manuscript exist, which is normal. There is (as yet) no dedicated `t_book` template; the note is created by hand or by copy.

**Then the snowflake chain** ❄️ → 🔍 → 🎬 → 📋 with the respective templates, as described in [[Snowflake-Process]]. That is the actual plot effort; mentioned here only for completeness as part of the scaffold.

**Then the manuscript.** Create the folder `10 Manuscript/0X <Book>/` with `Chapters/V1/` (a second version `V2/` only once a rework begins). Inside it, create the Longform draft definition `IndexV1.md` — best copied from an existing `IndexV1.md` and adjusted. Important in the `longform` frontmatter:

- `sceneFolder: Chapters/V1` — **relative**, so the book folder stays movable.
- `scenes:` — the scene file names in reading order (empty at first; Longform fills them as you create scenes).
- `sceneTemplate: 00 Meta/Templates/t_scene.md` — so new scenes follow the clean scene schema.
- `ignoredFiles:` — planning notes that (historically) sat in the same folder; with clean separation usually empty.

**Wire it up at the end.** In the book note, set the links to planning and manuscript (`[[20X 📋 …]]`, `[[Book X - Draft]]`, etc.), and in the Longform panel **select** this book's draft once — that writes the absolute `selectedDraftVaultPath` into `.obsidian/plugins/longform/data.json`. Only after that do the reference viewer's scene tables (DESIGN §7), which follow the *active* draft, take effect.

## Conventions

- **Numbering:** planning files carry the `20X` prefix (book 1 = `201`), folders the `0X` prefix. Book 1 is the reference for naming; the early-created books 2–3 are still minimal (only book note, outline, draft stub) and partly diverge.
- **Clean titles** in wikilinks/`aliases`: no number, no emoji, no `(…)` suffix.
- **V1 and V2** are two complete versions of the same book — both are kept (details in [[README]] · `10 Manuscript`).

## Git

Create on a `claude/<slug>` branch, stage the new paths precisely (never a blind `git add -A`), the author merges. Selecting the draft in Longform changes `.obsidian/plugins/longform/data.json`; handle that change deliberately (commit it or discard it), don't carry it along by accident.

## Related

- [[Snowflake-Process]] — the plot chain that fills this scaffold.
- [[Scene-Status]] — the status flow of the individual scenes in the manuscript.
- [[README]] (`20 Planning`) and [[README]] (`10 Manuscript`) — structural overview of both zones.
