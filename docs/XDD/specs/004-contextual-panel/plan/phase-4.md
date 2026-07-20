---
title: "Phase 4: Navigation & settings"
status: completed
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

- [x] **T4.1 `linkClickAction` setting + SettingsTab row** `[activity: frontend-ui]` `[ref: SDD/ADR-5]`

  1. Prime: `PluginSettings` stub `[ref: src/types/index.ts]`; existing `SettingsTab` row
     pattern `[ref: src/settings/SettingsTab.ts]`; store settings blob `[ref: src/store/types.ts; lines: 44-51]`.
  2. Test: `DEFAULT_SETTINGS.linkClickAction === "drill"`; a malformed persisted value falls
     back to `"drill"`; the settings dropdown row reads/writes the value; value round-trips
     through save/load.
  3. Implement: add `linkClickAction: "drill" | "open"` to `PluginSettings` + `DEFAULT_SETTINGS`;
     add a dropdown `Setting` row (sentence-case label) to `SettingsTab`.
  4. Validate: unit tests pass; `typecheck`; `lint`.
  5. Success:
     - [x] Setting persists and defaults to drill `[ref: PRD/F6]` `[ref: SDD/ADR-5]`

- [x] **T4.2 Drill-in nav stack + link handler** `[activity: frontend-ui]` `[ref: SDD/ADR-4]`

  **Design choices & SDD deviations (T4.2):**
  - **Back / Open-note chrome (choice F):** rendered by `SidebarView` as chrome
    *around* the engine output, NOT threaded through `PanelDeps` into the 7
    renderers (renderers stay pure). The engine renders into a dedicated
    `.sf-engine-host` div inside `_bodyEl`; the Back bar (`.sf-navbar`/`.sf-back`,
    `data-sf-nav="back"`) and Open-note footer (`.sf-opennote`,
    `data-sf-nav="open"`) are siblings of that host, so the engine's internal
    `body.empty()` never wipes them. The S43 pinhint (`.sf-pinhint`) is rendered
    the same way.
  - **Setting threading:** injected as a getter constructor param
    `getLinkClickAction?: () => PluginSettings["linkClickAction"]` (defaults to
    `() => "drill"`), wired in `main.ts` as `() => this.settings.linkClickAction`
    — a getter, because `main.ts` reassigns `this.settings` on load and a captured
    value would go stale.
  - **Delegated handler:** ONE `registerDomEvent(this._bodyEl, "click", …)` +
    ONE keydown handler registered in `_buildShell`; all body-click routing
    (link drill/open + Back + Open-note) flows through `_onBodyActivate`.
  - **DEVIATION (recorded):** `PanelDeps.onOpenLink: (path: string) => void`
    (shipped) is NOT refactored to the SDD's `(target: TFile, mode) => void`.
    The delegated body handler supersedes per-link `onOpenLink` for click
    routing; links are stamped with `data-sf-link` (a shared `stampLinkEl`
    helper) and resolved centrally. Keeps the change minimal per the task brief.

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
     - [x] Drill-in / open-note / swap all behave per S41; pinned diverged per S43 `[ref: PRD/F6]`

- [x] **T4.3 Phase Validation** `[activity: validate]`

  - Run `npm test` (settings + view suites) + `typecheck` + `typecheck:test` + `lint` + `build`.
  - Manually verify in the dev vault: click drills, modifier opens, setting swaps, Back pops,
    pin diverges (S43).
