---
title: "M6 — Interactive Workspace Views (drag → frontmatter)"
status: draft
version: "1.0"
---

# Solution Design Document

> **Grounding.** HOW for the M6 PRD (`requirements.md`). Extends the M5 workspace core
> (`src/workspace/`, spec 006) with **write-back** and three read-only view modes. Continues the
> M5 ADR numbering: M5 owns ADR-1…ADR-13; M6 adds **ADR-14…ADR-26**. Every cited file/export was
> verified against the tree at `main` (`77f398d`). No schema changes.

## Validation Checklist

### CRITICAL GATES (Must Pass)

- [x] Every PRD feature (F1–F8) maps to a component + ADR
- [x] No [NEEDS CLARIFICATION] markers remain
- [x] All interfaces specified against verified current signatures
- [x] No contradiction with M5 ADRs (reuse, don't fork)
- [x] Every ADR has Decision / Context / Options / Consequences

### QUALITY CHECKS (Should Pass)

- [x] Reuse-first: existing writer, scope seam, models, collapse store, render primitives
- [x] Frontmatter-is-truth preserved (plugin owns no persistent state)
- [x] Accessibility path (keyboard alt per drag) designed, not deferred
- [x] Mobile-safe (pointer events, `processFrontMatter`)
- [x] Test/mock surface identified
- [x] Directory map + component reuse/extend/new table present

---

## Constraints

Carried from M5 SDD + `src/CLAUDE.md` + the M6 PRD (unchanged, restated for traceability):

- **CON-1 Frontmatter is truth.** The plugin writes only plain Properties; it owns no persistent
  state. Every interactive edit is an ordinary frontmatter change.
- **CON-2 Single write seam.** All vault writes go through `src/inspector/frontmatterWriter.ts`
  (`processFrontMatter`) — validated, atomic, mobile-safe. M6 adds no second write path.
- **CON-3 TypeScript strict, no `any`.** `unknown` + narrowing; explicit return types on public fns.
- **CON-4 Lifecycle cleanup.** All DOM listeners/timers/events via `this.register*` /
  `registerDomEvent`; the mock's `_runCleanup()` lets tests assert teardown.
- **CON-5 Pure DOM, no runtime `<style>` injection.** Styling lives in `styles.css` (`sf-*` blocks).
- **CON-6 No schema change.** All fields exist (`status`,`order`,`storyDay`,`plotlines`,`pov`,
  `location`,`world`). A missing field would be a blocker routed through the schema-change runbook.
- **CON-7 Structure-agnostic scoping.** Include by tag/type; exclude the folder denylist
  (`DEFAULT_EXCLUDED_FOLDERS`). Never assume folder layout.
- **CON-8 Build fresh (StoryLine = visual reference only).** No code port; reuse M5 primitives.
- **CON-9 Community-directory bar.** Every drag has a keyboard alternative; XSS-safe DOM; roles/labels.

## Implementation Context

### Required Context Sources

Verified present at `main` (`77f398d`):

| Source | What M6 uses it for |
|--------|---------------------|
| `src/inspector/frontmatterWriter.ts` — `commit(app,file,key,value,field): Promise<CommitResult>` | The sole write seam. `FieldSpec`/`FieldType`/`CommitResult` exports reused. Extended with `commitMany` (ADR-14). |
| `src/workspace/WorkspaceView.ts` — `WorkspaceView`, `WORKSPACE_VIEW_TYPE`, `WorkspaceLayout` | The main-area host. `_layout` union + `setLayout` + delegated `_onClick` extended (ADR-16). |
| `src/workspace/workspaceModel.ts` — `SceneRow`, `Group`, `Link`, `timelineModel`, `plotlineModel`, `plotlineColor`, `stripLink`, `actBeatLink`, `LinkResolver` | Pure models reused as-is; new pure fns added (`kanbanModel`, `plotgridModel`, `swimlaneModel`, `locationTreeModel`). |
| `src/workspace/sceneMapper.ts` — `mapSceneRow(app,file): SceneRow` | Read adapter — reused unchanged. |
| `src/scoping/workspaceScope.ts` — `resolveWorkspaceScope`, `ResolvedScope`, `WorkspaceScope`, `DEFAULT_EXCLUDED_FOLDERS` | Scope seam reused; a `location`-scope resolver added for the tree (ADR-19). |
| `src/workspace/collapseStore.ts` — `CollapseStore` (`isCollapsed`/`toggle`/`clear`, key = `surface scope group`) | Reused for Kanban column / swimlane-lane / tree-node collapse **and** the swimlane grouping-key (ADR-20). |
| `src/workspace/renderShared.ts` — `rowColor`, `statusSlug`, `appendDot`, `appendStatusBadge`, `NEUTRAL_DOT_COLOR` | Reused; `statusColumnColor` added. |
| `src/workspace/renderTimeline.ts` — `renderTimeline(host,groups,deps,mode)`, `TimelineMode = "rail"\|"swimlane"` | `"swimlane"` branch implemented (currently throws). |
| `src/panel/components.ts` — `section`, `emptyLine` | Collapsible section + empty-state primitives reused by all new renderers. |
| `test/__mocks__/obsidian.ts:311` — `fileManager.processFrontMatter: vi.fn()` | Extended to a spy-able callback impl for write assertions (ADR-26). |

### Implementation Boundaries

- **In:** F1 Kanban, F2 Plotgrid, F3 Timeline-placement (writes); F4 Locations tree, F5 Swimlanes,
  F6 zoom/pan (read-only); F7 write discipline; F8 accessibility.
- **Out (M7+):** subway map (Plotlines `"subway"` mode stays stubbed), drag-to-reparent Locations,
  editable swimlanes, fractional `storyDay`, calendar/date math, multi-book cross-scope drag,
  custom Story Graph / note-panel surface.

### External Interfaces

Obsidian API only: `App.fileManager.processFrontMatter` (write), `MetadataCache.on("changed")`
(read-refresh), `MetadataCache.getFileCache`/`getFirstLinkpathDest` (read/resolve), `Vault`
(`getAbstractFileByPath`), pointer events (DOM). No network, no third-party libs.

### Project Commands

`npm run build` · `npm test` (vitest) · `npm run typecheck` (src/test/mock) · `npm run lint` ·
`npm run schema:check` — all must stay green (no schema:gen expected; CON-6).

## Solution Strategy

One sentence: **make the M5 read host writable by adding a pointer-event interaction layer that
computes a new field value from a drop target and commits it through the existing validated writer,
then re-renders from the metadata cache** — plus three new pure render modes that need no writes.

Four moving parts:

1. **Write path (F1–F3, F7).** New `src/workspace/interactionHandler.ts` owns pointer-drag state and
   a per-file debounced flush to `commit`/`commitMany`. Each interactive renderer supplies a
   `computeValue(dropTarget) → {key,value,field}[]`. The writer validates and writes; the view
   re-renders optimistically and reconciles on `metadataCache.changed` (ADR-22/-23).
2. **New pure models.** `kanbanModel` (group by `status`, order within), `plotgridModel` (scene ×
   plotline matrix), `swimlaneModel` (group by pov|location|plotline), `locationTreeModel` (nest by
   `world`, cycle-guarded). All in `workspaceModel.ts`, deterministic, unit-tested first (TDD).
3. **New render modes.** `renderKanban`, `renderPlotgrid`, `renderLocationsTree` (new files) +
   `renderTimeline("swimlane")` (fill the stub) + a zoom/pan wrapper on the rail. Routed by an
   expanded `WorkspaceLayout` union.
4. **Accessibility (F8).** Every draggable card carries `role`/`tabindex`/`aria-label`; a keyboard
   command path (arrow/modifier keys on a focused card) produces the *same* `computeValue` result as
   a drop, so drag and keyboard share one commit path. A polite live region announces writes.

## Building Block View

### Components

| Component | File | Kind | Responsibility |
|-----------|------|------|----------------|
| `WorkspaceView` | `src/workspace/WorkspaceView.ts` | **extend** | Host: expanded `WorkspaceLayout` union, toolbar (mode + grouping + zoom), route to renderers, own the `InteractionHandler`, subscribe to `metadataCache.changed`. |
| `InteractionHandler` | `src/workspace/interactionHandler.ts` | **new** | Pointer drag state machine (threshold, ghost, drop resolve), per-file debounced flush, keyboard-command entry, calls the writer. Registers/cleans listeners. |
| `frontmatterWriter` | `src/inspector/frontmatterWriter.ts` | **extend** | Add `commitMany(app,file,entries)` — one `processFrontMatter`, N validated keys (atomic multi-field, ADR-14). `commit` unchanged. |
| `workspaceModel` | `src/workspace/workspaceModel.ts` | **extend** | Add `kanbanModel`, `plotgridModel`, `swimlaneModel`, `locationTreeModel`, `insertOrder` (sparse-int), `snapStoryDay`. Pure. |
| `renderKanban` | `src/workspace/renderKanban.ts` | **new** | Status columns of draggable cards; drop→`{status,order}`. |
| `renderPlotgrid` | `src/workspace/renderPlotgrid.ts` | **new** | Plotline × scene matrix; cell toggle→`plotlines`. |
| `renderLocationsTree` | `src/workspace/renderLocationsTree.ts` | **new** | Read-only nested `world` tree; expand/collapse + drill. |
| `renderTimeline` | `src/workspace/renderTimeline.ts` | **extend** | Implement `"swimlane"` mode; add draggable rail cards + zoom wrapper for placement/F6. |
| `sceneMapper`, `resolveWorkspaceScope`, `collapseStore`, `renderShared`, `plotlineModel`, `components` | (existing) | **reuse** | Unchanged (scope adds a location resolver — ADR-19). |

### Directory Map

```
src/
  workspace/
    WorkspaceView.ts          (extend)  layout union, toolbar, handler wiring, cache refresh
    interactionHandler.ts     (NEW)     pointer drag + keyboard command + debounced commit
    workspaceModel.ts         (extend)  kanban/plotgrid/swimlane/locationTree models + order/day math
    renderKanban.ts           (NEW)     F1
    renderPlotgrid.ts         (NEW)     F2
    renderLocationsTree.ts    (NEW)     F4
    renderTimeline.ts         (extend)  F3 draggable rail + F5 swimlane + F6 zoom
    renderPlotlines.ts        (unchanged) "subway" stays stubbed (M7)
    renderShared.ts           (extend)  statusColumnColor
    collapseStore.ts          (reuse)   column/lane/node collapse + swimlane-key persistence
    sceneMapper.ts            (reuse)
  scoping/
    workspaceScope.ts         (extend)  location-tree scope resolver
  inspector/
    frontmatterWriter.ts      (extend)  commitMany
  main.ts                     (extend)  register new layout commands (Open Kanban/Plotgrid/Locations)
test/
  __mocks__/obsidian.ts       (extend)  spy-able processFrontMatter
  workspace/*.test.ts         (NEW)     model + render + interaction unit tests
  integration/*.test.ts       (NEW)     drag→write→re-render round-trip
styles.css                    (extend)  sf-kb-* / sf-pg-* / sf-lt-* / sf-sw-* / sf-zoom-* / drag states
```

### Interface Specifications

**Write seam (extend `frontmatterWriter.ts`).** `commit` is unchanged. Add an atomic multi-key sibling:

```ts
export interface CommitEntry { key: string; value: unknown; field: FieldSpec; }

/**
 * Validate every entry in memory FIRST (same rules as commit). If any entry is a type error,
 * return {ok:false,reason:"validation"} and write NOTHING. Otherwise a single processFrontMatter
 * sets all keys atomically. Out-of-vocab select values warn (advisory), never block.
 */
export async function commitMany(app: App, file: TFile, entries: CommitEntry[]): Promise<CommitResult>;
```

**Interaction handler (new).** One handler per `WorkspaceView`; registers pointer listeners on the
body via delegation, resolves the drop, computes entries, flushes debounced:

```ts
export interface DropResult { entries: CommitEntry[]; }           // what to write ({}/[] = no-op
export interface Draggable {
  /** The field(s) to write for a drop landing on `dropTarget`, or [] for a no-op/cancel. */
  computeDrop(card: HTMLElement, dropTarget: Element | null): CommitEntry[];
  /** Keyboard parity: same entries for a discrete move (e.g. ArrowRight = next status column). */
  computeKey(card: HTMLElement, key: string): CommitEntry[];
}
export class InteractionHandler {
  constructor(app: App, host: HTMLElement, opts: {
    onWrite: (file: TFile, entries: CommitEntry[]) => Promise<CommitResult>; // → commit/commitMany
    onAfter: (file: TFile) => void;                                          // optimistic re-render
    debounceMs: number;                                                      // per-file (ADR-23)
  });
  /** A renderer registers a card as draggable; handler owns pointer + key events (CON-4). */
  bind(card: HTMLElement, file: TFile, strategy: Draggable): void;
  destroy(): void;                                                           // cleanup
}
```

**New pure models (extend `workspaceModel.ts`).** Deterministic; the TDD RED surface:

```ts
// F1 — group scenes by status, ordered by `order` within a column (stable tiebreak by title).
export function kanbanModel(rows: SceneRow[], statuses: string[]): Group[];
// F1 — sparse-integer insertion order between two neighbours; null neighbour = open end.
export function insertOrder(before: number | null, after: number | null): number;
// F2 — matrix: plotline axis (resolved + unresolved-flagged) × scene axis + membership test.
export interface PlotgridModel { plotlines: Link[]; scenes: SceneRow[]; has(sceneIdx: number, plotline: Link): boolean; }
export function plotgridModel(rows: SceneRow[], resolve: LinkResolver): PlotgridModel;
// F3 — whole-day snap from a fractional drop ratio across the rail (never fractional out).
export function snapStoryDay(rows: SceneRow[], dropRatio: number): number;
// F5 — group by pov|location|plotline into lanes (+ "No POV"/"No location"/"Unassigned").
// Optional `resolve` lets the plotline key flag unresolved lanes (kind "unresolved"), mirroring
// plotgridModel/plotlineModel; pov/location lanes carry kind "pov"/"location". `GroupKind` gains
// "pov" | "location" (additive).
export type SwimlaneKey = "pov" | "location" | "plotline";
export function swimlaneModel(rows: SceneRow[], key: SwimlaneKey, resolve?: LinkResolver): Group[];
// F4 — nest locations by `world`; cycle/depth-guarded; unresolved parent → flagged root.
export interface LocationNode { file: TFile; name: string; children: LocationNode[]; flagged: boolean; }
export function locationTreeModel(locations: LocationRow[], resolve: LinkResolver): LocationNode[];
```

**Renderer signatures** mirror the M5 shape `render*(host, model, deps, mode?)`. `WorkspaceLayout`
becomes `"timeline" | "plotlines" | "kanban" | "plotgrid" | "locations"` (swimlane is a Timeline
*mode*, not a top-level layout; zoom is a Timeline control).

**Interaction-mechanism split (implementation refinement, 2026-07-25).** The `InteractionHandler`
is a *drag* state machine (pointerdown → threshold → pointerup) — the right fit for **Kanban**,
whose cards are dragged between columns; `renderKanban(host, groups, deps, handler)` binds each
card via `handler.bind`. **Plotgrid**, however, is a *click-toggle* (a stationary cell click, which
never arms a drag), so `renderPlotgrid(host, model, deps)` owns its own click + `Space`/`Enter`
listeners via `Component.registerDomEvent` and writes through the **same single seam** (`commit`).
Forcing Plotgrid through the drag handler would still require bespoke click code (the handler has no
tap concept) or would scope-creep the handler with a click mode — so the two surfaces use the tool
that fits, while both preserve the invariants that matter: one write seam (`commit`/`commitMany`),
a keyboard alternative (F8), and optimistic-write-then-reconcile. This refines the earlier
"both renderers bind to the shared handler" phrasing without changing any AC.

### Implementation Examples

**Write round-trip (Kanban drop):**

```ts
// In renderKanban: each card gets a Draggable strategy.
handler.bind(cardEl, row.file, {
  computeDrop(card, dropTarget) {
    const col = dropTarget?.closest("[data-sf-status]")?.getAttribute("data-sf-status");
    if (!col || col === card.getAttribute("data-sf-status")) return [];      // no-op (AC-F1.6)
    const { before, after } = neighboursAt(dropTarget);                      // DOM → order bounds
    return [
      { key: "status", value: col, field: { name: "status", type: "select", values: STATUS_VOCAB } },
      { key: "order",  value: insertOrder(before, after), field: { name: "order", type: "number" } },
    ];
  },
  computeKey(card, key) { /* ArrowLeft/Right = prev/next status column, same entry shape */ },
});
// InteractionHandler.onWrite → commitMany(app, file, entries)  (atomic status+order)
// InteractionHandler.onAfter → WorkspaceView._render()          (optimistic)
// metadataCache "changed" → debounced _render()                 (reconcile + other views)
```

## Runtime View

### Primary Flow: drag a scene from Draft → Done in Kanban

1. `pointerdown` on a card's non-link surface → handler records origin; a `[data-sf-link]` target is ignored (drill wins — AC-F8.3).
2. `pointermove` past the threshold → add `sf-dragging`; render a ghost + insertion indicator in the hovered column.
3. `pointerup` → `document.elementFromPoint` → `dropTarget`; strategy `computeDrop` returns `[{status},{order}]` (or `[]` for a no-op/out-of-zone → cancel, AC-F1.6/F3.5).
4. Handler enqueues entries under `file.path`, debounced (per-file, ADR-23).
5. Flush → `commitMany(app,file,entries)` → validate-all → single `processFrontMatter` sets `status`+`order` atomically (AC-F7.1).
6. `onAfter` re-renders this view immediately (optimistic); Obsidian fires `metadataCache.changed`; the debounced handler re-renders (reconcile) and any *other* open view refreshes too (AC-F7.3).
7. `Cmd+Z` in the note reverts the frontmatter; `metadataCache.changed` re-renders (AC-F7.4).

### Error Handling

- **Validation error** (`commit`/`commitMany` returns `{ok:false,reason:"validation"}`): nothing is
  written; the optimistic move is rolled back; the card shows an inline error state + a transient
  notice (ADR-24). Non-finite numbers are caught here (AC-F7.2).
- **Write error** (`reason:"write"`): same rollback + inline error; edits are conceptually kept
  (the view reverts to truth from cache).
- **Out-of-vocab `status`** already in a note: rendered in its own neutral column, warned, not blocked
  (inherits the writer's ADR-7 behaviour).
- **Unresolved plotline/location link:** flagged, non-interactive (AC-F2.4, AC-F4.3).

### Complex Logic

- **`insertOrder(before, after)`** — both present with a gap ≥ 2 → `floor((before+after)/2)`; open
  start → `after - 10` (min 0-safe); open end → `before + 10`; empty column → `10`. Gap of 1 (no
  integer between) → signal a **renumber**: the column is rewritten `10,20,30,…` via one `commitMany`
  per affected scene batch (ADR-17). Renumber is the rare path.
- **`snapStoryDay(rows, dropRatio)`** — map the drop's vertical ratio to the surrounding scenes'
  integer days; result is `clamp(round(...), 1, maxDay+1)`; never writes a fraction (AC-F3.1/F3.2),
  never touches `order` (AC-F3.2).
- **`locationTreeModel`** — DFS from roots (no/unresolved `world`); a visited-`Set<path>` + depth cap
  (`MAX_DEPTH = 32`) breaks cycles; a cycle/over-depth node is `flagged` and stops recursing
  (AC-F4.4).

## Deployment View

No deployment change. Ships in the same bundle; `esbuild` build + `styles.css`. New commands
registered in `main.ts` (Open Kanban / Plotgrid / Locations; Timeline gains swimlane + zoom controls
in-view). Version bump to 0.4.0 is the user's release step, not part of this SDD.

## Cross-Cutting Concepts

### Pattern Documentation

- **Strategy per interactive view.** Each renderer supplies a `Draggable` (`computeDrop`/`computeKey`)
  so the single `InteractionHandler` stays view-agnostic — pointer plumbing lives in one place;
  per-view semantics live with the renderer. Drag and keyboard converge on one commit path (F8).
- **Optimistic + reconcile.** Local re-render for instant feedback; `metadataCache.changed` is the
  source of truth for cross-view consistency (ADR-22).
- **Pure model → render → interact.** Models are pure and TDD-first; renderers are thin DOM; the
  handler is the only impure/eventful piece. Mirrors M5.

### User Interface & UX

Mockups **S73–S84** in `mockups.html` (this spec) — Kanban populated + mid-drag, Plotgrid + toggle,
Timeline-placement mid-drag, Locations tree, swimlane, zoom, empty, error. Visual grammar inherited
from M5 (act dividers, plotline colour dots, status badges). Drag affordance = `cursor:grab` on the
non-link card surface; ghost at `opacity .5`; insertion line in the plotline/status colour.

### System-Wide Patterns

- **Accessibility (F8):** interactive cards get `role="button"`, `tabindex="0"`, `aria-label`
  (title + field + state); a `aria-live="polite"` region announces committed writes; keyboard
  commands (Arrow/modifier on a focused card) mirror every drag. Grid gets `role="table"`/`gridcell`
  + `aria-checked` (Plotgrid); tree gets `role="tree"`/`treeitem` + `aria-expanded`.
- **Cleanup (CON-4):** all pointer/key/cache listeners via `registerDomEvent`/`registerEvent`; the
  handler `destroy()` is called from `WorkspaceView.onClose`.

## Architecture Decisions

- [x] **ADR-14 Sole write seam = `frontmatterWriter`; add atomic `commitMany`.** M6 writes only via
  `src/inspector/frontmatterWriter.ts`. `commit` handles single-field writes (F2 `plotlines`, F3
  `storyDay`); a new **`commitMany`** handles the one multi-field case (F1 `status`+`order`) in a
  single `processFrontMatter` so the pair lands atomically.
  - Context: `commit` writes exactly one key. Two sequential `commit` calls would fire two writes +
    two `changed` events + a visible intermediate state; a two-field drop should be one transaction.
  - Options: (a) two `commit` calls; (b) new `commitMany` sibling *(chosen)*; (c) a general
    `processFrontMatter` wrapper callers pass a mutator to.
  - Consequences: one tiny, tested addition; keeps CON-2 (one seam), reuses the same validation.
    (c) rejected — leaks the raw API past the validation gate.
  - Recommended. User confirmed: **Yes**

- [x] **ADR-15 Drag = pointer events in a dedicated `InteractionHandler`, not HTML5 DnD.**
  - Context: HTML5 DnD is mobile-broken and hard to test; the M5 host already routes clicks via one
    delegated listener that can't distinguish a drag start.
  - Options: (a) HTML5 `draggable`; (b) pointer events in a new module *(chosen)*; (c) a third-party
    dnd lib.
  - Consequences: full control + live feedback + `dispatchEvent`-testable + mobile-safe; we write the
    drag state machine (threshold, ghost, drop resolve) once and share it. (c) rejected (CON-8,
    bundle weight).
  - Recommended. User confirmed: **Yes**

- [x] **ADR-16 Extend `WorkspaceView` with new layout modes; pure DOM, no SVG.** `WorkspaceLayout` →
  `timeline|plotlines|kanban|plotgrid|locations`; swimlane is a Timeline *mode*, zoom a Timeline
  *control*. New renderers, no new ItemView, no SVG.
  - Context: the M5 host already owns follow + scope + delegated routing + collapse; the subway map
    (the only thing that wanted SVG) is M7.
  - Options: (a) extend the one polymorphic view *(chosen)*; (b) a new ItemView per feature; (c) SVG
    render surface.
  - Consequences: reuse follow/scope/drill/collapse for free; one toolbar. (b) multiplies wiring;
    (c) unneeded until subway (M7).
  - Recommended. User confirmed: **Yes**

- [x] **ADR-17 `order` via sparse-integer insertion; atomic renumber only when a gap is exhausted.**
  Start/renumber at `10,20,30,…`; insert at `floor((before+after)/2)`; when no integer fits, rewrite
  the column `10,20,…` in one batched `commitMany` pass.
  - Context: authors read `order` in the Properties UI — it must stay human-readable integers.
  - Options: (a) fractional indexing (`1.5`) — rejected (YAML float rot, ugly); (b) sparse integers +
    rare renumber *(chosen)*; (c) end-append only — rejected (no mid-column reorder).
  - Consequences: readable frontmatter, renumber is O(column) and rare. Threshold = "no integer
    between neighbours" (deterministic, testable).
  - Recommended. User confirmed: **Yes**

- [x] **ADR-18 Timeline placement snaps to integer `storyDay`; never writes `order`.** `snapStoryDay`
  rounds the drop position to a whole day, clamped `≥1`.
  - Context: `storyDay` is an integer day ordinal; fractional values would surprise authors and
    complicate the read sort. Reading order (`order`) is an orthogonal axis.
  - Options: (a) integer snap *(chosen, per PRD)*; (b) inline numeric-confirm input; (c) fractional.
  - Consequences: clean writes, matches how `storyDay` reads today. (b) deferred to Could; (c) is a
    Won't (PRD).
  - Confirmed by PRD. User confirmed: **Yes**

- [x] **ADR-19 Locations tree is read-only; new `location` scope resolver; cycle/depth-guarded.** A
  small addition to `resolveWorkspaceScope` (or a sibling `resolveLocationScope`) gathers in-scope
  `location` notes; `locationTreeModel` nests them by `world`.
  - Context: M5 scope resolves book/plotline/none over *scenes*; the tree needs *locations*. Read-only
    per PRD (no drag-to-reparent).
  - Options: (a) sibling location resolver reusing the denylist/scan *(chosen)*; (b) overload the
    scene resolver; (c) whole-vault locations always.
  - Consequences: keeps the scene path untouched; structure-agnostic (CON-7). Cycle guard = visited
    set + `MAX_DEPTH=32` (AC-F4.4).
  - Recommended. User confirmed: **Yes**

- [x] **ADR-20 Swimlane = read-only Timeline mode; grouping key persisted per-scope in
  `CollapseStore`-style keying.** `renderTimeline("swimlane")` groups via `swimlaneModel(rows,key)`;
  the Rail|Swimlane toggle + By pov/location/plotline selector live on the Timeline toolbar. The
  active key is remembered per (surface, scope) so a book keeps its choice.
  - Context: the M5 seam already reserved `"swimlane"`; scenes fan out into lanes; a scene in multiple
    plotlines appears in each plotline lane (AC-F5.3).
  - Options: (a) per-scope persistence via the collapse-store map *(chosen)*; (b) global; (c)
    ephemeral (resets each open).
  - Consequences: matches M5's per-scope collapse feel; no new persistence layer, no frontmatter.
    Read-only — no lane drag writes (editable swimlanes = Won't).
  - Recommended. User confirmed: **Yes**

- [x] **ADR-21 Zoom/pan = ephemeral CSS transform on the rail; names stay clickable; not persisted.**
  Zoom scales card/rail metrics between capped min/max; pan = scroll. State lives in the view
  instance only (lost on close).
  - Context: PRD F6 — clickability at all levels, ephemeral. No frontmatter/settings involvement.
  - Options: (a) CSS `transform: scale` / metric scaling, in-memory *(chosen)*; (b) persist zoom in
    settings; (c) SVG viewBox.
  - Consequences: trivial, no state ownership (CON-1). Controls: **both** +/−/reset buttons **and**
    modifier+wheel (ADR sub-decision; buttons are the a11y-safe default, wheel is the accelerator).
  - Recommended. User confirmed: **Yes**

- [x] **ADR-22 Re-render trigger = hybrid (optimistic local + `metadataCache.changed`).** After a
  commit, re-render this view immediately; also subscribe to `metadataCache.changed` (debounced) to
  reconcile and to refresh *other* open workspace views.
  - Context: instant feedback vs cross-view correctness. The cache event is the authoritative signal.
  - Options: (a) cache-event only (laggy); (b) local only (stale other views); (c) hybrid *(chosen)*.
  - Consequences: snappy + consistent; a redundant no-op re-render is cheap.
  - Recommended. User confirmed: **Yes**

- [x] **ADR-23 Write debounce granularity = per-file.** Rapid drags coalesce per `file.path` before a
  flush; different files flush independently.
  - Context: matches the M5 per-file active-leaf model; avoids one slow file delaying another.
  - Options: (a) global; (b) per-file *(chosen)*; (c) per-field.
  - Consequences: bounded write thrash, natural mental model. `DEBOUNCE_MS` reused from
    `pluginConstants`.
  - Recommended. User confirmed: **Yes**

- [x] **ADR-24 Error surface = inline-on-card state + transient notice.** A failed write rolls back
  the optimistic move, marks the card with an error class, and shows a brief `Notice`.
  - Context: spatial relevance (which card) + a global signal; mirrors the Inspector's error pattern.
  - Options: (a) inline only; (b) `Notice` only; (c) both *(chosen)*; (d) modal (too heavy).
  - Consequences: user sees what failed and that it failed. Rollback reverts to cache truth.
  - Recommended. User confirmed: **Yes**

- [x] **ADR-25 Concurrent external edit = last-write-wins for v0.4.** On flush, the writer's
  `processFrontMatter` reads current frontmatter; the M6 write overwrites the target field. No
  conflict dialog in v0.4.
  - Context: single-author, local tool; concurrent edits to the *same field mid-drag* are rare.
  - Options: (a) last-write-wins *(chosen)*; (b) conflict prompt; (c) merge.
  - Consequences: simple + predictable; the metadata-cache re-render surfaces any external change
    right after. A conflict prompt is a candidate later refinement (PRD Open Question).
  - Recommended. User confirmed: **Yes**

- [x] **ADR-26 Test surface = spy-able `processFrontMatter` in the mock.** Replace the bare `vi.fn()`
  with an impl that invokes the mutator against a per-file frontmatter object tests can assert, and
  emits a `metadataCache.changed` the view listens to.
  - Context: write tests must assert the exact frontmatter mutation and the re-render round-trip
    without a real vault; the mock must stay faithful to the real API shape (memory:
    obsidian-mock-must-match-real-api).
  - Options: (a) keep bare `vi.fn()` (can't assert mutation); (b) spy-able impl *(chosen)*.
  - Consequences: enables AC-level write + round-trip tests; small mock extension, real-API-shaped.
  - Recommended. User confirmed: **Yes**

## Quality Requirements

- **Correctness:** every F1–F8 AC is an automated test (pure-model unit tests first — TDD RED).
- **Write integrity:** write tests assert only the target key(s) change (sibling-field untouched).
- **Accessibility:** each drag feature has a passing keyboard-alternative test; roles/labels present.
- **No regressions:** M5 read views + all gates (typecheck ×3, lint, schema:check, build, full suite)
  stay green.
- **Mobile-safe:** pointer events + `processFrontMatter` only.

## Acceptance Criteria (EARS)

Traces PRD F1–F8 (Gherkin) to component behaviour:

- **AC-1 (F1):** When a card is dropped on a different status column, the system shall write `status`
  = that column and `order` = `insertOrder(neighbours)` via one `commitMany`, and shall write nothing
  on a same-column same-slot drop.
- **AC-2 (F1):** While a status column has no integer gap at the drop slot, the system shall renumber
  the column `10,20,30,…` in one batched write.
- **AC-3 (F2):** When a Plotgrid cell is clicked, the system shall toggle that plotline in the
  scene's `plotlines` list (append if absent, remove preserving order if present) and write via
  `commit`.
- **AC-4 (F2):** Where a plotline link is unresolved, the system shall render its axis flagged and
  non-interactive.
- **AC-5 (F3):** When a rail card is dropped, the system shall write an integer `storyDay` from the
  drop position (clamped ≥1) and shall not modify `order`.
- **AC-6 (F4):** The system shall nest locations by resolved `world`, place unresolved/cycle/over-depth
  nodes as flagged roots, and write nothing.
- **AC-7 (F5):** When Swimlane mode is active, the system shall render one lane per distinct
  key value (pov|location|plotline) with neutral lanes for absent values, fan a multi-plotline scene
  into each lane, and write nothing.
- **AC-8 (F6):** While zoomed, the system shall keep scene names clickable-to-drill and shall reset
  zoom/pan on view re-open (no persistence).
- **AC-9 (F7):** When any write commits, the system shall change only the target field(s), re-render
  optimistically, reconcile on `metadataCache.changed`, and be revertible by `Cmd+Z`.
- **AC-10 (F7):** If a value is invalid, the system shall write nothing and roll back with an error
  indication.
- **AC-11 (F8):** For every draggable card, the system shall provide a keyboard command that produces
  the identical write, announce the result via a live region, and never start a drag from a
  `[data-sf-link]` region.

## Risks and Technical Debt

### Known Technical Issues

- **Pointer + Obsidian's own drag** could interfere at view edges → scope drop resolution to
  `[data-sf-*]` targets inside the view body; ignore drops outside.
- **Renumber write burst** (ADR-17) writes N notes → batched into one `commitMany` pass, rare path.

### Technical Debt

- **`commitMany` is M6-introduced** but generally useful; the Inspector could adopt it later.
- **`location` scope resolver** (ADR-19) partially overlaps the deferred `excludedFolders` settings
  picker debt from M5 — same denylist constant, same eventual settings retrofit.
- **Editable swimlanes / drag-to-reparent** intentionally deferred; the `Draggable` strategy seam is
  designed so they slot in without a host change.

### Implementation Gotchas

- `processFrontMatter` receives a **mutable** `fm` object — set keys, don't replace the object.
- A `list` field written as a JS array round-trips as a YAML list; preserve existing order on toggle.
- The delegated M5 click router runs on `contentEl` (survives `body.empty()`) — pointer listeners
  must not double-fire drill; guard on `[data-sf-link]` first (AC-F8.3).

## Glossary

### Domain Terms
- **Status column / Kanban** — scenes grouped by the `status` select value.
- **Plotgrid** — plotline × scene membership matrix over `plotlines`.
- **Swimlane** — a Timeline lane keyed by `pov`/`location`/`plotline` (read-only grouping).
- **Placement** — dragging a scene to change its integer `storyDay`.
- **World chain** — the `location.world` parent link forming the location hierarchy.

### Technical Terms
- **`commit` / `commitMany`** — the single-key / atomic-multi-key validated write functions.
- **`Draggable` strategy** — a renderer-supplied `{computeDrop,computeKey}` consumed by the handler.
- **Optimistic + reconcile** — local re-render then `metadataCache.changed`-driven refresh.
- **Sparse-integer order** — `10,20,30,…` insertion scheme with rare full renumber.

### API/Interface Terms
- **`processFrontMatter(file, fn)`** — Obsidian's atomic frontmatter mutator (mobile-safe write path).
- **`metadataCache.on("changed")`** — the post-write refresh signal.
- **`resolveWorkspaceScope` / location resolver** — active-note → in-scope `TFile[]`.
