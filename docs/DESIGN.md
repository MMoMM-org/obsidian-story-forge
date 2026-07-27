# Story Forge — Design

> Property-driven reference views for a fiction vault, following the active note.
> Standalone Obsidian plugin. Reads the `_forge` facts-as-Properties canon; takes
> [Storyline](https://github.com/pixerojan/obsidian-storyline) as the reference model
> for the views themselves.

## 1. Purpose

Surface the story entities linked from the current note — with their canonical facts —
without locking those facts into a plugin-owned database. Two inputs shape this:

- **Data model → the `_forge` approach.** One canonical note per entity; hard facts in
  frontmatter Properties; typed relations as `[[wikilinks]]`; scenes link entities via
  `characters` / `pov` / `location` / `plotlines`. (See `_forge/
  blueprint/DESIGN.md`.) Story Forge reads these — it does **not** introduce a codex/DB.
- **View model → Storyline.** Storyline also stores facts in frontmatter (not a DB), so its
  views are a good template. We reproduce the *views we want*, driven off `_forge` properties.

## 2. Surfaces — Anvil, Workbench, Codex *(settled 2026-07-27)*

Story Forge has **two interfaces** and **one content concept**. Keeping these three
terms apart matters: the earlier draft named surfaces by *what they may contain*,
which collapsed as soon as the Codex moved into the main window.

| Term | Kind | What it is |
|---|---|---|
| **Anvil** | interface | The **main-window** view — one `ItemView` with a tab switcher: **Codex · Timeline · Plotgrid · Plotlines · Board**. Where you manage and survey the manuscript. |
| **Workbench** | interface | The **sidebar** view — a dockable `ItemView` that **follows the active note**. Tabs: **Codex** (a compact, drill-down view of the active note's entities), **Navigator**, and any user-imported views. |
| **Codex** | content | The story *objects* — characters, locations, items, creatures, lore, organizations, cultures, systems, and whatever else a user adds. **Not an interface.** It appears in both: as the card grid in Anvil, and as the following tab in the Workbench. |

**Codex is what you know; Anvil is what you shape; Workbench is what's at hand.**

**How we render each is an implementation detail, not a surface boundary** — a tab
may be a Bases view, a Dataview query or custom DOM, and may change engine later
without changing what the user sees.

### The Codex tab in Anvil

Card grid of story objects (hero cards for characters, locations, items), with a
category switcher. Selecting a card opens an **editor pane in the lower half** for
that note's frontmatter — this is where entity editing lives.

Ship a subset of categories (`character`, `location`, `object`, `lore`); **the user
adds the rest themselves.** Storyline treats user-defined categories as the Codex's
core feature — *"a unified hub for Characters, Locations, and your own custom
categories (Props, Factions, Magic Systems — whatever you need)"* — and so do we.
See `gap-analysis.md` G20 / issue #13.

### Resolved: there is no separate "note panel" surface

Earlier drafts listed a third surface — a Storyline-style inspector rendering
*in/with* the active note, quoting Storyline's "Scene Details" inspector, *"a
standalone inspector panel that follows the active editor file"*. That describes a
**sidebar**, i.e. the Workbench, and was written before the Workbench existed. The
A/B decision it carried (hand-coded vs. embedded Bases) is therefore moot as a
*surface* question.

What was actually wanted is the **editor pane** — and it has two homes, both inside
existing interfaces: the lower half of the Anvil Codex tab, and the Workbench Codex
tab. ADR-0001 already settles how it is built: Bases inline editing is not exposed
to plugins, so the editor is custom DOM over `processFrontMatter`.

## 3. Views are a curated + user-authored library (the markdown-mason pattern)

Cloned wholesale from the sibling `obsidian-markdown-mason` repo — the same distribution and
trust machinery, with **"view"** as the unit instead of "script":

- **Curated catalog** — reviewed view definitions shipped via an in-plugin catalog
  (`catalog/` → `build-catalog.mjs` → checksummed, versioned `dist/index.json`), installed
  through a "Browse official" modal with update notifications. Seeded with the `_forge` view
  set (Characters-in-scene, Locations-in-scene, …).
- **User views** — import a view definition from your vault; bind it to a **Workbench tab, an
  Anvil tab**, and/or a command. Both interfaces take user views: the Anvil's Codex tab is
  substitutable (bring your own `.base` instead of ours), while its management tabs stay
  opinionated and configurable rather than user-authored (`gap-analysis.md` §1.2).
- **Single synced store** — per-view record in `data.json`:
  `{ provenance: "curated" | "imported", enabled, okayed: {version, checksum} | null,
  source, command }`.
- **Consent-gated runtime** — disclosure modal, per-view kill-switch, re-consent on
  version/checksum drift, safe-default = disable. **Only DataviewJS views (arbitrary JS)
  need the full-privilege gate**; Bases and Dataview-DQL views are declarative and low-risk.

## 4. Query engines

A view's `engine` is one of:

| Engine | Nature | Trust | Dependency |
|---|---|---|---|
| **Bases** | declarative `.base` query | safe (enable/disable) | core ≥ 1.9 |
| **Dataview (DQL)** | declarative query | safe (enable/disable) | Dataview plugin (soft, feature-detected) |
| **DataviewJS** | arbitrary JS | full consent gate | Dataview plugin (soft, feature-detected) |

Native `metadataCache` stays as the **scoping/context layer** (resolving the active note's
links so a view can be scoped to "entities linked from this note") and as a zero-dependency
fallback view.

**Every third-party plugin here is an add-on, never a requirement.** Dataview,
metadata-menu, meta-bind, Calendarium: we detect them, use them where they genuinely
help, and **fall back to native rendering when they are absent**. That makes the native
path a **hard requirement, not a courtesy** — a declarative view is an *additional*
implementation of something that already works without it, never a replacement for it.
Two obligations follow: document what each optional plugin adds, and document what a
user loses by not installing it (`gap-analysis.md` G14).

### Bases embedding — spike
Rendering a core Bases view into a custom container may lack a stable public API in the
installed Obsidian version. Spike early. Fallback: render a scoped ` ```base ` block via
`MarkdownRenderer`. Because of this risk, Bases is scheduled after the Dataview engines.

## 5. Phasing

> **This section is historical.** Slices 1 and 2 shipped (M1–M6, `main` at `107392e`).
> For what actually exists versus what was promised, `gap-analysis.md` is the current
> source of truth — it was written because this list stopped matching reality.

**Slice 1 — v0.1 — shipped.** Scaffold, dev container, store + view model, the sidebar
`ItemView` (now the **Workbench**), the Dataview DQL + DataviewJS adapters with the full
consent gate, and the user-import flow with enable/disable/kill-switch. Import works today
and surfaces imported views as Workbench tabs.

**Slice 2 — mostly shipped.** The curated catalog, `build-catalog.mjs` and the
Browse-official modal exist; the Bases adapter exists (ADR-0001: ```base``` fence for
in-panel rendering, `registerBasesView` for main-area views). Item 10, the "note panel"
surface, is **withdrawn** — §2 resolves it as a misconception; the editor pane lives inside
Anvil and the Workbench instead.

**Known deltas** — the catalog ships Bases entries only while import accepts Dataview only
(G1); the `_forge` note-scoped views are hardcoded rather than catalog data (G2); the plugin
ships no vault artifacts to a real user (G25). See the gap register.

**Later — Storyline feature parity.** Partly shipped: Timeline (rail + swimlanes + zoom),
Plotlines (list), Board/Kanban (drag → `status`/`order`), Plotgrid (read-only). Outstanding:
the Codex card grid + editor pane, the Locations tree, the Plotlines subway map (now wanted
in this version), richer Plotgrid cells, and the relationship-map/story-graph ports.
Corkboard and Stats stay dropped.

**Per-view strategy → `storyline-analysis.md`.** A source read of Storyline v1.10.41
maps every view to one of four categories: **①** adopt/port code (MIT), **②** Bases/Dataview
as engine (declarative, note-scoped), **③** standalone render code (graphs, corkboard,
subway, Plotgrid — no query can express these), **④** a new `.base` view only (no code).
Guiding principle: **frontmatter is the source of truth; Bases/Dataview render it; the plugin
writes back only plain Properties, never a plugin-owned store** — writing is in scope "where
it makes sense", the point is not owning the data (Storyline's rigidity comes from owning it).
The Bases spike is **settled** (ADR-0001): Bases inline editing is not exposed to plugins, so
the editor pane is ③ — custom DOM over `processFrontMatter` — and no ②-embed can replace it.
Highest-value ①-ports: `StoryGraph.ts` + `RelationshipMap.ts` (force-directed SVG).

## 6. References

- **Gap analysis (promise vs. code, post-M6)** — `gap-analysis.md`
- **Build plan (milestones → XDD specs)** — `build-plan.md`
- **Views & plugin integration (authoritative view spec)** — `views-and-integration.md`
- **View roadmap & phasing** — `view-roadmap.md`
- **Storyline per-view strategy (①–④)** — `storyline-analysis.md`
- **_forge Claude Code skills (continuity/plot-holes/warnings)** — `claude-skills.md`
- `_forge` data model — the `_forge` blueprint (`blueprint/DESIGN.md` in the stories vault)
- markdown-mason (catalog + consent pattern) — the sibling `obsidian-markdown-mason` repo
- Storyline (view reference) — https://github.com/pixerojan/obsidian-storyline
