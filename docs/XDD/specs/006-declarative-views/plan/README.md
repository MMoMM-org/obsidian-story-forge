---
title: "M5 — Declarative Workspace Views: Implementation Plan"
status: draft
version: "2.0 — StoryLine-grounded reground"
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
- `docs/XDD/specs/006-declarative-views/requirements.md` — PRD (F0–F11)
- `docs/XDD/specs/006-declarative-views/solution.md` — **SDD v2.0** (13 ADRs, two-surface design)
- `docs/XDD/specs/006-declarative-views/mockups.html` — StoryLine-grounded states S59–S72
- `src/views/SidebarView.ts` — **hosts the Navigator as a 3rd tab**: tab strip, `showFile`/`_drillInto` drill seam, `_toggleSection`, `data-sf-*`, active-leaf follow
- `src/panel/components.ts` — reused primitives (section/collapse/stampLinkEl/unresolvedEl/emptyLine)
- `src/engines/NativeScopingEngine.ts` — the metadataCache-scan + pure-DOM pattern to mirror
- `src/scoping/{ScopingService,NoteContext}.ts` — scope-seam neighbours (`activeKind`)
- `src/codex/CodexView.ts` + `src/main.ts` — main-area ItemView registration + activation
- `schema/scene.json`, `schema/plotline.json` — real field names/types (incl. `beat`, `location`, `wordcount`)
- ref: obsidian-storyline (MIT) — visual reference only (no code port)

**Key Design Decisions** (SDD v2.0):
- **ADR-1**: Data source = **`metadataCache` scan**, not Bases → no dependency, no degrade.
- **ADR-2**: **Surface split** — Navigator (sidebar tab) + Timeline/Plotlines (main area) over one shared core.
- **ADR-3**: **One polymorphic** main-area `story-forge-workspace` view, `layout: timeline | plotlines`.
- **ADR-4**: Scope seam `resolveWorkspaceScope` (`src/scoping/`); include by type, exclude `DEFAULT_EXCLUDED_FOLDERS`.
- **ADR-5**: **Sort/group in TS** (coalesce storyDay/order; act + "No act"; plotline fan-out + "Unassigned").
- **ADR-6**: Collapse per **surface+scope+group**. **ADR-7**: unresolved plotline → flagged group.
- **ADR-8**: **StoryLine visual language** (build fresh); reuse collapse/drill/empty primitives; M6 seam.
- **ADR-9**: extend seed incl. **`type: beat` notes** + populate `scene.beat` (M4 suite unaffected — fixtures).
- **ADR-10**: Navigator = **3rd tab in `SidebarView`**, not its own leaf.
- **ADR-11**: Act label = **`beat` note alias** via `scene.beat`; fallback `Act N` (no schema change).
- **ADR-12**: Plotline **color derived** deterministically from name (no schema change).
- **ADR-13**: **Swimlanes / subway / drag → M6.** M5 ships Navigator + Timeline-rail + Plotlines-list.

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

- [x] [Phase 1: Pure models (workspaceModel)](phase-1.md) — *timelineModel/plotlineModel shipped*
- [ ] [Phase 2: Scope seam + pure derivations (actLabel/plotlineColor/statusTally)](phase-2.md)
- [ ] [Phase 3: Render building blocks + collapse + CSS](phase-3.md)
- [ ] [Phase 4: Navigator sidebar tab (SidebarView)](phase-4.md)
- [ ] [Phase 5: Main-area WorkspaceView — Timeline rail + Plotlines list](phase-5.md)
- [ ] [Phase 6: Seed (beat notes) + integration/E2E + gates + finalize](phase-6.md) — *mockups done early*

**Dependency graph**
- Phase 1 (done) and Phase 2 are pure/independent.
- Phase 3 (render blocks + collapse + CSS) depends on Phase 1 + Phase 2 (models + derivations).
- Phase 4 (Navigator) and Phase 5 (main-area views) both depend on Phase 2 + Phase 3, and are
  **parallel** to each other (different hosts, shared core + render blocks).
- **Seed extension (T6.1)** is independent — may run **parallel** from the start; it is a
  prerequisite for the Phase 6 integration/E2E (which drives the live surfaces over the seed).
- Phase 6 (integration + gates + finalize) depends on Phase 4 + Phase 5 + the seed.

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
