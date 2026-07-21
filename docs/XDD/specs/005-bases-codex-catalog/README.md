# Specification: 005-bases-codex-catalog

## Status

| Field | Value |
|-------|-------|
| **Created** | 2026-07-21 |
| **Current Phase** | PRD |
| **Last Updated** | 2026-07-21 |

## Documents

| Document | Status | Notes |
|----------|--------|-------|
| requirements.md | in_progress | M4 PRD — 3 Bases surfaces (sidepanel engine · Codex/catalog · Inspector) |
| solution.md | pending | — |
| plan/ | pending | — |

**Status values**: `pending` | `in_progress` | `completed` | `skipped`

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-07-21 | Scaffold spec 005-bases-codex-catalog | M4 milestone per `docs/build-plan.md` (slug `bases-codex-catalog`, ships v0.2); next after M3 (spec 004, Implemented). Adds native Obsidian Bases as a view engine + Codex/catalog + editable Inspector. |
| 2026-07-21 | **Bases integration strategy (gate) → [ADR-0001](../../adr/0001-bases-integration-strategy.md)** | Spike verdict (verified against `obsidian.d.ts` 1.13.1 + docs + plugin survey): (1) sidepanel Bases engine = markdown ```base``` fence via `MarkdownRenderer` (read-only); (2) Codex/catalog general views = `registerBasesView` custom view types (bound to Bases API — **user-confirmed**); (3) Inspector/interactive = custom DOM + `processFrontMatter`. No public embed/results or write-back API exists; do not depend on 3rd-party plugins. minAppVersion + API-churn implications noted. |

## Context

Milestone **M4 — Bases + Codex + catalog** from `docs/build-plan.md` (slug
`bases-codex-catalog`, ships **v0.2**). Brings native Obsidian **Bases** into Story Forge
across three surfaces (see ADR-0001):

1. **Sidepanel Bases engine** — a `bases` engine-registry adapter that renders a curated
   `.base` into a Story Forge view-tab via a scoped ```base``` fence (`MarkdownRenderer`),
   completing the M2 registry slot (currently a "coming in M4" stub). Read-only.
2. **Codex + overview/catalog views** — Story Forge-registered Bases view type(s) via
   `registerBasesView` (Characters/Locations/Objects/Lore grids; overview catalog views);
   click → detail in the contextual panel. Bound to the Bases API.
3. **Inspector** — entity detail with **editable** properties via custom DOM +
   `app.fileManager.processFrontMatter` (plain-frontmatter writes, no plugin-owned state).

Plus the **curated catalog** (clone the markdown-mason `catalog/` pattern: `build-catalog.mjs`
+ checksummed `dist/index.json` + a "Browse official" modal with update notifications) so the
default `_forge` `.base` views (seeded in M3) become installable.

**Exit (build-plan):** Codex browsable; overview views installable from the catalog; spike
verdict recorded (ADR-0001 ✓) and the Inspector strategy chosen (③ custom ✓). v0.2 tag.

**Builds on:** M1 (spec 001), M2 (spec 002 — engine registry + consent gate + `bases` slot),
M3 (spec 004 — contextual panel, per-kind renderers, curated `sf-view` seed set). Governing
docs: `DESIGN.md`, `build-plan.md` (M4), `docs/XDD/adr/0001-bases-integration-strategy.md`.

**Open design tensions carried into PRD/SDD:** minAppVersion bump vs. feature-gate for the
Bases surfaces; how much of the Codex is interactive in v0.2 vs. deferred; catalog scope
(mason parity vs. minimal). Two items only a live prototype can settle: embedded-base
interactivity and Bases mobile parity.

---
*This file is managed by the xdd-meta skill.*
