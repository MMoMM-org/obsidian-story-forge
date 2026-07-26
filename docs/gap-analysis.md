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
2. **The second surface (note panel) was never built.** It was deferred in five
   consecutive specs. It is explicitly the surface Bases cannot produce, so
   deferring it also deferred the reason the plugin owns rendering code at all.
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

Two Longform frictions sit on the story-data side and are **deliberately unsolved
for now**: Longform keeps scene order in its own index note, and story versions
are separate directories. The expected end-game is taking Longform's role over
and adapting it, rather than syncing against it (see §2.E / #3). Until then,
Timeline/Kanban keep `order` and `storyDay` as separate axes and never write
Longform's ordering.

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
*Impact:* the trust/distribution machinery — the single most-copied piece from
markdown-mason — serves five static `.base` files. The "user-authored library"
half is Dataview-only by accident, not by decision.

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

**G3 — Workspace views are unconfigurable hardcoded renderers.**
*Promise:* `storyline-analysis.md §1` — *"Views are data (catalog `.base` /
query definitions), not hardcoded UI"*; the stated reason Storyline is rigid.
*Reality:* `src/workspace/WorkspaceView.ts:54` — `WorkspaceLayout = "timeline" |
"plotlines" | "kanban" | "plotgrid"`, a closed union; Navigator is a fixed
built-in tab (`src/views/SidebarView.ts:899`). Columns, grouping keys, fields
shown, and sort are compiled in (e.g. `STATUS_VOCAB` at `WorkspaceView.ts:60`).
No workspace view is a store record, none appears in the catalog, none can be
duplicated or varied by the user.
*Impact:* this is the rigidity we set out to avoid, relocated. We do not own the
*data* — that invariant holds — but we fully own the *views*, which is the other
half of what makes Storyline inflexible. #4 (Kanban by act) and #8 (configurable
Plotgrid) are symptoms of this; the general case has no issue.

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

**G20 — Entities cannot be extended by the user.**
*Promise:* the substrate is meant to be genre-agnostic — a user writing an isekai
adds `skills` to characters, builds a skill codex, and sees skills in the sidebar
panel, without the plugin knowing what a skill is.
*Reality:* fields are compiled in three places: `schema/*.json` → generated vault
artifacts (regenerating requires the repo and `npm run schema:gen`),
`src/inspector/inspectorFields.ts` (the editable field list), and
`src/panel/kindFields.ts` (what the panel renders per kind). An unknown
frontmatter key is invisible everywhere; an unknown *entity kind* falls through
to the flat fallback renderer (`src/panel/renderPanel.ts:48`).
*Impact:* the plugin currently supports **one** story model — the `_forge` model
that ships with it. Every other genre is a fork or a pull request. This is the
same rigidity as G3, one layer down, and it is what the "curated **+
user-authored**" library was supposed to prevent.

### B — Surfaces

| ID | Gap | Issue |
|---|---|---|
| **G5** | **Note panel surface never built** (surface 2 of 2) | — |
| **G6** | Codex is a `.base` file, not the entity browser | #6 |

**G5 — Note panel surface never built.**
*Promise:* `DESIGN.md §2` — *two* surfaces, *"Storyline has both; the user wants
both"*; and `§2` flags it as **"the surface that cannot be produced by Bases and
therefore needs custom rendering code"**. `DESIGN.md §5` schedules it in slice 2,
item 10, with an explicit A/B decision to settle.
*Reality:* deferred in `002` (l.170), `004` (l.358), `005` (l.400, and again in
the Won't table l.632), `006` (l.221), `007` (l.211). No code, no spec, no issue.
The A/B decision from `DESIGN.md §2` was never made.
*Impact:* half the surface model is unbuilt after six milestones. The panel it
would host — Storyline's "Scene Details" inspector, the single feature the tool
is best known for — has no home.

**G6 — Codex is a `.base` file, not the entity browser.**
*Promise:* `views-and-integration.md` — Codex = hub with category tabs, grid per
category, click → detail in the contextual panel.
*Reality:* `Codex.base` seeded in the vault + a registered `story-forge-codex`
Bases view type + `src/codex/CodexView.ts`, a degrade stub for when Bases is off
(`src/main.ts:86`). Bases chrome cannot render the tab strip, which is exactly
why #6 exists.
*Impact:* known and tracked. Listed for completeness.

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
| **G14** | metadata-menu / meta-bind "reuse" is asserted, **never wired** | — |

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

### E — Integrations and schema

| ID | Gap | Issue |
|---|---|---|
| **G15** | Longform: documented, not built; **end-game is takeover** | #3 |
| **G16** | Calendarium / `storyDate` absent; `when` is display-only | — |

**G15 —** the division of labour says *"Longform owns the manuscript; we never
touch it"*, and `order`/`storyDay` are kept as separate axes so the two tools do
not fight. Two frictions make that stance temporary: Longform stores **scene
order in its own index note** (not in frontmatter, so it is invisible to every
frontmatter-driven view) and keeps **story versions as separate directories**.
The current expectation is that Story Forge eventually **takes that role over and
adapts it**, rather than syncing forever against a second source of truth. That
is an end-game item, deliberately not scheduled — but it should be recorded on
#3, because it changes what "integration" means: not a bridge, a replacement.

**G16 —** `views-and-integration.md` designs `storyDate` forward-compatibly and
*"two-calendar-aware"*; `schema/scene.json` carries `storyDay` + `when` and says
so explicitly (*"a calendar-aware absolute date … is a planned optional addition —
not part of the schema yet"*). That is an honest deferral, not drift — recorded
so it is not rediscovered a third time.

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

| Gap | Existing issue | Action |
|---|---|---|
| G1 catalog/import engine split | — | **file** |
| G2 `_forge` view set as data | — | **file** |
| G3 workspace views as data | #4, #8 (symptoms) | **file umbrella** |
| G4 scope/folder settings | — | **file** |
| G5 note panel surface | — | **file** (decide A/B first) |
| G6 Codex entity browser | #6 | tracked |
| G7 Locations tree | — (#6 does not cover it) | **file or amend #6** |
| G8 Timeline drag → `storyDay` | #7 | tracked |
| G9 Plotgrid write affordance | #8 | tracked |
| G10 Subway map | #5 | tracked |
| G11 Story graph preset / ports | — | **file** |
| G12 Kanban by act | #4 | tracked |
| G13 Relation editing | — | **file** |
| G14 metadata-menu / meta-bind | — | **file** |
| G15 Longform | #3 | tracked |
| G16 Calendarium / `storyDate` | — | file (low) |
| G17 sample residue | — | fix directly, no issue |
| G18 version drift | — | fix directly, no issue |
| G19 hero-card Bases views | — | **file** |
| G20 user-extensible entities | — | **file** |
| G21 Storyline fidelity | — | **file** |
| G22 undo journal | — | **file** (unblocks #7, #8) |
| G23 mockup discipline | — | repo rule, not an issue |

Also open and unmapped to a gap: **#1** (contextual view switcher — filter tabs by
active-note kind), a UX refinement rather than a structural gap.

## 5. Recommended sequence

Ordered by *how much of the founding idea each unlocks per unit of work*, not by
size. Nothing here is scheduled — this is the argument for an order, not a plan.

1. **G1 + G2 + G19 + G20 together — make the substrate real.** One spec, because
   they are one idea: unify the engine coverage across catalog and import (G1),
   re-author the three `_forge` note-scoped views as catalog view definitions so
   the hardcoded renderers become the zero-dependency fallback rather than the
   only implementation (G2), ship hero-card Bases view types the user can select
   in their own `.base` (G19), and make unknown fields and kinds render instead
   of vanish (G20). Together these are the "pick a view, or build your own —
   including for a story model we never anticipated" promise. Everything else in
   this register is smaller than this.
2. **G22 — the undo journal.** Cheap, plugin-local, and it is the precondition
   for finishing the write-back tier: do it **before** #7 and #8, which were both
   blocked by exactly the risk it removes.
3. **G4 — scope settings.** Small, and it removes the vault-layout lock-in that
   currently contradicts the plugin's core claim.
4. **G21 — the Storyline fidelity pass.** Do it *while* the substrate work is
   being specced, so the new views are measured against the reference before they
   are built rather than after.
5. **G5 — decide the note panel A/B, then build the smaller of the two.** Six
   milestones of deferral is a decision by default; make it deliberately.
6. **G13 + G14 — relation editing.** Decide once whether relations are edited by
   us (chips) or by meta-bind/metadata-menu, then ship that path. Today neither
   exists, which is the worst of both.
7. **G3 — workspace views as data.** The largest item; #4 and #8 fold into it and
   should not be built separately first.
8. **G11, G7, then the tracked `③` backlog** (#7, #8, #5, #6).
9. **G15 — the Longform question**, last and deliberately: taking over ordering
   and versioning is a scope decision, not a task.
10. **G17, G18** — do them opportunistically; they are minutes, not milestones.

**G23 is not in this list** because it is not work — it is how the work is done.
It applies from the next spec onward.

M7 (`release-hardening`) should stay where it is: hardening a plugin whose
substrate is still being decided would have to be redone.
