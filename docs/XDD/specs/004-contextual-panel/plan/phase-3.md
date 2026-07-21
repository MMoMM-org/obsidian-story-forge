---
title: "Phase 3: Per-kind panel renderers"
status: completed
version: "1.0"
phase: 3
---

# Phase 3: Per-kind panel renderers

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: SDD/ADR-2]` (panel module + dispatcher) · `[ref: SDD/ADR-9]` (fantasy sub-block)
- `[ref: SDD/Building Block View/Directory Map]` — `src/panel/` layout
- `[ref: SDD/Interface Specifications]` — `PanelRenderer`, `PanelDeps`, `RENDERERS`
- `[ref: PRD/F1]` (character) · `[ref: PRD/F3]` (other kinds) · `[ref: PRD/F5]` (empty/partial)
- `docs/XDD/specs/004-contextual-panel/mockups.html` — states S32–S40, S42
- `src/engines/NativeScopingEngine.ts`, `src/engines/QueryEngine.ts`

**Key Decisions**:
- Renderers are pure `(ctx, el, deps) ⇒ void` in `src/panel/renderers/`; `NativeScopingEngine`
  dispatches on `ctx.activeKind`, `unknown` → current flat fallback (ADR-2).
- XSS-safe `createEl` only; teardown = `el.empty()`; no per-render listeners (delegated via `deps.onOpenLink`).
- `character-fantasy` reuses the character renderer with a conditional fantasy facts block (ADR-9).

**Dependencies**: Phase 1 (kinds/schema/image) **and** Phase 2 (backlinks) must be complete.

---

## Deviations

- **DV-1 (2026-07-20) — `NoteContext` gains `frontmatter`.** The SDD's per-kind renderers
  need the note's scalar frontmatter facts (role/status/tagline/logline/portrait/image/…) for
  the Facts blocks, but `NoteContext` only carried resolved links (`entities`/`backlinks`) and
  `PanelDeps` gave renderers no `app` access. Fix (additive, same pattern as the `backlinks`
  fill): add `frontmatter: Record<string, unknown>` to `NoteContext`, populated from
  `cache.frontmatter` in `ScopingService.resolve()` (empty `{}` on cache-null). Keeps renderers
  pure/data-testable. Folded into T3.2 as its first step. SDD updated (ADR-2 note). Rationale:
  necessary for F1/F3 facts rendering; low-risk additive contract extension.

- **DV-2 (2026-07-20) — Location hierarchy = immediate parent only (M3).** The SDD's
  `worldChain` walks the recursive `world` ancestry via `app.metadataCache`, but per-kind
  renderers are pure (no `app`) and `NoteContext` only carries the active note's immediate
  links. To preserve renderer purity/testability, M3's location "Within" breadcrumb shows the
  **immediate parent** (`ctx.entities` where `field === "world"`) + the current note, plus
  child locations via reverse (`backlinks` `kind==="location"` `field==="world"`). This matches
  mockup S36's single-level breadcrumb. Full multi-level ancestry is deferred (would need a
  precomputed chain in `NoteContext` or `app` in `PanelDeps`). Recorded in T3.3.

## Tasks

Replaces the Context-tab stub with type-aware panels for all six kinds (+ book), consuming
`ctx.frontmatter` (facts), `ctx.entities` (outgoing relations), and `ctx.backlinks` (reverse).

- [x] **T3.1 Shared components + `kindFields`** `[activity: frontend-ui]` `[ref: SDD/Interface Specifications]` — done `2aed26b` (+review fixes `64f78e6`)

  1. Prime: Read the mockup component vocabulary (sections, fact/relation/link rows, empty,
     unresolved, portrait/image tiles) `[ref: mockups.html]`.
  2. Test: `section()` renders a collapsible header (`role=button`, `aria-expanded`, count);
     `unresolvedRow()` is non-clickable + `aria-disabled`; `emptyLine()` renders copy;
     `factRow`/`relationRow`/`linkRow` shape matches mockups; `kindFields` returns the
     per-kind facts/relations split from the schema field names.
  3. Implement: `src/panel/components.ts` + `src/panel/kindFields.ts`; add CSS classes to
     `styles.css` (`.sf-section/.sf-sec-head/.sf-frow/.sf-rel/.sf-lrow/.sf-unres/.sf-portrait/.sf-imgtile`).
  4. Validate: unit tests (DOM assertions) pass; `lint` (incl. stylelint); no `innerHTML`.
  5. Success:
     - [ ] Reusable builders match the mockups; empty/unresolved states covered `[ref: PRD/F5]`

- [x] **T3.2 Character renderer (+ fantasy)** `[activity: frontend-ui]` `[ref: PRD/F1]` `[ref: SDD/ADR-9]` — done `a8e7128` (+review `01973d5`, `58e3ec9`); DV-1 NoteContext.frontmatter + PanelDeps + unresolvedEl landed here

  1. Prime: States S32–S35, S42 `[ref: mockups.html]`; character/character-fantasy schema.
  2. Test: facts+portrait (monogram when `portrait:""`); relationship groups; "appears in"
     with POV flag; "owns"; "related"; empty-relations (S33); unresolved link (S34);
     conditional fantasy sub-block when fantasy fields present (S32 base).
  3. Implement: `src/panel/renderers/character.ts`.
  4. Validate: unit tests reproduce S32–S35; `typecheck`; `lint`.
  5. Success:
     - [ ] Character panel matches S32; empty/unresolved honest `[ref: PRD/F1]` `[ref: PRD/F5]`
     - [ ] Fantasy fields render only when present `[ref: SDD/ADR-9]`

- **DV-3 (2026-07-20) — Reverse-scene lists render in stable basename order (M3).** Mockups
  S39/S40 number plotline/book scenes by `scene.order`, but `buildBacklinks` returns only
  `{file, kind, field}` — not the target scene's `order` frontmatter — so per-kind renderers
  can't sort by `order`. M3 renders reverse-scene lists in a deterministic basename sort; true
  `order` sorting is deferred (would need the reverse index to carry the target's sort key, or
  the renderer to read target frontmatter — neither in M3 scope). Recorded in T3.4.

- [x] **T3.3 Location / object / lore renderers (+ image)** `[activity: frontend-ui]` `[ref: PRD/F3]` `[ref: SDD/ADR-7]` `[ref: SDD/ADR-8]` — done `64a1a89` (+review `0e65ee4`); shared `renderFactsSection` extracted

  1. Prime: States S36–S38 `[ref: mockups.html]`; `worldChain` cycle-safe walk `[ref: SDD/Implementation Examples]`.
  2. Test: location hierarchy breadcrumb (cycle-safe), inhabitants, scenes-here; object owner
     (Unowned when empty) + fuzzy appears-in; lore related (kind-tagged) + referenced-by;
     `image` tile shown only when the field is non-empty, no placeholder when absent.
  3. Implement: `src/panel/renderers/{location,object,lore}.ts`.
  4. Validate: unit tests reproduce S36–S38 incl. cycle guard; `typecheck`; `lint`.
  5. Success:
     - [ ] Each kind renders its layout; hierarchy cycle-safe `[ref: PRD/F3]`
     - [ ] Image tile conditional on `image` presence `[ref: SDD/ADR-7]`

- [x] **T3.4 Scene / plotline / book renderers** `[activity: frontend-ui]` `[ref: PRD/F3]` — done `eb267f9` (+review `bc05fea`); shared `renderReverseSceneList` extracted

  1. Prime: States S39, S40 `[ref: mockups.html]`; scene/plotline/book schema fields.
  2. Test: scene facts + entities-in-scene (POV flagged) + reading-order prev/next; plotline
     facts + reverse scenes ordered by `order`; book facts + reverse scenes; long-title ellipsis.
  3. Implement: `src/panel/renderers/{scene,plotline}.ts` (plotline renderer handles `book` too,
     or a thin `book` wrapper).
  4. Validate: unit tests reproduce S39–S40; `typecheck`; `lint`.
  5. Success:
     - [ ] Scene/plotline/book panels render correctly, scenes order by `order` `[ref: PRD/F3]`

- [x] **T3.5 `NativeScopingEngine` type dispatch + `renderPanel`** `[activity: frontend-ui]` `[ref: SDD/ADR-2]` — done `1f41653` (+review `6eac6e6`); Context tab now renders type-aware panels

  1. Prime: `NativeScopingEngine.render` + `QueryEngine` contract `[ref: src/engines/NativeScopingEngine.ts]`.
  2. Test: `render(null, ctx, el)` dispatches to `RENDERERS[ctx.activeKind]`; `unknown` → flat
     fallback (unchanged); idempotent after `teardown()`; no leaked listeners after `el.empty()`.
  3. Implement: `src/panel/renderPanel.ts` (`RENDERERS` table + `PanelDeps`); rewire
     `NativeScopingEngine.render` to delegate; keep `teardown()`.
  4. Validate: existing engine tests green; SidebarView Context-tab renders type-aware content;
     `typecheck`; `lint`.
  5. Success:
     - [ ] Context tab shows the right kind's panel, live-updating on note switch `[ref: PRD/F1]` `[ref: PRD/F3]`
     - [ ] `QueryEngine` contract unchanged `[ref: SDD/CON-3]`

- [x] **T3.6 Phase Validation** `[activity: validate]` — all 6 gates green; 824 tests / 43 files; all 7 renderers wired; visual S32–S40 reproduction deferred to P5 (no GUI in CI)

  - Run `npm test` (panel + engine suites) + `typecheck` + `typecheck:test` + `lint` + `build`.
  - Manually verify S32–S40 + S42 render in the dev vault (`npm run dev`) across the seed notes.
