---
title: "Phase 6: Mockups, integration/E2E, gates, finalize"
status: pending
version: "1.0"
phase: 6
---

# Phase 6: Mockups, integration/E2E, gates, finalize

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: SDD/Cross-Cutting — UI Visualization Guide; mockup states S59–S70]`
- `[ref: SDD/Runtime View — Primary Flow]` (end-to-end)
- `[ref: PRD/F1–F6]` (all ACs)
- `docs/XDD/specs/005-bases-codex-catalog/mockups.html` (S-scheme + visual language to continue)
- Memory: "UI as mockups" — versioned states per screen.

**Key Decisions**:
- Mockup states continue from **S58** → **S59–S70**; S63/S68 (Bases-off degrade) are
  **superseded by ADR-1** → re-purposed (S63 "No-act bucket", S68 "unresolved-link group").
- Integration runs the real `WorkspaceView` scope→model→render→drill over the extended seed.

**Dependencies**: Phase 4 (live view) + Phase 5 (extended seed).

---

## Tasks

Delivers the visual spec, end-to-end verification, and green exit gate for v0.3.

- [ ] **T6.1 Mockup states S59–S70** `[activity: frontend-ui]` `[parallel: true]` `[ref: SDD/UI Visualization Guide]`

  1. Prime: Read the M4 mockups.html vocabulary + inventory `[ref: docs/XDD/specs/005-bases-codex-catalog/mockups.html]`.
  2. Test (RED): n/a (design artifact) — reviewed against the SDD state list.
  3. Implement (GREEN): create `docs/XDD/specs/006-declarative-views/mockups.html` with S59–S70 (Timeline populated/act-boundary/order-fallback/empty/no-act; Plotlines groups/Unassigned/multi-plotline/collapsed/unresolved-link; workspace→panel drill; optional no-scope hint), reusing the M4 CSS/classes; S63/S68 re-purposed per ADR-1.
  4. Validate: states cover every F1–F5 rendering path; inventory table complete.
  5. Success: [ ] Every meaningful view state has a versioned mockup `[ref: memory: UI as mockups]`

- [ ] **T6.2 Integration / E2E** `[activity: test-strategy]` `[ref: SDD/Runtime View; PRD/F1–F4]`

  1. Prime: Read the primary-flow sequence `[ref: SDD/Runtime View]` + the M4 integration test style `[ref: test/integration/*]`.
  2. Test (RED): end-to-end over the extended seed — open the view scoped to the book → Timeline shows act-1 then act-2 groups, order/fallback correct; switch layout → Plotlines shows the multi-plotline scene under two groups + Unassigned + unresolved-flagged groups; collapse a group; click a scene → sidebar panel re-subjects (drill seam); empty scope → empty-state; no frontmatter written (F6).
  3. Implement (GREEN): `test/integration/workspace-views.test.ts` driving the real `WorkspaceView`.
  4. Validate: integration green; lint; types.
  5. Success:
     - [ ] Full scope→model→render→drill verified on live seed `[ref: PRD/AC-T1–T7, AC-P1–P6]`
     - [ ] Read-only guarantee holds end-to-end `[ref: PRD/F6]`

- [ ] **T6.3 Gates + finalize** `[activity: validate]` `[ref: PRD/all; SDD/Quality Requirements]`

  1. Prime: Review the gate commands `[ref: plan/README.md Context Priming]`.
  2. Test (RED): n/a — this is the exit gate.
  3. Implement (GREEN): ensure all pass — `npm test`, `npm run lint`, `npm run typecheck{,:test,:mock}`, `npm run schema:check`, `npm run build`. Run a manual seed-vault walk of S59–S70.
  4. Validate: every gate green; update the spec-006 README (Implemented) + decision log via xdd-meta Finalize.
  5. Success:
     - [ ] All gates green; all F1–F6 ACs demonstrably met `[ref: PRD/Feature Requirements]`
     - [ ] Spec finalized; v0.3 milestone ready `[ref: docs/build-plan.md]`
