---
title: "Phase 6: Live walk and release"
status: in_progress
version: "1.0"
phase: 6
---

# Phase 6: Live walk and release

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: PRD/Primary User Journey]` and secondary journeys
- `[ref: PRD/F6.1; PRD/F6.5; PRD/F6.6]`
- `[ref: SDD/Deployment View]`
- `docs/live-testing.md`

**Key Decisions**:
- Release 0.2.0 through the manual `release.yml` workflow, after
  `npx semantic-release --dry-run` confirms 0.2.0.
- **Maintainer steps, never done by the agent:** making the repository public, triggering the
  release workflow, installing from the published release.
- The spec is finalised after the merge; the release may follow later.

**Decisions taken during implementation**:
- T6.1 (3643829): `test/integration/storyFiles-e2e.test.ts` runs the real bundled index through
  the real dialog, store, writer and the editor's field pipeline; a test-only shim fires vault and
  metadataCache events. Mutation-checked: edited, missing and update detection, and the FileClass
  cache reset ("no reload").
- T6.2: covered by the 2026-11-20 walks (docs/live-testing.md "Spec 010 Phase 3", phase-5 T5.2
  notes): setup into custom folders, core Templates fills `{{title}}`, metadata-menu opens the
  FileClasses (after the Media fix 96b553f), not-excluded warning, update after a simulated source
  change. Mobile not checked (no device in the walk).
- T6.3: next version computed with commit-analyzer (minor → 0.2.0); the real dry run needs `main`
  on the remote and is maintainer step 2. Policies checked against obsidian-developer-docs.
  Checklist in the spec README.

**Dependencies**: Phases 1–5.

---

## Tasks

Proves the whole journey on a fresh vault and ships the first release.

- [x] **T6.1 End-to-end test of setup and update** `[activity: testing]`

  1. Prime: `[ref: PRD/Primary User Journey]`, `[ref: SDD/Primary Flow]`
  2. Test: Integration test over the real index: fresh vault → setup all → editor shows enum
     dropdowns for a scene created from the template (FileClass picked up without reload) →
     simulated plugin update with one changed source, one user-edited file, one deleted file →
     update reports updated / not updated / missing exactly
  3. Implement: `test/integration/storyFiles-e2e.test.ts`
  4. Validate: Mutation-check the three update outcomes
  5. Success: Journey holds end to end `[ref: PRD/F2; PRD/F4; PRD/F5.9]`

- [x] **T6.2 Live walk in the test vault** `[activity: testing]`

  1. Prime: `docs/live-testing.md`
  2. Test: Walk with the user: setup into custom folders; core Templates insert shows the title;
     metadata-menu reads the FileClasses; folder not excluded warning; update after a source
     change; mobile check if available. Add a spec 010 section to `docs/live-testing.md`
  3. Implement: Fixes found in the walk (each with its own test)
  4. Validate: User confirms; test vault restored via git after inspecting the diff
  5. Success: `[ref: PRD/F5.1; PRD/F5.4]`

- [x] **T6.3 Release preparation and maintainer checklist** `[activity: release]`

  1. Prime: `.github/workflows/release.yml`, `.releaserc.json`, `versions.json`,
     `version-bump.mjs`
  2. Test: `npx semantic-release --dry-run` on the merged main computes 0.2.0; `versions.json`
     maps 0.2.0 → 1.12.7; release assets list is main.js, manifest.json, styles.css
  3. Implement: Fix anything the dry run shows; write the maintainer checklist into the spec
     README: (1) make the repo public, (2) run the release workflow, (3) install manually and
     with BRAT in a fresh vault, (4) run setup, (5) submit on community.obsidian.md when ready
  4. Validate: Dry run output recorded
  5. Success: Release ready; maintainer steps explicit `[ref: PRD/F6.1; PRD/F6.5; PRD/F6.6]`

- [ ] **T6.4 Final validation and finalize** `[activity: validate]`

  - Full gates (tests, lint, typecheck ×3, schema:check, build); traceability of every PRD AC to a
    test or walk step; drift check; spec README finalised after merge; close #27 and #19 after
    the merge (with the user's go).
