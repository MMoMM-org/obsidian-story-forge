---
title: "Phase 2: View import & parsing"
status: pending
version: "1.0"
phase: 2
---

# Phase 2: View import & parsing

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: SDD/Building Block View — Directory Map]` (`src/import/ViewImporter.ts`, `src/import/fencedBlock.ts`)
- `[ref: SDD/Interface Specifications — ViewDefinition + ViewImporter]`
- `[ref: SDD/Interface Specifications — ViewRecord mapping from ViewDefinition]`
- `[ref: SDD/ADR-6]` (view-definition format: `sf-view:true` + exactly one fenced block; `sf-version` integer; engine inferred from fence language; auto-scan via `metadataCache`)
- `[ref: SDD/ADR-9]` (store-generated id; `source` carries vault path; no UUID written to vault note)
- `[ref: SDD/Implementation Examples — ViewImporter.parse()]`
- `[ref: SDD/Runtime View — Flow C (DataviewJS consent path — import leg)]`
- `[ref: PRD/Feature 3 — User-import flow]`

**Key Decisions**:
- `ViewImporter` is **stateless**: no constructor state beyond injected `app` and `store` references. All scan/parse/convert operations are pure-ish functions over arguments.
- Auto-scan uses `metadataCache.iterateAllFiles()` + `metadataCache.getFileCache(file)?.frontmatter` — no vault reads for the listing step (ADR-6).
- `parse()` reads the note once (via `readFencedBlock` from Phase 1) and rejects non-integer `sf-version` or missing `sf-name` with typed `ImportError`.
- `toRecord()` never writes to the vault note and never sets `okayed` (ADR-9, ADR-5 safe default).
- Duplicate detection is by `ViewRecord.source` path equality — checked against `store.getViews()` before creating a new record.
- Engine inference: fence language `"dataviewjs"` → `"dataviewjs"`; `"dataview"` → `"dataview-dql"`. Cross-check against `sf-engine` frontmatter field if present.
- The store-generated id is a UUID/nanoid: `crypto.randomUUID()` (available in modern Node/Obsidian) or a nanoid equivalent. Must NOT be derived from `sourcePath`.

**Dependencies**:
- Phase 1 (T1.1 `fencedBlock.ts`) must be complete — `parse()` delegates to `readFencedBlock`.
- Phase 1 (T1.2 `checksum.ts`) must be complete — `parse()` computes the import-time checksum shown in the picker preview (not persisted until consent).
- Runs **in parallel with Phase 3** once Phase 1 is complete.

---

## Tasks

Establishes the vault-scanning, view-definition parsing, and ViewRecord creation pipeline that populates the ViewStore for the import flow.

- [ ] **T2.1 View-definition parser** `[activity: domain-modeling]`

  1. Prime: Read `[ref: SDD/Interface Specifications — ViewDefinition + ViewImporter]` (the full `ViewDefinition` shape and `ViewImporter.parse()` contract). Read `[ref: SDD/ADR-6]` (validation rules, engine inference, `sf-version` integer requirement). Read `[ref: SDD/Implementation Examples — ViewImporter.parse()]` (illustrative implementation). Read `src/store/types.ts` (`isEngine` helper, `ViewRecord.engine` discriminant values). Read Phase 1's `src/import/fencedBlock.ts` to understand the extractor API.
  2. Test (RED): `parse(file)` returns a `ViewDefinition` with `engine:"dataviewjs"` when the fenced block language is `dataviewjs`; returns `engine:"dataview-dql"` when language is `dataview`; throws `ImportError("NO_QUERY_BLOCK", ...)` when `readFencedBlock` returns null due to zero matching blocks; throws `ImportError("MULTIPLE_QUERY_BLOCKS", "View definitions must contain exactly one query block")` when the note contains more than one fenced `dataview`/`dataviewjs` block; throws `ImportError("INVALID_FRONTMATTER", ...)` when `sf-version` is missing; throws `ImportError("INVALID_FRONTMATTER", ...)` when `sf-version` is a string or float (not an integer); throws `ImportError("INVALID_FRONTMATTER", ...)` when `sf-name` is missing or empty; throws `ImportError("ENGINE_MISMATCH", ...)` when `sf-engine` frontmatter contradicts the fence language tag; `sf-name` defaults to `file.basename` when frontmatter field is absent (per SDD interface spec note); `checksum` on the returned `ViewDefinition` matches `computeChecksum(block.body)`.
  3. Implement (GREEN): Create `src/import/ViewDefinition.ts` — export `ViewDefinition` interface and `ImportError` class. Create `src/import/ViewImporter.ts` — export `ViewImporter` class with `parse(file: TFile): Promise<ViewDefinition>`. Call `readFencedBlock(app, file.path)` for block extraction; parse frontmatter from `metadataCache.getFileCache(file)?.frontmatter`; validate and infer engine; compute `checksum` via `computeChecksum`.
  4. Validate: unit tests pass (all `ImportError` codes + happy paths); `npm run lint`; `npm run typecheck`; `npm run typecheck:test`.
  - Success: parser enforces exactly-one-block rule with human-readable messages `[ref: SDD/EARS F3 — "NO_QUERY_BLOCK" / "MULTIPLE_QUERY_BLOCKS"]` `[ref: PRD/AC-F3.3]` `[ref: PRD/AC-F3.4]`; `sf-version` integer enforcement is strict `[ref: SDD/ADR-9 — "sf-version must be an integer"]`; engine inferred from fence language `[ref: SDD/ADR-6]`.

- [ ] **T2.2 ViewImporter — toRecord + duplicate guard** `[activity: data-architecture]`

  1. Prime: Read `[ref: SDD/Interface Specifications — ViewRecord mapping from ViewDefinition]` (the table mapping `ViewDefinition` fields to `ViewRecord` fields). Read `[ref: SDD/ADR-9]` (store-generated id; `source` = vault path; no UUID to vault; `enabled:false` safe default). Read `src/store/ViewStore.ts` (`setRecord`, `getViews`). Read `src/store/types.ts` (`ViewRecord` shape: `provenance`, `enabled`, `okayed`, `source`, `engine`, `command`, `description`, `commandName`).
  2. Test (RED): `toRecord(def)` returns a `ViewRecord` with `provenance:"imported"`, `enabled:false`, `okayed:null`, `source === def.sourcePath`, `engine === def.engine`, `command === def.command`, `commandName === def.name`, `description === def.description` (or undefined); the generated id is a non-empty string different from `def.sourcePath`; calling `toRecord` twice on the same `def` produces different ids (store-generated uniqueness); duplicate check — `importToStore(def)` calls `store.getViews()`, finds an existing record whose `source === def.sourcePath`, and throws `ImportError("DUPLICATE", "View already imported")` without calling `setRecord`; non-duplicate path calls `store.setRecord(newId, record)` exactly once; `setRecord` is never called with `okayed` set (must be null at import time).
  3. Implement (GREEN): Add `toRecord(def: ViewDefinition): ViewRecord` to `ViewImporter` (uses `crypto.randomUUID()` for the id). Add `importToStore(def: ViewDefinition): string` (returns the new id) — performs the duplicate check against `store.getViews()` then calls `store.setRecord`. Export `ImportError` from `src/import/ViewDefinition.ts` (used by T2.1 and T2.2).
  4. Validate: unit tests pass; `npm run lint`; `npm run typecheck`; `npm run typecheck:test`.
  - Success: imported ViewRecord is always `enabled:false, okayed:null` (ADR-5 safe default) `[ref: SDD/EARS F3 — "create a ViewRecord with ... enabled:false, okayed:null"]` `[ref: PRD/AC-F3.2]`; duplicate source path blocked `[ref: SDD/EARS F3 — "already imported indicator"]` `[ref: PRD/AC-F3.5]`; `provenance:"imported"` `[ref: SDD/ADR-9]`.

- [ ] **T2.3 Auto-scan discovery** `[activity: backend]`

  1. Prime: Read `[ref: SDD/Interface Specifications — ViewImporter — scanVault()]` (returns `TFile[]`). Read `[ref: SDD/ADR-6]` (scan `metadataCache` for `sf-view:true`; no vault reads at scan time). Read `test/__mocks__/obsidian.ts` (how `metadataCache.iterateAllFiles` and `getFileCache` are mocked).
  2. Test (RED): `scanVault()` returns all `TFile` objects whose `CachedMetadata.frontmatter["sf-view"]` equals `true`; excludes files where `sf-view` is absent, `false`, or a non-boolean truthy value; excludes files already present in `store.getViews()` (paths already imported) so the picker shows only unimported notes; returns an empty array when no vault notes have `sf-view:true`; does not call `app.vault.read()` (verified by spy — scan is cache-only).
  3. Implement (GREEN): Add `scanVault(): TFile[]` to `ViewImporter`. Use `app.metadataCache.iterateAllFiles((file) => {...})` (or equivalent) checking `getFileCache(file)?.frontmatter?.["sf-view"] === true`; filter out paths already in `store.getViews()`. Return the filtered list.
  4. Validate: unit tests pass; `npm run lint`; `npm run typecheck`; `npm run typecheck:test`.
  - Success: scan uses `metadataCache` only, no vault reads `[ref: SDD/ADR-6]`; picker only shows unimported notes `[ref: SDD/EARS F3 — "listing all vault notes whose CachedMetadata contains sf-view:true"]` `[ref: PRD/AC-F3.1]`; already-imported paths excluded `[ref: PRD/AC-F3.5]`.

- [ ] **T2.4 Phase Validation** `[activity: validate]`

  - Run `npm test` (all Phase 2 tests pass). Run `npm run lint`. Run `npm run typecheck`. Run `npm run typecheck:test`.
  - Verify: all five `ImportError` codes are exercised by tests; `scanVault()` is verified to call zero `vault.read()` via spy; `toRecord` produces deterministic shape with non-deterministic id; `importToStore` is idempotent on duplicate (throws, no double-write). All `[ref: SDD/ADR-6]`, `[ref: SDD/ADR-9]`, `[ref: PRD/Feature 3]` acceptance criteria covered.
