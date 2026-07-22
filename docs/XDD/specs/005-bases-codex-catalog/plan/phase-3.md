---
title: "Phase 3: F2 Codex + showFile seam"
status: in_progress
version: "1.0"
phase: 3
---

# Phase 3: F2 Codex + showFile seam

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: SDD/ADR-2]` — one polymorphic `registerBasesView` type (category via `config.get`)
- `[ref: SDD/ADR-4]` — public `SidebarView.showFile(file)` → `_drillInto`
- `[ref: SDD/Runtime View]` — Codex browse → click → detail flow + traced walkthrough
- `[ref: SDD/Implementation Examples]` — the showFile leaf-lookup example
- `[ref: PRD/F2]`, mockups **S44, S45, S46, S56**

**Key Decisions**: ADR-2 (single view type; category discriminant; never cache `BasesEntry`), ADR-4 (reuse `_drillInto` — inherits nav-stack, drilled-follow suspension, unresolved fall-throughs). Codex is a main-area view; coexists cleanly with the sidebar (different registration mechanisms).

**Dependencies**: Phase 1 (`src/bases/` adapter + `registerCodexView`). Can run parallel to Phase 2 (independent of the fence engine).

---

## Tasks

Delivers the top-down Codex: category grids that click through into the M3 panel.

- [x] **T3.1 `SidebarView.showFile(file)` public seam** `[activity: frontend-ui]`

  1. Prime: Read `[ref: SDD/ADR-4]`, `SidebarView._drillInto` (`:639`), `_resolveOrClassify` (`:680`), and the `activateView` reveal helper.
  2. Test: `showFile(file)` re-subjects the panel to `file` via `_drillInto` (nav-stack push, `source:"drilled"`, follow suspended); an unresolved/non-md file falls through to the M3 non-entity/unresolved state (never throws); when the panel is closed, the caller reveals/creates the leaf first.
  3. Implement: add public `showFile(file: TFile): void` on `SidebarView`; a small reveal-or-create helper for the closed-panel case.
  4. Validate: unit tests cover resolved, unresolved, non-md; no change to `_drillInto` behavior.
  5. Success:
     - [ ] Panel re-subjects on `showFile` `[ref: PRD/AC-F2.2]`
     - [ ] Unresolved file → M3 state, no throw `[ref: PRD/AC-F2.6]`

- [x] **T3.2 `CodexBasesView` — the one polymorphic Bases view type** `[activity: frontend-ui]`

  1. Prime: Read `[ref: SDD/ADR-2]`, `obsidian.d.ts` (`BasesView`, `BasesQueryResult`, `BasesViewConfig.get`), and `panel/kindFields` (grid columns).
  2. Test: reads category from view config (`config.get`); `onDataUpdated()` reads `data` **fresh** (never caches `BasesEntry`), empties-before-repaint; renders a grid of the category's entities (columns from `kindFields`); an empty category shows the per-category empty-state (S45); no cell is editable (read-only click-through); an unknown/missing category falls back safely.
  3. Implement: `src/bases/CodexBasesView.ts` (extends `BasesView` — **in `src/bases/` per CON-3**, resolved 2026-07-21; thin, delegates all rendering to codexGrid) + `src/codex/codexGrid.ts` (pure DOM grid, NO Bases typings; rows stamped with `entry.file.path`; delegated click). CodexBasesView passes plain data (category, row records with file paths + display fields) to codexGrid — never Bases typings.
  4. Validate: unit tests for grid build, empty-state, category fallback; teardown leaves no retained entries.
  5. Success:
     - [ ] Category grid renders `[ref: PRD/AC-F2.1]`; empty-state shown `[ref: PRD/AC-F2.3]`; read-only `[ref: PRD/AC-F2.4]`

- [ ] **T3.3 `CodexView` host + registration + row-click wiring** `[activity: frontend-ui]`

  **Option A (confirmed 2026-07-22): Bases-native tabs; CodexView is a THIN entry point.** The Codex tab bar is Obsidian Bases' own view-tab bar over a multi-view `Codex.base`; CodexView does NOT render tab chrome. See SDD ADR-2 addendum.
  1. Prime: Read `[ref: SDD/ADR-2]` (Codex chrome = Bases-native, Option A), `main.ts` (`registerView`, the `getLeavesOfType(...).view instanceof SidebarView` pattern `:162`), `revealAndShowFile` (T3.1, `src/views/SidebarView.ts`), `registerCodexView` (`src/bases/BasesAdapter.ts` — its factory currently throws a Phase-3 stub), and mockups **S44/S56/S46**.
  2. Test: the real `registerCodexView` factory constructs a `CodexBasesView` wired with `onRowClick → revealAndShowFile(app, entry.file)` (row click resolves `entry.file`, reveals the sidebar leaf if closed, re-subjects the panel — S56); the seed `Codex.base` has one `story-forge-codex` view per category (Bases-native tabs switch them); switching category tabs disposes the previous `CodexBasesView` leak-free (CON-4 guard, no stale bleed); `CodexView` (thin ItemView) opens/reveals `Codex.base` when Bases is available and renders the **S46 degrade** when Bases is off (a `.base` can't open without core Bases) while panel + Dataview keep working.
  3. Implement:
     - Replace the `registerCodexView` factory stub in `src/bases/BasesAdapter.ts` with the REAL `CodexBasesView` factory: `(controller, containerEl) => new CodexBasesView(controller, { app: plugin.app, onRowClick: (file) => revealAndShowFile(plugin.app, file) })`. (BasesAdapter may import `revealAndShowFile` from `views/SidebarView` — a plain function, not Bases typings; CON-3 holds.)
     - `src/codex/CodexView.ts` — a THIN main-area `ItemView` (NO Bases typings): an "Open Codex" entry point (command/ribbon) that reveals the seed `Codex.base` when `isBasesAvailable(plugin)` is true, and renders the S46 degrade (reuse the S46 copy) when false. `registerView` + the open command in `main.ts`.
     - Ship a curated seed `Codex.base` (5 `story-forge-codex` views, category per view) in the configurable bases folder (default `00 Meta/Bases`) — mirror the M3-seeded `Canon.base` structure.
  4. Validate: click→panel integration test; tab-switch teardown test; degrade test.
  5. Success:
     - [ ] Row click re-subjects panel with grid selection `[ref: PRD/AC-F2.2]`
     - [ ] Category switch leak-free `[ref: PRD/AC-F2.7]`; Bases-off degrade `[ref: PRD/AC-F2.5]`

- [ ] **T3.4 Phase Validation** `[activity: validate]`
  - Run all Phase 3 tests. `npm test`, `lint`, `typecheck`, `typecheck:test` pass. Manually confirm on the seed vault: all four category grids render; clicking a row re-subjects the M3 panel; an empty category shows its empty-state `[ref: PRD/Success Metrics F2]`.
