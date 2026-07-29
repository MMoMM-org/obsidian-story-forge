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
- `[ref: SDD/CON-5]` — presentation hints only; `schema:check` stays green

**Key Decisions**:
- **ADR-32** — `ui` hints live in **our** `schema/*.json`, never in a FileClass file, because
  metadata-menu rewrites those through its own UI and could drop unknown keys.
- **ADR-0002** — `inspectorFields.ts` is **deleted**, not extended.

**Dependencies**: **Phase 5** (the editor renders from `FieldModel` already).

**Ships**: the extensibility promise, made real — a user FileClass is indistinguishable from ours.
This is the phase that turns "the plugin supports one story model" into "the plugin supports a story
model".

---

## Tasks

Removes the duplicated knowledge. Nothing here adds a feature; it removes the reason the plugin
could only ever know four kinds of thing.

- [ ] **T6.1 `ui` hints in the schema and the generator** `[activity: data-architecture]`

  1. Prime: Read `schema/character.json` (`portrait` is `type: text`), `scripts/schema-gen.mjs`
     (write-only, **no delete path**) and `scripts/schema-check.mjs`; `[ref: SDD/CON-5]`.
  2. Test: a field may carry `"ui": "wide" | "image"`; `schema:gen` emits unchanged FileClass output
     for fields without a hint (**byte-identical** — the hint is ours, not metadata-menu's);
     `schema:check` stays green; an unknown `ui` value is rejected at generation time.
  3. Implement: optional `ui` in the schema files (`tagline` → `wide`, `portrait` → `image`, plus the
     `image` field on location and object); thread it into the plugin's own hint table.
  4. Validate: `npm run schema:gen && npm run schema:check` green; unit tests; lint; types.
  5. Success:
     - [ ] No story field added or changed `[ref: SDD/CON-5]`
     - [ ] Hints never leave our schema for the FileClass files `[ref: ADR-32]`

- [ ] **T6.2 Replace the name coupling in the panel** `[activity: refactoring]`

  1. Prime: Read the inventory in `[ref: SDD/Technical Debt]` and confirm it against the source
     before changing anything: `src/panel/kindFields.ts` header (character → `portrait`, location and
     object → `image`, each triggering a tile), `src/panel/renderers/character.ts` l.108
     (`portrait`) and l.119 (`tagline`), `src/panel/components.ts` l.467 (`locationType` → "type"
     display remap). **If the inventory is incomplete, extend it and update the SDD** — deviation
     protocol.
  2. Test: a character whose image field is **not** called `portrait` still renders a tile when the
     field carries the `image` hint `[ref: PRD/F6]` — the case that is impossible today; the three
     existing kinds render exactly as before (snapshot the current output first, then refactor).
  3. Implement: drive the tile from the hint; keep `kindFields.ts` as the **native fallback config
     only** `[ref: SDD/Implementation Boundaries]`.
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
