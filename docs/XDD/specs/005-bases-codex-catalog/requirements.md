---
title: "M4 — Bases, Codex & curated catalog"
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

- [x] Problem is validated by evidence (spec README decisions log + ADR-0001 spike + parallel research agents)
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

After M3, opening a note shows *that* entity's facts in the sidebar. M4 turns Story
Forge from a note-following panel into a **library**: browse the whole cast, every
location, all objects and lore from a top-down **Codex** — the deliberate opposite of
"follow the active note" — click any row to drop straight into that entity's detail;
**install official overview views** from a bundled catalog without ever writing a query;
and **fix a fact in place** through a minimal editable Inspector that writes plain
frontmatter and fans the change out everywhere. This is the milestone where native
Obsidian **Bases** joins Dataview as a first-class render engine, and where the curated
`_forge` views seeded in M3 finally become one-click installable. Ships **v0.2**.

### Problem Statement

M3 gave the writer a Context tab that answers "what is *this* note?" — but three payoffs
from the design remain unbuilt, and one whole render engine is still a stub:

1. **For the writer — no top-down entry point.** To find a character the writer must
   already have their note open, or hunt the file tree. There is no roster, no "show me
   all my locations grouped by region," no browsable Codex. The follow-the-active-note
   panel cannot answer "who exists in this world?" — only "who is on screen right now?".

2. **For the writer — the curated views aren't installable.** M3 *authored* the default
   `_forge` view set but explicitly did not surface a catalog UI (M3 F7 AC: "not surfaced
   through a catalog install UI — that is M4"). A writer who wants "Characters, sorted by
   role" must import a raw query by hand. There is no reviewed, provenance-stamped,
   one-click library.

3. **For the writer — the panel is read-only.** M3's Context tab is strictly read-only
   (M3 CON: "frontmatter is truth; M3 is read-only w.r.t. vault notes"). Spotting a wrong
   `status` or a typo in `role`, the writer must leave the panel, open the note, edit
   frontmatter by hand, and come back. The write-back loop the whole design rests on
   ("the plugin writes only plain frontmatter, never owns state") has never been exercised
   end-to-end.

4. **For the engine registry — the `bases` slot is empty.** M2 built an engine registry
   with a `bases` slot; M3 left it showing "Engine coming in M4" (M3 Won't-Have: "the
   Bases embedding spike is M4; `bases`-engine views still show 'Engine coming in M4'").
   Native Bases — Obsidian's own database views — cannot render anywhere in Story Forge.

The M4 gap is precise, and the strategy is already gated by **ADR-0001** (Accepted): add a
read-only Bases render engine to the sidebar; build a Codex of Bases-backed category grids
that click through into the M3 panel; ship a bundled, checksummed catalog with a "Browse
official" install modal; add a minimal editable Inspector that proves the frontmatter
write-back loop; and handle a disabled/absent core Bases plugin gracefully.

### Value Proposition

- **Browse the world top-down.** The Codex is a roster: Characters, Locations, Objects,
  Lore, each a grid of everyone/everything in canon. Click a row and the M3 panel
  re-subjects to it — the writer moves from "who exists?" to "tell me about this one" in a
  single click, without opening a file.
- **A curated library, one click to install.** Reviewed overview views (Characters /
  Locations / Objects / Lore / Scenes) ship *in* the plugin, stamped with provenance and a
  checksum. "Browse official" → preview → Install. No query authoring, no copy-paste, and
  fully offline — the catalog is bundled, not fetched.
- **Fix a fact where you found it.** The Inspector makes scalar and enum fields editable;
  changing `status` from *draft* to *final* writes plain frontmatter and the panel, the
  Codex, and any open base all re-render. The write is a Property write — Obsidian, Bases,
  meta-bind and every other tool still own the data; Story Forge never does.
- **Two engines, honestly degraded.** Bases joins Dataview as a render engine. If the user
  has core Bases disabled or is on an older Obsidian, Story Forge tells them how to enable
  it and degrades exactly like a missing Dataview — the M3 panel and Dataview tabs keep
  working; nothing crashes.

## User Personas

### Primary Persona: The fiction writer / worldbuilder

- **Demographics:** Novelist/worldbuilder, 25–55, uses Obsidian daily on desktop and
  sometimes mobile; comfortable with Markdown and frontmatter Properties but **not a
  programmer** — will not author Bases/Dataview queries by hand; maintains a `_forge`-style
  vault (one canonical note per entity, hard facts in frontmatter, typed relations as
  `[[wikilinks]]`); has M3 installed and the sidebar panel already part of their workflow.
- **Goals:** Three jobs M4 must serve —
  1. **Browse canon top-down** — a Codex roster of all characters/locations/objects/lore,
     click through to detail (the opposite of M3's follow-active-note).
  2. **Install official views without authoring queries** — pick reviewed overview views
     from a catalog and have them appear.
  3. **Fix a fact in place** — correct a scalar/enum field from the panel without leaving
     it, and see the change reflected everywhere.
- **Pain Points:** No roster/entry point except the file tree; curated views require
  hand-importing raw queries; the panel is read-only, so every fix is a context switch out
  to the note and back.

### Secondary Personas

**The plugin maintainer (M4 builder / M5+ consumer).**
- **Demographics:** The author building M4 on top of M2's engine registry (the `bases`
  slot) and M3's curated `sf-view` seed set.
- **Goals:** Fill the M2 `bases` registry slot with a real read-only engine; wrap the M3
  `_forge` seed views as installable `curated`-provenance catalog entries without
  re-authoring queries; stand up a repeatable **catalog build pipeline** (a `catalog/`
  source dir → build script → checksummed, versioned `dist/index.json` shipped in the
  plugin) that M5/M6 views can extend; and reuse the M2 consent + checksum-drift machinery
  rather than inventing new install plumbing.
- **Pain Points:** Without M4 there is no way to distribute the reviewed views, no Bases
  adapter to lean on for grids, and no proven write-back path for later interactive views.

## User Journey Maps

### Primary User Journey (A): Open a `.base` as a sidebar tab

1. **Awareness:** The writer wants a specific curated database view — say, the roster of
   characters — living alongside the Context tab in the sidebar.
2. **Consideration:** Story Forge's sidebar already carries Dataview view-tabs from M2/M3;
   the writer expects Bases-backed tabs to sit right next to them.
3. **Adoption:** A curated `.base` renders read-only in a Story Forge view-tab (the
   sidepanel Bases engine, S51 sidepanel fence). It follows the active note like the other
   tabs.
4. **Usage:** The writer switches notes; the base re-scopes. When they later disable core
   Bases, the tab shows the same engine-missing/degrade state the panel uses for a missing
   Dataview (S46 Bases-off), pointing them at enabling Bases — nothing else breaks.
5. **Retention:** Bases tabs become a peer of Dataview tabs; the writer picks whichever
   engine renders a given curated view.

### Primary User Journey (B): Codex category → grid → click → detail in the panel

1. **Awareness:** The writer wants to see everyone in the story, not just the note in front
   of them.
2. **Consideration:** They open the Codex (a main-area view) with category tabs —
   Characters / Locations / Objects / Lore.
3. **Adoption:** Each tab shows a grid of canon entities of that kind (S44 Codex grid); an
   empty category shows an honest per-category empty-state (S45).
4. **Usage:** The writer clicks a row; the **M3 contextual panel re-subjects** to that
   entity and shows its full detail — the same drill-in machinery M3 already has (S56
   Codex↔panel selection). The writer browses the roster in the main area and reads detail
   in the sidebar, in tandem.
5. **Retention:** The Codex becomes the writer's home base for the world; the panel is the
   detail pane it drives.

### Primary User Journey (C): Browse official → preview → install → appears (+ update-available)

1. **Awareness:** The writer wants a ready-made overview view but won't write a query.
2. **Consideration:** They open "Browse official" — a modal listing the bundled curated
   views with provenance and a checksum (S47 catalog list).
3. **Adoption:** They preview a view (S48 preview), then click Install. A `.base`/DQL view
   installs 1-click (declarative, no code); a **DataviewJS** view routes through the full
   M2 consent gate first (S57 JS-consent). The install writes a `curated`-provenance
   record and the view appears.
4. **Usage:** Later, a bundled catalog update ships a newer checksum for an installed view;
   the row shows an "update available" affordance (S49 update). The writer chooses whether
   to update.
5. **Retention:** The writer treats the catalog as a trusted, offline library — reviewed
   views, provenance-stamped, no query authoring, no network.

### Primary User Journey (D): Inspector edit → write frontmatter → reflected everywhere

1. **Awareness:** Reading a character's detail, the writer notices `status` is wrong.
2. **Consideration:** The Inspector shows the read-only M3 detail *plus* editable
   scalar/enum fields (S52 Inspector detail).
3. **Adoption:** The writer edits the `status` enum; the field goes dirty (S53 dirty) and
   they commit.
4. **Usage:** On commit, Story Forge writes plain frontmatter via the file manager; the
   saved state confirms (S54 saved) and the `metadataCache` change fans out so the panel,
   the Codex grid, and any open base re-render with the new value. If validation fails or
   the write fails, an error state shows and the edit is preserved (S55 error), never
   silently lost.
5. **Retention:** The writer trusts the panel as an editing surface for the fields it
   supports, confident the data still lives in plain frontmatter that every other tool
   reads.

## Feature Requirements

M4's Must set: a read-only Bases render engine in the sidebar (F1); a Codex of category
grids that click through into the M3 panel (F2); five installable overview views (F3); a
bundled, checksummed catalog with a "Browse official" install modal (F4); graceful
handling of a disabled/absent core Bases (F5); and a minimal editable Inspector that proves
the frontmatter write-back loop (F6). F-numbering continues the project series (M3 used
F1–F7; these are M4's F1–F6). UX produced states **S44–S57**, rendered as styled HTML in
[`mockups.html`](mockups.html); features cite them by number. No ASCII is inlined here.

### Must Have Features

#### Feature 1 (F1): Sidepanel Bases engine

- **User Story:** As the fiction writer, I want a curated `.base` to render read-only in a
  Story Forge sidebar view-tab alongside my Dataview tabs and follow the active note, so
  Bases is a first-class render engine in the panel. *(mockups S51; ADR-0001 decision 1)*
- **Acceptance Criteria (Gherkin Format):**
  - [ ] Given core Bases is enabled and a curated `.base` view is selected, When its
    Story Forge sidebar view-tab renders, Then the base displays read-only inside the
    plugin's own container, filling the M2 `bases` engine-registry slot (no longer the
    "Engine coming in M4" stub).
  - [ ] Given a Bases view-tab is open, When the active note changes, Then the base
    re-scopes to the new note like the other Story Forge view-tabs (follows the active
    note), within the existing debounce window.
  - [ ] Given a Bases view-tab is torn down (tab switch, note change, or panel close),
    When it is replaced, Then its render is disposed leak-free (owned component
    teardown; no stale content bleed) per the M3 teardown discipline.
  - [ ] Given core Bases is disabled or absent, When a Bases view-tab would render, Then
    it shows the engine-missing/degrade state (per F5) that points the writer at
    enabling Bases — never a crash or a blank tab (S46).
  - [ ] Given a curated `.base` references a field some notes lack, When it renders, Then
    notes missing that field are tolerated (blank/omitted cell), not an error.
  - [ ] Given the sidebar has both Dataview and Bases view-tabs, When the writer switches
    between them, Then each renders through its own engine with no cross-engine bleed.

#### Feature 2 (F2): Codex — read-only grids + click → panel

- **User Story:** As the fiction writer, I want a main-area Codex with category tabs
  (Characters / Locations / Objects / Lore), each a grid of canon entities, so I can browse
  the whole world top-down and click any row to open its detail in the contextual panel.
  *(mockups S44, S45, S46, S56; ADR-0001 decision 2)*
- **Acceptance Criteria (Gherkin Format):**
  - [ ] Given core Bases is enabled, When the writer opens the Codex, Then it shows
    category tabs — Characters, Locations, Objects, Lore — each rendering a grid of the
    canon entities of that kind (S44).
  - [ ] Given a Codex category grid, When the writer clicks a row, Then the M3 contextual
    panel **re-subjects** to that entity and shows its detail (reusing the M3 drill-in),
    with the selection reflected in the grid (S56).
  - [ ] Given a category with no canon entities of that kind, When its tab renders, Then a
    per-category empty-state is shown (e.g. "No characters yet.") — not a blank grid
    (S45).
  - [ ] Given the Codex is read-only, When the writer views a grid, Then no cell is
    editable in the Codex itself (editing is the Inspector's job, F6) — the Codex is a
    click-through browser only.
  - [ ] Given core Bases is disabled or absent, When the writer opens the Codex, Then it
    shows the Bases-off degrade state pointing at enabling Bases (per F5), while the M3
    panel and Dataview keep working (S46).
  - [ ] Given the writer clicks a Codex row for a note that no longer resolves to a vault
    file, When the panel re-subjects, Then the M3 "not a tracked entity"/unresolved state
    shows — never a thrown error.
  - [ ] Given the Codex is torn down or the writer switches category tabs, When it
    re-renders, Then the previous grid is disposed leak-free with no stale content bleed.

#### Feature 3 (F3): Overview catalog views

- **User Story:** As the fiction writer, I want installable global overview views —
  Characters, Locations, Objects, Lore, and Scenes — with sensible fields, sort, and
  grouping, so I get ready-made rosters without authoring any query. *(field/sort/group per
  `docs/view-roadmap.md` V4–V8)*
- **Acceptance Criteria (Gherkin Format):**
  - [ ] Given the M4 build, When the overview view set is authored, Then it includes
    exactly five global (not note-scoped) views: **Characters** (`name`, `role`, `status`,
    `tagline`), **Locations** (grouped by `locationType`; `world`, `region`), **Objects**
    (`name`, `kind`, `owner`), **Lore** (`name`, `scope`, `related`), and **Scenes**
    (`order`, `status`, `pov`, `location`; sorted by `order`).
  - [ ] Given an installed overview view, When it renders, Then its fields, sort, and
    grouping match the `docs/view-roadmap.md` V4–V8 spec for that category.
  - [ ] Given an overview view references a field, When a note in scope is missing that
    field, Then the note is still listed with a blank/omitted cell — the view tolerates
    notes missing a field, no error.
  - [ ] Given an overview view is a `.base`, When core Bases is disabled or absent, Then it
    degrades per F5 (engine-missing state), consistent with F1.
  - [ ] Given the five overview views are authored, When the catalog is built (F4), Then
    each is available as an installable catalog entry with provenance and checksum.

#### Feature 4 (F4): Curated catalog + install

- **User Story:** As the fiction writer, I want a "Browse official" library of reviewed
  views that installs in one click and works entirely offline, so I can add curated views
  without writing queries or trusting a network fetch. *(mockups S47, S48, S49, S57)*
- **Acceptance Criteria (Gherkin Format):**
  - [ ] Given the plugin build, When it ships, Then a `catalog/` source dir is compiled by
    a build script into a **checksummed, versioned `dist/index.json` bundled in the
    plugin** — no remote fetch at runtime (offline).
  - [ ] Given the writer opens "Browse official", When the modal loads, Then it lists the
    curated views each with provenance and a checksum (S47), and offers a preview (S48).
  - [ ] Given the writer installs a `.base` or DQL (declarative, no code) curated view,
    When they click Install, Then it installs **1-click** (no consent gate) and a record
    with `curated` provenance is written.
  - [ ] Given the writer installs a **DataviewJS** curated view, When they click Install,
    Then the **full M2 consent gate** is shown first and install proceeds only on consent
    (S57).
  - [ ] Given a bundled catalog entry, When its shipped checksum does not match the entry
    on install, Then install **fails closed** (the tampered/mismatched view is not
    installed) — reusing the M2 checksum-drift machinery.
  - [ ] Given an installed view, When it appears, Then it is surfaced through the existing
    Story Forge view/import surfaces (a `curated`-provenance install), reusing the M2
    import/consent plumbing rather than a new install path.
  - [ ] Given the writer is offline, When they browse and install from the catalog, Then
    everything works (the catalog is bundled) — no network access is attempted.

#### Feature 5 (F5): Bases availability handling

- **User Story:** As the fiction writer, when core Bases is disabled or my Obsidian is too
  old, I want Story Forge to tell me how to enable Bases and degrade gracefully, so the
  plugin still loads and my M3 panel and Dataview tabs keep working. *(mockups S46; ADR-0001
  consequences; reuses the M2 engine-missing / S11 pattern)*
- **Acceptance Criteria (Gherkin Format):**
  - [ ] Given the plugin loads, When core Bases is disabled or absent, Then Story Forge
    **feature-detects** Bases and the plugin still loads fully; the M3 contextual panel and
    the Dataview engine remain functional.
  - [ ] Given a Bases surface (F1 sidepanel engine, F2 Codex, or an F3 `.base` overview)
    would render with Bases unavailable, When it renders, Then it shows a **warn + point
    to enabling Bases** state that degrades **exactly like a missing/disabled Dataview**
    (the same UX as M2's engine-missing state, S11) (S46).
  - [ ] Given Bases is unavailable, When the writer enables core Bases and returns, Then
    the Bases surfaces render without requiring a plugin reinstall (they recover on the
    next render, consistent with the Dataview-missing recovery pattern).
  - [ ] Given the plugin manifest, When M4 ships, Then `minAppVersion` is **1.12.7**
    (current Obsidian stable; Bases needs ≥1.10, so this floor is honest and sufficient;
    1.13 is Catalyst/beta and not required).
  - [ ] Given the writer is on an Obsidian older than the Bases API floor, When a Bases
    surface would render, Then it degrades per the same engine-missing state — never a
    crash.

#### Feature 6 (F6): Inspector — minimal editable

- **User Story:** As the fiction writer, I want to edit an entity's scalar and enum fields
  from its detail view and have the change written to plain frontmatter and reflected
  everywhere, so I can fix a fact in place without leaving the panel. *(mockups S52, S53,
  S54, S55; ADR-0001 decision 3 — custom DOM + frontmatter write-back)*
- **Acceptance Criteria (Gherkin Format):**
  - [ ] Given an entity's detail, When the Inspector renders, Then it shows the read-only
    M3 detail **plus** editable **scalar and enum** fields (the minimal set that proves the
    write-back loop) (S52); full field types (wikilink-chip lists) and rich validation are
    out of scope (Could / F-Won't).
  - [ ] Given the writer edits an editable field, When the value changes from its committed
    value, Then the Inspector shows a **dirty** state with a way to commit (S53).
  - [ ] Given a dirty scalar/enum edit, When the writer commits, Then Story Forge writes
    **plain frontmatter** via the file manager (no plugin-owned state) and shows a **saved**
    state (S54).
  - [ ] Given a committed edit, When the frontmatter is written, Then the `metadataCache`
    change **fans out** so the M3 panel, the Codex grid, and any open base re-render with
    the new value.
  - [ ] Given an edit fails validation (an invalid value for the field), When the writer
    commits, Then a **validation-error** state shows and the writer's edit is **preserved**
    (not discarded, not written) (S55).
  - [ ] Given the frontmatter write itself fails (I/O or write error), When the commit is
    attempted, Then a **write-failure** state shows and the edit is **preserved** so the
    writer can retry — the field is never silently lost.
  - [ ] Given the writer edits an enum to an out-of-vocabulary value, When the plugin
    resolves how to handle it, Then behaviour follows the "frontmatter is truth" invariant
    (the exact select-vocabulary policy is an SDD-level open question, below).

### Should Have Features

#### Feature 7 (F7): Catalog update notifications

- **User Story:** As the fiction writer, I want to be told when a bundled catalog update
  ships a newer version of a view I installed, so I can choose to update it. *(mockups S49)*
- **Acceptance Criteria (Gherkin Format):**
  - [ ] Given an installed curated view and a newer bundled catalog entry with a different
    checksum, When "Browse official" lists that view, Then the row shows a per-row
    **"update available"** affordance (S49).
  - [ ] Given an "update available" row, When the writer chooses to update, Then the newer
    curated entry is installed reusing the same install path as F4 (`.base`/DQL 1-click;
    DataviewJS re-gated), and the record's provenance/checksum is refreshed.
  - [ ] Given no installed view has drifted, When the modal opens, Then no update
    affordance is shown (notifications are not noise).

#### Feature 8 (F8): Additional Inspector read-only field types

- **User Story:** As the fiction writer, I want the Inspector to *display* list and
  relation fields (read-only) alongside the editable scalar/enum fields, so the detail is
  complete even where editing isn't yet supported.
- **Acceptance Criteria (Gherkin Format):**
  - [ ] Given an entity with list or relation (wikilink) fields, When the Inspector
    renders, Then those fields are shown **read-only** (display only), clearly not
    editable, while scalar/enum fields remain editable (F6).
  - [ ] Given a read-only relation field with an unresolved `[[link]]`, When it renders,
    Then it uses the M3 unresolved-row treatment (muted, non-clickable), not an error.

### Could Have Features

- **Full editable Inspector** — editable wikilink-chip lists (relation fields) and rich
  per-field validation (M6-adjacent).
- **Codex filtering / grouping beyond flat grids** — group Characters by role, filter
  Locations by region, etc., inside the Codex.
- **Codex row → open note** — a modifier action on a Codex row that opens the note in the
  editor (in addition to the default drill-into-panel), mirroring the M3 F6 dual path.

### Won't Have (This Phase)

- **Note-panel (in-note) surface** — the Storyline-style inspector rendering *in/with* the
  active note (DESIGN §2 surface B). M4 stays sidebar + main-area only.
- **M5/M6 workspace / interactive views** — Kanban, Plotgrid, Timeline, Plotlines and any
  drag → frontmatter interaction. M4's only write path is the F6 Inspector's scalar/enum
  commits.
- **Remote / live catalog fetch** — no network. The catalog is bundled and offline in v0.2;
  fetching updates from a remote source is deferred.
- **Programmatic reading/writing of Bases cell values** — no public API exists (ADR-0001);
  Bases surfaces are read-only renders. All writes go through frontmatter (F6), never
  through Bases.
- **Full editable Inspector** (wikilink-chip lists, rich validation) — see Could.

## Detailed Feature Specifications

### Feature: F4 — Curated catalog + install *(the most complex feature)*

**Description:** F4 is the most complex Must feature: it spans a build-time pipeline, a
runtime install flow with two consent paths, provenance tracking, and a fail-closed
integrity check — all reusing M2 machinery rather than inventing new plumbing. A `catalog/`
source directory is compiled by a build script into a **checksummed, versioned
`dist/index.json`** that ships *inside* the plugin. At runtime, a "Browse official" modal
lists the curated views with provenance and checksum; the writer previews and installs.
Declarative views (`.base`, DQL) install 1-click; **DataviewJS** views (which carry code)
route through the M2 consent gate first. Every install writes a record stamped with
`curated` provenance, and an install whose shipped checksum doesn't match fails closed. It
is offline end-to-end.

**User Flow:**
1. Writer opens "Browse official" (S47) — the modal lists bundled curated views with
   provenance + checksum.
2. Writer previews a view (S48).
3. Writer clicks Install:
   - `.base` / DQL → installs 1-click, writes a `curated`-provenance record.
   - DataviewJS → the M2 consent gate shows first (S57); install proceeds only on consent.
4. Checksum is verified against the bundled entry; on mismatch, install **fails closed**.
5. The installed view appears through the existing Story Forge view/import surfaces.
6. Later, a bundled update with a newer checksum surfaces an "update available" row (F7,
   S49); the writer opts to update.

**Business Rules:**
- The catalog is **bundled and offline** — no runtime network access is attempted, ever.
- **DataviewJS installs gate; `.base`/DQL install 1-click** — code-bearing views require
  consent; declarative views do not.
- Every install is stamped **`curated`** provenance and records the checksum.
- Checksum mismatch → **fail closed** (do not install a tampered/mismatched view).
- Install reuses the **M2 consent gate + checksum-drift** machinery; no parallel install
  path is invented.

**Edge Cases:**
- Bundled checksum mismatch → install refused, writer told why (fail-closed).
- Writer offline → full browse + install still works (bundled).
- Installing a view that is already installed → surfaced as up-to-date (or "update
  available" if the bundled checksum is newer, F7), not a duplicate.
- DataviewJS consent declined → nothing installed; the modal returns to the list.
- A curated `.base` that references an entity kind with zero notes → installs fine; renders
  its empty-state (per F3/F2).

## Success Metrics

Story Forge is a **local-first Obsidian plugin with no telemetry** (invariant carried from
M3). Success is measured by **demonstrable, verifiable exit criteria** run against the test
vault (`test/StoryForge/`, Wardens of Moonharbor) plus the de-risking prototype — **not by
tracked analytics events**. There are no events, no counters, no phone-home.

### Key Verification Signals

- **Exit criterion (build-plan M4):** the Codex is browsable; overview views are
  installable from the catalog; the ADR-0001 spike verdict is recorded (✓) and the
  Inspector strategy chosen (③ custom ✓). Verified manually on the seed vault. v0.2 tag.
- **F1:** a curated `.base` renders read-only in a sidebar view-tab and follows the active
  note; disabling core Bases shows the degrade state; teardown leaves no leak — all
  reproducible on the seed vault (S51, S46).
- **F2:** the Codex shows all four category grids; clicking a row re-subjects the M3 panel
  to that entity; empty categories show their empty-state — reproducible (S44, S45, S56).
- **F3:** all five overview views (Characters/Locations/Objects/Lore/Scenes) install and
  render with the roadmap V4–V8 fields/sort/group, tolerating notes missing a field.
- **F4:** "Browse official" lists curated views with provenance + checksum; `.base`/DQL
  installs 1-click, DataviewJS gates; a deliberately mismatched checksum fails closed;
  everything works offline (S47–S49, S57).
- **F5:** with core Bases disabled, the plugin still loads, the M3 panel + Dataview keep
  working, and every Bases surface shows the warn/degrade state; `minAppVersion` is 1.12.7.
- **F6:** editing a scalar/enum field and committing writes plain frontmatter, shows saved,
  and the panel + Codex + open base re-render; a bad value shows a validation error with
  the edit preserved; a write failure shows an error with the edit preserved (S52–S55).
  The write-back loop is proven end-to-end.
- **De-risking prototype (gate before SDD lock):** a prototype confirms embedded-base
  interactivity and Bases **mobile** parity; if mobile fails, Bases surfaces are documented
  as **desktop-only** (like DataviewJS).
- **Gates green:** `npm run test`, `lint`, `typecheck`, `typecheck:test`, `schema:check`,
  and `build` all pass.

### Tracking Requirements

**None — local-first, no telemetry.** There are no analytics events to track. The
"tracking" for M4 is the set of unit tests + the manual verification-vault checks + the
de-risking prototype above; the SDD/PLAN enumerates the test assertions that stand in for
tracking. No user data leaves the vault.

---

## Constraints and Assumptions

### Constraints

- **Frontmatter is truth (CON, carried from M3).** Vault notes are read-only **except** the
  F6 Inspector's writes, which are **plain-frontmatter writes via the file manager** — no
  plugin-owned relation store, no plugin-owned state. Bases cell values are never written
  programmatically (no public API; ADR-0001).
- **Additive to M1/M2/M3 contracts.** M4 fills the M2 `bases` engine-registry slot and
  reuses M2's consent gate + checksum-drift machinery and M3's contextual panel drill-in;
  it does not change the M1/M2/M3 public contracts (`NoteContext`, `ResolvedEntity`, the
  engine-registry shape).
- **Teardown discipline (carried from M3).** Every Bases surface, Codex grid, and Inspector
  obeys the M3 teardown discipline (`teardown → empty → render`, registered/delegated
  listeners, no per-render leaks, no stale content bleed).
- **`minAppVersion` → 1.12.7.** Current Obsidian stable; Bases needs ≥1.10, so this floor is
  honest and sufficient. 1.13 is Catalyst/beta and is not required. The core contextual
  panel + Dataview engine keep working below this only via degrade (they don't gain new
  requirements from M4).
- **Core Bases may be disabled.** Bases is a **core plugin the user may have turned off**;
  M4 must feature-detect it and degrade (F5), never assume it is present.
- **Public API only.** Bases usage is confined to the documented public surface
  (`MarkdownRenderer` fence for the sidepanel engine; `registerBasesView` for the Codex; no
  private `controller.view` casts) per ADR-0001; frontmatter writes use the public file
  manager `processFrontMatter`.
- **No 3rd-party plugin dependency.** Do not depend on `advanced-bases`, the community
  Kanban plugin, or any other 3rd-party plugin (ADR-0001). Dataview stays a soft,
  feature-detected dependency as in M2/M3.
- **Offline / no telemetry.** The catalog is bundled; no runtime network access; no
  analytics.
- **Branch + process discipline.** Work proceeds on the **`bases-codex-catalog`** branch;
  hooks block direct commits to `main`; Conventional Commits; **English-only** committed
  content (plugin and test vault).

### Assumptions

- The writer's vault follows the `_forge` model (canonical note per entity, typed
  `[[wikilink]]` relations, classifier tags) — the Codex grids and overview views scope on
  those tags/folders.
- The writer has M3 installed; the contextual panel with its drill-in (`_drillInto` /
  `navStack`) is present for the Codex to re-subject into.
- The M2 engine registry exposes a `bases` slot and the consent gate + checksum-drift
  machinery are reusable for the catalog install flow.
- The M3 curated `_forge` `sf-view` seed set exists to be wrapped as `curated`-provenance
  catalog entries without re-authoring queries.
- The de-risking prototype will run before the SDD locks; if Bases mobile parity fails,
  Bases surfaces degrade to desktop-only (like DataviewJS) and the assumption of mobile
  parity is dropped.

## Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| **Bases API / format churn** — `BasesView`/`QueryController`/`BasesEntry`/`BasesConfigFile` are young and evolved across 1.9.x | High | Medium-High | Confine all Bases-typings usage to **one small adapter module**; validate authored `.base` YAML at **build time** against the config schema; add a schema smoke test (ADR-0001) |
| **Embedded-base interactivity unknown** — docs could not confirm whether an embedded base is interactive | High | Medium | **De-risking prototype must run before the SDD locks**; if interactivity is insufficient, the sidepanel engine stays a read-only render (already the F1 scope) |
| **Bases mobile parity unknown** — docs could not confirm Bases works on mobile | Medium | Medium | Prototype verifies desktop **and** mobile; if mobile fails, Bases surfaces **degrade to desktop-only** (like DataviewJS), and the M3 panel + Dataview keep working on mobile |
| **Codex→panel selection needs a new public seam** on the sidebar view (a `showFile(file)`-style entry point) | Medium | Medium | Flag as an SDD-level open question; design the seam in the SDD before F2 build; reuse the M3 drill-in behind it |
| **Catalog checksum mismatch** could install a tampered view | Medium | Low | **Fail closed** — never install a view whose bundled checksum doesn't match (F4); reuse M2 checksum-drift machinery |
| **`minAppVersion` bump** narrows the supported Obsidian range | Low | Low | 1.12.7 is current stable and the honest Bases floor; core panel + Dataview degrade rather than hard-fail when Bases is unavailable (F5) |
| **DataviewJS install bypasses consent** if the gate isn't wired to the catalog path | Medium | Low | F4 AC: DataviewJS installs **must** route through the M2 consent gate; `.base`/DQL 1-click only because they are declarative/no-code |

## Open Questions

All PRD-level scope questions were resolved in the decisions round (README decisions log +
the LOCKED DECISIONS for this milestone). Remaining items are **SDD-level** (technical) and
are carried forward, not blockers:

- [ ] SDD: **Inspector home** — sidebar tab vs main-area view vs modal for the editable
  Inspector.
- [ ] SDD: **Codex view-type count** — one polymorphic Bases view type with a category
  option vs one registered view type per category.
- [ ] SDD: **Curated `.base` install consent flow** — whether installing a curated `.base`
  (which writes a file to the vault) warrants a light consent step or is treated as
  curated-trust direct install.
- [ ] SDD: **The `showFile(file)` seam** — the exact new public entry point on the sidebar
  view that lets the Codex re-subject the M3 panel.
- [ ] SDD: **Where curated `.base` files live** in the vault after install.
- [ ] SDD: **Out-of-vocabulary `select` writes** — whether the plugin writes values outside
  a `select` field's declared vocabulary (frontmatter-is-truth argues yes; needs an
  explicit policy).

---

## Supporting Research

### Competitive Analysis

**Storyline** remains the visual reference (frontmatter-backed, note-following inspector
with editable profiles). M4 goes beyond Storyline's per-note inspector in two ways the
design calls out: a **top-down Codex** (Storyline has no roster/library) and a **bundled,
provenance-stamped curated catalog** (Storyline ships fixed views, not an installable
library). Story Forge keeps its invariant — it reads frontmatter and writes only plain
Properties, never owning state — where Storyline owns its data. The **markdown-mason**
sibling supplies the catalog pattern being cloned (a `catalog/` source dir → build script →
checksummed `dist/index.json` + "Browse official" modal + consent gate).

### User Research

Parallel research agents (Requirements, UX/mockups, Technical/Integration) plus the
ADR-0001 Bases spike converged on the M4 scope. Key findings baked into this PRD: **no
public API** to embed an existing `.base` or read/write Bases cells, so the sidepanel engine
is a read-only `MarkdownRenderer` fence and the Codex uses `registerBasesView`
(ADR-0001); **frontmatter write-back works cleanly** via the file manager
`processFrontMatter`, so the Inspector is custom DOM (ADR-0001 option ③), scoped in v0.2 to
**scalar/enum** fields to prove the loop; the **catalog reuses M2's consent + checksum-drift
machinery** rather than new plumbing; **Bases must be feature-detected** and degrade like a
missing Dataview because it is a core plugin the user may disable; and two items **only a
live prototype can settle** — embedded-base interactivity and Bases mobile parity — gate the
SDD. UX produced mockup states **S44–S57** (Codex grid/empty/Bases-off; catalog
list/preview/update/JS-consent; Overview-Scenes; sidepanel fence; Inspector
detail/dirty/saved/error; Codex↔panel selection), rendered into `mockups.html` during the
SDD.

### Market Data

Not applicable — a personal-use, local-first Obsidian plugin with no market or telemetry
dimension.

---

## Output Schema

| Field | Value |
|-------|-------|
| **Spec** | 005-bases-codex-catalog |
| **Milestone** | M4 — Bases + Codex + catalog (ships v0.2) |
| **Phase** | PRD |
| **Personas** | 2 (fiction writer/worldbuilder; plugin maintainer) |
| **User Journeys** | 4 (A: sidebar `.base` tab · B: Codex → grid → panel · C: Browse official → install → update · D: Inspector edit → write → reflect) |
| **Must features** | 6 (F1 sidepanel Bases engine · F2 Codex · F3 overview views · F4 curated catalog + install · F5 Bases availability · F6 Inspector) |
| **Should features** | 2 (F7 update notifications · F8 read-only Inspector field types) |
| **Could features** | 3 (full editable Inspector · Codex filtering/grouping · Codex row → open note) |
| **Won't (this phase)** | note-panel surface · M5/M6 interactive views · remote catalog fetch · programmatic Bases cell R/W |
| **Mockup states** | S44–S57 |
| **Governing ADR** | ADR-0001 (Bases integration strategy — Accepted) |
| **Open questions** | 6, all SDD-level (Inspector home · Codex view-type count · curated `.base` consent · `showFile` seam · curated `.base` vault location · out-of-vocab `select` writes) |
| **Branch** | `bases-codex-catalog` |
| **Telemetry** | None — local-first, no telemetry |
