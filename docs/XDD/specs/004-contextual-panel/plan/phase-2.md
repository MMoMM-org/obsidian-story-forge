---
title: "Phase 2: Reverse-relation resolution"
status: pending
version: "1.0"
phase: 2
---

# Phase 2: Reverse-relation resolution

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: SDD/ADR-1]` (sync field-filtered reverse index) · `[ref: SDD/ADR-3]` (fuzzy flag)
  · `[ref: SDD/ADR-8]` (object/lore fuzzy backlinks)
- `[ref: SDD/Implementation Examples/Reverse index]` — the `buildBacklinks` algorithm + traced walkthroughs
- `[ref: PRD/F2]` — reverse-resolution ACs
- `src/scoping/ScopingService.ts` (resolve, lines 85-148), `src/scoping/NoteContext.ts`

**Key Decisions**:
- Reverse index is **synchronous**, cache-only (no `vault.read`), keyed on the frontmatter
  **field name** — never `getBacklinksForFile` (CON-2).
- `resolvedLinks` prefilter → per-candidate `frontmatterLinks` scan for typed edges; body-only
  edges for object/lore become `fuzzy:true` backlinks.
- `NoteContext` shape unchanged; only `backlinks` is now filled + `ResolvedEntity.fuzzy?` added.

**Dependencies**: none (runs `[parallel: true]` with Phase 1). Phase 3 depends on this.

---

## Tasks

Fills the `NoteContext.backlinks` seam so "appears in", "owns", "inhabitants", "scenes here",
and "referenced by" can be rendered.

- [ ] **T2.1 `ResolvedEntity.fuzzy?` + `reverseIndex.buildBacklinks`** `[activity: domain-modeling]` `[ref: SDD/ADR-1]` `[ref: SDD/ADR-8]`

  1. Prime: Read the `buildBacklinks` example + traced walkthroughs `[ref: SDD/Implementation Examples]`;
     the existing outgoing-resolve loop `[ref: src/scoping/ScopingService.ts; lines: 101-139]`.
  2. Test (unit, mock metadataCache):
     - character subject → backlinks for scenes via `pov` and `characters`, each with its
       `field`, `relation:"backlink"` `[ref: PRD/F2]`
     - location subject → scenes via `location` + child locations via `world`
     - object subject → `fuzzy:true` backlink for a scene linking it in body only `[ref: SDD/ADR-8]`
     - a prose-only `[[Mara]]` mention of a character → NOT emitted (field-filter excludes it)
     - unresolved/deleted candidate → skipped, never throws
     - `plotlines`/`related`/`first_appearance` (no `"relation"` key) still resolved via field name
  3. Implement: create `src/scoping/reverseIndex.ts` with
     `buildBacklinks(app, subject, subjectKind, classify): ResolvedEntity[]`; add optional
     `fuzzy?: boolean` to `ResolvedEntity` in `NoteContext.ts`.
  4. Validate: unit tests pass; `typecheck`; `isNoteContext` unchanged.
  5. Success:
     - [ ] Typed backlinks carry the source field; fuzzy flagged for object/lore `[ref: PRD/F2]`
     - [ ] Only public APIs used (`resolvedLinks`/`frontmatterLinks`/`getFirstLinkpathDest`) `[ref: SDD/CON-2]`

- [ ] **T2.2 Wire reverse index into `ScopingService.resolve()`** `[activity: backend-api]` `[ref: SDD/ADR-1]`

  1. Prime: `resolve()` return site `[ref: src/scoping/ScopingService.ts; lines: 141-147]`.
  2. Test: `resolve(file).backlinks` is populated for each kind; cache-null path still returns
     empty `backlinks` (no throw); resolution stays synchronous.
  3. Implement: replace `backlinks: []` with `buildBacklinks(this.app, file, activeKind, (f) => this.classify(f))`.
  4. Validate: existing ScopingService tests still green; new backlink assertions pass; `lint`.
  5. Success:
     - [ ] `NoteContext.backlinks` filled on every resolve; live-follow recomputes `[ref: PRD/F2]`

- [ ] **T2.3 Phase Validation** `[activity: validate]`

  - Run `npm test` (scoping suite) + `npm run typecheck && npm run typecheck:test && npm run lint`.
  - Verify the ground-truth assertions from the SDD (Mara → Scenes 1-3 POV; Tobias owns Beacon
    Lens; Lighthouse inhabitants = Tobias+Mara) hold against the seed vault fixtures.
