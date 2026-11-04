---
title: "Phase 6: Integration, live walk and drift check"
status: pending
version: "1.0"
phase: 6
---

# Phase 6: Integration, live walk and drift check

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: SDD/Quality Requirements; Live walk list items 1–12]`
- `[ref: SDD/Open Questions; OQ-2]` — Obsidian Sync leaves `undo-journal.json` alone
- `[ref: SDD/Acceptance Criteria]` — every AC has an automated test or a walk item
- `[ref: PRD/Success Metrics]`

**Key Decisions**:
- The mock cannot show the key path, real YAML round trips, Sync or restart. The live walk is part of
  done, not optional.
- #30 is closed only once walk item 11 passes. #17 is closed when the branch merges.

**Dependencies**: Phases 1–5.

---

## Tasks

Proves the whole feature end to end in the mock and in the real vault, then closes the spec.

- [ ] **T6.1 End-to-end coverage in the mock** `[activity: integration-test]`

  1. Prime: `test/undo/writeCoverage.test.ts`, `test/main.undo.test.ts`; the AC list.
  2. Test:
     - every write path produces exactly one step and undoes cleanly: Anvil field, Anvil chips,
       Workbench save, Kanban drag, Kanban keyboard move, RENUMBER;
     - each scenario runs the full path: plugin load, write, undo through the command, redo, reload
       from the stored file, and undo again;
     - the restored value shows in the Anvil editor, the Workbench and the Kanban;
     - an AC → test map is checked into the spec (a table in this file), with no AC left without a
       test or a walk item.
  3. Implement: `test/undo/endToEnd.test.ts`; the traceability table below.
  4. Validate: the full suite and all gates; each new test is mutation-checked.
  5. Success: `[ref: SDD/AC-F1.8, AC-F9.1, AC-F9.3]`; every AC traced

- [ ] **T6.2 Live walk** `[activity: manual-test]`

  1. Prime: the live walk list; `docs/live-testing.md` format.
  2. Test: walk items 2–12 in `test/StoryForge/` with the user. Item 1 was done in Phase 1. Item 10
     needs two devices on Obsidian Sync, or is recorded as not run. Also measure the three performance
     targets with `performance.now()` in a dev build: undo of a 10-file step (≤ 500 ms), recording
     (≤ 2 ms per field), and the keydown handler on another view (≤ 0.1 ms).
  3. Implement: fixes for what the walk finds, each with a test that fails first, and each confirmed
     by the user in Obsidian. Then reset the vault notes.
  4. Validate: the results go into `docs/live-testing.md`, with an outcome and date per item.
  5. Success: `[ref: SDD/AC-S.3; OQ-2]`; #30 is confirmed fixed, then commented and closed

- [ ] **T6.3 Drift check and close-out** `[activity: validate]`

  - Run `tcs-workflow:validate drift 009-undo-journal` across all phases. Resolve each finding:
    acknowledge it, update the implementation, or update the spec. Record the Storyline deviations
    and the known limits in the spec README. Comment on #17 with the result. Every gate stays green.

## AC traceability

*Filled in by T6.1.*

| AC | Test or walk item |
|----|-------------------|
