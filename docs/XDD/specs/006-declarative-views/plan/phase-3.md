---
title: "Phase 3: Render + collapse + CSS"
status: pending
version: "1.0"
phase: 3
---

# Phase 3: Render + collapse + CSS

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: SDD/Building Block View; renderWorkspace, collapseStore]`
- `[ref: SDD/Cross-Cutting — User Interface & UX]`
- `[ref: PRD/F2, F4, F5]`
- `src/panel/components.ts` (section/collapse, linkRow, stampLinkEl, unresolvedEl, emptyLine)
- `src/views/SidebarView.ts` (`_toggleSection`, `data-sf-section-toggle`, `data-sf-link` routing)

**Key Decisions**:
- ADR-8: reuse M3 components verbatim; pure-DOM render of `Group[]`.
- ADR-6: collapse state keyed by (view + scope + group label), transient in-memory.
- Delegated single-listener routing (CON-4): `data-sf-section-toggle` (collapse),
  `data-sf-link` (drill).

**Dependencies**: Phase 1 (`Group` model).

---

## Tasks

Delivers the read-only DOM render of grouped scenes + the collapse-state store + styling.

- [ ] **T3.1 renderWorkspace** `[activity: frontend-ui]` `[ref: SDD/Complex Logic; PRD/F2, F5]`

  1. Prime: Read `section`/`linkRow`/`stampLinkEl`/`unresolvedEl`/`emptyLine` signatures `[ref: src/panel/components.ts]`.
  2. Test (RED): renders one `sf-section` per `Group` with count badge; each scene a `linkRow` carrying `data-sf-link` (+ `when`/role trail where present); unresolved scenes → `unresolvedEl` (non-clickable); empty `Group[]` → empty-state, never a blank host; a group's initial collapsed state is read from the injected collapse lookup; group headers carry `data-sf-section-toggle`.
  3. Implement (GREEN): Create `src/workspace/renderWorkspace.ts` — `renderWorkspace(host, groups, deps)` where `deps` supplies `onOpenScene`, collapse get/set, and (for Timeline) the `when` column.
  4. Validate: `test/workspace/renderWorkspace.test.ts` green (jsdom, augmented host); lint; types.
  5. Success:
     - [ ] Groups render as collapsible sections; scene rows are clickable links `[ref: PRD/AC-P4, AC-F4]`
     - [ ] Empty scope → empty-state; missing fields → placeholders `[ref: PRD/F5]`

- [ ] **T3.2 collapseStore** `[activity: domain-modeling]` `[parallel: true]` `[ref: SDD/ADR-6; PRD/F8]`

  1. Prime: Review the M3 transient collapse approach `[ref: src/engines/NativeScopingEngine.ts]`.
  2. Test (RED): get/set keyed by (viewType, scopeKey, groupLabel); toggling Act 1 in Book-A scope does not affect Book-B scope; defaults to expanded; cleared on teardown.
  3. Implement (GREEN): Create `src/workspace/collapseStore.ts` — a small keyed map with `get`/`toggle`/`clear`.
  4. Validate: unit tests green; lint; types.
  5. Success: [ ] Collapse persists per view+scope+group, not globally `[ref: PRD/F8; SDD/ADR-6]`

- [ ] **T3.3 Workspace CSS** `[activity: frontend-ui]` `[parallel: true]` `[ref: SDD/Cross-Cutting — Design System]`

  1. Prime: Review existing `sf-section`/`sf-lrow`/`sf-count`/`sf-trail`/`sf-unres` styles `[ref: styles.css]`.
  2. Test (RED): visual — n/a for unit; assert class names are emitted by T3.1 render tests.
  3. Implement (GREEN): add `sf-ws-*` (host layout), `sf-tl-*` (timeline when-label column), `sf-pl-*` (plotline group + Unassigned + unresolved cue) to `styles.css`; reuse M3 vars; no runtime `<style>`.
  4. Validate: `npm run lint` (stylelint) clean; classes match those emitted by render.
  5. Success: [ ] Styling reuses M3 vocabulary; stylelint green `[ref: SDD/CON-1]`

- [ ] **T3.4 Phase Validation** `[activity: validate]`

  Run Phase 3 tests; verify render + collapse + CSS class parity. Lint + typecheck. Verify against SDD render design and PRD F2/F4/F5.
