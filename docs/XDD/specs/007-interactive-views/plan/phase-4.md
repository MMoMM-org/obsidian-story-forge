---
title: "Phase 4: Read-only renderers — Locations tree + Swimlanes + Zoom/pan"
status: pending
version: "1.0"
phase: 4
---

# Phase 4: Read-only renderers — Locations tree + Swimlanes + Zoom/pan

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: SDD/Building Block View; renderLocationsTree, renderTimeline "swimlane", zoom]`
- `[ref: SDD/ADR-19 (location scope + tree), ADR-20 (swimlane), ADR-21 (zoom)]`
- `[ref: PRD/F4, F5, F6; AC-F4.*, AC-F5.*, AC-F6.*]`
- `src/workspace/renderTimeline.ts` (`TimelineMode="rail"|"swimlane"`, swimlane branch throws), `renderShared.ts`, `src/panel/components.ts` (`section`/`emptyLine`)
- `src/scoping/workspaceScope.ts` (`resolveWorkspaceScope`, `DEFAULT_EXCLUDED_FOLDERS`)
- `styles.css` (existing `sf-tl-`/`sf-ws-` blocks to mirror)

**Key Decisions**:
- All three features are **read-only** (no writes, no InteractionHandler). They depend **only on Phase 1** models → this whole phase is **parallel** with Phases 2/3, and internally T4.1∥T4.2∥T4.3.
- Swimlane is a **Timeline mode** (fills the existing stub), not a new layout; the grouping key persists per-scope via the `CollapseStore` keying (ADR-20).
- Zoom/pan is **ephemeral** CSS scaling; names stay clickable; buttons + modifier-wheel (ADR-21).

**Dependencies**: **Phase 1**. Independent of Phases 2/3/5.

---

## Tasks

Delivers the three non-writing view additions on the existing render host.

- [ ] **T4.1 Location scope resolver + renderLocationsTree** `[activity: frontend-ui]` `[parallel: true]` `[ref: SDD/ADR-19; PRD/F4, AC-F4.*]`

  1. Prime: Read `resolveWorkspaceScope` + `DEFAULT_EXCLUDED_FOLDERS`; the `LocationNode`/`locationTreeModel` from Phase 1; the `section`/`emptyLine` primitives.
  2. Test (RED): a location-scope resolver gathers in-scope `location` notes (by type/tag, excluding the denylist — CON-7); `renderLocationsTree(host, nodes, deps)` renders nested collapsible nodes (chevron expand/collapse via the existing `data-sf-section-toggle` seam), location names as `[data-sf-link]` drill spans, unresolved/flagged nodes shown muted at root, and writes **nothing** on any interaction; empty scope → empty-state line.
  3. Implement (GREEN): add the resolver to `workspaceScope.ts` (sibling to `resolveWorkspaceScope`, reusing the scan/denylist); create `src/workspace/renderLocationsTree.ts`; add `sf-lt-*` CSS.
  4. Validate: `test/workspace/renderLocationsTree.test.ts` (jsdom) green; lint; stylelint; types.
  5. Success:
     - [ ] Nesting + drill + collapse; unresolved flagged; no writes `[ref: PRD/AC-F4.1, AC-F4.3, AC-F4.5]`
     - [ ] Cycle/depth-guarded input renders safely `[ref: PRD/AC-F4.4]`

- [ ] **T4.2 renderTimeline "swimlane" mode + grouping key** `[activity: frontend-ui]` `[parallel: true]` `[ref: SDD/ADR-20; PRD/F5, AC-F5.*]`

  1. Prime: Read the throwing `"swimlane"` branch in `renderTimeline.ts` + `swimlaneModel` (Phase 1) + the M5 rail card structure to reuse card rendering.
  2. Test (RED): `renderTimeline(host, groups, deps, "swimlane")` renders one lane per group (from `swimlaneModel`) with neutral lanes for absent values; a multi-plotline scene appears in each of its plotline lanes; act dividers remain identifiable; scene cards are `[data-sf-link]` drillable; collapse persists per (surface, scope, group); **no writes**; the `"rail"` path is unchanged.
  3. Implement (GREEN): implement the swimlane branch (remove the throw); factor a shared card-render helper used by both rail + swimlane; add `sf-sw-*` CSS. (The Rail|Swimlane toggle + By-key selector are wired in Phase 6; this task renders a given mode+key.)
  4. Validate: `test/workspace/renderTimeline.swimlane.test.ts` green; lint; stylelint; types. Existing rail tests still green.
  5. Success:
     - [ ] Lanes per key + neutral buckets + multi-plotline fan-out `[ref: PRD/AC-F5.2, AC-F5.3]`
     - [ ] Read-only, drill only; rail unaffected `[ref: PRD/AC-F5.4, SDD/ADR-20]`

- [ ] **T4.3 Timeline zoom / pan (ephemeral)** `[activity: frontend-ui]` `[parallel: true]` `[ref: SDD/ADR-21; PRD/F6, AC-F6.*]`

  1. Prime: Read ADR-21 (CSS transform, ephemeral, names clickable); the rail DOM in `renderTimeline.ts`.
  2. Test (RED): a zoom wrapper scales the rail between capped min/max via buttons (−/reset/+) and modifier+wheel; scene name `[data-sf-link]` spans remain clickable at every level; pan scrolls; zoom/pan state lives in-memory only (a fresh render resets it — no persistence); the By-POV toolbar control maps to the swimlane grouping (F6↔F5 bridge).
  3. Implement (GREEN): add a zoom/pan controller + controls (in `renderTimeline.ts` or a small `timelineZoom.ts` helper) using CSS scaling; add `sf-zoom-*` CSS. All listeners via `registerDomEvent` (wired by the host in Phase 6).
  4. Validate: `test/workspace/timelineZoom.test.ts` green; lint; stylelint; types.
  5. Success:
     - [ ] Zoom caps + clickable names at all levels `[ref: PRD/AC-F6.1, AC-F6.2]`
     - [ ] Ephemeral (resets on reopen); no persisted state `[ref: PRD/AC-F6.3, SDD/CON-1]`

- [ ] **T4.4 Phase Validation** `[activity: validate]`

  Run Phase 4 tests; confirm **zero** write calls from any of the three features (grep/spy assertion). Lint + stylelint + `typecheck`+`typecheck:test`. Verify the rail mode + M5 Timeline tests are unaffected.
