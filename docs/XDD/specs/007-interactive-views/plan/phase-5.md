---
title: "Phase 5: Write-back renderers — Kanban + Plotgrid"
status: done
version: "1.0"
phase: 5
---

# Phase 5: Write-back renderers — Kanban + Plotgrid

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: SDD/Building Block View; renderKanban, renderPlotgrid]`
- `[ref: SDD/Implementation Examples; Write round-trip (Kanban drop)]`
- `[ref: SDD/ADR-14 (commitMany), ADR-15 (Draggable), ADR-17 (order)]`
- `[ref: PRD/F1, F2, F8; AC-F1.*, AC-F2.*]`
- Phase 1 models (`kanbanModel`/`insertOrder`, `plotgridModel`), Phase 2 (`commit`/`commitMany`), Phase 3 (`InteractionHandler`/`Draggable`)
- `src/workspace/renderShared.ts` (add `statusColumnColor`), `src/panel/components.ts`

**Key Decisions**:
- **Kanban** (drag) binds cards to the drag `InteractionHandler` via a `Draggable`; **Plotgrid** (click-toggle) owns its own click/keyboard listeners — see the SDD "Interaction-mechanism split". Both write only through the single seam.
- Kanban writes `status`+`order` atomically via **`commitMany`** using `insertOrder`; the **renumber** path (no integer gap) splices the dragged card at its drop position, writes the dragged card's status+order atomically via the handler, and batches the *other* cards' fresh sparse orders via `deps.renumber` (ADR-17).
- Plotgrid toggles `plotlines` (list add / order-preserving remove) via **`commit`**, with optimistic flip + rollback on failure.
- Both ship a **keyboard alternative** (F8): Kanban via `computeKey`, Plotgrid via Space/Enter.
- **T5.1 (Kanban) ∥ T5.2 (Plotgrid)** — different files (styles.css shared → sequenced).

**Dependencies**: **Phase 1 + Phase 2 + Phase 3.**

---

## Tasks

Delivers the two interactive write surfaces.

- [x] **T5.1 renderKanban (drag → status + order)** `[activity: frontend-ui]` `[parallel: true]` `[ref: SDD/AC-1, AC-2; PRD/F1, AC-F1.*]`

  1. Prime: Read the Kanban write round-trip example; `kanbanModel`/`insertOrder` (Phase 1); the `Draggable`/`InteractionHandler` API (Phase 3); `appendStatusBadge`/`statusSlug` in `renderShared`.
  2. Test (RED): `renderKanban(host, groups, deps, handler)` renders one column per status (via `kanbanModel`), cards draggable off the non-link surface; a `Draggable.computeDrop` returns `[{status: targetColumn}, {order: insertOrder(neighbours)}]`; a same-column same-slot drop returns `[]` (no-op); a drop into a full-gap slot triggers the renumber batch; the keyboard path (`computeKey`, Arrow←/→) moves a card to the prev/next status column with the same write; unresolved/absent-status cards land in a neutral column; empty scope → empty-state.
  3. Implement (GREEN): create `src/workspace/renderKanban.ts` + `statusColumnColor` in `renderShared.ts`; add `sf-kb-*` CSS (columns, cards, drag ghost, drop line).
  4. Validate: `test/workspace/renderKanban.test.ts` green (drag via `dispatchEvent` + keyboard); lint; stylelint; types.
  5. Success:
     - [ ] Drop writes `status`+`order` atomically (one `commitMany`); no-op drop writes nothing `[ref: PRD/AC-F1.2, AC-F1.6; SDD/AC-1]`
     - [ ] Renumber path covered; keyboard parity `[ref: SDD/AC-2; PRD/AC-F8.1]`

- [x] **T5.2 renderPlotgrid (toggle cell → plotlines)** `[activity: frontend-ui]` `[parallel: true]` `[ref: SDD/AC-3, AC-4; PRD/F2, AC-F2.*]`

  1. Prime: Read `plotgridModel`/`PlotgridModel.has` (Phase 1); the `commit` list-field write path; `role="table"`/`gridcell`/`aria-checked` a11y notes in the SDD.
  2. Test (RED): `renderPlotgrid(host, model, deps)` renders the plotline×scene matrix (filled where `has(i, pl)`); clicking an empty cell appends `[[Plotline]]` to the scene's `plotlines` and shows filled; clicking a filled cell removes it **preserving remaining order** and shows empty; an unresolved plotline axis is flagged and its cells are non-interactive; keyboard (Space/Enter on a focused cell) toggles identically; a scene toggled to zero plotlines is reported for the Unassigned bucket.
  3. Implement (GREEN): create `src/workspace/renderPlotgrid.ts`. **Interaction refinement (see SDD "Interaction-mechanism split"):** Plotgrid is a **click-toggle**, not a drag — it does NOT use the drag `InteractionHandler`. Cells register their own `click` + `Space`/`Enter` listeners via `Component.registerDomEvent` (CON-4 cleanup) and write through the **same single seam** `commit(app, file, "plotlines", newArray, {type:"list"})`, with optimistic flip + reconcile. Add `sf-pg-*` CSS.
  4. Validate: `test/workspace/renderPlotgrid.test.ts` green; lint; stylelint; types.
  5. Success:
     - [ ] Toggle add/remove writes `plotlines` correctly, order preserved `[ref: PRD/AC-F2.2, AC-F2.3]`
     - [ ] Unresolved axis flagged + non-interactive; keyboard parity `[ref: PRD/AC-F2.4, AC-F8.1]`

- [x] **T5.3 Phase Validation** `[activity: validate]`

  Run Phase 5 tests; assert each write touches **only** its target field(s) (sibling-untouched via the spy mock). Confirm the **single write seam** (`commit`/`commitMany`) is the only write path and each surface has a keyboard alternative (F8): Kanban binds cards to the drag `InteractionHandler`; Plotgrid uses a click-toggle via `registerDomEvent` (per the SDD interaction-mechanism split). Lint + stylelint + `typecheck`+`typecheck:test`. Cross-check AC-F1.* / AC-F2.*.
