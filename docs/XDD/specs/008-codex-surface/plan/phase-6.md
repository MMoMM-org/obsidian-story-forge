---
title: "Phase 6: Deriving away the hardcoded field lists"
status: pending
version: "1.0"
phase: 6
---

# Phase 6: Deriving away the hardcoded field lists

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: PRD/F6]` — 11 ACs · `[ref: ADR-0002]` · `[ref: SDD/ADR-31]`, `[ref: SDD/ADR-32]`
- `[ref: SDD/Technical Debt]` — the full inventory of hardcoded field behaviour
- `[ref: SDD/CON-5]` (revised) — one **type** change (`portrait`/`image` → media) plus the `wide`
  hint; **read `docs/schema-change-runbook.md` before touching the schema**; `schema:check` stays green

**Key Decisions**:
- **ADR-32 (revised)** — only the `wide` hint survives, and it lives in **our** `schema/*.json`.
  Images come from metadata-menu's native **`Media`** type, so the image control follows from the
  type for our fields and the user's alike — no hint, no asymmetry.
- **ADR-0002** — `inspectorFields.ts` is **deleted**, not extended.

**Dependencies**: **Phase 5** (the editor renders from `FieldModel` already).

**Ships**: the extensibility promise, made real — a user FileClass is indistinguishable from ours.
This is the phase that turns "the plugin supports one story model" into "the plugin supports a story
model".

---

## Tasks

Removes the duplicated knowledge. Nothing here adds a feature; it removes the reason the plugin
could only ever know four kinds of thing.

- [x] **T6.1 Schema change: media type + the `wide` hint** `[activity: data-architecture]`

  > **Media half done 2026-11-02, ahead of Phase 5's close, at the user's request** so T5.6 can check
  > real `Media` fields. The `ui: "wide"` work, including the round-trip test below, is T6.1b's.
  > Every consumer resolves wikilinks through `createAssetResolver`. `inspectorFields.ts` keeps the
  > fields as `text`, with one named exemption in its drift test, until ADR-0002 deletes that file.

  > **Read `docs/schema-change-runbook.md` first** — `CLAUDE.md` requires it before any schema
  > change, and this task changes a field's **type and stored value shape**, not just a hint.

  1. Prime: the runbook's flow (`edit schema/<type>.json → npm run schema:gen → npm run schema:check`)
     and its rename/seed-note/XDD ripple section. Today `portrait` is `type: text` holding a **path**;
     it becomes the media type holding a **wikilink**.
  2. Test: the schema type vocabulary gains `media`; `schema-gen` maps it to metadata-menu's
     **`Media`**; `schema:check` is green; the generated FileClass for `character` declares
     `portrait` as `Media`, and `location`/`object` declare `image` the same way; **seed notes are
     rewritten from path values to wikilinks** and still resolve; an optional `ui: "wide"` round-trips
     (only `tagline` uses it).
  3. Implement: `schema/character.json`, `schema/location.json`, `schema/object.json`; the generator's
     type map; the seed-note values.
  4. Validate: `npm run schema:gen && npm run schema:check` green; unit tests; lint; types.
  5. Success:
     - [x] Image fields are wikilinks that survive a rename `[ref: PRD/F6 AC]`
     - [x] `ui: image` never exists — the control comes from the type `[ref: SDD/ADR-32]`
     - [x] No story **fact** was added `[ref: SDD/CON-5]`

- [ ] **T6.1b The `wide` hint — declaration *and* its loader** `[activity: data-architecture]` `[parallel: true]`

  > **This task owns the `UiHints` producer** (assigned 2026-07-30 at the Phase 1 close-out).
  > `src/editor/fieldModel.ts` takes `uiHints: UiHints = {}` — `Readonly<Record<string, "wide">>` —
  > and **defaults it to empty**. Declaring `"ui": "wide"` in `schema/*.json` is therefore only half
  > the job: **no task in any phase currently loads those declarations into a `UiHints`**, so until
  > this one does, the default holds, `widthOf` never sees a hint, and **`tagline` never reaches
  > full width** — the single visible symptom of the whole hint mechanism, silently absent. The
  > loader is part of this task, not an implied side effect of it.

  1. Prime: `scripts/schema-gen.mjs` (write-only, **no delete path**) and `scripts/schema-check.mjs`;
     `src/editor/fieldModel.ts` (`UiHints`, `buildFieldModel`'s `uiHints = {}` default);
     `[ref: SDD/ADR-32]` — **`wide` is the only hint that survives**; images come from the `Media`
     type (T6.1), so `ui: "image"` is never built.
  2. Test: a field may carry `"ui": "wide"`; `schema:gen` emits **byte-identical** FileClass output
     for fields without a hint — the hint is ours and must never reach the FileClass files;
     `schema:check` stays green; an unknown `ui` value is rejected at generation time; **the loader
     turns the `schema/*.json` declarations into a `UiHints` and `tagline` renders full width
     end-to-end** — assert against `buildFieldModel`'s output, not against the schema file, since a
     declaration nothing reads is what this test exists to catch.
  3. Implement: optional `ui` in the schema files (`tagline` only); **plus the loader**: read the
     hints out of `schema/*.json` (or the artifact generated from them) and pass the resulting
     `UiHints` into `buildFieldModel` wherever the editor builds a model.
  4. Validate: `npm run schema:gen && npm run schema:check` green; unit tests; lint; types.
  5. Success:
     - [ ] The hint never leaves our schema for a FileClass file `[ref: SDD/ADR-32]`
     - [ ] The hint is **loaded**, not merely declared — `tagline` is full width in the running
           editor `[ref: SDD/AC — PRD F6]`

- [ ] **T6.2 Replace the name coupling in the panel** `[activity: refactoring]`

  1. Prime: Read the inventory in `[ref: SDD/Technical Debt]` and confirm it against the source
     before changing anything: `src/panel/kindFields.ts` header (character → `portrait`, location and
     object → `image`, each triggering a tile), `src/panel/renderers/character.ts` l.108
     (`portrait`) and l.119 (`tagline`), `src/panel/components.ts` l.467 (`locationType` → "type"
     display remap). **If the inventory is incomplete, extend it and update the SDD** — deviation
     protocol.
  2. Test: a character whose image field is **not** called `portrait` still renders a tile, because
     the field is typed `Media` `[ref: PRD/F6]` — the case that is impossible today; the three
     existing kinds render exactly as before (snapshot the current output first, then refactor);
     a `Media` value that is a wikilink resolves, and one whose target is missing shows the monogram
     fallback rather than a broken image.
  3. Implement: drive the tile from the **field type**, not the field name; keep `kindFields.ts` as
     the **native fallback config only** `[ref: SDD/Implementation Boundaries]`.
  4. Validate: unit tests including the pre-refactor snapshots; lint; types.
  5. Success:
     - [ ] A user's image field works without being named `portrait` `[ref: ADR-0002]`
     - [ ] No visual regression in the three shipped kinds

- [ ] **T6.3 Delete `inspectorFields.ts`** `[activity: refactoring]`

  1. Prime: Read `src/inspector/inspectorFields.ts` and confirm every field it declares is reachable
     through the FileClass chain — **this is the gate for deletion** `[ref: SDD/Implementation
     Boundaries]`: nothing is removed before its replacement passes its ACs.
  2. Test: a coverage test asserts that for each shipped kind, the `FieldModel` produced from the
     generated FileClasses contains **every field** the old list declared, with a compatible type;
     `InspectorController` behaves identically for scalars and enums after the switch.
  3. Implement: point `InspectorController` at `fieldModel`; delete `inspectorFields.ts` and its test.
  4. Validate: full suite; lint; types.
  5. Success:
     - [ ] The old list is provably redundant before it is removed `[ref: ADR-0002]`
     - [ ] The Workbench editor keeps working `[ref: SDD/Implementation Boundaries]`

- [ ] **T6.4 Tier 2 and tier 3 in the running plugin** `[activity: integration]`

  1. Prime: `[ref: SDD/Complex Logic]` tiers; `[ref: PRD/F6 ACs]`.
  2. Test: with the FileClasses folder **absent or empty**, the editor still opens and shows the
     note's own keys typed by value `[ref: PRD/F6 AC]` — this is the fresh-install path until #27
     lands; a key no FileClass declares appears under *Other properties* `[ref: PRD/F6 AC]`; the
     plugin **never writes to a FileClass** (assert no write call targets that folder).
  3. Implement: wire the folder setting into the reader; cache per file, invalidated on
     `metadataCache.changed` for that folder `[ref: SDD/Quality Requirements]`.
  4. Validate: unit tests; lint; types.
  5. Success:
     - [ ] A fresh install with no FileClasses still edits `[ref: SDD/AC — PRD F6]`

- [ ] **T6.5 Phase Validation** `[activity: validate]`

  - Run the full suite. **The demonstration that matters**: hand-write
    `test/StoryForge/00 Meta/FileClasses/fc-character-custom1.md` with `extends: fc-character` and
    three fields, open a character in the Codex, and confirm its own labelled section appears with
    correct types and two-column layout — **without touching plugin code**. Then run
    `npm run schema:gen` and confirm the hand-written file is **untouched** `[ref: PRD/F6 AC]`.
    `npm test`, `npm run lint`, `npm run typecheck`, `npm run schema:check` green.
