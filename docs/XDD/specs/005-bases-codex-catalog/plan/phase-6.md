---
title: "Phase 6: Integration, E2E, manual verification & gates"
status: in_progress
version: "1.0"
phase: 6
---

# Phase 6: Integration, E2E, manual verification & gates

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: SDD/Quality Requirements]`, `[ref: SDD/Acceptance Criteria]` (all EARS criteria)
- `[ref: PRD/Success Metrics]` — the M4 exit criteria + "Gates green" list
- `[ref: SDD/ADR-10]` — mobile fallback (desktop-only via `platform-restricted`/S11) if Phase 0 flagged it
- mockups **S44–S57**

**Key Decisions**: this phase proves the cross-cutting behaviors no single feature phase owns — the end-to-end write-back fan-out (panel + Codex + open base), cross-engine isolation, offline install, and the mobile fallback — and closes the M4 exit gate.

**Dependencies**: Phases 1–5 complete. (Phase 0 verdict already recorded.)

---

## Tasks

Delivers release confidence: integration + E2E coverage, the full green-gates run, manual seed-vault verification, and v0.2 readiness.

- [ ] **T6.1 End-to-end write-back fan-out** `[activity: testing]`

  1. Prime: Read `[ref: PRD/AC-F6.4]`, `[ref: SDD/F6 write-back fan-out]`; the `metadataCache.changed` subscription + `BasesView.onDataUpdated`.
  2. Test: committing an Inspector scalar/enum edit re-renders the M3 panel **and** the Codex grid **and** any open base with the new value (single fan-out, no double-render/flash); a bad value / write failure preserves the edit and does not fan out.
  3. Implement: integration tests exercising Inspector → `processFrontMatter` → `changed` → all three surfaces.
  4. Validate: fan-out asserted across surfaces; no flash.
  5. Success: committed edit reflected everywhere `[ref: PRD/AC-F6.4; PRD/Success Metrics F6]`

- [ ] **T6.2 Cross-engine isolation + Codex↔panel E2E** `[activity: testing]` `[parallel: true]`

  1. Prime: Read `[ref: PRD/AC-F1.6, AC-F2.2, AC-F2.7]`.
  2. Test: sidebar Dataview + Bases tabs render through their own engines with no cross-engine bleed; a Codex row click re-subjects the panel (S56); category-tab switches and tab teardown leave no stale content; an unresolved Codex row → M3 state, never a throw.
  3. Implement: integration/E2E tests for the Codex→panel path + engine isolation.
  4. Validate: no-bleed + leak-free assertions pass.
  5. Success: Codex↔panel E2E green; no cross-engine bleed `[ref: PRD/Success Metrics F1, F2]`

- [ ] **T6.3 Catalog E2E — install, fail-closed, offline, update** `[activity: testing]` `[parallel: true]`

  1. Prime: Read `[ref: PRD/F4]`, `[ref: PRD/F7]`, `[ref: SDD/Runtime View]`.
  2. Test: `.base`/DQL install 1-click writes a `curated` record + `.base` into `00 Meta/Bases`; DataviewJS gates (decline → nothing); a deliberately-mismatched checksum fails closed; an already-installed view shows up-to-date / update-available; the whole flow works with no network.
  3. Implement: E2E tests over the bundled index (no fetch).
  4. Validate: fail-closed + offline + update assertions pass.
  5. Success: catalog E2E green `[ref: PRD/Success Metrics F4, F7]`

- [ ] **T6.4 Mobile fallback verification** `[activity: testing]` `[parallel: true]`

  1. Prime: Read `[ref: SDD/ADR-10]`, the Phase 0 mobile verdict, `ConsentGate` `platform-restricted` + `SidebarView._renderPlatformRestriction`.
  2. Test: IF Phase 0 flagged mobile failure, THEN Bases surfaces (F1/F2/F3) show the `platform-restricted`/S11 state on mobile while the M3 panel + Dataview-DQL keep working; `manifest.json isDesktopOnly` stays `false`. IF mobile passed, assert Bases surfaces render on mobile.
  3. Implement: platform-conditional tests matching the Phase 0 verdict.
  4. Validate: mobile behavior matches the recorded verdict.
  5. Success: mobile behavior consistent with ADR-10 `[ref: SDD/ADR-10; PRD/Success Metrics]`

- [ ] **T6.5 Green gates + manual verification + v0.2 readiness** `[activity: validate]`

  1. Prime: Read `[ref: PRD/Success Metrics]` "Gates green" + the M4 exit criterion.
  2. Test/Validate: run the full gate set — `npm run test`, `lint`, `typecheck`, `typecheck:test`, `schema:check`, `catalog:build`, `build` — all pass. Manually walk the seed vault (`test/StoryForge/`, Wardens of Moonharbor) through Journeys A–D and states S44–S57.
  3. Implement: fix any gaps surfaced; confirm the M4 exit criteria (Codex browsable; overviews installable; ADR-0001 recorded ✓; Inspector ③ ✓).
  4. Success:
     - [ ] All gates green `[ref: PRD/Success Metrics "Gates green"]`
     - [ ] M4 exit criteria met; ready for the **v0.2** tag `[ref: PRD/Success Metrics exit criterion; build-plan M4]`

> **Release note:** auto-release is paused (manual-only); the v0.2 tag is a manual step per the repo's release workflow — do not trigger an automated release.
