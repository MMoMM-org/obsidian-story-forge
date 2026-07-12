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
  `characters` / `pov` / `location` / `plotlines`. (See `/Volumes/Moon/Apps/stories/_forge/
  blueprint/DESIGN.md`.) Story Forge reads these — it does **not** introduce a codex/DB.
- **View model → Storyline.** Storyline also stores facts in frontmatter (not a DB), so its
  views are a good template. We reproduce the *views we want*, driven off `_forge` properties.

## 2. Surfaces

Story Forge renders into **two** surfaces (Storyline has both; the user wants both):

1. **Sidebar panel** — a dockable `ItemView` (right sidebar) with one tab per enabled view.
   Follows the active note. Analogous to Storyline's Navigator / Research / Scene-Details
   sidebars.
2. **Note panel** — a Storyline-style **inspector that renders in/with the active note**
   (Storyline calls it the "Scene Details" inspector: "a standalone inspector panel that
   follows the active editor file"). This is the surface that **cannot be produced by Bases**
   and therefore needs custom rendering code.

### Open decision — how much to hand-code the note panel
To be settled when we reach that phase, ideally after reading Storyline's source:

- **(A) Fully custom-coded note panel** — full control over layout (collapsible sections,
  portrait, relationship map), exactly like Storyline. More code, more maintenance.
- **(B) Embedded Bases views** — the note panel is just one or more scoped Bases embeds.
  Much less code; bounded by what Bases can render.

Likely outcome: **B where Bases suffices, A only where it doesn't** (e.g. relationship graphs,
setup/payoff links). Decide per view, not globally.

## 3. Views are a curated + user-authored library (the markdown-mason pattern)

Cloned wholesale from the sibling `obsidian-markdown-mason` repo — the same distribution and
trust machinery, with **"view"** as the unit instead of "script":

- **Curated catalog** — reviewed view definitions shipped via an in-plugin catalog
  (`catalog/` → `build-catalog.mjs` → checksummed, versioned `dist/index.json`), installed
  through a "Browse official" modal with update notifications. Seeded with the `_forge` view
  set (Characters-in-scene, Locations-in-scene, …).
- **User views** — import a view definition from your vault; bind it to a sidebar tab and/or a
  command.
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
fallback view. The query engines are the primary renderers.

### Bases embedding — spike
Rendering a core Bases view into a custom container may lack a stable public API in the
installed Obsidian version. Spike early. Fallback: render a scoped ` ```base ` block via
`MarkdownRenderer`. Because of this risk, Bases is scheduled after the Dataview engines.

## 5. Phasing

**Slice 1 — v0.1 (get it working end-to-end):**
1. Scaffold (done) — standalone, green build/test/lint.
2. Docker dev container (`claude-docker-install.sh`).
3. Store + view model (clone mason `store.ts` shape).
4. Sidebar `ItemView` — tabs per view, follows the active note.
5. Dataview engine adapter — DQL + DataviewJS with the full consent gate (clone mason
   `disclosure.ts` + checksum re-consent).
6. User-import flow + enable/disable/kill-switch.
7. Seed default `_forge` views + README/PRIVACY + dev-vault sample notes.

**Slice 2 — fast-follow:**
8. Curated catalog (clone `catalog/` + `build-catalog.mjs` + Browse-official modal).
9. Bases engine adapter (after the spike).
10. **Note panel** surface (decision §2 A/B).

**Later — Storyline feature parity** (the views the user wants, built off `_forge` properties):
Characters view (collapsible profile, portrait, relationship map), Locations (hierarchical
worlds), Timeline, Plotlines, Plotgrid, Board/Corkboard, Stats (pacing, plot-hole/setup-payoff
detection), Scene-details inspector. Prioritized separately once the library + surfaces exist.

**Per-view strategy → `storyline-analysis.md`.** A source read of Storyline v1.10.41
maps every view to one of four categories: **①** adopt/port code (MIT), **②** Bases/Dataview
as engine (declarative, note-scoped), **③** standalone render code (graphs, corkboard,
subway, Plotgrid — no query can express these), **④** a new `.base` view only (no code).
Guiding principle: **frontmatter is the source of truth; Bases/Dataview render it; the plugin
writes back only plain Properties, never a plugin-owned store** — writing is in scope "where
it makes sense", the point is not owning the data (Storyline's rigidity comes from owning it).
The Bases spike (§4) also decides how much of the Inspector is ③ vs a ②-embed: verify whether
the Core Bases table's inline property editing suffices. Highest-value ①-ports: `StoryGraph.ts`
+ `RelationshipMap.ts` (force-directed SVG).

## 6. References

- `_forge` data model — `/Volumes/Moon/Apps/stories/_forge/blueprint/DESIGN.md`
- markdown-mason (catalog + consent pattern) — `/Volumes/Moon/Coding/obsidian-markdown-mason`
- Storyline (view reference) — https://github.com/pixerojan/obsidian-storyline
