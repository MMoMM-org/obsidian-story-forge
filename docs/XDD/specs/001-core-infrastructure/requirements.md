---
title: "Core Infrastructure — the note-following panel shell, entity-context resolver, and view store"
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

- [x] Problem is validated by evidence (Storyline source analysis + 5 research agents)
- [x] Context → Problem → Solution flow makes sense
- [x] Every persona has at least one user journey
- [x] All MoSCoW categories addressed (Must/Should/Could/Won't)
- [x] Every metric has corresponding verification events
- [x] No feature redundancy
- [x] No technical implementation details included (deferred to SDD)
- [x] A new team member could understand this PRD

---

## Product Overview

### Vision
A reference panel that silently follows whatever note the writer is editing and stands ready to surface the story context around it — built on a foundation that treats the vault's frontmatter as the single source of truth.

### Problem Statement
Milestone M1 solves two coupled problems:

1. **For the writer:** in a fiction vault where every character, location, object, and scene is a note, keeping track of who/what relates to the note in front of you means manually opening other notes or scanning backlinks. There is no surface that automatically follows the active note and prepares its story context.
2. **For the plugin itself:** Story Forge's later views (contextual content, Codex, Kanban, Timeline) all need the same three things before any of them can exist — a place to persist which views are enabled and consented, a way to turn "the active note" into a classified set of related entities, and a dockable panel that tracks the active editor. Without this shared foundation, every later milestone would re-implement note-tracking and metadata traversal, and consent/enable state would have no home.

The consequence of not building M1 first: each view milestone reinvents the spine, `data.json` state churns with no contract, and cross-milestone rework compounds.

### Value Proposition
- **Zero-effort context tracking:** the panel follows the active note automatically — no command to run, no manual refresh.
- **A stable, frontmatter-truth foundation:** later views plug into one entity-context contract and one configuration store, so they ship faster and never own canonical state. Unlike Storyline (which bakes views into code and becomes the owner of the data), Story Forge's foundation keeps the data in the vault and the behavior declarative.

## User Personas

### Primary Persona: The fiction writer
- **Demographics:** Novelist/worldbuilder, 25–55, uses Obsidian daily on desktop and sometimes mobile; comfortable with Markdown and frontmatter Properties but not a programmer; maintains a `_forge`-style vault (one canonical note per entity).
- **Goals:** Stay immersed while writing; see the context around the current scene or entity without breaking flow; trust that the plugin never rewrites their canon behind their back.
- **Pain Points:** Constantly jumping between notes to check facts; existing tools (e.g. Storyline) feel rigid and take ownership of the data; no lightweight "what's related to this note" surface.

### Secondary Personas
**The plugin developer (future-milestone consumer).**
- **Demographics:** The author/maintainer building milestones M2–M7 on top of M1.
- **Goals:** Consume one stable entity-context object and one view-configuration store instead of re-deriving them; add a view without reshaping the panel; keep the plugin submission-compliant from the start.
- **Pain Points:** Metadata traversal and note-following are fiddly and easy to leak listeners on; a shifting foundation would force cross-milestone rewrites.

## User Journey Maps

### Primary User Journey: Writing a scene with the panel open
1. **Awareness:** The writer notices they keep opening related notes to check facts while drafting a scene.
2. **Consideration:** They look for a sidebar that shows context automatically; they weigh Story Forge against heavier, more opinionated tools.
3. **Adoption:** They open the Story Forge panel once (ribbon icon or command); it docks in the right sidebar and stays.
4. **Usage:** As they move between the scene note and its characters/locations, the panel's header updates to show the active note and its detected story-entity type; when they land on a non-entity note it says so plainly; they pin the panel to a key character to keep it as a reference while navigating away.
5. **Retention:** The panel is unobtrusive, never gets in the way, never edits their notes, and is always correct about what they're looking at — so they leave it open.

### Secondary User Journey: Building the next milestone on the foundation
1. **Awareness:** The developer starts M2 (query engine) and needs the active note's related entities.
2. **Consideration:** They check whether M1 exposes a ready context object and a store for view state.
3. **Adoption:** They consume the entity-context contract and register a new view in the store.
4. **Usage:** Their view renders inside an existing panel tab; enable/consent state persists in the store without new plumbing.
5. **Retention:** Because the contract held, no foundation changes were needed — the pattern repeats for M3–M6.

## Feature Requirements

### Must Have Features
The minimum for M1 to be valuable and to unblock later milestones: the panel shell that follows the active note, the entity-context resolver it feeds on, and the persistent view store.

#### Feature 1: Note-following sidebar panel shell
- **User Story:** As a fiction writer, I want a dockable panel that follows the note I'm editing, so that I always see the context of my current note without running a command.
- **Acceptance Criteria (Gherkin Format):**
  - [ ] Given Story Forge is installed, When the user clicks its ribbon icon or runs its "open panel" command, Then a panel docks in the right sidebar with a stable title and icon.
  - [ ] Given the panel is open and a markdown note is active, When the user switches to a different markdown note, Then the panel header updates to show the new note's title and detected story-entity type.
  - [ ] Given the panel is open, When no markdown note is active, Then the panel shows a clear empty state ("Open a note to see its story context") rather than a blank pane.
  - [ ] Given the panel is open, When a non-markdown file (PDF, image, canvas) is focused, Then the panel shows a distinct message ("Story Forge follows markdown notes"), not an error.
  - [ ] Given the active note is not a tracked story entity, When it becomes active, Then the header reads "Not a story entity" and the body explains the note isn't a tracked character/location/scene/etc.
  - [ ] Given the user switches notes rapidly, When several switches happen in quick succession, Then the panel coalesces them and settles on the last note without flicker or stale content.
  - [ ] Given the panel is closed by the user, When Obsidian reloads, Then the plugin unloads cleanly with no orphaned listeners or timers.

> **Navigation model (subject abstraction).** The panel renders a *subject* entity.
> In M1 the subject's source is either **follow** (the active note) or **pinned**
> (Feature 2) — pin is the M1 proof that the subject can differ from the active note.
> M3 adds a third source, **focused** (drill into a linked entity from within the
> panel, with back/breadcrumb, a ▾ sibling picker, and ‹ pill › category switch), plus
> clicking an entity name to drill in and `↗`/⌘-click to open its note. That drill-in
> navigation is designed now in [`mockups.html`](./mockups.html) state **S10** but is
> **built in M3** — M1 only needs the subject-source seam that pin already exercises.

#### Feature 2: Pin / lock-to-note
- **User Story:** As a fiction writer, I want to pin the panel to a specific note, so that I can navigate elsewhere while keeping that note's context visible as a reference.
- **Acceptance Criteria (Gherkin Format):**
  - [ ] Given a supported note is shown, When the user activates the pin toggle in the panel header, Then the panel freezes on that note and ignores active-note changes.
  - [ ] Given the panel is pinned, When the user opens other notes, Then the panel keeps showing the pinned note and the pin control indicates the pinned state.
  - [ ] Given the panel is pinned, When the user deactivates the pin, Then the panel resumes following the active note immediately.

#### Feature 3: Entity-context resolution (outgoing relations)
- **User Story:** As the plugin (and its future milestones), I want the active note turned into a classified set of its related story entities, so that every view can be scoped to "entities linked from this note" without re-deriving it.
- **Acceptance Criteria (Gherkin Format):**
  - [ ] Given a scene note with relation Properties (e.g. point-of-view, characters, location, plotlines), When the note becomes active, Then the resolver produces a context object listing each linked entity, the note field it came from, and the entity's classified type.
  - [ ] Given a relation Property that points at a note which does not exist, When the note is resolved, Then that link is reported as unresolved and does not crash resolution.
  - [ ] Given a note with a link to a non-entity note (e.g. a prose reference), When resolved, Then that target is excluded from or marked as a non-entity in the context.
  - [ ] Given the active note's Properties change (e.g. a character is added), When the metadata updates, Then the resolved context for the shown note refreshes without a note switch.
  - [ ] Given no live vault, When the resolver runs in a unit test against fixture metadata, Then it returns the correct classified context (the resolver is testable without Obsidian).

#### Feature 4: Persistent view-configuration store
- **User Story:** As the plugin, I want to persist per-view configuration (origin, enabled state, and a consent slot), so that enable/consent state has a durable home before any view engine exists.
- **Acceptance Criteria (Gherkin Format):**
  - [ ] Given a view configuration record, When it is saved and the plugin reloads, Then the record round-trips intact (origin, enabled state, consent slot).
  - [ ] Given a stored record with missing or malformed fields, When it is loaded, Then safe defaults apply (treated as not-enabled and not-consented) without throwing.
  - [ ] Given the store shares its data file with plugin settings, When a record is written, Then sibling settings are preserved (no clobbering).
  - [ ] Given a record is removed, When the store deletes it, Then a subsequent load no longer returns it, and deleting an absent record is a safe no-op.

### Should Have Features
- **First-run onboarding empty state:** when no views are enabled (always true in M1), the panel's body explains what the panel does and where views will come from, turning a dead panel into an onboarding moment.
- **Live refresh on the shown note's metadata change** (Feature 3 already covers resolution refresh; surfacing it in the panel is the "should").

### Could Have Features
- **Restore-if-open on startup:** reopen the panel on load only if the user had it open last session.
- **Pop-out to its own pane** (right-click) — deferrable past M1.
- **Persist last-selected tab and pin state across reloads.**

### Won't Have (This Phase)
- **Any real per-type view content** — relationships, portrait, "appears in" rendering (→ M3).
- **Backlinks / reverse-index ("appears in") resolution** — M1 exposes the seam in the context object but leaves it empty; the reverse index is built in M3.
- **Query engines** — Dataview (DQL/JS) and Bases adapters (→ M2/M4).
- **Consent/disclosure modal, per-view kill-switch, user-import flow** (→ M2).
- **Write-back to frontmatter** (→ M6).
- **Curated catalog / "Browse official"** (→ M4).
- **Multiple sidebar leaves** — M1 uses one tabbed panel.
- **Browse-in-panel drill-in navigation** — focusing a linked entity in the panel, breadcrumb/back, ▾ sibling picker, ‹ pill › category switch, name-click-to-drill, `↗`/⌘-click to open the note (designed in `mockups.html` S10, **built in M3**). M1 ships only the subject-source seam (follow/pinned).

## Detailed Feature Specifications

### Feature: Note-following sidebar panel shell (the most complex M1 feature)
**Description:** A single dockable panel in the right sidebar that tracks the active markdown editor, classifies the active note, resolves its outgoing entity relations, and renders the appropriate state. In M1 the tab body is a stub that proves the resolved context is available; M3 replaces the stub with real content.

**Interface:** the panel's layout and every state are defined visually in
[`mockups.html`](./mockups.html) (states S1–S9, an Obsidian-styled gallery — open
in a browser), not described in prose here. The mockups are the source of truth for
the interface; the behavioural rules and edge cases below govern *when* each state
shows.

**User Flow:**
1. User opens the panel via ribbon icon or command.
2. System docks the panel in the right sidebar and shows the state for the currently active note (or an empty state).
3. User switches to another note.
4. System updates the header (title + entity type) and the body state for the new note.
5. User pins the panel to keep a note in view, then navigates away.
6. System keeps showing the pinned note until unpinned.

**Business Rules:**
- Rule 1: The panel never modifies any note (read-only in M1; the frontmatter-truth principle forbids ownership of canon).
- Rule 2: Every non-content situation shows an explicit, human-readable state — never a blank pane.
- Rule 3: The panel reacts to the active markdown editor only; focusing the panel itself does not reset it.
- Rule 4: The user's selected tab is preserved across note changes (the note switches content within the tab, not the tab).
- Rule 5: Pin overrides follow behavior entirely until unpinned.

**Edge Cases:**
- No active note → "Open a note to see its story context."
- Non-markdown file focused → "Story Forge follows markdown notes."
- Markdown note that is not a tracked entity → header "Not a story entity" + explanatory body.
- Metadata cache not yet ready at startup → defer first resolution until the workspace is ready, so the first render is correct.
- Malformed frontmatter on the active note → error state with a retry action; logged at debug level, never thrown to the user.
- Rapid note switching → coalesced; the last note wins; no stale render.
- Mobile / narrow width → the panel opens and tracks; the header truncates with the full title available on hover.

## Success Metrics

Story Forge ships with telemetry off and does not phone home, so "metrics" here are **verification signals** measured in tests and manual live-vault checks, not analytics.

### Key Performance Indicators
- **Adoption:** The panel opens and docks on first try via both the ribbon icon and the command (manual live-vault check passes).
- **Engagement:** The panel updates on 100% of active-note switches in a live-vault session without any manual refresh; pin holds a note across navigation.
- **Quality:** Zero listener/timer leaks on unload/detach (verified); active-note switch shows no perceptible lag; green `build`, `lint`, `typecheck`, and `schema:check`; all M1 unit tests and live-vault checks pass.
- **Business Impact (foundation readiness):** M2 can consume the entity-context contract and register a view in the store with **no changes to M1's foundation** — the true measure that the spine is right.

### Tracking Requirements
Measured via automated tests and a scripted live-vault checklist (no user analytics):

| Event | Properties | Purpose |
|-------|------------|---------|
| Store round-trip (unit) | record saved vs loaded | Verify persistence contract |
| Context resolution (unit) | fixture note → classified entities | Verify scoping correctness without a vault |
| Active-note switch (live check) | note before/after → header + body state | Verify follow behavior and states |
| Unload cleanup (live/unit) | listeners/timers before vs after | Verify zero leaks (submission gate) |

## Constraints and Assumptions

### Constraints
- Targets Obsidian `minAppVersion` 1.5.7; `isDesktopOnly: false` (must work on mobile — no Node/Electron APIs, no main-thread-blocking scans).
- Must satisfy Obsidian community-plugin submission rules from the start (listener/timer cleanup via register hooks, `console.debug` only, XSS-safe DOM, no sample-plugin residue).
- **Frontmatter-truth principle:** the plugin renders and (later) writes only plain Properties; it never owns canonical state. M1 is read-only.
- Toolchain fixed: TypeScript + esbuild, vitest for tests, eslint-plugin-obsidianmd already wired.
- No telemetry / no network in M1.

### Assumptions
- The `_forge` schema from M0 is stable: entities carry both a classifying tag (`canon/*`, `manuscript/scene`, planning tags) and a `type` Property, so classification has a reliable source.
- The test vault `test/StoryForge/` with the "Wardens of Moonharbor" seed data is available for live-vault checks.
- Dataview may be present later but is **not required** in M1; the resolver must not assume it.
- Writers keep relations as `[[wikilinks]]` in frontmatter (the `_forge` convention), not as free text.

## Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Reverse-link ("appears in") APIs are unstable/undocumented | High | High | Backlinks deferred to M3; M1 exposes only the seam, resolves outgoing relations via stable metadata reads |
| Metadata cache not fully populated at startup → wrong first render | Medium | Medium | Defer the first resolution until the workspace is ready |
| Entity-context contract changes later → cross-milestone rework | High | Medium | Finalize the context shape in M1 (SDD); keep it engine-agnostic and plain-data so M2/M3 bind safely |
| Listener/timer leaks fail submission | Medium | Low | All listeners/timers via register hooks; a cleanup assertion in tests |
| Mobile performance on large vaults | Medium | Low | No eager vault scan in M1 (backlinks deferred); pure metadata reads for the active note |
| Store racing Obsidian Sync on `data.json` | Low | Low | Save only on user-initiated store mutations, never on note-following; read-modify-write preserves siblings |

## Open Questions
None blocking. Remaining items are **design details for the SDD**, not scope questions:
- [ ] Exact fields of the entity-context object (finalize in SDD; must be engine-agnostic plain data).
- [ ] Debounce timing for the follow pipeline (target ~150–300 ms; tune in SDD/PLAN).
- [ ] Whether the panel restores if it was open last session (a "Could Have"; decide in SDD).

---

## Supporting Research

### Competitive Analysis
Storyline (analyzed at source, v1.10.41) is the closest tool: a full authoring suite that reads frontmatter but renders every view with hand-written code and **writes back through its own manager/undo layer**, making it powerful but rigid and the de-facto owner of the data. Story Forge deliberately differs at the foundation: a follow-the-note panel over a frontmatter-truth model, with view configuration in a small store and rendering pushed to declarative engines later. M1 is where that difference is set — a thin, read-only spine instead of an owning runtime.

### User Research
Grounded in this project's design work rather than external interviews: the Storyline source analysis (three agents), five M1 research agents (Requirements, UX, Technical, Integration, and a markdown-mason store-pattern extraction), and the author's own decisions captured in `docs/build-plan.md` and `docs/views-and-integration.md`. Key findings folded into this PRD: a single tabbed panel is the proven shape; scoping should use the metadata cache (not text matching); the view store should clone the sibling markdown-mason pattern; reverse-links are the risky part and are best deferred.

### Market Data
Obsidian's fiction-writing niche is served by Longform (manuscript authoring) and Storyline (planning suite). Story Forge does not compete with Longform (it owns the manuscript) and positions against Storyline's rigidity by staying frontmatter-native and declarative. No quantitative market sizing is in scope for a personal-first plugin.
