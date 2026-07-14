---
title: "Phase 2: Scoping service"
status: completed
version: "1.0"
phase: 2
---

# Phase 2: Scoping service

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: SDD/Building Block View — Application Data Models]` (EntityKind, ResolvedEntity, NoteContext)
- `[ref: SDD/Building Block View — Internal API]` (ScopingService)
- `[ref: SDD/ADR-3]` (metadataCache-only, engine-free NoteContext, backlinks deferred) · `[ref: SDD/ADR-4]` (classification)
- `[ref: SDD/Runtime View]` (resolve flow) · `[ref: SDD/Implementation Examples]` (classify)
- `[ref: PRD/Feature 3 — Entity-context resolution]`
- Fixtures: `test/StoryForge/` seed notes; `test/__mocks__/obsidian.ts` factories

**Key Decisions**:
- `metadataCache` only: outgoing relations from `frontmatter` + `frontmatterLinks` → `getFirstLinkpathDest`; `resolvedLinks` NOT used for scoping; **`NoteContext.backlinks` empty in M1**. Classification tag-first, `type` fallback. `NoteContext` is framework-free and unit-testable.

**Dependencies**: none — **independent of Phase 1 `[parallel: true]`**.

---

## Tasks

Establishes the note → classified-entity-context capability every later view consumes.

- [x] **T2.1 NoteContext model & classification** `[activity: domain-modeling]` `[parallel: true]`

  1. Prime: Read the data models + ADR-4 + the classify example `[ref: SDD/ADR-4]` `[ref: SDD/Implementation Examples]`
  2. Test (RED): `classify` returns the right `EntityKind` for each canon tag (`#canon/character|location|object|lore`), `#manuscript/scene` → `scene`, `#planning/plotline` → `plotline`; falls back to frontmatter `type` when no tag; returns `unknown` when neither present.
  3. Implement (GREEN): `src/scoping/NoteContext.ts` (`EntityKind`, `ResolvedEntity`, `NoteContext`, guards); `classify()` on `ScopingService`.
  4. Validate: unit tests pass over fixture metadata (no live Obsidian); lint; typecheck.
  - Success: correct classification incl. tag-first/`type`-fallback `[ref: PRD/Feature 3]` `[ref: SDD/ADR-4]`.

- [x] **T2.2 Outgoing-relation resolver** `[activity: domain-modeling]` `[parallel: true]`

  1. Prime: Review the resolve flow + ADR-3 `[ref: SDD/Runtime View]` `[ref: SDD/ADR-3]`
  2. Test (RED): a scene fixture resolves `pov`/`characters`/`location`/`plotlines` to `ResolvedEntity[]` each carrying `field` + classified `kind`; a link with no target file → `unresolved:true` and resolution continues; `backlinks` is empty (`[]`); the resolver runs purely from fixture metadata (no Obsidian instance).
  3. Implement (GREEN): `src/scoping/ScopingService.ts` — `resolve(file): NoteContext` reading `frontmatter` + `frontmatterLinks`, resolving via `getFirstLinkpathDest`, classifying targets, leaving `backlinks` empty.
  4. Validate: unit tests pass; lint; typecheck.
  - Success: resolve produces field+kind entities; unresolved marked; testable without Obsidian `[ref: PRD/Feature 3]`; `NoteContext` matches the engine-free contract `[ref: SDD/ADR-3]`.

- [x] **T2.3 Phase Validation** `[activity: validate]`

  - Run all Phase 2 tests; lint; typecheck. Verify `NoteContext` shape is engine-free and backlinks seam is empty per SDD ADR-3.
