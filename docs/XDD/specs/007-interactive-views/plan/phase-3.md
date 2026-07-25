---
title: "Phase 3: InteractionHandler — pointer drag + keyboard + debounced commit"
status: done
version: "1.0"
phase: 3
---

# Phase 3: InteractionHandler — pointer drag + keyboard + debounced commit

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: SDD/Building Block View — Interface Specifications; Interaction handler]`
- `[ref: SDD/Runtime View — Primary Flow; Error Handling]`
- `[ref: SDD/ADR-15 (pointer events), ADR-22 (hybrid re-render), ADR-23 (per-file debounce)]`
- `[ref: PRD/F7, F8; AC-F8.1, AC-F8.3]`
- `src/workspace/WorkspaceView.ts` (delegated `_onClick`, `[data-sf-link]` drill guard, `registerDomEvent`, `DEBOUNCE_MS`)
- `src/inspector/frontmatterWriter.ts` (`commit`, `commitMany` from Phase 2)

**Key Decisions**:
- **Pointer events**, not HTML5 DnD (ADR-15): `pointerdown` → threshold → `pointermove` ghost → `pointerup` `elementFromPoint` drop resolve. A `[data-sf-link]` target **never** starts a drag (drill wins, AC-F8.3).
- A renderer supplies a **`Draggable`** strategy (`computeDrop(card, dropTarget)` / `computeKey(card, key)`); the handler is view-agnostic. Drag and keyboard converge on the **same** entries → one commit path (F8).
- Writes are **per-file debounced** (ADR-23) then flushed via `commit`/`commitMany`; `onAfter` triggers optimistic re-render; the host reconciles on `metadataCache.changed` (ADR-22).
- All listeners via `registerDomEvent`; `destroy()` tears down (CON-4).

**Dependencies**: **Phase 2** (calls the writer). Independent of Phases 1/4.

---

## Tasks

Delivers the single reusable interaction layer that turns a drop/keypress into a validated write.

- [x] **T3.1 Draggable interface + pointer state machine** `[activity: frontend-ui]` `[ref: SDD/ADR-15; PRD/AC-F8.3]`

  1. Prime: Read the `InteractionHandler`/`Draggable`/`CommitEntry` interface spec; study how `WorkspaceView._onClick` guards `[data-sf-link]`.
  2. Test (RED) via `dispatchEvent` in jsdom: `pointerdown` on a plain card arms a drag; movement past the threshold adds `sf-dragging` + a ghost; `pointerup` calls `computeDrop` with the element under the pointer and passes the returned entries to `onWrite`; `pointerdown` whose target is inside `[data-sf-link]` does **not** arm a drag (drill path untouched); an empty `computeDrop` result (no-op / out-of-zone) writes nothing.
  3. Implement (GREEN): create `src/workspace/interactionHandler.ts` — `Draggable`, `CommitEntry` re-export, `InteractionHandler` with `bind(card,file,strategy)` + pointer handlers via `registerDomEvent` on the host.
  4. Validate: `test/workspace/interactionHandler.pointer.test.ts` green; lint; types.
  5. Success:
     - [ ] Drag arms only off the non-link surface; drill guard intact `[ref: PRD/AC-F8.3]`
     - [ ] `computeDrop` entries reach `onWrite`; no-op writes nothing `[ref: SDD/AC-1, AC-11]`

- [x] **T3.2 Keyboard command parity** `[activity: frontend-ui]` `[ref: SDD/ADR-15; PRD/AC-F8.1, AC-F8.2]`

  1. Prime: Re-read the F8 keyboard requirement; note the existing `keydown` Enter/Space handling in `WorkspaceView`.
  2. Test (RED): a focused card receiving the documented keys (e.g. Arrow/modifier) calls `computeKey` and produces **the same** `CommitEntry[]` a drop would; a committed write is announced via an injected `aria-live` region hook; focus is retained/returned appropriately.
  3. Implement (GREEN): add key handling to `InteractionHandler` (shared `_apply(entries)` path used by both pointer + key); expose an `announce(msg)` seam the host wires to a live region.
  4. Validate: `test/workspace/interactionHandler.keyboard.test.ts` green; lint; types.
  5. Success:
     - [ ] Keyboard produces identical writes to drag `[ref: PRD/AC-F8.1, SDD/AC-11]`
     - [ ] Write announced via live region `[ref: PRD/AC-F8.2]`

- [x] **T3.3 Per-file debounce + flush + cleanup** `[activity: frontend-ui]` `[ref: SDD/ADR-22, ADR-23; PRD/AC-F7.3]`

  1. Prime: Read `DEBOUNCE_MS` in `pluginConstants`; review `debounce` usage in `WorkspaceView`.
  2. Test (RED): rapid interactions on the **same** file coalesce into one flush; different files flush independently; the flush calls `commit`/`commitMany` and then `onAfter(file)`; `destroy()` cancels pending flushes and removes listeners (assert via the mock `_runCleanup()`); a write failure invokes the error hook (rollback signal) without throwing.
  3. Implement (GREEN): add the per-file queue + debounced flush + `destroy()` to `InteractionHandler`.
  4. Validate: `test/workspace/interactionHandler.flush.test.ts` green; lint; types.
  5. Success:
     - [ ] Per-file coalescing; independent files; clean teardown `[ref: SDD/ADR-23; CON-4]`
     - [ ] Failure surfaces to the host error hook (no crash) `[ref: SDD/ADR-24]`

- [x] **T3.4 Phase Validation** `[activity: validate]`

  Run Phase 3 tests; verify no listener leaks (mock `_runCleanup`). `typecheck`+`typecheck:test`; lint. Confirm the handler is view-agnostic (no Kanban/Plotgrid specifics leaked in) and that both entry paths (pointer, keyboard) share one commit path (F8).
