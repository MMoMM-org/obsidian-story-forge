---
title: "M4 — Bases, Codex & curated catalog (Implementation Plan)"
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

## Output Schema

### PLAN Status Report

| Field | Value |
|-------|-------|
| specId | 005-bases-codex-catalog |
| title | M4 — Bases, Codex & curated catalog |
| status | DRAFT |
| totalTasks | 28 (across 7 phases) |
| parallelTasks | 9 |
| specReferences | every task carries `[ref: …]` |
| clarificationsRemaining | 0 |

---

## Specification Compliance Guidelines

### Deviation Protocol
When implementation requires changes from the SDD: document the deviation + rationale, obtain approval, update the SDD if the deviation improves the design, and record it here for traceability. The most likely deviation source is **Phase 0** (the prototype): if embedded-base interactivity or mobile parity fails, ADR-10's documented fallbacks apply (read-only fence; desktop-only Bases surfaces via the existing `platform-restricted`/S11 path) — record the prototype verdict here before Phase 2 begins.

### Phase 0 verdict (recorded 2026-07-21)

Resolved from the installed **obsidian 1.13.1** typings + official Obsidian docs (empirical spike de-scoped: mobile testing not possible; desktop items answered from the documented API). Net: **GO to build, two ADR-10 fallbacks active.**

| Item | Verdict | Basis |
|------|---------|-------|
| F1 fence engine (`MarkdownRenderer.render` + `base` fence) | **GO** | `render(app, md, el, path, component)` public/non-deprecated (obsidian.d.ts 4147); `base` fence handled by the core Bases code-block processor |
| F2 Codex (`registerBasesView` + `BasesView`) | **GO** | `registerBasesView` public `@since 1.10.0` (5009); `BasesView` `@since 1.10.0` (1105); `BasesEntry.getValue`/`onDataUpdated` shapes confirmed |
| ADR-8 detect-via-boolean | **CONFIRMED** | `registerBasesView` JSDoc: "returns false if bases are not enabled in this vault" — explicit in typings + docs |
| ADR-5 vault-only `.base` placement | **CONFIRMED** | Vault API is scoped to app-visible files; config dir (`.obsidian/…`) is adapter-only → a plugin-dir `.base` is invisible to Bases. Materialising installs into `00 Meta/Bases` is **necessary**, not just tidy |
| F1 teardown (owned `Component`) | **GO** | `component.unload()` mirrors `DataviewDqlEngine`; runtime leak-free-ness not docs-confirmable → keep CON-4 teardown→empty→render discipline |
| **F1 fence interactivity** | **GO-WITH-FALLBACK** | Bases embed docs unpublished (404 on 2026-07-21). **Fallback active: fence stays read-only** (already F1 scope; fence has no public write API regardless) |
| **Mobile parity** | **DESKTOP-ONLY fallback** | Mobile untestable. **Fallback active: Bases surfaces gate desktop-only** via existing `platform-restricted`/S11 path; `isDesktopOnly` stays `false` (non-Bases features still work on mobile) |

Runtime caveats carried forward (not blockers): actual leak-free teardown and fence interactivity remain empirically unverified — the optional throwaway harness (`src/_spike/basesSpike.ts` + a dev command in `main.ts`) can confirm them later if desired. No production code should assume interactivity or mobile Bases support.

### Phase 1 deviation — ADR-8 detect: cache-at-onload, not per-render (2026-07-21, user decision)

During T1.1 review a correctness bug surfaced: the first implementation made `isBasesAvailable` *call* `registerBasesView` on every render as a "probe." `registerBasesView` is a **side-effectful registration** (registers a persistent view type; the Phase 0 report explicitly said "call inside onload only"), so a per-render call registers a junk probe view type and bypasses the plugin registration lifecycle — and the hand-rolled mock hid it (its `registerBasesView` was a pure boolean → falsely green tests).

**Resolution (user chose "call once at onload, cache" over a side-effect-free `internalPlugins` probe):** `registerCodexView(plugin)` runs once at onload and its boolean return is cached (plugin-scoped); `isBasesAvailable(plugin)` returns that cached value with no side effect. **Consequence:** runtime enable/disable of core Bases is re-detected only on plugin reload, not per render — the SDD ADR-8 note + F1/F5 traced walkthrough are updated to match; downstream must not promise event-driven runtime recovery. Signature corrected `app: App` → `plugin: Plugin` (the API lives on `Plugin`). Also fixed a mock faithfulness bug (`BasesView` result field `entries` → real name `data`).

## Metadata Reference
- `[parallel: true]` — tasks that can run concurrently
- `[ref: document/section]` — links to PRD/SDD/ADR
- `[activity: type]` — specialist-selection hint

---

## Context Priming

*GATE: Read all files in this section before starting any implementation.*

**Specification**:
- `docs/XDD/specs/005-bases-codex-catalog/requirements.md` — PRD (F1–F8, 42 Gherkin ACs)
- `docs/XDD/specs/005-bases-codex-catalog/solution.md` — SDD (ADR-1…ADR-10, module layout, EARS ACs)
- `docs/XDD/specs/005-bases-codex-catalog/mockups.html` — styled states S44–S57
- `docs/XDD/adr/0001-bases-integration-strategy.md` — locked Bases integration mechanisms

**Key Design Decisions** (from the SDD):
- **ADR-1** — Sidepanel Bases engine = `MarkdownRenderer` ```base``` fence in a `BasesFenceEngine implements QueryEngine`, mirroring `DataviewDqlEngine` (owned `Component` teardown).
- **ADR-2** — Codex = **one polymorphic** `registerBasesView` type (category from view config).
- **ADR-3** — Inspector = edit-mode overlay hosted **in `SidebarView`** via a delegated `InspectorController`.
- **ADR-4** — Codex→panel = new public `SidebarView.showFile(file)` delegating to the existing private `_drillInto`.
- **ADR-5** — a `bases` `ViewRecord.source` is raw `.base` YAML (checksummed like DQL); installs materialise the `.base` into a **settings-configurable folder, default `00 Meta/Bases`**; `fencedBlock`/`ConsentGate.evaluate` learn the bases source model.
- **ADR-6** — catalog reuses M2 with two minimal extensions: a `provenance` override on `ViewImporter`; a gate-less `ImportFlow.installCurated`. DataviewJS gates; `.base`/DQL install 1-click; checksum verify fails closed **before** any write.
- **ADR-7** — out-of-vocab `select`: type errors block, vocab violations warn; v0.2 uses a constrained dropdown.
- **ADR-8** — feature-detect via the `registerBasesView` boolean (per render); degrade via the existing `_renderEngineMissing` S11 path; `minAppVersion → 1.12.7`.
- **ADR-9** — all Bases typings confined to `src/bases/`; build-time `.base` validation + a schema smoke-test canary.
- **ADR-10** — prototype-conditional: Phase 0 proves interactivity + mobile parity before build.

**Implementation Context**:
```bash
# Testing
npm test                 # vitest unit tests
npm run typecheck:test   # test tsconfig (ignore IDE false positives on test/)

# Quality
npm run lint             # eslint (obsidianmd) + stylelint
npm run typecheck        # tsc --noEmit
npm run schema:check     # story-schema sync gate (must stay green — no schema change in M4)

# Build
npm run catalog:build    # NEW: catalog/ → checksummed dist/catalog-index.json + .base validation
npm run build            # tsc + esbuild production build
npm run dev              # esbuild watch → redeploys into test/StoryForge/
```

---

## Implementation Phases

Each phase is a separate file. Tasks follow red-green-refactor: **Prime** → **Test** (red) → **Implement** (green) → **Validate** (refactor + verify).

> **Tracking Principle**: Track logical units that produce verifiable outcomes. The TDD cycle is the method, not separate tracked items.

- [x] [Phase 0: De-risking prototype gate](phase-0.md)
- [x] [Phase 1: Foundation — Bases firewall, feature-detect, manifest bump](phase-1.md)
- [ ] [Phase 2: F1 sidepanel Bases engine + bases source-model + F5 degrade](phase-2.md)
- [ ] [Phase 3: F2 Codex + showFile seam](phase-3.md)
- [ ] [Phase 4: F3 overview views + F4 catalog pipeline & install + F7 updates](phase-4.md)
- [ ] [Phase 5: F6 Inspector + F8 read-only fields](phase-5.md)
- [ ] [Phase 6: Integration, E2E, manual verification & gates](phase-6.md)

### Dependency graph

```
Phase 0 (prototype gate) ──▶ [gates all build phases; sets ADR-10 fallbacks]
Phase 1 (firewall) ──▶ Phase 2 ──┐
                     └─▶ Phase 3 ─┼─▶ Phase 4 (needs the bases source-model from Phase 2)
Phase 5 (Inspector) depends only on M3 + Phase 1 detect ── can run parallel to Phase 3/4
All ──▶ Phase 6 (integration + gates + v0.2)
```

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
