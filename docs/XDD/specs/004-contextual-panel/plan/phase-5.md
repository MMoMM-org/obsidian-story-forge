---
title: "Phase 5: Curated views, seed notes & validation"
status: complete
version: "1.0"
phase: 5
---

# Phase 5: Curated views, seed notes & validation

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: PRD/F7]` — curated `_forge` view seed set
- `[ref: SDD/Building Block View/Curated views]` · Integration research view list (#4–#14)
- `[ref: SDD/Quality Requirements]` — coverage/correctness/robustness signals
- `[ref: SDD/Risks]` — all sample `portrait`/`image` empty → must seed non-empty
- `test/StoryForge/sf-views/characters-in-scene.md` (existing view-def format),
  `src/import/ViewDefinition.ts`

**Key Decisions**:
- Curated views are authored as `sf-view` notes now (provenance handled by M4's catalog);
  exercised via the existing M2 import flow. Field-filtered `WHERE contains(field, this.file.link)`
  reverse queries.
- Seed the sample vault so every mockup state is reproducible (fantasy char, object-in-scene,
  lore-in-scene, ≥1 non-empty image/portrait).

**Dependencies**: Phases 1–4 complete.

---

## Tasks

Ships the default view set, fills the seed-vault gaps, and runs the full exit-criteria
validation for v0.1.

- [x] **T5.1 Curated `_forge` `sf-view` seed set** `[activity: data]` `[ref: PRD/F7]`

  1. Prime: existing `sf-view` note format `[ref: test/StoryForge/sf-views/characters-in-scene.md]`;
     `ViewDefinition` parser `[ref: src/import/ViewDefinition.ts]`.
  2. Test: each new view note parses as a valid `ViewDefinition` (one fenced block, `sf-*`
     frontmatter); DQL uses `WHERE contains(field, this.file.link)`; imports via the M2 flow
     and renders (or degrades gracefully when Dataview absent).
  3. Implement: author `sf-view` notes for the reverse-relation core — appears-in, owns,
     inhabitants, scenes-here, plotline-scenes, book-scenes (+ keep characters-in-scene).
  4. Validate: import each in the dev vault; renders with Dataview; native fallback when absent.
  5. Success:
     - [x] Curated view set authored + importable; graceful without Dataview `[ref: PRD/F7]`

- [x] **T5.2 Seed-vault gap notes** `[activity: data]` `[ref: SDD/Risks]`

  1. Prime: Integration research sample-data gaps (no fantasy char; no object/lore in a scene;
     all portraits empty) `[ref: SDD/Risks/Known Technical Issues]`.
  2. Test: a fantasy character note (fantasy FileClass) exercises the fantasy sub-block; a scene
     references an object and a lore note so their fuzzy "appears in" is non-empty; ≥1 note has a
     non-empty `image`/`portrait`; `schema:check` green.
  3. Implement: add the seed notes under `test/StoryForge/30 Canon/` + `10 Manuscript/` (English).
  4. Validate: `schema:check`; open in dev vault, panels populate (S35 with real image, object/lore
     appears-in populated, fantasy sub-block visible).
  5. Success:
     - [x] Every mockup state is demonstrable on the seed vault `[ref: SDD/Quality Requirements]`

- [x] **T5.3 Integration & live-vault validation** `[activity: validate]` `[ref: SDD/Acceptance Criteria]`

  1. Prime: the exit criterion (open any canon/scene note → right facts + appears-in, live) and
     the ground-truth assertions `[ref: SDD/Quality Requirements]` `[ref: PRD/Success Metrics]`.
  2. Test: integration tests covering the follow→resolve→render pipeline for all six kinds; the
     ground-truth assertions (Mara appears-in = Scenes 1-3 POV; Tobias owns Beacon Lens;
     Lighthouse inhabitants; Dying Light scenes ordered); drill-in/open/swap; empty/unresolved/cycle.
  3. Implement: integration test suite; reconcile any AC-count/mockup drift in the spec docs.
  4. Validate — full gate:
     ```bash
     npm run test && npm run lint && npm run typecheck && npm run typecheck:test \
       && npm run schema:check && npm run build
     ```
  5. Success:
     - [x] All six gates green; every PRD AC (F1–F7) verified `[ref: PRD/Success Metrics]`
     - [x] Exit criterion met → tag v0.1 candidate `[ref: PRD/Vision]`
