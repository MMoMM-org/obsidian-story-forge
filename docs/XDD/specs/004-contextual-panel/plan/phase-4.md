---
title: "Phase 4: Navigation & settings"
status: pending
version: "1.0"
phase: 4
---

# Phase 4: Navigation & settings

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: SDD/ADR-4]` (drill-in nav stack) · `[ref: SDD/ADR-5]` (link-click setting)
- `[ref: SDD/Runtime View/Drill-in-open flow]` — the state machine
- `[ref: PRD/F6]` — navigation + settings ACs; states S41, S43
- `src/views/SidebarView.ts` (subject/pin, `_renderResolved`, delegated handlers),
  `src/settings/SettingsTab.ts`, `src/types/index.ts` (`PluginSettings`)

**Key Decisions**:
- Default click drills in (push nav stack, re-resolve, follow suspended); modifier-click opens
  the note (`workspace.openLinkText`) and resumes follow; the `linkClickAction` setting swaps
  which is default (ADR-4/5).
- `SubjectSource` gains `"drilled"`; nav stack + collapse state are in-memory (cleared on close).
- Setting persists in the `data.json` settings blob (`StoryForgeData.settings`).

**Dependencies**: Phase 3 (renderers emit the link rows this phase wires).

---

## Tasks

Turns the panel into a navigation surface and makes the click behaviour configurable.

- [ ] **T4.1 `linkClickAction` setting + SettingsTab row** `[activity: frontend-ui]` `[ref: SDD/ADR-5]`

  1. Prime: `PluginSettings` stub `[ref: src/types/index.ts]`; existing `SettingsTab` row
     pattern `[ref: src/settings/SettingsTab.ts]`; store settings blob `[ref: src/store/types.ts; lines: 44-51]`.
  2. Test: `DEFAULT_SETTINGS.linkClickAction === "drill"`; a malformed persisted value falls
     back to `"drill"`; the settings dropdown row reads/writes the value; value round-trips
     through save/load.
  3. Implement: add `linkClickAction: "drill" | "open"` to `PluginSettings` + `DEFAULT_SETTINGS`;
     add a dropdown `Setting` row (sentence-case label) to `SettingsTab`.
  4. Validate: unit tests pass; `typecheck`; `lint`.
  5. Success:
     - [ ] Setting persists and defaults to drill `[ref: PRD/F6]` `[ref: SDD/ADR-5]`

- [ ] **T4.2 Drill-in nav stack + link handler** `[activity: frontend-ui]` `[ref: SDD/ADR-4]`

  1. Prime: subject/pin logic + delegated body handlers `[ref: src/views/SidebarView.ts; lines: 288-358, 460-499]`.
  2. Test:
     - default click on a link row → panel re-subjects to that entity, pushes nav stack,
       follow suspended (`source:"drilled"`); Back pops (S41) `[ref: PRD/F6]`
     - modifier click → `openLinkText` opens the note, stack cleared, follow resumes
     - `linkClickAction:"open"` swaps default/modifier
     - drilling into a non-entity → existing S4 state
     - pinned + diverged shows the S43 hint; unpin resumes follow
     - no listener leak after `body.empty()` (delegated handler)
  3. Implement: extend `SubjectSource` with `"drilled"`; add `navStack: TFile[]` + Back
     affordance + "Open note" footer to the renderers via `PanelDeps.onOpenLink`; wire the
     delegated link-row handler in `SidebarView` honouring the setting + modifier key.
  4. Validate: SidebarView tests pass (incl. teardown/leak assertions via mock `_runCleanup`);
     `typecheck`; `lint`.
  5. Success:
     - [ ] Drill-in / open-note / swap all behave per S41; pinned diverged per S43 `[ref: PRD/F6]`

- [ ] **T4.3 Phase Validation** `[activity: validate]`

  - Run `npm test` (settings + view suites) + `typecheck` + `typecheck:test` + `lint` + `build`.
  - Manually verify in the dev vault: click drills, modifier opens, setting swaps, Back pops,
    pin diverges (S43).
