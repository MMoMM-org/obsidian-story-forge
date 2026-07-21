# ADR-0001 — Bases integration strategy (M4)

- **Status:** Accepted
- **Date:** 2026-07-21
- **Milestone:** M4 — Bases + Codex + catalog (`bases-codex-catalog`, ships v0.2)
- **Supersedes:** —

## Context

M4 wants to surface Obsidian **Bases** (native database views, GA'd ~1.9.10) in three
places. The M4 build-plan gate asks: can a `.base` render into a plugin-owned container via
a stable API, and can Bases inline property editing be reused? A research spike (verified
against our pinned `obsidian` typings **1.13.1**, the official developer/help docs, and a
survey of two community plugins — `brightwav3/advanced-bases`, `dsebastien/obsidian-kanban-action-planner`)
found:

- **No public API to embed an *existing* `.base` into an arbitrary plugin element**, nor to
  read/write Bases cell values programmatically (docs defer read/write to "the future").
- `Plugin.registerBasesView(viewId, { factory: (controller, containerEl) => BasesView })`
  IS public (`obsidian.d.ts:5009`, `@since 1.10.0`): it registers a **custom view *type*** the
  Bases runtime instantiates inside a user's `.base`; the plugin renders its own DOM into the
  runtime-supplied container and reads `BasesEntry[]` in `onDataUpdated()`.
- `MarkdownRenderer.render(app, "```base…```", el, sourcePath, component)` embeds an existing
  base into our own container, but **read-only / opaque**.
- Frontmatter write-back from custom views works cleanly via `app.fileManager.processFrontMatter`
  (proven by `kanban-action-planner`, which is 100% `processFrontMatter`, no plugin-owned state).
- The two surveyed plugins add **no reusable embedding API** — both just `registerBasesView`.
  Reuse their *ideas* (batched `processFrontMatter`, case-insensitive key reuse), not their code;
  avoid `kanban`'s one private `controller.view` cast.

Two documented Bases surfaces exist, mapping onto the two "Bases implementations" in scope:
a **sidepanel engine** (render a base in *our* view-tab, like Dataview) and **general /
main-area views** (Codex + catalog grids).

## Decision

1. **Sidepanel Bases engine (view-tab, our container)** → **Markdown ```base``` fence** via
   `MarkdownRenderer.render(...)`, filling the existing `bases` slot in the M2 engine registry.
   Read-only. Requires a real `sourcePath` + an owned `Component` for teardown.
2. **Codex + overview/catalog views (general / main area)** → **`registerBasesView`**: Story
   Forge registers its own Bases view type(s); we render custom DOM into the runtime container
   and read the Bases query result. **We accept binding these surfaces to the Bases API**
   (user-confirmed) — it gives the query/filter/formula engine for free and can be interactive.
3. **Inspector + interactive editing** → **custom DOM + `app.fileManager.processFrontMatter`**
   (Option ③). Bases inline editing is not exposed to plugins; and this matches Story Forge's
   invariant "frontmatter is truth; the plugin writes only plain frontmatter, never owns state."
   An editable view may itself be a `registerBasesView` type (like kanban) or a standalone panel.

## Consequences

- **API-churn risk (accepted).** `BasesView` / `QueryController` / `BasesEntry` /
  `BasesConfigFile` are young and evolved across 1.9.x. Confine all Bases-typings usage to one
  small adapter module; validate the `.base` YAML we author against `BasesConfigFile`; add a
  schema smoke test. Present in our pinned `obsidian.d.ts` 1.13.1.
- **minAppVersion.** Bases surfaces need Obsidian ≥1.9 (fence) / ≥1.10 (`registerBasesView`),
  but our `minAppVersion` is 1.5.7 (CON-1). Either **bump `minAppVersion`** for the Bases
  features or **feature-gate** them (`registerBasesView` returns `false` when Bases is disabled;
  guard and degrade). The core contextual panel + Dataview engine stay on 1.5.7.
- **No 3rd-party plugin dependency.** `advanced-bases` offers nothing to depend on; do not copy
  `kanban`'s private `controller.view` cast.
- **Prototype first (de-risk, before full build):** render one generated ```base``` via
  `MarkdownRenderer.render` into a panel `div` AND register a trivial `registerBasesView` type;
  verify display, leak-free teardown, and interactivity on **desktop and mobile**. Two items the
  spike could not verify from docs: embedded-base interactivity, and Bases mobile parity.

## Alternatives considered

- **Scrape `controller.results` from a hidden Bases leaf** → rejected: fragile, unsupported.
- **Wait for a public embed/results API** → rejected: requested on the forum, not promised.
- **Avoid Bases entirely (own renderer + Dataview)** → viable and lower-risk, but forgoes the
  native Codex/catalog experience; user chose to bind to the Bases API for the general views.

## References

- Bases spike verdict + plugin survey (this session).
- `obsidian.d.ts` 1.13.1 — `registerBasesView` (5009), `BasesView` (1105), `BasesEntry` (685),
  `BasesConfigFile` (531).
- Obsidian dev docs "Build a Bases view"; Bases syntax help; forum "API access to Bases results".
