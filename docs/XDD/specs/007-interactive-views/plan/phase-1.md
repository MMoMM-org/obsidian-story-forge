---
title: "Phase 1: Pure models (kanban/plotgrid/swimlane/locationTree + order/day math)"
status: done
version: "1.0"
phase: 1
---

# Phase 1: Pure models (kanban / plotgrid / swimlane / locationTree + order-day math)

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: SDD/Building Block View — Interface Specifications; New pure models]`
- `[ref: SDD/Complex Logic; insertOrder / snapStoryDay / locationTreeModel]`
- `[ref: SDD/ADR-17, ADR-18, ADR-19, ADR-20]`
- `[ref: PRD/F1, F2, F3, F4, F5]`
- `src/workspace/workspaceModel.ts` (existing `SceneRow`/`Group`/`Link`/`LinkResolver`/`stripLink`/`plotlineColor`)
- `schema/scene.json` (`status`, `order`, `storyDay`, `plotlines`, `pov`, `location`), `schema/location.json` (`world`)

**Key Decisions**:
- All functions are **pure** (no Obsidian runtime, no DOM) → the natural first RED tests.
- `SwimlaneKey = "pov" | "location" | "plotline"`; multi-plotline scenes fan out into each lane (ADR-20).
- `order` is human-readable **sparse integers**; `storyDay` snaps to **whole days** (ADR-17/-18).
- Location tree nests by `world` with a **visited-set + `MAX_DEPTH=32`** cycle guard (ADR-19).

**Dependencies**: none (runs **parallel** with Phase 2).

---

## Tasks

Delivers the deterministic, fully-unit-tested model core that every M6 renderer builds on.

- [x] **T1.1 kanbanModel + insertOrder (sparse-int)** `[activity: domain-modeling]` `[ref: SDD/AC-1, AC-2; PRD/F1]`

  1. Prime: Read the `kanbanModel`/`insertOrder` interface spec + the `insertOrder` rules in `[ref: SDD/Complex Logic]`; confirm the `status` vocab against `schema/scene.json`.
  2. Test (RED): `kanbanModel(rows, statuses)` returns one `Group` per status value (in schema-vocab order) with scenes sorted by `order` asc (tiebreak title); a scene with an out-of-vocab/absent `status` collects in a trailing neutral group, never dropped. `insertOrder(before,after)`: gap ≥ 2 → midpoint; open start → `after-10`; open end → `before+10`; empty → `10`; **gap of 1 → signals renumber** (documented sentinel/return contract).
  3. Implement (GREEN): add `kanbanModel` + `insertOrder` to `workspaceModel.ts`.
  4. Validate: `test/workspace/workspaceModel.kanban.test.ts` green; lint; types.
  5. Success:
     - [ ] Column grouping + within-column order deterministic; neutral bucket for missing `status` `[ref: PRD/AC-F1.1, AC-F1.4]`
     - [ ] `insertOrder` midpoint + open-end + renumber-signal all covered `[ref: SDD/AC-1, AC-2, ADR-17]`

- [x] **T1.2 plotgridModel + membership** `[activity: domain-modeling]` `[parallel: true]` `[ref: SDD/AC-3, AC-4; PRD/F2]`

  1. Prime: Read the `PlotgridModel` interface (`plotlines`, `scenes`, `has(sceneIdx, plotline)`); reuse `stripLink` + injected `LinkResolver`.
  2. Test (RED): `plotgridModel(rows, resolve)` yields the plotline axis (resolved plotlines by name + an unresolved-flagged entry per ADR-7) and the scene axis; `has(i, pl)` is true iff scene *i*'s `plotlines` includes that plotline; unresolved plotline entries are flagged and reported so the renderer can disable them.
  3. Implement (GREEN): add `PlotgridModel` + `plotgridModel` to `workspaceModel.ts`.
  4. Validate: `test/workspace/workspaceModel.plotgrid.test.ts` green; lint; types.
  5. Success:
     - [ ] Matrix membership correct for single- and multi-plotline scenes `[ref: PRD/AC-F2.1, AC-F2.2]`
     - [ ] Unresolved plotline flagged (not merged into a real column) `[ref: PRD/AC-F2.4, SDD/AC-4]`

- [x] **T1.3 snapStoryDay (integer)** `[activity: domain-modeling]` `[parallel: true]` `[ref: SDD/AC-5; PRD/F3]`

  1. Prime: Read `snapStoryDay` in `[ref: SDD/Complex Logic]`.
  2. Test (RED): `snapStoryDay(rows, dropRatio)` maps a 0..1 drop ratio to a **whole** day of the surrounding scenes; result `clamp(round(...), 1, maxDay+1)`; drop before first → clamps to ≥1; drop after last → `maxDay+1`; a scene with no `storyDay` (order-only) still yields an integer; the function returns **only** a day (never mutates/returns `order`).
  3. Implement (GREEN): add `snapStoryDay` to `workspaceModel.ts`.
  4. Validate: `test/workspace/workspaceModel.snap.test.ts` green; lint; types.
  5. Success:
     - [ ] Always integer, clamped ≥1; endpoints handled `[ref: PRD/AC-F3.1, AC-F3.3]`
     - [ ] No `order` in the result contract `[ref: PRD/AC-F3.2, SDD/ADR-18]`

- [x] **T1.4 swimlaneModel (pov | location | plotline)** `[activity: domain-modeling]` `[parallel: true]` `[ref: SDD/AC-7; PRD/F5]`

  1. Prime: Read `swimlaneModel`/`SwimlaneKey`; reuse the plotline fan-out approach from `plotlineModel`.
  2. Test (RED): `swimlaneModel(rows, "pov")` → one `Group` per distinct POV + trailing "No POV"; `"location"` → per location + "No location"; `"plotline"` → per plotline, a **multi-plotline scene appears in each lane**, absent → "Unassigned"; unresolved link value → flagged lane; lanes ordered by name then neutral/unassigned last; scenes within a lane sorted by `storyDay` (coalesce `order`).
  3. Implement (GREEN): add `SwimlaneKey` + `swimlaneModel` to `workspaceModel.ts`.
  4. Validate: `test/workspace/workspaceModel.swimlane.test.ts` green; lint; types.
  5. Success:
     - [ ] Three keys produce correct lanes + neutral buckets; multi-plotline fan-out `[ref: PRD/AC-F5.2, AC-F5.3]`
     - [ ] Pure/read-only (no write surface) `[ref: SDD/ADR-20]`

- [x] **T1.5 locationTreeModel + LocationNode (cycle/depth guard)** `[activity: domain-modeling]` `[parallel: true]` `[ref: SDD/AC-6; PRD/F4]`

  1. Prime: Read `LocationNode`/`locationTreeModel` + the DFS guard in `[ref: SDD/Complex Logic]`; confirm `world` on `schema/location.json`.
  2. Test (RED): given location rows with a `world` parent chain, `locationTreeModel(locations, resolve)` nests children under resolved parents; roots = no `world`; an **unresolved** `world` → node placed at root **flagged**; a **cycle** (A→B→A) and depth > `MAX_DEPTH=32` are broken with the offending node `flagged`, never infinite-looping; deterministic sibling order by name.
  3. Implement (GREEN): add `LocationNode` + `locationTreeModel` (+ a minimal `LocationRow` shape) to `workspaceModel.ts`.
  4. Validate: `test/workspace/workspaceModel.locationTree.test.ts` green; lint; types.
  5. Success:
     - [ ] Nesting + roots + unresolved-flagged correct `[ref: PRD/AC-F4.1, AC-F4.3]`
     - [ ] Cycle + depth guard proven (no infinite recursion) `[ref: PRD/AC-F4.4, SDD/ADR-19]`

- [x] **T1.6 Phase Validation** `[activity: validate]`

  Run all Phase 1 tests; every function pure & deterministic (no DOM, no Obsidian). Lint + `typecheck` + `typecheck:test`. Cross-check each function against its SDD Interface Spec + the mapped ACs. Confirm `workspaceModel.ts` still exports the M5 symbols unchanged (no regression to `timelineModel`/`plotlineModel`).
