# Specification: 005-bases-codex-catalog

## Status

| Field | Value |
|-------|-------|
| **Created** | 2026-07-21 |
| **Current Phase** | Ready |
| **Last Updated** | 2026-07-21 |

## Documents

| Document | Status | Notes |
|----------|--------|-------|
| requirements.md | completed | M4 PRD — F1–F6 (+F7/F8 Should), 42 Gherkin ACs; 6 SDD-level open questions |
| mockups.html | completed | 14 styled states S44–S57 (Codex/Overview grids · catalog modal · Inspector form), M3 visual shell |
| solution.md | completed | SDD — ADR-1…ADR-10 (all confirmed); validated (PRD coverage ✓, all 13 code citations ✓, no FAILs); 2 findings applied |
| plan/ | completed | 7 phases (0–6), 28 TDD tasks; every F1–F8 AC + SDD component mapped; alignment-checked (all modify-targets confirmed, no drift) |

**Status values**: `pending` | `in_progress` | `completed` | `skipped`

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-07-21 | Scaffold spec 005-bases-codex-catalog | M4 milestone per `docs/build-plan.md` (slug `bases-codex-catalog`, ships v0.2); next after M3 (spec 004, Implemented). Adds native Obsidian Bases as a view engine + Codex/catalog + editable Inspector. |
| 2026-07-21 | **Bases integration strategy (gate) → [ADR-0001](../../adr/0001-bases-integration-strategy.md)** | Spike verdict (verified against `obsidian.d.ts` 1.13.1 + docs + plugin survey): (1) sidepanel Bases engine = markdown ```base``` fence via `MarkdownRenderer` (read-only); (2) Codex/catalog general views = `registerBasesView` custom view types (bound to Bases API — **user-confirmed**); (3) Inspector/interactive = custom DOM + `processFrontMatter`. No public embed/results or write-back API exists; do not depend on 3rd-party plugins. minAppVersion + API-churn implications noted. |
| 2026-07-21 | **Spec finalized — readiness HIGH → Ready** | All three docs complete + validated (PRD ✓, SDD ✓ ADR-1…10, PLAN ✓ 7 phases/28 tasks), no open `[NEEDS CLARIFICATION]` markers, full F1–F8 coverage, alignment-checked. Ready for implementation (start at Phase 0 prototype gate). Committed on branch `bases-codex-catalog` (docs-only). |
| 2026-07-21 | **PLAN complete + alignment-checked** (`plan/`) | 7 phases: P0 prototype gate (ADR-10, pre-build); P1 `src/bases/` firewall + feature-detect + minAppVersion bump + smoke-test canary; P2 F1 fence engine + bases source-model seam + F5 degrade; P3 F2 Codex + `showFile`; P4 F3 overviews + F4 catalog pipeline/install + F7; P5 F6 Inspector + F8; P6 integration/E2E/gates/v0.2. 28 TDD tasks, 9 parallel. Coverage: all F1–F8 ACs + every SDD component mapped to a task. Alignment: all plan modify-targets (fencedBlock QUERY_LANGS, ViewImporter provenance, ImportFlow gate, SidebarView `_renderEngineMissing`/`_drillInto`, EngineRegistry firewall, manifest floor) confirmed against current source — no drift. Parallelism: P5 Inspector can run alongside P3/P4. |
| 2026-07-21 | **SDD complete + validated** (`solution.md`) | 10 ADRs (all confirmed): fence engine (ADR-1), one polymorphic Codex type (ADR-2), Inspector-in-SidebarView (ADR-3), `showFile`→`_drillInto` (ADR-4), bases source-model + `00 Meta/Bases` folder (ADR-5), catalog reuse + 2 M2 extensions (ADR-6), out-of-vocab warn-not-block (ADR-7), feature-detect + S11 degrade + minAppVersion 1.12.7 (ADR-8), `src/bases/` churn firewall (ADR-9), prototype-conditional (ADR-10). Two-validator pass: PRD F1–F8 coverage ✓, all 6 open questions resolved ✓, all 13 load-bearing code citations CONFIRMED ✓, no scope creep, no FAILs. Applied fixes: catalog-index filename reconciliation note vs PRD `dist/index.json`; `basesConfig` added to component diagram. Carry to PLAN: task to revisit stale `minAppVersion 1.5.7` eslint-disable comments after the bump. |
| 2026-07-21 | Enter SDD phase — **Agent Team** research mode | PRD complete (no clarification markers); 6 SDD-level open questions to resolve. Agent Team chosen over Standard: M4 spans complex Bases-API integration + M2/M3 seam reuse + multiple cross-cutting concerns (integration, architecture, robustness) where conflicting perspectives are likely. |
| 2026-07-21 | **SDD open questions resolved** (Agent Team research + user calls) | 6 open questions settled: **Q1 Inspector home** → edit-mode overlay in `SidebarView` via a delegated `InspectorController` (reuses M3 detail); **Q2 Codex view-type** → ONE polymorphic `registerBasesView` type (category via `config.get`); **Q3 curated `.base` consent** → 1-click curated-trust (checksum is the trust model; only DataviewJS gates); **Q4 `showFile` seam** → public `SidebarView.showFile(file)` delegating to existing private `_drillInto`; **Q5 curated `.base` location** → **settings-configurable folder, default `00 Meta/Bases`** (user decision — colocates with M3-seeded `Canon.base`/`Manuscript.base`, guaranteed Bases-reachable, no config-dir risk); **Q6 out-of-vocab `select`** → type errors block, vocab violations warn (constrained dropdown in v0.2, pre-existing odd values display). |
| 2026-07-21 | **Critical greenfield seam identified** (Integration research) | `src/import/fencedBlock.ts` only recognises `dataview`/`dataviewjs` langs, so the M2 consent/import/checksum chain cannot read a `.base` source. SDD must define the **bases-record source model**: sidepanel-engine records carry raw `.base` YAML in `source` (checksummed like DQL, no vault file); catalog-installed Codex/overview `.base` files are written to the Q5 folder and their records reference the path. Also: `ViewImporter` hardcodes `provenance:"imported"` (needs a `curated` override) and `runImportFlow` always gates (needs a gate-less 1-click sibling flow). |
| 2026-07-21 | **Prototype timing** → draft SDD now, prototype-conditional (user decision) | Two docs-unverifiable items (embedded-base interactivity; Bases mobile parity) documented in the SDD as explicit assumptions + fallbacks (read-only fence if not interactive; desktop-only via the existing `platform-restricted`/S11 path if mobile fails, `isDesktopOnly` stays false). The de-risking prototype remains a gate **before build**, not before SDD authoring. |
| 2026-07-22 | **Codex chrome = Bases-native (Option A); ③-host is a future surface** (user decision) | T3.3 architecture fork resolved: the Codex tab bar is Obsidian Bases' own view-tab bar over a multi-view `Codex.base` (5 `story-forge-codex` views, one per category); `CodexView` is a THIN main-area ItemView (Open-Codex entry point + S46 degrade when Bases off), NOT a tab-chrome host. Rejected Option B (plugin-owned tab bar). Rationale: fits SDD Runtime View + S44 ("rendered via registerBasesView"), reuses T3.2 unchanged, least code. Forward-looking: the interactive/spatial Storyline ③(+①) views (Kanban, timeline swimlane, plotgrid, subway, story graph, relationship map, location tree, stats — `storyline-analysis.md` §5) are NOT Bases views and get their OWN future plugin-owned ItemView host (custom DOM/SVG/canvas, vault-scoped, writes via the M4 `frontmatterWriter`); Option A is additive, not a one-way door. SDD ADR-2 addendum records both. |
| 2026-07-21 | **CodexBasesView → src/bases/ (Phase 3 impl), firewall stays absolute** (user decision) | SDD-internal inconsistency: CON-3/ADR-9 confine Bases typings to `src/bases/` (grep-gated, green since Phase 1), but the SDD map + plan T3.2 placed `CodexBasesView` (`extends BasesView`) in `src/codex/` → would break the grep. Resolution: the Bases-typed view subclass goes in `src/bases/` (thin, delegates rendering to `codex/codexGrid`); `codexGrid` + `CodexView` stay in `src/codex/` with zero Bases typings. `registerCodexView` wires the real factory (replacing its Phase-1 stub). SDD map + CON-3 updated. User chose "keep firewall absolute" over relaxing CON-3. |
| 2026-07-21 | **ADR-8 detect REVISED (Phase 1 impl) → cache-at-onload, not per-render** (user decision) | T1.1 review caught a correctness bug: `isBasesAvailable` was calling the side-effectful `registerBasesView` per render (registers a junk probe view type; contradicts the Phase 0 "call inside onload only" caveat; the mock hid it). Resolution: `registerCodexView(plugin)` registers once at onload and caches its boolean; `isBasesAvailable(plugin)` returns the cached value, no side effect. Consequence: runtime Bases enable/disable re-detected only on reload (not per render) — SDD ADR-8 note + F1/F5 walkthrough updated; no event-driven runtime recovery promised. Signature `app`→`plugin` corrected; mock `BasesView` field `entries`→`data` fixed. User chose this over a side-effect-free `internalPlugins` probe. |
| 2026-07-21 | **Phase 0 prototype gate → GO to build; both ADR-10 fallbacks ACTIVE** | Resolved from obsidian 1.13.1 typings + official docs (live spike de-scoped: mobile testing not possible, desktop items answered from the documented API). **GO**: `MarkdownRenderer.render` non-deprecated (F1); `registerBasesView` public `@since 1.10.0` and returns `false` when Bases disabled — confirms **ADR-8** (F2); `BasesView`/`BasesEntry` shapes confirmed; **ADR-5 vault-only `.base` confirmed** (config dir is adapter-only → plugin-dir `.base` invisible to Bases, so `00 Meta/Bases` materialisation is necessary). **Fallbacks active**: (1) fence stays **read-only** (Bases embed docs unpublished; fence has no public write API); (2) Bases surfaces **desktop-only** via `platform-restricted`/S11, `isDesktopOnly` stays `false`. Unverified-but-non-blocking: runtime leak-free teardown + interactivity (optional throwaway `src/_spike/basesSpike.ts` harness can confirm later). Full report: `plan/README.md` § Phase 0 verdict. |
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
