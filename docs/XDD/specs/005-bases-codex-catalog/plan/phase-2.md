---
title: "Phase 2: F1 sidepanel Bases engine + bases source-model + F5 degrade"
status: pending
version: "1.0"
phase: 2
---

# Phase 2: F1 sidepanel Bases engine + bases source-model + F5 degrade

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: SDD/ADR-1]` — fence engine mirroring `DataviewDqlEngine`
- `[ref: SDD/ADR-5]` — bases `ViewRecord.source` = raw `.base` YAML; `fencedBlock`/`ConsentGate.evaluate` learn the bases source model
- `[ref: SDD/ADR-8]` — degrade via existing `_renderEngineMissing` S11 path (repurpose the `bases` copy → S46)
- `[ref: SDD/Implementation Examples]` — the BasesFenceEngine teardown example + engine-dispatch traced walkthrough
- `[ref: PRD/F1]`, `[ref: PRD/F5]`

**Key Decisions**: ADR-1 (fence engine, `ctx.activeFile.path` sourcePath), ADR-5 (source model — the biggest greenfield seam), ADR-8 (degrade reuse). No `SidebarView` teardown changes — the engine slots into `_prepareBody`/`_renderGen`.

**Dependencies**: Phase 1 (`src/bases/` firewall + detect). Phase 0 interactivity verdict (fence read-only confirmed).

---

## Tasks

Delivers a read-only Bases render engine in the sidebar (F1) and the honest degrade when Bases is off (F5), plus the source-model plumbing the catalog (Phase 4) reuses.

- [ ] **T2.1 Bases source-model seam in the M2 consent/import chain** `[activity: backend-integration]`

  1. Prime: Read `[ref: SDD/ADR-5]`, `[ref: SDD/Known Technical Issues]`, and `fencedBlock.ts` (`QUERY_LANGS`, `:20`), `ConsentGate.evaluate` (`:114`, reads source via `readFencedBlock`).
  2. Test: a `bases` record's `source` (raw `.base` YAML) is read as-is (not via a dataview fenced block); `ConsentGate.evaluate` classifies a bases record as **declarative → consented** (no modal); `computeChecksum` over the YAML matches the build-time value byte-for-byte.
  3. Implement: teach the source reader the bases model (a `bases`-aware branch so YAML sources bypass `QUERY_LANGS`); extend `ConsentGate.evaluate` with a declarative-bases branch.
  4. Validate: unit tests for bases + dataview records both pass; no regression to dataview evaluation (fail-closed still holds for missing source).
  5. Success:
     - [ ] Bases record source read without a dataview fence `[ref: SDD/ADR-5]`
     - [ ] Bases record evaluates consented (declarative) `[ref: PRD/F4 business rules; SDD/ADR-6]`

- [x] **T2.2 `BasesFenceEngine implements QueryEngine`** `[activity: backend-integration]`

  1. Prime: Read `[ref: SDD/ADR-1]`, the `DataviewDqlEngine` teardown pattern, and `QueryEngine.ts` (the reserved `bases` slot).
  2. Test: `render(view, ctx, el)` loads an owned `Component` before render, calls `renderBaseFence(...)` with `ctx.activeFile.path` as `sourcePath`, self-unloads on throw; `teardown()` unloads + nulls; a note missing a referenced field renders a blank/omitted cell (tolerated, no error).
  3. Implement: `src/engines/BasesFenceEngine.ts` (`kind = "bases"`).
  4. Validate: unit tests mirror the Dataview engine tests; leak-free teardown asserted via the mock's cleanup.
  5. Success:
     - [ ] Fence renders read-only in the container, fills the `bases` slot `[ref: PRD/AC-F1.1]`
     - [ ] Missing-field tolerated `[ref: PRD/AC-F1.5]`; leak-free teardown `[ref: PRD/AC-F1.3]`

- [ ] **T2.3 Register engine (detect-gated) + re-scope on note change** `[activity: backend-integration]`

  1. Prime: Read `EngineRegistry.buildEngineRegistry`/`populateRegistry` and `main.ts` (`populateRegistry` dataview tuple, `dataview:api-ready` late-join). Note ADR-8 revision (cache-at-onload): availability is captured once at onload via `registerCodexView(plugin)`, NOT per render.
  2. Test: when `isBasesAvailable(plugin)` is true (availability captured at onload), `registry.get("bases")` returns the engine; when false, it returns `undefined`; a Bases view-tab re-scopes on active-note change within the debounce window; Dataview and Bases tabs render through their own engines with no cross-engine bleed.
  3. Implement: wire the single onload availability capture (call `registerCodexView(plugin)` once in `main.ts` onload and cache its boolean — the Codex factory body itself lands in Phase 3); register `BasesFenceEngine` in `buildEngineRegistry` gated on `isBasesAvailable(plugin)`; extend `populateRegistry` to include `"bases"`.
  4. Validate: engine-dispatch traced walkthrough (SDD) holds; no cross-engine bleed test passes.
  5. Success:
     - [ ] Bases tab follows the active note `[ref: PRD/AC-F1.2]`; no cross-engine bleed `[ref: PRD/AC-F1.6]`

- [ ] **T2.4 F5 degrade — repurpose the S11 `bases` branch** `[activity: frontend-ui]` `[parallel: true]`

  1. Prime: Read `[ref: SDD/ADR-8]`, `[ref: PRD/F5]`, mockup **S46**, and `SidebarView._renderEngineMissing` (the `bases` branch "Engine coming in M4").
  2. Test: with Bases disabled, `registry.get("bases")` is undefined → the existing `!engine` branch renders the **S46 "enable Bases"** copy (not "coming in M4"); the plugin still loads fully; M3 panel + Dataview keep working; re-enabling Bases recovers on the next render (no reinstall).
  3. Implement: replace the `_renderEngineMissing` `bases` copy with the F5 warn+point text (S46), same structure/CSS (`sf-engine-missing sf-empty`).
  4. Validate: degrade + recovery tests pass; no new degrade renderer introduced.
  5. Success:
     - [ ] Plugin loads with Bases off; panel + Dataview functional `[ref: PRD/AC-F5.1]`
     - [ ] S46 degrade shown; renders on next render after re-enable `[ref: PRD/AC-F5.2, AC-F5.3]`

- [ ] **T2.5 Phase Validation** `[activity: validate]`
  - Run all Phase 2 tests. `npm test`, `lint`, `typecheck`, `typecheck:test` pass. Manually confirm on the seed vault: a curated `.base` renders read-only in a sidebar tab and follows the note; disabling core Bases shows S46; no leak on teardown `[ref: PRD/Success Metrics F1, F5]`.
