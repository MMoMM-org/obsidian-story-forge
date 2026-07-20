---
title: "M3 Contextual sidebar panel — implementation plan"
status: draft
version: "1.0"
---

# Implementation Plan

## Validation Checklist

### CRITICAL GATES (Must Pass)

- [x] All `[NEEDS CLARIFICATION: ...]` markers have been addressed
- [x] All specification file paths are correct and exist
- [x] Each phase follows TDD: Prime → Test → Implement → Validate
- [x] Every task has verifiable success criteria
- [x] A developer could follow this plan independently

### QUALITY CHECKS (Should Pass)

- [x] Context priming section is complete
- [x] All implementation phases are defined with linked phase files
- [x] Dependencies between phases are clear (no circular dependencies)
- [x] Parallel work is properly tagged with `[parallel: true]`
- [x] Activity hints provided for specialist selection `[activity: type]`
- [x] Every phase references relevant SDD sections
- [x] Every test references PRD acceptance criteria
- [x] Integration & E2E tests defined in final phase
- [x] Project commands match actual project setup

---

## Specification Compliance Guidelines

### Deviation Protocol

When implementation requires changes from the specification:
1. Document the deviation with clear rationale in the phase file.
2. Obtain approval before proceeding.
3. Update SDD when the deviation improves the design.
4. Record all deviations in the relevant phase file for traceability.

## Metadata Reference

- `[parallel: true]` — tasks/phases that can run concurrently
- `[ref: document/section; lines: X-Y]` — links to specifications
- `[activity: type]` — activity hint for specialist agent selection

**Validate** = process verification ("did we follow TDD?"). **Success** = outcome
verification ("does it work correctly?").

---

## Context Priming

*GATE: Read all files in this section before starting any implementation.*

**Specification**:
- `docs/XDD/specs/004-contextual-panel/requirements.md` — PRD (F1–F7, ~42 ACs)
- `docs/XDD/specs/004-contextual-panel/solution.md` — SDD (ADR-1…9, interfaces)
- `docs/XDD/specs/004-contextual-panel/mockups.html` — styled panel states S32–S43
- `docs/schema-change-runbook.md` — ADD-a-type procedure (P1)

**Key Design Decisions** (from SDD):
- **ADR-1**: reverse index — sync, cache-only, `resolvedLinks` prefilter + `frontmatterLinks`
  scan, keyed on field name; fills `NoteContext.backlinks`; never `getBacklinksForFile`.
- **ADR-2**: per-kind renderers in a new `src/panel/` module; `NativeScopingEngine` is a
  thin `ctx.activeKind` dispatcher (frozen `QueryEngine` contract).
- **ADR-4/5**: drill-in nav stack (`SubjectSource` +`"drilled"`) + `linkClickAction`
  setting (default `"drill"`, modifier inverts).
- **ADR-6/7**: `plotline`+`book` first-class schema types (book needs new `EntityKind`);
  optional `image` on object/location.
- **ADR-8**: object/lore "appears in" = fuzzy `resolvedLinks` backlinks (`fuzzy:true`).

**Implementation Context**:
```bash
# Testing
npm test                    # vitest unit tests
# Quality
npm run lint                # eslint (obsidianmd) + stylelint
npm run typecheck           # tsc --noEmit
npm run typecheck:test      # test tsconfig
# Schema
npm run schema:gen          # regenerate vault artifacts
npm run schema:check        # schema gate
# Build
npm run build               # tsc + esbuild
```

---

## Implementation Phases

Each phase is defined in a separate file. Tasks follow red-green-refactor: **Prime**
(understand context), **Test** (red), **Implement** (green), **Validate** (refactor + verify).

> **Dependency graph:** P1 ∥ P2 (parallel) → P3 → P4 → P5.

- [x] [Phase 1: Schema foundation (plotline/book + image)](phase-1.md)
- [x] [Phase 2: Reverse-relation resolution](phase-2.md)
- [ ] [Phase 3: Per-kind panel renderers](phase-3.md)
- [ ] [Phase 4: Navigation & settings](phase-4.md)
- [ ] [Phase 5: Curated views, seed notes & validation](phase-5.md)

---

## Plan Verification

| Criterion | Status |
|-----------|--------|
| A developer can follow this plan without additional clarification | ✅ |
| Every task produces a verifiable deliverable | ✅ |
| All PRD acceptance criteria map to specific tasks | ✅ |
| All SDD components have implementation tasks | ✅ |
| Dependencies are explicit with no circular references | ✅ |
| Parallel opportunities are marked with `[parallel: true]` | ✅ |
| Each task has specification references `[ref: ...]` | ✅ |
| Project commands in Context Priming are accurate | ✅ |
| All phase files exist and are linked from this manifest | ✅ |

### AC → phase coverage

| Feature | Phase | Feature | Phase |
|---|---|---|---|
| F1 Character panel | P3 | F5 Empty/partial states | P3 |
| F2 Reverse resolution | P2 | F6 Navigation + settings | P4 |
| F3 Other 5 kinds | P3 | F7 Curated views | P5 |
| F4 plotline/book + image schema | P1 | — | — |
