---
title: "Phase 1: View store"
status: completed
version: "1.0"
phase: 1
---

# Phase 1: View store

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: SDD/Building Block View — Application Data Models]` (ViewRecord, StoryForgeData, PluginDataPort)
- `[ref: SDD/Building Block View — Internal API]` (ViewStore methods)
- `[ref: SDD/ADR-1]` (mason clone, fail-closed, no migration) · `[ref: SDD/ADR-6]` (persist discipline)
- `[ref: PRD/Feature 4 — Persistent view-configuration store]`
- Reference: markdown-mason `src/scripts/store.ts` + `test/scripts/store.test.ts`

**Key Decisions**:
- Clone mason `store.ts` (rename script→view); flat `{id: ViewRecord}` map; **no schemaVersion/migration**; fail-closed `applyDefaults`; immediate save; injected `PluginDataPort`; add `engine` discriminant.

**Dependencies**: none — **independent of Phase 2 `[parallel: true]`**. Pure logic, no Obsidian view coupling.

---

## Tasks

Establishes the persistent view-configuration store that consent/enable state (M2+) will use.

- [x] **T1.1 View-record model & fail-closed defaults** `[activity: domain-modeling]` `[parallel: true]`

  1. Prime: Read the data-model + ADR-1 `[ref: SDD/Building Block View — Application Data Models]` `[ref: SDD/ADR-1]`
  2. Test (RED): `applyDefaults` fills missing → `{provenance:"curated", enabled:false, okayed:null, source:"", engine:"bases", command:false}`; malformed `okayed` (number/string/`{}`/missing checksum) → `null`; unknown `engine` → `"bases"`; `provenance` other than "imported" → "curated".
  3. Implement (GREEN): `src/store/types.ts` — `ViewRecord`, `StoryForgeData`, `PluginDataPort`; `applyDefaults`, `parseOkayed`, `isEngine`.
  4. Validate: unit tests pass; lint; typecheck.
  - Success: malformed record coerces to disabled + not-consented `[ref: PRD/Feature 4]`; shape matches SDD `[ref: SDD/ADR-1]`.

- [x] **T1.2 ViewStore (load / upsert / delete)** `[activity: data-architecture]` `[parallel: true]`

  1. Prime: Review the store API + persist discipline `[ref: SDD/Building Block View — Internal API]` `[ref: SDD/ADR-6]`
  2. Test (RED): `getViews()` maps every entry through defaults; `setRecord(id, rec)` round-trips after reload; sibling `settings` preserved on write; `deleteRecord(id)` removes it and absent id is a safe no-op; save fires exactly once per mutation (via fake `PluginDataPort`).
  3. Implement (GREEN): `src/store/ViewStore.ts` — `getViews`/`setRecord`/`deleteRecord` over injected `PluginDataPort` (read-modify-write).
  4. Validate: unit tests pass; lint; typecheck.
  - Success: round-trip + preserve-settings + delete-no-op `[ref: PRD/Feature 4]`; no persist outside mutations `[ref: SDD/ADR-6]`.

- [x] **T1.3 Phase Validation** `[activity: validate]`

  - Run all Phase 1 tests; `npm run lint`, `npm run typecheck`. Verify the record shape and fail-closed behaviour match SDD ADR-1 and PRD Feature 4.
