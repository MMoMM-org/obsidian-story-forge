---
title: "Undo journal for Story Forge's own writes"
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

### How to Ensure Specification Adherence

1. **Before Each Phase**: Complete the Pre-Implementation Specification Gate
2. **During Implementation**: Reference specific SDD sections in each task
3. **After Each Task**: Run Specification Compliance checks
4. **Phase Completion**: Verify all specification requirements are met

### Deviation Protocol

When implementation requires changes from the specification:
1. Document the deviation with clear rationale
2. Obtain approval before proceeding
3. Update SDD when the deviation improves the design
4. Record all deviations in this plan for traceability

## Metadata Reference

- `[parallel: true]` - Tasks that can run concurrently
- `[component: component-name]` - For multi-component features
- `[ref: document/section; lines: 1, 2-3]` - Links to specifications, patterns, or interfaces and (if applicable) line(s)
- `[activity: type]` - Activity hint for specialist agent selection

AC ids (`AC-F1.1` …) refer to the **SDD's Acceptance Criteria** section, which restates the PRD
features F1–F10 in EARS form.

---

## Context Priming

*GATE: Read all files in this section before starting any implementation.*

**Specification**:

- `docs/XDD/specs/009-undo-journal/requirements.md` - Product Requirements (F1–F10)
- `docs/XDD/specs/009-undo-journal/solution.md` - Solution Design (ADR-37…ADR-53, ACs, walkthroughs)
- `docs/XDD/ideas/2026-11-04-undo-journal.md` - the brainstormed design
- `docs/XDD/specs/009-undo-journal/mockups.html` - created in Phase 4; **binding** once signed off

**Key Design Decisions**:

- **ADR-44/45**: the writer is the only seam. `installWriteRecorder()` reports `before`/`after`
  captured inside the same `processFrontMatter` callback, and hands the journal the only
  unrecorded `restore` path.
- **ADR-46**: undo and redo are one symmetric algorithm. A conflict still writes the target, and the
  found value goes on the opposite stack. Partial failure leaves a reduced step on top.
- **ADR-38/39**: a gesture is an explicit group (`openGroup`/`track`/`close`). Undo first flushes
  pending Kanban writes, then asks every registered probe; any draft or in-flight write on a step's
  note refuses it.
- **ADR-40/48**: one `undo-journal.json` in `manifest.dir`, no device id; 50 steps, a 16,384-char
  value cap, a 1 MiB file cap, 1 s save debounce, flush on unload and quit.
- **ADR-37/53**: a global capture-phase keydown handler that works only in the Anvil or Workbench.
  It is unproven until the Phase 1 spike. A command arriving within 100 ms of a key trigger is
  ignored.
- **CON-8**: the mockups get sign-off before any UI code (Phase 4 opens with it).

**Implementation Context**:

```bash
# Testing
npm test                    # vitest unit + integration tests
npm run test:live           # live-vault tests (vitest.live.config.ts)

# Quality
npm run lint                # eslint (obsidianmd) + stylelint
npm run typecheck           # tsc --noEmit
npm run typecheck:test      # test tsconfig
npm run typecheck:mock      # the obsidian mock against obsidian.d.ts
npm run schema:check        # unaffected by this spec; must stay green

# Full validation
npm run build               # tsc check + esbuild production build
npm run dev                 # esbuild watch → test/StoryForge/.obsidian/plugins/story-forge/
```

Every new test is mutation-checked: run the mutation that should break it, and report it.

---

## Implementation Phases

Each phase is defined in a separate file. Tasks follow red-green-refactor: **Prime** (understand context), **Test** (red), **Implement** (green), **Validate** (refactor + verify).

> **Tracking Principle**: Track logical units that produce verifiable outcomes. The TDD cycle is the method, not separate tracked items.

- [x] [Phase 1: Live spike](phase-1.md)
- [x] [Phase 2: Journal core](phase-2.md)
- [x] [Phase 3: Gestures and pending work](phase-3.md)
- [x] [Phase 4: Mockup sign-off and the Workbench fix](phase-4.md)
- [x] [Phase 5: Controls, notices, keyboard and settings](phase-5.md)
- [ ] [Phase 6: Integration, live walk and drift check](phase-6.md)

Dependencies: 1 → 2 → 3 → 4 → 5 → 6. Phase 1 decides ADR-37. If the spike fails, Phase 5
drops the key handler (T5.4) and keeps commands and buttons. Phase 2 makes undo usable from the
command palette, so Phases 3–4 can be checked by hand before any button exists.

**Deviation from the agreed order (recorded):** the mockup sign-off moved from the start of
Phase 5 to the start of Phase 4. State U10, the Workbench field after an outside change, shows
Phase 4's #30 fix. Signing it off after building it would make the mockup a record rather than a gate.

**Second recorded deviation (CON-8):** Phase 2's palette commands already show Notices, before the
sign-off. Their wording (`stepLabel.ts`) is **provisional**: it exists so Phases 2–4 can be checked
by hand. It is not a design choice. T5.1 aligns it, and every test that asserts it, with the
signed-off U5–U9.

**Correction to the SDD:** the Kanban per-file debounce is 200 ms (`DEBOUNCE_MS`,
`src/pluginConstants.ts`), not 300 ms. The SDD is fixed in the same commit.

---

## Plan Verification

Before this plan is ready for implementation, verify:

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
| All phase files exist and are linked from this manifest as `[Phase N: Title](phase-N.md)` | ✅ |
