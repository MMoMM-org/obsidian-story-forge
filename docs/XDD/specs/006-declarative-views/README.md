# Specification: 006-declarative-views

## Status

| Field | Value |
|-------|-------|
| **Created** | 2026-07-23 |
| **Current Phase** | Ready |
| **Last Updated** | 2026-07-23 |

## Documents

| Document | Status | Notes |
|----------|--------|-------|
| requirements.md | completed | M5 PRD — F0–F6 Must + F7–F11 Should/Could; Gherkin ACs grounded in schema + seed; F5 degrade superseded by SDD ADR-1 (reconciled) |
| mockups.html | completed | 12 states S59–S70 (Timeline populated/act-boundary/order-fallback/empty/No-act; Plotlines groups/Unassigned/multi-plotline/collapsed/unresolved; workspace→panel drill; no-scope hint). Authored early (before UI phases) per "UI as mockups"; S63/S68 re-purposed from the superseded degrade |
| solution.md | completed | SDD — 9 ADRs (all confirmed); metadataCache-scan render host (no Bases dep, no degrade), one polymorphic `story-forge-workspace` ItemView, scope seam in `src/scoping/`, TS sort/group, collapse per view+scope+group, unresolved-plotline flagged group; EARS ACs; mockup states S59–S70 (S63/S68 degrade superseded) |
| plan/ | completed | 6 phases, ~15 tasks (TDD Prime/Test/Implement/Validate). P1 models ∥ P2 scope; P3 render (←P1); P4 view/registration/follow/drill (←P1+2+3); P5 seed+M4 recon; P6 mockups/integration/gates. Every F0–F6 AC + SDD component mapped |

**Status values**: `pending` | `in_progress` | `completed` | `skipped`

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-07-23 | **Alignment check — Excellent (1 plan correction)** | Post-PLAN drift validation: all plan targets confirmed present against current code (components.ts exports, `SidebarView.showFile`/`_drillInto`/`_toggleSection`/`data-sf-*` routing, `NativeScopingEngine` pattern, `activeKind` book/plotline/scene, `CodexView`/`main.ts` registration, schema field names). **Correction:** ADR-9's premise was wrong — M4 Codex tests use in-code fixtures (not live-vault counts), so extending the seed does NOT break the M4 suite; plan T5.2 downgraded from a change task to a no-op safety check. Clarified: book & plotline notes co-live in `20 Planning/` → scope seam distinguishes by `type`, not folder. SDD ADR-4/ADR-9 + plan phase-5 updated. |
| 2026-07-23 | **PLAN complete** (`plan/`) | 6 phases / ~15 TDD tasks: P1 pure models (`timelineModel`/`plotlineModel`) ∥ P2 scope seam (`resolveWorkspaceScope`); P3 render (`renderWorkspace` + `collapseStore` + CSS, ← P1); P4 `WorkspaceView` + registration + follow + drill (← P1+P2+P3); P5 seed extension + M4 Codex count reconciliation; P6 mockups S59–S70 + integration/E2E + gates + finalize. Every F0–F6 AC and every SDD component maps to a task; dependencies explicit (P1∥P2, P5 parallel); pure model functions are the first RED tests. |
| 2026-07-23 | **SDD complete** (`solution.md`) — 9 ADRs confirmed | Key call **ADR-1**: data source is a **`metadataCache` scan (not a Bases view)** — static `.base` filters can't scope to the active note, so a scan (M3 `NativeScopingEngine` pattern) is required; side effect: **no Bases dependency → PRD F5 "Bases-off degrade" superseded** (reconciled into the PRD). ADR-2 main-area follow-the-note ItemView; ADR-3 one polymorphic `story-forge-workspace` view (layout: timeline\|plotlines); ADR-4 `resolveWorkspaceScope` seam in `src/scoping/`; ADR-5 TS sort/group (coalesce storyDay/order, act + "No act", plotline fan-out + "Unassigned"); ADR-6 collapse per view+scope+group; ADR-7 unresolved plotline → flagged group; ADR-8 reuse M3 components + read-only M6 seam; ADR-9 extend seed + update M4 Codex counts in lockstep. New module `src/workspace/` (WorkspaceView, workspaceModel, renderWorkspace, collapseStore). No `[NEEDS CLARIFICATION]` markers. |
| 2026-07-23 | **PRD complete** (`requirements.md`) | Written from the repo-grounded research + 4 locked decisions. Features: F0 seed extension (enabling), F1 Timeline (storyDay→order sort, act grouping, `when` label), F2 Plotlines (group + Unassigned bucket + collapsible), F3 book/plotline scope-following, F4 scene→panel drill (S56 seam), F5 empty/degrade/missing-field tolerance, F6 read-only; F7–F8 Should, F9–F11 Could; Won't = drag/edit/spatial/Kanban/Plotgrid/note-panel/calendar (M6+). All Gherkin ACs grounded in `schema/scene.json` + seed data. No telemetry — success = ACs pass + manual walk. 5 SDD-level open questions (scope-seam shape, collapse persistence, unresolved-plotline handling, shared vs separate render host, seed impact on M4 Codex). No `[NEEDS CLARIFICATION]` markers remain. |
| 2026-07-23 | **Research complete (Standard mode) + 4 scope decisions** | Parallel Requirements/UX/Technical research (all repo-grounded). User decisions: **(1) Surface** → both Timeline & Plotlines are **main-area workspace views** (like M4 Codex), scene-click drills the M3 sidebar panel (S56 seam) — not sidebar tabs/note panel. **(2) Build/Buy** → **plugin-owned custom render host now** (not curated `.base` fences) — full DOM control, avoids the M6 drag→frontmatter rework, aligns with the future plugin-owned Codex direction. **(3) Scope-following** → build the **full book/plotline scope seam** (new work in `src/scoping/`; no "current book/plotline" concept exists today) to meet the exit criterion. **(4) Seed** → **extend the test vault** (act-2 scene, storyDay-less scene, multi-plotline scene, no-plotline scene, zero-scene plotline) so AC-T3/T4 + AC-P2/P3/P5 are testable. |
| 2026-07-23 | **Scope expanded vs build-plan framing** | build-plan.md called M5 "mostly Bases/Dataview, little custom." User chose the custom-render-host + full-scope-seam path → M5 is **more custom** than that framing. Rationale: the read-only Bases-fence path gives no interaction hooks for M6 (drag→frontmatter) and can't cleanly do list-valued plotline grouping / a labelled Unassigned bucket / coalesced storyDay-order sort; owning the render host now avoids rework and unblocks M6. |
| 2026-07-23 | Scaffold spec 006-declarative-views | M5 milestone per `docs/build-plan.md` (slug `declarative-views`, ships v0.3); next after M4 (spec 005, Implemented → merged to `main`). |

## Context

**M5 — Declarative workspace views (v0.3)** per `docs/build-plan.md`:

> Mostly Bases/Dataview, little custom:
> - **Timeline (linear):** scenes by `storyDay` (fallback `order`), grouped by act; `when` as the display label. No spatial drag yet.
> - **Plotlines (list):** group scenes by `plotlines`; collapsible; unassigned bucket.
>
> **Exit:** both render from frontmatter and follow book/plotline scope.

Builds on the M2 engine/consent + M3 panel + M4 Bases/catalog foundations. These
are read-only, frontmatter-driven views (no drag → frontmatter; that is M6
`interactive-views`). The Codex tab-bar/ItemView polish and interactive/spatial
views remain deferred to later milestones.

---
*This file is managed by the xdd-meta skill.*
