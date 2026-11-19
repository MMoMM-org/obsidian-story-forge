---
title: "Phase 2: Setup core"
status: completed
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

**Decisions taken during implementation**:
- T2.1 and T2.5, then T2.2 and T2.4, ran in parallel (separate files). Each implementer staged
  only its own files.
- T2.1: the new folder settings reject whitespace-only values; `fileClassesFolder` predates that
  and is unchanged. One shared guard/normaliser.
- T2.2: `createDataFile(port)` is the one queue for data.json; settings, ViewStore and
  ArtifactStore use `plugin.dataFile`. `ViewStore` still accepts a bare port (it then gets a
  private queue) so existing test setups did not change; production passes the shared queue and
  a test pins that.
- T2.3: `ArtifactStore` drops malformed records on load and on every rewrite; `onChange` fires
  after a successful save, listeners isolated.
- T2.4: every writer function takes `app`; `write` creates parent folders itself; catalog
  rollback trashes (user's trash setting) instead of `adapter.remove`; the catalog's
  adopt-identical compares bytes (the source is checksum-verified first).
- T2.5: new plan action `refused` (index checksum mismatch); notes joined with "; ".
- T2.6: `executePlan(plan, folders, {app, store, pluginVersion})`, never throws. create/missing
  use `createNew` (atomic `vault.create`); update uses `write` with previous-bytes check and undo.
  Each create/missing item's own parent folder is ensured once; update items never fail on a
  folder. Right before writing: occupied or edited → skipped, vanished update → failed. A source
  checksum mismatch at write time → failed. Undo failures are appended to the reason.
- Phase-2 drift check: update and missing items resolve with their record's `params`, create
  items with the current folders (fix in executePlan); the dialog passes a missing item only when
  the user ticks it (Phase 3, PRD F4.5).
- T2.7: `artifactStore.load()` runs in onload after `loadSettings` (read-only). The bundle check
  is strict under `CI`; locally it skips a missing or stale `build/main.js`.

**Dependencies**: Phase 1 (index, resolver).

---

## Tasks

Delivers a safe, fully tested engine that can plan and perform setup and update, and moves the
catalog onto the same writer.

- [x] **T2.1 Folder settings** `[activity: domain-modeling]` `[parallel: true]`

  1. Prime: `src/types/index.ts` (`PluginSettings`, `normalizeSettings`, guards)
     `[ref: SDD/Data Storage Changes]`
  2. Test: `templatesFolder` and `schemaFolder` default to `00 Meta/Templates` and
     `00 Meta/Schema`; invalid or missing values fall back to defaults; existing settings load
     unchanged
  3. Implement: Add both keys with guards and normalisation
  4. Validate: Settings tests pass; mutation-check
  5. Success: One folder setting per artifact set exists `[ref: PRD/F3.1]`

- [x] **T2.2 Serialised data.json saves** `[activity: data-architecture]`

  1. Prime: `src/main.ts` `saveSettings`, `src/store/ViewStore.ts`, `src/store/types.ts`
     `[ref: SDD/Implementation Gotchas; serialise]` `[ref: SDD/Known Technical Issues]`
  2. Test: Two concurrent saves (settings + views, views + artifacts) both survive; a failing
     save does not block the queue; load still tolerates unknown keys
  3. Implement: One save queue for every read-modify-write of `data.json`; settings and
     ViewStore route through it
  4. Validate: Store and settings suites pass unchanged; mutation-check the race test
  5. Success: No lost update across the three writers `[ref: SDD/ADR-40 trade-offs]`

- [x] **T2.3 ArtifactStore** `[activity: data-architecture]`

  1. Prime: `[ref: SDD/ADR-40]` `[ref: SDD/Data Storage Changes]`
  2. Test: Missing `artifacts` key reads as `{}`; malformed entries (missing checksum, non-string
     path, unknown params) are dropped, valid ones kept; set/delete persist through the queue;
     the store never appears in `views`
  3. Implement: `src/artifacts/ArtifactStore.ts`; `StoryForgeData.artifacts` in
     `src/store/types.ts`
  4. Validate: Unit tests; mutation-check each guard
  5. Success: Records are operational state in data.json `[ref: PRD/F4 Rule 6]`
     `[ref: PRD/F5.9]`

- [x] **T2.4 managedFileWriter and catalog migration** `[activity: backend]`

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
     - [x] Every vault write goes through the Vault API `[ref: PRD/F6.4]`
     - [x] Catalog behaviour preserved `[ref: SDD/Implementation Boundaries]`

- [x] **T2.5 planSetup** `[activity: domain-modeling]`

  1. Prime: `[ref: SDD/Application Data Models; decision table]` `[ref: PRD/F4]`
  2. Test: One test per decision-table row (create, skip-exists, missing, up-to-date, update,
     skip-edited, unreadable); identical bytes at a free target without record → skip-exists;
     record path differs from current setting → item targets the record path with the "setting
     now points to …" note; deselected sets produce no items; checksum mismatch of an index
     entry → refused
  3. Implement: `src/artifacts/planSetup.ts` (pure)
  4. Validate: Table-driven tests; each row mutation-checked
  5. Success:
     - [x] Non-owned file never changed `[ref: PRD/F4.1]`
     - [x] Unedited updated, edited refused `[ref: PRD/F4.3; PRD/F4.4]`
     - [x] Deleted or moved file reported missing, not recreated `[ref: PRD/F4.5]`
     - [x] Unchanged shipped file not offered `[ref: PRD/F4.6]`
     - [x] Changed setting after setup handled `[ref: PRD/F3.4]`

- [x] **T2.6 executePlan** `[activity: backend]`

  1. Prime: `[ref: SDD/Primary Flow]` `[ref: SDD/Error Handling]`
  2. Test: Writes create/update/missing items in order, records each after its write; skips
     others; a write failure leaves earlier items written and recorded and reports the failure
     with its path; a record failure undoes that write; folder creation failure fails that
     items under that parent folder only (per-parent since the T2.6 review); result lists written, skipped (with reason), failed; resolves placeholders
     with the folders the plan used and stores them as `params`
  3. Implement: `src/artifacts/executePlan.ts`
  4. Validate: Unit tests with the vault mock; mutation-check
  5. Success:
     - [x] Missing folders created `[ref: PRD/F2.8]`
     - [x] Partial failure never claims a write `[ref: PRD/F4 Rule 5]`
     - [x] Files name the folders configured at setup `[ref: PRD/F5.8]`

- [x] **T2.7 No write on load** `[activity: backend]`

  1. Prime: `src/main.ts` `onload`/`onLayoutReady`
  2. Test: Loading the plugin with an empty vault performs zero vault writes (create, modify,
     createFolder spies)
  3. Implement: Wire `ArtifactStore` and the index (`src/artifacts/artifactIndex.ts`) in `main.ts`
     without any write path on load; check the built `main.js` contains the index entries
     (PRD F1.1, moved here from T1.5)
  4. Validate: Integration test; mutation-check by adding a write on load
  5. Success: Nothing written unasked `[ref: PRD/F2.1]`

- [x] **T2.8 Phase validation** `[activity: validate]`

  - Run all tests, lint, typecheck ×3, build. Verify against ADR-40, ADR-41 and PRD F4.
