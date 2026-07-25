---
title: "M6 — Interactive Workspace Views: Implementation Plan"
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
- `docs/XDD/specs/007-interactive-views/requirements.md` — PRD (F1–F8 + Gherkin ACs)
- `docs/XDD/specs/007-interactive-views/solution.md` — **SDD** (ADR-14…ADR-26, EARS AC-1…AC-11)
- `docs/XDD/specs/007-interactive-views/mockups.html` — interactive states S73–S84

**Foundations to extend (all present on `main`, verified)**:
- `src/inspector/frontmatterWriter.ts` — the **sole write seam** (`commit`; `validateField`/`isOutOfVocab`/`FieldSpec`/`CommitResult`). Phase 2 adds `commitMany`.
- `src/workspace/WorkspaceView.ts` — the polymorphic main-area host (`_layout`, `setLayout`, delegated `_onClick`, `CollapseStore`, `_debouncedRender`, follow via `active-leaf-change`).
- `src/workspace/workspaceModel.ts` — pure models (`SceneRow`, `Group`, `Link`, `timelineModel`, `plotlineModel`, `plotlineColor`, `stripLink`, `actBeatLink`, `LinkResolver`). Phase 1 extends it.
- `src/workspace/sceneMapper.ts` — `mapSceneRow(app,file)`. Reused unchanged.
- `src/workspace/renderTimeline.ts` — `renderTimeline(host,groups,deps,mode)`, `TimelineMode="rail"|"swimlane"` (swimlane currently throws → Phase 4 fills it).
- `src/workspace/renderShared.ts` — `rowColor`/`statusSlug`/`appendDot`/`appendStatusBadge`/`NEUTRAL_DOT_COLOR`.
- `src/workspace/collapseStore.ts` — `CollapseStore` (key `surface scope group`).
- `src/scoping/workspaceScope.ts` — `resolveWorkspaceScope`, `DEFAULT_EXCLUDED_FOLDERS`. Phase 4 adds a location-scope resolver.
- `src/panel/components.ts` — `section`, `emptyLine`.
- `test/__mocks__/obsidian.ts` — `fileManager.processFrontMatter: vi.fn()` (Phase 2 makes it spy-able).
- `schema/scene.json` (`status`,`order`,`storyDay`,`plotlines`,`pov`,`location`), `schema/location.json` (`world`).
- ref: obsidian-storyline (MIT) — visual reference only (no code port).

**Key Design Decisions** (SDD):
- **ADR-14**: sole write seam = `frontmatterWriter`; add atomic **`commitMany`** for `status`+`order`.
- **ADR-15**: drag = **pointer events** in a new `interactionHandler.ts`; per-view `Draggable` strategy; drag + keyboard share one commit path.
- **ADR-16**: **extend the one `WorkspaceView`** (layout union + swimlane mode + zoom control); pure DOM, **no SVG**.
- **ADR-17**: `order` = **sparse-integer** insertion + rare atomic renumber. **ADR-18**: `storyDay` **integer snap**, never touch `order`.
- **ADR-19**: **read-only** location scope resolver; cycle/depth guard (`MAX_DEPTH=32`).
- **ADR-20**: swimlane **read-only** mode; grouping key persisted per-scope. **ADR-21**: **ephemeral** zoom (buttons + wheel).
- **ADR-22**: **hybrid** re-render (optimistic + `metadataCache.changed`). **ADR-23**: **per-file** debounce.
- **ADR-24**: error = **inline-card + `Notice`**. **ADR-25**: **last-write-wins** (v0.4). **ADR-26**: **spy-able** `processFrontMatter` mock.

**Cross-cutting acceptance gates on EVERY task**:
- **Frontmatter is truth** (CON-1): writes go only through `commit`/`commitMany`; the plugin owns no state.
- **Cleanup** (CON-4): all DOM/pointer/key/cache listeners via `registerDomEvent`/`registerEvent`/`register*`; assert teardown with the mock's `_runCleanup()`.
- **Keyboard alternative** (F8/CON-9): every drag feature ships a keyboard command producing the identical write; interactive elements carry roles/labels + a polite live region; drill wins over drag on `[data-sf-link]`.
- **TS strict, no `any`** (CON-3); **no schema change** (CON-6); **no runtime `<style>`** (CON-5).

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

- [x] [Phase 1: Pure models (kanban/plotgrid/swimlane/locationTree + order/day math)](phase-1.md)
- [x] [Phase 2: Write seam — commitMany + spy-able mock](phase-2.md)
- [x] [Phase 3: InteractionHandler — pointer drag + keyboard + debounced commit](phase-3.md)
- [ ] [Phase 4: Read-only renderers — Locations tree + Swimlanes + Zoom/pan](phase-4.md)
- [ ] [Phase 5: Write-back renderers — Kanban + Plotgrid](phase-5.md)
- [ ] [Phase 6: Host wiring + integration + gates + finalize](phase-6.md)

**Dependency graph**
- **Phase 1** (pure models) and **Phase 2** (write seam + mock) are independent → **parallel** from the start.
- **Phase 3** (InteractionHandler) depends on **Phase 2** (calls `commit`/`commitMany`).
- **Phase 4** (read-only renderers) depends only on **Phase 1** → **parallel** with Phases 2/3; internally T4.1∥T4.2∥T4.3.
- **Phase 5** (write-back renderers) depends on **Phase 1 + 2 + 3**; internally **T5.1 (Kanban) ∥ T5.2 (Plotgrid)**.
- **Phase 6** (host wiring + integration + gates) depends on **Phase 4 + Phase 5**; the optional seed fixture (T6.0) is independent and may run from the start.

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
