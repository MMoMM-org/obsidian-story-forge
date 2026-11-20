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

**Decisions taken during implementation**:
- 2026-11-20 sign-off with review changes O7–O9 (mockups S6, S7): rename of the capability screen,
  Library tab hint, metadata-menu Properties panel bullet (checked live in T3.5 before it ships).
- T3.4: the row status is computed by `src/artifacts/storyFilesStatus.ts` (`summarizeStoryFiles`
  pure, `readStoryFilesStatus` read-only), reused by T3.3. While it loads the row reads "Checking
  story files…" (S1 wording); a failed check reads "Could not check story files" (not drawn).
  `count()` counts notes with frontmatter, so the empty value-list notes are left out (8, not 11).
  The mockup's left accent bar on the new row is the mockup's proposal marker and is not shipped.
  Status text is set with `textContent` (the mock has no `setText`; same effect).
- T3.2: a folder change is a preview; folders are saved only on confirm (O1). An emptied or
  malformed field falls back to the set's default, as in settings. Rows that write come first (S3
  note over the S3 drawing). The D9 button names the folder ("Add <folder> to excluded folders")
  and needs the injected `addExcludedFolder`. A failed replan restores the previous folder and shows
  "Could not check <folder>: <reason>. The folder stays <previous>." in the card (not drawn). Other
  undrawn texts: "Could not read the story files: …", "Could not save the folder settings: … Nothing
  was written.", "Could not add <folder> to excluded folders: …". Notice composition is the pure
  `src/artifacts/storyFilesNotice.ts`; role "status" when it hides itself, "alert" when it stays.
  While confirming, every control is locked; closing with Escape mid-write does not stop the write,
  and the result notice still reports it (the user has already confirmed). The mock `Notice` now
  accepts a DocumentFragment, as obsidian.d.ts does.
- Debt: the folder suggester in the dialog is not closed on close, because `attachFolderSuggest`
  (src/settings/suggesters.ts) returns no handle; its input is removed with the dialog content.

**Dependencies**: Phase 2.

---

## Tasks

Gives the user the deliberate, previewed setup and update flow.

- [x] **T3.1 Mockups S1–S7 and sign-off** `[activity: ui-design]`

  1. Prime: `[ref: SDD/User Interface & UX]`, L10/L12 mockups of spec 008
  2. Test: Each state S1–S6 is drawn as HTML in
     `docs/XDD/specs/010-ship-vault-artifacts/mockups.html` with real wording
  3. Implement: Author the mockups; ask the user for sign-off; record sign-off (and any change)
     in the spec README decision log
  4. Validate: User sign-off recorded
  5. Success: Signed-off mockups exist before any UI code `[ref: SDD/CON-6]`

- [x] **T3.2 StoryFilesModal** `[activity: frontend-ui]`

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
     - [x] Per-file preview before writing `[ref: PRD/F2.3]`
     - [x] Deselect and cancel `[ref: PRD/F2.5; PRD/F2.6]`
     - [x] Result notice `[ref: PRD/F2.7]`
     - [x] Folder change saved `[ref: PRD/F3.2]`
     - [x] Not-excluded warning `[ref: PRD/F3.3]`

- [ ] **T3.3 Command and Scope tab group** `[activity: frontend-ui]`

  1. Prime: signed-off S1; `src/settings/SettingsTab.ts` (Scope tab, `LibraryDeps` callbacks);
     command conventions in `src/main.ts`
  2. Test: Command `set-up-story-files` opens the modal; Scope tab shows the "Story files" group
     with both folder settings, the button and a status line (not set up / up to date /
     N updates available / N missing) computed read-only from `planSetup`; the button opens the
     same modal; drawing the tab writes nothing. Library tab (S7): the hint shows only while
     nothing is set up and not dismissed; its button opens the modal; "Don't show again" stores
     the preference and redraws without the hint; nothing is drawn while the status is checking
  3. Implement: `src/artifacts/storyFilesWiring.ts`, SettingsTab group, command registration
  4. Validate: Settings and command tests; mutation-check
  5. Success:
     - [ ] Command and button open the dialog `[ref: PRD/F2.2; PRD/F2.4]`
     - [ ] Updates available shown with a count `[ref: PRD/F4.2]`
     - [ ] Folder settings in the settings tab `[ref: PRD/F3.1]`

- [x] **T3.4 Capability screen pointer** `[activity: frontend-ui]` `[parallel: true]`

  1. Prime: signed-off S6; `src/library/CapabilitiesModal.ts`, `capabilityReport.ts`,
     `capabilitiesWiring.ts`
  2. Test: The screen shows the pointer row; its button opens the setup dialog; showing the
     screen writes nothing; the FileClass count ignores the three value-list notes (notes with
     no FileClass frontmatter), so a fresh setup reports 8, not 11
     (`src/fileclass/fileClassVault.ts` `count()`, found in the T1.1–T1.3 review)
     The screen is named "What Story Forge can use" (O7) in its title, footer line, the Library
     tab link and the Dataview hints; no "What optional plugins add" is left in `src/`, `test/`,
     `styles.css` comments, the user docs (`docs/*.md`) or the PRD text. The intro and the
     metadata-menu row read as in S6 (O9)
  3. Implement: Inject `openStoryFiles` through the capability wiring; rename everywhere
  4. Validate: Modal tests; mutation-check
  5. Success: First-run screen points to setup without writing `[ref: PRD/F2.9]`

- [ ] **T3.5 Phase validation and live check** `[activity: validate]`

  - Run all tests, lint, typecheck ×3, build. Live in the test vault (after a git-restorable
    state): set up into a fresh folder layout, re-run (all up to date), edit one file and bump a
    source (skip-edited), delete one (missing). Restore the test vault via git after inspecting
    the diff.
