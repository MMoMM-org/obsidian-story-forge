---
title: "Phase 5: Seed extension + M4 Codex reconciliation"
status: pending
version: "1.0"
phase: 5
---

# Phase 5: Seed extension + M4 Codex reconciliation

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: PRD/F0]` (seed extension enabling testability)
- `[ref: SDD/ADR-9]` (seed additions + M4 Codex count updates in lockstep)
- `test/StoryForge/` (Wardens of Moonharbor: 3 scenes, 1 plotline today)
- `test/bases/codexBase.test.ts`, `test/integration/*` (M4 count assertions)
- `docs/schema-change-runbook.md`, `CLAUDE.md` (schema-coupled vault rules)

**Key Decisions**:
- ADR-9 (revised by the post-PLAN alignment check): the extended scenes/plotlines make
  AC-T3/T4 + AC-P2/P3/P5 testable. **Alignment finding: M4 tests use in-code fixtures, NOT live
  test-vault counts, so adding seed notes does NOT break the M4 suite.** The only live-vault
  test (`test/seed-vault-gaps.test.ts`) asserts `toBeGreaterThan(0)` (robust to expansion).
  Therefore the "reconcile M4 counts" work is a **no-op verification**, not a change task.
- Scope note (alignment Item 7): `20 Planning/` holds both the **book** note (`type: book`)
  and **plotline** notes (`type: plotline`); there is exactly **1 plotline** today ("The Dying
  Light"). The scope seam MUST distinguish book vs plotline by `type`/tag, not by folder.
- English-only; keep `npm run schema:check` green.

**Dependencies**: none for T5.1. Should complete before Phase 6 integration.

---

## Tasks

Delivers realistic seed data that exercises the interesting paths, kept schema-coupled and
with M4 expectations reconciled.

- [ ] **T5.1 Extend the test-vault seed** `[activity: data-architecture]` `[parallel: true]` `[ref: PRD/F0]`

  1. Prime: Read the current seed scenes/plotline + the generated templates `[ref: test/StoryForge/10 Manuscript, 20 Planning; 00 Meta/Templates]`.
  2. Test (RED): assert the vault now contains — an **act-2 scene**; a scene with **no `storyDay`** (has `order`); a scene linking **two plotlines**; a scene with **no plotline**; a **second plotline note with zero linking scenes**. (A small `test/StoryForge` fixture assertion or the model integration test in Phase 6.)
  3. Implement (GREEN): author the notes (English, via the entity/scene templates) under the correct folders; add the second plotline note in `20 Planning/`.
  4. Validate: `npm run schema:check` green; frontmatter matches `schema/scene.json`/`plotline.json`.
  5. Success:
     - [ ] All five gap-filling notes exist and validate `[ref: PRD/AC-F0]`
     - [ ] AC-T3/T4 + AC-P2/P3/P5 now have live data to verify against `[ref: PRD/F1, F2]`

- [ ] **T5.2 Verify M4 suite unaffected (no-op safety check)** `[activity: test-strategy]` `[ref: SDD/ADR-9]`

  1. Prime: Confirm the alignment finding — M4 Codex tests use in-code fixtures, not live-vault
     counts `[ref: test/bases/codexBase.test.ts, test/bases/CodexBasesView.test.ts, test/integration/*]`.
  2. Test: run the full suite after the seed extension.
  3. Implement: **expected: no changes needed.** IF any assertion nonetheless drifts (e.g. a
     live-vault `toBe(N)` count slipped in), update only that data-dependent number.
  4. Validate: full `npm test` green (M4 + M5).
  5. Success: [ ] M4 suite green with the extended seed — confirmed no fixture/live drift `[ref: SDD/ADR-9]`

- [ ] **T5.3 Phase Validation** `[activity: validate]`

  Run `npm run schema:check` + full `npm test`. Verify seed additions are English, schema-coupled, and M4 is reconciled.
