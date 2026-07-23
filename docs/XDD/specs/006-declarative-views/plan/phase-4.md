---
title: "Phase 4: WorkspaceView host, registration, follow, drill"
status: pending
version: "1.0"
phase: 4
---

# Phase 4: WorkspaceView host, registration, follow, drill

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: SDD/Interface Specifications; WorkspaceView.ts]`
- `[ref: SDD/Runtime View — Primary Flow]`
- `[ref: SDD/ADR-2, ADR-3]`
- `[ref: PRD/F1, F2, F3, F4, F6]`
- `src/codex/CodexView.ts`, `src/main.ts` (ItemView registration + activation + commands)
- `src/views/SidebarView.ts` (`showFile` drill seam; active-leaf-change follow; debounce)

**Key Decisions**:
- ADR-2/ADR-3: one polymorphic main-area `story-forge-workspace` ItemView, `layout`
  toggle, follows active note.
- Read-only (F6); scene-click drills the sidebar panel via `showFile`; modifier-click opens.

**Dependencies**: Phases 1 + 2 + 3.

---

## Tasks

Delivers the live, note-following workspace view wired end-to-end.

- [ ] **T4.1 WorkspaceView ItemView** `[activity: frontend-ui]` `[ref: SDD/Runtime View; PRD/F1, F2, F3]`

  1. Prime: Read the `CodexView` host + `SidebarView` follow/debounce patterns `[ref: src/codex/CodexView.ts, src/views/SidebarView.ts]`.
  2. Test (RED): `getViewType()` = `story-forge-workspace`; `onOpen` resolves scope + renders; `setLayout("plotlines")` re-renders with `plotlineModel` and preserves per-scope collapse; active-leaf-change re-scopes + re-renders (debounced); teardown clears listeners + collapse state (`_runCleanup`).
  3. Implement (GREEN): Create `src/workspace/WorkspaceView.ts` — orchestrates `resolveWorkspaceScope` → map `SceneRow[]` → `timeline|plotlineModel` → `renderWorkspace`; layout toggle in the view header; debounced follow.
  4. Validate: `test/workspace/WorkspaceView.test.ts` green (mock leaf/app); lint; types (src + test + mock).
  5. Success:
     - [ ] View renders Timeline & Plotlines and re-scopes on note change `[ref: PRD/AC-T7, AC-P6]`
     - [ ] Layout toggle switches models, collapse preserved `[ref: SDD/ADR-3, ADR-6]`

- [ ] **T4.2 Registration + commands** `[activity: backend-api]` `[ref: SDD/Deployment View; PRD/F1, F2]`

  1. Prime: Review how `CODEX_VIEW_TYPE` + the "Open Codex" command register `[ref: src/main.ts]`.
  2. Test (RED): `WORKSPACE_VIEW_TYPE` registered at onload; "Open Timeline" / "Open Plotlines" commands activate the view with the right initial `layout`; unregistered cleanly at onunload (`_runCleanup`).
  3. Implement (GREEN): add `WORKSPACE_VIEW_TYPE` to `src/pluginConstants.ts`; register the view + two commands + an activation helper in `src/main.ts`; wire active-leaf-change to the live view.
  4. Validate: main/registration tests green; lint; types.
  5. Success: [ ] Both commands open the view in the correct layout `[ref: PRD/F1, F2]`

- [ ] **T4.3 Scene-click drill wiring** `[activity: frontend-ui]` `[ref: SDD/Integration Points; PRD/F4]`

  1. Prime: Read `SidebarView.showFile`/`_drillInto` and the link-click setting `[ref: src/views/SidebarView.ts]`.
  2. Test (RED): plain click on a scene row reveals the sidebar leaf and calls `showFile(file)`; modifier-click opens the note (per setting); unresolved row does nothing/never throws; no frontmatter write occurs (F6).
  3. Implement (GREEN): in `WorkspaceView`, delegate `data-sf-link` clicks to reveal-sidebar + `showFile`; reuse the existing setting for drill-vs-open.
  4. Validate: drill wiring tests green; lint; types.
  5. Success: [ ] Scene click drills the M3 panel; read-only preserved `[ref: PRD/AC-F4, F6]`

- [ ] **T4.4 Phase Validation** `[activity: validate]`

  Run Phase 4 tests; verify view + registration + follow + drill. Lint + typecheck (src/test/mock). Verify against SDD Runtime View and PRD F1–F4/F6.
