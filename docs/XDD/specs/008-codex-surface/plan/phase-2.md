---
title: "Phase 2: Anvil shell and navigation"
status: in_progress
version: "1.0"
phase: 2
---

# Phase 2: Anvil shell and navigation

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: PRD/F1]` — the Anvil, 7 ACs · `[ref: PRD/F2]` — navigation, 8 ACs
- `[ref: SDD/ADR-27]`, `[ref: SDD/ADR-28]`
- `[ref: SDD/CON-4]` — view type ids are frozen
- Mockups **S91** (tab strip), **S94** (a management tab unchanged), **S95** (Workbench)

**Key Decisions**:
- **ADR-27** — ids stay frozen; the **files move** `src/workspace/` → `src/anvil/`.
- **ADR-28** — one `NavigationController`; surfaces contribute target markers, not behaviour.

**Dependencies**: none. **Runs in parallel with Phase 1.**

**Ships**: a user-visible increment on its own — one main-window view with a tab switcher, one
consistent click rule, and a named sidebar. No Codex content yet; the Codex tab renders its empty
state.

---

## Tasks

Turns four commands into one surface and gives clicking a single rule. Nothing about Timeline,
Plotgrid, Plotlines or Board changes except where it lives.

- [x] **T2.1 Move the host, keep the id** `[activity: refactoring]`

  1. Prime: Read `src/pluginConstants.ts` — `SIDEBAR_VIEW_TYPE` carries *"Stable — never change
     after first release"* `[ref: SDD/CON-4]`. Read `[ref: SDD/ADR-27]` for why the files move
     anyway.
  2. Test: the existing `WorkspaceView` suite passes **unchanged** after the move (imports updated
     only); a leaf persisted under the old view type still restores; `getViewType()` returns the
     **same string** as before.
  3. Implement: move `src/workspace/WorkspaceView.ts` → `src/anvil/AnvilView.ts` (+ test file);
     update imports; change **display name only** (`getDisplayText`). `WORKSPACE_VIEW_TYPE` keeps
     its value and is re-exported from its new home.
  4. Validate: full suite green — this task must be behaviour-neutral; lint; types.
  5. Success:
     - [x] No view type id string changed `[ref: SDD/AC — PRD F1]`
     - [x] Zero test behaviour changes; only import paths move

- [x] **T2.2 Tab strip and the `codex` layout member** `[activity: frontend-ui]`

  1. Prime: Read the layout union (`src/anvil/AnvilView.ts` l.54 pre-move) and mockup **S91**
     (tab strip) and **S94** (Timeline-only controls appear on the Timeline tab and are hidden
     elsewhere).
  2. Test: the strip renders Codex · Timeline · Plotgrid · Plotlines · Board; selecting a tab swaps
     the body and keeps the strip; **Timeline-only controls are hidden on every other tab**
     `[ref: PRD/F1 AC]`; the `codex` tab renders a placeholder empty state; state survives a
     re-render.
  3. Implement: `src/anvil/anvilTabs.ts` + extend the layout union with `codex`.
  4. Validate: unit tests over the rendered DOM; lint; types.
  5. Success:
     - [x] One view, five tabs, management tabs behave exactly as in M5/M6 `[ref: SDD/AC — PRD F1]`

- [x] **T2.3 One command in, legacy commands redirected** `[activity: backend-api]`

  1. Prime: Read the command registration in `src/main.ts` (l.131–165) — four `open-*` commands.
  2. Test: `Open Anvil` opens the view with Codex selected; each legacy id
     (`open-timeline`, `open-plotlines`, `open-kanban`, `open-plotgrid`) opens the Anvil **with its
     tab selected** `[ref: PRD/F1 AC]`; running `Open Anvil` twice **reveals** the existing leaf
     rather than creating a second `[ref: PRD/F1 AC]`.
  3. Implement: add `open-anvil`; keep the four ids registered as redirects so existing hotkeys
     survive `[ref: SDD/Risks — hotkeys]`.
  4. Validate: unit tests with the command mock; lint; types.
  5. Success:
     - [x] Existing hotkeys keep working `[ref: SDD/AC — PRD F1]`

- [x] **T2.4 `NavigationController` — the target-kind matrix** `[activity: domain-modeling]`

  1. Prime: Read the matrix `[ref: PRD/F2]` and both current implementations —
     `src/anvil/AnvilView.ts` (~l.435, `data-sf-link` → `_drill` via `revealAndShowFile`) and
     `src/views/SidebarView.ts` (~l.748, XOR of setting and modifier). They currently differ; that
     difference is the bug being fixed.
  2. Test: classification by target kind — name/link, card body, structural control, editable field;
     **the name wins over the surrounding card body** `[ref: PRD/F2 AC]`; a modifier inverts only
     for name and card body, **never for a structural control** `[ref: PRD/F2 AC]`; an unknown
     target produces **no action and no write** `[ref: PRD/F2 AC]`; changing the setting takes
     effect without a reload.
  3. Implement: `src/navigation/navigationController.ts` — pure classification plus an `inspect`
     callback each host supplies `[ref: ADR-28]`.
  4. Validate: unit tests; lint; types.
  5. Success:
     - [x] Behaviour depends on target kind, not on the hosting surface `[ref: SDD/AC — PRD F2]`

- [ ] **T2.5 Wire both surfaces to the controller** `[activity: frontend-ui]`

  1. Prime: Read `[ref: ADR-28]` on *inspect* semantics per surface.
  2. Test: **inspect in the Anvil shows the entry inside the Anvil and opens/reveals/re-targets no
     other leaf** `[ref: PRD/F2 AC]` — this is the regression the user reported; inspect in the
     Workbench suspends follow until Back or open-note; **open-note changes no panel's selected
     tab** `[ref: PRD/F2 AC]`.
  3. Implement: replace both bespoke click paths with the controller; the Anvil's `inspect` targets
     its own body (the Codex tab in P4), not `revealAndShowFile`.
  4. Validate: unit tests per surface; lint; types.
  5. Success:
     - [ ] A click in the Anvil no longer hijacks the Workbench `[ref: PRD/F2]`

- [x] **T2.6 Rename the sidebar to Workbench** `[activity: frontend-ui]`

  1. Prime: Mockup **S95**; `[ref: SDD/CON-4]` — display only.
  2. Test: the command is `Open Workbench`; the ribbon tooltip, view display name and settings
     heading all say Workbench; `SIDEBAR_VIEW_TYPE` is unchanged `[ref: PRD/F1 AC]`.
  3. Implement: display strings only, sentence-case per the obsidianmd rule.
  4. Validate: unit tests assert the id is untouched; lint (incl. the sentence-case rule); types.
  5. Success:
     - [x] Naming is consistent in commands, ribbon, view and settings `[ref: SDD/AC — PRD F1]`

- [ ] **T2.7 Phase Validation** `[activity: validate]`

  - Run the full suite: the M5/M6 view tests must pass **unchanged** — this phase moves and renames,
    it does not alter behaviour. Manual check on `test/StoryForge/`: open the Anvil, switch every
    tab, click a name, a card body and a chevron in each, and confirm no panel switches tab by
    itself. `npm test`, `npm run lint`, `npm run typecheck`, `npm run build` green.
