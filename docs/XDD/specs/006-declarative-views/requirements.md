---
title: "M5 — Declarative Workspace Views (Timeline + Plotlines)"
status: draft
version: "1.0"
---

# Product Requirements Document

> **v2.0 reground note (2026-07-23).** After reviewing the redrawn mockups against the MIT-licensed
> obsidian-storyline plugin, the surface and scope were refined (see the spec README decision log +
> SDD v2.0). Deltas to the features below: (a) a third **surface**, the sidebar **Navigator** (a
> compact scene browser — plotline filter list + act-grouped rows + progress — a `SidebarView` tab),
> complements the main-area Timeline/Plotlines; (b) **M5 ships Navigator + Timeline-rail +
> Plotlines-list**; Timeline **swimlanes** and Plotlines **subway map** (plus drag→frontmatter) move
> to **M6**; (c) Timeline act-divider labels come from the scene's **`beat`** note alias (no schema
> change), not a new act-name field. The F0–F6 acceptance intent is unchanged; the SDD's EARS ACs are
> the implementation-level source of truth.

## Validation Checklist

### CRITICAL GATES (Must Pass)

- [x] All required sections are complete
- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Problem statement is specific and measurable
- [x] Every feature has testable acceptance criteria (Gherkin format)
- [x] No contradictions between sections

### QUALITY CHECKS (Should Pass)

- [x] Problem is validated by evidence (schema + seed data + build-plan)
- [x] Context → Problem → Solution flow makes sense
- [x] Every persona has at least one user journey
- [x] All MoSCoW categories addressed (Must/Should/Could/Won't)
- [x] Every metric has corresponding tracking events
- [x] No feature redundancy (check for duplicates)
- [x] No technical implementation details included
- [x] A new team member could understand this PRD

---

## Product Overview

### Vision
Give the author two book-wide **workspace views** — a chronological **Timeline** and a
plotline-grouped **Plotlines** list — that read the story canon straight from
frontmatter, so the shape of the story (its chronology and its arcs) is visible at a
glance without maintaining a second source of truth.

### Problem Statement
Story Forge's contextual sidebar panel (M3) answers "what does *this* note link to?" —
it follows the active note. But an author revising a manuscript also needs the **opposite**:
book-wide overviews that answer "what is the in-world chronology?" and "which scenes
carry each plotline?". Today those questions can only be answered by opening scenes one
at a time or hand-maintaining a separate outline. The facts already live in scene
frontmatter (`storyDay`, `order`, `act`, `when`, `plotlines`), but nothing surfaces them
as ordered, grouped overviews. The consequence: chronology drift and thin/orphaned
plotlines go unnoticed until a full re-read.

### Value Proposition
The views are **derived, never authored** — they render from the same frontmatter the
author already writes (the plugin never owns state; frontmatter is truth). A scene set
once appears correctly ordered on the Timeline and under every plotline it advances,
with no duplicate bookkeeping. Clicking any scene drills into the existing M3 detail
panel, so overview and detail work in tandem. Unlike a generic table plugin, these views
understand the story schema (act grouping, `storyDay`→`order` fallback, an explicit
"Unassigned" bucket for untagged scenes) and degrade gracefully when Bases is off.

## User Personas

### Primary Persona: The Fiction Author (revising a manuscript)
- **Demographics:** A solo novelist using Obsidian as their writing vault; comfortable
  with Markdown and frontmatter Properties; not a programmer. Works mostly on desktop,
  occasionally mobile. Manages one series/book at a time in the seeded `_forge` model.
- **Goals:** See the in-world chronology of scenes; review each plotline's scenes
  together to judge its progression; find scenes that are un-placed (no `storyDay`) or
  un-tagged (no plotline); jump from an overview straight into a scene's detail.
- **Pain Points:** Chronology only exists in their head or a stale outline; a scene that
  advances two arcs is easy to under-count; orphaned/untagged scenes hide until a
  re-read; opening scenes one-by-one to reconstruct order is slow.

### Secondary Personas
None for this phase. Story Forge is a single-author personal tool; there is no editor,
collaborator, or reader persona in scope.

## User Journey Maps

### Primary User Journey: Reviewing chronology on the Timeline
1. **Awareness:** Mid-revision, the author is unsure whether scene story-time is
   consistent across an act.
2. **Consideration:** The alternative is scrolling scenes or keeping a side outline;
   both drift from the frontmatter.
3. **Adoption:** They open the **Timeline** workspace view (a main-area tab), scoped to
   the current book.
4. **Usage:** Scenes appear ordered by `storyDay` (falling back to `order`), grouped
   under collapsible act headers, each showing its `when` label. They spot a scene with
   no story-day, collapse Act 1 to focus on Act 2, and click a scene to open its detail
   in the sidebar panel.
5. **Retention:** Because the view is always live from frontmatter, they return to it
   after every batch of edits as the canonical chronology check.

### Secondary User Journey: Auditing arcs in the Plotlines view
1. **Awareness:** The author suspects one plotline has gone quiet for several chapters.
2. **Consideration:** Manually tracing `[[plotline]]` backlinks is tedious.
3. **Adoption:** They open the **Plotlines** workspace view.
4. **Usage:** Scenes are grouped under each plotline (a scene on two arcs shows under
   both); a trailing **"Unassigned"** group reveals scenes with no plotline to triage.
   Groups collapse so they can focus on one arc. Clicking a scene drills into its detail.
5. **Retention:** The Unassigned bucket becomes their routine "loose ends" checklist.

## Feature Requirements

### Must Have Features

#### Feature F1: Timeline view (chronological, act-grouped)
- **User Story:** As an author, I want scenes laid out in in-world chronological order,
  grouped by act, so I can check story-time consistency independent of reading order.
- **Acceptance Criteria (Gherkin Format):**
  - [ ] Given scenes in scope, When the Timeline renders, Then scenes are ordered by
    ascending `storyDay` (seed: Scene 1 day 1, Scene 2 day 1, Scene 3 day 2).
  - [ ] Given two scenes share a `storyDay`, When ordered, Then the tie is broken by
    ascending `order` (seed: Scene 1 `order:1` before Scene 2 `order:2`).
  - [ ] Given a scene has no `storyDay`, When the Timeline renders, Then it is still
    shown, placed using `order` as the sort key (never dropped).
  - [ ] Given scenes span multiple acts, When rendered, Then they are grouped under their
    `act` value with act group-headers ascending by act number.
  - [ ] Given a scene has a `when` value, When it renders, Then `when` is shown as its
    display label; And changing `when` does not change ordering.

#### Feature F2: Plotlines view (grouped, unassigned bucket, collapsible)
- **User Story:** As an author, I want scenes grouped by plotline with untagged scenes
  collected separately, so I can review each arc and find loose ends.
- **Acceptance Criteria (Gherkin Format):**
  - [ ] Given scenes linking `[[The Dying Light]]`, When Plotlines renders, Then a group
    "The Dying Light" contains those scenes (seed: all 3).
  - [ ] Given a scene links two plotlines, When rendered, Then it appears once under each
    of those plotline groups.
  - [ ] Given a scene has no `plotlines` (absent or empty list), When rendered, Then it
    appears in a trailing "Unassigned" group.
  - [ ] Given plotline groups, When the author activates a group header (click / Enter /
    Space), Then that group collapses or expands, with the chevron and `aria-expanded`
    updated.

#### Feature F3: Book / plotline scope-following
- **User Story:** As an author, I want the views scoped to the book or plotline I'm
  working in, so I see only the relevant scenes.
- **Acceptance Criteria (Gherkin Format):**
  - [ ] Given the active note is a book, When a view renders, Then only scenes whose
    `book` relation links that book appear (seed: all 3 scenes for Wardens of Moonharbor).
  - [ ] Given the active note is a plotline, When a view renders, Then only scenes linking
    that plotline appear.
  - [ ] Given the active note is a scene, When a view renders, Then it scopes to that
    scene's book.
  - [ ] Given the active note has no derivable book/plotline (e.g. a character note),
    When a view renders, Then it falls back to whole-vault book scope and shows a
    non-blocking "not scoped" hint rather than an empty or broken view.

#### Feature F4: Scene → detail drill-in
- **User Story:** As an author, I want to click a scene in an overview and see its full
  detail, so overview and detail work together.
- **Acceptance Criteria (Gherkin Format):**
  - [ ] Given a scene row, When the author clicks it (plain click), Then the M3 sidebar
    contextual panel re-subjects to that scene (reusing the M4 Codex→panel drill seam).
  - [ ] Given the link-click setting, When the author modifier-clicks, Then the scene note
    opens (the inverse action), consistent with the existing setting.
  - [ ] Given an unresolved scene link, When rendered, Then it shows a muted,
    non-clickable treatment and never throws.

#### Feature F5: Empty-state and missing-field tolerance
- **User Story:** As an author, I want the views to stay honest and usable when data is
  sparse, so I'm never shown a blank or broken screen.
- **Acceptance Criteria (Gherkin Format):**
  - [ ] Given no scenes in scope, When a view renders, Then an empty-state message shows
    (never a blank grid or crash).
  - [ ] Given a scene is missing `when`, `pov`, or `status`, When rendered, Then that cell
    is blank/placeholder and the scene still appears.
- **Note (reconciled with SDD ADR-1):** an earlier draft required a "Bases-off degrade"
  mirroring M4. The SDD chose a `metadataCache` data source (no Bases dependency), so there
  is **no Bases-off state to degrade from** — the views render identically with or without
  Bases. The degrade AC is therefore superseded; only the empty-state + missing-field ACs
  above remain.

#### Feature F6: Read-only guarantee
- **User Story:** As an author, I want to trust these views won't alter my notes, so I can
  browse freely.
- **Acceptance Criteria (Gherkin Format):**
  - [ ] Given any interaction with a Timeline/Plotlines view in M5, When performed, Then
    no frontmatter is written (all editing/drag is deferred to M6).

#### Feature F0 (enabling): Extend the test-vault seed for testability
- **User Story:** As the maintainer, I want seed data that exercises the interesting
  paths, so the acceptance criteria above are verifiable against live data.
- **Acceptance Criteria (Gherkin Format):**
  - [ ] Given the extended seed, Then the vault contains: an act-2 scene; a scene with no
    `storyDay`; a scene linking two plotlines; a scene with no plotline; and a second
    plotline note with zero linking scenes.
  - [ ] Given the seed change, Then all added content is English and passes
    `npm run schema:check` (schema-coupled artifacts stay in sync).

### Should Have Features
- **F7 — Multi-plotline & no-act rendering polish:** a scene on N plotlines reads clearly
  as intentional multi-membership (group counts labelled "scenes"); scenes with no `act`
  collect in a trailing "No act" group (parallel to the Unassigned bucket).
- **F8 — Collapse-state persistence per view+scope:** collapsing acts/plotlines in one
  book/scope does not collapse them in another.

### Could Have Features
- **F9 — Friendly act labels** ("Act I" instead of raw `1`) in Timeline group headers.
- **F10 — Explicit scope selector** in the view toolbar for multi-book vaults (until then,
  scope is derived from the active note / implicit single book).
- **F11 — Plotline status cue** (`seed`/`active`/`resolved`/`abandoned`) shown on each
  plotline group header.

### Won't Have (This Phase)
- **Drag → frontmatter** (Timeline card drag → `storyDay`; Plotgrid cell-toggle →
  `plotlines`) — deferred to **M6 interactive-views**.
- **Spatial / 2-D canvas layout** — M5 Timeline is a linear ordered list, not a positioned
  canvas.
- **Editing scene fields** from these views (status drag, etc.) — M6.
- **Kanban and Plotgrid views** themselves — M6.
- **Rendering these views in the Storyline note-panel surface** — later milestone.
- **Calendar-aware absolute dates** (`storyDate`/Calendarium) — not in the schema yet.

## Detailed Feature Specifications

### Feature: Timeline view (F1) — the most behaviorally load-bearing view
**Description:** A book-wide, read-only, main-area workspace view that lists the in-scope
scenes in in-world chronological order, grouped under collapsible act headers, each scene
showing its free-text `when` label. It is the chronological counterpart to the M4
Codex/Overview grids and reuses their main-area surface and the M3 collapsible-section and
link-row visual language.

**User Flow:**
1. Author opens the Timeline workspace view (main-area tab).
2. System derives the scope (book) from the active note and collects that book's scenes.
3. System sorts scenes by `storyDay` (ascending), breaking ties by `order`; scenes with no
   `storyDay` sort by `order`.
4. System groups the sorted scenes under act headers (ascending act; a trailing "No act"
   group if some scenes lack `act`).
5. Author collapses/expands act groups and clicks a scene to drill into the sidebar panel.

**Business Rules:**
- Rule 1: Ordering is driven only by `storyDay` then `order`; `when` is a display label and
  never affects order.
- Rule 2: A scene missing `storyDay` is placed by `order`; a scene missing both is placed
  by a stable tertiary key and appended after keyed scenes — never dropped.
- Rule 3: Act grouping uses the numeric `act`; missing `act` collects in a trailing "No act"
  group.
- Rule 4: The view is read-only; clicking a scene drills to the detail panel, it does not
  edit.

**Edge Cases:**
- Tie in `storyDay` → resolved by ascending `order`. (Exercised by seed.)
- Missing `storyDay` → placed by `order`. (Requires extended seed — F0.)
- Missing `storyDay` and `order` → stable tertiary sort key, appended last, never dropped.
- Empty `when` → no label / neutral placeholder; placement unaffected.
- No scenes in scope → empty-state (F5).
- Bases off → degrade to a chronological read-only list (F5).

## Success Metrics

Story Forge is a local, single-author Obsidian plugin with **no telemetry or analytics**
(the plugin never phones home; frontmatter is the only state). "Success" is therefore
measured by verifiable acceptance and the author's own workflow adoption, not server-side
KPIs. Targets below are proxy measures.

### Key Performance Indicators
- **Adoption:** The author uses the Timeline and Plotlines views as the routine chronology
  and arc checks during revision (qualitative; the maintainer is the primary user).
- **Engagement:** Both views open, scope, group, collapse, and drill without a reload.
- **Quality:** 100% of F1–F6 acceptance criteria pass in the automated suite; zero crashes
  on sparse/empty/degrade data; both views render correctly against the extended seed.
- **Business Impact:** M5 ships the v0.3 milestone on the road to v1.0 community submission.

### Tracking Requirements
No runtime analytics events are emitted (privacy + Obsidian norms). "Tracking" is via the
test suite and a manual seed-vault walk; the table maps outcomes to their verification
signal rather than telemetry.

| Event | Properties | Purpose |
|-------|------------|---------|
| Timeline render (test) | scene order, act groups, when labels | Verify F1 sort/group/label |
| Plotlines render (test) | groups, multi-membership, unassigned bucket | Verify F2 grouping |
| Scope change (test) | active-note kind → scene set | Verify F3 scope-following |
| Scene drill (test) | clicked path → panel subject | Verify F4 drill seam |
| Degrade/empty (test) | Bases-off / zero-scope | Verify F5 fallbacks |

---

## Constraints and Assumptions

### Constraints
- **Platform:** Obsidian plugin; core **Bases** required for the rich views (`minAppVersion`
  1.12.7, Bases API ≥ 1.10); must degrade when Bases is off, mirroring M4.
- **Reuse mandate:** must build on the M2 engine/consent, M3 panel components + drill seam,
  and M4 Bases/catalog foundations rather than re-implementing them.
- **Read-only in M5:** no frontmatter writes; interactivity is M6.
- **Language:** all committed content and seed-vault additions are English.
- **Scope expansion noted:** per the 2026-07-23 decisions, M5 builds a **plugin-owned
  render host** and a **book/plotline scope seam** — more custom code than the build-plan's
  "mostly Bases/little custom" framing (recorded in the spec decision log).

### Assumptions
- Frontmatter is truth: scenes carry `storyDay`/`order`/`act`/`when`/`plotlines`/`book` as
  defined in `schema/scene.json`; the views only read them.
- A single active book is the common case; multi-book scope selection is a Could (F10).
- The author writes scenes using the seeded `_forge` templates, so field names are stable.
- Bases is available on desktop for the primary experience; mobile uses the degrade path.

## Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Bases `groupBy` on the list-valued `plotlines` may not fan a scene into every group | High | Medium | Decision already made: own the render host (custom grouping in code) rather than relying on native `.base` grouping — removes the dependency on unproven list-groupBy |
| Scope-following is net-new (no "current book" concept exists) and could balloon | Medium | Medium | Keep the seam minimal (derive book/plotline from the active note's frontmatter); defer a multi-book scope selector to F10 |
| Scope creep beyond "declarative/read-only" toward M6 interactivity | Medium | Medium | Hard read-only guarantee (F6); drag/edit explicitly Won't-Have; M6 boundary restated |
| Extended seed data drifts from schema | Low | Low | `npm run schema:check` gate; English-only rule; add scenes via the generated templates |
| Custom render host duplicates M4 Codex concerns | Medium | Low | Reuse M3 components + the M4 drill seam + CON-3 firewall pattern; share code with the future plugin-owned Codex ItemView where sensible |

## Open Questions
These are **SDD-level** (technical HOW) and do not block PRD approval; they are resolved in
the solution design:

- [ ] Exact scope-seam shape: how the active note resolves to a book/plotline scope key,
  and where that helper lives (`src/scoping/`).
- [ ] Collapse-state persistence granularity (per view+scope vs per label) — F8.
- [ ] Rendering for an unresolved plotline wikilink: group by raw text vs bucket as
  Unassigned.
- [ ] Whether the two views share one render host / registered view type or are separate.
- [ ] Whether the extended seed also updates any M4 Codex expectations (scene count).

---

## Supporting Research

### Competitive Analysis
Storyline (the Obsidian plugin that inspired the "note panel" surface) offers timeline and
plotline views but locks the author into its own database and rigid structure. Generic
table/Kanban plugins (Bases, Dataview, Projects) render frontmatter but do not understand
story semantics (act grouping, `storyDay`→`order` fallback, plotline membership, an
Unassigned bucket). Story Forge's differentiator is **schema-aware, derived, non-owning**
views over plain frontmatter — the "facts as Properties" model (see `docs/DESIGN.md`).

### User Research
Grounded in the repo rather than external interviews (single-author tool):
`schema/scene.json` and `schema/plotline.json` define the real fields; the seed vault
(`test/StoryForge/`, Wardens of Moonharbor: 3 scenes, one plotline "The Dying Light")
establishes the concrete data the views must handle and exposed the seed gaps that F0
addresses. The two-surface model (contextual panel vs workspace views) is defined in
`docs/DESIGN.md` and `docs/build-plan.md`.

### Market Data
Not applicable — a personal, local-first plugin with no market-sizing dimension. The
relevant "market" signal is the road to Obsidian community-directory submission at v1.0
(M7), for which correct, honest, degradable views are table stakes.
