---
title: "Phase 5: F6 Inspector + F8 read-only fields"
status: in_progress
version: "1.0"
phase: 5
---

# Phase 5: F6 Inspector + F8 read-only fields

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: SDD/ADR-3]` — Inspector = edit-mode overlay in `SidebarView` via `InspectorController`
- `[ref: SDD/ADR-7]` — out-of-vocab `select`: type errors block, vocab violations warn; constrained dropdown
- `[ref: SDD/Implementation Examples]` — the F6 commit example (two failure states) + traced walkthrough
- `[ref: SDD/User Interface & UX]` — the Inspector state diagram; dirty-guard against commit re-render
- `[ref: PRD/F6]`, `[ref: PRD/F8]`, mockups **S52, S53, S54, S55**

**Key Decisions**: ADR-3 (host in SidebarView; transient in-memory dirty state, never persisted — CON-1), ADR-7 (block type errors, warn vocab). Fan-out is free via the existing `metadataCache.changed` subscription — but guard the writer's own commit from re-resolving and wiping the dirty UI.

**Dependencies**: Phase 1 (detect, for consistency). Independent of Bases surfaces — **can run parallel to Phases 3/4** (only touches `SidebarView` + panel renderers + `processFrontMatter`). Fan-out to the Codex grid is verified in Phase 6 once both exist.

---

## Tasks

Delivers the minimal editable Inspector that proves the frontmatter write-back loop end-to-end, plus read-only display of list/relation fields.

- [x] **T5.1 `frontmatterWriter` — validate-before-write, two error states** `[activity: backend-integration]`

  1. Prime: Read `[ref: SDD/ADR-7]`, the F6 commit example, `obsidian.d.ts` `processFrontMatter` (`:2954`), `schema/*.json` `values`.
  2. Test: validation runs **in memory before** any write; a **type-invalid** value returns `{ok:false, reason:"validation", keepDirty:true}` and **writes nothing** (S55); a valid value calls `processFrontMatter` and returns `{ok:true}` (S54); a `processFrontMatter` reject returns `{ok:false, reason:"write", keepDirty:true}` with Retry (S55); an out-of-vocab `select` value is **not** a blocking error (advisory warn) and the write proceeds.
  3. Implement: `src/inspector/frontmatterWriter.ts` (`commit(file, key, value, field)`), `src/inspector/editableFields.ts` (scalar/enum controls; select vocab from schema `values`).
  4. Validate: unit tests for valid / type-error / write-error / out-of-vocab; nothing persisted to plugin state.
  5. Success:
     - [x] Valid commit writes plain frontmatter + saved `[ref: PRD/AC-F6.3]`
     - [x] Type error blocks + preserves edit `[ref: PRD/AC-F6.5]`; write failure preserves + Retry `[ref: PRD/AC-F6.6]`
     - [x] Out-of-vocab follows frontmatter-is-truth (write + warn) `[ref: PRD/AC-F6.7; SDD/ADR-7]`

- [ ] **T5.2 `InspectorController` — dirty/saved/error state hosted in SidebarView** `[activity: frontend-ui]`

  1. Prime: Read `[ref: SDD/ADR-3]`, the Inspector state diagram, `SidebarView` detail render + `_renderRelevantEqual` (`:838`), `onClose` (`:279`), mockups S52/S53.
  2. Test: renders the read-only M3 detail **plus** editable scalar/enum fields (S52); editing past the committed value shows a **dirty** state with a commit affordance (S53); commit drives the state machine to saved (S54) or error (S55, edit retained); listeners are registered on a delegated/owned container (no per-field-per-render leak); `onClose`/re-subject clears transient dirty state; the controller's own commit does **not** re-trigger a subject re-resolve that wipes an in-flight edit.
  3. Implement: `src/inspector/InspectorController.ts` (delegated child hosted by `SidebarView`); wire `SidebarView` to host it in the detail render.
  4. Validate: state-machine tests; dirty-guard test (commit-triggered `changed` event does not clobber); teardown test.
  5. Success:
     - [ ] Read-only detail + editable scalar/enum `[ref: PRD/AC-F6.1]`; dirty state `[ref: PRD/AC-F6.2]`
     - [ ] Committed edit fans out to the M3 panel `[ref: PRD/AC-F6.4]` (Codex/base fan-out verified in Phase 6)

- [ ] **T5.3 F8 read-only list/relation field display** `[activity: frontend-ui]` `[parallel: true]`

  1. Prime: Read `[ref: PRD/F8]`, the M3 unresolved-row treatment in `panel/renderers`.
  2. Test: list/relation (wikilink) fields render **read-only**, clearly not editable, alongside the editable scalar/enum fields; an unresolved `[[link]]` uses the M3 muted, non-clickable treatment (not an error).
  3. Implement: extend `editableFields`/the Inspector render to show list/relation fields read-only.
  4. Validate: unit tests for resolved + unresolved relation display.
  5. Success: list/relation shown read-only; unresolved uses M3 treatment `[ref: PRD/AC-F8.1, AC-F8.2]`

- [ ] **T5.4 Phase Validation** `[activity: validate]`
  - Run all Phase 5 tests. `npm test`, `lint`, `typecheck`, `typecheck:test` pass. Manually confirm on the seed vault: editing a scalar/enum writes plain frontmatter, shows saved, and the panel re-renders; a bad value shows a blocking validation error with the edit preserved; a simulated write failure preserves the edit with Retry `[ref: PRD/Success Metrics F6]`.
