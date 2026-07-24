---
title: "Phase 6: Seed (beat notes) + integration/E2E + gates + finalize"
status: done
version: "2.0"
phase: 6
---

# Phase 6: Seed (beat notes) + integration/E2E + gates + finalize

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: PRD/F0]` (seed extension enabling testability)
- `[ref: SDD/ADR-9, ADR-11]` (beat notes + `scene.beat`; M4 suite unaffected — fixtures)
- `[ref: SDD/Runtime View — Primary Flow]` (end-to-end, both surfaces)
- `[ref: PRD/F1–F6]` (all M5 ACs)
- `docs/XDD/specs/006-declarative-views/mockups.html` (S59–S72; M6 states tagged)
- `test/StoryForge/` (Wardens of Moonharbor: 3 scenes, plotline "The Dying Light" today)
- `docs/schema-change-runbook.md`, `CLAUDE.md` (schema-coupled vault rules)

**Key Decisions**:
- ADR-9 (v2.0): the seed gains **`type: beat` notes** + populated `scene.beat` (for `actLabel`),
  plus act-2 / storyDay-less / multi-plotline / no-plotline scenes, a second + a zero-scene
  plotline, and one unresolved plotline link — matching the mockup data.
- **M4 suite is unaffected** (its Codex tests use in-code fixtures, not live-vault counts); the only
  live-vault test asserts `toBeGreaterThan(0)`. Reconciliation is a no-op safety check.
- Mockups were authored early (done); this phase does not re-draw them.

**Dependencies**: T6.1 (seed) is independent — start early, in parallel. T6.2 integration needs
Phase 4 + Phase 5 + T6.1.

---

## Tasks

- [ ] **T6.1 Extend the seed — beat notes + edge scenes** `[activity: data-architecture]` `[parallel: true]` `[ref: PRD/F0; SDD/ADR-9, ADR-11]`

  1. Prime: Read the current seed scenes/plotline + generated templates `[ref: test/StoryForge/10 Manuscript, 20 Planning; 00 Meta/Templates]`; the `type: beat` note shape `[ref: temp/lauren "201 🎬 …" — reference only, never committed]`.
  2. Test (RED): assert the vault now contains — two **`type: beat`** notes (act-1 + act-2, with
     `aliases`); the 3 existing act-1 scenes set `beat:` to the act-1 beat; an **act-2 scene** (multi
     plotline: The Dying Light + a new **The Warden's Oath**) with the act-2 beat; a scene with **no
     `storyDay`** (has `order`); a scene with **no plotline** (→ Unassigned); a scene carrying one
     **unresolved** plotline link (`[[The Broken Lens]]`); a **second plotline note** ("The Warden's
     Oath") and a **zero-scene plotline** ("Shadow Trade").
  3. Implement (GREEN): author the notes (English, via the templates) under the correct folders; add
     the beat notes + plotline notes in `20 Planning/`. **If** `npm run schema:check` or lint flags an
     un-schematized `type: beat` note, do NOT unilaterally add a `beat.json` entity — surface to
     _forge (per the forge-handoff rule) and, for M5, keep beats as plain planning notes if the gate
     tolerates them.
  4. Validate: `npm run schema:check` green; scene frontmatter matches `schema/scene.json`.
  5. Success:
     - [ ] Beat notes + all edge scenes/plotlines exist and validate `[ref: PRD/AC-F0]`
     - [ ] `actLabel` resolves real beat names; AC-T*/AC-P* have live data `[ref: PRD/F1, F2; SDD/ADR-11]`

- [ ] **T6.2 Verify M4 suite unaffected (no-op safety check)** `[activity: test-strategy]` `[ref: SDD/ADR-9]`

  1. Prime: Confirm M4 Codex tests use in-code fixtures `[ref: test/bases/codexBase.test.ts, test/bases/CodexBasesView.test.ts, test/integration/*]`.
  2. Test: run the full suite after the seed extension.
  3. Implement: **expected: no changes.** IF a data-dependent assertion drifts, update only that number.
  4. Validate: full `npm test` green (M4 + M5).
  5. Success: [ ] M4 suite green with the extended seed `[ref: SDD/ADR-9]`

- [ ] **T6.3 Integration / E2E — both surfaces** `[activity: test-strategy]` `[ref: SDD/Runtime View; PRD/F1–F4]`

  1. Prime: Read the primary-flow sequence `[ref: SDD/Runtime View]` + the M4 integration style `[ref: test/integration/*]`.
  2. Test (RED): end-to-end over the extended seed —
     - **Navigator** (SidebarView tab): scoped to the book, shows the plotline filter list (colored
       dots + counts incl. the zero-scene plotline), act-grouped rows with beat-derived act labels,
       progress; selecting The Warden's Oath narrows rows; click a scene → Context tab re-subjects.
     - **Timeline (rail)**: act-1 then act-2 divider pills (beat names), order/`storyDay` fallback
       correct, cards with status badges + plotline nodes.
     - **Plotlines (list)**: the multi-plotline scene under both groups + Unassigned + unresolved-
       flagged groups; collapse a group.
     - Empty scope → empty-state; no-scope note → whole-vault + hint; **no frontmatter written** (F6).
  3. Implement (GREEN): `test/integration/workspace-views.test.ts` driving the real Navigator + `WorkspaceView`.
  4. Validate: integration green; lint; types.
  5. Success:
     - [ ] Full scope→model→render→drill verified on live seed, both surfaces `[ref: PRD/AC-T1–T7, AC-P1–P6]`
     - [ ] Read-only guarantee holds end-to-end `[ref: PRD/F6]`

- [ ] **T6.4 Gates + finalize** `[activity: validate]` `[ref: PRD/all; SDD/Quality Requirements]`

  1. Prime: Review the gate commands `[ref: plan/README.md Context Priming]`.
  2. Test (RED): n/a — exit gate.
  3. Implement (GREEN): all pass — `npm test`, `npm run lint`, `npm run typecheck{,:test,:mock}`,
     `npm run schema:check`, `npm run build`; add/update `NOTICE` (StoryLine attribution, CON-8); run
     a manual seed-vault walk of the M5 states (S59–S63, S65, S69–S72).
  4. Validate: every gate green; update the spec-006 README (Implemented) + decision log via xdd-meta Finalize.
  5. Success:
     - [ ] All gates green; all M5 F0–F6 ACs demonstrably met `[ref: PRD/Feature Requirements]`
     - [ ] `NOTICE` credits StoryLine; spec finalized; v0.3 milestone ready `[ref: docs/build-plan.md; SDD/CON-8]`
