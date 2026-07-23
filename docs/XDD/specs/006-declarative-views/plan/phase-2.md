---
title: "Phase 2: Scope seam (resolveWorkspaceScope)"
status: pending
version: "1.0"
phase: 2
---

# Phase 2: Scope seam (resolveWorkspaceScope)

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: SDD/Interface Specifications; workspaceScope.ts]`
- `[ref: SDD/ADR-1, ADR-4]`
- `[ref: PRD/F3]`
- `src/scoping/{ScopingService,NoteContext}.ts` (neighbouring scope logic; activeKind)

**Key Decisions**:
- ADR-4: a pure, testable helper deriving `{book|plotline|none}` + in-scope scene `TFile[]`
  from the active note, reading `metadataCache` (ADR-1). No "current book/plotline" concept
  exists today — this is the net-new seam.

**Dependencies**: none (may run parallel with Phase 1).

---

## Tasks

Delivers active-note → scene-set scoping, the single biggest net-new correctness surface.

- [ ] **T2.1 resolveWorkspaceScope** `[activity: domain-modeling]` `[ref: SDD/ADR-4; PRD/F3]`

  1. Prime: Read `NoteContext.activeKind` + how scenes reference `book`/`plotlines` `[ref: schema/scene.json]`; the M3 resolve pattern `[ref: src/scoping/ScopingService.ts]`.
  2. Test (RED): active note is a **book** → `{kind:"book", ref}` + all scenes whose `book` links ref; active note is a **plotline** → `{kind:"plotline", ref}` + scenes linking it; active note is a **scene** → scope to that scene's `book`; active note is a character/other/null → `{kind:"none"}` + whole-vault book scenes; unresolved/`[[ ]]`-wrapped links tolerated; never throws.
  3. Implement (GREEN): Create `src/scoping/workspaceScope.ts` — `WorkspaceScope`, `ResolvedScope`, `resolveWorkspaceScope(app, activeFile)` using `metadataCache` (`getFileCache`, `getFirstLinkpathDest`, `resolvedLinks`).
  4. Validate: `test/scoping/workspaceScope.test.ts` green with a mocked `app`/`metadataCache`; lint; types.
  5. Success:
     - [ ] Book/plotline/scene active notes yield the correct scene set (seed: 3 scenes for the book) `[ref: PRD/AC-T7, AC-P6]`
     - [ ] No-scope note falls back to whole-vault books, never throws `[ref: PRD/AC F3-4]`

- [ ] **T2.2 Phase Validation** `[activity: validate]`

  Run Phase 2 tests; verify scope derivation covers book/plotline/scene/none. Lint + typecheck (src + test + mock). Verify against SDD ADR-4 and PRD F3.
