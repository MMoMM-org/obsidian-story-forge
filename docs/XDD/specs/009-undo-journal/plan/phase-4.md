---
title: "Phase 4: Mockup sign-off and the Workbench fix"
status: in_progress
version: "1.0"
phase: 4
---

# Phase 4: Mockup sign-off and the Workbench fix

## Phase Context

**GATE**: Read all referenced files before starting this phase. **T4.1 must be signed off by the
user before T4.2 or any Phase 5 task starts** (CON-8; memory "Mockups-first, HTML + sign-off").

**Specification References**:
- `[ref: SDD/User Interface & UX; UI Visualization Guide]` — mockup states U1–U11
- `[ref: SDD/ADR-49, ADR-50]` — labels, controls (`aria-disabled`, toolEl spans, native buttons)
- `[ref: SDD/ADR-42]` — Workbench: `clean`/`saved` take outside changes; `dirty`/`saving`/`error` are protected; the owed redraw
- `[ref: SDD/ADR-51]` — a pinned Workbench refreshes on its subject's changes
- `[ref: SDD/Known Technical Issues]` — `InspectorController.render` l.218, `notifyFileChanged` l.259, `SidebarView` l.334

**Key Decisions**:
- The signed-off mockup is binding. If an implementation needs to differ, raise it before coding it.
  Never re-sync the mockup to the code.
- Each field is judged on its own: one dirty field no longer freezes the whole Workbench.
- A pinned Workbench now refreshes, which changes shipped behaviour. That change is recorded in the
  spec README.

**Dependencies**: Phase 3 (the Workbench probe joins the same registry).

---

## Tasks

Gets the UI signed off, then fixes the Workbench so it shows what undo did. This closes #30.

- [x] **T4.1 Mockups U1–U11 and sign-off** `[activity: ui-design]`

  1. Prime: the UI Visualization Guide table; the current Anvil tab strip and Workbench header markup
     and CSS (`AnvilView` head ~375, `SidebarView._buildShell` ~598–628, `styles.css`); the 008
     `mockups.html` for its conventions; `[ref: SDD/Error Handling]` for the notice texts.
  2. Test: every state U1–U11 is present and uses Obsidian CSS variables in light and dark. The
     notices show the exact proposed wording. The focus-move gotcha (clicking ↶ while typing commits
     the draft first) is noted beside U8.
  3. Implement: `docs/XDD/specs/009-undo-journal/mockups.html`.
  4. Validate: the user reviews it in a browser. Iterate until they sign off.
  5. Success: the user signs off. The wording is recorded as binding, OQ-3 is resolved, and the sign-off
     goes in the spec README decision log `[ref: SDD/OQ-3; CON-8]`

- [x] **T4.2 InspectorController refresh rules** `[activity: frontend-logic]`

  1. Prime: `src/inspector/InspectorController.ts` (`render` ~217–221, `notifyFileChanged`);
     `[ref: SDD/ADR-42]`; the Anvil's `_reconcileOwed` as the precedent.
  2. Test: `InspectorController.refresh.test.ts`:
     - on a file change, `clean` and `saved` fields show the file's value, and a `saved` field no
       longer says saved for a value it doesn't hold;
     - `dirty`, `saving` and `error` fields keep their text while the others update;
     - discarding a dirty field shows the file's current value;
     - a `saved` field that takes an outside value drops its out-of-vocabulary advisory;
     - a `saving` field keeps its `committedValue`;
     - a redraw blocked by a protected field is owed, and runs through `onGuardCleared` when the
       field clears;
     - `isBusy(path)` gives `draft` or `write` only for the subject;
     - `undoKeyPolicy(target)` gives `text` for a field with a draft, and `journal` otherwise.
  3. Implement: the controller changes. `undoKeyPolicy` uses `isEditableText` from T2.2.
  4. Validate: the new and the existing inspector tests pass; mutation-checked.
  5. Success: `[ref: SDD/AC-F9.2, AC-F9.4, AC-F9.5, AC-F9.6]`; matches U10

- [ ] **T4.3 SidebarView: pinned refresh, probe, owed redraw** `[activity: frontend-logic]`

  1. Prime: `src/views/SidebarView.ts` (pinned early return ~l.334; constructor);
     `[ref: SDD/ADR-51]`.
  2. Test: `SidebarView.undo.test.ts` (non-UI part):
     - a pinned Workbench refreshes when its subject changes, and ignores other files;
     - the view registers `controller.isBusy` as a probe and unregisters it on close;
     - `onGuardCleared` triggers the owed redraw;
     - an undo of the subject's field shows the restored value, for both a followed and a pinned
       subject.
  3. Implement: the journal parameter, which `main.ts` passes into the Workbench view factory; the
     probe; the pinned refresh; the owed redraw. No header buttons yet.
  4. Validate: tests, mutation-checked; `npm run build`.
  5. Success: `[ref: SDD/AC-F9.2, AC-F9.3]`

- [ ] **T4.4 Phase Validation** `[activity: validate]`

  - All gates green. Live check of #30 (walk item 11): a hand edit of a saved Workbench field shows up
    without re-clicking. Drift check against ADR-42/51 and U10.

## Decisions taken during implementation

- **T4.2: discard is tested as retyping the old value.** Leaving edit mode tears down every field's state, so it cannot show whether a dirty field's stored value followed the file. The signed-off U10 rule ("restoring the old text … lands on the current file value") is the path tested.
- **T4.2: every blocked redraw counts as owed.** The controller does not try to tell a structural change from a value change; an owed redraw that changes nothing is harmless. Deliberately over-approximate.
- **T4.2: a subject change drops the owed redraw without calling `onGuardCleared`.** This departs from ADR-42's literal "or the subject changes": `teardown()` runs when the caller is about to render the new subject anyway, so a callback there would only draw twice (or draw a closing view).
- **T4.2: `isBusy` answers `draft` before `write`** when one field is dirty and another is saving. The ADR does not order them; the draft is what needs the user (tested).
- **T4.2 review (W1): a write that fails takes the file's current value as the stored value.** A file change during the write leaves a `saving` field's stored value alone; if the write then fails, the field compares against what the file holds now, not against the value from before the save.
- **T4.2 review (S1): a dirty or error field whose draft the file now holds becomes `clean`.** Its row is redrawn (Save button and error gone), `isBusy` stops answering `draft`, so undo is not blocked by a draft that is already in the file. When this leaves no field protected, `notifyFileChanged` returns `false`: the caller's own redraw is the owed one, so `onGuardCleared` is not called as well and the owed flag is cleared.
- **T4.2 review (S2): the owning view's unload runs `teardown()`.** A commit that settles after the view closed (without its own teardown) then bails on the generation check, and no owed redraw runs.
- **T4.2 review (S4): a row redrawn in place keeps the caret.** If the old control had focus, the new one is focused; the HTML value setter already puts the caret at the end, so no explicit selection call is made.
- **Accepted hazards from the T4.2 re-review (non-blocking, both self-heal).** (a) A field saved successfully and then saved again with a failure before `metadataCache.changed` arrives compares against the value from before the first save, because the plugin's own write does not update `ctx.frontmatter`; the next refresh corrects it. (b) If an outside change makes the file hold the draft while a write is in flight and that write then fails, the field stays in `error` (visible error, undo refused for that note) until the user edits the field or the next refresh. Both need two near-simultaneous writes; revisit if the live walk shows them.
- **Carry-over to T4.3: SidebarView's `currentCtx` goes stale while the controller guards.** `notifyFileChanged` returning `true` skips `_resolveAndRender`, so `toggleEditMode` (discard) and a tab switch (`_rerenderBody`) render the context from before the change, and `render()` with that context reverts clean and saved fields to the old value. T4.3 must re-resolve `currentCtx` even when `notifyFileChanged` returns `true` (without redrawing), with tests for both paths.
- **T4.3: one probe per open view, delegating to the view's editor.** The probe is `(path) => this._inspector?.isBusy(path) ?? null`, registered in `onOpen` and released in `onClose` (and on unload). The editor is created once in the constructor and never replaced, so a probe bound to the instance would behave the same today; the delegation keeps the probe right if the editor is ever recreated. The mutation "probe captures the controller at open" therefore survives as an equivalent mutant.
- **T4.3: `onGuardCleared` is set in `onOpen` and cleared in `onClose`**, not in the constructor, so a view that is closed and opened again gets it back and a closed view never redraws.
- **T4.3: a guarded change refreshes `currentCtx` without drawing.** When `notifyFileChanged` returns `true` the view re-resolves the context and draws nothing. If the resolve fails (no cache, or it throws) the old context stays on purpose; the owed redraw goes through `_resolveAndRender` and shows the error there. The FileClass-change path shares the same handler (`_onSubjectChanged`).
- **T4.3: the owed redraw is `_resolveAndRender(subject.file)`, wrapped in `_renderKeepingFocus` (see the review bullet below).** No double redraw: when `notifyFileChanged` returns `false` the caller draws and the controller does not call `onGuardCleared` (T4.2 S1). With Obsidian's real timing (`changed` arrives after the write settles) a save that settles an owed redraw draws once from `onGuardCleared` and once from the later `changed`; the second draw is idempotent.
- **T4.3: the probe test checks the refusal, not the notice wording.** The current text ("Save or discard your edit first …") is aligned to the signed-off "Save your edit first …" in T5.1; this test only counts one notice.
- **T4.3 review (focus, U10 "focus is never moved by a refresh"): every full redraw of the subject keeps focus.** The owed redraw (`onGuardCleared`) and the redraw after a subject change both go through `_renderKeepingFocus`. Before drawing, it records the focused `[data-sf-inspector-input]` by name, with its selection start, end and direction. After drawing, it focuses the same-named control and restores the selection where the control has one (not on number inputs or checkboxes). This matters because the owed redraw can run inside the field's own `input` handler, when retyping the saved value clears the last protected field. During an IME composition (from `compositionstart` in the panel) the redraw is held in the view, because the controller has already cleared its owed flag by then. The composition ends at `compositionend`, or at a `focusout` while composing (the field's own `compositionend` may never reach the panel). The held redraw then runs one tick later (`window.setTimeout(0)`), so a last composition `input` that Firefox and Safari send after `compositionend` reaches the editor first. Every body rebuild (`_updateBody`: discard, tab switch, `_resolveAndRender`) and `onClose` resets the composition state and cancels a pending tick. The composing field is gone at that point, and a stuck flag would swallow every later redraw. "onClose does not reset" survives as an equivalent mutant: the next `onOpen` renders through `_updateBody`, and that resets the state. The redraw is not deferred to focusout, and no Anvil gesture machinery is copied.
- **T4.3 review: the close test no longer reads the private `_inspector`.** Clearing `onGuardCleared` on close stays as defence; its mutant survives, because `teardown()` already drops the owed redraw, so a closed view cannot redraw either way.
