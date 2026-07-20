---
title: "Contextual sidebar panel — type-aware story facts that follow the active note"
status: complete
version: "1.0"
---

# Product Requirements Document

## Validation Checklist

### CRITICAL GATES (Must Pass)

- [x] All required sections are complete
- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Problem statement is specific and measurable
- [x] Every feature has testable acceptance criteria (Gherkin format)
- [x] No contradictions between sections

### QUALITY CHECKS (Should Pass)

- [x] Problem is validated by evidence (spec README decisions log + 4 parallel research agents)
- [x] Context → Problem → Solution flow makes sense
- [x] Every persona has at least one user journey
- [x] All MoSCoW categories addressed (Must/Should/Could/Won't)
- [x] Every metric has a corresponding verification signal
- [x] No feature redundancy
- [x] No technical implementation details included (deferred to SDD)
- [x] A new team member could understand this PRD

---

## Product Overview

### Vision

Open any character, scene, location, object, lore, or plotline note and the Story
Forge sidebar shows that entity's canonical facts, its typed relationships, and —
for the first time — everything that points *back* at it ("appears in", "owns",
"inhabitants", "scenes here"), live-updating as you move between notes. This is the
milestone where the panel stops being a skeleton and becomes a living reference
sheet for the story.

### Problem Statement

After M2, Story Forge has a note-following panel (M1), a working query engine and
consent gate (M2), and an empty `NoteContext.backlinks` seam — but the **Context
tab still renders a stub**. `_renderResolvedLegacy` dumps flat `field / basename /
kind` rows and a literal `"appears in: — (M3)"` placeholder
(`src/views/SidebarView.ts:902–916`). Three concrete gaps block the payoff:

1. **For the writer — no type-aware content.** Every entity kind renders the same
   flat list. A character note doesn't show the character's relationships, the
   scenes they appear in, or what they own; a scene doesn't show its cast; a
   location doesn't show its inhabitants. The panel cannot answer the questions a
   writer actually has open ("who's in this scene?", "where does she appear?").
2. **For the plugin — no reverse resolution.** `ScopingService.resolve()` reads
   only *outgoing* frontmatter links (`ScopingService.ts:101–139`) and hard-codes
   `backlinks: []` (`:145`). "Appears in", "owns", "inhabited by", and "scenes
   here" are reverse relations that no code computes yet.
3. **For the data model — two entity kinds have no schema.** `plotline` and `book`
   are referenced as relation targets in `scene.json` but have no `schema/*.json`,
   no FileClass, no template — so their panels have no canonical facts to show.

The M3 gap is precise: replace the Context-tab stub with per-kind renderers for
all six entity kinds, fill the backlink seam with field-filtered reverse
resolution, add minimal schema for `plotline` + `book`, and author the default
`_forge` views so M4's catalog can install them.

### Value Proposition

- **Continuity without leaving the manuscript.** Drafting a scene, the writer sees
  the cast, location, and plotline with quick facts — updating live as they move
  between scenes — so they keep continuity without opening five notes.
- **The whole web at a glance.** On a character, the panel shows relationships
  *and* the reverse view (which scenes feature them, what they own, where they
  live) — the "in the Codex on a character, see where they appear" payoff.
- **Honest about half-finished notes.** Empty relations, unresolved `[[links]]`,
  and missing portraits are shown plainly rather than crashing or lying — the
  writer trusts the panel and knows what to fill in.
- **Zero-dependency core.** The Context tab renders natively from `metadataCache`;
  it works with no Dataview installed. Dataview drives the richer *optional*
  curated view tabs, not the always-on Context tab.

## User Personas

### Primary Persona: The fiction writer

- **Demographics:** Novelist/worldbuilder, 25–55, uses Obsidian daily on desktop
  and sometimes mobile; comfortable with Markdown and frontmatter Properties but
  not a programmer; maintains a `_forge`-style vault (one canonical note per
  entity, hard facts in frontmatter, typed relations as `[[wikilinks]]`); may or
  may not have Dataview installed.
- **Goals:** See a character's facts, relationships, appearances, and possessions
  at a glance; while drafting a scene, see its cast/location/plotline live;
  navigate the story web by clicking between linked entities; trust that a
  half-filled note shows honestly.
- **Pain Points:** The M1/M2 Context tab is a stub — it shows the same flat list
  for every kind and a `"— (M3)"` placeholder where appearances should be. Reverse
  relations ("where does she appear?") aren't answerable without manually opening
  every scene.

### Secondary Personas

**The plugin maintainer (M4+ consumer).**
- **Demographics:** The author building M4 (Bases + Codex + curated catalog) on top
  of M3.
- **Goals:** Consume a stable `NoteContext.backlinks` contract and a set of authored
  `_forge` view definitions so M4's catalog can wrap and install them as `curated`
  without re-authoring the queries.
- **Pain Points:** Without M3, there are no default views to catalog and no reverse
  relations for overview grids to lean on.

## User Journey Maps

### Primary User Journey: Drafting a scene with the cast in view

1. **Awareness:** The writer is drafting "Scene 1 – The Extinguished Fire" and needs
   to keep the present characters and location straight.
2. **Consideration:** The Story Forge panel is already open on the Context tab from
   M1/M2; until now it showed a flat stub.
3. **Adoption:** With M3, the panel now shows a scene layout — POV (Mara, flagged),
   characters (Mara, Tobias), location (Moonharbor Lighthouse), plotline (The Dying
   Light) — each a clickable quick-fact row.
4. **Usage:** The writer moves to "Scene 2 – The Salty Gull"; the panel swaps live to
   the new scene's cast and location. Clicking "Mara Stoneway" drills the panel into
   her character sheet (facts, relationships, appears-in, owns) without leaving the
   editor.
5. **Retention:** The panel becomes the writer's continuity companion — always
   showing the right facts for wherever they are in the manuscript.

### Secondary User Journey: Auditing a character's web

1. **Awareness:** The writer opens "Mara Stoneway" to check her relationships are
   consistent.
2. **Consideration:** The Context tab detects a `character` note.
3. **Adoption:** The panel shows her facts + portrait placeholder, her typed
   relationships (partner → Jonas, family → Elke, enemies → Silvan), "appears in" (3
   scenes, POV-flagged), "owns" (0 objects), and related locations (Moonharbor,
   Lighthouse).
4. **Usage:** She spots that Silvan lists Mara as an enemy — clicks through to verify
   the reverse. Empty sections ("owns: 0") are shown honestly, not hidden.
5. **Retention:** She trusts the panel to surface the full relationship graph,
   including reverse edges she forgot to mirror.

### Secondary User Journey: Navigating an unfinished world

1. **Awareness:** The writer opens a freshly-created character with no relations yet.
2. **Consideration:** The Context tab classifies it as `character`.
3. **Adoption:** Every section renders with an explicit empty-state line ("No
   relationships yet.", "No scenes yet.") — the panel reads as "complete but empty,"
   never broken.
4. **Usage:** A relation field points at a `[[note]]` that doesn't exist yet; the
   panel shows it as an unresolved row (muted, non-clickable, `(unresolved)`), so the
   writer knows to create it.
5. **Retention:** The writer uses the panel's honesty as a to-do list for fleshing
   out the vault.

## Feature Requirements

### Must Have Features

The minimum for M3 to be valuable and to unblock M4: type-aware Context-tab content
for all six entity kinds, field-filtered reverse-relation resolution, minimal schema
for the two schema-less kinds, honest empty/partial states, and clickable
navigation. State references (`S32`–`S43`) continue the S-series inventory (S2–S31
already used); the 12 ASCII mockups live in `mockups.html`.

#### Feature 1 (F1): Character contextual panel *(character-first, highest value)*

- **User Story:** As the fiction writer, I want a character note's Context tab to show
  identity facts, portrait, typed relationships grouped by relation, "appears in"
  scenes, and owned objects, so the panel is a live character sheet. *(mockups S32,
  S35)*
- **Acceptance Criteria (Gherkin Format):**
  - [ ] Given a note classified `character` with populated frontmatter, When the
    Context tab renders, Then a facts block shows `name`, `role`, `status`,
    `tagline`, with `occupation`/`age`/physical facts as secondary rows.
  - [ ] Given a character with a non-empty `portrait`, When the panel renders, Then
    the portrait image is shown; Given `portrait` is empty (the case for every
    current sample note), Then a monogram placeholder is shown — never a broken image.
  - [ ] Given a character with relation fields, When the panel renders, Then
    `significant_other`, `family`, `friends`, `allies`, `enemies` each appear as a
    labelled row listing the linked characters (empty handling per F5).
  - [ ] Given a character, When the panel renders "appears in", Then it lists every
    scene whose `pov` or `characters` frontmatter includes this character (via F2),
    with POV-scenes visually distinguished from present-only scenes.
  - [ ] Given a character, When the panel renders "owns", Then it lists every `object`
    note whose `owner` equals this character.
  - [ ] Given a character, When the panel renders "related", Then it lists locations
    whose `inhabitants` include this character (and related lore, if any).
  - [ ] Given a `character-fantasy` note (base tag `canon/character`), When the panel
    renders, Then it uses the character renderer and additionally shows any present
    fantasy facts (`species`, `magical_abilities`, `combat_skills`, weapons/armor) —
    omitting absent ones; there is no separate kind badge.

#### Feature 2 (F2): Reverse-relation resolution (the backlink seam)

- **User Story:** As the plugin, I want to resolve which notes point *at* the active
  note through typed relation fields, so "appears in", "inhabited by", "owns", and
  "scenes here" can be computed. This fills `NoteContext.backlinks` (empty since M1).
- **Acceptance Criteria (Gherkin Format):**
  - [ ] Given a character subject, When context resolves, Then `backlinks` contains
    each scene referencing it via `pov` or `characters`, each tagged with its source
    `field` and `relation: "backlink"`.
  - [ ] Given a location subject, When context resolves, Then backlinks include scenes
    whose `location` targets it and child locations whose `world` targets it.
  - [ ] Given an object or lore subject, When context resolves, Then "appears in" is
    computed from **generic backlinks** (any scene linking the note) — an accepted
    imprecision (D2), since scenes carry no typed `objects`/`lore` field.
  - [ ] Given the reverse resolver runs, When it filters candidates, Then it keys on
    the **frontmatter field name** (from the cache), not the schema's `"relation"`
    marker — so `plotlines`, `first_appearance`, and lore `related` (which carry no
    `"relation"` key) are still resolved.
  - [ ] Given no Dataview is installed, When context resolves, Then reverse relations
    are still computed (native `metadataCache` only) — the Context tab is
    dependency-free.
  - [ ] Given a reverse-relation candidate that resolves to no vault file, When
    context resolves, Then it is excluded or marked `unresolved` — never a thrown
    error (resolution stays non-throwing).
  - [ ] Given the active note changes, When the new context resolves, Then reverse
    relations are recomputed for the new subject and the panel updates within the
    existing debounce window (no hard latency budget; degrades gracefully on large
    vaults).

#### Feature 3 (F3): Per-kind panels for location, object, lore, scene, plotline

- **User Story:** As the writer, I want each non-character entity kind to render its
  own appropriate layout, so every canon and scene note shows the right facts and
  links. *(mockups S36–S40)*
- **Acceptance Criteria (Gherkin Format):**
  - [ ] Given a `location` note, When the Context tab renders, Then it shows facts, a
    `world`-chain hierarchy breadcrumb (walked upward, cycle-safe), child locations
    (reverse `world`), `inhabitants`, and "scenes here" (scenes whose `location` = this).
  - [ ] Given a location's `world` chain contains a cycle or unresolved parent, When
    the hierarchy renders, Then it terminates safely and marks the break point.
  - [ ] Given an `object` note, When the Context tab renders, Then it shows facts
    (`kind`), the `owner` (or "Unowned."), and "appears in" (fuzzy backlinks).
  - [ ] Given a `location` or `object` note with a non-empty `image` field, When the
    panel renders, Then a thumbnail tile is shown (like the character portrait); Given
    the `image` field is empty/absent, Then no tile and no placeholder is shown (D5).
  - [ ] Given a `lore` note, When the Context tab renders, Then it shows facts
    (`scope`), `related` entities (kind-tagged, since the list mixes kinds), and
    "referenced by" (reverse `related`).
  - [ ] Given a `scene` note, When the Context tab renders, Then it shows scene facts
    (`book`, `act`/`chapter`, `order`, `status`, `when`, `arc`) and the entities in the
    scene (`pov` flagged, `characters`, `location`, `plotlines`) plus reading-order
    `prev`/`next`.
  - [ ] Given a `plotline` note, When the Context tab renders, Then it shows its facts
    (per F4's new schema) and the ordered scenes whose `plotlines` include it.
  - [ ] Given any entity kind, When its content renders, Then sections are collapsible.

#### Feature 4 (F4): Minimal schema for `plotline` + `book`

- **User Story:** As the maintainer, I want `plotline` and `book` to be first-class
  schema types, so their panels can show canonical facts (not just a reverse scene
  list) and the generator/gate treat them like every other type. *(Decision D1)*
- **Acceptance Criteria (Gherkin Format):**
  - [ ] Given the M3 change, When the schema is authored, Then `schema/plotline.json`
    and `schema/book.json` exist with `entity`/`idPrefix`/`icon`/`folder`/`tag`/`fields`,
    following `docs/schema-change-runbook.md` (ADD-a-type path).
  - [ ] Given the new schema, When `npm run schema:gen` runs, Then it generates the
    FileClass, Template, `Schema/*.md`, machine-JSON, and infra artifacts for both new
    types, and `npm run schema:check` stays green.
  - [ ] Given the new schema, When the existing seed notes (`The Dying Light.md`,
    `Wardens of Moonharbor.md`) are updated, Then their frontmatter conforms to the new
    schema (tags/fields aligned).
  - [ ] Given the image feature (D5), When the schema is authored, Then `object.json` and
    `location.json` gain an optional `image` field (text/image link, like character's
    `portrait`), regenerated via `schema:gen`.
  - [ ] Given a `plotline` or `book` note, When the Context tab renders, Then it shows a
    facts block from the new schema plus the reverse scene list, and the kind badge has
    a dedicated color token.

#### Feature 5 (F5): Empty states & partial-data handling

- **User Story:** As the writer with half-finished notes, I want the panel to show
  missing data honestly, so I trust it and know what to fill in. *(mockups S33, S34)*
- **Acceptance Criteria (Gherkin Format):**
  - [ ] Given a character with an empty relation list, When the panel renders, Then
    that section shows an explicit empty affordance (e.g. omitted when other relations
    exist, or "No relationships yet." when all are empty) — never a stray empty header
    with a phantom row.
  - [ ] Given an entity with no reverse relations (a character in zero scenes), When
    the panel renders, Then "appears in" shows "No scenes yet." — not a blank region.
  - [ ] Given a relation field with an unresolved `[[link]]`, When the panel renders,
    Then the row is shown muted, non-clickable (`aria-disabled`), with an `(unresolved)`
    marker via the existing `ResolvedEntity.unresolved` flag — not dropped, not crashing.
  - [ ] Given a canon-tagged note missing optional fields, When the panel renders, Then
    present fields render and absent fields are omitted gracefully.
  - [ ] Given an entity-tagged note with otherwise-empty frontmatter, When the panel
    renders, Then it shows the kind badge and an "incomplete entity" affordance rather
    than an error.
  - [ ] Given a note with a null/absent metadata cache (pre-index), When followed, Then
    the existing S9 error+Retry state shows — NOT treated as empty relations.

#### Feature 6 (F6): Navigation — drill-in + open-note, settings-configurable

- **User Story:** As the writer, I want to click an entity in the panel to explore it,
  with the panel following me as I move between notes, so the panel is a navigation
  surface. *(mockups S41, S43; Decision D3)*
- **Acceptance Criteria (Gherkin Format):**
  - [ ] Given any resolved (non-unresolved) entity row, When the writer clicks it with
    the **default** action, Then the panel **drills in** — re-subjects to that entity,
    pushes a back-stack, and shows a "‹ Back" affordance (S41); live-follow pauses while
    drilled-in.
  - [ ] Given a resolved entity row, When the writer clicks it with the **modifier**
    action, Then the note **opens** in the editor and (unless pinned) the panel resumes
    following it.
  - [ ] Given the Story Forge settings, When the writer changes the "panel link click
    action" setting, Then the default and modifier actions swap (open-note becomes the
    plain-click default) — persisted across reloads.
  - [ ] Given the panel is pinned, When the active note changes, Then the panel stays on
    the pinned subject and a "Pinned — not following the active note." hint shows (S43).
  - [ ] Given the active note changes to another entity kind, When resolution completes,
    Then the panel swaps to the new kind's layout with no stale content bleed (ADR-7
    teardown).
  - [ ] Given the writer drills or opens into a non-entity note, When context resolves,
    Then the existing S4 "not a tracked entity" state shows.

### Should Have Features

#### Feature 7 (F7): Curated default `_forge` view seed set

- **User Story:** As the maintainer, I want the default `_forge` views authored and
  registered, so M4's catalog can install them without re-authoring the queries.
- **Acceptance Criteria (Gherkin Format):**
  - [ ] Given the M3 build, When the default view set is authored, Then it includes the
    reverse-relation core as `sf-view` notes (at least: characters-in-scene [exists],
    appears-in, owns, inhabitants, scenes-here, plotline-scenes, book-scenes), each with
    a field-filtered `WHERE contains(field, this.file.link)` query.
  - [ ] Given a curated `_forge` view, When Dataview is absent, Then it degrades
    gracefully (native fallback) — matching the roadmap's "degrade gracefully when
    Dataview is missing".
  - [ ] Given the curated views are authored in M3, When M3 ships, Then they are **not**
    surfaced through a catalog install UI (that is M4); M3 exercises them via the
    existing M2 import flow.
  - [ ] Given a seeded view, When the build runs, Then its field references stay
    consistent with the canonical schema.

### Could Have Features

- **Per-section collapse persistence** across note switches, keyed by section label
  (S42) — a reading-mode nicety, not required for the exit criterion.
- **POV-vs-present refinement** in a character's "appears in" (badge which scenes they
  lead vs merely appear in) beyond the basic POV flag.
- **Colored `status` chip** on scene facts matching the schema select vocabulary.
- **Reverse "referenced by"** for character relationship sections (surfacing people who
  list this character without being listed back).

### Won't Have (This Phase)

- **Note-panel surface** — the Storyline-style inspector rendering *in/with* the active
  note (DESIGN §2 surface B). M3 is the **sidebar** surface only; the note panel is a
  later milestone.
- **Bases engine** — the Bases embedding spike is M4; `bases`-engine views still show
  "Engine coming in M4".
- **Catalog / "Browse official" install UI** — M3 *authors* curated views; the catalog,
  Browse-official modal, and update notifications are M4.
- **Codex / overview `.base` grids** — M4.
- **Relationship graphs / Story Graph** (`StoryGraph.ts`/`RelationshipMap.ts`) — later.
- **Workspace views** (Kanban, Plotgrid, Timeline, Plotlines) — M5/M6.
- **Frontmatter write-back / drag edits** — M3 Context tab is read-only.
- **Typed `scene.objects`/`scene.lore` fields** — deferred (D2 accepts fuzzy backlinks
  for object/lore "appears in").
- **Contextual view switcher** — filtering view tabs/dropdown by the active note's kind
  (so "characters in scene" is hidden on a character note), plus a dropdown switcher with
  a "show all views" escape hatch. Deferred to a GitHub issue (D6); M3 keeps the M2 tab
  strip and focuses on the Context-tab content.

## Detailed Feature Specifications

### Feature: F1 — Character contextual panel

**Description:** When the active note classifies as `character` (tag-first, then
frontmatter `type`), the Context tab renders a character sheet: a facts block (portrait
placeholder + hard facts), typed-relationship sections, then reverse-query sections
("appears in", "owns", "related"). It is the highest-value, character-first deliverable
and the template the other kinds follow.

**User Flow:**
1. Writer opens or navigates to a character note (e.g. Mara Stoneway).
2. System classifies the note, resolves outgoing relations (M1) and reverse relations
   (F2), and renders the character layout (S32).
3. Writer clicks a relationship row → drills into that character (F6) or opens it
   (modifier).
4. Writer switches to another note → panel swaps live.

**Business Rules:**
- The Context tab is native and read-only; no consent gate applies (only DataviewJS
  needs the gate, and that is a *view tab*, not the Context tab).
- Empty relation lists and reverse queries render honest empty states (F5), never blanks.
- `character-fantasy` reuses the character renderer with conditional fantasy facts.

**Edge Cases:**
- `portrait: ""` (all current samples) → monogram placeholder, not a broken image.
- A relation `[[link]]` to a missing note → unresolved row (muted, non-clickable).
- A character in zero scenes → "appears in" shows "No scenes yet."
- A mutually-linked relationship (A↔B) → shown once per direction, de-duplicated by
  target path.

## Success Metrics

Story Forge is a local Obsidian plugin with **no telemetry** — success is measured by
**verification signals** run against the test vault (`test/StoryForge/`, Wardens of
Moonharbor), not analytics events.

### Key Verification Signals

- **Exit criterion (build-plan M3):** open any canon or scene note → the panel shows the
  right facts and "appears in"/links, live-updating as the active note changes. Verified
  manually across all six kinds on the seed vault.
- **Coverage:** each of the 12 mockup states S32–S43 is reproducible in the running
  plugin on the seed vault (after F4's seed-note additions for fantasy/object-in-scene).
- **Correctness:** "appears in" for Mara = exactly Scenes 1–3 (POV); "owns" for Tobias =
  The Beacon Lens; inhabitants of Moonharbor Lighthouse = Tobias + Mara; scenes on "The
  Dying Light" = Scenes 1–3 ordered. These are the ground-truth assertions.
- **Robustness:** empty-state, unresolved-link, and cycle-safe-hierarchy cases render
  without a thrown error or blank pane.
- **Gates green:** `npm run test`, `lint`, `typecheck`, `typecheck:test`, `schema:check`
  (now covering the two new types), and `build` all pass.

### Tracking Requirements

Not applicable — no telemetry. "Tracking" is the set of unit tests + manual
verification-vault checks above. The SDD/PLAN will enumerate the test assertions that
stand in for tracking events.

---

## Constraints and Assumptions

### Constraints

- **Zero-dependency Context tab** — must render from `metadataCache` alone; works with no
  Dataview installed (Dataview is a soft dependency; DESIGN §4).
- **Public API only** — reverse resolution must NOT use `metadataCache.getBacklinksForFile()`
  (absent from `obsidian.d.ts`); using it would require an `app as any` cast, violating
  CON-8 and the "mock must match real API" rule. Use `frontmatterLinks` + `resolvedLinks`.
- **Additive `NoteContext` contract** — `backlinks` already exists and `isNoteContext`
  requires it; M3 populates it without changing the shape or `ResolvedEntity` fields.
- **Frontmatter is truth** — M3 is read-only w.r.t. vault notes; no plugin-owned relation
  store.
- **Mobile-safe** — the native panel runs on mobile; only DataviewJS view tabs are
  desktop-only.
- **Teardown discipline** — per-kind renderers obey ADR-7 (`teardown → empty → render`) and
  ADR-2 (registered/ delegated listeners, no per-render leaks).
- **Schema pipeline** — the F4 schema change follows `docs/schema-change-runbook.md`; the
  generator (`schema:gen`) and gate (`schema:check`) must accept the two new types.
- **Branch discipline** — hooks block writes/commits on `main`; work proceeds on the
  `contextual-panel` branch. English-only content.

### Assumptions

- The writer's vault follows the `_forge` model (canonical note per entity, typed
  `[[wikilink]]` relations, classifier tags). Reverse queries depend on the classifier
  tag/folder to type the subject.
- Relationships are author-maintained and often not reciprocal — hence reverse "referenced
  by" is valuable (Could-have).
- The seed vault will be extended (F4 + PLAN) to include a fantasy character and
  object/lore-in-scene references so every panel state is demonstrable.

## Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Full-vault `frontmatterLinks` scan on every note-switch lags large vaults | Medium | Medium | Keep resolution sync (cache-only, no `vault.read`); prefilter candidates via `resolvedLinks`; debounced follow already coalesces; set a "degrades gracefully" signal, not a hard ms budget |
| Object/lore "appears in" fuzzy backlinks over-report (any prose mention) | Low | High | Accepted (D2) and documented as imprecise; revisit a typed `scene.objects` field in a later milestone |
| F4 schema change destabilizes `schema:check` / generator | Medium | Medium | Follow the runbook ADD-a-type path exactly; regenerate + gate before touching renderers; verify seed notes conform |
| Drill-in + open-note dual path adds interaction complexity/bugs | Medium | Medium | Single settings toggle swaps default/modifier; delegated click handler on the body container (dies with `body.empty()`); test both paths |
| `getBacklinksForFile` temptation (simpler API) reintroduces an any-cast | Low | Medium | Explicit constraint above; reverse index built from public `frontmatterLinks` only |
| Alias/piped links (`[[file\|display]]`) missed by naive string match | Medium | Medium | Resolve via `getFirstLinkpathDest`/resolved targets, never raw display text |

## Open Questions

All PRD-level scope questions were resolved in the decisions round (D1–D4, logged in
README). Remaining items are **SDD-level** (technical) and are carried forward, not
blockers:

- [ ] SDD: exact reverse-index construction (`frontmatterLinks` scan vs `resolvedLinks`
  prefilter) and whether it stays fully sync in `ScopingService.resolve()`.
- [ ] SDD: where the per-kind renderers live (grow `NativeScopingEngine` into a
  type-dispatched renderer vs a new renderer module) while preserving the `QueryEngine`
  contract.
- [ ] SDD: the settings-row shape for the F6 link-click toggle (extends the spec-003
  settings surface).
- [ ] SDD: `schema/plotline.json` + `schema/book.json` field lists (facts to include for
  each) — minimal but coherent with the `_forge` model.

---

## Supporting Research

### Competitive Analysis

**Storyline** (obsidian-storyline) is the visual reference: it stores facts in
frontmatter (not a DB) and renders collapsible character profiles, portraits, and
relationship lists in a note-following inspector. Story Forge reproduces the *views* off
`_forge` properties but, per DESIGN, avoids Storyline's rigidity (Storyline owns its
data; Story Forge reads frontmatter and never owns state). M3 delivers the sidebar
equivalent of Storyline's profile/relationship views; the note-panel inspector surface is
deferred.

### User Research

Four parallel research agents (Requirements, UX/mockups, Technical, Integration) mapped
the code seams, the `_forge` schema for all six kinds, the sample-vault ground truth, and
produced 12 ASCII mockups (S32–S43). Key convergent findings: the Context tab should be
native/dependency-free with reverse relations filling `NoteContext.backlinks`;
`plotline`/`book` lack schema (→ D1); `plotlines`/`related`/`first_appearance` carry no
`"relation"` key (resolver must key on field name); object/lore "appears in" has no
forward field (→ D2); the sample vault lacks a fantasy character and object/lore-in-scene
data (→ seed notes in PLAN). Full findings are captured in the spec README decisions log.

### Market Data

Not applicable — a personal-use, local-first Obsidian plugin with no market/telemetry
dimension.
