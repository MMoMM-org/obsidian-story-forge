---
title: "Phase 5: Controls, notices, keyboard and settings"
status: in_progress
version: "1.0"
phase: 5
---

# Phase 5: Controls, notices, keyboard and settings

## Phase Context

**GATE**: Read all referenced files before starting this phase. **T4.1 must be signed off.** Build
what the mockup shows. If something must differ, raise it with the user before coding it.

**Specification References**:
- `docs/XDD/specs/009-undo-journal/mockups.html` — binding (U1–U9, U11)
- `[ref: SDD/ADR-37]` — global capture-phase keydown, popouts via `window-open`
- `[ref: SDD/Example: the key policy]`; `[ref: SDD/Internal API Changes; undoKeys]`
- `[ref: SDD/ADR-50]` — controls; `[ref: SDD/ADR-53]` — command within 100 ms of a key is ignored
- `[ref: SDD/Design System; Interaction Design]` — `sf-undo-group`, `sf-undo-tool`, `sf-undo-btn`, live region
- `[ref: SDD/Deployment View; Documentation (Should Have)]`

**Key Decisions**:
- Disabled means `aria-disabled="true"` plus the muted look, never the `disabled` attribute, so the
  tooltip stays reachable.
- Undo never navigates, opens, reveals or focuses anything.
- If the Phase 1 spike failed, T5.4 is dropped. Commands and buttons stay. The `undoKeyPolicy`
  methods (T4.2, T5.2, T5.3) and `isEditableText` are then dropped too, since nothing calls them.

**Dependencies**: Phase 4 (signed-off mockups; Workbench refresh).

---

## Tasks

Puts the signed-off controls and texts on screen and makes Mod+Z work in the two views.

- [x] **T5.1 Signed-off wording and the shared controls** `[activity: frontend-ui]`

  1. Prime: the mockups U5–U9; `src/undo/stepLabel.ts`; `[ref: SDD/ADR-50]`.
     Four sign-off decisions (2026-11-06) change texts in `stepLabel.ts` and its tests: (P1) a rejected
     undo/redo gets the notice "Couldn't undo: an unexpected error occurred. See the developer console for details." ("Couldn't redo: …");
     (P6) the refusal is "Save your edit first (<note name>)", no "discard"; (P8) conflict notices end "Redo restores it" /
     "Redo restores them" (redo notices "Undo restores it/them"), no shortcut name; (P9) failed + vanished appends the vanished-note sentence.
  2. Test:
     - `stepLabel.test.ts`, and the T3.4 walkthrough assertion, are updated to the signed-off texts;
     - `undoControls.test.ts`:
       - `buildAnvilUndoControls` makes `span.sf-undo-tool[role=button][tabindex=0][data-sf-undo]`
         inside `div.sf-undo-group`;
       - `buildWorkbenchUndoControls` makes `button.sf-undo-btn[data-sf-undo]`;
       - `syncUndoControls` sets `aria-disabled`, `title` and `aria-label` from `peek()`: "Nothing
         to undo", or "Undo: <label>";
       - the controls stay enabled while a probe reports busy;
       - a click on a control with `aria-disabled="true"` calls nothing.
  3. Implement: `src/undo/undoControls.ts`; the `stepLabel.ts` wording; `.sf-undo-*` styles in
     `styles.css`, using Obsidian variables only.
  4. Validate: tests, mutation-checked; stylelint.
  5. Success: `[ref: SDD/AC-F6.2, AC-F6.3, AC-F6.4]`; the texts match U5–U9

- [x] **T5.2 Anvil: controls, activation, live region, key policy** `[activity: frontend-ui]`

  1. Prime: `AnvilView` head ~375, `_onClick` and the activation router, `_announce`; mockups U1–U3.
  2. Test: `AnvilView.undo.test.ts` (UI part):
     - ↶ ↷ sit at the right of the tab strip on every tab, including Board;
     - click, Enter and Space call `journal.undo()`/`redo()`, with `[data-sf-undo]` routed before
       other handlers;
     - every `subscribe` notification re-syncs the controls without a re-render;
     - `onOutcome` writes the message to the live region;
     - `undoKeyPolicy` gives `text` for an editor input with unsaved text, and `journal` for a saved
       focused field and for cards;
     - nothing moves focus;
     - a rejected undo/redo (from a control or the palette commands in `wireUndoJournal.ts`)
       shows `unexpectedErrorNotice(direction)` (P1) and still logs the warning.
  3. Implement: the Anvil changes; the P1 notice in `registerCommands` and the control click path.
  4. Validate: tests, mutation-checked.
  5. Success: `[ref: SDD/AC-F4.3, AC-F4.5, AC-F6.1, AC-F6.5, AC-F6.6]`

- [x] **T5.3 Workbench header controls** `[activity: frontend-ui]` `[parallel: true]`

  1. Prime: `SidebarView._buildShell` ~598–628; mockup U4.
  2. Test: `SidebarView.undo.test.ts` (UI part):
     - ↶ ↷ sit at the start of `.sf-icons`, before pin and edit;
     - they sync on `subscribe` and call the same undo/redo;
     - `undoKeyPolicy` delegates to the controller;
     - the listeners are removed on close.
  3. Implement: the header buttons and the key policy in `SidebarView`.
  4. Validate: tests, mutation-checked.
  5. Success: `[ref: SDD/AC-F6.1, AC-F6.5, AC-F6.6]`

- [x] **T5.4 Global key handler** `[activity: frontend-logic]` — dropped if T1.1 failed

  1. Prime: `[ref: SDD/ADR-37, ADR-53]`; `[ref: SDD/Example: the key policy]`; the Phase 1 findings
     in `docs/live-testing.md`.
  2. Test: `undoKeys.test.ts`:
     - Mod+Z → undo and Mod+Shift+Z → redo, both with `preventDefault`, only when the active host is
       the Anvil or Workbench and the target is inside its `containerEl`;
     - no Ctrl+Y;
     - other modifiers and other views are ignored, and no DOM is queried before the active-view
       check;
     - a `text` policy lets the key through;
     - a `journal` policy on a saved, focused field undoes.

     `main.undo.test.ts`:
     - the handler is registered on `activeDocument` and on each `window-open` document;
     - it is removed on unload;
     - a command within 100 ms of a key trigger is ignored, and one after that runs.
  3. Implement: `src/undo/undoKeys.ts`; the registration and the `lastKeyTriggerAt` guard in
     `main.ts`.
  4. Validate: tests, mutation-checked.
  5. Success: `[ref: SDD/AC-F5.1–AC-F5.5, AC-F5.8]`

- [ ] **T5.5 Settings: keep history, clear history** `[activity: frontend-ui]` `[parallel: true]`

  1. Prime: `src/settings/SettingsTab.ts`; mockup U11; `[ref: SDD/ADR-48]`.
  2. Test:
     - the toggle "Keep undo history across restarts" defaults to on, and its description says the
       history holds copies of field values;
     - turning it off calls `setPersistence(false)`, which deletes the file;
     - "Clear undo history" empties both stacks, deletes the file, notifies subscribers, shows the
       ADR-48 notice ("Undo history cleared"), and disables the controls.
  3. Implement: the two settings, and `journal.clear()` in `undoJournal.ts`: both stacks,
     `store.remove`, notify subscribers.
  4. Validate: tests, mutation-checked.
  5. Success: `[ref: SDD/AC-F7.4, AC-F7.9, AC-C.1]`

- [ ] **T5.6 README "Undo" section** `[activity: documentation]` `[parallel: true]`

  1. Prime: `[ref: SDD/Deployment View; Documentation (Should Have)]`.
  2. Test: the section covers:
     - values are restored, not formatting;
     - what the history holds, and that it should be kept out of git;
     - history is per device, and Obsidian Sync leaves it alone;
     - binding a command to Mod+Z globally shadows editor undo;
     - a link value stored in the history goes stale when its target is renamed;
     - the commands have no default hotkey.
  3. Implement: `README.md`.
  4. Validate: the user reads it.
  5. Success: `[ref: SDD/AC-S.1, AC-S.2]`

- [ ] **T5.7 Phase Validation** `[activity: validate]`

  - All gates green. Compare against the mockups side by side in `test/StoryForge/` (light and dark, narrow
    width for U3). Drift check against ADR-37/49/50/53 and the signed-off mockup.

## Decisions taken during implementation

- **T5.1: the outcome types grew to carry the signed-off plurals.** P9 (failed + vanished) needs the vanished paths on a `failed` outcome, and P10 ("its change" / "its changes") needs per-note change counts. `journalTypes.ts` adds `changeCounts` to the applied, failed and vanished outcomes and `vanishedPaths` to failed; `undoJournal.ts` fills them. These files were not named in T5.1; they are the minimum the signed-off texts need.
- **T5.1: the P1 notice text exists, wiring moves to T5.2.** `unexpectedErrorNotice(direction)` is in `stepLabel.ts`; T5.1's Implement step names only the texts, the controls and the styles, so showing it from the palette commands and the control click path is added to T5.2.
- **T5.1: `modKeyName` was removed.** It had no caller once P8 dropped the shortcut name from the conflict notice.
- **T5.1: the shared activation is `activateUndoControl(el, journal)`.** It returns null for a disabled control or a non-control and never moves focus; T5.2's `_onClick` and T5.3's buttons call it. The U3 narrow-header wrap needs the Anvil markup and stays in T5.2.
- **T5.2: the Anvil undo group sits in a right-hand header cluster.** `div.sf-ws-headtools` holds the zoom slot, then ↶ ↷, and wraps to the next row as one unit at narrow width. This is what the signed-off U3b/U3c (`.mk-rightcluster`, decision P4) show; ADR-50's "appended to the header after the tab strip" describes the wide U1 layout. `AnvilView.m6.test.ts` changed its zoom selector only.
- **T5.2: controls are built only when a journal is passed** (`opts.undo`). Production always passes one; other suites keep their header DOM.
- **T5.2/T5.3: the P1 notice has one path.** `reportRejectedUndo(direction, err)` in `src/undo/undoNotice.ts` warns and shows `unexpectedErrorNotice`; the palette commands, the Anvil controls and the Workbench buttons all call it. `undoControls.ts` stays DOM-only, `stepLabel.ts` strings-only.
- **T5.2 review: a repeated live-region message is a real DOM change.** `_announce` replaces the region's text node instead of assigning `textContent`, because assigning the same text to a lone text child updates it in place and a screen reader stays silent on the second "Nothing to undo". Some screen readers may still drop identical text arriving within a very short interval; no DOM change can fix that.
- **T5.3: the Workbench buttons follow the journal in place.** One sync at open, then one per `subscribe` notification, released on close and on unload; `undoKeyPolicy` delegates to the `InspectorController` and falls back to `journal` without an editor.
- **T5.4: the key wiring lives in `wireUndoJournal.ts`, not `main.ts`.** The 100 ms guard (ADR-53) must be shared with the palette commands, which that module registers; `main.ts` only passes an `activeHost` closure (Anvil, else Workbench). The guard is exclusive (a command at 99 ms is ignored, at 100 ms it runs) and applies across directions.
- **T5.4: the host's document is `containerEl.ownerDocument`**, not Obsidian's `.doc` from the SDD example: the same document for an attached view, and standard DOM.
- **T5.4: known limits, accepted.** (a) The chord is matched on `e.key` as in the SDD example, so on a non-Latin layout (Ctrl+Z reports the local letter) the journal shortcut does nothing and the native undo runs; buttons and commands still work. (b) A popout that was already open when the plugin loaded gets no handler; only `window-open` registers one. (c) A closed popout's listener is released at plugin unload, not at `window-close`; a closed window never receives keys. (d) The guard uses `Date.now()`; a backwards clock jump right after a key trigger can drop palette commands until the next key trigger.
