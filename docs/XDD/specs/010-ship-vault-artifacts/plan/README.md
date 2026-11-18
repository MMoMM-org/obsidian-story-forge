---
title: "Ship the vault artifacts — implementation plan"
status: complete
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

PRD acceptance criteria are referenced as `PRD/F<n>.<m>`: feature `n`, criterion `m` in the
order listed under that feature.

---

## Context Priming

*GATE: Read all files in this section before starting any implementation.*

**Specification**:

- `docs/XDD/specs/010-ship-vault-artifacts/requirements.md` — Product Requirements
- `docs/XDD/specs/010-ship-vault-artifacts/solution.md` — Solution Design
- `docs/XDD/adr/0003-generated-bases-two-checksums.md` — the two-checksum model
- `docs/schema-change-runbook.md` — schema edits and their ripple

**Key Design Decisions**:

- **ADR-38**: schema-gen renders artifacts with `{{sf:<folder>}}` placeholders into
  `dist/artifact-index.json`, bundled like `catalog-index.json`; the dev vault is the index
  resolved with default folders.
- **ADR-39**: `schema:check` compares content byte for byte, scans for banned text, runs in CI.
- **ADR-40**: install records under `data.json → artifacts` (two checksums + params).
- **ADR-41**: one `managedFileWriter` on the Vault API; the catalog migrates onto it; artifacts
  never adopt a file they did not write.
- **ADR-42**: Scope tab "Story files" group, `StoryFilesModal`, command `set-up-story-files`,
  capability pointer — mockups signed off first.
- **ADR-43**: folder-free, neutral content; three empty value lists.
- **ADR-44**: scanner-aligned lint, disclosures, release 0.2.0 by the maintainer.

**Implementation Context**:

```bash
npm test              # vitest
npm run lint          # eslint (obsidianmd) + stylelint
npm run typecheck     # tsc --noEmit (also typecheck:test, typecheck:mock)
npm run schema:gen    # regenerate dev vault artifacts (+ artifact sources after Phase 1)
npm run schema:check  # drift gate
npm run build         # catalog:build + (artifacts:build) + tsc + esbuild
```

---

## Implementation Phases

Each phase is defined in a separate file. Tasks follow red-green-refactor: **Prime** (understand context), **Test** (red), **Implement** (green), **Validate** (refactor + verify).

> **Tracking Principle**: Track logical units that produce verifiable outcomes. The TDD cycle is the method, not separate tracked items.

- [x] [Phase 1: Generator, artifact index and drift gate](phase-1.md)
- [ ] [Phase 2: Setup core](phase-2.md)
- [ ] [Phase 3: Setup UI](phase-3.md)
- [ ] [Phase 4: Scanner-clean source](phase-4.md)
- [ ] [Phase 5: Documentation and disclosures](phase-5.md)
- [ ] [Phase 6: Live walk and release](phase-6.md)

Dependencies: 1 → 2 → 3 → 6. Phase 4 depends only on Phase 2 (the catalog migration touches
the same files) and can run beside Phase 3. Phase 5 needs Phase 3's UI wording.

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
| All phase files exist and are linked from this manifest as `[Phase N: Title](phase-N.md)` | ✅ |
