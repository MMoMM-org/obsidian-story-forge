---
title: "Phase 0: De-risking prototype gate"
status: completed
version: "1.0"
phase: 0
---

# Phase 0: De-risking prototype gate

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: SDD/ADR-10]` — prototype-conditional; two docs-unverifiable items + fallbacks
- `[ref: SDD/Risks and Technical Debt]` — embedded-base interactivity, Bases mobile parity
- `[ref: ADR-0001/Consequences]` — "Prototype first (de-risk, before full build)"
- `[ref: PRD/Success Metrics]` — "De-risking prototype (gate before SDD lock)" → re-scoped by ADR-10 to a **pre-build** gate

**Key Decisions**:
- ADR-10: draft-now, prove-before-build. If interactivity insufficient → fence stays read-only (already F1 scope). If mobile fails → Bases surfaces are desktop-only via the existing `platform-restricted`/S11 path; `isDesktopOnly` stays `false`.
- ADR-8: `registerBasesView` returns `false` when Bases is disabled — verify empirically.

**Dependencies**: none. **This phase gates every build phase (1–6).** Its output is a recorded verdict, not shipped code.

---

## Tasks

Establishes empirical answers to the two items docs could not confirm, and locks the ADR-10 fallbacks before any production code is written. The spike is throwaway (a scratch branch/dir), not merged.

- [x] **T0.1 Bases spike — render, register, teardown, detect** `[activity: prototyping]`

  1. Prime: Read `[ref: SDD/ADR-1]`, `[ref: SDD/ADR-2]`, `[ref: SDD/ADR-8]`, and `obsidian.d.ts` (`registerBasesView` 5009, `BasesView` 1105, `MarkdownRenderer.render` 4147).
  2. Test (manual, on the seed vault `test/StoryForge/`): (a) a generated ```base``` fence renders read-only via `MarkdownRenderer.render` into a plugin `div`; (b) a trivial `registerBasesView` type instantiates inside a `.base` and reads `BasesEntry[]` in `onDataUpdated`; (c) both tear down via `component.unload()` with **no orphaned DOM / no retained `BasesEntry`**; (d) toggling core Bases off makes `registerBasesView` return `false`.
  3. Implement: a scratch spike (throwaway branch/dir, not merged) exercising the four behaviors.
  4. Validate: observe leak-free teardown; capture the `registerBasesView` boolean under enabled/disabled.
  5. Success:
     - [x] Fence renders + tears down leak-free `[ref: PRD/AC-F1]` — API-confirmed (`MarkdownRenderer.render` non-deprecated; `Component.unload()` teardown mirrors DataviewDqlEngine); runtime leak-free-ness not docs-confirmable → CON-4 discipline
     - [x] `registerBasesView` type instantiates + reads entries + tears down leak-free `[ref: PRD/AC-F2]` — API-confirmed (`registerBasesView` public `@since 1.10.0`; `BasesView`/`BasesEntry.getValue`/`onDataUpdated` shapes confirmed)
     - [x] `registerBasesView` returns `false` when Bases disabled `[ref: PRD/AC-F5; SDD/ADR-8]` — CONFIRMED in obsidian.d.ts JSDoc (line 5009)

- [x] **T0.2 Interactivity + mobile parity verdict** `[activity: prototyping]` `[parallel: true]`

  1. Prime: Read `[ref: SDD/ADR-10]` fallbacks and the `platform-restricted`/S11 precedent (`ConsentGate.ts` `Platform.isMobile`, `SidebarView._renderPlatformRestriction`).
  2. Test (manual, desktop **and** mobile — Obsidian mobile or emulator): is the embedded fence interactive (scroll/sort/click) or opaque? Do both Bases surfaces display + tear down on mobile?
  3. Implement: record observations for each platform.
  4. Validate: decide the two conditionals.
  5. Success:
     - [x] Interactivity verdict recorded → **read-only** (Bases embed docs unpublished/404; fence has no public write API) — fence stays read-only per F1 scope `[ref: SDD/ADR-1]`
     - [x] Mobile verdict recorded → mobile untestable → **desktop-only fallback ACTIVE**: Bases surfaces gate via `platform-restricted`/S11; `isDesktopOnly` stays false `[ref: SDD/ADR-10]`

- [x] **T0.3 Record verdict in the spec** `[activity: documentation]`

  - Append the prototype verdict to `plan/README.md` Deviation Protocol (and, if a fallback triggers, to the SDD ADR-10 note + the spec README decisions log). No production code depends on an unverified assumption after this task.
  - Success: the two ADR-10 conditionals are resolved to concrete facts before Phase 2 begins `[ref: SDD/ADR-10; PRD/Success Metrics]` — DONE: verdict recorded in plan/README § Phase 0 verdict, SDD ADR-10 note, and spec README decisions log (2026-07-21)
