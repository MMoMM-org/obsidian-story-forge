---
title: "Phase 4: The Codex grid and Cards"
status: completed
version: "1.0"
phase: 4
---

# Phase 4: The Codex grid and Cards

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: PRD/F3]` — collections, 10 ACs · `[ref: PRD/F4]` — Cards, 9 ACs
- `[ref: PRD/F2]` — navigation. **This phase is the `cardBody` marker's first producer** (recorded
  2026-07-31): Phase 2 resolves and unit-tests the kind, but no surface emits it, so two F2 matrix
  rows and the name-over-card-body precedence AC are unreachable from a real click until the grid
  exists. T4.1 owns emitting it.
- `[ref: SDD/ADR-30]` — one contract, two backends, all three Cards
- `[ref: SDD/ADR-36]` — core may be suggested, community never
- Mockups **S91** (grid, Card selector), **S93** (user collections), **S97** (a user's Card),
  **S98** (empty state)

**Key Decisions**:
- **ADR-30** — every built-in Card is written **once** against a normalised entry shape, with a thin
  adapter for the Bases backend and one for the native backend.
- **ADR-36** — a hint may appear only when Bases is **present but disabled**; a missing community
  plugin produces silence.

**Dependencies**: **Phase 1** (T1.1 resolver), **Phase 2** (the tab), **Phase 3** (records, settings).

**Ships**: the headline increment — a working Codex. Cards, collections, selection, empty states.
Editing arrives in Phase 5; until then selecting a card is a no-op with a visible selected state.

**Also owns the note index and the `TFile` adaptation** (added 2026-07-30 at the Phase 1 close-out).
The SDD originally said the resolver returns `TFile[]`; T1.1 shipped it **pure** — it takes an
injected `IndexedNote[] {path, tags}` and returns a `CollectionResolution`, so it needs no vault and
is testable without one. That was right for the model layer and the SDD has been corrected to match.
It leaves two jobs here, because Phase 4 is the first phase that actually has an `App`:

- **build the note index** from `metadataCache` (path + normalized tags) and feed it to the resolver,
  keeping it current as notes change;
- **adapt `path` → `TFile`** for card rendering, which needs the file and its frontmatter.

Neither belongs in the pure layer; both are load-bearing for T4.1/T4.3, so plan them explicitly
rather than discovering them mid-task.

---

## Tasks

Turns the placeholder Codex tab into the surface the plugin has been circling since M4.

- [x] **T4.1 Codex tab body and collection pills** `[activity: frontend-ui]`

  1. Prime: Mockup **S91**; `[ref: SDD/Building Block View]`. Reuse `CollapseStore`/scope-key
     patterns from the existing host rather than inventing state handling.
  2. Test: pills render for enabled collections in order; the first enabled one is selected on open
     `[ref: PRD/F3 AC]`; a disabled collection has **no pill** `[ref: PRD/F7 AC]`; switching
     collection re-renders the grid; selection state survives a follow re-render.

     Also — the F2 markers this surface is the first to produce `[ref: PRD/F2 AC]`:
     **a card / row body carries the marker that classifies as `cardBody`**, so a plain click on it
     resolves to inspect and a modifier click to open-note; **a name inside that body carries the
     `name` marker**; and **clicking the name wins over the surrounding card body** — which must
     hold by *proximity* (the name is nearer the event target), not by any added special case
     `[ref: SDD/ADR-28]`.

     > Until this task, `cardBody` is resolved and unit-tested in `navigationController.ts` while
     > **no host emits it** — the two matrix rows and the precedence AC pass in isolation and are
     > unreachable in the running plugin. Emit the marker via the host's `markerKindOf`, and assert
     > the precedence through the real walk (`walkTargetMarkers`), not by hand-building a marker
     > array — a hand-built array cannot catch the nesting order being wrong in the markup.

  3. Implement: `src/codex/codexTab.ts` (body) — hosted by both the Anvil and, in compact form, the
     Workbench; extend the host's `markerKindOf` vocabulary with the card-body marker.
  4. Validate: unit tests over rendered DOM; lint; types.
  5. Success:
     - [ ] Pills reflect exactly the enabled collections `[ref: SDD/AC — PRD F3]`

- [x] **T4.2 `CardRenderer` contract and the registry** `[activity: domain-modeling]`

  1. Prime: `[ref: SDD/ADR-30]`; read `src/bases/BasesAdapter.ts` for the registration seam and its
     WeakMap caching (`registerBasesView` must be called **once at load**, before the registry is
     populated — `[ref: SDD/Implementation Gotchas]`).
  2. Test: a Card renders identically from a native entry and from a `BasesEntry`-shaped entry (one
     assertion set, two adapters); an unknown Card id falls back to Hero rather than rendering
     nothing; **a Card reading a field an entry lacks marks it as not set — never `undefined` in the
     DOM** `[ref: PRD/F4 AC]`.

     > **Corrected 2026-08-03 (during T4.2).** This line previously read "omits that part", which
     > contradicts both the PRD and the signed-off mockup. PRD/F4 specifies an **absent** property
     > renders **marked as not set** — a red tint **plus** a short visible label **plus** a tooltip,
     > so the marking never depends on colour alone — and the mockup implements exactly that as
     > `.miss` (`<b>name</b> <i>not set</i>`, `title="This property does not exist in this note"`,
     > v5, figures S91/S97). A property that **exists but is blank** renders normally; `null`, `""`
     > and `[]` are **not** distinguished from one another. The mockup also records that "this note
     > is missing the property" and "this Card does not fit this collection" are **deliberately the
     > same marking**. The plan text was a lossy paraphrase; the PRD and the mockup are the
     > authorities. **T4.2 preserves the distinction** (`CardField.present`); **T4.3 renders it.**
  3. Implement: `src/codex/cardRegistry.ts` — the contract plus a normalised entry shape.
  4. Validate: unit tests; lint; types.
  5. Success:
     - [ ] One Card implementation serves both backends `[ref: SDD/ADR-30]`

- [x] **T4.3 The three built-in Cards** `[activity: frontend-ui]` `[parallel: true]`

  > **Recorded 2026-08-03 at the T4.3 review — one deviation refused, one gap deferred.** Both were
  > raised *after* coding rather than before, which the mockup gate forbids; both are now decisions
  > in the spec README rather than code comments.
  > - **Hero follows S91 exactly.** An alternative layout splitting facts and relation pills into two
  >   separate rows was built, judged defensible on the merits, and **rejected by the user** — a
  >   generalisation past the signed-off design needs its own mockup sign-off. S91's four stacked
  >   elements (name · middot-joined facts line · flex-wrap pill row · scene line) are the spec.
  > - **The scene-count line (`.hx`, "12 scenes") is NOT built and no Phase 4 task owns it.** It is a
  >   computed backlink count; `CardEntry` exposes only `path`/`name`/`field(id)`, so it would require
  >   reopening the T4.2 contract that T4.3/T4.4/T4.5 depend on **and** a backlink query the Codex
  >   does not run. Deferred to a later spec with a computed-stats seam. Do **not** stub it here, and
  >   do not render an empty element in its place.

  1. Prime: Mockup **S91** (Hero) and **S97** (the same Hero over a user's fields). Reuse
     `portraitTile` / `imageTile` / `factRow` from `src/panel/components.ts` so Cards and panel share
     one visual language `[ref: SDD/User Interface & UX]`.
  2. Test: Hero shows image-or-monogram, name, key facts and relation pills `[ref: PRD/F4 AC]`;
     Table and Compact render the same entries at different densities; **an entry with none of the
     expected fields still renders its name** (the S97 case, where fields are the user's own).
  3. Implement: `src/codex/cards/{heroCard,tableCard,compactCard}.ts`.
  4. Validate: unit tests; lint; stylelint for the new `sf-cx-*` classes; types.
  5. Success:
     - [ ] All three Cards exist and are selectable `[ref: SDD/AC — PRD F4]`

- [x] **T4.4 Card selector, persisted per collection** `[activity: frontend-ui]`

  1. Prime: Mockup **S91** (closed) and **S97** (open, Built-in / Yours split);
     `[ref: SDD/Data Storage Changes]` — `cardByCollection` is operational state (CON-2).
  2. Test: picking a Card re-renders the same entries and **writes no frontmatter**
     `[ref: PRD/F4 AC]`; the choice is remembered **per collection** — Characters Hero while Lore is
     Table `[ref: PRD/F4 AC]`; an imported Card appears under a heading distinguishing it from
     built-ins `[ref: PRD/F4 AC]`.
  3. Implement: selector in the Codex header; persistence via settings.
  4. Validate: unit tests; lint; types.
  5. Success:
     - [ ] Per-collection memory works across a reload `[ref: SDD/AC — PRD F4]`

- [x] **T4.5 Bases backend registration** `[activity: integration]`

  > **GATE, added 2026-08-03 at the T4.2 close-out — this task owns closing the Bases
  > blank-vs-absent gap.** `BasesEntry.getValue()` returns `Value | null`, and `null` means **both**
  > "the property is absent" and "the property exists but is blank" — `Value` exposes nothing that
  > tells them apart (`toString`, `isTruthy`, `renderTo`). So on the Bases backend alone, a
  > blank-but-present property currently reads as absent and T4.3's `.miss` treatment would **wrongly
  > mark it**. PRD/F4 requires exactly this distinction (an existing-but-blank property renders
  > normally; only an absent one is marked). T4.2 preserved the distinction in `CardField.present`
  > and documented the asymmetry in `basesCardEntry`'s docstring, but **could not close it — it has
  > no `App`**. This task does. Close it by deciding presence from
  > `metadataCache.getFileCache(entry.file)?.frontmatter` while still taking the **display form**
  > from `Value`; it needs one added parameter on `basesCardEntry`. Recorded as a gate with an owner
  > because Phase 3's close-out established that a documented hazard with a *phantom* owner is
  > itself the defect.
  >
  > Also fold in here: `src/codex/CodexView.ts:33` still declares `CODEX_VIEW_TYPE` outside
  > `src/pluginConstants.ts`. The SDD Directory Map flags it **"consolidate before T4.5"**, and this
  > task's own step 3 forbids a fourth copy of the id literal — so consolidate it as part of this
  > task rather than leaving a second declaration site free to drift (CON-4).
  >
  > **Clarified 2026-08-04, before dispatch — "consolidate" means move the declaration, NOT merge the
  > ids.** The TDD gate checked this and found the two are **not** duplicates:
  > `CODEX_VIEW_TYPE = "story-forge-codex-host"` is the thin **degrade `ItemView`** shown when Bases
  > is off, while `CODEX_VIEW_ID = "story-forge-codex"` is the **Bases polymorphic view type**. Two
  > ids, two purposes. Merging them would break the degrade path and change a frozen id string, which
  > CON-4 forbids outright. What is required is only that **both constants are declared in
  > `src/pluginConstants.ts`**, keeping their existing distinct values, so neither has a second
  > declaration site free to drift. Register the new `story-forge-hero`/`-table`/`-compact` ids the
  > same way — declared there, imported everywhere.

  1. Prime: `[ref: ADR-0001 §Decision 2]`; `src/bases/BasesAdapter.ts`; `[ref: SDD/CON-6]` — Bases
     typings stay behind `basesConfig.ts`.
  2. Test: three view types register when Bases is available; `isBasesAvailable()` false ⇒
     **registration is skipped and the native backend renders** `[ref: PRD/F4 AC]`; the view type
     survives `onDataUpdated` with a changed entry set; teardown unregisters cleanly (no leak).
  3. Implement: register `story-forge-hero` / `-table` / `-compact` alongside the existing
     `story-forge-codex`. **Import `CODEX_VIEW_ID` from `src/pluginConstants.ts` — do not declare a
     fourth copy of the literal.** It is now the single declaration site, already imported by
     `BasesAdapter.ts`, `baseGenerator.ts` and `CodexBasesView.ts`; a copy here would be free to
     drift and would orphan every `.base` referencing the id (CON-4).
  4. Validate: unit tests with the Bases mock — **verify the mock matches `obsidian.d.ts`**, since a
     hand-rolled mock has previously hidden a real crash; lint; types.
  5. Success:
     - [ ] Cards are selectable inside a user's own `.base` `[ref: SDD/AC — PRD F4]`
     - [ ] A **blank-but-present** property renders normally on the **Bases** backend, not marked as
           not set — the same as on the native backend `[ref: PRD/F4 AC]`
     - [ ] `CODEX_VIEW_TYPE` has exactly one declaration site, in `src/pluginConstants.ts` (CON-4)

- [x] **T4.6 Empty state and the Bases hint** `[activity: frontend-ui]`

  1. Prime: Mockup **S98**; `[ref: ADR-36]`.
  2. Test: an empty collection **names the tag it looked for** and offers **Change tag** and
     **What are FileClasses?** `[ref: PRD/F3 AC]`; a misconfigured (empty-tag) collection says so
     rather than listing notes `[ref: PRD/F3 AC]`; **Bases present-but-disabled** shows one
     dismissible hint and dismissal is permanent `[ref: PRD/F4 AC]`; **Bases absent** and **any
     community plugin absent** show **no prompt at all** `[ref: PRD/F4 AC]`.

     > **Corrected 2026-08-04, before dispatch — the actions are `Change tag` and
     > `What are FileClasses?`, NOT *Set up my vault…*.** This line previously named *Set up my
     > vault…*, which the signed-off mockup **explicitly withdraws**: S98's own caption states that
     > "seeding the vault is out of scope and lives entirely in **#27**" and that "the *Set up my
     > vault…* action **returns with #27**". S98 shows a heading ("No characters found"), a line
     > naming the tag ("This collection looks for notes tagged `canon/character`. Nothing matched."),
     > a **primary `Change tag`** opening settings at that collection, and a secondary
     > **`What are FileClasses?`** opening documentation. The mockup is the authority over the plan's
     > paraphrase. Do **not** build a seeding/wizard action.

     > **Resolved 2026-08-04, before dispatch — how to tell "Bases disabled" from "Bases absent".**
     > The TDD gate correctly BLOCKED on this: `isBasesAvailable()` returns `false` for **both**
     > states, so ADR-36's rule ("a hint only when Bases is *present but disabled*") was not
     > implementable as written. **Do not** solve it by reading `app.plugins` / `app.internalPlugins`
     > — neither is in `obsidian.d.ts`, and reaching for them means an `as unknown as` cast on `app`,
     > which is the exact red flag that has already hidden one real bug in this repo.
     >
     > Use the **public** `apiVersion` export (`obsidian.d.ts:400`) instead. ADR-36's own rationale
     > is the key: **"Bases is enabled, not installed"** — it is a *core* plugin that ships with
     > Obsidian, so on any version that has it, it is always *present*. Declare a documented constant
     > for the Obsidian version in which Bases became core, compare `apiVersion` against it, and
     > derive: `present && !available` → show the dismissible hint; `!present` → silence. **Verify
     > the actual version Bases shipped** rather than trusting a guess, and note that this plugin's
     > `manifest.json` already sets `minAppVersion: 1.12.7`, so in every supported configuration
     > Bases is present and the silence branch is effectively unreachable — implement it honestly
     > anyway, so ADR-36 is satisfied as written rather than by accident.
     >
     > **Version established (2026-08-04), sourced not guessed:** spec 005's own SDD records Bases as
     > "core plugin, **GA ~1.9.10**", and `obsidian.d.ts` documents `registerBasesView` as
     > **`@since 1.10.0`**. Use `1.10.0` as the constant — the release in which the API this plugin
     > actually calls became available — and note `minAppVersion: 1.12.7` sits safely above it.
     >
     > **Mock gap that must be closed FIRST — this is load-bearing.** `test/__mocks__/obsidian.ts`
     > does **not** currently export `apiVersion`, so none of the four availability combinations can
     > be tested until it does. Add it as a mutable module export (default a current version) so
     > tests can stub an older Obsidian per-case. Treat this as part of the task, not an aside: this
     > phase has already shipped one mock whose divergence from the real API hid a live defect, so a
     > *missing* export that silently makes a branch untestable is the same failure in a quieter form.
  3. Implement: empty-state component; `dismissedHints` in settings.
  4. Validate: unit tests covering the four plugin-availability combinations; lint; types.
  5. Success:
     - [ ] Core may be suggested once; community is never nagged `[ref: SDD/AC — PRD F4]`

- [x] **T4.7 Phase Validation** `[activity: validate]`

  - Run all Phase 4 tests. Manual walk on `test/StoryForge/`: open the Anvil's Codex, switch
    collections and Cards, confirm the choice survives a reload, then **disable Bases and repeat** —
    the grid must still work. `npm test`, `npm run lint`, `npm run typecheck`, `npm run build` green.

  > **Amended 2026-08-04 — the gate list above is incomplete and that gap already let a regression
  > through.** T4.5 reported "typecheck clean" against `npm run typecheck` alone while
  > **`typecheck:test` and `typecheck:mock` both failed**, because the main tsconfig resolves
  > `obsidian` to the real typings and the other two resolve it to the hand-rolled mock. The full
  > gate set is: **`npm test`, `npm run lint`, `npm run typecheck`, `npm run typecheck:test`,
  > `npm run typecheck:mock`, `npm run build`, and `npm run schema:check`** (CON-5's drift gate, which
  > must stay green). Run every one and paste the output.
  >
  > **Additions to the manual walk, from what Phase 4 actually shipped:**
  > - the **Card selector** — pick per collection, confirm Characters can be Hero while Lore is
  >   Table, and that both survive a reload;
  > - **click-outside-to-dismiss** on the selector dropdown, including the path that motivated it:
  >   open the dropdown, then click a **card body** (which drills without re-rendering);
  > - the **empty state** — confirm it names the searched tag and offers `Change tag` and
  >   `What are FileClasses?`. Note `Change tag` opens Settings at the plugin tab, **not** scrolled to
  >   a specific collection: per-collection settings UI does not exist until Phase 7, so the S98
  >   caption's "opens settings at that collection" is satisfied as closely as the current codebase
  >   allows. Eyeball it once and confirm it is not misleading.
  > - the **Bases hint** — present-but-disabled shows one dismissible hint and dismissal survives a
  >   reload. The **"Bases absent"** branch **cannot be observed live**: `manifest.json`'s
  >   `minAppVersion: 1.12.7` is above the `1.10.0` in which `registerBasesView` appeared, so every
  >   supported install has Bases present. It is covered only synthetically via the mock's
  >   `_setApiVersion`. Do not report it as manually verified.
  > - **a blank-but-present property on the Bases backend** renders normally rather than marked as
  >   not set — the T4.5 gate's whole point, and the one behaviour that differs between backends if
  >   it regresses.
