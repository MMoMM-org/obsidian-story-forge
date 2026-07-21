---
title: "Phase 4: F3 overview views + F4 catalog pipeline & install + F7 updates"
status: pending
version: "1.0"
phase: 4
---

# Phase 4: F3 overview views + F4 catalog pipeline & install + F7 updates

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: SDD/ADR-5]` — install materialises `.base` into the settings folder (default `00 Meta/Bases`)
- `[ref: SDD/ADR-6]` — reuse M2 + two extensions (provenance override; gate-less 1-click); fail-closed checksum before write
- `[ref: SDD/Runtime View]` — the Browse-official → install state machine + the curated-install algorithm
- `[ref: PRD/F3]` (V4–V8 via `docs/view-roadmap.md`), `[ref: PRD/F4]`, `[ref: PRD/F7]`, mockups **S47, S48, S49, S57**

**Key Decisions**: ADR-6 (checksum fail-closed **before** any write; DataviewJS gates, `.base`/DQL 1-click; provenance `curated`), ADR-5 (folder), ADR-9 (build-time `.base` validation). Offline end-to-end (CON-9).

**Dependencies**: Phase 2 (the bases source-model seam T2.1 — the catalog reuses it for `.base` records). Phase 1 (`basesConfig` validator for the build step).

---

## Tasks

Delivers the five installable overview views, the offline build pipeline, the "Browse official" install flow, and update notifications.

- [ ] **T4.1 Authored overview `.base` sources + catalog source dir** `[activity: content-authoring]` `[parallel: true]`

  1. Prime: Read `[ref: PRD/AC-F3.1]` and `docs/view-roadmap.md` V4–V8; the seed `Canon.base`/`Manuscript.base`.
  2. Test: exactly five global views — Characters (`name`,`role`,`status`,`tagline`), Locations (grouped by `locationType`; `world`,`region`), Objects (`name`,`kind`,`owner`), Lore (`name`,`scope`,`related`), Scenes (`order`,`status`,`pov`,`location`; sorted by `order`) — each matching the roadmap; each validates against `BasesConfigFile`.
  3. Implement: `catalog/overview-{characters,locations,objects,lore,scenes}.base`.
  4. Validate: `basesConfig` validation passes for all five; fields/sort/group match V4–V8.
  5. Success: five overview views authored, roadmap-accurate, tolerate missing fields `[ref: PRD/AC-F3.1, AC-F3.2, AC-F3.3]`

- [ ] **T4.2 `build-catalog.mjs` → checksummed bundled index** `[activity: build-tooling]`

  1. Prime: Read `[ref: SDD/ADR-9]`, `scripts/schema-gen.mjs` (sibling pattern), `consent/checksum.ts` (`computeChecksum` — reuse verbatim).
  2. Test: `catalog/` sources compile to a versioned `dist/catalog-index.json` where each entry's `checksum` equals `computeChecksum(source)` byte-for-byte; a malformed `.base` **fails the build** (validated against `BasesConfigFile`); no network.
  3. Implement: `scripts/build-catalog.mjs`; add the `catalog:build` npm script; wire it to run before `build`.
  4. Validate: index generated + checksums verified; deliberately-malformed `.base` fails the build.
  5. Success: bundled checksummed offline index; build-time validation gate `[ref: PRD/AC-F4.1; SDD/ADR-9]`

- [ ] **T4.3 M2 install extensions — provenance override + gate-less flow** `[activity: backend-integration]`

  1. Prime: Read `[ref: SDD/ADR-6]`, `ViewImporter.importToStore`/`toRecord` (hardcoded `provenance:"imported"`, `:141`), `ImportFlow.runImportFlow` (always gates, `:48`), `ConsentGate.requestConsentForDef`.
  2. Test: `importToStore(def, {provenance:"curated"})` writes a `curated` record; `installCurated` installs a declarative (`.base`/DQL) entry **without** a consent modal; a DataviewJS entry still routes through `requestConsentForDef` and a declined consent (`null`) writes nothing; DataviewJS can **never** reach the gate-less path; a duplicate `source` surfaces as up-to-date (not a raw `DUPLICATE` error).
  3. Implement: add a `provenance?` override to `ViewImporter`; add `ImportFlow.installCurated` scoped to declarative engines.
  4. Validate: unit tests for each path; the independence of checksum vs consent asserted.
  5. Success:
     - [ ] `.base`/DQL install 1-click, `curated` provenance `[ref: PRD/AC-F4.3]`
     - [ ] DataviewJS gates; decline installs nothing `[ref: PRD/AC-F4.4]`

- [ ] **T4.4 `CatalogService` — load, fail-closed verify, materialise, persist** `[activity: backend-integration]`

  1. Prime: Read `[ref: SDD/Runtime View]` curated-install algorithm; `[ref: SDD/ADR-5]` folder; the settings shape.
  2. Test: loads the bundled `dist/catalog-index.json` (no fetch); on install, `computeChecksum(source)` is checked **before** any write and a mismatch **fails closed** (writes nothing, tells why); a `bases` entry materialises its `.base` into `${curatedBasesFolder}` (default `00 Meta/Bases`, `normalizePath`'d, created on demand) and records `source`; `setRecord` persists and the sidebar re-renders; everything works offline.
  3. Implement: `src/catalog/CatalogService.ts`, `src/catalog/catalogTypes.ts`; add the `curatedBasesFolder` setting to `SettingsTab` (default `00 Meta/Bases`).
  4. Validate: fail-closed test (mismatched checksum); offline test; folder-write test.
  5. Success:
     - [ ] Checksum mismatch fails closed `[ref: PRD/AC-F4.5]`; offline install works `[ref: PRD/AC-F4.7]`
     - [ ] Install surfaced via existing view surfaces `[ref: PRD/AC-F4.6]`

- [ ] **T4.5 `BrowseOfficialModal` — list, preview, install, update** `[activity: frontend-ui]`

  1. Prime: Read `ImportPickerModal` (structure to clone), mockups **S47/S48/S49/S57**, `[ref: PRD/F7]`.
  2. Test: lists curated entries with provenance + checksum (S47) + preview (S48); Install routes through `CatalogService` (DataviewJS shows the consent gate S57 first); an installed view whose bundled checksum is newer shows a per-row "update available" (S49) that reuses the install path and refreshes provenance/checksum; no drift → no update affordance (not noise).
  3. Implement: `src/catalog/BrowseOfficialModal.ts`; a command/ribbon entry to open it.
  4. Validate: list/preview/install/update UI tests; consent-path test.
  5. Success:
     - [ ] Browse lists with provenance + checksum + preview `[ref: PRD/AC-F4.2]`
     - [ ] Update-available affordance + reuse install path `[ref: PRD/AC-F7.1, AC-F7.2, AC-F7.3]`

- [ ] **T4.6 Phase Validation** `[activity: validate]`
  - Run all Phase 4 tests + `catalog:build`. `npm test`, `lint`, `typecheck`, `typecheck:test`, `schema:check` pass. Manually confirm on the seed vault: five overviews install and render; a deliberately-mismatched checksum fails closed; DataviewJS gates; offline works `[ref: PRD/Success Metrics F3, F4]`.
