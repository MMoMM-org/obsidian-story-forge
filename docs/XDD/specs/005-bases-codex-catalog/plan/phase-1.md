---
title: "Phase 1: Foundation — Bases firewall, feature-detect, manifest bump"
status: completed
version: "1.0"
phase: 1
---

# Phase 1: Foundation — Bases firewall, feature-detect, manifest bump

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: SDD/ADR-9]` — single `src/bases/` typings firewall; build-time validation; schema smoke test
- `[ref: SDD/ADR-8]` — feature-detect via `registerBasesView` boolean (per render); `minAppVersion → 1.12.7`
- `[ref: SDD/Building Block View]` — `src/bases/` module layout (BasesAdapter, basesFence, basesConfig)
- `[ref: SDD/API-churn firewall]` — smoke-test canary contents

**Key Decisions**: ADR-8 (detect + floor), ADR-9 (firewall + canary). Mirror `EngineRegistry.getDataviewApi` (per-render, single-file cast home).

**Dependencies**: Phase 0 verdict recorded. Foundation for Phases 2, 3.

---

## Tasks

Establishes the Bases anti-corruption layer, the feature-detection primitive, and the version floor — everything downstream imports Bases only through here.

- [x] **T1.1 `src/bases/` adapter firewall** `[activity: backend-integration]`

  1. Prime: Read `[ref: SDD/ADR-9]`, `[ref: SDD/CON-3]`, and `EngineRegistry.getDataviewApi` (the per-render soft-detect + single-file `app as any` pattern to mirror).
  2. Test: `isBasesAvailable(app)` returns the captured `registerBasesView` boolean, re-evaluated per call (never cached); `basesFence.renderBaseFence(app, yaml, el, sourcePath, component)` wraps YAML as a ```base``` fence and calls `MarkdownRenderer.render`; `basesConfig` validates a well-formed `.base` against `BasesConfigFile` and rejects a malformed one.
  3. Implement: `src/bases/BasesAdapter.ts`, `src/bases/basesFence.ts`, `src/bases/basesConfig.ts` — the **only** modules importing Bases typings.
  4. Validate: unit tests pass; lint clean; types check; grep confirms no Bases typings imported outside `src/bases/`.
  5. Success:
     - [ ] `isBasesAvailable` re-reads per call `[ref: SDD/ADR-8]`
     - [ ] All Bases typings confined to `src/bases/` `[ref: SDD/CON-3; ADR-9]`

- [x] **T1.2 Bases API schema smoke-test canary** `[activity: testing]` `[parallel: true]`

  1. Prime: Read `[ref: SDD/API-churn firewall]` — the exact members to pin.
  2. Test: assert `Plugin.prototype.registerBasesView` exists and returns `boolean`; `BasesView` exposes `data`/`config`/`onDataUpdated`/`allProperties`; `BasesConfigFile` has `views`/`filters`/`formulas`.
  3. Implement: a canary test in the `npm test` suite (typings-shape assertions + a trivial `registerBasesView` returning a boolean — not a live grid).
  4. Validate: test passes against pinned `obsidian.d.ts` 1.13.1; would fail loudly on a member rename.
  5. Success: canary breaks on a Bases-API-shape regression, not at runtime `[ref: SDD/ADR-9]`

- [x] **T1.3 `minAppVersion` bump + stale-guard cleanup** `[activity: config]` `[parallel: true]`

  1. Prime: Read `[ref: SDD/CON-5]`, `[ref: SDD/Technical Debt]` (the "1.5.7" eslint-disable comments in `main.ts`/`SidebarView.ts`).
  2. Test: `manifest.json minAppVersion === "1.12.7"`; the previously-guarded APIs are now unconditionally in-range.
  3. Implement: bump `manifest.json`; revisit the `obsidianmd/no-unsupported-api` eslint-disable justifications citing "1.5.7" so the comments no longer misstate the floor (guards may stay; comments must be accurate). **(This discharges the SDD's carried debt task.)**
  4. Validate: lint clean; build passes; core panel + Dataview unaffected.
  5. Success: floor is 1.12.7 and no comment claims 1.5.7 `[ref: PRD/AC-F5.4; SDD/ADR-8]`

- [x] **T1.4 Phase Validation** `[activity: validate]`
  - Run all Phase 1 tests. `npm test`, `lint`, `typecheck`, `typecheck:test` pass. Verify the firewall boundary (no Bases imports outside `src/bases/`) and that `schema:check` stays green (no schema change).
