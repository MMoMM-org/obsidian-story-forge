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

Every AC of the SDD, with the automated test that covers it (file › test name) and/or the live walk
item (SDD, Live walk list). The end-to-end test runs once per write path; its name is written with
`%s` for the path and the surfaces.

| AC | Test or walk item |
|----|-------------------|
| AC-F1.1 | `test/inspector/frontmatterWriter.journal.test.ts` › "records one report with before, after and presence"; `test/undo/undoJournal.record.test.ts` › "a recorded change becomes the top step", "writes with a group collect into one step, committed when the last hold closes"; `test/undo/endToEnd.test.ts` › "%s write: one step, undo via command, redo, reload from stored file, undo again; value shows in %s" (all six paths) |
| AC-F1.2 | `test/inspector/frontmatterWriter.journal.test.ts` › "records one report with before, after and presence", "marks a newly added key as absent before"; `test/undo/journalStore.test.ts` › "restores both stacks in order, with absent and empty slots told apart" |
| AC-F1.3 | `test/inspector/frontmatterWriter.journal.test.ts` › "marks a newly added key as absent before"; `test/undo/undoJournal.apply.test.ts` › "an added key is removed by undo and written again by redo" |
| AC-F1.4 | `test/inspector/frontmatterWriter.journal.test.ts` › "records an empty value as present, not absent", "keeps a key whose target is an empty value" |
| AC-F1.5 | `test/anvil/AnvilView.undo.test.ts` › "gives one step of 4 changes in 3 notes without Scene 2, and restores every note"; `test/workspace/interactionHandler.group.test.ts` › "coalesced key moves reuse the file's pending group (one group, one close)"; `test/undo/endToEnd.test.ts` › "%s write: one step, undo via command, redo, reload from stored file, undo again; value shows in %s" (Kanban drag, Kanban keyboard move, RENUMBER); walk item 5 |
| AC-F1.6 | `test/inspector/frontmatterWriter.journal.test.ts` › "a validation rejection", "a rejected processFrontMatter", "an empty commitMany", "a no-op write" |
| AC-F1.7 | `test/inspector/frontmatterWriter.journal.test.ts` › "a formatting-only difference", "keeps a date-looking string a string in after"; `test/undo/yamlValue.test.ts` › "normalise" suite |
| AC-F1.8 | `test/undo/writeCoverage.test.ts` › "calls processFrontMatter nowhere else in src/", "finds the writer, so the scan is not vacuous"; `test/undo/endToEnd.test.ts` › "%s write: one step, undo via command, redo, reload from stored file, undo again; value shows in %s" (all six paths) |
| AC-F2.1 | `test/undo/undoJournal.apply.test.ts` › "undo writes `before` and redo writes `after`", "neither undo nor redo records a new step"; `test/undo/endToEnd.test.ts` › "%s write: one step, undo via command, redo, reload from stored file, undo again; value shows in %s" (all six paths) |
| AC-F2.2 | `test/undo/undoJournal.apply.test.ts` › "undo writes `before` and redo writes `after`", "neither undo nor redo records a new step"; `test/undo/endToEnd.test.ts` › "%s write: one step, undo via command, redo, reload from stored file, undo again; value shows in %s" (all six paths) |
| AC-F2.3 | `test/undo/undoJournal.apply.test.ts` › "applies the files in recorded order, in both directions" |
| AC-F2.4 | `test/undo/undoJournal.record.test.ts` › "a new step clears redo" |
| AC-F2.5 | `test/undo/undoJournal.record.test.ts` › "the 51st step on undo drops the oldest", "the 51st step on redo drops the oldest" |
| AC-F2.6 | `test/undo/undoJournal.apply.test.ts` › "an empty stack writes nothing and gives `empty`"; `test/undo/stepLabel.test.ts` › "says nothing to undo or redo for an empty stack" |
| AC-F2.7 | `test/undo/undoJournal.apply.test.ts` (every test, through `teardownAndCheckUntouched` in `test/undo/journalHarness.ts`: bodies and the unrelated key unchanged); `test/undo/endToEnd.test.ts` › "%s write: one step, undo via command, redo, reload from stored file, undo again; value shows in %s" (whole-vault frontmatter and bodies compared) |
| AC-F2.8 | `test/undo/undoJournal.apply.test.ts` › "a failure on every file keeps the step on top and gives `failed`" |
| AC-F2.9 | `test/undo/undoJournal.apply.test.ts` › "a partial failure moves the written files and keeps a reduced step of the failed ones" |
| AC-F2.10 | `test/undo/undoJournal.apply.test.ts` › "two quick undo() calls run one after the other" |
| AC-F3.1 | `test/undo/undoJournal.apply.test.ts` › "restores the earlier value and puts the overwritten one on redo"; walk item 6 |
| AC-F3.2 | `test/undo/undoJournal.apply.test.ts` › "restores the earlier value and puts the overwritten one on redo"; walk item 6 |
| AC-F3.3 | `test/undo/stepLabel.test.ts` › "explains a single conflict and names the reverse command, not a key (P8)", "names up to three conflicts", "names three and counts the rest"; walk item 6. The signed-off P8 names the reverse command, not a shortcut (OQ-3). |
| AC-F3.4 | `test/undo/undoJournal.apply.test.ts` › "a key deleted outside is restored by undo, and redo deletes it again" |
| AC-F3.5 | `test/undo/undoJournal.apply.test.ts` › "follows the rule on every apply of undo, redo, undo with outside edits between", "a conflict on redo is written too, and undo restores what redo overwrote" |
| AC-F3.6 | `test/undo/stepLabel.test.ts` › "prefixes the step label for a clean undo and redo"; `test/undo/endToEnd.test.ts` › "%s write: one step, undo via command, redo, reload from stored file, undo again; value shows in %s" (no conflict: the plain "Undo: <label>" notice) |
| AC-F4.1 | `test/undo/stepLabel.test.ts` › "prefixes the step label for a clean undo and redo"; `test/undo/undoJournal.apply.test.ts` › "each outcome reaches every listener with its notice, and notify once"; `test/undo/endToEnd.test.ts` › "%s write: one step, undo via command, redo, reload from stored file, undo again; value shows in %s" (all six paths) |
| AC-F4.2 | `test/undo/stepLabel.test.ts` › "counts the changes for several fields in one note", "counts changes and notes for a step across notes"; `test/undo/endToEnd.test.ts` › "%s write: one step, undo via command, redo, reload from stored file, undo again; value shows in %s" (Kanban drag, RENUMBER) |
| AC-F4.3 | `test/anvil/AnvilView.undo.test.ts` › "carries each outcome's notice text", "adds the text to the region anew for each outcome, even when it equals the last" |
| AC-F4.4 | `test/undo/stepLabel.test.ts` › "explains a single conflict and names the reverse command, not a key (P8)", "asks the user to save first, naming the note, with no word about discarding (P6)", "says the change stays on the stack when every write failed", "says nothing to undo or redo for an empty stack", "says a vanished note's change was removed" |
| AC-F4.5 | `test/anvil/AnvilView.undo.test.ts` › "activating a control moves no focus", "an undo leaves the focus in the pane field where it was"; `test/views/SidebarView.undo.test.ts` › "leave the focus in the field where it was when activated"; `test/undo/undoControls.test.ts` › "does not move focus"; `test/undo/endToEnd.test.ts` › "%s write: one step, undo via command, redo, reload from stored file, undo again; value shows in %s" (no getLeaf, openLinkText or revealLeaf; focus unchanged) |
| AC-F5.1 | `test/undo/undoKeys.test.ts` › "Mod+Z on a target inside the active host undoes and prevents the default"; `test/main.undo.test.ts` › "registers the handler capture-phase on activeDocument: Mod+Z there undoes"; walk items 1, 2 |
| AC-F5.2 | `test/undo/undoKeys.test.ts` › "Mod+Shift+Z redoes and prevents the default"; `test/main.undo.test.ts` › "Mod+Shift+Z redoes"; walk item 2 |
| AC-F5.3 | `test/undo/undoKeys.test.ts` › "a text policy lets the key through to the field's own undo"; `test/anvil/AnvilView.undo.test.ts` › "is text for a pane field holding unsaved text"; `test/inspector/InspectorController.refresh.test.ts` › "gives text for a text field with a draft"; walk item 3 |
| AC-F5.4 | `test/undo/undoKeys.test.ts` › "a journal policy on a saved, focused field undoes and leaves the focus where it was"; `test/anvil/AnvilView.undo.test.ts` › "is journal for a focused pane field whose text is saved"; walk item 2 |
| AC-F5.5 | `test/undo/undoKeys.test.ts` › "ignores the key while another view is active, and reads no DOM before that check"; `test/main.undo.test.ts` › "ignores the key while neither the Anvil nor the Workbench is the active view" |
| AC-F5.6 | `test/main.undo.test.ts` › "registers undo and redo with the exact names and no hotkeys"; `test/undo/undoKeys.test.ts` › "there is no Ctrl+Y"; walk item 12 |
| AC-F5.7 | `test/main.undo.test.ts` › "the undo command calls journal.undo and the redo command journal.redo"; `test/undo/endToEnd.test.ts` › "%s write: one step, undo via command, redo, reload from stored file, undo again; value shows in %s" (all six paths); empty notice: `test/undo/undoJournal.apply.test.ts` › "an empty stack writes nothing and gives `empty`" |
| AC-F5.8 | `test/main.undo.test.ts` › "registers the handler on each popout window's document"; `test/undo/undoKeys.test.ts` › "handles a target inside a host that lives in another window"; walk item 1 |
| AC-F6.1 | `test/anvil/AnvilView.undo.test.ts` › "sit last in the header, right of the tab strip and the zoom slot, on the %s tab"; `test/views/SidebarView.undo.test.ts` › "sit at the start of .sf-icons, undo then redo, before pin and edit" |
| AC-F6.2 | `test/undo/undoControls.test.ts` › "starts disabled with the empty texts, as a fresh journal reads (U2b)", "disables only the empty side (U2a)"; `test/views/SidebarView.undo.test.ts` › "are disabled at open when the journal is empty" |
| AC-F6.3 | `test/undo/undoControls.test.ts` › "names the top step of each stack and enables the controls (U5)"; `test/anvil/AnvilView.undo.test.ts` › "show the journal's state when the Anvil opens" |
| AC-F6.4 | `test/undo/undoControls.test.ts` › "stay enabled while a probe reports the top step's note busy (AC-F6.4)" |
| AC-F6.5 | `test/anvil/AnvilView.undo.test.ts` › "re-sync on every subscribe notification, without a re-render"; `test/views/SidebarView.undo.test.ts` › "follow the journal on every notification without being rebuilt"; `test/undo/endToEnd.test.ts` › "%s write: one step, undo via command, redo, reload from stored file, undo again; value shows in %s" (all six paths) |
| AC-F6.6 | `test/anvil/AnvilView.undo.test.ts` › "%s on ↶ undoes and on ↷ redoes" (a click, Enter, Space); `test/undo/undoControls.test.ts` › "calls journal.undo for the undo control and journal.redo for the redo control" |
| AC-F7.1 | `test/settings/pluginSettings.test.ts` › "defaults to true"; `test/settings/undoSettings.test.ts` › "shows the toggle on by default and off when the setting is off" |
| AC-F7.2 | `test/undo/journalStore.test.ts` › "restores both stacks in order, with absent and empty slots told apart"; `test/undo/undoJournal.record.test.ts` › "load takes both stacks from the store and tells subscribers"; `test/undo/endToEnd.test.ts` › "%s write: one step, undo via command, redo, reload from stored file, undo again; value shows in %s" (all six paths); walk item 8 |
| AC-F7.3 | `test/undo/undoJournal.persist.test.ts` › "load() reads nothing and the stacks stay empty", "a recorded step is kept in memory and issues no save"; `test/main.undo.test.ts` › "with persistence off nothing is loaded from the store" |
| AC-F7.4 | `test/undo/undoJournal.persist.test.ts` › "off deletes the file and stops saving; the stacks stay"; `test/settings/undoSettings.test.ts` › "turning it off saves the setting and calls setPersistence(false)"; walk item 9 |
| AC-F7.5 | `test/undo/journalStore.test.ts` › "a missing file is empty and silent", "an unreadable file is empty with a warning, not a throw", "JournalStore — a bad file gives an empty snapshot and one warning" suite |
| AC-F7.6 | `test/main.undo.test.ts` › "uses the history file path under the plugin's directory"; `test/undo/journalStore.test.ts` › "is manifest.dir/undo-journal.json" |
| AC-F7.7 | `test/undo/undoJournal.record.test.ts` › "a step with an `after` over 16,384 chars is not persisted", "a step with a `before` over 16,384 chars is not persisted"; `test/undo/journalStore.test.ts` › "over 1 MiB, the oldest steps are omitted: undo is kept before redo, newest first" |
| AC-F7.8 | `test/main.undo.test.ts` › "unload flushes first and disposes only after the flush settles", "registers a quit listener that adds the flush to the quit tasks", "a pending Kanban write at unload is flushed into the group and reaches the persisted journal"; `test/undo/endToEnd.test.ts` › "%s write: one step, undo via command, redo, reload from stored file, undo again; value shows in %s" (reload inside the 1 s save debounce); walk item 8 |
| AC-F7.9 | `test/settings/undoSettings.test.ts` › "explains that the history holds copies of field values, and what off does (U11)" |
| AC-F8.1 | `test/undo/undoJournal.pending.test.ts` › "a probe reporting %s on the step's note refuses and changes nothing" (draft); `test/anvil/AnvilView.undo.test.ts` › "refuses with draft while the pane holds unsaved text for the step's note, and leaves the draft"; `test/views/SidebarView.undo.test.ts` › "refuses an undo of the subject while a field holds a draft, and lets it through once saved"; walk item 4 |
| AC-F8.2 | `test/undo/undoJournal.pending.test.ts` › "a probe reporting %s on the step's note refuses and changes nothing" (write); `test/anvil/AnvilView.undo.test.ts` › "refuses with write while a pane write for the step's note is in flight, and applies once it landed" |
| AC-F8.3 | `test/undo/undoJournal.pending.test.ts` › "proceeds when the busy note is not in the step"; `test/anvil/AnvilView.undo.test.ts` › "does not refuse for a draft in another note" |
| AC-F8.4 | `test/undo/undoJournal.pending.test.ts` › "runs every flusher and awaits it before choosing the step", "waits for an open group, then applies the step it committed"; `test/anvil/AnvilView.undo.test.ts` › "registers the handler's flushPending: undo writes a pending move now and undoes it"; walk item 5 |
| AC-F8.5 | `test/undo/undoJournal.pending.test.ts` › "applies on the next request once the probe clears"; `test/views/SidebarView.undo.test.ts` › "refuses an undo of the subject while a field holds a draft, and lets it through once saved" |
| AC-F9.1 | `test/undo/endToEnd.test.ts` › "%s write: one step, undo via command, redo, reload from stored file, undo again; value shows in %s" (all six paths); walk item 2 |
| AC-F9.2 | `test/views/SidebarView.undo.test.ts` › "shows the restored value for a followed subject", "shows the restored value for a pinned subject"; `test/undo/endToEnd.test.ts` › "%s write: one step, undo via command, redo, reload from stored file, undo again; value shows in %s" (all six paths) |
| AC-F9.3 | `test/undo/endToEnd.test.ts` › "%s write: one step, undo via command, redo, reload from stored file, undo again; value shows in %s" (Kanban). Codex and the other Story Forge views have no undo-specific test: they re-render on the same `metadataCache` "changed" as any write (spec 007 coverage). Walk item 5 covers the Kanban. |
| AC-F9.4 | `test/inspector/InspectorController.refresh.test.ts` › "show the file's value, and a saved field no longer claims a value it doesn't hold"; `test/undo/endToEnd.test.ts` › "%s write: one step, undo via command, redo, reload from stored file, undo again; value shows in %s" (Workbench save); walk item 11 |
| AC-F9.5 | `test/inspector/InspectorController.refresh.test.ts` › "dirty, saving and error fields keep their text while the others update in place" |
| AC-F9.6 | `test/inspector/InspectorController.refresh.test.ts` › "a dirty field compares against the file's current value, so restoring the text discards the draft (AC-F9.6)"; `test/views/SidebarView.undo.test.ts` › "after a discard, the fields show the file's current values" |
| AC-F10.1 | `test/undo/undoJournal.paths.test.ts` › "a file rename rewrites the exact path on the undo and the redo stack", "a folder rename rewrites every path under it, on both stacks"; `test/main.undo.test.ts` › "a vault rename reaches onRename with the file and its old path"; walk item 7 |
| AC-F10.2 | `test/undo/undoJournal.paths.test.ts` › "drops the file's records from both stacks and keeps the other records of a step", "drops a step left with no files"; walk item 7 |
| AC-F10.3 | `test/undo/undoJournal.apply.test.ts` › "a missing note gives `vanished` for it and the rest applies", "a step whose every note is gone is dropped and gives `vanished`" |
| AC-F10.4 | `test/undo/undoJournal.apply.test.ts` (every test, through `teardownAndCheckUntouched`: no create, modify, process, delete, trash, rename or remove); `test/undo/endToEnd.test.ts` › "%s write: one step, undo via command, redo, reload from stored file, undo again; value shows in %s" (all six paths) |
| AC-S.1 | **Gap**: no test and no walk item. `README.md` "Undo" documents it; checked by review only. |
| AC-S.2 | **Gap**: no test and no walk item. `README.md` "Undo" ("Links go stale") documents it; checked by review only. |
| AC-S.3 | T6.2: the live walk is recorded in `docs/live-testing.md` (items 2–12; item 1 recorded in Phase 1) |
| AC-C.1 | `test/undo/undoJournal.clear.test.ts` › "empties both stacks", "deletes the stored file"; `test/settings/undoSettings.test.ts` › "the Clear button empties the history and shows 'Undo history cleared'"; walk item 9 |
