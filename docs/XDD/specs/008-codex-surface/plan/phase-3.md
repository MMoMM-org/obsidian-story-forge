---
title: "Phase 3: Store, settings and the artifact model"
status: pending
version: "1.0"
phase: 3
---

# Phase 3: Store, settings and the artifact model

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: SDD/Data Storage Changes]` — the record and settings shapes
- `[ref: SDD/ADR-29]`, `[ref: SDD/ADR-35]`, `[ref: ADR-0003]`
- `[ref: SDD/Known Technical Issues]` — the double-copy defect
- `[ref: PRD/F3]` (tag + excluded folders in settings), `[ref: PRD/F7]` (provenances)

**Key Decisions**:
- **ADR-29** — `kind` discriminant; legacy records **migrate silently**, and if the vault file was
  hand-edited before the upgrade its content becomes the baseline (that file is the one rendered).
- **ADR-35** — `{sourceChecksum, params, instanceChecksum, verify}`; the store keeps **no** YAML copy.

**Dependencies**: **Phase 1** (T1.4 `classify`).

**Ships**: nothing user-visible except the settings fields. Kept small; its value is that P4 and P7
have somewhere to put state, and that an active defect is closed.

---

## Tasks

Gives Collections and Cards a home in the store, closes the double-copy divergence, and stops the
consent gate from policing the user's own settings.

- [ ] **T3.1 Record shapes and the `kind` discriminant** `[activity: data-architecture]`

  1. Prime: Read `src/store/types.ts` — `ViewRecord` and the fail-closed `applyDefaults`
     `[ref: SDD/Application Data Models]`.
  2. Test: `applyDefaults` gives a legacy record `kind:"view"`; a collection round-trips with
     `generated` and `surfaces`; a malformed `generated` block degrades to "not generated" rather
     than throwing; `surfaces` defaults to both false; unknown `kind` values fall back to `"view"`
     (fail-closed).
  3. Implement: extend `src/store/types.ts` with `kind`, `surfaces`, `generated`; keep every guard
     fail-closed `[ref: SDD/ADR-29]`.
  4. Validate: unit tests; lint; types.
  5. Success:
     - [ ] Legacy shapes parse without loss `[ref: SDD/ADR-29]`

- [ ] **T3.2 Silent migration of legacy `bases` records** `[activity: data-architecture]`

  1. Prime: Read `[ref: SDD/ADR-29]` including the accepted nuance, and
     `src/consent/ConsentGate.ts` l.292 (`_evaluateBasesRecord` checksums `record.source`, which
     today **holds the YAML**).
  2. Test: a legacy `bases` record becomes `kind:"collection"` with `source` as a **path**; the
     instance checksum is computed from the vault file that exists; **if that file was edited
     pre-upgrade, its current content becomes the baseline and no prompt appears**
     `[ref: SDD/ADR-29]`; a legacy record whose vault file is missing migrates to `regenerate`;
     migration is idempotent (running twice changes nothing).
  3. Implement: migration inside the store load path — no separate command, no user action.
  4. Validate: unit tests over persisted-fixture JSON captured from the current shape; lint; types.
  5. Success:
     - [ ] An existing install upgrades without visible change `[ref: SDD/ADR-29]`
     - [ ] Migration is idempotent

- [ ] **T3.3 Close the double-copy defect** `[activity: backend-api]`

  1. Prime: Read `src/catalog/CatalogService.ts` (VERIFY → MATERIALISE → PERSIST, `_materialise`
     l.205) and `[ref: SDD/Known Technical Issues]`. Today the YAML is written to the vault **and**
     persisted as `record.source`; drift is computed over the store copy while `_openCodex` opens
     the vault file.
  2. Test: after install, the store holds **no** YAML — only path, checksums and params; editing the
     vault file now produces `ask` (previously: silently nothing) `[ref: SDD/AC — Edge Cases]`; a
     failed write still leaves no orphaned record (the existing rollback keeps working).
  3. Implement: `CatalogService` persists the ADR-35 record; the vault file becomes the single
     artifact.
  4. Validate: unit tests; lint; types.
  5. Success:
     - [ ] Editing the rendered file is detected `[ref: SDD/Known Technical Issues]`
     - [ ] Exactly one copy of the YAML exists `[ref: SDD/ADR-35]`

- [ ] **T3.4 Consent gate: generated artifacts are not consented imports** `[activity: backend-api]`

  1. Prime: Read `ConsentGate.evaluate` decision order (l.84–140) and `[ref: ADR-0003 §Context]` —
     the collision that makes the naive approach unusable.
  2. Test: a **generated** collection whose params changed evaluates to consented and regenerates —
     **no drift, no modal** `[ref: PRD/F3 AC]`; an **imported** DataviewJS view keeps the full gate
     unchanged; an imported Bases/DQL entry stays enable/disable; a generated collection whose
     *source template* changed evaluates to drift (re-consent) `[ref: SDD/AC — Edge Cases]`.
  3. Implement: branch on `kind`/`generated` before the drift check; leave every other path byte-identical.
  4. Validate: unit tests asserting the untouched paths are untouched; lint; types.
  5. Success:
     - [ ] Settings changes never request consent `[ref: SDD/AC — PRD F3]`
     - [ ] Imported content keeps its existing protection `[ref: ADR-0003 §Consequences]`

- [ ] **T3.5 Settings fields** `[activity: frontend-ui]`

  1. Prime: Read `src/types/index.ts` and `src/settings/SettingsTab.ts`;
     `[ref: SDD/Data Storage Changes]`.
  2. Test: defaults are `fileClassesFolder:"00 Meta/FileClasses"`, `excludedFolders:["00 Meta"]`,
     `editorDock:"bottom"`; a malformed persisted value falls back (fail-closed, as
     `normalizeLinkClickAction` already does); **`exampleSetting` is gone** from the type and the UI
     `[ref: SDD/Known Technical Issues]`.
  3. Implement: extend `PluginSettings`; remove the sample-plugin residue; add the scope section.
  4. Validate: unit tests; lint; types.
  5. Success:
     - [ ] Tag and excluded folders are user-editable with shipped defaults `[ref: PRD/F3 AC]`

- [ ] **T3.6 Phase Validation** `[activity: validate]`

  - Run all Phase 3 tests plus the full suite — the consent and catalog paths are load-bearing for
    M4 features that must not regress. Verify with a hand-built legacy `data.json` fixture that an
    existing install migrates silently. `npm test`, `npm run lint`, `npm run typecheck` green.
