---
title: "Phase 5: The editor pane"
status: in_progress
version: "1.0"
phase: 5
---

# Phase 5: The editor pane

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: PRD/F5]` — the editor pane, 9 ACs · `[ref: PRD/F6]` — fields from the chain (rendering half)
- `[ref: PRD/F3]` — **added 2026-08-04 by the Phase 4 drift pass, which found this AC had no owner.**
  F3's *"Given the user selects a different collection, When the grid re-renders, Then any open
  editor pane closes or follows the new selection — never shows a note from the previous
  collection"* (`requirements.md:219`) is an **F3** criterion, so Phase 4 nominally owned it — but
  Phase 4 has no editor pane, and no phase file referenced F3. It is **vacuously true today**
  because `AnvilView._render` empties the body wholesale, and it will **silently stop being true the
  moment T5.1 puts pane state on the view**. That is the danger: an AC that passes by accident now
  and fails silently later, with no test watching. T5.1 owns it — see its success criteria.
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

- [x] **T5.1 Pane shell, docks and tools** `[activity: frontend-ui]`

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
     - [x] Three docks, no automatic switching `[ref: SDD/AC — PRD F5]`
     - [x] `AnvilView`'s `drill` seam is wired to the editor pane and injected at construction —
           a name click in Timeline / Plotgrid / Plotlines / Board is no longer a no-op
           `[ref: SDD/ADR-28]`
     - [x] **PRD F2's "inspect in the Anvil is shown within the Anvil (the editor pane) and no
           other leaf is opened, revealed or re-targeted" AC is discharged here**, having been
           deferred from T2.5 by decision `[ref: PRD/F2 AC]`
     - [x] **Switching collection closes or retargets an open editor pane — it never shows a note
           from the previous collection**, with a test that fails if pane state survives a
           collection switch `[ref: PRD/F3 AC]`. Added 2026-08-04: this F3 criterion had **no
           owner**; it is vacuously true while `_render` empties the body wholesale, and this task
           is the one that introduces pane state capable of breaking it.
     - [x] A plain click on a **Codex card body** inspects — added 2026-08-04, since Phase 4 made
           the `cardBody` marker reachable for the first time. The 2026-07-31 inert-inspect decision
           enumerates only Timeline / Plotgrid / Plotlines / Board and predates the grid, so the
           Codex would otherwise fall through the gap: today the modifier-click → open-note path
           genuinely works while the plain-click → inspect path silently does nothing
           `[ref: PRD/F2 AC]`

- [x] **T5.2 Field controls per type** `[activity: frontend-ui]`

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
     > **RECONCILED 2026-08-05 — do not re-derive this.** `requirements.md:265` ("the control offers
     > **exactly** those values") and `solution.md`'s Edge-Case AC ("preserve and display the current
     > value") contradict each other only if *offers* and *displays* name the same set. They do not:
     >
     > - **selectable = the declared list, exactly** — the control never offers an undeclared value.
     > - **displayed = the declared list + the current value**, when that value is out of list, shown
     >   as a **marked, non-reselectable** entry.
     >
     > The non-reselectable property is the one that matters: once the user leaves an out-of-list
     > value they cannot re-enter it *through the control*, so the plugin never becomes the author of
     > a value it does not declare, and no click silently rewrites something typed by hand. Both
     > rejected readings break one half — an ordinary selectable option violates ":265", and the
     > declared list alone leaves the control showing **no selection while the file holds a value**,
     > which is the state most likely to be clicked away. Test both directions: the marked entry is
     > displayed, **and** it cannot be re-selected once left.

  3. Implement: `src/editor/fieldControls.ts`; stamp the field-control marker and extend the host's
     `markerKindOf` so it classifies as `editableField`.
  4. Validate: unit tests per control; lint; types.
  5. Success:
     - [ ] Relations are editable — the gap that motivated this spec `[ref: PRD/F5 AC]`

     > **Deliberately left unticked when T5.2 closed (2026-08-05).** The relation chip control is
     > built, reviewed and tested — chips add and remove `[[wikilinks]]` a human could have typed,
     > and `MultiFile`/`File` project their values correctly. But relations are not *user-reachable*
     > until **T5.3** mounts the controls into the pane from the `FieldModel` and **T5.4** commits
     > them through `frontmatterWriter`. Ticking it now would claim a user-visible outcome that no
     > user can reach. **T5.4 ticks it**, once a chip edit reaches the file.

- [ ] **T5.3 Sections and layout from the model** `[activity: frontend-ui]`

  > **OQ-1 RESOLVED 2026-08-05 — T5.3 is unblocked** `[ref: SDD/Open Questions]`. The label is
  > **`fc.title ?? prettify(stripPrefix(basename))`** — read the `title` key from the FileClass
  > frontmatter, and when it is absent derive from the file name (`fc-character` → "Character",
  > `fc-character-custom1` → "Character custom1"). Neither SDD option was taken alone: Option 1
  > renders the mockup but stakes the only label source on a key metadata-menu may drop; Option 2
  > survives that but cannot produce "Isekai", which would mean re-reading a signed-off figure to
  > fit the implementation (CON-10 forbids it). **Implement the fallback, not just the title read** —
  > the degradation path is the point of the decision, so it needs a test: a FileClass with **no**
  > `title` key must still render a labelled section.
  >
  > **Also owns the `origin: "user"` debt.** Phase 1 shipped `FieldSection.origin` as
  > `"builtin" | "other"`, because `ParsedFileClass` carries no provenance. The SDD declares three
  > variants and CON-10 requires them — the mockup defines exactly three section styles
  > (`.ed-sec` / `.ed-sec.usr` / `.ed-sec.other`, `anvil-workbench-codex.html:485-486`), so without
  > `"user"` a user's own section cannot be styled as theirs, which is the whole point of S103.
  > Likely mechanism: pass the set of plugin-generated FileClass names (those from `schema/*.json`)
  > into `buildFieldModel`, so "not one of ours" ⇒ `"user"`.
  >
  > **Corrected 2026-08-06: `schema/*.json` holds EIGHT entity types, not six** — the count above was
  > stale (it omits `book` and `plotline`). T5.3 reads the directory off disk rather than hardcoding
  > any list, with a drift test that fails if the two ever disagree, so the implementation is right
  > and this note was wrong. Do not "correct" the code back to six.

  > **Inherited from T5.1 (2026-08-05): the fullscreen pane does not actually fill the tab body.**
  > `.sf-ed--fullscreen { flex: 1 }` was **inert** — `.sf-ws-body` is a block box with `overflow:
  > auto`, not a flex container — so "fullscreen" is content-height today. T5.1 **removed** the dead
  > rule rather than making it effective, deliberately: filling the body requires `.sf-ws` to become
  > a flex column with `.sf-ws-body { flex: 1; min-height: 0 }`, which changes the box model for
  > **all five layouts** and **jsdom cannot verify the result**. That is not a change to slip into a
  > fix round unseen. T5.3 owns it because T5.3 adds the content that wants the height. Verify it in
  > a real vault, not only in tests, and check the other four layouts still lay out correctly.
  >
  > **The same change fixes a second thing, so do them together.** `.sf-ws-split-left` and
  > `.sf-cx-split-left` both carry `overflow: auto` with **no height constraint**, so a dock-right
  > column grows to content height instead of scrolling independently, and the two columns are as
  > tall as the taller one. This is pre-existing (`.sf-cx-split-left` shipped that way), not a T5.1
  > regression — but it has the same root cause and the same fix, and once the pane holds a full
  > field set it stops being theoretical.

  > **Inherited from T5.2 (2026-08-05): the `Select` cell does not look like S102, and T5.3's gate
  > is the one that has to rule on it.** S102 draws the select cell as a flat `.ed-f.sel-f` with an
  > `::after` chevron (`anvil-workbench-codex.html:404, 675`); T5.2 shipped a **native `<select>`**
  > with its own platform arrow. That was correct for T5.2 — its Prime references no mockup, and a
  > native control is what makes the out-of-list value genuinely non-reselectable via `disabled`,
  > which is the property the 2026-08-05 reconciliation turns on.
  >
  > **RULED 2026-08-05 (user): keep the native chrome. Do NOT restyle the `<select>`.** Restyling
  > with `appearance: none` plus the figure's chevron was offered and declined; a hand-built dropdown
  > was rejected outright. The divergence is recorded in the spec `README.md` decision log and the
  > **mockup is not re-synced**. So: T5.3's "matches S102/S103" gate is assessed on **sections,
  > labels, ordering and the width rule** — the enum cell's chrome is **out of scope for that gate**
  > and must not be re-raised as a defect here or in any later mockup comparison. Do not spend a
  > round on it.

  1. Prime: Mockups **S102/S103**; `[ref: SDD/Complex Logic]` traced walkthrough; **OQ-1**, the
     `origin` debt above, the inherited fullscreen-height item, and the `Select` chrome question.
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

  > **Real-vault verification checklist — these CANNOT be unit tests** (routed here 2026-08-05 on the
  > TDD gate's ruling for T5.3). jsdom computes no CSS, so a jsdom assertion for any of these would
  > **pass silently while the real vault is broken** — which is worse than no test. Verify each by
  > eye in a real vault and record the result:
  >
  > - [ ] **Fullscreen actually fills the tab body.** `.sf-ed--fullscreen { flex: 1 }` was inert
  >       because `.sf-ws-body` is a block box; the fix makes `.sf-ws` a flex column with
  >       `.sf-ws-body { flex: 1; min-height: 0 }`. That is a box-model change across **all five
  >       layouts** — so also confirm Timeline, Plotgrid, Plotlines and Board still lay out correctly.
  > - [ ] **The dock-right columns scroll independently.** `.sf-ws-split-left` and
  >       `.sf-cx-split-left` carry `overflow: auto` with no height constraint, so today a column
  >       grows to content height and the two columns are as tall as the taller one. With a long
  >       field set in the pane this stops being theoretical.
  > - [ ] **The dock-right EDITOR column scrolls in place — check the Codex flavour first.** Added
  >       2026-08-06. This is the one S99 actually draws, and it was the flavour missed twice:
  >       `.sf-cx-split-right` carries no `overflow` (unlike `.sf-ws-split-right`), so before the fix
  >       a full field set spilled out of the now-bounded split and dragged the **whole tab body's**
  >       scrollbar, pill row and all. The fix is `.sf-ed--right { height: 100%; min-height: 0 }`,
  >       which pins the pane's header and scrolls `.sf-ed-grid` internally in **both** split
  >       flavours. Verify with a character that has enough fields to overflow: the collection pills
  >       and the card column must stay put while the field grid scrolls, and the pane's own header
  >       (dock / fullscreen / close) must not scroll away with the fields.
  > - [ ] **The width rule renders two-up.** Unit tests can only assert the stamped
  >       `sf-ed-f--half` / `sf-ed-f--full` modifier per named field; whether the grid actually
  >       places them two-up is a CSS outcome. Compare against **S102/S103** by eye.
  >
  > Note the enum cell's **native chrome is a recorded divergence** (2026-08-05, user) and is
  > explicitly **not** a defect in this comparison.
