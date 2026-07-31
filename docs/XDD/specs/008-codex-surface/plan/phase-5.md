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
- `[ref: PRD/F2]` — navigation. **This phase discharges two F2 debts left open by Phase 2**: the
  Anvil's `inspect` has nowhere to land until this pane exists (T5.1), and the `editableField`
  marker has no producer until field controls exist (T5.2).
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

  > **Also owns the Anvil's inert `inspect` (decided 2026-07-31).** `AnvilView` defaults `_drill`
  > to a no-op and `src/main.ts` constructs it with `getLinkClickAction` only — no `drill` is
  > injected — so a plain click on an entity name in Timeline, Plotgrid, Plotlines or Board
  > currently **does nothing**. That is a deliberate user decision, not an oversight: the
  > pre-Phase-2 behaviour called `revealAndShowFile`, which hijacked the Workbench, and there is
  > nowhere in the Anvil to show an inspection until *this* pane exists. **This task is where it
  > stops being inert** — wire the `drill` seam through to the pane and inject it at the
  > construction site in `main.ts`.

  1. Prime: Mockups **S92**, **S99**, **S100**; `[ref: ADR-33]`; the 2026-07-31 decision-log row on
     inert inspect in the spec `README.md`, and `AnvilView`'s `_drill` seam (l.104/116) plus its
     construction in `src/main.ts` (~l.94).
  2. Test: selecting an entry opens the pane `[ref: PRD/F5 AC]`; **close** returns to the full grid;
     **fullscreen** takes the grid's space and **Back** returns to the previous dock
     `[ref: PRD/F5 AC]`; dock *right* shows a single card column beside the pane; **a window resize
     never changes the dock** `[ref: PRD/F5 AC]`; the tab strip stays visible in fullscreen so the
     Anvil is never a trap `[ref: SDD/Quality Requirements]`.
  3. Implement: `src/editor/editorPane.ts`; wire `AnvilView`'s `drill` seam to it and pass a `drill`
     at the `new AnvilView(...)` call in `src/main.ts` — the seam already exists and is simply
     unfed.
  4. Validate: unit tests; stylelint for `sf-ed-*`; types.
  5. Success:
     - [ ] Three docks, no automatic switching `[ref: SDD/AC — PRD F5]`
     - [ ] `AnvilView`'s `drill` seam is wired to the editor pane and injected at construction —
           a name click in Timeline / Plotgrid / Plotlines / Board is no longer a no-op
           `[ref: SDD/ADR-28]`
     - [ ] **PRD F2's "inspect in the Anvil is shown within the Anvil (the editor pane) and no
           other leaf is opened, revealed or re-targeted" AC is discharged here**, having been
           deferred from T2.5 by decision `[ref: PRD/F2 AC]`

- [ ] **T5.2 Field controls per type** `[activity: frontend-ui]`

  1. Prime: `[ref: SDD/Application Data Models]` — `FieldDef`; the six generated types plus
     `Boolean` and `Date`; `[ref: PRD/Won't Have]` — `Lookup`/`Formula`/`Canvas` are out.
  2. Test: each of `Input`, `Select`, `Multi`, `MultiFile`, `Number`, `File`, `Boolean`, `Date`
     renders an appropriate control `[ref: PRD/F6 AC]`; an **unsupported type falls back to plain
     text rather than failing** `[ref: PRD/F6 AC]`; a `Select` whose current value is absent from
     the declared list still shows and preserves it `[ref: PRD/F6 edge case]`; relation chips add
     and remove `[[wikilinks]]` **a human could have typed** `[ref: PRD/F5 AC]`; **a rendered field
     control carries the marker that classifies as `editableField`**, so a click on it resolves to
     `focusField` through the shared controller rather than to inspect or open-note
     `[ref: PRD/F2 AC]`.

     > **This task is the `editableField` marker's first producer** (recorded 2026-07-31). Phase 2
     > resolves and unit-tests the kind in `navigationController.ts`, but neither host's
     > `_markerKindOf` returns it, so the F2 "editable field" matrix row is currently green in unit
     > tests while being unreachable from any real click. Emitting the marker here is what makes
     > that AC actually exercised — do not treat it as cosmetic.

     > **This task now solely owns the out-of-list `Select` case** (moved here 2026-07-30 from
     > T1.3, whose test list claimed it): the shipped `FieldDef` has no current-value slot, so the
     > model layer cannot satisfy it. This pane does — it has the note's value.
     >
     > **Reconcile two contradictory statements before implementing.** `requirements.md:265` says
     > *"the control offers **exactly** those values"*; `solution.md` AC (Edge Cases) says an
     > out-of-list current value is **preserved and displayed**. Taken literally the first forbids
     > what the second requires. Phase 5 must state the reconciliation explicitly — the likely
     > reading is that the *selectable* set is exactly the declared list while the *current* value
     > is still shown (e.g. as a marked, non-reselectable entry), so no click ever silently rewrites
     > a value the user put there by hand. Record the resolution; do not leave it to the control's
     > implementation to decide by accident.

  3. Implement: `src/editor/fieldControls.ts`; stamp the field-control marker and extend the host's
     `markerKindOf` so it classifies as `editableField`.
  4. Validate: unit tests per control; lint; types.
  5. Success:
     - [ ] Relations are editable — the gap that motivated this spec `[ref: PRD/F5 AC]`

- [ ] **T5.3 Sections and layout from the model** `[activity: frontend-ui]`

  > **BLOCKED on OQ-1 `[ref: SDD/Open Questions]`** — where a section's display **label** comes from
  > is undecided. The mockup shows "Character"/"Isekai"; the model currently yields `fc-character` /
  > `fc-character-custom1`. Option 1 is a title property in the fc file (works today, but
  > metadata-menu may drop an unrecognised key on its own save); Option 2 derives from the file name
  > (immune to that, but a rename must carry every referring `extends:` with it). **Do not pick one
  > here — get the decision first.**
  >
  > **Also owns the `origin: "user"` debt.** Phase 1 shipped `FieldSection.origin` as
  > `"builtin" | "other"`, because `ParsedFileClass` carries no provenance. The SDD declares three
  > variants and CON-10 requires them — the mockup defines exactly three section styles
  > (`.ed-sec` / `.ed-sec.usr` / `.ed-sec.other`, `anvil-workbench-codex.html:485-486`), so without
  > `"user"` a user's own section cannot be styled as theirs, which is the whole point of S103.
  > Likely mechanism: pass the set of plugin-generated FileClass names (the six from `schema/*.json`)
  > into `buildFieldModel`, so "not one of ours" ⇒ `"user"`.

  1. Prime: Mockups **S102/S103**; `[ref: SDD/Complex Logic]` traced walkthrough; **OQ-1** and the
     `origin` debt above.
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

  1. Prime: Read `src/inspector/frontmatterWriter.ts` — the **exported** seam you wire to is
     `commit` / `commitMany` plus the `FieldSpec` and `CommitResult` types. **`validateField`
     (l.61) and `isOutOfVocab` (l.123) are module-private** (corrected 2026-07-31): read them to
     understand what `commit` rejects and what it merely warns about, but **do not try to import
     them** — you get validation by going through `commit`/`commitMany`, which is exactly what
     CON-1 requires. Then read `src/inspector/InspectorController.ts` — extend it rather than
     starting over.
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
  2. Test: a field of the native **`Media`** type renders preview + path + picker; a missing or
     unresolvable target shows the monogram fallback rather than a broken image; clearing writes an
     empty value through the normal commit path.
  3. Implement: a `Media` control in `fieldControls`, driven by the field's **type** — **not** by the
     field name, and **not** by a `ui` hint (`ui: "image"` was withdrawn, ADR-32 revised 2026-07-29).
  4. Validate: unit tests; lint; types.
  5. Success:
     - [ ] The control is selected by the field's declared **type**, not by field name `[ref: ADR-32]`

- [ ] **T5.6 Phase Validation** `[activity: validate]`

  - Run all Phase 5 tests. Manual walk: select a character, edit `status` in each of the three docks,
    confirm the file changed in the core Properties UI, and **confirm Cmd+Z in the note reverts it**
    (the file-level guarantee that stands in for the missing journal). `npm test`, `npm run lint`,
    `npm run typecheck` green.
