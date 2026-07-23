---
title: "Phase 4: Navigator sidebar tab (SidebarView)"
status: done
version: "2.0"
phase: 4
---

# Phase 4: Navigator sidebar tab (SidebarView)

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: SDD/ADR-2, ADR-10; Runtime View — Primary Flow]`
- `[ref: SDD/Interface Specifications; renderNavigator.ts]`
- `[ref: PRD/F1, F2, F3, F4, F6]`
- `src/views/SidebarView.ts` (tab strip, `selectedViewId`, body render, active-leaf follow,
  `showFile`/`_drillInto` drill seam, `_toggleSection`, `data-sf-*` delegation)
- `src/pluginConstants.ts` (view/tab id constants)

**Key Decisions**:
- ADR-10: the Navigator is a **fixed 3rd tab inside `SidebarView`**, not its own leaf — reuses the
  tab strip, the active-leaf follow, and the drill seam.
- Read-only (F6); scene click drills the **Context** tab (`showFile`); the Navigator render itself
  must not fight the Context/Inspector lifecycle (guard by active tab).

**Dependencies**: Phase 2 (scope + derivations) + Phase 3 (`renderNavigator`, `collapseStore`, CSS).
Parallel with Phase 5.

---

## Tasks

Delivers the live Navigator sidebar tab wired to scope-following and the drill seam.

- [ ] **T4.1 Register the Navigator tab** `[activity: frontend-ui]` `[ref: SDD/ADR-10; PRD/F1]`

  1. Prime: Read how `SidebarView` builds its tab strip + selects `selectedViewId` (Context = null)
     and renders the body per tab `[ref: src/views/SidebarView.ts]`.
  2. Test (RED): a fixed **Navigator** tab appears alongside Context + the views-library tabs;
     selecting it renders the Navigator body; `NAVIGATOR_TAB_ID` is a stable sentinel; tab keyboard
     nav (arrow/Home/End) includes it; switching away and back preserves filter/collapse state.
  3. Implement (GREEN): add `NAVIGATOR_TAB_ID` to `src/pluginConstants.ts`; in `SidebarView`, inject
     the fixed tab into the strip and branch the body render to `renderNavigator(...)` when selected.
  4. Validate: `test/views/SidebarView.navigator.test.ts` green (mock leaf/app); lint; types (src/test/mock).
  5. Success:
     - [ ] Navigator is a selectable 3rd tab; body renders the Navigator `[ref: SDD/ADR-10]`

- [ ] **T4.2 Scope-follow + render wiring** `[activity: frontend-ui]` `[ref: SDD/Runtime View; PRD/F3]`

  1. Prime: Read `SidebarView`'s active-leaf-change follow + debounce.
  2. Test (RED): WHILE the Navigator tab is active, active-leaf-change → `resolveWorkspaceScope` →
     re-render (debounced); book/plotline/scene notes scope correctly; no-scope note → whole-vault
     books + "not scoped" hint; re-render while a different tab is active is a no-op (guard).
  3. Implement (GREEN): wire the Navigator render into `SidebarView`'s follow path, guarded by the
     active tab; pass a `collapseStore` surface key `"navigator"`.
  4. Validate: follow/guard tests green; lint; types.
  5. Success:
     - [ ] Navigator re-scopes on note change; guarded when inactive `[ref: PRD/AC-T7, AC F3-4]`

- [ ] **T4.3 Scene-click drill + plotline filter** `[activity: frontend-ui]` `[ref: SDD/Integration Points; PRD/F4]`

  1. Prime: Read `showFile`/`_drillInto` + the link-click setting `[ref: src/views/SidebarView.ts]`.
  2. Test (RED): plain click on a Navigator scene row selects the **Context** tab and calls
     `showFile(file)`; modifier-click opens the note (per setting); clicking a plotline filter row
     narrows the scene list (fan-out membership honored); unresolved row never throws; **no
     frontmatter write** occurs (F6).
  3. Implement (GREEN): route `data-sf-link` → Context tab + `showFile`; `data-sf-plotline` → set
     `NavigatorState.plotlineFilter` + re-render; reuse the drill-vs-open setting.
  4. Validate: drill + filter tests green; lint; types.
  5. Success:
     - [ ] Scene click drills the Context panel; filter narrows; read-only preserved `[ref: PRD/AC-F4, F6]`

- [ ] **T4.4 Phase Validation** `[activity: validate]`

  Run Phase 4 tests; verify tab + follow + drill + filter. Lint + typecheck (src/test/mock).
  Verify against SDD ADR-10 / Runtime View and PRD F1–F4/F6.
