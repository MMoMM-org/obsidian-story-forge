---
title: "Query Engine & Dataview — implementation plan"
status: pending
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
- `docs/XDD/specs/002-query-engine-dataview/requirements.md` — PRD (F1–F4, 29 Gherkin ACs)
- `docs/XDD/specs/002-query-engine-dataview/solution.md` — SDD (components, interfaces, ADR-1…9, runtime flows, EARS ACs)
- `docs/XDD/specs/002-query-engine-dataview/mockups.html` — UI source of truth (states S11–S26)
- `docs/XDD/specs/001-core-infrastructure/solution.md` — M1 SDD (seams: ViewRecord, ViewStore, NoteContext, SidebarView)

**M1 code to read before touching any file**:
- `src/store/types.ts` — `ViewRecord`, `StoryForgeData`, `applyDefaults`, `parseOkayed`, `isEngine`
- `src/store/ViewStore.ts` — `getViews`, `setRecord`, `deleteRecord`; the read-modify-write pattern
- `src/views/SidebarView.ts` — `_renderResolved` (~line 504, the seam M2 replaces); `onClose`
- `src/scoping/NoteContext.ts` — `NoteContext`, `ResolvedEntity` (passed to every engine's `render()`)
- `src/scoping/ScopingService.ts` — native context resolver; inspires `NativeScopingEngine`
- `src/main.ts` — plugin entry; injection site for EngineRegistry + ConsentGate + late-join listener
- `src/settings/SettingsTab.ts` — `display()` to extend with the Views section
- `test/__mocks__/obsidian.ts` — Obsidian mock; `_runCleanup()` for leak assertions; `Component` mock

**Reference (read-only, sibling plugin)**:
- markdown-mason `src/consent/disclosure.ts` + `src/consent/checksum.ts` — the proven SHA-256 consent pattern M2 clones; read before implementing Phase 1

**Key Design Decisions** (from SDD ADR-1…9):
- **ADR-1** `QueryEngine` interface + `EngineRegistry` (wired engines only) + separately-held `NativeScopingEngine` fallback. Registry may be empty; native fallback always exists on `SidebarView`.
- **ADR-2** Feature detection via `(app as any).plugins.plugins["dataview"]?.api` + `workspace.onLayoutReady` + late-join `dataview:api-ready` listener. Re-check on every render.
- **ADR-3** Subject scoping: `filePath = ctx.activeFile.path` (subject path, NOT view-note path). Query read fresh from `view.source` at render time — never stored on `ViewRecord`.
- **ADR-4** SHA-256 over raw fenced-block bytes via `node:crypto` (dynamic import); byte-exact (CRLF ≠ LF); output `"sha256:<hex>"`. Desktop-only. Cloned from markdown-mason.
- **ADR-5** Consent policy: DataviewJS → full disclosure always; DQL → light confirm only; re-consent on version-OR-checksum drift; kill-switch preserves `okayed`; safe-default disabled.
- **ADR-6** View-definition format: `sf-view:true` vault note + exactly one fenced query block. `sf-version` integer required; engine inferred from fence language.
- **ADR-7** Leak-free lifecycle: each engine owns one Obsidian `Component`; teardown order is teardown → `body.empty()` → render. `component.unload()` in `teardown()` + `SidebarView.onClose()`.
- **ADR-8** View management: extend existing `SettingsTab.display()` with a "Views" section (S24–S26 rows). No new modal type in M2.
- **ADR-9** Store-generated id (UUID/nanoid); `source` carries vault path. Rename breaks `source`; accepted limitation; no UUID written to vault notes.

**Implementation Context**:
```bash
# Testing
npm test                    # vitest unit tests (test/__mocks__/obsidian.ts)
npm run typecheck           # tsc --noEmit (src/)
npm run typecheck:test      # tsc --noEmit (test/)  ← include test files too
npm run test:live           # vault-backed live tests (test/live/)

# Quality
npm run lint                # eslint (obsidianmd rules) + stylelint
npm run schema:check        # frontmatter schema drift gate

# Build / dev
npm run build               # tsc check + esbuild production
npm run dev                 # esbuild watch → deploys into test/StoryForge/.obsidian/plugins/story-forge/
```

---

## Implementation Phases

Each phase is a separate file. Tasks follow red-green-refactor: **Prime** (context), **Test** (red), **Implement** (green), **Validate** (refactor + verify).

> **Tracking Principle**: track logical units that produce verifiable outcomes; the TDD cycle is the method, not separate tracked items.

**Dependency graph:** Phase 1 → (Phase 2 ∥ Phase 3) → Phase 4 → Phase 5.

- [x] [Phase 1: Consent & checksum foundation](phase-1.md)
- [x] [Phase 2: View import & parsing](phase-2.md)
- [x] [Phase 3: Query engines & registry](phase-3.md)
- [ ] [Phase 4: Panel & settings integration](phase-4.md)
- [ ] [Phase 5: Integration & validation](phase-5.md)

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

---

## Coverage map (PRD → tasks)

| PRD feature | Acceptance criteria | Tasks |
|---|---|---|
| **F1 — Dataview adapter** | DQL renders in tab | T3.3 |
| | DataviewJS renders in tab | T3.4 |
| | Dataview absent → S11, no crash | T3.2 |
| | Native fallback unaffected when Dataview absent | T3.1, T4.1 |
| | `enableDataviewJs` off → friendly prompt | T3.4 |
| | DataviewJS on mobile → platform-restriction | T3.4 |
| | DQL re-runs on active-note change | T3.3, T4.1 |
| | Late-join `dataview:api-ready` registers engines | T3.2, T4.4 |
| | Dataview version < 0.5.31 → engine-missing | T3.2 |
| **F2 — Consent gate** | DataviewJS not consented → S12, no execution | T1.3 |
| | Full disclosure modal (S20): name/desc/source/code/checksum | T1.4 |
| | "Enable" writes `okayed:{version,checksum}` + `enabled:true` in one call | T1.3, T1.4 |
| | Checksum drift → S17, stops execution | T1.2, T1.3 |
| | Version drift → S17 | T1.3 |
| | Kill-switch: `enabled:false`, `okayed` preserved | T1.3 |
| | Re-enable without drift → renders, no modal | T1.3 |
| | DQL → light confirm (S21) only | T1.4 |
| | DQL drift → light re-confirm (S21) | T1.4 |
| | Any unenabled view → `enabled:false`, no query | T1.3 |
| | Remove → `deleteRecord`, vault note untouched | T2.2 |
| | Byte-exact SHA-256 via `node:crypto`, `sha256:` prefix | T1.2 |
| **F3 — User-import flow** | Import picker lists `sf-view:true` notes from `metadataCache` | T2.3 |
| | Import creates ViewRecord (`engine`, `provenance:"imported"`, `enabled:false`, `okayed:null`) | T2.2 |
| | 0 fenced blocks → reject "No query block found" | T2.1 |
| | >1 fenced blocks → reject "exactly one query block" | T2.1 |
| | Already-imported path → "already imported" indicator | T2.2 |
| | Bind step (S22): pre-fills `sf-name` as tab label, offers command registration | T4.3 |
| | After bind → tab in "Disabled" or "Consent required" state | T4.1, T4.3 |
| **F4 — View management in Settings** | Settings "Views" section: name/engine/state per row | T4.2 |
| | Engine absent → S26 row state | T4.2 |
| | Enable action on DataviewJS row → opens S20 disclosure modal | T4.2 |
| | Disable → `enabled:false`, S16 state; `okayed` preserved | T4.2 |
| | Remove → `deleteRecord`, tab disappears, vault note unchanged | T4.2 |
| | Plugin reload restores all ViewRecords + states from `data.json` | T4.4, T5.3 |
