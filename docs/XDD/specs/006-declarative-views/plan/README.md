---
title: "M5 — Declarative Workspace Views: Implementation Plan"
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

## Context Priming

*GATE: Read all files in this section before starting any implementation.*

**Specification**:
- `docs/XDD/specs/006-declarative-views/requirements.md` — PRD (F0–F11, ~20 ACs)
- `docs/XDD/specs/006-declarative-views/solution.md` — SDD (9 ADRs, module design)
- `src/panel/components.ts` — reused render components (section/linkRow/stampLinkEl/…)
- `src/engines/NativeScopingEngine.ts` — the metadataCache-scan + pure-DOM pattern to mirror
- `src/scoping/{ScopingService,NoteContext}.ts` — scope-seam neighbours
- `src/codex/CodexView.ts` + `src/main.ts` — main-area ItemView registration + activation
- `src/views/SidebarView.ts` — `showFile`/`_drillInto` drill seam; `_toggleSection`; follow pattern
- `schema/scene.json`, `schema/plotline.json` — real field names/types

**Key Design Decisions** (from SDD):
- **ADR-1**: Data source is a **`metadataCache` scan**, not a Bases view → no Bases dependency, no degrade.
- **ADR-2**: A **main-area `ItemView`** that follows the active note (active-leaf-change).
- **ADR-3**: **One polymorphic** `story-forge-workspace` view, `layout: timeline | plotlines`.
- **ADR-4**: New scope seam `resolveWorkspaceScope` in `src/scoping/`.
- **ADR-5**: **Sort/group in TS** (coalesce storyDay/order; act + "No act"; plotline fan-out + "Unassigned").
- **ADR-6**: Collapse state per **view+scope+group**. **ADR-7**: unresolved plotline → flagged group.
- **ADR-8**: Reuse M3 components; read-only with an M6 interaction seam. **ADR-9**: extend seed + fix M4 Codex counts.

**Implementation Context**:
```bash
# Testing
npm test                    # vitest (unit + integration)
# Quality
npm run lint                # eslint (obsidianmd) + stylelint
npm run typecheck && npm run typecheck:test && npm run typecheck:mock
npm run schema:check        # schema-coupled seed gate
# Build / deploy
npm run build               # tsc + esbuild
npm run dev                 # watch → redeploy into test/StoryForge/
```

---

## Implementation Phases

Each phase is defined in a separate file. Tasks follow red-green-refactor: **Prime** (context),
**Test** (red), **Implement** (green), **Validate** (refactor + verify).

- [x] [Phase 1: Pure models (workspaceModel)](phase-1.md)
- [ ] [Phase 2: Scope seam (resolveWorkspaceScope)](phase-2.md)
- [ ] [Phase 3: Render + collapse + CSS](phase-3.md)
- [ ] [Phase 4: WorkspaceView host, registration, follow, drill](phase-4.md)
- [ ] [Phase 5: Seed extension + M4 Codex reconciliation](phase-5.md)
- [ ] [Phase 6: Integration/E2E, gates, finalize](phase-6.md) — *mockups (T6.1) pulled forward & done*

**Dependency graph**
- Phase 1 and Phase 2 are independent → **parallel**.
- Phase 3 depends on Phase 1 (the `Group` model).
- Phase 4 depends on Phases 1 + 2 + 3.
- Phase 5 is independent of 1–4 → may run **parallel**; its M4-reconciliation task (T5.2)
  depends on its seed task (T5.1).
- Phase 6 depends on Phase 4 + Phase 5 (integration runs the real view over the extended seed).

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
