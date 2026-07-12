# Storyline Analysis → Story Forge View Strategy

> What we take from [Storyline](https://github.com/pixerojan/obsidian-storyline)
> (MIT, © 2026 PixeroJan), where we render via **Bases / Dataview**, where we
> must write **standalone code**, and where a **new `.base` view** is all we need.
> Companion to `DESIGN.md`. Derived from a source read of Storyline v1.10.41.

## 1. The guiding principle

**Frontmatter is the single source of truth. Bases/Dataview *render* it. Story
Forge *writes back* only to frontmatter (plain Properties via
`processFrontMatter`) — never to a plugin-owned store. Views are data (catalog
`.base` / query definitions), not hardcoded UI.**

Writing **is** in scope where it makes sense (drag a board card → write
`status`/`order`; add a graph edge → write a `[[wikilink]]` relation). The point
is not read-only — the point is **not owning the data**. As long as every write
sets a plain Property, the facts stay readable/editable from the Core Properties
UI, metadata-menu, meta-bind, a script, or any other tool.

**Why this matters:** Storyline is capable but *rigid and opinionated* because it
becomes the **owner** of the data through its `*Manager` / `UndoManager` / export
/ embedded-editor layer. We avoid that: behavior lives in the data, not the code.

## 2. What Storyline actually is (source findings)

- **No Bases, no Dataview.** It reads notes with `app.vault.read` + Obsidian's
  `parseYaml`, extracts frontmatter with a custom `MetadataParser`, and resolves
  `[[wikilinks]]` by **text matching** (`LinkScanner.buildEntityIndex`).
- **Facts live in frontmatter** (like our `_forge` model) — not in a DB. Good:
  the *data* model is compatible; only the *rendering* is 100 % custom TS.
- **It writes actively.** `SceneManager.updateScene` → `vault.modify`, cascade
  rename of title references, file relocation on act change, word-count stamping.
- **Every detail view is an inline editor** with auto-save + undo snapshots.
  This — not the display — is why so much of Storyline is bespoke.
- **Half the codebase is the "owning" layer** we deliberately do not replicate:
  `*Manager` services, `DocxConverter`, `PdfConverter`, `ScrivenerImporter`,
  `UndoManager`, `ExportService`, embedded CodeMirror editors.

## 3. Render-engine decoupling

Bases/Dataview are **read engines**. Any write is our own thin
`processFrontMatter` path and is **decoupled** from the render engine — a view
can be Bases-rendered *and* carry a write affordance.

**Spike checkpoint:** the Core **Bases table can edit property values inline**
(writes straight to frontmatter). If confirmed, the ②/④ views below get
"edit where it makes sense" **with no custom editor code** — the most
un-opinionated outcome. Verify during the Bases embedding spike (DESIGN §4).

## 4. The four categories

- **① Adopt from Storyline** — port concrete code/algorithm (MIT, keep the
  copyright notice).
- **② Bases/Dataview as engine** — declarative query; "follows the active note"
  via our `metadataCache` scoping glue. No custom renderer.
- **③ Standalone render code** — SVG/canvas/spatial layout no query can express.
- **④ New `.base` view only** — a catalog entry, no code (global, not
  note-scoped table/cards/list).

## 5. Per-view mapping

| View / Feature | Cat. | Rationale |
|---|---|---|
| **Characters-in-scene** (linked entities of active note + facts) | **②** | Declarative query; "linked from active note" via scoping layer |
| **Locations-in-scene** | **②** | Resolve `location`/`characters` fields |
| **Scene-details** (active scene's pov/characters/location/plotlines) | **②** | Scoped query on one note |
| **Characters overview** (all, grid/table) | **④** | Plain `.base` over `canon/character` |
| **Locations flat / Objects / Lore overview** | **④** | `.base` per `canon/*` tag |
| **Scene list / Navigator** (filter/sort) | **④** (opt ②) | `.base` over `manuscript/scene` |
| **Timeline — linear** (by `order`/date, act groups) | **②/④** | Sorted, grouped list |
| **Plotlines — list** (scenes per plotline, collapsible) | **②** | Group by `plotlines` |
| **Stats — counts/coverage** (words per status, char coverage) | **②** | Dataview `GROUP BY` / sums |
| **Locations — hierarchical** (world→area→building tree) | **③** | True nesting over `world` chain; Bases groups only flat |
| **Board / Kanban** (scenes in status columns) | **③ light** | Query declarative; column layout is custom DOM + drag→write `status` |
| **Timeline — swimlane** (horizontal lanes) | **③** | Horizontal lane positioning + drag |
| **Plotgrid** (matrix plotline × scene) | **③** | Cell state, sticky headers, zoom/pan; drag→write |
| **Plotlines — subway map** | **③ + ①** | Track/lane spatial layout; port `StorylineView` (subway) |
| **Story graph** (entities + relations as a network) | **③ + ①** | Force-directed SVG — **port `StoryGraph.ts`** |
| **Relationship map** (character relations) | **③ + ①** | **Port `RelationshipMap.ts`** |
| **Corkboard** (free cards on canvas) | **③** | Spatial canvas; may drop for our scope |
| **Stats — analytics** (pacing, setup/payoff, plot-hole, prose/echo) | **③** | Real computation, not a query |
| **Note-panel Inspector** (active note: facts + sections + portrait) | **② or ③ + ①** | If Bases inline-edit suffices → scoped embed (②); else custom layout from `Inspector.ts` (drop the auto-save/edit ownership) |

## 6. What to adopt (①) — concrete list

Only the genuinely custom, reusable parts, as a starting point (not 1:1):

- **`components/StoryGraph.ts` + `RelationshipMap.ts`** — force-directed
  simulation + SVG/pan/zoom. Highest value: a solved hard problem, exactly our ③.
- **`components/DragToPan.ts`, `VirtualScroller.ts`, `Tooltip.ts`** — small clean
  utilities for any ③ view.
- **`Inspector.ts` / `InfoPanel.ts` as a layout template** — the
  section/pill/portrait structure; drop the auto-save/edit logic.
- **`cleanWikilink()` alias handling** (`[[file|display]]`) as a pattern — but via
  `metadataCache`, not our own parser.

**Do not adopt:** the owning layer (`*Manager`, Undo, Export/Import, embedded
editors). Not because "read-only", but because that layer *is* the lock-in.

## 7. Roadmap (ties to DESIGN §5 phasing)

**v0.1 — the note-following core (② only):**
1. Characters-in-scene reference view (Dataview engine + scoping).
2. Locations-in-scene reference view.
3. Scene-details view for the active scene note.

**v0.2 — Bases + cheap overviews (④), plus the spike:**
4. Bases engine adapter + embedding spike — **including the inline-edit check**.
5. Overview `.base` catalog views: Characters, Locations, Objects, Lore, Scenes.
6. Timeline (linear) + Plotlines (list) as ②/④.

**Later — standalone views (③ + ①), prioritized separately:**
Story graph & relationship map (port first — highest value), then Location tree,
Board/Kanban (with drag→write), Plotgrid, Timeline swimlane, subway map,
Stats analytics, custom Inspector (only if Bases inline-edit is insufficient).

**Sequencing rule:** ② and ④ first (cheapest, prove the flexible substrate); let
the Bases inline-edit spike decide how much ③ the Inspector actually needs.
