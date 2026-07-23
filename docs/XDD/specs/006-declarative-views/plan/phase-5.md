---
title: "Phase 5: Main-area WorkspaceView — Timeline rail + Plotlines list"
status: done
version: "2.0"
phase: 5
---

# Phase 5: Main-area WorkspaceView — Timeline rail + Plotlines list

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: SDD/Interface Specifications; WorkspaceView.ts]`
- `[ref: SDD/Runtime View — Primary Flow; ADR-2, ADR-3, ADR-13]`
- `[ref: PRD/F1, F2, F3, F4, F6]`
- `src/codex/CodexView.ts`, `src/main.ts` (ItemView registration + activation + commands)
- `src/views/SidebarView.ts` (`showFile` drill seam; active-leaf-change follow; debounce)

**Key Decisions**:
- ADR-2/ADR-3: one polymorphic main-area `story-forge-workspace` ItemView, `layout: timeline |
  plotlines`, follows the active note; the header carries a **Timeline | Plotlines** toggle.
- ADR-13: M5 renders **rail** (timeline) and **list** (plotlines) only; the `mode` seam reserves
  swimlane/subway for M6.
- Read-only (F6); scene-click drills the Context tab via `showFile`; modifier-click opens.

**Dependencies**: Phase 2 (scope + derivations) + Phase 3 (`renderTimeline`, `renderPlotlines`,
`collapseStore`, CSS). Parallel with Phase 4.

---

## Tasks

Delivers the live, note-following main-area view wired end-to-end.

- [ ] **T5.1 WorkspaceView ItemView** `[activity: frontend-ui]` `[ref: SDD/Runtime View; PRD/F1, F2, F3]`

  1. Prime: Read the `CodexView` host + `SidebarView` follow/debounce patterns `[ref: src/codex/CodexView.ts, src/views/SidebarView.ts]`.
  2. Test (RED): `getViewType()` = `story-forge-workspace`; `onOpen` resolves scope + renders the
     initial layout; `setLayout("plotlines")` re-renders via `renderPlotlines("list")` and preserves
     per-scope collapse; layout=timeline renders `renderTimeline("rail")`; active-leaf-change
     re-scopes + re-renders (debounced); teardown clears listeners + collapse (`_runCleanup`).
  3. Implement (GREEN): `src/workspace/WorkspaceView.ts` — orchestrates `resolveWorkspaceScope` →
     `mapSceneRow[]` → `timeline|plotlineModel` → `renderTimeline|renderPlotlines`; header layout
     toggle; debounced follow; `collapseStore` surface key `"main"`.
  4. Validate: `test/workspace/WorkspaceView.test.ts` green (mock leaf/app); lint; types (src/test/mock).
  5. Success:
     - [ ] View renders Timeline-rail & Plotlines-list and re-scopes on note change `[ref: PRD/AC-T7, AC-P6]`
     - [ ] Layout toggle switches models, collapse preserved `[ref: SDD/ADR-3, ADR-6]`

- [ ] **T5.2 Registration + commands** `[activity: backend-api]` `[ref: SDD/Deployment View; PRD/F1, F2]`

  1. Prime: Review how `CODEX_VIEW_TYPE` + "Open Codex" register `[ref: src/main.ts]`.
  2. Test (RED): `WORKSPACE_VIEW_TYPE` registered at onload; "Open Timeline" / "Open Plotlines"
     commands activate the view with the right initial `layout`; a ribbon/activation helper reveals
     it; unregistered cleanly at onunload (`_runCleanup`).
  3. Implement (GREEN): add `WORKSPACE_VIEW_TYPE` to `src/pluginConstants.ts`; register the view +
     two commands + an activation helper in `src/main.ts`; wire active-leaf-change to the live view.
  4. Validate: main/registration tests green; lint; types.
  5. Success: [ ] Both commands open the view in the correct layout `[ref: PRD/F1, F2]`

- [ ] **T5.3 Scene-click drill wiring** `[activity: frontend-ui]` `[ref: SDD/Integration Points; PRD/F4]`

  1. Prime: Read `SidebarView.showFile`/`_drillInto` + the link-click setting `[ref: src/views/SidebarView.ts]`.
  2. Test (RED): plain click on a scene card/row reveals the sidebar leaf, selects the Context tab,
     and calls `showFile(file)`; modifier-click opens the note; unresolved row never throws; **no
     frontmatter write** (F6).
  3. Implement (GREEN): in `WorkspaceView`, delegate `data-sf-link` → reveal sidebar + Context tab +
     `showFile`; reuse the drill-vs-open setting.
  4. Validate: drill wiring tests green; lint; types.
  5. Success: [ ] Scene click drills the M3 panel; read-only preserved `[ref: PRD/AC-F4, F6]`

- [ ] **T5.4 Phase Validation** `[activity: validate]`

  Run Phase 5 tests; verify view + registration + follow + drill + layout toggle. Lint + typecheck
  (src/test/mock). Verify against SDD Runtime View / ADR-13 and PRD F1–F4/F6.
