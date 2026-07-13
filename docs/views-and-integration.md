# Views & Plugin Integration

> The definitive view spec: which views Story Forge ships, their layout and
> (trimmed) feature set, how each is rendered, and how it fits with Longform and
> the other vault plugins. Supersedes the per-view list in `view-roadmap.md`
> (which keeps the phasing). Decisions here were made with Marcus.

Guiding principle unchanged: **frontmatter is the source of truth; Bases/Dataview
render it; the plugin writes back only plain Properties, never a plugin store.**

## Two surfaces

1. **Contextual sidebar panel** — a dockable `ItemView` that **follows the active
   note** and shows type-appropriate info. This is the heart of the plugin and
   our main custom code.
2. **Workspace views** — full-tab views: Codex, Kanban, Plotgrid, Timeline,
   Plotlines. (Story Graph = the core Obsidian graph for now.)

## Plugin division of labour

| Concern | Owner |
|---|---|
| Manuscript authoring / compile | **Longform** — we never touch it |
| In-world calendar / fixed dates | **Calendarium** (optional, future) |
| Field editing + value lists | **metadata-menu** (FileClasses already defined) |
| Inline fields / portrait *in* notes | **meta-bind** (`VIEW[]` / `INPUT[]` write frontmatter) |
| Declarative rendering (tables/cards/groups) | **Bases** + **Dataview** |
| Contextual panel + interactive views (drag → frontmatter) | **our plugin** |
| Continuity, plot-holes, warnings | **_forge Claude Code skills** — see `claude-skills.md`, not plugin code |

## The views

### Contextual sidebar panel — core
Narrow column, collapsible sections, follows the active note. Content by note type:

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

### Codex — yes
Hub with category tabs (Characters / Locations / Objects / Lore), each a grid/table;
click → detail in the contextual panel.
**Render:** **Bases** is the natural fit (one `.base` per category, or one grouped
base). Detail = the contextual panel. Almost no custom code.

### Kanban — yes
Columns by `status` (idea → final); cards = scenes; optional grouping by `act`/`pov`.
**Render:** grouping is declarative, but **drag between columns** needs our custom
DOM. Drag → writes `status` (and optionally `order`).
**Note:** not the "Obsidian Kanban" plugin — it uses its own markdown board format,
not frontmatter. We stay frontmatter-driven.

### Plotgrid — yes
Matrix: rows = plotlines, columns = scenes (by `order`); a cell is marked when
`scene.plotlines` contains the plotline.
**Render:** fully derivable from frontmatter → DataviewJS can render the read-only
matrix; toggling a cell writes the scene's `plotlines` (custom interaction).
Simpler than Storyline's free-text cells.

### Timeline — yes (fixed + relative time)
Axis of scene cards, grouped by act/chapter; gaps express "two weeks later" as
distance. **Scene time model** (see below) — a real schema addition.
**Render:** custom layout; Calendarium optionally supplies fixed calendar dates.

### Plotlines — yes
One collapsible section per plotline with its scenes (ordered) + an "unassigned"
bucket.
**Render:** declarative — Bases/Dataview `GROUP BY plotlines`. The "subway map"
variant is custom → later/optional.

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
- **`storyDate`** *(optional, future)* — an absolute in-world date via
  **Calendarium**. Must be **calendar-aware and support two different calendars**,
  so the field is designed forward-compatibly (e.g. a calendar-qualified value or
  Calendarium's own event binding) rather than a single hard-coded date. Not in
  the MVP schema; added when Calendarium integration lands.

MVP adds `storyDay` + `when` to `fc-scene` + the scene template + `Schema/scene.md`
(kept green by `schema:check`). Timeline falls back to `order` when `storyDay` is
absent.

## Longform integration

Our scene notes **are** the Longform scenes. Longform owns the **manuscript order**
(in its project index) — we never write it. Our `order` (reading order) and
`storyDay` (chronology) are **separate axes**; Kanban/Timeline operate on those
without touching Longform's ordering. Keeping these axes distinct prevents the two
tools from fighting.
