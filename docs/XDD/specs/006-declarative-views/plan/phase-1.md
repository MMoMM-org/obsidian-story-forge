---
title: "Phase 1: Pure models (workspaceModel)"
status: done
version: "1.0"
phase: 1
---

# Phase 1: Pure models (workspaceModel)

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: SDD/Building Block View — Interface Specifications; workspaceModel.ts]`
- `[ref: SDD/Implementation Examples; Timeline sort + Plotline fan-out]`
- `[ref: PRD/F1, F2, F5]`
- `schema/scene.json` (act, order, storyDay, when, plotlines, book, status)

**Key Decisions**:
- ADR-5: sort/group in TS — coalesce(`storyDay`,`order`); act grouping + "No act"; plotline
  fan-out + "Unassigned"; ADR-7 unresolved plotline → flagged group.
- Pure functions, no Obsidian runtime beyond `TFile`/`metadataCache` (injected) → the natural
  first RED tests.

**Dependencies**: none (may run parallel with Phase 2).

---

## Tasks

Delivers the deterministic, fully-unit-tested grouping/sorting core both views render from.

- [ ] **T1.1 SceneRow + timelineModel** `[activity: domain-modeling]` `[ref: SDD/Interface Specifications; PRD/F1]`

  1. Prime: Read the `SceneRow`/`Group` interfaces and the timeline sort example `[ref: SDD/Implementation Examples]`; confirm field names against `schema/scene.json`.
  2. Test (RED): `timelineModel` orders by coalesce(`storyDay`,`order`) asc; ties broken by `order` then title; scene missing `storyDay` placed by `order`; scene missing both appended last, never dropped; groups by `act` ascending; scenes with no `act` collect in a trailing "No act" group; `when` never affects order; empty input → empty groups.
  3. Implement (GREEN): Create `src/workspace/workspaceModel.ts` — `SceneRow`, `Group` types + `compareTimeline` + `timelineModel(rows)`.
  4. Validate: `test/workspace/workspaceModel.test.ts` green; lint; types.
  5. Success:
     - [ ] Seed order Scene 1 → 2 → 3 with the day-1 tie broken by `order` `[ref: PRD/AC-T1, AC-T2]`
     - [ ] Missing-key scenes never dropped; "No act" bucket present `[ref: PRD/AC-T3, F5]`

- [ ] **T1.2 plotlineModel (fan-out + buckets)** `[activity: domain-modeling]` `[parallel: true]` `[ref: SDD/Implementation Examples; PRD/F2]`

  1. Prime: Read the plotline fan-out example + ADR-7 `[ref: SDD/ADR-5, ADR-7]`.
  2. Test (RED): a scene links two plotlines → appears under each group; empty/absent `plotlines` → trailing "Unassigned" group; unresolved link target → its own "unresolved"-flagged group (distinct from Unassigned); group order = plotline (by name) → unresolved → Unassigned last; link resolution uses an injected `getFirstLinkpathDest`.
  3. Implement (GREEN): add `plotlineModel(rows, resolveLink, sourcePath)` to `workspaceModel.ts` (link resolution injected so the model stays pure/testable).
  4. Validate: unit tests green; lint; types.
  5. Success:
     - [ ] Multi-plotline scene appears in every group; Unassigned + unresolved buckets correct `[ref: PRD/AC-P1, AC-P2, AC-P3]`
     - [ ] Unresolved link is visible & flagged, not merged into Unassigned `[ref: SDD/ADR-7]`

- [ ] **T1.3 Phase Validation** `[activity: validate]`

  Run all Phase 1 tests; both models pure & deterministic (no DOM). Lint + typecheck (src + test). Verify against SDD Interface Specs and PRD F1/F2/F5.
