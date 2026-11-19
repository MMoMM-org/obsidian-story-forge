---
title: "Phase 3: Setup UI"
status: in_progress
version: "1.0"
phase: 3
---

# Phase 3: Setup UI

## Phase Context

**GATE**: Read all referenced files before starting this phase. **No UI code before the user
has signed off the mockups (T3.1).**

**Specification References**:
- `[ref: SDD/ADR-42]` — Scope tab group, `StoryFilesModal`, command, capability pointer
- `[ref: SDD/User Interface & UX]` — states S1–S6
- `[ref: SDD/Primary Flow]` — updates-available status
- `[ref: SDD/Implementation Gotchas; excluded folders]`
- `docs/XDD/specs/008-codex-surface/mockups-catalog.html` (L10) — catalog dialog look and
  refusal wording to stay consistent with

**Key Decisions**:
- The FileClasses folder stays in "Vault folders"; the new group holds the two new folders.
- One dialog for setup and update.
- Command id `set-up-story-files`, name "Set up story files".
- The capability screen only points to setup; it writes nothing.

**Dependencies**: Phase 2.

---

## Tasks

Gives the user the deliberate, previewed setup and update flow.

- [ ] **T3.1 Mockups S1–S6 and sign-off** `[activity: ui-design]`

  1. Prime: `[ref: SDD/User Interface & UX]`, L10/L12 mockups of spec 008
  2. Test: Each state S1–S6 is drawn as HTML in
     `docs/XDD/specs/010-ship-vault-artifacts/mockups.html` with real wording
  3. Implement: Author the mockups; ask the user for sign-off; record sign-off (and any change)
     in the spec README decision log
  4. Validate: User sign-off recorded
  5. Success: Signed-off mockups exist before any UI code `[ref: SDD/CON-6]`

- [ ] **T3.2 StoryFilesModal** `[activity: frontend-ui]`

  1. Prime: signed-off S2–S5; `src/catalog/browserList.ts` (`renderFeedback`,
     `renderLabelled`); `isExcluded` in `src/scoping/workspaceScope.ts`
  2. Test: Opens with three sets, each with folder, checkbox and per-file action rows from
     `planSetup`; deselecting a set removes its writes; changing a folder saves the setting and
     replans; folder not covered by `excludedFolders` shows the warning; a `missing` file is
     shown unticked and is written only when the user ticks it (PRD F4.5); cancel/close writes
     nothing; confirm runs `executePlan` and shows one Notice with written, skipped and failed
     lines; clicking a row never writes
  3. Implement: `src/artifacts/StoryFilesModal.ts`, styles in `styles.css`
  4. Validate: DOM tests; sentence case; mutation-check
  5. Success:
     - [ ] Per-file preview before writing `[ref: PRD/F2.3]`
     - [ ] Deselect and cancel `[ref: PRD/F2.5; PRD/F2.6]`
     - [ ] Result notice `[ref: PRD/F2.7]`
     - [ ] Folder change saved `[ref: PRD/F3.2]`
     - [ ] Not-excluded warning `[ref: PRD/F3.3]`

- [ ] **T3.3 Command and Scope tab group** `[activity: frontend-ui]`

  1. Prime: signed-off S1; `src/settings/SettingsTab.ts` (Scope tab, `LibraryDeps` callbacks);
     command conventions in `src/main.ts`
  2. Test: Command `set-up-story-files` opens the modal; Scope tab shows the "Story files" group
     with both folder settings, the button and a status line (not set up / up to date /
     N updates available / N missing) computed read-only from `planSetup`; the button opens the
     same modal; drawing the tab writes nothing
  3. Implement: `src/artifacts/storyFilesWiring.ts`, SettingsTab group, command registration
  4. Validate: Settings and command tests; mutation-check
  5. Success:
     - [ ] Command and button open the dialog `[ref: PRD/F2.2; PRD/F2.4]`
     - [ ] Updates available shown with a count `[ref: PRD/F4.2]`
     - [ ] Folder settings in the settings tab `[ref: PRD/F3.1]`

- [ ] **T3.4 Capability screen pointer** `[activity: frontend-ui]` `[parallel: true]`

  1. Prime: signed-off S6; `src/library/CapabilitiesModal.ts`, `capabilityReport.ts`,
     `capabilitiesWiring.ts`
  2. Test: The screen shows the pointer row; its button opens the setup dialog; showing the
     screen writes nothing; the FileClass count ignores the three value-list notes (notes with
     no FileClass frontmatter), so a fresh setup reports 8, not 11
     (`src/fileclass/fileClassVault.ts` `count()`, found in the T1.1–T1.3 review)
  3. Implement: Inject `openStoryFiles` through the capability wiring
  4. Validate: Modal tests; mutation-check
  5. Success: First-run screen points to setup without writing `[ref: PRD/F2.9]`

- [ ] **T3.5 Phase validation and live check** `[activity: validate]`

  - Run all tests, lint, typecheck ×3, build. Live in the test vault (after a git-restorable
    state): set up into a fresh folder layout, re-run (all up to date), edit one file and bump a
    source (skip-edited), delete one (missing). Restore the test vault via git after inspecting
    the diff.
