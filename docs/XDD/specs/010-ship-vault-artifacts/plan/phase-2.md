---
title: "Phase 2: Setup core"
status: pending
version: "1.0"
phase: 2
---

# Phase 2: Setup core

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: SDD/ADR-40]` — `data.json → artifacts`, `ArtifactStore`
- `[ref: SDD/ADR-41]` — `managedFileWriter`, catalog migration, no adoption for artifacts
- `[ref: SDD/Data Storage Changes]` — record shape, two new settings
- `[ref: SDD/Application Data Models]` — `PlanItem`, `planSetup` decision table
- `[ref: SDD/Internal API Changes]` — writer, `planSetup`, `executePlan`
- `[ref: SDD/Error Handling]`
- `[ref: SDD/Implementation Gotchas]` — serialise data.json saves; `createFolder`; record path
  wins; catalog adoption stays catalog-only
- `docs/XDD/adr/0003-generated-bases-two-checksums.md`

**Key Decisions**:
- Pure planning, thin execution: `planSetup` reads nothing itself; it gets index, records, file
  contents and folders.
- Refusal wording and prefixes are the catalog's (`Not installed:` / `Not updated:`).
- Vault files are written only through the Vault API (CON-3).
- No UI in this phase.

**Dependencies**: Phase 1 (index, resolver).

---

## Tasks

Delivers a safe, fully tested engine that can plan and perform setup and update, and moves the
catalog onto the same writer.

- [ ] **T2.1 Folder settings** `[activity: domain-modeling]` `[parallel: true]`

  1. Prime: `src/types/index.ts` (`PluginSettings`, `normalizeSettings`, guards)
     `[ref: SDD/Data Storage Changes]`
  2. Test: `templatesFolder` and `schemaFolder` default to `00 Meta/Templates` and
     `00 Meta/Schema`; invalid or missing values fall back to defaults; existing settings load
     unchanged
  3. Implement: Add both keys with guards and normalisation
  4. Validate: Settings tests pass; mutation-check
  5. Success: One folder setting per artifact set exists `[ref: PRD/F3.1]`

- [ ] **T2.2 Serialised data.json saves** `[activity: data-architecture]`

  1. Prime: `src/main.ts` `saveSettings`, `src/store/ViewStore.ts`, `src/store/types.ts`
     `[ref: SDD/Implementation Gotchas; serialise]` `[ref: SDD/Known Technical Issues]`
  2. Test: Two concurrent saves (settings + views, views + artifacts) both survive; a failing
     save does not block the queue; load still tolerates unknown keys
  3. Implement: One save queue for every read-modify-write of `data.json`; settings and
     ViewStore route through it
  4. Validate: Store and settings suites pass unchanged; mutation-check the race test
  5. Success: No lost update across the three writers `[ref: SDD/ADR-40 trade-offs]`

- [ ] **T2.3 ArtifactStore** `[activity: data-architecture]`

  1. Prime: `[ref: SDD/ADR-40]` `[ref: SDD/Data Storage Changes]`
  2. Test: Missing `artifacts` key reads as `{}`; malformed entries (missing checksum, non-string
     path, unknown params) are dropped, valid ones kept; set/delete persist through the queue;
     the store never appears in `views`
  3. Implement: `src/artifacts/ArtifactStore.ts`; `StoryForgeData.artifacts` in
     `src/store/types.ts`
  4. Validate: Unit tests; mutation-check each guard
  5. Success: Records are operational state in data.json `[ref: PRD/F4 Rule 6]`
     `[ref: PRD/F5.9]`

- [ ] **T2.4 managedFileWriter and catalog migration** `[activity: backend]`

  1. Prime: `src/catalog/CatalogService.ts` (`_readExisting`, `_editedRefusal`,
     `_occupiedRefusal`, `_materialise`, `_undoWrite`, `describeRefusal`),
     `test/catalog/CatalogService.test.ts`, `test/__mocks__/obsidian` (must match obsidian.d.ts)
     `[ref: SDD/ADR-41]` `[ref: SDD/Internal API Changes]`
  2. Test: Writer: read existing / absent / unreadable; `ensureFolder` creates every missing
     level and tolerates existing ones; write creates or replaces via the Vault API; undo
     restores previous content or trashes a new file; occupied refusal never adopts unless
     `adoptIdentical`; refusal strings unchanged. Catalog suite passes with the same
     expectations, mocks moved from adapter to vault
  3. Implement: `src/vault/managedFileWriter.ts`; CatalogService delegates its file IO to it
     with `adoptIdentical: true`
  4. Validate: Catalog e2e and BrowseOfficialModal tests green; no `vault.adapter` use for vault
     files left in `src/catalog/`; mutation-check the writer
  5. Success:
     - [ ] Every vault write goes through the Vault API `[ref: PRD/F6.4]`
     - [ ] Catalog behaviour preserved `[ref: SDD/Implementation Boundaries]`

- [ ] **T2.5 planSetup** `[activity: domain-modeling]`

  1. Prime: `[ref: SDD/Application Data Models; decision table]` `[ref: PRD/F4]`
  2. Test: One test per decision-table row (create, skip-exists, missing, up-to-date, update,
     skip-edited, unreadable); identical bytes at a free target without record → skip-exists;
     record path differs from current setting → item targets the record path with the "setting
     now points to …" note; deselected sets produce no items; checksum mismatch of an index
     entry → refused
  3. Implement: `src/artifacts/planSetup.ts` (pure)
  4. Validate: Table-driven tests; each row mutation-checked
  5. Success:
     - [ ] Non-owned file never changed `[ref: PRD/F4.1]`
     - [ ] Unedited updated, edited refused `[ref: PRD/F4.3; PRD/F4.4]`
     - [ ] Deleted or moved file reported missing, not recreated `[ref: PRD/F4.5]`
     - [ ] Unchanged shipped file not offered `[ref: PRD/F4.6]`
     - [ ] Changed setting after setup handled `[ref: PRD/F3.4]`

- [ ] **T2.6 executePlan** `[activity: backend]`

  1. Prime: `[ref: SDD/Primary Flow]` `[ref: SDD/Error Handling]`
  2. Test: Writes create/update/missing items in order, records each after its write; skips
     others; a write failure leaves earlier items written and recorded and reports the failure
     with its path; a record failure undoes that write; folder creation failure fails that
     set's items only; result lists written, skipped (with reason), failed; resolves placeholders
     with the folders the plan used and stores them as `params`
  3. Implement: `src/artifacts/executePlan.ts`
  4. Validate: Unit tests with the vault mock; mutation-check
  5. Success:
     - [ ] Missing folders created `[ref: PRD/F2.8]`
     - [ ] Partial failure never claims a write `[ref: PRD/F4 Rule 5]`
     - [ ] Files name the folders configured at setup `[ref: PRD/F5.8]`

- [ ] **T2.7 No write on load** `[activity: backend]`

  1. Prime: `src/main.ts` `onload`/`onLayoutReady`
  2. Test: Loading the plugin with an empty vault performs zero vault writes (create, modify,
     createFolder spies)
  3. Implement: Wire `ArtifactStore` and the index (`src/artifacts/artifactIndex.ts`) in `main.ts`
     without any write path on load; check the built `main.js` contains the index entries
     (PRD F1.1, moved here from T1.5)
  4. Validate: Integration test; mutation-check by adding a write on load
  5. Success: Nothing written unasked `[ref: PRD/F2.1]`

- [ ] **T2.8 Phase validation** `[activity: validate]`

  - Run all tests, lint, typecheck ×3, build. Verify against ADR-40, ADR-41 and PRD F4.
