---
title: "Phase 4: Integration & validation"
status: completed
version: "1.0"
phase: 4
---

# Phase 4: Integration & validation

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: SDD/Building Block View — Directory Map]` (main.ts wiring) · `[ref: SDD/ADR-6]` (persist discipline)
- `[ref: SDD/System-Wide Patterns — Lifecycle/Leaks]` · `[ref: SDD/Quality Requirements]`
- `[ref: PRD/Success Metrics]` (verification signals) · `[ref: PRD/Feature 1]` (cleanup) · `[ref: PRD/Feature 4]` (reload persistence)
- `test/StoryForge/` live vault (Wardens of Moonharbor seed data)

**Key Decisions**:
- `main.ts` stays thin: instantiate `ViewStore` + `ScopingService`, register the view, gate first work on `onLayoutReady`. Fold existing settings into `StoryForgeData`. No persist on the follow path.

**Dependencies**: **Phases 1, 2, 3** all complete.

---

## Tasks

Wires the modules into the plugin and verifies M1 end-to-end (integration + E2E).

- [x] **T4.1 Plugin wiring** `[activity: integration]`

  1. Prime: Read the directory map + ADR-6 `[ref: SDD/Building Block View — Directory Map]` `[ref: SDD/ADR-6]`
  2. Test (RED): plugin `onload` instantiates store + scoping + registers the view; settings fold into `StoryForgeData` and persist across reload; a settings save must not clobber `views` (read-modify-write); `onunload` runs cleanly **without** detaching leaves (Obsidian releases the registered view type natively; obsidianmd guidance — preserves user layout); no work runs before `onLayoutReady`.
  3. Implement (GREEN): modify `src/main.ts` (wire modules, `activateView`, layout-ready gate) and `src/types/index.ts` (settings shape under `StoryForgeData`); keep `main.ts` thin.
  4. Validate: tests pass; lint; typecheck; `npm run build` green.
  - Success: store state persists across reload `[ref: PRD/Feature 4]`; main stays thin `[ref: SDD/Directory Map]`.

- [x] **T4.2 Lifecycle cleanup verification** `[activity: testing]`

  1. Prime: Read the lifecycle/leak pattern `[ref: SDD/System-Wide Patterns — Lifecycle/Leaks]`
  2. Test (RED): after `onClose`/`unload`, no registered `workspace`/`metadataCache` listeners or timers remain (assert via obsidian mock `_runCleanup` / handler count); resolved-context cache cleared.
  3. Implement (GREEN): ensure every listener/timer uses `registerEvent`/`registerInterval`/`registerDomEvent`; clear state in `onClose`.
  4. Validate: cleanup test passes; lint; typecheck.
  - Success: zero listener/timer leaks on unload/detach `[ref: PRD/Feature 1]` `[ref: SDD/Quality Requirements]`.

- [x] **T4.3 Live-vault verification checklist** `[activity: validate]`

  1. Prime: Read the PRD success metrics + tracking table `[ref: PRD/Success Metrics]`
  2. Test (manual, documented): with `npm run dev` on `test/StoryForge/` — open panel via ribbon + command; no note → S2; open a non-entity note → S4; open Scene 1 → S6 with pov/characters/location/plotlines; open Mara → S7; pin Mara, switch notes → stays (S8), unpin resumes; reload Obsidian → any saved view record persists.
  3. Implement (GREEN): record the checklist + observed results under the spec (or `docs/live-testing.md`); fix any gaps found.
  4. Validate: every checklist item passes.
  - Success: follow/pin/states verified live `[ref: PRD/Success Metrics]`.

- [x] **T4.4 Phase Validation** `[activity: validate]`

  - Full green gate: `npm test`, `npm run lint`, `npm run typecheck`, `npm run schema:check`, `npm run build`. Confirm every PRD acceptance criterion (Features 1–4) maps to a passing test or a checked live item.
