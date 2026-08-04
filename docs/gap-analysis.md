# Story Forge — Gap Analysis (2026-07-26)

> A full audit of **what the design promised** against **what the code actually
> does**, taken after M6 (`007-interactive-views`) landed on `main` at `107392e`.
> The trigger: roughly half of the founding idea — *make Storyline more flexible,
> copy the good parts, be frontmatter-only, and implement views via Bases or
> Dataview* — feels unbuilt, because individual pieces were deferred milestone
> after milestone and never revisited.
>
> Method: read `DESIGN.md`, `build-plan.md`, `views-and-integration.md`,
> `view-roadmap.md`, `storyline-analysis.md` and every spec's *Won't Have*
> section, then verified each promise against `src/`, `catalog/`, `schema/` and
> `test/StoryForge/`. Every gap below cites code evidence, not recollection.
>
> Scope: this document **names and ranks** gaps. It does not decide them. Items
> already dropped by an explicit decision are listed as *closed*, not as gaps.

## 1. Verdict

The **spine is real and solid.** The contextual sidebar panel, the scoping and
reverse-index layer, the three query engines with the consent gate, the view
store, the import flow, the checksummed catalog, and five workspace views all
exist, are tested (1729 tests, 95 files green) and obey the write invariant.

What is missing is not spread evenly — it clusters in three places:

1. **The "views are data" promise is only half-wired.** The curated catalog can
   ship *only* Bases views; the import flow accepts *only* Dataview views; and
   every view the plugin actually renders is hardcoded TypeScript. The
   distribution machinery and the views the user sees barely overlap.
2. **The Codex is a table where it should be the plugin's centrepiece.** What
   ships is a `.base` over four fixed kinds. What is wanted is a hero-card grid
   over **open** categories with an **editor pane** beneath it — and *that*, not a
   third surface, is what the never-built "note panel" was reaching for (G5).
3. **The `③` view tier stalled at "read-only".** Locations tree removed,
   Timeline drag removed, Plotgrid reverted to read-only, subway map and the two
   `①` graph ports never started.

Counting the per-view table in `storyline-analysis.md §5` (19 rows): **7 shipped
as intended, 3 shipped on the wrong substrate, 2 shipped partially, 4 missing
(not by decision), 3 closed by decision.** The "about 50% missing" instinct is
accurate.

A fourth cluster surfaced during review of this document and is registered in
**§2.G**: the plugin drifted from Storyline as the reference model, and it has no
place to keep the *operational* state (undo history) that safe drag-and-drop
requires — which is part of why interactions kept retreating to read-only.

### 1.1 Two invariants, previously conflated

This audit initially read "frontmatter is truth" as "the plugin persists nothing".
That is stricter than the actual decision, and the over-strict reading is itself a
cause of gaps. The invariant splits in two:

- **Story data — frontmatter only.** Everything a story needs (facts, typed
  relations, status, order, `storyDay`) lives in the entity note's frontmatter as
  plain Properties, readable and writable by the Properties UI, metadata-menu,
  meta-bind or any script. This is the lock-in we refuse. It is intact today.
- **Operational state — the plugin directory is fair game.** Undo history for
  drag-and-drop, UI preferences, collapse state, view selection: none of this is
  story data, none of it belongs in a note, and keeping it in `data.json` (or a
  sibling file in the plugin folder) breaks no promise. Nothing here exists yet —
  see **G20**.

### 1.2 What extensibility means here (and what it does not)

The first draft of this audit treated "the plugin supports one story model" as a
flat failure. That over-shoots. The actual contract — the markdown-mason pattern
this repo took its store, catalog and consent code from (`DESIGN.md §3`) — is
narrower and more defensible:

- **`_forge` types and frontmatter are the default we build on.** The shipped
  schema, the vetted views, the curated catalog: that is the supported path, and
  it is meant to stay opinionated.
- **Other frontmatter arrives through user views, not through the plugin learning
  new schemas.** Someone writing an isekai adds `skills` to their characters and
  **authors or imports a view** that surfaces them. The plugin does not need to
  know what a skill is; it needs to render a view definition that does.
- **The building blocks stay ours and stay closed.** The user composes from what
  we ship — hero card, table, the Codex and side-panel surfaces — rather than
  bringing their own renderer. That is the boundary that keeps the plugin
  maintainable, and it is not a gap.
- **Replacement, not just addition.** The concrete case: a user dislikes what the
  shipped Codex base shows, writes their own `.base`, and uses it *instead of*
  ours. Curated views are a default, not a fixture.

One qualification, added after review: **user-defined categories are not an
optional extra of the Codex — they are its core feature.** Storyline sells it as
*"a unified hub for Characters, Locations, and your own custom categories (Props,
Factions, Magic Systems — whatever you need)"*. We ship four kinds; the user adds
creatures, organizations, cultures, systems. A Codex that only knows our four is
not the Codex we are rebuilding, so G20 is a **Codex requirement**, not a
substrate refinement.

### 1.3 Two interfaces, one content concept *(settled 2026-07-27)*

The first draft named surfaces by *obligation* — "Codex is substitutable, Anvil is
opinionated". That collapses the moment the Codex moves into the main window, which
is where it belongs. **Obligation is a property of a tab, not a naming axis.** The
names follow the interface, because that is what a user sees:

| Term | Kind | What it is |
|---|---|---|
| **Anvil** | interface | **Main window.** One view, tab switcher: **Codex · Timeline · Plotgrid · Plotlines · Board** |
| **Workbench** | interface | **Sidebar.** Follows the active note. Tabs: **Codex** (compact, drill-down), **Navigator**, imported user views |
| **Codex** | content | The story *objects*. **Not an interface** — it appears as the card grid in Anvil and the following tab in the Workbench |

*Codex is what you know; Anvil is what you shape; Workbench is what's at hand.*

Obligations then sit per tab: the **Codex** (in either interface) is substitutable;
the **management tabs** (Timeline, Plotgrid, Plotlines, Board) are deliberately
opinionated — configurable, not user-authored. **How a tab renders** (Bases,
Dataview, custom DOM) is an implementation detail and not a surface boundary.

G3, G5 and G20 below are corrected against this. Recorded in `DESIGN.md §2` and
`views-and-integration.md`; execution is #26.

### 1.4 Add-ons are never requirements

Dataview, metadata-menu, meta-bind and Calendarium are **detected and used where
they help, never required.** Everything falls back to native rendering when they
are absent. Consequence for this register: a declarative view is an **additional**
implementation of something that already works natively — never a replacement. G2
is corrected against this. Two obligations follow, both currently unmet: ship the
vault artifacts (G25), and document what each add-on adds and what is missing
without it (G14).

Longform is the one integration that does *not* end as an add-on: the plan is to
**absorb** it (§2.E / #3), because its ordering lives outside frontmatter and no
amount of syncing fixes that.

## 2. Gap register

Ranked by how much each blocks the founding idea. `Issue` = existing GitHub
issue, or `—` for gaps with no issue yet.

### A — The flexibility promise (views as data)

| ID | Gap | Issue |
|---|---|---|
| **G1** | Catalog and import flow cover **disjoint engines** | — |
| **G2** | The `_forge` view set is **hardcoded, not catalog data** | — |
| **G3** | Workspace views are **unconfigurable hardcoded renderers** | partial: #4, #8 |
| **G4** | **No scope/folder configuration** anywhere in settings | — |
| **G19** | Plugin ships **no custom Bases views** (hero cards) | — |
| **G20** | **User cannot extend entities** with own fields and see them | — |

**G1 — Catalog and import flow cover disjoint engines.**
*Promise:* `DESIGN.md §3` — one library, two provenances (`curated` | `imported`),
across the three engines of `§4` (Bases, Dataview DQL, DataviewJS).
*Reality:* `scripts/build-catalog.mjs:21` — *"engine: always `bases` — all
catalog entries are Bases .base files"*. `src/import/ViewDefinition.ts:19` —
`engine: "dataview-dql" | "dataviewjs"`. So a curated Dataview view cannot be
shipped and a user `.base` cannot be imported. The `bases` engine slot in the
registry exists and works (`src/engines/BasesFenceEngine.ts`) but nothing
user-facing can ever reach it through the import path.
*Impact — corrected after review.* The first draft said the machinery "serves five
static `.base` files". Too harsh: **importing DQL and DataviewJS views works
today**, and imported views appear as their own tabs in the Workbench next to the
Codex. What is genuinely missing is narrower and still real:

1. **Bases views cannot be imported** — a user's own `.base` has no route in.
2. **Curated Dataview views cannot be shipped** — the catalog builder rejects them.
3. **User views cannot be bound to the Anvil**, only to the Workbench. Custom views
   are wanted in *both* interfaces (`DESIGN.md §3`).

**G2 — The `_forge` view set is hardcoded, not catalog data.**
*Promise:* `DESIGN.md §3` — the curated catalog is *"seeded with the `_forge`
view set (Characters-in-scene, Locations-in-scene, …)"*;
`storyline-analysis.md §5` classifies all three as **②** (declarative query, no
custom renderer); the sequencing rule of `§7` is *"② and ④ first (cheapest,
prove the flexible substrate)"*.
*Reality:* they are TypeScript: `src/panel/renderers/{character,location,scene,
object,lore,plotline,book}.ts`, dispatched by a hardcoded table in
`src/panel/renderPanel.ts:72`. The catalog ships the five **④** global overviews
(`catalog/overview-*.base`) — which *were* delivered as promised — but not one
**②** note-scoped view.
*Impact:* the sequencing rule was inverted in practice. The substrate was never
proven, because the views that were supposed to prove it were hand-written
instead. Changing what a character panel shows is a code change and a release,
not a view edit.

*Not a replacement (§1.4).* Dataview is an add-on, so the hardcoded renderers
**stay** as the native path — the declarative versions are an *additional*
implementation the user can install, swap or edit. "Re-author as catalog data"
means adding a route, never removing the one that works without Dataview.

**G3 — Workspace views are unconfigurable hardcoded renderers.**
*Promise:* `storyline-analysis.md §1` — *"Views are data (catalog `.base` /
query definitions), not hardcoded UI"*; the stated reason Storyline is rigid.
*Reality:* `src/workspace/WorkspaceView.ts:54` — `WorkspaceLayout = "timeline" |
"plotlines" | "kanban" | "plotgrid"`, a closed union; Navigator is a fixed
built-in tab (`src/views/SidebarView.ts:899`). Columns, grouping keys, fields
shown, and sort are compiled in (e.g. `STATUS_VOCAB` at `WorkspaceView.ts:60`).
No workspace view is a store record, none appears in the catalog, none can be
duplicated or varied by the user.
*Impact — **corrected against §1.3**.* The first draft read this as "the rigidity
we set out to avoid, relocated", and asked for user-authored workspace views. That
over-reaches. Timeline, Kanban, Plotgrid, Plotlines and Navigator are **management
and overview** surfaces: they exist to survey and move work, not to display
arbitrary data, and being opinionated is part of their job. Storyline's rigidity
is not that its board has fixed columns — it is that its data is captive, and ours
is not.

So the real gap is **narrower**: not *"make them user-authored"* but *"make them
configurable"*. What is genuinely wrong is that the `status` vocabulary, the
grouping key, the visible columns/lanes and the scope are **compile-time
constants**, so #4 (Kanban by `act`) has to be shipped as a feature instead of
being a dropdown. The substitutability requirement of §1.3 lands on the
**entity/collection** surfaces instead (G19, G20).

**G4 — No scope/folder configuration.**
*Promise:* views scope to a book / a folder set the user controls (implied
throughout; recorded earlier as a deferred settings picker with `00 Meta` as the
default exclusion).
*Reality:* `PluginSettings` has three keys — `exampleSetting`, `linkClickAction`,
`curatedBasesFolder` (`src/types/index.ts:1-12`). Exclusions live in
`DEFAULT_EXCLUDED_FOLDERS` (`src/scoping/workspaceScope.ts`), and
`Codex.base` hardcodes folder inclusion.
*Impact:* the plugin only fits a vault laid out exactly like `test/StoryForge/`.
For a "no structure lock-in" plugin this is the sharpest contradiction.

**G19 — The plugin ships no custom Bases views.**
*Promise:* ADR-0001 decision 2 establishes `registerBasesView` as the sanctioned
way to render our own DOM inside a user's `.base` — we get the query, filter and
formula engine for free, and the result is interactive. The point of paying that
API-churn risk was to *use* it.
*Reality:* exactly one view type is registered, `story-forge-codex`
(`src/bases/BasesAdapter.ts`, wired at `src/main.ts:118`), and its only job is the
Codex. There is no **hero card** view type for characters, locations or objects —
the presentation that makes an entity browser feel like Storyline rather than a
spreadsheet — and no card/gallery/profile type a user could select in their own
`.base`.
*Impact:* the five curated entries are plain tables. A user who writes their own
`.base` gets whatever core Bases offers and nothing of ours, so the "build your
own view" path (G20) has almost no Story-Forge-specific building blocks to build
*with*. This is the cheapest large win in the register: the registration seam,
the adapter and the write path all already exist.

**G20 — The user cannot bring their own frontmatter into our surfaces.**
*Promise (per §1.2):* `_forge` is the default we build on and stays opinionated.
Everything beyond it arrives **through user-authored or imported views** — the
markdown-mason pattern. A user writing an isekai adds `skills` to their characters,
authors a view that surfaces them, and sees it rendered in our Codex and side
panel using our building blocks. The plugin never learns what a skill is; it
renders a view definition that does. Equally: a user who dislikes what our Codex
base shows writes their own `.base` and uses it **instead of** ours — curated views
are a default, not a fixture.
*Reality:* fields are compiled in three places: `schema/*.json` → generated vault
artifacts (regenerating requires the repo and `npm run schema:gen`),
`src/inspector/inspectorFields.ts` (the editable field list), and
`src/panel/kindFields.ts` (what the panel renders per kind). An unknown
frontmatter key is invisible everywhere; an unknown *entity kind* falls through
to the flat fallback renderer (`src/panel/renderPanel.ts:48`).
*Impact:* extending the model currently requires **forking the plugin**, because
the only route to a new field runs through `schema/*.json` and two compiled field
lists — not through a view. The "curated **+ user-authored**" library was supposed
to make the second route the normal one. Note what is *not* being asked for here:
no user-supplied renderers, no plugin-side schema inference. The user composes
from what we ship (G19's hero card, tables, the Codex and panel surfaces) and
points it at their own frontmatter.

*Smallest useful version:* a user `.base` or view definition can (a) be selected in
place of a curated one, and (b) name fields we have never heard of and get them
rendered by our card/table blocks. Everything else — a settings UI for schema
extension, per-kind panel sections — is a later refinement.

### B — Surfaces

| ID | Gap | Issue |
|---|---|---|
| **G5** | **Note panel surface never built** (surface 2 of 2) | — |
| **G6** | Codex is a `.base` file, not the entity browser | #6 |

**G5 — ~~Note panel surface never built~~ → the surface was a phantom; the
editor pane is real.**
*Promise:* `DESIGN.md §2` listed a third surface — a Storyline-style inspector
rendering *in/with* the active note — and flagged it as *"the surface that cannot
be produced by Bases"*, with an A/B decision (hand-coded vs. embedded Bases) to
settle.
*Reality:* deferred in `002` (l.170), `004` (l.358), `005` (l.400 + l.632), `006`
(l.221), `007` (l.211). No code, no spec, no decision.

***Reframed after review (2026-07-27).*** The description quotes Storyline's Scene
Details inspector — *"a standalone inspector panel that follows the active editor
file"* — which **is a sidebar**. It was written before the Workbench existed and
describes it. There is no third surface, and the A/B question is moot: ADR-0001
establishes that Bases inline editing is not exposed to plugins, so (B) was never
available.

What is real, and what this gap now tracks, is the **editor pane** — and it has two
homes inside the interfaces we already have:

1. **Anvil → Codex tab:** select a hero card, edit that note's frontmatter in the
   lower half. This is the primary one, and it does not exist.
2. **Workbench → Codex tab:** the compact form. Partly exists —
   `InspectorController` + `editableFields` commit scalars and enums today; lists
   and relations do not (G13).

*Impact:* one of the three headline gaps shrinks from "a whole surface, deferred
five times" to "the editor pane is missing in Anvil and incomplete in the
Workbench". Issue #21 is re-pointed accordingly.

**G6 — Codex is a `.base` file, not the entity browser.**
*Promise:* `views-and-integration.md` — Codex = hub with category tabs, grid per
category, click → detail.
*Reality:* `Codex.base` seeded in the vault + a registered `story-forge-codex`
Bases view type + `src/codex/CodexView.ts`, a degrade stub for when Bases is off
(`src/main.ts:86`). Bases chrome cannot render the tab strip, which is why #6
exists.
*Scope, sharpened by §1.3:* the Codex tab in Anvil is a **hero-card grid over open
categories, with the editor pane below** (G5). It ships four kinds; the user adds
creatures, organizations, cultures, systems through a view they author (G20). #6,
#12, #13 and #21 are four faces of this one surface and should be specced together.

### C — The `③` view tier

| ID | Gap | Issue |
|---|---|---|
| **G7** | **Locations hierarchical tree removed**, not deferred cleanly | — (folded into #6) |
| **G8** | Timeline drag → `storyDay` unbuilt (M6 exit criterion) | #7 |
| **G9** | Plotgrid cell toggle reverted to read-only (M6 exit criterion) | #8 |
| **G10** | Plotlines subway map unbuilt | #5 |
| **G11** | Story graph / relationship map: **"core graph is the MVP" ships nothing** | — |
| **G12** | Kanban `act`/`pov` grouping unbuilt | #4 |

**G7 — Locations hierarchical tree.**
*Promise:* `build-plan.md` M6 bullet 4 and `views-and-integration.md` — nest over
the `world` chain; `storyline-analysis.md §5` rates it **③** *"true nesting over
`world` chain; Bases groups only flat"*.
*Reality:* removed mid-spec — `007/requirements.md:19`: *"F4 Locations tree is
REMOVED — it belongs in the Codex"*. What exists is a **single-level** breadcrumb:
`src/panel/renderers/location.ts:15` — *"DV-2: the Within breadcrumb is a single
level — we do NOT recurse the world chain"*, plus child backlinks (l.169).
*Impact:* an M6 exit criterion silently became someone else's problem (#6, which
does not mention the tree). This is the clearest instance of the "pushed to later
and then never really implemented" pattern.

**G11 — Story graph: the MVP claim is unbacked.**
*Promise:* `views-and-integration.md` — *"use the core Obsidian graph with tag
colour-groups (`canon/*`) and a filter to `30 Canon`"* as the MVP; the
`StoryGraph.ts` / `RelationshipMap.ts` ports are the highest-value **①** items in
`storyline-analysis.md §6`.
*Reality:* nothing ships for either. No graph colour-group preset, no saved
filter, no documentation of the setup, nothing in `test/StoryForge/`, no command.
"The core graph is the MVP" is a decision that was recorded but never executed —
the user still has to configure it by hand, unguided.
*Impact:* relations are the heart of the `_forge` model and currently have no
visual surface at all. Either ship the graph preset (cheap) or accept the port as
real scope; today it is neither.

**G8 / G9 / G10 / G12** are correctly tracked in #7, #8, #5, #4. Worth noting
that G8 and G9 were **M6 exit criteria** in `build-plan.md` ("Timeline placement:
drag a card → write `storyDay`"; "Plotgrid: toggle cell → write the scene's
`plotlines`"), so M6 shipped against a reduced bar. G9 was a deliberate,
well-reasoned reversal (a bare click must not mutate — it emptied five vault
notes); it still leaves the promise open.

### D — Write-back and editing

| ID | Gap | Issue |
|---|---|---|
| **G13** | Inspector edits **scalars/enums only** — no relation editing | — |
| **G14** | metadata-menu / meta-bind: **provision + documentation**, not integration | — |
| **G25** | The plugin **ships no vault artifacts** — a fresh install gets nothing | — |
| **G26** | Codex Cards have **no seam for computed stats** — S91's scene-count line is unbuilt | **#29** |

**G13 — Relations cannot be edited.**
*Promise:* `storyline-analysis.md §1` — *"writing **is** in scope where it makes
sense (drag a board card → write `status`/`order`; **add a graph edge → write a
`[[wikilink]]` relation**)"*.
*Reality:* `src/inspector/inspectorFields.ts` declares `list` and `relation`
field types, but wikilink-chip list editing is explicitly a *Could* in
`005/requirements.md` (*"Full editable Inspector (wikilink-chip lists, rich
validation)"*). Live editing is scalar/enum commits through
`src/inspector/frontmatterWriter.ts`.
*Impact:* the model is relation-centric (`pov`, `characters`, `location`,
`plotlines`, `world`, `owner`, `related`); the one thing the panel cannot edit is
the thing the model is made of.

**G14 — The "reuse over rebuild" pillar is unrealised for editing.**
*Promise:* `views-and-integration.md` division-of-labour table — field editing and
value lists → **metadata-menu**; inline fields/portrait in notes → **meta-bind**.
*Reality:* the generated FileClasses exist under `test/StoryForge/00 Meta/`
(`npm run schema:gen`), which is the vault half. The plugin half is absent: no
`VIEW[]`/`INPUT[]` emission, no metadata-menu detection, no guidance, no
degradation path when either plugin is missing.
*Impact:* two of the six "owners" in the division-of-labour table own nothing in
practice, so their work falls back to G13 (which cannot do it) or to raw
frontmatter.

***Re-scoped after review.*** The original framing — *"decide: delegate to them or
own the editing path"* — posed a false choice. **Neither plugin is ever required**
(§1.4). What we owe is not integration but **provision and documentation**:

- **ship** the FileClasses, the Templater and core-template templates (with the
  `VIEW[]` parts once they exist), and the Schema reference — see **G25**;
- **document** what installing metadata-menu or meta-bind adds, and precisely what
  a user is missing without it;
- **never** let a feature depend on either being present; if one ever does, say so
  loudly in the docs.

**G25 — The plugin ships no vault artifacts at all.**
*Reality:* the FileClasses, entity/scene templates and the human-readable `Schema/`
reference are generated by `npm run schema:gen` **into `test/StoryForge/00 Meta/`**.
That is the development vault. A user who installs Story Forge from the community
directory gets **none of it** — no FileClasses for metadata-menu, no templates, no
schema reference. There is no seeding path, no "set up my vault" command, no docs
telling them what to create by hand.
*Impact:* the `_forge` model is the default we build on (§1.2), and a fresh install
cannot reproduce it. Every add-on story above (metadata-menu value lists, meta-bind
inputs, Templater scene creation) is unreachable in practice, and it silently
assumes a vault laid out like ours — the same root as G4. Found while resolving the
G14 comment; it was not in the original register.

**G26 — Codex Cards cannot show a computed stat.**
*Promise:* signed-off mockup **S91** ends every Hero card with a scene count —
`12 scenes`, `4 scenes`, `3 scenes` (the `.hx` element,
`docs/mockups/anvil-workbench-codex.html:613-623`).
*Reality:* unbuilt, and spec 008's Phase 4 closed without it. `CardEntry` — the entry
shape frozen by T4.2 — exposes only `path`, `name` and `field(id)`, so **every value a
Card can read is a property of the note**. A scene count is not: it is an aggregate
over **backlinks**, and the Codex runs no backlink query. Adding it means extending a
contract that T4.3, T4.4 and T4.5 already build on, **plus** a backlink source with
its own caching and invalidation — the count changes when some *other* note edits a
link, not when this one does.
*Impact:* small in isolation — one line missing from a card — but it is the **only
signed-off S91 element that does not ship**, and the seam it needs is the same one any
future computed value would use (reference counts, unresolved-link warnings, "appears
in N chapters"). Two constraints will shape it: both backends must agree, or Hero
renders differently inside a user's `.base` than in the Anvil; and the obvious backlink
API (`getBacklinksForFile`) is **not** in the public `obsidian.d.ts` surface, which
spec 008 already established as a line not to cross — ADR-36 was implemented against
the public `apiVersion` precisely to avoid reaching into undocumented `app` internals.
*Recorded* at the Phase 4 close-out (2026-08-04) so the gap outlives the closed spec:
the T4.3 implementer declined to reopen the contract unilaterally, and the user ruled
it a deferral rather than a mid-phase contract change.

### E — Integrations and schema

| ID | Gap | Issue |
|---|---|---|
| **G15** | Longform: **absorb it, don't sync** — scheduled after Storyline parity | #3 |
| **G16** | **User-defined calendars** (not a Calendarium integration) | #25 |

**G15 —** the division of labour says *"Longform owns the manuscript; we never
touch it"*, and `order`/`storyDay` are kept as separate axes so the two tools do
not fight. Two frictions make that stance temporary: Longform stores **scene
order in its own index note** (not in frontmatter, so it is invisible to every
frontmatter-driven view) and keeps **story versions as separate directories**.
The current expectation is that Story Forge eventually **takes that role over and
adapts it**, rather than syncing forever against a second source of truth. That
is an end-game item — but it changes what "integration" means: not a bridge, a
replacement.

***Sharpened after review.*** **Do not build a sync mechanism** for scene
sequence — it is wasted work against a second source of truth. The plan:

- **When:** directly after the Storyline adaptation works. Not "someday".
- **How:** absorb Longform and rewrite that part frontmatter-only. The candidate is
  a **`version` property** on scenes, so versions become a *filter* over one set of
  notes instead of duplicated directories.
- **The two quirks being fixed:** versions as directories (duplicate notes), and a
  version file holding scene order as a plain list *without* wikilinks — renames
  break it, and reordering via frontmatter never reaches Longform.
- **The boundary that stays:** Longform is *not* a full editor, and we are not
  building one either. That is precisely what we like about it.
- **Feasibility:** Longform is unmaintained and its author is looking for a
  maintainer (<https://github.com/kevboh/longform>).
- **To verify first:** what else Longform covers that we would inherit — compile
  and export in particular.

**G16 — ~~Calendarium~~ → user-defined calendars.**
*Reality:* `schema/scene.json` carries `storyDay` + `when` and states that an
absolute calendar-aware date is *"a planned optional addition — not part of the
schema yet"*.
***Re-scoped twice after review (2026-07-27).***

**No calendar interface from us — for now.** What is wanted is to *display* in-world
date information where the writer already works: Plotgrid, Timeline, Codex cards.
Calendarium can own the visual calendar; we do not build one.

**Storage: configurable field mapping, never a sync.** Calendarium reads its own
frontmatter keys (`fc-calendar`, `fc-date`, …) to place an event. Two options were
on the table:

- *Sync* — keep our own `storyDate` and mirror it into `fc-*`. **Rejected.** It
  writes the same fact twice into one note: two sources of truth inside a single
  file, which is the Longform failure mode (§2.E) in miniature. Every sync needs a
  conflict policy — the user edits in Calendarium, we hold our copy, who wins? —
  and every conflict policy eventually loses data. It also makes our schema depend
  on Calendarium's shape anyway, which is the worst of both.
- *Configurable mapping* — **chosen.** The absolute date is **not a field of ours**
  but a **configured key**, defaulting to `fc-date` when Calendarium is detected;
  likewise a configured "which calendar" key defaulting to `fc-calendar`. We read
  it and render it. We never write both; if we write at all, we write the mapped
  key. This is what §1.1 means in practice: the fact lives once, wherever the
  user's ecosystem already keeps it.

Multiple calendars then come for free — `fc-calendar` already models them.

**The scope line that halves this gap:**

| Capability | Requires |
|---|---|
| **Display** a date (what is wanted now) | just the configured key — trivial |
| **Compute** with a date (sort, "two weeks later") | a calendar definition — 13 months, 8-day weeks, 48-hour days |

Display is cheap and unblocks Plotgrid/Timeline. Computation stays deferred.

**Unverified — spike before building:** the exact value shape of `fc-date` (plain
string vs. nested `{year, month, day}`). Neither the Calendarium docs site nor the
GitHub README returned usable content when checked on 2026-07-27. If it is
structured, a small reader plus a display formatter is needed; sorting on it needs
the calendar definition and therefore belongs to the deferred half.

### F — Hygiene (small, cheap, blocking nothing)

| ID | Gap | Issue |
|---|---|---|
| **G17** | Sample-plugin residue: `exampleSetting` in settings + UI | — |
| **G18** | Version drift: `0.2.0` while M5 and M6 shipped | — |

**G17** — `src/types/index.ts:2` (`exampleSetting: string`) and the "Example
setting" control at `src/settings/SettingsTab.ts:104`. This is an explicit
community-submission blocker under the obsidian-plugin rules; it costs minutes.
**G18** — `manifest.json` and `package.json` are at `0.2.0`; `build-plan.md` has
M5 shipping v0.3 and M6 v0.4. Release CI is intentionally paused, so nothing is
broken — but the version no longer identifies what is installed.

### G — Reference fidelity, interaction safety, process

| ID | Gap | Issue |
|---|---|---|
| **G21** | **Drift from Storyline** as the reference model, repeatedly | — |
| **G22** | **No undo for view writes** — why interactions retreat to read-only | — |
| **G23** | Mockups get signed off, then **not implemented as approved** | — |
| **G24** | The **management surface has no name**; "Codex" names only a collection | — |

**G21 — Drift from the reference model.**
*Promise:* `DESIGN.md §1` — *"View model → Storyline … We reproduce the views we
want, driven off `_forge` properties"*; `storyline-analysis.md` exists solely to
map Storyline view-by-view. The intent was: **copy what Storyline does well**,
refuse only its ownership layer.
*Reality:* deviations accumulated without ever being weighed against Storyline —
the Plotgrid became scenes × plotlines with "richer cells" and then read-only;
the Codex became a `.base` table instead of a card browser (G19); the Locations
tree was dropped (G7); the Inspector renders our own field list rather than
Storyline's section/pill/portrait template, which `storyline-analysis.md §6`
explicitly named as an adoptable layout. Each deviation had a local reason; none
was recorded as *"here is where we deliberately differ from Storyline, and why"*.
*Impact:* the reference model stopped being a check on the work. The correction
is not "copy Storyline literally" — it is that a deviation must be a **decision**
with a reason, not a side effect. Two concrete mechanisms: a per-view fidelity
pass against Storyline v1.10.41 that records adopt / deviate / reject per view,
and a deviation note in each spec's decision log.

**G22 — No undo for view writes.**
*Promise:* none, historically — undo was classed as part of Storyline's *owning*
layer (`storyline-analysis.md §6`: *"Do not adopt: the owning layer (`*Manager`,
Undo, …)"*) and therefore refused.
*Reality:* that refusal conflated two things. Storyline's `UndoManager` is
objectionable because it sits on a plugin-owned data model — but an undo history
for *our own writes* is operational state (§1.1), belongs in the plugin
directory, and takes nothing away from frontmatter being truth. Today a drag
writes through `frontmatterWriter.commit`/`commitMany` with no journal, no
"undo last change", and no batch revert. Obsidian's editor undo does not cover
`processFrontMatter` writes from a plugin view.
*Impact:* **this is the root cause behind two other gaps.** Plotgrid was reverted
to read-only (G9) after a click-toggle emptied five vault notes, and Timeline
drag (G8) was never enabled — in both cases because a wrong write was
unrecoverable. Ship a plugin-local undo journal (last N writes, file + field +
previous value, "undo last Story Forge change" command) and the write-back tier
becomes safe enough to finish. Sequence it **before** #7 and #8, not after.

**G23 — Approved mockups are not the delivered thing.**
*Promise:* the working agreement is mockups-first — author HTML states in the
spec's `mockups.html`, get sign-off, *then* build what was signed off.
*Reality:* the practice degrades in two ways: mockups get written as a
by-the-way artifact rather than a review gate, and after sign-off the
implementation diverges without the mockup being updated or the divergence
flagged. `007`'s mockups were re-synced *after* the code changed (commits
`1e53275`, `107392e` — "sync spec + mockups"), which is the tell: the mockup
became a record of what was built rather than a specification of what to build.
*Impact:* process, not code — but it is the mechanism by which G21 happens. Fix:
sign-off is a gate; post-sign-off divergence is raised before it is coded, not
documented afterwards.

**G24 — The two surface classes are not named.**
*Reality:* §1.3 establishes the interfaces and their obligations; neither had
a usable public name.

- **"Codex"** names the *collection* well — characters, locations, objects, lore —
  but it is currently just `Codex.base`, and the class is bigger than one base.
- The **management class has no name at all.** Internally it is `WorkspaceView`;
  externally there is no surface, only four commands, one of which — **"Open
  Timeline"** — is the entry point behind which Kanban, Plotgrid, Plotlines,
  swimlanes and zoom actually live. A user has no way to learn that these are one
  thing, and no vocabulary for "the place where I manage the manuscript".

*Impact:* naming is not cosmetic here. The argument of §1.3 — *this tab is
substitutable, that one is deliberately opinionated* — cannot be explained to a
user who has no word for either interface. It also blocks honest UI: a surface
picker, a settings section, and the docs all need the noun first.

**DECIDED — see §1.3 for the settled model.** Two rounds:

1. **2026-07-26:** `Codex` and `Anvil`. This still named the classes by
   *obligation*, which broke as soon as the Codex moved into the main window.
2. **2026-07-27:** corrected to **three terms on two axes** — `Anvil` (main-window
   interface) and `Workbench` (sidebar interface) are the *interfaces*; `Codex` is
   *content* that appears in both. Obligation became a property of each tab.
   `Workbench` was chosen for the sidebar: the bench beside the anvil, where what
   you need lies ready.

The Codex main view lives **as a tab inside Anvil**, not as a third interface — one
main-window surface, one switcher, one command. That a Codex tab is substitutable
while a Timeline tab is not is a property of the tab, never a reason for a second
window.

*Done when:* the four `open-*` commands become **one Anvil view with a tab
switcher**; `WorkspaceView`/`WorkspaceLayout` and the CSS prefixes are renamed;
`Anvil`/`Workbench`/`Codex` are used consistently in commands, settings, docs and
mockups; and the per-tab obligations are stated in those terms. Tracked as **#26**.

## 3. Closed by decision (not gaps)

Recorded so they are not re-opened by accident:

- **Corkboard**, **manuscript view** (Longform owns it), **stats/analytics**, and
  **plot-holes/warnings** — dropped in `views-and-integration.md`; the analysis
  track lives in the `_forge` Claude skills (`claude-skills.md`).
- **Storyline's owning layer** (`*Manager`, export/import, embedded editors) —
  still refused. **Revised in one respect:** the blanket refusal of *undo* was an
  over-reach; see G22. What we reject is a plugin-owned *data* model, not a
  journal of our own writes.
- **Bases inline-edit reuse** — impossible, not deferred: ADR-0001 establishes
  there is no public API for Bases cell read/write. This is why the Inspector is
  custom DOM (`③`), and it retroactively answers the `S0` spike gate in
  `view-roadmap.md:58`. The `DESIGN.md §2` A/B note-panel decision, however, still
  stands open (see G5).
- **Plotgrid click-to-toggle** — reverted deliberately after data loss; the
  replacement affordance is #8, not a return to click-mutates.

## 4. Issue coverage

Filed 2026-07-26 as four epics with native GitHub sub-issues (no project board —
the sub-issue links carry the structure). Epics are labelled `epic`, everything
from this document `gap-analysis`.

**#9 — Epic: Views as data — the flexible substrate**

| Gap | Issue |
|---|---|
| G1 catalog/import engine split | **#10** |
| G2 `_forge` view set as catalog data | **#11** |
| G19 hero-card Bases view types | **#12** |
| G20 user-extensible entities | **#13** |
| G4 scope/folder settings | **#14** |
| G25 ship the vault artifacts | **#27** |
| G26 computed-stats seam for Cards (S91's scene count) | **#29** |
| G3 management tabs **configurable** (revised) | **#15** ← absorbs #4 (Kanban by act) |
| G24 the Anvil / Workbench / Codex vocabulary | **#26** |

**#16 — Epic: Safe write-back — undo, then finish the interaction tier**

| Gap | Issue |
|---|---|
| G22 undo journal | **#17** — precondition for #7 and #8 |
| G13 relation editing | **#18** |
| G14 metadata-menu / meta-bind (documentation) | **#19** |
| G8 Timeline drag → `storyDay` | #7 (existing) |
| G9 Plotgrid write affordance | #8 (existing) |

**#20 — Epic: Surfaces — finish what the plugin renders into**

| Gap | Issue |
|---|---|
| G5 **Codex editor pane** (was: note-panel surface) | **#21** |
| G7 Locations tree | **#22** |
| G11 story graph preset / ports | **#23** |
| G10 subway map — **wanted in this version** | #5 (existing) |
| G6 Codex card grid + open categories | #6 (existing) |
| — contextual view switcher | #1 (existing, UX refinement) |

**#24 — Epic: Storyline fidelity — deviations must be decisions** (G21; no
children — it is a pass over the existing view set, not new work)

**Unparented:** **#25** (G16 — re-scoped to user-defined calendars, no longer a
Calendarium dependency) and **#3** (G15, Longform — carries the absorption plan).

**Not filed on purpose:** G17 (sample residue) and G18 (version drift) are
minutes of work, not tracked items. **G23** (mockup discipline) is now a repo rule
in `CLAUDE.md`, alongside the two invariants from §1.1 and the Storyline-fidelity
rule — process belongs where it binds the next change, not on a board.

## 5. Recommended sequence

Ordered by *how much of the founding idea each unlocks per unit of work*, not by
size. Nothing here is scheduled — this is the argument for an order, not a plan.

0. **G24 — ✅ settled** (§1.3): `Anvil`, `Workbench`, `Codex`. What remains is
   execution — fold the four commands into one Anvil view with a tab switcher
   (#26) — and it belongs *inside* step 1, not before it: every item there writes
   UI text and settings labels that need this vocabulary, and doing it separately
   means writing those strings twice.
1. **HTML mockups of both interfaces, and sign-off — before any code.** Anvil with
   its tab switcher, the Workbench with its tabs, and the Codex card grid with the
   editor pane beneath. This is the cheapest possible test of whether §1.3 holds,
   and by the repo rule it is a gate, not a record.
2. **The Codex, as one spec — G1 + G2 + G19 + G20 + G5 + G6.** These are six
   register entries and *one surface*: engine coverage unified across catalog and
   import (G1), the `_forge` note-scoped views added as catalog data with the
   native renderers kept as the fallback (G2), hero-card Bases view types (G19),
   open categories reachable through a user-authored view (G20), the editor pane
   beneath the grid (G5) — which together *are* the entity browser (G6). Specced
   apart they will be built three times.
3. **G22 — the undo journal.** Cheap, plugin-local, and the precondition for
   finishing the write-back tier: do it **before** #7 and #8, which were both
   blocked by exactly the risk it removes.
4. **G25 + G4 — make a fresh install work.** Ship the vault artifacts and let the
   user say where their story lives. Together these decide whether anyone but us
   can run the plugin at all; neither is large.
5. **G21 — the Storyline fidelity pass.** Do it *while* step 2 is being specced,
   so the Codex is measured against the reference before it is built rather than
   after.
6. **G13 + G14 — relation editing.** Ship the chips (G13); for the add-ons, ship
   the documentation rather than an integration (G14, §1.4).
7. **G3 — make the management tabs configurable** (grouping key, visible
   columns/lanes, status vocabulary, scope). A settings job, not a substrate job
   (§1.3). Absorbs #4.
8. **The `③` backlog:** #7 and #8 (both unblocked by step 3), then **#5 — the
   subway map, now wanted in this version**, then G11 and G7.
9. **G16 — user-defined calendars.** Self-contained; schedule it when the Timeline
   is next opened rather than as its own milestone.
10. **G15 — absorb Longform**, deliberately after Storyline parity. A scope
    decision, not a task.
11. **G17, G18** — minutes, not milestones; do them opportunistically.

**G23 is not in this list** because it is not work — it is how the work is done.
It applies from the next spec onward.

M7 (`release-hardening`) should stay where it is: hardening a plugin whose
substrate is still being decided would have to be redone.
