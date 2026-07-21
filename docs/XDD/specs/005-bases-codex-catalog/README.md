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
| requirements.md | completed | M4 PRD — F1–F6 (+F7/F8 Should), 42 Gherkin ACs; 6 SDD-level open questions |
| mockups.html | completed | 14 styled states S44–S57 (Codex/Overview grids · catalog modal · Inspector form), M3 visual shell |
| solution.md | pending | — |
| plan/ | pending | — |

**Status values**: `pending` | `in_progress` | `completed` | `skipped`

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-07-21 | Scaffold spec 005-bases-codex-catalog | M4 milestone per `docs/build-plan.md` (slug `bases-codex-catalog`, ships v0.2); next after M3 (spec 004, Implemented). Adds native Obsidian Bases as a view engine + Codex/catalog + editable Inspector. |
| 2026-07-21 | **Bases integration strategy (gate) → [ADR-0001](../../adr/0001-bases-integration-strategy.md)** | Spike verdict (verified against `obsidian.d.ts` 1.13.1 + docs + plugin survey): (1) sidepanel Bases engine = markdown ```base``` fence via `MarkdownRenderer` (read-only); (2) Codex/catalog general views = `registerBasesView` custom view types (bound to Bases API — **user-confirmed**); (3) Inspector/interactive = custom DOM + `processFrontMatter`. No public embed/results or write-back API exists; do not depend on 3rd-party plugins. minAppVersion + API-churn implications noted. |
| 2026-07-21 | **M4 scope decisions (post-research)** | After parallel Requirements/UX/Integration research: (a) **Codex = read-only** click-through → detail in the M3 contextual panel (reuse `_drillInto`/`navStack`); (b) **Inspector = minimal editable** in v0.2 — read-only detail reuses the M3 panel, plus editable scalar/enum fields proving the `processFrontMatter` write-back loop end-to-end; full field types (wikilink chips) + validation deferred (M6-adjacent); (c) **Catalog = bundled/offline** (`catalog/` → `build-catalog.mjs` → checksummed `dist/index.json`, "Browse official" modal reuses `ImportPickerModal`/`ConsentGate`/M2 checksum-drift); update notifications = Should; (d) **minAppVersion → 1.12.7** (current stable; 1.13 is Catalyst/beta) — honest floor, Bases needs ≥1.10; (e) **Bases-off handling** = warn + point the user to enabling core Bases, then degrade exactly like missing/disabled Dataview (reuse the M2 `_renderEngineMissing`/S11 engine-missing pattern). UX produced mockup states S44–S57. |

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
