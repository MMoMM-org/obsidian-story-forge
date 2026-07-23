---
title: "Phase 3: Render building blocks + collapse + CSS"
status: done
version: "2.0"
phase: 3
---

# Phase 3: Render building blocks + collapse + CSS

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: SDD/Building Block View; renderNavigator/renderTimeline/renderPlotlines, collapseStore]`
- `[ref: SDD/Cross-Cutting — User Interface & UX; Design System]`
- `[ref: SDD/ADR-6, ADR-8]`
- `[ref: PRD/F2, F4, F5]`
- `docs/XDD/specs/006-declarative-views/mockups.html` (S59, S62, S69 — the render targets)
- `src/panel/components.ts` (section/collapse, stampLinkEl, unresolvedEl, emptyLine)
- `src/views/SidebarView.ts` (`_toggleSection`, `data-sf-section-toggle`, `data-sf-link` routing)

**Key Decisions**:
- ADR-8: build fresh in the StoryLine visual language; reuse collapse/drill/empty primitives.
- ADR-6: collapse state keyed by (surface + scope + group label), transient in-memory.
- Delegated single-listener routing (CON-4): `data-sf-section-toggle` (collapse), `data-sf-link` (drill).
- Render functions take a `mode` param reserving the M6 branches (`renderTimeline("rail"|"swimlane")`,
  `renderPlotlines("list"|"subway")`) — M5 implements `rail`/`list` only (ADR-13).

**Dependencies**: Phase 1 (`Group`) + Phase 2 (`SceneRow` extension, `actLabel`, `plotlineColor`,
`statusTally`). Phases 4 & 5 consume these building blocks.

---

## Tasks

Delivers the pure-DOM render building blocks for all three surfaces + the collapse store + CSS.
These render into a passed host and take injected deps (no ItemView/SidebarView coupling yet).

- [ ] **T3.1 collapseStore** `[activity: domain-modeling]` `[parallel: true]` `[ref: SDD/ADR-6; PRD/F8]`

  1. Prime: Review the M3 transient collapse approach `[ref: src/engines/NativeScopingEngine.ts]`.
  2. Test (RED): get/toggle keyed by (surfaceKey, scopeKey, groupLabel); toggling Act 1 in Book-A
     scope does not affect Book-B, nor the Navigator vs main-area surface; defaults to expanded;
     `clear()` on teardown.
  3. Implement (GREEN): Create `src/workspace/collapseStore.ts` — keyed map with `get`/`toggle`/`clear`.
  4. Validate: unit tests green; lint; types.
  5. Success: [ ] Collapse persists per surface+scope+group, not globally `[ref: PRD/F8; SDD/ADR-6]`

- [ ] **T3.2 renderTimeline (rail) + renderPlotlines (list)** `[activity: frontend-ui]` `[ref: SDD/Complex Logic; PRD/F1, F2, F5]`

  1. Prime: Read `section`/`stampLinkEl`/`unresolvedEl`/`emptyLine` + mockups S62/S69 `[ref: mockups.html]`.
  2. Test (RED):
     - `renderTimeline(host, groups, deps, "rail")`: one act **divider pill** per group labelled by
       `group.label` (already `actLabel`-derived); each scene a **card** (title, POV, `location`,
       status **badge**, `wordcount`) with a `plotlineColor` rail **node** and `data-sf-link`;
       `when` shown, missing fields → placeholders; empty groups → empty-state.
     - `renderPlotlines(host, groups, deps, "list")`: one collapsible `section` per plotline group
       (dot via `plotlineColor` + count); scenes as rows with `data-sf-link`; **Unassigned** last;
       **unresolved** group flagged; initial collapsed state from injected lookup;
       `data-sf-section-toggle` on headers.
     - `mode` other than `rail`/`list` → throws "not until M6" (guards ADR-13).
  3. Implement (GREEN): `src/workspace/renderTimeline.ts` + `src/workspace/renderPlotlines.ts`.
  4. Validate: `test/workspace/renderTimeline.test.ts` + `renderPlotlines.test.ts` (jsdom); lint; types.
  5. Success:
     - [ ] Rail cards + act pills render; list groups collapsible; scenes clickable `[ref: PRD/AC-T?, AC-P4, AC-F4]`
     - [ ] Empty scope → empty-state; missing fields → placeholders `[ref: PRD/F5]`

- [ ] **T3.3 renderNavigator (filter list + act rows + progress)** `[activity: frontend-ui]` `[ref: SDD/UI; PRD/F1, F2, F3]`

  1. Prime: mockups S59–S61 `[ref: mockups.html]`; `SidebarView` row/tab styling.
  2. Test (RED): renders a **plotline filter list** (from `plotlineModel` groups: `plotlineColor`
     dot + name + count, plus an "All" row); **act-grouped** collapsible scene rows (dot · `order` ·
     title · `when`); a **progress** bar from `statusTally`; selecting a plotline row sets
     `state.plotlineFilter` and re-renders filtered rows; empty scope → empty-state.
  3. Implement (GREEN): `src/workspace/renderNavigator.ts` — `renderNavigator(host, resolved, app,
     state, deps)`; scene rows carry `data-sf-link`; filter rows carry a `data-sf-plotline` marker.
  4. Validate: `test/workspace/renderNavigator.test.ts` (jsdom) green; lint; types.
  5. Success:
     - [ ] Filter list + act rows + progress render; filter narrows rows `[ref: PRD/F1, F2]`

- [ ] **T3.4 CSS — sf-nav-* / sf-tl-* / sf-pl-*** `[activity: frontend-ui]` `[parallel: true]` `[ref: SDD/Design System; CON-1]`

  1. Prime: existing `sf-section`/`sf-lrow`/`sf-count`/`sf-trail`/`sf-unres`/`sf-empty*` + mockup CSS `[ref: styles.css, mockups.html]`.
  2. Test (RED): assert class names emitted by T3.2/T3.3 render tests (no runtime `<style>`).
  3. Implement (GREEN): add `sf-nav-*` (filter box, plotline row + color dot, act row, scene row,
     progress bar), `sf-tl-*` (rail, node, when-gutter, card, status badge, chips), `sf-pl-*`
     (group header + dot, Unassigned/unresolved cues) to `styles.css`; reuse Obsidian vars; status
     badge classes `sf-tl-st-draft`/`-outline`/`-written`.
  4. Validate: `npm run lint` (stylelint) clean; class parity with render tests.
  5. Success: [ ] StoryLine visual language, no runtime style injection, stylelint green `[ref: SDD/CON-1, ADR-8]`

- [ ] **T3.5 Phase Validation** `[activity: validate]`

  Run Phase 3 tests; verify the three renderers + collapse + CSS class parity; `mode` guards reject
  M6 branches. Lint + typecheck. Verify against SDD render design and PRD F1/F2/F4/F5.
