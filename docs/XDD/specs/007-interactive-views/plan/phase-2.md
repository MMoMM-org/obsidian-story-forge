---
title: "Phase 2: Write seam — commitMany + spy-able mock"
status: done
version: "1.0"
phase: 2
---

# Phase 2: Write seam — `commitMany` + spy-able mock

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: SDD/Building Block View — Interface Specifications; Write seam]`
- `[ref: SDD/ADR-14 (commitMany), ADR-26 (spy-able mock)]`
- `[ref: PRD/F7 (write discipline), AC-F7.1, AC-F7.2]`
- `src/inspector/frontmatterWriter.ts` (existing `commit`, `validateField`, `isOutOfVocab`, `FieldSpec`, `CommitResult`)
- `test/__mocks__/obsidian.ts` (existing `fileManager.processFrontMatter: vi.fn()`)

**Key Decisions**:
- `commitMany` reuses the **exact** validation of `commit` (`validateField` per entry; `isOutOfVocab` advisory-warn), then a **single** `processFrontMatter` sets all keys → atomic (ADR-14).
- The mock must stay **faithful to the real API shape** (memory: obsidian-mock-must-match-real-api): `processFrontMatter(file, fn)` runs `fn` against a per-file frontmatter object and (optionally) emits a `metadataCache "changed"` event.

**Dependencies**: none (runs **parallel** with Phase 1). **Blocks Phase 3 + Phase 5.**

---

## Tasks

Delivers the atomic multi-field write function and the test surface every write feature asserts against.

- [x] **T2.1 commitMany (atomic multi-key write)** `[activity: backend-api]` `[ref: SDD/ADR-14; PRD/AC-F7.1]`

  1. Prime: Read `commit` + `validateField` + `isOutOfVocab` end-to-end; note the `CommitResult`/`CommitError` shape (`keepDirty`) to mirror.
  2. Test (RED): `commitMany(app, file, entries)` — (a) every entry validated in memory first; **any** type error → returns `{ok:false, reason:"validation"}` and calls `processFrontMatter` **zero** times (nothing written); (b) all valid → a **single** `processFrontMatter` sets **all** keys; (c) sibling keys not in `entries` are untouched; (d) an out-of-vocab select warns but proceeds; (e) a `processFrontMatter` reject → `{ok:false, reason:"write", keepDirty:true}`.
  3. Implement (GREEN): add `CommitEntry` + `commitMany` to `frontmatterWriter.ts` (validate loop → one `processFrontMatter` callback that assigns each `entry.key = entry.value`).
  4. Validate: `test/inspector/frontmatterWriter.commitMany.test.ts` green; lint; types. `commit` behaviour unchanged (existing tests still green).
  5. Success:
     - [ ] Atomic: one `processFrontMatter` for N keys; all-or-nothing on validation `[ref: SDD/AC-9, AC-10]`
     - [ ] Sibling fields untouched; write-error path returns `keepDirty` `[ref: PRD/AC-F7.1, AC-F7.2]`

- [x] **T2.2 Spy-able processFrontMatter mock + changed-event** `[activity: test-infrastructure]` `[ref: SDD/ADR-26]`

  1. Prime: Read the current `test/__mocks__/obsidian.ts` `fileManager` + `metadataCache` shapes; confirm the real signature in `obsidian.d.ts` (`processFrontMatter(file, fn, options?)`).
  2. Test (RED): a mock-level test proving the new impl runs the mutator against a per-file `fm` object retrievable by the test, and that calling it emits a `metadataCache "changed"` registered via `metadataCache.on`.
  3. Implement (GREEN): replace the bare `vi.fn()` with an impl backed by a per-path frontmatter store; expose a helper to seed/read a file's fm; emit `changed` after mutation. Keep the `vi.fn()` spy wrapper so `toHaveBeenCalledWith` still works.
  4. Validate: mock typechecks (`typecheck:mock`); existing write tests (Inspector M3/M4) still green.
  5. Success:
     - [ ] Tests can assert the exact fm mutation after a write `[ref: SDD/ADR-26]`
     - [ ] `changed` round-trip available for Phase 3/6 re-render tests `[ref: SDD/ADR-22]`

- [x] **T2.3 Phase Validation** `[activity: validate]`

  Run Phase 2 tests + the full existing suite (no regression to Inspector writes). `typecheck` + `typecheck:test` + `typecheck:mock`; lint. Confirm `commit` is byte-for-byte behaviourally unchanged and `commitMany` is the only addition to the write seam (CON-2).
