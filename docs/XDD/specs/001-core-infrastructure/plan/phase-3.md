---
title: "Phase 3: Sidebar panel shell"
status: in_progress
version: "1.0"
phase: 3
---

# Phase 3: Sidebar panel shell

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: SDD/Building Block View — Internal API]` (SidebarView, PanelSubject, ContextTab)
- `[ref: SDD/ADR-2]` (single tabbed ItemView + subject) · `[ref: SDD/ADR-5]` (follow lifecycle)
- `[ref: SDD/Runtime View]` (follow pipeline) · `[ref: SDD/Cross-Cutting — Component States]` (state machine)
- `[ref: mockups.html]` states **S1–S9** (interface source of truth)
- `[ref: PRD/Feature 1 — Note-following panel shell]` · `[ref: PRD/Feature 2 — Pin]`
- Obsidian mock: `test/__mocks__/obsidian.ts` (Setting/DOM factories, `_runCleanup`)

**Key Decisions**:
- One right-sidebar `ItemView`; internal-DOM tabs; **subject source `follow | pinned`** (focused is M3). Follow via `active-leaf-change` (guard own leaf / non-`MarkdownView`) + `metadataCache 'changed'` for the shown note; ~200 ms debounce; first resolve gated on `onLayoutReady`; all listeners via `registerEvent`.

**Dependencies**: **Phase 2** (`ScopingService` + `NoteContext`). Phase 1 not required to start, but Phase 4 wires both.

---

## Tasks

Delivers the dockable panel that follows the active note and renders every state.

- [ ] **T3.1 Panel registration & activation** `[activity: frontend-ui]`

  1. Prime: Read the view interface + ADR-2 `[ref: SDD/Building Block View — Internal API]` `[ref: SDD/ADR-2]`
  2. Test (RED): the view type registers; the ribbon icon and "Story Forge: open panel" command both reveal the panel; reveal-or-create does not create a duplicate leaf; `getDisplayText`/`getIcon` stable.
  3. Implement (GREEN): `src/constants.ts` (`SIDEBAR_VIEW_TYPE`, `ICON`, `DEBOUNCE_MS`); `src/views/SidebarView.ts` skeleton (`ItemView`, `onOpen`/`onClose`, `activateView` reveal-or-create).
  4. Validate: tests (obsidian mock) pass; lint; typecheck.
  - Success: panel docks via ribbon + command, no duplicate leaves `[ref: PRD/Feature 1]`.

- [ ] **T3.2 Follow lifecycle & subject** `[activity: frontend-ui]`

  1. Prime: Read the follow pipeline + ADR-5 `[ref: SDD/Runtime View]` `[ref: SDD/ADR-5]`
  2. Test (RED): `active-leaf-change` on a non-own `MarkdownView` triggers a resolve; focusing the panel's own leaf or a non-`MarkdownView` is ignored; rapid switches coalesce to the last note (debounce); `pinned` subject ignores changes; first resolve waits for `onLayoutReady`; all listeners registered via `registerEvent`.
  3. Implement (GREEN): subject state (`PanelSubject`), the debounced follow pipeline, `metadataCache 'changed'` refresh for the shown note; call `ScopingService.resolve`.
  4. Validate: tests pass; lint; typecheck; no direct `addEventListener`/`setTimeout` (register hooks only).
  - Success: follows the active note; rapid-switch settles on last; guards correct `[ref: PRD/Feature 1]`.

- [ ] **T3.3 State rendering & stub context tab** `[activity: frontend-ui]`

  1. Prime: Read the state machine + mockups `[ref: SDD/Cross-Cutting — Component States]` `[ref: mockups.html]`
  2. Test (RED): each trigger renders its state — no note → S2; non-markdown → S3; non-entity → S4; resolving → S5; resolved scene/character → S6/S7 (stub lists entities with field+kind); error (null cache / malformed) → S9 with a Retry action; header shows title + entity-type badge.
  3. Implement (GREEN): `renderState()` on `SidebarView`; `src/views/StubContextTab.ts` implementing `ContextTab.render(ctx, el)` (dump `NoteContext` rows).
  4. Validate: tests (obsidian mock DOM) pass; lint; typecheck; no `innerHTML` with untrusted data.
  - Success: every situation shows an explicit state, never blank `[ref: PRD/Feature 1]`; stub proves resolved context `[ref: PRD/Feature 3]`.

- [ ] **T3.4 Pin & accessibility** `[activity: frontend-ui]`

  1. Prime: Read the pin feature + UX section `[ref: PRD/Feature 2]` `[ref: SDD/Cross-Cutting — User Interface & UX]`
  2. Test (RED): activating pin freezes the subject and ignores active-note changes (S8); unpin resumes following; pin is a `<button aria-pressed>`; panel has `role=region`, tabs `role=tablist/tab/tabpanel`, state region `aria-live=polite`; arrow keys move between tabs.
  3. Implement (GREEN): pin toggle in the header; ARIA roles/labels; keyboard tab nav; honour `prefers-reduced-motion`.
  4. Validate: tests pass; lint; typecheck.
  - Success: pin holds across navigation, unpin resumes `[ref: PRD/Feature 2]`; a11y attributes present `[ref: SDD/Cross-Cutting — User Interface & UX]`.

- [ ] **T3.5 Phase Validation** `[activity: validate]`

  - Run all Phase 3 tests; lint; typecheck. Verify states match mockups S1–S9 and the follow/guard behaviour matches SDD ADR-2/ADR-5.
