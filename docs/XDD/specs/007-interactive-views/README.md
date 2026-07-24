# Specification: 007-interactive-views

## Status

| Field | Value |
|-------|-------|
| **Created** | 2026-07-24 |
| **Current Phase** | PRD |
| **Last Updated** | 2026-07-24 |

## Documents

| Document | Status | Notes |
|----------|--------|-------|
| requirements.md | completed | M6 PRD — F1–F3 write-back (Kanban/Plotgrid/Timeline-placement) + F4–F6 read-only views (Locations tree/Swimlanes/Zoom-pan) + F7 write-discipline + F8 accessibility. All flat Must. ~35 Gherkin ACs, no schema changes. No telemetry (ACs + manual walk). 7 SDD-level open questions (non-blocking) |
| solution.md | pending | M6 SDD — not started |
| plan/ | pending | M6 PLAN — not started |

**Status values**: `pending` | `in_progress` | `completed` | `skipped`

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-07-24 | Scaffold spec 007-interactive-views | M6 milestone per `docs/build-plan.md` (slug `interactive-views`, ships v0.4); next after M5 (spec 006, Implemented → merged to `main` at `77f398d`). |
| 2026-07-24 | **Workflow: PRD-first, Agent Team mode, full scope** (user) | Scope call = **build-plan M6 interactive-write views (Kanban / Plotgrid / Timeline-placement / Locations tree) PLUS the M5 ADR-13 deferrals (swimlanes + zoom/pan/By-POV)** in one v0.4. Research perspectives: Requirements + Technical (folds Performance/Integration: write-back concurrency, `processFrontMatter`) + UX. |
| 2026-07-24 | **Research complete (Agent Team) — no schema gaps** | 3 repo-grounded agents (Requirements/Technical/UX) reported. **Schema: zero gaps** — all 6 features use existing fields (`status`,`order`,`storyDay`,`plotlines`,`pov`,`location`,`world`). **Technical spine:** reuse `src/inspector/frontmatterWriter.ts` `commit()` (atomic, validated, `fileManager.processFrontMatter`); **pointer events** (not HTML5 DnD, mobile-safe, keeps titles drillable via `[data-sf-link]` guard); **pure DOM, no SVG**; `order` via **sparse integers**; reuse `workspaceModel`/`sceneMapper`/`resolveWorkspaceScope`/`collapseStore`; new `interactionHandler` + per-view controllers. **UX:** 12 mockups S73–S84 + a keyboard alternative per drag (community-directory compliance). 7 ADR candidates surfaced for SDD. |
| 2026-07-24 | **4 scope calls: flat-Must, read-only tree, read-only swimlanes, integer storyDay** (user) | **(1)** All six features are **flat Must** for v0.4 (no Must/Should/Could tiers). **(2)** **Locations tree = read-only** nav (world-hierarchy render + drill; no drag-to-reparent write). **(3)** **Swimlanes = read-only view mode** (group Timeline by POV/location/plotline + drill; no cross-lane write). **(4)** Timeline-placement drag **snaps to integer `storyDay`**. Net: **3 write-back features** (Kanban→`status`+`order`, Plotgrid→`plotlines`, Timeline-placement→`storyDay`) + **3 read-only view additions** (Locations tree, Swimlanes, zoom/pan+By-POV). Subway map stays **M7**. |
| 2026-07-24 | **PRD complete** (`requirements.md`) | Written from research + 4 locked decisions. Features: **F1 Kanban** (drag→`status`+`order`, sparse-int insertion), **F2 Plotgrid** (toggle cell→`plotlines` add/remove), **F3 Timeline-placement** (drag→integer `storyDay`, never touch `order`), **F4 Locations tree** (read-only `world` hierarchy, cycle-guarded), **F5 Swimlanes** (read-only Timeline grouping by POV/location/plotline), **F6 Zoom/pan** (ephemeral, names stay clickable); cross-cutting **F7 write-discipline** (frontmatter-is-truth, reuse `commit()`, atomic, Cmd+Z, two-view consistency) + **F8 accessibility** (keyboard alt per drag, roles/live-region, drill-vs-drag separation). Won't: subway map (M7), drag-to-reparent, editable swimlanes, fractional storyDay, calendar math, multi-book drag. No telemetry — success = ACs + manual walk on seed vault. 7 SDD-level open questions logged (renumber threshold, debounce granularity, re-render trigger, error surface, swimlane-key persistence, concurrent-edit UX, zoom controls). No `[NEEDS CLARIFICATION]` markers. |

## Context

**M6 — Interactive views (drag → frontmatter, v0.4)** per `docs/build-plan.md`:

> Custom DOM + write-back, all via plain-Property writes:
> - **Kanban:** scenes in `status` columns; drag → write `status` (and `order`).
> - **Plotgrid:** plotline × scene matrix derived from `plotlines`; toggle cell → write the scene's `plotlines`.
> - **Timeline placement:** drag a card → write `storyDay`.
> - **Locations — hierarchical tree:** nest over the `world` chain.
>
> **Exit:** each interaction writes clean frontmatter, verifiable in the Properties UI; no plugin-owned state.

**Inherited from M5 (spec 006) — deferred to M6 via ADR-13:**
- Timeline **swimlanes** (keys: POV, location, plotline) — the Rail|Swimlane toggle.
- Timeline **zoom / pan** controls; the **By-POV** grouping control.
- (Subway map is **M7-optional** per the build plan — confirm during PRD whether it stays out of M6.)

**Scope tension to reconcile in the PRD:** "M6" means the build-plan interactive-write set
(Kanban / Plotgrid / Timeline placement / Locations tree) **plus** the M5-deferred read-view
enrichments (swimlanes + zoom/pan/By-POV). Whether all of it ships in one v0.4 or splits needs
resolving up front.

**Foundations already in place (from M5, on `main`):** `src/workspace/` render host
(`WorkspaceView`, `workspaceModel`, `sceneMapper`, `renderTimeline`/`renderPlotlines`/
`renderNavigator`, `renderShared`, `collapseStore`), the `resolveWorkspaceScope` seam, the
frontmatter-is-truth principle (plugin writes only plain Properties, never owns state), and
the `SceneRow`/`Link {name,path}` model with resolved paths for drill/open.

---
*This file is managed by the xdd-meta skill.*
