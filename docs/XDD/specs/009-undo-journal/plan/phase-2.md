---
title: "Phase 2: Journal core"
status: in_progress
version: "1.0"
phase: 2
---

# Phase 2: Journal core

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: SDD/Interface Specifications; Internal API Changes]` — `CommitOptions`, `WriteRecorder`, `RestoreFn`, `installWriteRecorder`
- `[ref: SDD/Application Data Models]` — `Slot`, `Step`, `UndoOutcome`, `UndoJournal`, `OwnedUndoJournal`
- `[ref: SDD/Data Storage Changes]` — `UndoJournalFileV1`, `keepUndoHistory`
- `[ref: SDD/Implementation Examples]` — capture, restore with conflict read, one apply direction
- `[ref: SDD/ADR-41, ADR-43, ADR-44, ADR-45, ADR-46, ADR-47, ADR-48, ADR-49]`
- `[ref: SDD/Traced walkthrough 2]` — conflict, then redo
- `[ref: SDD/Implementation Gotchas]` — `after` from `slotOf`, `getFileByPath`, emptied block

**Key Decisions**:
- `commit`/`commitMany` stay source-compatible. A journal failure never turns a successful write
  into a reported failure.
- The `restore` capability exists only as the return value of `installWriteRecorder`. A second
  install throws, and tests must uninstall.
- Values compare after a YAML round trip, with deep equality; `undefined` means absent.
- The notice texts in `stepLabel.ts` are **provisional** until mockups U5–U9 are signed off
  (OQ-3). T5.1 aligns them.
- Groups: `CommitOptions.group` exists in the types here. Its behaviour is Phase 3, so in this
  phase every call records its own step.

**Dependencies**: Phase 1 (only T1.2's result matters here: where the file may live).

---

## Tasks

Delivers a working journal behind the writer: every Story Forge write is a step, and the command
palette can undo and redo it across restarts. No UI beyond two commands.

- [x] **T2.1 Obsidian mock additions** `[activity: test-infrastructure]`

  1. Prime: `test/__mocks__/obsidian.ts`; `obsidian.d.ts` for `parseYaml`, `stringifyYaml`,
     `Keymap.isModifier`, `Platform.isMacOS`, `Debouncer.run`, and the `Tasks` payload of the
     workspace `quit` event. `Workspace.on` already accepts any event name, so `window-open` and
     `quit` need no registration change.
     `[ref: SDD/Technical Debt; the obsidian mock]`; memory "Obsidian mock must match real API".
  2. Test: `typecheck:mock` fails on a misshaped addition. `parseYaml(stringifyYaml(x))` matches
     `yaml` for strings, numbers, lists, nested maps, null. `Debouncer.run()` runs the pending call
     once, and the old `flush` name is gone. No test or source file calls it today. `Tasks.add`
     collects the promises a `quit` listener adds.
  3. Implement: the additions, with `parseYaml`/`stringifyYaml` delegating to the `yaml`
     devDependency; rename `flush` → `run` in the mock; a `Tasks` class.
  4. Validate: full suite green with no behaviour change; `typecheck:mock`, `typecheck:test`.
  5. Success: the mock matches the d.ts for every member this spec uses `[ref: SDD/CON-7]`

- [x] **T2.2 Types, values, labels and the editable-text check** `[activity: domain-modeling]`

  > Runs after T2.1, because it needs `parseYaml`, `stringifyYaml` and `Platform.isMacOS` from the
  > mock. It runs before T2.3, which needs `slotOf`.

  1. Prime: `[ref: SDD/Application Data Models]`, `[ref: SDD/ADR-41]`, `[ref: SDD/ADR-49]`,
     `[ref: SDD/Error Handling]` (notice texts), `[ref: SDD/Example: the key policy]` (`isEditableText`),
     `src/editor/keyboardRouting.ts` (`isFormControl`).
  2. Test:
     - `yamlValue.test.ts`:
       - `normalise`: a date string stays a string; `1.0` → `1`; nested maps;
       - `slotOf`: absent vs `null` vs `""` vs `[]`;
       - `slotsEqual`: ordered arrays; map key order is irrelevant; absent ≠ null;
       - `valueSize`.
     - `stepLabel.test.ts`:
       - "status in Mara Stoneway", "3 changes in Mara Stoneway" and "4 changes in 3 notes";
       - 40-char truncation;
       - an absent value;
       - every `UndoOutcome` kind → its notice, with the Mod key name per platform.
     - `undoKeys.test.ts` (first part): `isEditableText` is true for inputs, textareas and
       contenteditable, and false for buttons, checkboxes and cards.
  3. Implement:
     - `src/undo/journalTypes.ts`, including the type-only `JournalGroup`, `PendingReason` and
       `JournalStore` interfaces. These are the writer's and the journal's shared vocabulary, which
       avoids an import cycle between `frontmatterWriter.ts` and `undoJournal.ts`.
     - `src/undo/yamlValue.ts` and `src/undo/stepLabel.ts`, both pure.
     - `src/undo/undoKeys.ts` with only `isEditableText`. T4.2 and T5.2 need it before T5.4 adds
       the handler.

     The notice texts are provisional until T4.1 (see the plan README).
  4. Validate: unit tests, each mutation-checked; lint; typecheck.
  5. Success: `[ref: SDD/AC-F1.2, AC-F1.7, AC-F4.1, AC-F4.2, AC-F4.4]`

- [ ] **T2.3 Writer recorder hook and restore path** `[activity: backend]`

  1. Prime: `src/inspector/frontmatterWriter.ts` (the whole module; the only `processFrontMatter`
     call sites); `[ref: SDD/ADR-44, ADR-45]`; `[ref: SDD/Example: capturing a step inside the writer]`;
     `[ref: SDD/Example: the restore capability]`.
  2. Test: `frontmatterWriter.journal.test.ts`:
     - one `record` per successful call, with the right `before`/`after`/presence;
     - `after` read back from the frontmatter, not from the input;
     - no `record` for a validation rejection, a rejected `processFrontMatter`, an empty
       `commitMany`, or a no-op write; the no-op keys are dropped from a mixed call;
     - a recorder that throws leaves the `CommitResult` ok and warns;
     - `restore` writes targets, deletes keys whose target is absent, returns the found slots, and
       records nothing;
     - a second `installWriteRecorder` throws; `uninstall` restores the plain path.

     `writeCoverage.test.ts` greps `src/` so that `processFrontMatter` appears only in this file.
  3. Implement: `CommitOptions`, the capture inside the callback, the module-level recorder,
     `installWriteRecorder` → `{restore, uninstall}`.
  4. Validate: the new and the existing writer tests pass; mutation-checked; lint; types.
  5. Success: `[ref: SDD/AC-F1.1, AC-F1.3, AC-F1.4, AC-F1.6, AC-F1.8]`

- [ ] **T2.4 UndoJournal: record, stacks, apply** `[activity: domain-modeling]`

  1. Prime: `[ref: SDD/Application Data Models; UndoJournal, OwnedUndoJournal, createUndoJournal]`;
     `[ref: SDD/ADR-46]`; `[ref: SDD/Example: one direction of apply]`; `[ref: SDD/Traced walkthrough 2]`.
  2. Test:
     - `undoJournal.record.test.ts`:
       - a recorded change becomes the top step;
       - a new step clears redo;
       - the 51st step drops the oldest, on each stack;
       - `peek()` and `subscribe` fire on every stack change.
     - `undoJournal.apply.test.ts`:
       - undo writes `before` and redo writes `after`, files in recorded order;
       - neither records a new step;
       - empty stacks write nothing and give `empty`;
       - a conflict still writes the target, and the found value lands on the opposite stack;
       - a deleted key restores, and redo deletes it again;
       - undo/redo/undo with outside edits between follows the rule each time;
       - an all-files failure keeps the step on top;
       - a partial failure keeps a reduced step of the failed files;
       - a missing note gives `vanished` and the rest applies;
       - two quick `undo()` calls run in sequence;
       - a write recorded while an apply runs is handled as ADR-46 says;
       - a folder at the step's path is not the note (`getFileByPath`), so the step reports `vanished`;
       - the body and unrelated keys are unchanged, by snapshotting the mock note around each test.
  3. Implement: `src/undo/undoJournal.ts` (stacks, the serialized queue, `applyStep`, outcomes,
     `onOutcome`, `notify` with `stepLabel`). Tests use an in-memory fake `JournalStore`; the
     real store is T2.6. It uses `getFileByPath`, never creates, renames or
     deletes a note, and has no groups or probes yet.
  4. Validate: unit tests, mutation-checked; lint; types.
  5. Success: `[ref: SDD/AC-F2.1–AC-F2.10, AC-F3.1–AC-F3.6, AC-F10.3, AC-F10.4]`

- [ ] **T2.5 Renames, deletes and startup prune** `[activity: domain-modeling]`

  1. Prime: `[ref: SDD/ADR-47]`.
  2. Test: `undoJournal.paths.test.ts`:
     - a file rename rewrites the path on both stacks, including a step sitting on redo;
     - a folder rename rewrites every path under it, and only those (a prefix with `/`, not a bare
       prefix);
     - a delete drops the file records, and any step left empty;
     - `pruneUnresolvable()` drops paths that no longer resolve;
     - a change notifies subscribers and schedules a save.
  3. Implement: `onRename`, `onDelete`, `pruneUnresolvable` in `undoJournal.ts`.
  4. Validate: unit tests, mutation-checked.
  5. Success: `[ref: SDD/AC-F10.1, AC-F10.2]`

- [ ] **T2.6 JournalStore and the persistence setting** `[activity: data-architecture]`

  > Runs after T2.5, because both edit `undoJournal.ts`. Only `journalStore.ts` and the settings
  > part could start earlier.

  1. Prime: `[ref: SDD/Data Storage Changes]`; `[ref: SDD/ADR-40, ADR-48]`; `src/types/index.ts`
     `normalizeSettings`.
  2. Test: `journalStore.test.ts`:
     - round trip of both stacks in order;
     - a missing file, invalid JSON, a wrong `version` or a malformed step each give empty stacks
       and a warning, without throwing;
     - a step with a value over 16,384 chars is kept in memory and not persisted;
     - over 1 MiB, the oldest steps are omitted;
     - saves are debounced to 1 s, `flushNow` writes at once, and nothing is saved without a stack
       change;
     - `remove` deletes the file;
     - with persistence off, a recorded step writes no file;
     - the path is `manifest.dir/undo-journal.json`.

     A settings test: `keepUndoHistory` defaults to `true`, and a non-boolean falls back to `true`.
  3. Implement: `src/undo/journalStore.ts` (through `vault.adapter`, `normalizePath`);
     `PluginSettings.keepUndoHistory` plus `normalizeSettings`; `load`, `setPersistence` and
     `flushNow` in the journal.
  4. Validate: unit tests, mutation-checked.
  5. Success: `[ref: SDD/AC-F7.1–AC-F7.7]`

- [ ] **T2.7 Plugin wiring and commands** `[activity: integration]`

  1. Prime: `src/main.ts` (how the FileClass cache is created, registered and disposed);
     `[ref: SDD/ADR-43]`; `[ref: SDD/Integration Points]`.
  2. Test: `main.undo.test.ts`:
     - `onload` creates the journal, installs the recorder, loads the store, and registers the vault
       `rename`/`delete` events and the layout-ready prune;
     - the commands "Undo last Story Forge change" and "Redo last Story Forge change" exist with no
       hotkeys and call the journal;
     - `onunload` flushes and uninstalls;
     - the workspace `quit` event flushes;
     - persistence off loads nothing.
  3. Implement: the wiring in `main.ts`. No key handler and no buttons yet.
  4. Validate: unit tests, mutation-checked; `npm run build`.
  5. Success: `[ref: SDD/AC-F5.6, AC-F5.7, AC-F7.8]`

- [ ] **T2.8 Phase Validation** `[activity: validate]`

  - All gates pass: `npm test`, `lint`, `typecheck`, `typecheck:test`, `typecheck:mock`,
    `schema:check`, `build`. A quick live check in `test/StoryForge/`: change a field in the Anvil,
    then run "Undo last Story Forge change" from the palette. Drift check against ADR-41/44/45/46/47/48.
