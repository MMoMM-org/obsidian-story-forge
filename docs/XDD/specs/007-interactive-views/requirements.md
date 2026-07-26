---
title: "M6 — Interactive Workspace Views (drag → frontmatter)"
status: draft
version: "1.0"
---

# Product Requirements Document

> **Grounding.** Authored from the M6 Agent-Team research (Requirements + Technical + UX findings,
> 2026-07-24) and four locked user scope decisions (see spec README decision log). All six features
> are **flat Must** for v0.4. Three are **write-back** (drag/toggle → plain-frontmatter Properties),
> three are **read-only view additions**. No schema changes — every field already exists in
> `schema/*.json`. The SDD's ADRs + EARS-level ACs are the implementation source of truth; this PRD
> fixes WHAT and WHY.

> **Scope revised — post-implementation polish (2026-07-26; see README decision log).** Two of the
> six features were cut from M6 after live review: **F3 Timeline-placement (drag → `storyDay`) is
> DEFERRED** (Longform owns scene order/date; writing it desyncs Longform — GH #7); the Timeline rail
> is now **read-only**. **F4 Locations tree is REMOVED** — it belongs in the Codex as an entity
> browser (hero-card + editable frontmatter — GH #6). **F2 Plotgrid is now READ-ONLY** (a
> coverage view; bare-click-to-write was destructive → editable/configurable Plotgrid deferred to
> GH #8). **Shipped write surface = F1 Kanban (`status`+`order`) only**; F2 Plotgrid, F5 Swimlanes
> (columns grid), F6 Zoom (now applies to all layouts) are read-only; F7/F8 cross-cutting. See
> [[longform-owns-scene-ordering]].

## Validation Checklist

### CRITICAL GATES (Must Pass)

- [x] All required sections are complete
- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Problem statement is specific and measurable
- [x] Every feature has testable acceptance criteria (Gherkin format)
- [x] No contradictions between sections

### QUALITY CHECKS (Should Pass)

- [x] Problem is validated by evidence (schema + seed data + build-plan + M5 code)
- [x] Context → Problem → Solution flow makes sense
- [x] Every persona has at least one user journey
- [x] All MoSCoW categories addressed (Must/Should/Could/Won't)
- [x] Success defined without telemetry (local plugin — ACs + manual walk)
- [x] No feature redundancy (check for duplicates)
- [x] No technical implementation details included (write API, drag mechanism → SDD)
- [x] A new team member could understand this PRD

---

## Product Overview

### Vision
Let the author **rearrange the story by moving it** — drag a scene between status columns, drop it
onto a story-day, toggle its plotlines in a grid — and have every gesture write clean, plain
frontmatter that the rest of Obsidian (Properties, Bases, the M3–M5 views) reads as truth. The
workspace stops being a read-only mirror and becomes a place you *edit the shape of the book*,
without the plugin ever owning a second copy of the data.

### Problem Statement
M5 made the story's chronology and arcs **visible** (Timeline rail, Plotlines list, Navigator) but
every one of those views is **read-only**. To change a scene's `status`, its `storyDay`, or which
`plotlines` it carries, the author must leave the overview, open the scene note, find the property,
and type — one scene at a time. The two most natural revision gestures — *"this scene is done, move
it to the Done pile"* and *"pull this scene one day earlier"* — have no direct expression. There is
also no way to see the plotline×scene coverage matrix at a glance (where are the gaps?), and
locations exist only as a flat list with no view of their `world` nesting. The facts are all in
frontmatter; what's missing is a surface where **manipulating the view manipulates the facts**.

### Value Proposition
Unlike a dedicated outlining app (Scrivener, Plottr) that owns its own database, Story Forge's
interactive views write **only plain Properties** — so the author keeps a single source of truth,
every edit is a normal Obsidian frontmatter change (undoable with Cmd+Z, visible in the Properties
UI, queryable by Bases), and nothing is locked into a proprietary store. Drag-to-status, drag-to-day,
and toggle-to-plotline give the tactile speed of a Kanban/timeline tool while staying **frontmatter-
is-truth**. Three read-only additions (a `world`-nested Locations tree, POV/location/plotline
swimlanes, and Timeline zoom) round out the "see the whole book from every angle" promise M5 began.

## User Personas

### Primary Persona: The revising novelist
- **Demographics:** Fiction author using Obsidian + the `_forge` story canon; comfortable with
  wikilinks and frontmatter Properties but not a programmer. Manages one or more books of dozens of
  scene notes.
- **Goals:** Move scenes through a drafting workflow (`idea → outline → draft → revised → done →
  final`), reorder chronology as the plot changes, and keep each scene's plotline membership honest —
  all without maintaining a separate outline.
- **Pain Points:** Editing a status or a story-day means opening the scene note and hunting the
  property; seeing plotline coverage means opening every scene; the M5 views show the problem but
  can't fix it in place.

### Secondary Personas
- **The world-builder:** organizes a large `location` canon and wants to see the geographic
  hierarchy (world → region → settlement → building) via the `world` parent chain, not a flat list.
- **The structural editor:** thinks in parallel storylines and POV threads; wants to view the same
  Timeline grouped into swimlanes by POV, location, or plotline to spot who/what is absent from an act.

## User Journey Maps

### Primary User Journey: Move a finished scene to "done"
1. **Awareness:** The author finishes revising a scene and wants to mark progress.
2. **Consideration:** Today they'd open the note and edit `status`; they'd rather do it from the overview.
3. **Adoption:** They open the Kanban view (a Timeline/Plotlines-style workspace layout) and see scenes as cards in status columns.
4. **Usage:** They drag the card from **Draft** into **Done**; the card lands, the status badge updates, and the scene note's `status` frontmatter is now `done`. Cmd+Z reverts it.
5. **Retention:** Because the write is a plain Property, the change is immediately reflected in Bases queries, the M5 Timeline status dots, and the Properties UI — one source of truth, so the author trusts the gesture and keeps using it.

### Secondary User Journeys
- **Pull a scene one day earlier:** In the Timeline, the author drags a scene card up past the previous day's scenes and drops it; the scene's `storyDay` snaps to the new integer day and is written. Reading order (`order`) is untouched.
- **Fix plotline coverage:** In the Plotgrid, the author sees a plotline row with a gap, clicks the empty cell at the scene that should advance it, and the scene's `plotlines` list gains that plotline.
- **Explore geography:** The world-builder opens the Locations tree and expands `Moonharbor → Moonharbor Lighthouse` to see which scenes sit there, drilling into a location note from the tree.
- **Check a POV thread:** The structural editor toggles the Timeline to Swimlane mode, grouped **By POV**, and scans across an act to see that one character has no scenes in Act 2.

## Feature Requirements

> **Field grounding.** `status` (select: idea/outline/draft/revised/done/final), `order` (number),
> `storyDay` (number), `plotlines` (list of `[[plotline]]`), `pov` (`[[character]]`), `location`
> (`[[location]]`) all live on `schema/scene.json`; `world` (`[[location]]` parent) lives on
> `schema/location.json`. All Gherkin below references the `test/StoryForge/` seed vault (Wardens of
> Moonharbor: Scenes 1–6; plotlines The Dying Light / The Warden's Oath / Shadow Trade / etc.).

### Must Have Features

All six features are Must for v0.4. Features **F1–F3 write** frontmatter; **F4–F6 are read-only**
view additions. Every write feature is subject to the cross-cutting rules **F7 (frontmatter-is-truth
write discipline)** and **F8 (keyboard-accessible + non-destructive)** below.

#### Feature F1: Kanban — scenes in status columns (drag → write `status` + `order`)
- **User Story:** As a revising novelist, I want to drag scene cards between drafting-status columns so that I can advance my workflow from the overview without opening each note.
- **Acceptance Criteria (Gherkin Format):**
  - [ ] Given the Kanban layout is open for a book scope, When it renders, Then one column appears per `status` value (idea/outline/draft/revised/done/final) and each scene is a card in its status column.
  - [ ] Given a scene card in the "draft" column, When the author drags it to the "revised" column and drops, Then the scene note's `status` frontmatter is written to `revised` and no other field changes.
  - [ ] Given two cards in the target column, When a card is dropped between them, Then the moved card's `order` is written to a value between its new neighbours (sparse-integer insertion) so the Timeline reading order reflects the new position.
  - [ ] Given a scene with no `status` field, When the Kanban renders, Then the card appears in a neutral "No status" bucket and is never hidden.
  - [ ] Given no scenes are in scope, When the Kanban renders, Then an empty-state message appears (never a blank board).
  - [ ] Given a card is dropped back onto its own column at its own position, When the drop resolves, Then no write occurs (no-op).

#### Feature F2: Plotgrid — plotline × scene matrix (toggle cell → write `plotlines`)
- **User Story:** As a revising novelist, I want a matrix of plotlines against scenes where I can toggle membership, so that I can see and fix arc coverage gaps at a glance.
- **Acceptance Criteria (Gherkin Format):**
  - [ ] Given the Plotgrid is open for a book scope, When it renders, Then plotlines form the rows and scenes the columns (or vice-versa), and a cell is filled when that scene lists that plotline.
  - [ ] Given Scene 1 lists `plotlines: [[The Dying Light]]` and an empty cell at (Scene 1, Shadow Trade), When the author clicks that cell, Then `[[Shadow Trade]]` is appended to Scene 1's `plotlines` list and the cell shows filled.
  - [ ] Given a filled cell at (Scene 1, The Dying Light), When the author clicks it, Then `[[The Dying Light]]` is removed from Scene 1's `plotlines` and the cell shows empty; other list entries keep their order.
  - [ ] Given a plotline column whose wikilink is unresolved, When the grid renders, Then its header is shown flagged/muted and its cells are not togglable.
  - [ ] Given a scene left with zero plotlines after a toggle-off, When the Plotlines view next refreshes, Then that scene appears in the "Unassigned" bucket.

#### Feature F3: Timeline placement — drag card → write `storyDay` (integer snap)
- **User Story:** As a revising novelist, I want to drag a scene along the Timeline to change when it happens, so that I can re-order chronology spatially instead of editing a number.
- **Acceptance Criteria (Gherkin Format):**
  - [ ] Given the Timeline rail sorted by `storyDay`, When a card is dragged and dropped at a new position, Then the scene's `storyDay` is written to the whole-number day of the drop position (never a fractional value).
  - [ ] Given a Timeline drag that resolves between day 1 and day 3, When the drop is committed, Then `storyDay` is written as an integer (e.g. 2), and the scene's `order` field is **not** modified.
  - [ ] Given a card dragged before the first scene or after the last, When dropped, Then `storyDay` is written as an integer at or beyond the current extreme (clamped to ≥ 1 at the start).
  - [ ] Given a scene with no `storyDay` (sorted by `order` fallback in M5), When it is dragged on the Timeline and dropped, Then a `storyDay` integer is inferred from the drop position and written.
  - [ ] Given a drop outside any valid rail drop-zone, When released, Then the drag cancels with no write and the card returns to its origin.

#### Feature F4: Locations tree — hierarchical `world` view (read-only)
- **User Story:** As a world-builder, I want a nested tree of locations following the `world` parent chain, so that I can navigate my geography by hierarchy instead of scrolling a flat list.
- **Acceptance Criteria (Gherkin Format):**
  - [ ] Given locations with a `world` parent chain, When the tree renders, Then root locations (no `world`) are top-level nodes and each child nests under the location its `world` field resolves to.
  - [ ] Given a tree node, When the author clicks its chevron, Then it expands/collapses its children (transient state), and When they click a location name, Then the location note opens (drill).
  - [ ] Given a location whose `world` link is unresolved, When the tree renders, Then it appears at the root with a muted/flagged indicator rather than being dropped.
  - [ ] Given a cycle in the `world` chain (A→B→A), When the tree renders, Then traversal stops at a depth/cycle guard and the cycle is flagged, never looping infinitely.
  - [ ] Given the Locations tree, When any interaction occurs, Then no frontmatter is written (read-only in M6).

#### Feature F5: Timeline swimlanes — group by POV / location / plotline (read-only)
- **User Story:** As a structural editor, I want to view the Timeline split into lanes by POV, location, or plotline, so that I can see which threads run in parallel and where a thread is absent.
- **Acceptance Criteria (Gherkin Format):**
  - [ ] Given the Timeline, When the author switches the Rail|Swimlane toggle to Swimlane, Then the view re-renders as horizontal lanes keyed by the current grouping selector.
  - [ ] Given Swimlane mode grouped **By POV**, When it renders, Then one lane appears per POV character in scope, each showing that character's scenes sorted by `storyDay`, with a neutral "No POV" lane for scenes lacking `pov`.
  - [ ] Given the grouping selector, When the author changes it to **By location** or **By plotline**, Then lanes re-key accordingly; scenes in multiple plotlines appear in each of their plotline lanes; scenes with no plotline appear in an "Unassigned" lane.
  - [ ] Given a scene card in any lane, When the author clicks it, Then it drills to the scene (read-only — no lane drag writes anything).
  - [ ] Given Swimlane mode, When it renders, Then act dividers remain identifiable (per the M5 act-label rule) and collapse state is preserved per surface+scope+grouping.

#### Feature F6: Timeline zoom / pan (read-only, ephemeral)
- **User Story:** As any author, I want to zoom and pan the Timeline, so that I can focus on one act's span or see the whole book, without losing the ability to click a scene.
- **Acceptance Criteria (Gherkin Format):**
  - [ ] Given the Timeline, When the author zooms in or out (control buttons and/or modifier+wheel), Then the rail scales between capped min/max levels and scene names remain clickable-to-drill at every level.
  - [ ] Given a zoomed Timeline larger than the viewport, When the author pans, Then the view scrolls and clicking a card still drills the scene.
  - [ ] Given a zoom/pan state, When the view is closed and reopened, Then zoom/pan resets (ephemeral — not persisted to frontmatter or settings).
  - [ ] Given the By-POV grouping control on the Timeline toolbar, When toggled, Then it switches the Timeline into the corresponding swimlane grouping (F5) — the control is the same grouping selector surfaced on the toolbar.

### Cross-cutting Must requirements

#### Feature F7: Write discipline — frontmatter is truth
- **User Story:** As the author, I want every interactive edit to be a plain frontmatter Property write, so that I keep one source of truth and the plugin never owns hidden state.
- **Acceptance Criteria (Gherkin Format):**
  - [ ] Given any F1–F3 write, When it commits, Then it writes only the target field(s) as plain Properties via the plugin's existing frontmatter write path (atomic; clobbers no sibling fields).
  - [ ] Given a write that would be invalid (e.g. a non-finite number), When attempted, Then it is rejected before touching the vault and the view reverts optimistically with an error indication.
  - [ ] Given two workspace views open on the same file, When one commits a write, Then the other re-renders from the metadata cache to reflect the new value.
  - [ ] Given any committed write, When the author presses Cmd+Z in the note, Then Obsidian's native undo reverts the frontmatter change and the view updates.

#### Feature F8: Accessible & non-destructive interaction
- **User Story:** As a keyboard or assistive-tech user, I want a non-drag alternative for every interactive edit, so that the views are usable and community-directory compliant.
- **Acceptance Criteria (Gherkin Format):**
  - [ ] Given any draggable card (F1–F3), When the author focuses it and uses the documented keyboard alternative, Then the same write is achievable without a pointer drag.
  - [ ] Given an interactive element, When it is focused, Then its role/label is announced and a completed write is announced via a polite live region.
  - [ ] Given a scene card that is both draggable and drillable, When the author clicks its title/link region, Then it drills (does not start a drag); the drag affordance lives on the non-link surface.

### Should Have Features
_None._ Per the locked scope decision, all interactive/read features are Must for v0.4; nothing is
deferred to a Should tier within this milestone.

### Could Have Features
_None planned for v0.4._ Candidate polish (drag-to-reparent in the Locations tree; editable
swimlanes that rewrite `pov`/`location`/`plotline`; an inline numeric-confirm input on Timeline
drop; batched multi-drag undo grouping) is explicitly deferred — see Won't Have and Open Questions.

### Won't Have (This Phase)
- **Subway map** (SVG plotline route diagram) — remains **M7** per the build plan.
- **Drag-to-reparent Locations** — the Locations tree is read-only in M6; writing `world` by drag is out.
- **Editable swimlanes** — cross-lane drag that rewrites `pov`/`location`/`plotline` is out; swimlanes are a read-only grouping.
- **Fractional `storyDay`** — Timeline placement snaps to integer days; no 1.5-style insertion.
- **Calendar / real-date arithmetic** — no date math, "two weeks later" helpers, or `when`-string editing.
- **Custom Story Graph / note-panel surface** — deferred (M7+); the core Obsidian graph remains the MVP.
- **Multi-book cross-scope drag** — dragging a scene between different books' boards is out of scope.

## Detailed Feature Specifications

### Feature: Kanban (drag → `status` + `order`)
**Description:** The most complex write feature — it touches two fields and must compute a stable
insertion order. Scenes in the active scope render as cards grouped into columns keyed by the
`status` enum. Dragging a card commits its new column to `status`; dropping it at a vertical
position within the column commits a new `order`.

**User Flow:**
1. Author opens the Kanban layout for the current book scope.
2. System renders one column per status value; each scene is a card under its status, ordered by `order`.
3. Author grabs a card (on its non-link surface) and drags it toward another column.
4. System shows a drag ghost + an insertion indicator in the hovered column.
5. Author drops the card between two cards (or into an empty column).
6. System computes the new `status` (target column) and a new `order` (between neighbours), writes both as plain Properties, and re-renders optimistically.
7. On write failure, system reverts the card and surfaces an error indication.

**Business Rules:**
- Rule 1: Dropping into a column writes that column's status value verbatim from the schema enum.
- Rule 2: `order` is assigned by sparse-integer insertion between the new neighbours; when no gap remains, the column is renumbered atomically (threshold is an SDD decision).
- Rule 3: A no-op drop (same column, same slot) writes nothing.
- Rule 4: A scene lacking `status` renders in a neutral bucket; dragging it out assigns a status.
- Rule 5: Only `status` and `order` are ever written by Kanban — never `storyDay`, `pov`, etc.

**Edge Cases:**
- Two scenes share an `order` value → tie-break by title on render; a drop between them still yields a unique inserted `order`.
- Concurrent edit (scene changed by another tool mid-drag) → on commit, re-read from the metadata cache; last-write-wins with a re-render (conflict-dialog behaviour is an Open Question).
- Out-of-vocabulary `status` already in a note → render in its own/neutral bucket, warn but don't block (mirrors the existing writer's select handling).

## Success Metrics

> **No telemetry.** Story Forge is a local, privacy-respecting Obsidian plugin; it ships no analytics.
> "Success" is defined by verifiable acceptance, not usage instrumentation.

### Key Performance Indicators (acceptance-based)
- **Correctness:** 100% of F1–F8 Gherkin ACs pass as automated tests (unit + integration) in the suite.
- **Write integrity:** Every interactive write is observable as a plain frontmatter change in the Obsidian Properties UI and is reverted cleanly by Cmd+Z (manual walkthrough on the seed vault).
- **Non-destructiveness:** No interaction writes a field other than its declared target(s); verified by write-path tests asserting sibling fields are untouched.
- **Accessibility:** Every draggable feature has a passing keyboard-alternative test; interactive roles/labels present.
- **No regressions:** M5 read views (Navigator/Timeline/Plotlines) and all prior gates (typecheck ×3, lint, schema:check, build) stay green.

### Tracking Requirements
Not applicable — no event tracking. Verification is by test suite + a manual walkthrough script on
`test/StoryForge/` recorded in the PLAN's integration phase.

| Event | Properties | Purpose |
|-------|------------|---------|
| _(none — no telemetry)_ | — | Success is measured by passing ACs + manual walkthrough, not tracked events |

---

## Constraints and Assumptions

### Constraints
- **Frontmatter-is-truth:** the plugin writes only plain Properties and owns no persistent state; all edits are ordinary frontmatter changes.
- **Reuse the existing writer:** interactive writes go through the established `src/inspector/frontmatterWriter.ts` `commit()` path (atomic, validated) — no new write mechanism.
- **Pure DOM, pointer events:** no SVG render host in M6; drag uses pointer events (not HTML5 drag-and-drop) for mobile safety and testability.
- **Structure-agnostic scoping:** views include by tag/type and exclude a folder denylist — never assume a folder layout.
- **Obsidian discipline:** TS strict, no `any`; all listeners/timers registered for lifecycle cleanup; XSS-safe DOM; a keyboard alternative for every drag (community-directory requirement).
- **No schema changes:** all fields already exist; if any turns out missing, that's a blocker routed through `docs/schema-change-runbook.md`, not a silent addition.

### Assumptions
- The author uses the `_forge` canon: scenes carry `status`/`order`/`storyDay`/`plotlines`/`pov`/`location`; locations carry `world`. (Missing values degrade gracefully into neutral buckets/roots.)
- The M5 workspace host (`src/workspace/`), scope seam (`resolveWorkspaceScope`), and the M3/M4 frontmatter writer are present and stable on `main` (they are — merged at `77f398d`).
- One workspace view is typically active at a time, but two views on the same file must stay consistent (handled by metadata-cache-driven re-render).
- `act↔beat` labelling (M5) and plotline colour derivation carry into swimlanes unchanged.

## Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Full six-feature scope is large for one v0.4 | High | High | Split cleanly into 3 write + 3 read features; the write-back infra (writer reuse + one shared interaction handler) is built once and shared, cutting per-feature cost |
| Click-to-drill vs click/drag-to-edit collide on the same card | Medium | Medium | Drag affordance lives on the non-link surface; `[data-sf-link]` regions always drill; keyboard path bypasses drag entirely (F8) |
| `order` renumber churn writes many notes at once | Medium | Low | Sparse-integer insertion defers renumber; renumber is atomic and rare; threshold decided in SDD |
| Drag broken on Obsidian mobile | Medium | Medium | Pointer events (not HTML5 DnD); mobile is a named target; manual mobile check in verification |
| Concurrent external edit during a drag | Low | Low | Re-read from metadata cache on commit; last-write-wins + re-render for v0.4 (conflict UX is an Open Question, not a blocker) |
| Locations `world` cycle causes infinite render | Medium | Low | Depth + visited-set cycle guard (F4 AC); flag and stop |

## Open Questions
_SDD-level decisions — noted, not blocking the PRD:_

- [ ] **`order` renumber threshold & strategy** — sparse-integer start values and when to trigger a full-column renumber (F1/Kanban).
- [ ] **Drag write debounce granularity** — per-file vs global coalescing of rapid drags before commit.
- [ ] **Re-render trigger** — optimistic local re-render + `metadataCache.changed` for other views (hybrid) vs cache-event only.
- [ ] **Error surface** — inline-on-card indication vs transient notice vs both, on write failure.
- [ ] **Swimlane grouping-key persistence** — per-scope (keyed in the collapse store) vs global vs ephemeral.
- [ ] **Concurrent-edit UX** — last-write-wins (v0.4 default) vs a conflict prompt (candidate later refinement).
- [ ] **Zoom controls** — modifier+wheel vs explicit +/−/reset buttons vs both.

---

## Supporting Research

### Competitive Analysis
Trello/Notion-style boards use **fractional or sparse ordering** to make drag-reorder cheap; M6 adopts
**sparse integers** to keep frontmatter human-readable (no `1.5000001` YAML float rot). Kanban/timeline
tools (Plottr, Aeon Timeline, Scrivener corkboard) own a proprietary store; Story Forge's
differentiator is writing the **same plain Properties** the rest of the vault already reads — the M6
gestures give comparable tactility without a second source of truth. obsidian-storyline (MIT) is the
**visual** reference for lanes/rails only (no code port); its state-owning rigidity is exactly what
frontmatter-is-truth avoids.

### User Research
Grounded in the `_forge` schema and the `test/StoryForge/` seed vault rather than external interviews
(single-author, self-hosted tool). The three research agents confirmed: **no schema gaps** (all six
features map to existing fields); the M5 host + scope seam + frontmatter writer are ready to extend;
pointer events + writer reuse are the low-risk technical path; and every drag needs a keyboard
alternative for community-directory acceptance. Twelve UX mockups (S73–S84) cover populated / mid-drag
/ post-write / error / empty states and will be authored into `mockups.html` during the SDD.

### Market Data
Not applicable — a personal, local-first Obsidian plugin with no market-sizing dimension. Relevant
external constraint is the **Obsidian community plugin directory** review bar (accessibility,
lifecycle cleanup, mobile, XSS-safe DOM), which F8 and the constraints section encode directly.
