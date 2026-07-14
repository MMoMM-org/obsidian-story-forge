---
title: "Core Infrastructure — implementation plan"
status: complete
version: "1.0"
---

# Implementation Plan

## Validation Checklist

### CRITICAL GATES (Must Pass)
- [x] All `[NEEDS CLARIFICATION]` markers addressed
- [x] All specification file paths are correct and exist
- [x] Each phase follows TDD: Prime → Test → Implement → Validate
- [x] Every task has verifiable success criteria
- [x] A developer could follow this plan independently

### QUALITY CHECKS (Should Pass)
- [x] Context priming section complete
- [x] All phases defined with linked phase files
- [x] Dependencies between phases clear (no cycles)
- [x] Parallel work tagged `[parallel: true]`
- [x] Activity hints provided `[activity: type]`
- [x] Every phase references SDD sections
- [x] Every test references PRD acceptance criteria
- [x] Integration & E2E tests in final phase
- [x] Project commands match actual setup

---

## Context Priming

*GATE: Read all files in this section before starting any implementation.*

**Specification**:
- `docs/XDD/specs/001-core-infrastructure/requirements.md` — PRD (features + acceptance criteria)
- `docs/XDD/specs/001-core-infrastructure/solution.md` — SDD (modules, interfaces, ADRs, runtime)
- `docs/XDD/specs/001-core-infrastructure/mockups.html` — interface source of truth (states S1–S10)
- `docs/build-plan.md` — M1 milestone context
- Reference (read-only, not vendored): markdown-mason `src/scripts/store.ts` + `store.test.ts`

**Key Design Decisions** (from SDD ADRs):
- **ADR-1** View store clones mason `store.ts` — flat `{id: ViewRecord}` map in data.json, no migration, immediate save, fail-closed defaults, + `engine` discriminant.
- **ADR-2** Single tabbed `ItemView` with a subject abstraction (`follow`/`pinned`; `focused` is M3).
- **ADR-3** Scoping via `metadataCache` only; `NoteContext` is engine-free plain data; **backlinks deferred to M3** (seam empty).
- **ADR-4** Classification tag-first (`#canon/*`, `#manuscript/scene`, `#planning/*`), `type` fallback.
- **ADR-5** Follow via `active-leaf-change` (guarded) + `metadataCache 'changed'`, ~200 ms debounce, first resolve gated on `onLayoutReady`, all via `registerEvent`.
- **ADR-6** Persist only on user-initiated store mutations (never on the follow path); read-modify-write preserves settings.

**Implementation Context**:
```bash
# Testing
npm test                    # vitest unit + obsidian mock (test/__mocks__)
npm run test:live           # vault-backed live tests (test/live/)
# Quality
npm run lint                # eslint (obsidianmd) + stylelint
npm run typecheck           # tsc --noEmit
npm run schema:check        # frontmatter schema drift gate
# Build / dev
npm run build               # tsc + esbuild production
npm run dev                 # esbuild watch → deploys into test/StoryForge/.obsidian/plugins/story-forge/
```

---

## Implementation Phases

Each phase is a separate file. Tasks follow red-green-refactor: **Prime** (context), **Test** (red), **Implement** (green), **Validate** (refactor + verify).

> **Tracking Principle**: track logical units that produce verifiable outcomes; the TDD cycle is the method, not separate tracked items.

**Dependency graph:** Phase 1 ∥ Phase 2 (independent, parallelizable) → Phase 3 (needs Phase 2's `ScopingService` + `NoteContext`) → Phase 4 (needs 1, 2, 3).

- [ ] [Phase 1: View store](phase-1.md)
- [ ] [Phase 2: Scoping service](phase-2.md)
- [ ] [Phase 3: Sidebar panel shell](phase-3.md)
- [ ] [Phase 4: Integration & validation](phase-4.md)

---

## Plan Verification

| Criterion | Status |
|-----------|--------|
| A developer can follow this plan without additional clarification | ✅ |
| Every task produces a verifiable deliverable | ✅ |
| All PRD acceptance criteria map to specific tasks | ✅ |
| All SDD components have implementation tasks | ✅ |
| Dependencies are explicit with no circular references | ✅ |
| Parallel opportunities marked with `[parallel: true]` | ✅ |
| Each task has specification references `[ref: ...]` | ✅ |
| Project commands in Context Priming are accurate | ✅ |
| All phase files exist and are linked as `[Phase N: Title](phase-N.md)` | ✅ |

## Coverage map (PRD → tasks)

| PRD | Tasks |
|---|---|
| Feature 1 — Panel shell | T3.1, T3.2, T3.3, T4.2 |
| Feature 2 — Pin | T3.4 |
| Feature 3 — Entity-context resolver | T2.1, T2.2, T3.3 |
| Feature 4 — View store | T1.1, T1.2, T4.1 |
