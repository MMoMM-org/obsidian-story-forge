# Views & Plugin Integration

> The definitive view spec: which views Story Forge ships, their layout and
> (trimmed) feature set, how each is rendered, and how it fits with Longform and
> the other vault plugins. Supersedes the per-view list in `view-roadmap.md`
> (which keeps the phasing). Decisions here were made with Marcus.

Guiding principle unchanged: **frontmatter is the source of truth for story data;
Bases/Dataview render it; the plugin writes back only plain Properties, never a
plugin store.** Two refinements settled since:

- **Every third-party plugin is an add-on, never a requirement.** Dataview,
  metadata-menu, meta-bind and Calendarium are detected and used where they help,
  but **everything falls back to native rendering when they are absent.** The
  native path is therefore a hard requirement — a declarative view is an
  *additional* implementation, never a replacement.
- **Operational state may live in the plugin directory.** Story data stays in
  frontmatter, but a **journal of our own Anvil writes does not.** Drag-and-drop,
  add and remove are fast and easy — and just as easily leave you unable to
  reconstruct what you changed. Undo for Anvil edits is in scope (issue #17).

## The two interfaces and the one content concept *(settled 2026-07-27)*

| Term | Kind | What it is |
|---|---|---|
| **Anvil** | interface | **Main window.** One view, tab switcher: **Codex · Timeline · Plotgrid · Plotlines · Board**. Manage and survey the manuscript. |
| **Workbench** | interface | **Sidebar.** Follows the active note. Tabs: **Codex** (compact, drill-down), **Navigator**, plus any imported user views. |
| **Codex** | content | The story *objects* — characters, locations, items, creatures, lore, organizations, cultures, systems, and whatever the user adds. **Not an interface**: it appears as the card grid in Anvil and as the following tab in the Workbench. |

**Codex is what you know; Anvil is what you shape; Workbench is what's at hand.**

**Different obligations, per tab — not per interface:**

- The **Codex** (in either interface) is **substitutable**: a user can author or
  import their own `.base`/view — over frontmatter we never shipped — and use it
  *instead of* ours. They compose from our building blocks (hero card, table), not
  their own renderers.
- The **management tabs** (Timeline, Plotgrid, Plotlines, Board) are
  **deliberately opinionated**: configurable (grouping key, columns/lanes, status
  vocabulary, scope) but not user-authored. They exist to manage and survey, not to
  display everything.

**How a tab is rendered is an implementation detail** — Bases, Dataview or custom
DOM — and may change without changing what the user sees.

Rationale in `gap-analysis.md` §1.2 / G24. Execution (folding today's four commands
into one Anvil view) is issue #26.

## Plugin division of labour

| Concern | Owner |
|---|---|
| Manuscript authoring / compile | **Longform** — for now; the end-game is absorbing it (below) |
| In-world calendar / fixed dates | **ours**, with user-defined calendars; Calendarium optional |
| Field editing + value lists | **metadata-menu** *(add-on)* — we ship the FileClasses |
| Inline fields / portrait *in* notes | **meta-bind** *(add-on)* — `VIEW[]` / `INPUT[]` write frontmatter |
| Declarative rendering (tables/cards/groups) | **Bases** + **Dataview** *(Dataview is an add-on)* |
| Workbench + Anvil, interactive edits (drag → frontmatter) | **our plugin** |
| Continuity, plot-holes, warnings | **_forge Claude Code skills** — see `claude-skills.md`, not plugin code |

**None of the add-ons are required.** Everything degrades to native rendering when
they are absent. Two things we owe the user in return: **ship the vault artifacts**
(FileClasses, templates for Templater and the core template plugin, the Schema
reference) — today they exist only in `test/StoryForge/` — and **document what each
add-on adds and what is missing without it** (`gap-analysis.md` G14 / G25).

## The views

### Workbench — the Codex tab (core)
Narrow column, collapsible sections, follows the active note. This is the compact,
drill-down form of the Codex; the Anvil holds the full card grid. Content by note type:

| Active note | Panel shows |
|---|---|
| **character** | facts + portrait · relationships (relation fields) · **"appears in"** (scenes whose `pov`/`characters` include this char) · owns (objects with `owner` = char) · related locations/lore |
| **location** | facts · hierarchy (`world` chain up, children down) · `inhabitants` · **scenes here** (scenes with `location` = this) |
| **object** | facts · `owner` · "appears in" scenes |
| **lore** | facts · `related` entities · "appears in" |
| **scene** | entities in the scene (pov/characters/location/plotlines) with quick facts |
| **plotline** | scenes in this plotline (ordered) + characters involved |

**Render:** our ItemView shell + Dataview/DataviewJS for the reverse-link queries
("appears in" = backlinks / `contains(characters, this)`). This is the highest-
value building block — e.g. "in the Codex on a character, see where they appear".
**Write-back:** optional inline via meta-bind / metadata-menu.

### Anvil — the Codex tab

*Signed-off design: `docs/mockups/anvil-workbench-codex.html` S91–S103.*

**Two independent axes** — conflating them was the modelling error of the first draft:

| Term | Question | Where |
|---|---|---|
| **Collection** | *what* is shown — Characters, Locations, Organizations. A query. | the pill row; managed in settings |
| **Card** | *how* an entry is drawn — Hero, Table, Compact, or the user's own. | the header dropdown; chosen **per collection and remembered** |

The word **"view"** is retired from the UI — it meant five different things.
A user `.base` supplies the **query**, our registered view type supplies the **Card**.
(The shipped `Codex.base` that did this for the built-ins was retired in spec 008 T7.3: since
T7.1 the Anvil draws the built-in collections natively, by tag.)

Selecting a card opens an **editor pane in the lower half**, dockable to the right or
fullscreen, closable — every dock showing the full field set. That pane is where entity
editing lives; ADR-0001 settles that it is custom DOM over `processFrontMatter`, because
Bases inline editing is not exposed to plugins.

**The editor is FileClass-driven (ADR-0002).** Fields, order, types, enum values, section
grouping *and column layout* are read from the `fc-*.md` chain — not from a hardcoded
list. One section per FileClass in the `extends` chain; half-width columns for
`Select`/`Number`/`Boolean`/`Date`/`Input`, full width for `Multi`/`MultiFile`. A user
dropping `fc-character-custom1.md` into the FileClasses folder gets a typed, laid-out,
named section **without a plugin release and without styling anything**. Two exceptions
carry a `ui:` hint in our own `schema/*.json`: `tagline` (`wide`) and `portrait`
(`image`).

**Categories are open.** We ship `character`, `location`, `object` and `lore`; the
user adds the rest — creatures, organizations, cultures, systems, factions, magic
systems, whatever the story needs. This is not a nice-to-have: Storyline sells the
Codex on exactly that — *"a unified hub for Characters, Locations, and your own custom
categories (Props, Factions, Magic Systems — whatever you need)"* — and a Codex that
only knows our four types is not the Codex we are rebuilding. It follows that a
user-added category must reach the card grid and the Workbench **through a view they
author or import**, not through a plugin release (issue #13).

**Substitutable:** a user who dislikes what our shipped Codex base shows writes their
own `.base` and uses it instead. Curated views are a default, not a fixture.

**Render:** Bases fits the grid (one `.base` per category, or one grouped base); the
hero-card presentation is our own registered Bases view type (issue #12).

### Kanban — yes
Columns by `status` (idea → final); cards = scenes; optional grouping by `act`/`pov`.
**Render:** grouping is declarative, but **drag between columns** needs our custom
DOM. Drag → writes `status` (and optionally `order`).
**Note:** not the "Obsidian Kanban" plugin — it uses its own markdown board format,
not frontmatter. We stay frontmatter-driven.
**Configurable columns (required):** the `status` vocabulary must be a setting, not a
constant. Some writers want three stages, some six, and they will want their own
names. The mechanic stays identical — only the column set and labels change. Issue
#15; today `STATUS_VOCAB` is compiled into `src/workspace/WorkspaceView.ts:60`.


### Plotgrid — yes
Matrix: rows = plotlines, columns = scenes (by `order`); a cell is marked when
`scene.plotlines` contains the plotline.
**Render:** fully derivable from frontmatter → DataviewJS can render the read-only
matrix; toggling a cell writes the scene's `plotlines` (custom interaction).

**The membership matrix is only the floor.** Storyline's Plotgrid does considerably
more, and that is the target (issue #8):

- rows = **scenes**, columns = plotlines / **themes / story threads** — not just plotlines
- a cell holds **free text, formatting, colours and linked scene cards**; double-click edits
- **act and chapter divider bands** mark story-section boundaries
- scene rows **colour-coded by status**
- **Auto-Note**: typing into an empty cell creates a linked note
- detected characters/locations/codex entries appear as **colour-coded pills** in cell text

Free-text cells mean cell content needs a home in frontmatter (or a linked note, as
Auto-Note does) — a design question to settle before building, not during.
Ref: <https://github.com/PixeroJan/obsidian-storyline/tree/main#plotgrid-view>

### Timeline — yes (fixed + relative time)
Axis of scene cards, grouped by act/chapter; gaps express "two weeks later" as
distance. **Scene time model** (see below) — a real schema addition.
**Render:** custom layout; Calendarium optionally supplies fixed calendar dates.


### Plotlines — yes
One collapsible section per plotline with its scenes (ordered) + an "unassigned"
bucket.
**Render:** declarative — Bases/Dataview `GROUP BY plotlines`.

**The "subway map" variant is wanted in this version** — promoted from
"later/optional". Custom spatial layout (③), tracked as issue #5.


### Story graph — core graph (MVP)
Use the **core Obsidian graph / local graph** with tag colour-groups (`canon/*`)
and a filter to `30 Canon`. Relations are `[[wikilinks]]`, so the network renders
for free. Limits: edges are **not typed** (ally vs enemy look the same) and it
includes non-relation links. A custom force-directed Story Graph (typed/coloured
edges, entity-shaped nodes; port `StoryGraph.ts`) is a **low-priority later**.

### Out of scope (decided)
Corkboard ❌ · Manuscript view ❌ (Longform) · Stats/analysis ❌ · Plot-holes /
warnings ❌ (→ _forge Claude skills).

## Scene time model (new schema)

Today a scene only has `order`. The timeline needs time. Decided model:

- **`storyDay`** — integer, the ordinal day in the story (Day 1 = 1). Always
  works with no calendar; drives placement and chronological sort. Relative jumps
  are authored as `storyDay: prev + 14` ("two weeks later").
- **`when`** — free-text display label ("Day 1", "Two weeks later", or a date).
  Display only.
- **Absolute in-world date** — **not a field of ours.** Revised twice: this is
  neither a Calendarium integration nor a `storyDate` property we invent.

  **No calendar interface from us for now.** The goal is to *display* date
  information where the writer already works — Plotgrid, Timeline, Codex cards.
  Calendarium can own the visual calendar; we do not build one.

  **Storage: a configured key, never a sync.** Calendarium reads its own
  frontmatter (`fc-calendar`, `fc-date`, …). We make the key a **setting**,
  defaulting to `fc-date` (and `fc-calendar` for which-calendar) when Calendarium
  is present, and we *read* it. We do **not** keep a parallel `storyDate` and
  mirror it: that would write one fact twice into a single note, need a conflict
  policy, and eventually lose data — the Longform failure mode in miniature. One
  fact, one place, wherever the user's ecosystem already puts it.

  Multiple calendars come for free — `fc-calendar` already models them.

  | Capability | Requires |
  |---|---|
  | **Display** a date *(wanted now)* | just the configured key — trivial |
  | **Compute** with a date (sort, "two weeks later") | a calendar definition — 13 months, 8-day weeks, 48-hour days |

  Display unblocks Plotgrid and Timeline; computation stays deferred. **Spike
  first:** the exact value shape of `fc-date` (string vs. nested `{year, month,
  day}`) could not be confirmed from Calendarium's docs — verify before building.
  Issue #25.

MVP adds `storyDay` + `when` to `fc-scene` + the scene template + `Schema/scene.md`
(kept green by `schema:check`). Timeline falls back to `order` when `storyDay` is
absent.

## Longform integration

Our scene notes **are** the Longform scenes. Longform owns the **manuscript order**
(in its project index) — we never write it. Our `order` (reading order) and
`storyDay` (chronology) are **separate axes**; Kanban/Timeline operate on those
without touching Longform's ordering. Keeping these axes distinct prevents the two
tools from fighting.

### The end-game: absorb Longform, do not sync with it

The separate-axes rule above is a **holding position**, not the destination. We will
not build a synchronisation mechanism between Longform's ordering and ours.

**What we like:** Longform is *not* a full editor — and we do not want to build one
either. That boundary stays.

**The two quirks that work against us:**

1. **Versions as directories** → duplicate notes for every version.
2. **A version file holding the scene order** as a plain ordered list *without*
   wikilinks. Renaming a note breaks the entry, and reordering via frontmatter — our
   way — never shows up in Longform.

**The plan:** once the Storyline adaptation works, absorb Longform into the plugin and
rewrite that part frontmatter-only. The candidate mechanism is a **`version`
property** on scenes, so versions become a filter over one set of notes rather than
duplicated directories. Ordering then lives in frontmatter like everything else.

Feasible in practice: Longform is currently unmaintained and its author is looking
for a maintainer (<https://github.com/kevboh/longform>). Scope to verify before
committing: what else Longform covers that we would inherit (compile/export in
particular). Tracked as issue #3.