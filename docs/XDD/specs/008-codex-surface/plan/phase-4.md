---
title: "Phase 4: The Codex grid and Cards"
status: pending
version: "1.0"
phase: 4
---

# Phase 4: The Codex grid and Cards

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: PRD/F3]` — collections, 10 ACs · `[ref: PRD/F4]` — Cards, 9 ACs
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

---

## Tasks

Turns the placeholder Codex tab into the surface the plugin has been circling since M4.

- [ ] **T4.1 Codex tab body and collection pills** `[activity: frontend-ui]`

  1. Prime: Mockup **S91**; `[ref: SDD/Building Block View]`. Reuse `CollapseStore`/scope-key
     patterns from the existing host rather than inventing state handling.
  2. Test: pills render for enabled collections in order; the first enabled one is selected on open
     `[ref: PRD/F3 AC]`; a disabled collection has **no pill** `[ref: PRD/F7 AC]`; switching
     collection re-renders the grid; selection state survives a follow re-render.
  3. Implement: `src/codex/codexTab.ts` (body) — hosted by both the Anvil and, in compact form, the
     Workbench.
  4. Validate: unit tests over rendered DOM; lint; types.
  5. Success:
     - [ ] Pills reflect exactly the enabled collections `[ref: SDD/AC — PRD F3]`

- [ ] **T4.2 `CardRenderer` contract and the registry** `[activity: domain-modeling]`

  1. Prime: `[ref: SDD/ADR-30]`; read `src/bases/BasesAdapter.ts` for the registration seam and its
     WeakMap caching (`registerBasesView` must be called **once at load**, before the registry is
     populated — `[ref: SDD/Implementation Gotchas]`).
  2. Test: a Card renders identically from a native entry and from a `BasesEntry`-shaped entry (one
     assertion set, two adapters); an unknown Card id falls back to Hero rather than rendering
     nothing; **a Card reading a field an entry lacks omits that part — never `undefined` in the
     DOM** `[ref: PRD/F4 AC]`.
  3. Implement: `src/codex/cardRegistry.ts` — the contract plus a normalised entry shape.
  4. Validate: unit tests; lint; types.
  5. Success:
     - [ ] One Card implementation serves both backends `[ref: SDD/ADR-30]`

- [ ] **T4.3 The three built-in Cards** `[activity: frontend-ui]` `[parallel: true]`

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

- [ ] **T4.4 Card selector, persisted per collection** `[activity: frontend-ui]`

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

- [ ] **T4.5 Bases backend registration** `[activity: integration]`

  1. Prime: `[ref: ADR-0001 §Decision 2]`; `src/bases/BasesAdapter.ts`; `[ref: SDD/CON-6]` — Bases
     typings stay behind `basesConfig.ts`.
  2. Test: three view types register when Bases is available; `isBasesAvailable()` false ⇒
     **registration is skipped and the native backend renders** `[ref: PRD/F4 AC]`; the view type
     survives `onDataUpdated` with a changed entry set; teardown unregisters cleanly (no leak).
  3. Implement: register `story-forge-hero` / `-table` / `-compact` alongside the existing
     `story-forge-codex`.
  4. Validate: unit tests with the Bases mock — **verify the mock matches `obsidian.d.ts`**, since a
     hand-rolled mock has previously hidden a real crash; lint; types.
  5. Success:
     - [ ] Cards are selectable inside a user's own `.base` `[ref: SDD/AC — PRD F4]`

- [ ] **T4.6 Empty state and the Bases hint** `[activity: frontend-ui]`

  1. Prime: Mockup **S98**; `[ref: ADR-36]`.
  2. Test: an empty collection **names the tag it looked for** and offers *Set up my vault…* and
     *Change tag* `[ref: PRD/F3 AC]`; a misconfigured (empty-tag) collection says so rather than
     listing notes `[ref: PRD/F3 AC]`; **Bases present-but-disabled** shows one dismissible hint and
     dismissal is permanent `[ref: PRD/F4 AC]`; **Bases absent** and **any community plugin absent**
     show **no prompt at all** `[ref: PRD/F4 AC]`.
  3. Implement: empty-state component; `dismissedHints` in settings.
  4. Validate: unit tests covering the four plugin-availability combinations; lint; types.
  5. Success:
     - [ ] Core may be suggested once; community is never nagged `[ref: SDD/AC — PRD F4]`

- [ ] **T4.7 Phase Validation** `[activity: validate]`

  - Run all Phase 4 tests. Manual walk on `test/StoryForge/`: open the Anvil's Codex, switch
    collections and Cards, confirm the choice survives a reload, then **disable Bases and repeat** —
    the grid must still work. `npm test`, `npm run lint`, `npm run typecheck`, `npm run build` green.
