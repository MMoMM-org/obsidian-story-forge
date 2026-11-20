# Story Forge — Build Plan

> The master implementation plan: the milestones we build in, in order, each
> mapped to a future **XDD spec** (PRD → SDD → PLAN). This document is the input
> for scaffolding those specs — it is *what* and *in which order*, not the
> detailed *how* (that's each spec's job).

Read alongside: `DESIGN.md` (architecture), `views-and-integration.md` (the view
set), `view-roadmap.md` (per-view specs), `storyline-analysis.md` (①–④
categories), `claude-skills.md` (the _forge Claude track).

## Ground rules (carried into every milestone)

- **Frontmatter is the source of truth.** Bases/Dataview render it; the plugin
  writes back only plain Properties (`processFrontMatter`), never a plugin store.
- **Two surfaces:** the contextual sidebar panel (follows the active note) and the
  workspace views (Codex, Kanban, Plotgrid, Timeline, Plotlines).
- **Reuse over rebuild:** Longform (manuscript), Calendarium (dates), metadata-menu
  + meta-bind (editing), Bases/Dataview (render), _forge Claude skills (analysis).
- **Consent-gated runtime** for anything running arbitrary JS (DataviewJS).
- Each milestone ships with **unit tests (vitest)** + **live-vault checks** against
  `test/StoryForge/`, green `build`/`lint`/`typecheck`/`schema:check`.

## Milestone map (at a glance)

| # | Milestone | Ships | → XDD spec |
|---|---|---|---|
| M0 | Foundations | — | (done, no spec) |
| M1 | Core infrastructure | — | `core-infrastructure` |
| M2 | Dataview engine + consent | — | `query-engine-dataview` |
| M3 | Contextual sidebar panel | **v0.1** | `contextual-panel` |
| M4 | Bases + Codex + catalog | **v0.2** | `bases-codex-catalog` |
| M5 | Declarative workspace views | v0.3 | `declarative-views` |
| M6 | Interactive views (drag → frontmatter) | v0.4 | `interactive-views` |
| M7 | Polish + community submission | v1.0 | `release-hardening` |
| — | _forge Claude skills | (separate track) | not a plugin spec |

Critical path: **M1 → M2 → M3** (the note-following core) is the spine. M4 gates
on the Bases spike. M5/M6 are the workspace views. M7 is release readiness.

---

## M0 — Foundations  *(done)*

Scaffold (standalone, green build/test/lint), the `test/StoryForge/` `_forge`
vault with English seed data, and the **schema layer** (FileClasses for all types
+ human property reference + `schema:check`). Design docs written. Release CI
paused; version baseline `0.1.0`.

**Remaining before M1:** confirm the dev container / `npm run dev` deploy loop is
green; add `README.md` + `PRIVACY.md` stubs (consent/runtime disclosure).

## M1 — Core infrastructure  → `core-infrastructure`

The shared spine every view sits on. No user-facing views yet.

- **View store** (clone markdown-mason `store.ts` shape): per-view record in
  `data.json` — `{ provenance: "curated"|"imported", enabled, okayed:{version,
  checksum}|null, source, command }`.
- **Scoping layer:** resolve the active note's outgoing links + backlinks via
  `metadataCache`, classify against canon tags (`canon/*`, `manuscript/scene`,
  planning types). This is the "follows the active note" glue every view reuses.
- **Sidebar `ItemView` shell:** dockable right-panel, tabbed, follows the active
  editor; empty-state + lifecycle cleanup (obsidian-plugin patterns).

**Exit:** the shell opens, tracks the active note, and exposes the resolved
entity context to a stub view. Store round-trips to `data.json`.

## M2 — Dataview engine + consent  → `query-engine-dataview`

- **Dataview adapter:** run DQL + DataviewJS, feature-detected soft dependency,
  native `metadataCache` fallback when Dataview is absent.
- **Consent gate** (clone mason `disclosure.ts` + checksum re-consent): full
  disclosure only for DataviewJS (arbitrary JS); DQL is declarative/low-risk.
  Per-view kill-switch; re-consent on version/checksum drift; safe-default =
  disabled.
- **User-import flow:** import a view definition from the vault; bind to a sidebar
  tab and/or a command; enable/disable.

**Exit:** a DataviewJS view can be imported, consented, run, and killed; a DQL
view runs without the full gate.

## M3 — Contextual sidebar panel  → `contextual-panel`   *(ships v0.1)*

The heart. Type-aware content driven by the scoping layer + Dataview:

- **character** first — facts + portrait, relationships, **"appears in"** (reverse
  query on `pov`/`characters`), owns (objects with `owner`), related locations/lore.
- then **location** (hierarchy + inhabitants + scenes here), **object**, **lore**,
  **scene** (entities in scene), **plotline** (scenes in it).
- Seed the default `_forge` views into the curated set (installed in M4's catalog,
  but authored here).

**Exit:** open any canon or scene note → the panel shows the right facts and
"appears in"/links, live-updating as the active note changes. v0.1 tag.

## M4 — Bases + Codex + catalog  → `bases-codex-catalog`   *(ships v0.2)*

- **Bases embedding spike (gate):** can a `.base` render into our container via a
  stable API? Fallback: a scoped ` ```base ` block via `MarkdownRenderer`.
  **Also verify Core Bases inline property editing** → decides whether the
  Inspector is a ②-embed or custom (③).
- **Bases engine adapter.**
- **Codex:** category tabs (Characters/Locations/Objects/Lore) as `.base` grids;
  click → detail in the contextual panel.
- **Overview `.base` catalog views** (Characters/Locations/Objects/Lore/Scenes).
- **Curated catalog** (clone mason `catalog/` + `build-catalog.mjs` + checksummed
  `dist/index.json` + "Browse official" modal with update notifications).

**Exit:** Codex browsable; overview views installable from the catalog; spike
verdict recorded and the Inspector strategy chosen. v0.2 tag.

## M5 — Declarative workspace views  → `declarative-views`   *(v0.3)*

Mostly Bases/Dataview, little custom:

- **Timeline (linear):** scenes by `storyDay` (fallback `order`), grouped by act;
  `when` as the display label. No spatial drag yet.
- **Plotlines (list):** group scenes by `plotlines`; collapsible; unassigned bucket.

**Exit:** both render from frontmatter and follow book/plotline scope.

## M6 — Interactive views (drag → frontmatter)  → `interactive-views`   *(v0.4)*

Custom DOM + write-back, all via plain-Property writes:

- **Kanban:** scenes in `status` columns; drag → write `status` (and `order`).
- **Plotgrid:** plotline × scene matrix derived from `plotlines`; toggle cell →
  write the scene's `plotlines`.
- **Timeline placement:** drag a card → write `storyDay`.
- **Locations — hierarchical tree:** nest over the `world` chain.

**Exit:** each interaction writes clean frontmatter, verifiable in the Properties
UI; no plugin-owned state.

## M7 — Polish + community submission  → `release-hardening`   *(v1.0)*

- obsidian-plugin compliance pass (listener/timer cleanup, mobile, XSS-safe DOM,
  `requestUrl`, manifest rules, no sample-plugin residue).
- Optional later views only if wanted: **subway map**, **custom Story Graph**
  (port `StoryGraph.ts`; the **core Obsidian graph is the MVP** until then),
  the note-panel surface.
- ~~README/PRIVACY finalised; re-enable the Release workflow~~ done in spec 010: README and
  PRIVACY finalised, the Release workflow runs on every push to `main`.

---

## Separate track — _forge Claude Code skills

Not plugin XDD specs. `continuity-check`, `plot-holes`, `warnings` live in the
_forge Claude Code component and reason over the frontmatter the plugin renders.
Tracked in `claude-skills.md`; sequenced independently of the milestones above.

## Next step

Scaffold the XDD specs from this plan — start with `core-infrastructure` (M1),
since M1→M2→M3 is the critical path to a working v0.1. Each spec runs the
PRD → SDD → PLAN cycle; this plan supplies each spec's scope, dependencies, and
exit criteria.
