---
title: "Phase 8: Integration, degradation and gates"
status: in_progress
version: "1.0"
phase: 8
---

# Phase 8: Integration, degradation and gates

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: PRD/Success Metrics]` — the four verifiable criteria that replace KPIs
- `[ref: SDD/Quality Requirements]`, `[ref: SDD/Acceptance Criteria]` (all EARS)
- `[ref: PRD/Risks]` — partial delivery, format coupling, lost hardcoded behaviour, migration

**Key Decisions**:
- Success is **not** telemetry. It is: every AC passing, no regression in the moved management tabs,
  **one demonstrated extension**, and independence from every optional plugin.

**Dependencies**: **Phases 6 and 7** (and therefore all of 1–5).

**Ships**: the release-ready surface, with the guarantees written down rather than assumed.

---

## Tasks

Proves the spec end to end, including the parts that are easy to claim and hard to demonstrate.

- [x] **T8.1 The demonstrated extension** `[activity: integration]`

  1. Prime: `[ref: PRD/Success Metrics]` — *"a FileClass and a `.base` written by hand, without
     changing plugin code, produce a working new Codex collection with a typed, sectioned editor"*.
     This is the single metric that decides whether the extensibility contract is real.
  2. Test: an integration test that, using **only** vault fixtures (a new `fc-organization.md` and an
     `Organizations.base`), asserts: the collection appears as a pill; its entries render with the
     Hero Card; selecting one opens the editor with a section labelled from the new FileClass; its
     `Select` field offers the declared values; a commit writes a plain Property. **No production
     source file may be modified for this test to pass** — assert that in review.
  3. Implement: fixtures under `test/` plus the integration test.
  4. Validate: the test passes on a clean checkout of the phase; lint; types.
  5. Success:
     - [x] The isekai case works without a release `[ref: PRD/Success Metrics]`

- [x] **T8.2 The degradation matrix** `[activity: integration]`

  1. Prime: `[ref: SDD/CON-3]`, `[ref: CON-9]`; `[ref: PRD/F8 AC]`.
  2. Test: a matrix over {Bases on / off / absent} × {Dataview present / absent} ×
     {metadata-menu present / absent} × {desktop / mobile}. In **every** cell: the Codex renders, the
     editor opens and commits, and **no prompt appears for a community plugin**. Bases-disabled
     shows at most one dismissible hint; mobile falls back to the native card renderer
     `[ref: SDD/CON-9]`.
  3. Implement: parametrised test suite over the availability flags.
  4. Validate: every cell green; lint; types.
  5. Success:
     - [x] Independence is proven by test, not asserted `[ref: PRD/Success Metrics]`

- [ ] **T8.3 Migration from a real legacy install** `[activity: integration]`

  1. Prime: `[ref: SDD/ADR-29]`; the fixture captured in T3.2.
  2. Test: a `data.json` captured from the **current** release migrates silently — collections keep
     working, no consent modal appears, no user file is overwritten; a legacy install whose vault
     `.base` was hand-edited adopts that content as the baseline **without a prompt**
     `[ref: SDD/ADR-29]`; running the migration twice is a no-op.
  3. Implement: the end-to-end migration test.
  4. Validate: green; lint; types.
  5. Success:
     - [ ] An existing user upgrades without losing anything `[ref: SDD/ADR-29]`

- [ ] **T8.4 Non-regression of the moved surfaces** `[activity: validate]`

  1. Prime: `[ref: PRD/Success Metrics]` — no regression in the management tabs;
     `[ref: SDD/Implementation Boundaries]`.
  2. Test: the full M5/M6 suite passes unchanged; a persisted workspace layout containing the old
     leaf still restores `[ref: SDD/CON-4]`; Kanban drag still writes `status` + `order` atomically;
     zoom, swimlanes and the Plotgrid coverage matrix behave as before.
  3. Implement: no production change expected — if one is needed, that is a regression to fix.
  4. Validate: full suite; lint; types; build.
  5. Success:
     - [ ] Moving the views cost nothing `[ref: PRD/Success Metrics]`

- [ ] **T8.5 Gates, live walk and finalize** `[activity: validate]`

  1. Prime: `docs/live-testing.md` — the manual walk format used for previous milestones.
  2. Test: every EARS criterion in `[ref: SDD/Acceptance Criteria]` maps to a passing test; every
     PRD AC maps to a task (traceability check).
  3. Implement: record the live-vault walk in `docs/live-testing.md`; move
     `docs/mockups/anvil-workbench-codex.html` into this spec directory as `mockups.html` and leave a
     pointer behind `[ref: spec README]`; close the covered issues (#6, #10, #11, #12, #13, #21, #26).
  4. Validate: `npm test`, `npm run lint`, `npm run typecheck`, `npm run typecheck:test`,
     `npm run typecheck:mock`, `npm run schema:check`, `npm run build`, `npm run test:live` — all
     green.
  5. Success:
     - [ ] Every AC has a passing test `[ref: PRD/Success Metrics]`
     - [ ] Truth preservation: every value written by the editor is visible and editable in the core
           Properties UI `[ref: PRD/Success Metrics]`
     - [ ] Spec phase set to Implemented with shipping notes `[ref: xdd-meta Finalize]`

---

## Decisions taken during implementation

- **T8.1** The extension is demonstrated with no production change:
  `git diff --name-only 918069d -- src styles.css infra` is empty. The fixtures sit in
  `test/fixtures/extension/` at the paths they would have in a vault: `fc-organization.md` (title
  "Organization profile", claimed by `tagNames: canon/organization`, a four-value `Select`, a
  `Number`), an `Organizations.base` that filters with `file.hasTag("canon/organization")`, and two
  organization notes. `test/integration/demonstrated-extension.test.ts` reads them off disk and
  loads the real plugin, with no module of ours mocked. It then imports the file through Settings ›
  Library › "+ Import from vault…", and goes from the Anvil pill to the editor to a commit.
  **The jsdom boundary is Bases itself.** The test asserts the fence the plugin hands to
  `MarkdownRenderer.render`: the user's tag filter, drawn as `story-forge-hero`. It then stands in
  for Bases in one place only: it builds the view the plugin registered for `story-forge-hero` in
  the container the plugin rendered into, and gives it the notes that carry the fence's tag.
  Evaluating `file.hasTag` is the only step the test does on Bases' behalf. The `extends` chain is
  not used: a standalone FileClass is the stricter case, because nothing it shows can come from a
  generated FileClass. Mutation-checked against 6 fixture and 10 production mutations, all killed.
  The "isekai case works without a release" box was ticked after the user walked it live on the seed vault (2026-11-17).
- **T8.2** `test/integration/degradationMatrix.test.ts` runs all 24 cells, each on the real plugin,
  with every flag set through the seam the plugin reads:
  - Bases on/off is what `registerBasesView` returns. Bases absent is `apiVersion` 1.9.0 with no
    `registerBasesView` at all.
  - Dataview is its API on `app.plugins`, with JavaScript queries on.
  - metadata-menu is the seed vault's `fc-character.md`, or no FileClass at all (tier 2).
  - Mobile is `Platform.isMobile`.

  Every cell also holds an imported `.base` and a DQL collection. One shared nag detector
  (`communityNags`) scans the Anvil, the Workbench, the Library and Notices.
  - **Defect found and fixed** (`95f7ed1`, wording approved by the user 2026-11-17). With Bases off
    or absent on desktop, the Library row of a `.base` read "○ Needs Dataview" and "Needs Dataview,
    which is not active.". `LibrarySection` mapped every `engine-missing` to Dataview, so a core
    plugin's collection was blamed on a community plugin. Eight cells failed on it. The row now
    reads "○ Needs Bases" (neutral) and "Needs the core Bases plugin, which is off.", followed by
    the "What optional plugins add…" link, the same pattern as S5. Dataview rows keep the S5
    wording.
  - **CON-9 is held by the ConsentGate**, not by a fallback in the Anvil. The built-ins draw with
    the native renderer on every platform, so there is no platform branch. A `.base` on mobile is
    never handed to Bases because `ConsentGate.evaluate` returns `platform-restricted` for it. That
    line is matrix mutation M3, killed in the four mobile cells with Bases on.
  - **Follow-up, not changed:** does current Obsidian run Bases on mobile? If it does, CON-9's
    premise (spec 007 ADR-10, "Bases surfaces are desktop-only") is out of date, and the
    `platform-restricted` rule for `.base` collections should be revisited.
  - **Left as is:** with Bases absent, the Anvil's text for a `.base` says the core Bases plugin "is
    turned off" (`codexEmptyState.ts`). That case is unreachable on `minAppVersion` 1.12.7.

---

## Deviation Log

*Record any deviation from PRD or SDD discovered during implementation, with rationale and approval,
per the plan's Deviation Protocol. Empty at plan time.*

| Date | Phase/Task | Deviation | Rationale | Approved |
|------|------------|-----------|-----------|----------|
| — | — | — | — | — |
