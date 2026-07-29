---
title: "Phase 5: The editor pane"
status: pending
version: "1.0"
phase: 5
---

# Phase 5: The editor pane

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: PRD/F5]` — the editor pane, 9 ACs · `[ref: PRD/F6]` — fields from the chain (rendering half)
- `[ref: SDD/ADR-33]` — three docks, never automatic · `[ref: ADR-0001]` — editing is custom DOM
- Mockups **S92** (bottom + tools), **S99** (docked right), **S100** (fullscreen), **S102/S103**
  (sections and layout)

**Key Decisions**:
- **ADR-33** — the dock is a setting and **never** changes on resize.
- **CON-1** — every write goes through `frontmatterWriter`; the editor adds controls, not a write path.
- Undo is **out of scope** (#17), so the editor must not make writes easy to trigger accidentally
  `[ref: SDD/Implementation Gotchas]`.

**Dependencies**: **Phase 1** (T1.3 `fieldModel`), **Phase 4** (the grid that opens it).

**Ships**: editing where you read it. The pane is already FileClass-driven via `fieldModel`; Phase 6
finishes the job by deleting the hardcoded lists and replacing the `portrait`/`image` name coupling.

---

## Tasks

The editor the withdrawn "note panel" surface was actually reaching for.

- [ ] **T5.1 Pane shell, docks and tools** `[activity: frontend-ui]`

  1. Prime: Mockups **S92**, **S99**, **S100**; `[ref: ADR-33]`.
  2. Test: selecting an entry opens the pane `[ref: PRD/F5 AC]`; **close** returns to the full grid;
     **fullscreen** takes the grid's space and **Back** returns to the previous dock
     `[ref: PRD/F5 AC]`; dock *right* shows a single card column beside the pane; **a window resize
     never changes the dock** `[ref: PRD/F5 AC]`; the tab strip stays visible in fullscreen so the
     Anvil is never a trap `[ref: SDD/Quality Requirements]`.
  3. Implement: `src/editor/editorPane.ts`.
  4. Validate: unit tests; stylelint for `sf-ed-*`; types.
  5. Success:
     - [ ] Three docks, no automatic switching `[ref: SDD/AC — PRD F5]`

- [ ] **T5.2 Field controls per type** `[activity: frontend-ui]`

  1. Prime: `[ref: SDD/Application Data Models]` — `FieldDef`; the six generated types plus
     `Boolean` and `Date`; `[ref: PRD/Won't Have]` — `Lookup`/`Formula`/`Canvas` are out.
  2. Test: each of `Input`, `Select`, `Multi`, `MultiFile`, `Number`, `File`, `Boolean`, `Date`
     renders an appropriate control `[ref: PRD/F6 AC]`; an **unsupported type falls back to plain
     text rather than failing** `[ref: PRD/F6 AC]`; a `Select` whose current value is absent from
     the declared list still shows and preserves it `[ref: PRD/F6 edge case]`; relation chips add
     and remove `[[wikilinks]]` **a human could have typed** `[ref: PRD/F5 AC]`.
  3. Implement: `src/editor/fieldControls.ts`.
  4. Validate: unit tests per control; lint; types.
  5. Success:
     - [ ] Relations are editable — the gap that motivated this spec `[ref: PRD/F5 AC]`

- [ ] **T5.3 Sections and layout from the model** `[activity: frontend-ui]`

  1. Prime: Mockups **S102/S103**; `[ref: SDD/Complex Logic]` traced walkthrough.
  2. Test: one section per FileClass in chain order, base first `[ref: PRD/F6 AC]`; the width rule
     places `name/role/status/occupation` two-up and `skills/guild` full-width, matching S102/S103
     field-for-field; a user FileClass renders **in its own labelled section**, not appended
     `[ref: PRD/F6 AC]`; undeclared keys land in *Other properties* `[ref: PRD/F6 AC]`; **every dock
     shows the full field set** `[ref: PRD/F5 AC]`.
  3. Implement: section rendering in `editorPane` driven purely by `FieldModel` `[ref: ADR-31]`.
  4. Validate: unit tests; lint; types.
  5. Success:
     - [ ] The rendered pane matches S102/S103 `[ref: SDD/AC — PRD F6]`

- [ ] **T5.4 Commit path, rollback and external sync** `[activity: backend-api]`

  1. Prime: Read `src/inspector/frontmatterWriter.ts` (`commit`, `validateField`, `CommitResult`)
     and `src/inspector/InspectorController.ts` — extend it rather than starting over.
  2. Test: committing a field writes **exactly one plain Property** `[ref: PRD/F5 AC]`; a failed
     commit **restores the previous value and surfaces the reason** `[ref: PRD/F5 AC]`; an external
     edit updates the displayed values `[ref: PRD/F5 AC]`; a note deleted while open closes the pane
     and notifies `[ref: SDD/Error Handling]`; **no write path exists outside `frontmatterWriter`**
     (assert by grepping the new modules in a test).
  3. Implement: wire controls → `commit`; optimistic update with rollback.
  4. Validate: unit tests with the spy-able `processFrontMatter` mock; lint; types.
  5. Success:
     - [ ] Every write is a plain Property `[ref: SDD/AC — PRD F5]`
     - [ ] A failure never leaves the UI showing a value the file lacks `[ref: SDD/Error Handling]`

- [ ] **T5.5 The portrait control** `[activity: frontend-ui]`

  1. Prime: Mockup **S102** (preview, path, *Choose image…* / *Clear*). Note the finding in
     `[ref: SDD/Technical Debt]`: today the image field is special-cased **by name**, and its name
     **differs by kind** (`portrait` vs `image`).
  2. Test: a field carrying the `image` hint renders preview + path + picker; a missing or unresolvable
     path shows the monogram fallback rather than a broken image; clearing writes an empty value
     through the normal commit path.
  3. Implement: an `image` control in `fieldControls`, driven by the hint — **not** by the field name.
  4. Validate: unit tests; lint; types.
  5. Success:
     - [ ] The control is selected by declaration, not by field name `[ref: ADR-32]`

- [ ] **T5.6 Phase Validation** `[activity: validate]`

  - Run all Phase 5 tests. Manual walk: select a character, edit `status` in each of the three docks,
    confirm the file changed in the core Properties UI, and **confirm Cmd+Z in the note reverts it**
    (the file-level guarantee that stands in for the missing journal). `npm test`, `npm run lint`,
    `npm run typecheck` green.
