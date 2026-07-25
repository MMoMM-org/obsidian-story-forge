---
title: "Phase 6: Host wiring + integration + gates + finalize"
status: done
version: "1.0"
phase: 6
---

# Phase 6: Host wiring + integration + gates + finalize

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: SDD/Building Block View; WorkspaceView extend]`
- `[ref: SDD/Runtime View; Error Handling]`
- `[ref: SDD/ADR-16 (layout union), ADR-22 (hybrid re-render), ADR-24 (error surface), ADR-25 (last-write-wins)]`
- `[ref: PRD/F6, F7, F8; AC-F7.3, AC-F7.4]`
- `src/workspace/WorkspaceView.ts` (host), `src/main.ts` (view registration + commands), `src/pluginConstants.ts`
- Phases 3/4/5 outputs (handler + all renderers)

**Key Decisions**:
- Extend the **one** `WorkspaceView` (ADR-16): `WorkspaceLayout` → `timeline|plotlines|kanban|plotgrid|locations`; a toolbar carries the mode switch, the Rail|Swimlane toggle + By-key selector, and the zoom controls; the view **owns** the `InteractionHandler` and an `aria-live` region.
- **Hybrid re-render** (ADR-22): optimistic local re-render on write + a `metadataCache.changed` subscription (debounced) reconciles this view and refreshes other open views (AC-F7.3).
- **Error surface** (ADR-24): a failed write rolls back optimistically, marks the card, and shows a `Notice`.
- **last-write-wins** (ADR-25) for concurrent external edits in v0.4.
- Seed extension only if an AC needs a fixture; M4/M5 suites use in-code fixtures, so seed additions are **safe** (verified in spec 006 alignment).

**Dependencies**: **Phase 4 + Phase 5** (all renderers) + Phase 3 (handler). T6.0 seed is independent.

---

## Tasks

Wires the pieces into the live views and proves the end-to-end write round-trip, then closes the spec.

- [x] **T6.0 Seed fixtures (only if needed)** `[activity: test-data]` `[parallel: true]` `[ref: PRD/F4, F5]`

  1. Prime: Inspect `test/StoryForge/` for existing `location` notes + `world` links and the plotline/POV coverage swimlanes need.
  2. Test (RED): identify any AC lacking a fixture — e.g. a `location` with a `world` parent chain (F4 nesting), an **unresolved-`world`** location (AC-F4.3), a scene set exercising multi-plotline swimlane fan-out (AC-F5.3).
  3. Implement (GREEN): add only the missing notes (English content — CON). If nothing is missing, this is a **no-op safety check** (document that).
  4. Validate: `npm run schema:check` green; M4/M5 suites still green (in-code fixtures unaffected).
  5. Success:
     - [ ] Every F4/F5 AC has a live fixture, or documented as already-covered `[ref: PRD/AC-F4.1, AC-F5.3]`

- [x] **T6.1 WorkspaceView layout union + toolbar + handler + error surface** `[activity: frontend-ui]` `[ref: SDD/ADR-16, ADR-22, ADR-24]`

  1. Prime: Read `WorkspaceView` end-to-end (the `_layout` union, `_render`, `_onClick`, `setLayout`, `onClose`); the handler + renderer APIs.
  2. Test (RED): the expanded `WorkspaceLayout` routes each mode to its renderer (kanban→`renderKanban`, plotgrid→`renderPlotgrid`, locations→`renderLocationsTree`, timeline rail/swimlane, zoom); the toolbar switches mode + swimlane key + zoom and persists key per-scope; the view constructs one `InteractionHandler` and passes it to write renderers; on a write failure the card shows the error class + a `Notice` fires (mock the `Notice`); `onClose` calls `handler.destroy()` (no leaks); an `aria-live` region is created and announced into.
  3. Implement (GREEN): extend `WorkspaceView.ts` (union, toolbar, handler ownership, live region, error hook wiring, `metadataCache.changed` subscription). Keep `main.ts` thin.
  4. Validate: `test/workspace/WorkspaceView.m6.test.ts` green; lint; types; mock `_runCleanup` clean.
  5. Success:
     - [ ] All five layouts route + toolbar controls work; key persists per-scope `[ref: SDD/ADR-16, ADR-20]`
     - [ ] Error surface + live region + clean teardown `[ref: SDD/ADR-24; CON-4]`

- [x] **T6.2 Command registration** `[activity: backend-api]` `[ref: SDD/Deployment View]`

  1. Prime: Read how M5 registers the workspace view + Open Timeline/Plotlines commands in `main.ts`.
  2. Test (RED): commands **Open Kanban**, **Open Plotgrid**, **Open Locations** activate the workspace view in the corresponding layout (following the M5 command pattern); no duplicate view types.
  3. Implement (GREEN): add the three commands to `main.ts` (thin — delegate to `setLayout`).
  4. Validate: `test/main.m6.test.ts` (or extend `test/main.test.ts`) green; lint; types.
  5. Success:
     - [ ] Three commands open the right layout `[ref: SDD/Deployment View]`

- [x] **T6.3 Integration — drag → write → re-render round-trip** `[activity: integration-test]` `[ref: PRD/AC-F7.1, AC-F7.3, AC-F7.4]`

  1. Prime: Read the M5 `test/integration/workspace-views.test.ts` pattern; the spy-able mock (Phase 2).
  2. Test (RED): end-to-end over the seed — (a) a Kanban drop writes `status`+`order` and the view + a second open view both reflect it via `metadataCache.changed` (AC-F7.3); (b) a Plotgrid toggle writes `plotlines`; (c) a Timeline drop writes an integer `storyDay` and leaves `order` untouched; (d) a simulated external frontmatter change re-renders (last-write-wins, ADR-25); (e) a `Cmd+Z`-style revert (frontmatter restored → `changed`) updates the view (AC-F7.4).
  3. Implement (GREEN): `test/integration/interactive-views.test.ts`.
  4. Validate: integration suite green.
  5. Success:
     - [ ] Round-trip + two-view consistency + revert proven `[ref: PRD/AC-F7.3, AC-F7.4]`
     - [ ] Timeline write leaves `order` untouched `[ref: PRD/AC-F3.2]`

- [x] **T6.4 Full gates + finalize** `[activity: validate]` `[ref: SDD/Quality Requirements]`

  1. Prime: Re-read the SDD Quality Requirements + this plan's cross-cutting gates.
  2. Test: run the **full** suite + all gates.
  3. Implement: fix any regression; ensure M5 read views + prior suites stay green.
  4. Validate: `npm test` · `npm run typecheck && npm run typecheck:test && npm run typecheck:mock` · `npm run lint` · `npm run schema:check` · `npm run build` — **all green**.
  5. Success:
     - [ ] Every F1–F8 AC has a passing test; no regressions `[ref: PRD/all ACs]`
     - [ ] All gates green; `NOTICE`/docs updated if needed
     - [ ] Spec 007 finalized via `xdd-meta` (phase → Implemented); README decision log updated `[ref: SDD/Deployment View]`
