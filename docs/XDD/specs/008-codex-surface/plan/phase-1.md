---
title: "Phase 1: Pure models"
status: pending
version: "1.0"
phase: 1
---

# Phase 1: Pure models

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: SDD/Building Block View — Directory Map]` — where each module lives
- `[ref: SDD/Application Data Models]` — `FieldModel`, `FieldSection`, `FieldDef`, `GeneratedArtifact`
- `[ref: SDD/Implementation Examples]` — the width rule and `classify()`, both with traced walkthroughs
- `[ref: SDD/Complex Logic: building the FieldModel]` — the algorithm and its traced example
- `[ref: ADR-0002]`, `[ref: ADR-0003]`

**Key Decisions**:
- **ADR-31** — the FileClass reader produces data; the editor renders it and never reads FileClasses.
- **ADR-32** — width from field type; `ui` hints come from our schema, not the FileClass.
- **ADR-34/35** — templates are rendered whole; `classify()` needs the stored parameters.

**Dependencies**: none. **Runs in parallel with Phase 2.**

**Ships**: nothing user-visible. This is the foundation — kept small, fully unit-tested, no Obsidian
imports outside the typed shapes.

---

## Tasks

Establishes the four pure layers every later phase builds on. Every module here is testable without
a vault: given inputs, produce values.

- [ ] **T1.1 `collectionResolver` — record + settings → notes** `[activity: domain-modeling]` `[parallel: true]`

  1. Prime: Read the tag-include / folder-exclude rule `[ref: SDD/CON-7]` and the existing
     `src/scoping/workspaceScope.ts` (`DEFAULT_EXCLUDED_FOLDERS`) so the two agree.
  2. Test: a tag matches and returns its notes; a note under an excluded folder is absent; an
     **empty tag returns a misconfigured result, never all notes** `[ref: PRD/F3]`; excluded-folder
     matching is prefix-based and does not match a folder whose name merely starts the same
     (`00 Meta` must not exclude `00 Metadata`); an unknown collection id resolves to empty.
  3. Implement: `src/codex/collectionResolver.ts` — pure function over an injected note index, so
     tests need no vault.
  4. Validate: unit tests pass; lint clean; types check; no Obsidian import beyond `TFile` typing.
  5. Success:
     - [ ] Selection is by tag; folders only exclude `[ref: SDD/AC — PRD F3]`
     - [ ] An empty tag reports misconfiguration `[ref: PRD/F3 AC]`

- [ ] **T1.2 `fileClassReader` — resolve and parse the chain** `[activity: domain-modeling]` `[parallel: true]`

  1. Prime: Read the real shape in `test/StoryForge/00 Meta/FileClasses/fc-character-fantasy.md`
     (`extends`, `fieldsOrder`, `fields[].type`, `options.valuesList`) `[ref: SDD/Code Context]`.
     Note two traps from `[ref: SDD/Implementation Gotchas]`: **`fieldsOrder` holds prefixed ids**
     (`f-name`, `g-species`) that map to `fields[].id`, **not** names; and `tagNames`/`filesPaths`
     may be **empty**, so "which FileClass applies" cannot rely on them alone.
  2. Test: a single class parses; `extends` produces a base-first chain; **a cycle truncates at the
     first repeat** `[ref: PRD/F6 error AC]`; a malformed class is skipped and the rest of the chain
     still parses `[ref: PRD/F6 error AC]`; an unknown `type` maps to `Unknown`; `fieldsOrder`
     resolves through ids; a class with empty `tagNames` is still reachable via `extends`.
  3. Implement: `src/fileclass/fileClassReader.ts` + `src/fileclass/fileClassTypes.ts` — the narrow
     shape we depend on, so the metadata-menu format risk is contained to one module
     `[ref: ADR-31]`.
  4. Validate: unit tests over fixtures copied from the real generated files; lint; types.
  5. Success:
     - [ ] Chain, order, types and enum values are read from data `[ref: SDD/AC — PRD F6]`
     - [ ] Malformed input degrades, never throws `[ref: SDD/Error Handling]`
     - [ ] No write path exists in this module `[ref: SDD/AC — PRD F6]`

- [ ] **T1.3 `fieldModel` + `uiHints` — chain → ordered typed sections** `[activity: domain-modeling]`

  1. Prime: Read the algorithm and its traced walkthrough `[ref: SDD/Complex Logic]` and the width
     rule with its field-by-field table `[ref: SDD/Implementation Examples]`.
  2. Test: one section per FileClass, base first; **a field declared twice renders once, in the
     earliest section** `[ref: PRD/F6 edge case]`; tier 2 (no chain → the note's own keys, typed by
     value); tier 3 (undeclared key → "Other properties"); the width rule reproduces S102/S103
     exactly — assert `name/role/status/occupation` half, `level/affinity/awakened` half,
     `skills/guild` full, `tagline`/`portrait` full via hint; a `Select` whose current value is not
     in its declared list **preserves the current value** `[ref: PRD/F6 edge case]`.
  3. Implement: `src/editor/fieldModel.ts` + `src/editor/uiHints.ts` (depends on T1.2).
  4. Validate: unit tests; lint; types.
  5. Success:
     - [ ] The three tiers behave as specified `[ref: SDD/AC — PRD F6]`
     - [ ] Layout is derived, never per-kind branching `[ref: ADR-32]`

- [ ] **T1.4 `baseGenerator` — template render + `classify()`** `[activity: domain-modeling]` `[parallel: true]`

  1. Prime: Read the classifier and its traced table `[ref: SDD/Implementation Examples]` and
     `[ref: ADR-0003 §Decision]`.
  2. Test: rendering substitutes tag and excluded folders and produces valid `.base` YAML; **a
     folder name containing a space is quoted correctly**; an empty exclusion list produces no
     `not:` block rather than an empty one; `classify()` returns each of `clean` / `regenerate` /
     `ask` / `reconsent` for the five rows of the SDD table; `verify:false` always returns `clean`.
  3. Implement: `src/library/baseGenerator.ts` — whole-file render, **never a patch** `[ref: ADR-34]`.
  4. Validate: unit tests including a YAML round-trip through the existing
     `validateBasesConfig` (`src/bases/basesConfig.ts`) so generated output is provably a valid
     `BasesConfigFile`; lint; types.
  5. Success:
     - [ ] Every classifier row of `[ref: SDD/Implementation Examples]` is covered by a test
     - [ ] A settings change classifies as `regenerate` (silent), a hand edit as `ask`
           `[ref: SDD/AC — Edge Cases]`

- [ ] **T1.5 Phase Validation** `[activity: validate]`

  - Run all Phase 1 tests. Verify every module is free of Obsidian runtime imports (typing only) so
    they stay unit-testable. `npm test`, `npm run lint`, `npm run typecheck` green.
