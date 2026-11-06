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

- [ ] **T4.2 InspectorController refresh rules** `[activity: frontend-logic]`

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
