---
title: "Phase 3: Store, settings and the artifact model"
status: completed
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

- [x] **T3.1 Record shapes and the `kind` discriminant** `[activity: data-architecture]`

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
     - [x] Legacy shapes parse without loss `[ref: SDD/ADR-29]`

- [x] **T3.2 Silent migration of legacy `bases` records** — **DESCOPED 2026-08-02 (user)**
  `[activity: data-architecture]`

  > **This task ships no migration.** It was built, reviewed and then reverted (`1759be7`) once the
  > premise failed: **no legacy `bases` record exists in any vault** — the test vault's `data.json`
  > holds two Dataview imports and nothing else, and there is no other install. T3.3 persists the
  > ADR-35 shape at install time, so there is nothing to migrate *from*. Two follow-on fixes were
  > kept: `catalogId`-based duplicate matching in `CatalogService` (`b6d387c`) and the
  > `generated`-block short-circuit in `ConsentGate.evaluate` (`ef76f14`), which T3.4 builds on.
  > ADR-6's "never persist on read" is intact — the exception this task introduced is gone with it.
  > See the spec README decision log, 2026-08-02. The original task text is kept below unchanged, as
  > the record of what was specified.

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
     - Descoped with this task, not met: ~~An existing install upgrades without visible change~~ · ~~Migration is idempotent~~

- [x] **T3.3 Close the double-copy defect** `[activity: backend-api]`

  > **Two gaps opened by this task, assigned 2026-08-02.** Both are documented in code and neither is
  > reachable today (the catalog ships zero entries and F7's binding UI does not exist), but both are
  > real and must not be rediscovered by accident.
  >
  > 1. **`BasesFenceEngine` still reads `record.source` as raw YAML.** That holds only for
  >    `kind:"view"` records now. Engine dispatch (`SidebarView`, `EngineRegistry`) branches on
  >    `engine` alone, never on `kind`, so nothing stops a `kind:"collection"` record reaching the
  >    YAML renderer with a vault *path*. The engine was deliberately left alone — reading vault
  >    files pulls async IO into a render path Phase 4/F7 owns. **Must be closed before a collection
  >    record is bound to a surface (PRD F7)** — i.e. in **Phase 7**. Commented in
  >    `src/engines/BasesFenceEngine.ts` and `src/catalog/CatalogService.ts`.
  > **Superseded 2026-11-02, audit before T5.5.** Item 2 below named T3.5 as owner, and T3.5 moved the
  > work on without any task taking it. The hand-edit half is closed in `7cf6440`: a hand edit now
  > outranks a params change and classifies `ask`. The rest, reconciling `generated.params`, is a
  > GATE on **T7.3**. The item is kept as written, as the record.
  >
  > 2. **`generated.params` does not describe verbatim-copied curated entries**, which are written by
  >    `_materialise` and never rendered from params (T7.3 owns templating). Because `classify()`
  >    checks `sameParams` **before** the instance-checksum comparison, a params change **outranks a
  >    hand edit**: `regenerate` wins over `ask` and the user's edits are overwritten. Pinned by
  >    `"[HAZARD] a params change outranks a hand edit — regenerate wins over ask"` in
  >    `test/catalog/CatalogService.test.ts`. **T3.5 must reconcile already-installed records'
  >    `generated.params` when it introduces real settings values — not merely swap the injection
  >    site in `main.ts`.**

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
     - [x] Editing the rendered file is detected `[ref: SDD/Known Technical Issues]`
     - [x] Exactly one copy of the YAML exists `[ref: SDD/ADR-35]`

- [x] **T3.4 Consent gate: generated artifacts are not consented imports** `[activity: backend-api]`

  > **`classify` → `ConsentDecision` mapping, decided 2026-08-02.** `ConsentDecision` gained no new
  > member: `clean` / `regenerate` / `ask` → `consented`; `reconsent` → `drift{reason:"checksum"}`.
  > **`ask` maps to `consented`** because the gate decides *render* permission, not *overwrite*
  > permission — ADR-0003's "ask the user; offer regenerate" is a regeneration-path concern, and the
  > signed-off mockup (`anvil-workbench-codex.html:1152-1161`) describes that prompt in prose but
  > draws **no UI state** for it, so building it here would breach CON-10. **The ask prompt belongs
  > to Phase 7**, alongside the regeneration path it guards.
  >
  > Two seams were added to `ConsentGate` — `getCurrentSourceChecksum(record)` and
  > `getCurrentParams()` — both **required**, deliberately: defaulting them let a call site compile
  > without wiring and silently classify as `regenerate`, which already made a `catalog-e2e` test
  > assert `clean` while exercising `regenerate`. Once T7.3 wires regeneration to that same state, a
  > forgotten seam would overwrite a user's file. A `null` upstream checksum compares as unchanged
  > ("cannot tell, do not nag") and can never produce drift. Both seams are **placeholders in
  > `main.ts`** until T3.5 (params) and T7.3 (template checksum).

  1. Prime: Read `ConsentGate.evaluate` decision order (l.84–140) and `[ref: ADR-0003 §Context]` —
     the collision that makes the naive approach unusable.
  2. Test: a **generated** collection whose params changed evaluates to consented and regenerates —
     **no drift, no modal** `[ref: PRD/F3 AC]`; an **imported** DataviewJS view keeps the full gate
     unchanged; an imported Bases/DQL entry stays enable/disable; a generated collection whose
     *source template* changed evaluates to drift (re-consent) `[ref: SDD/AC — Edge Cases]`.
  3. Implement: branch on `kind`/`generated` before the drift check; leave every other path byte-identical.
  4. Validate: unit tests asserting the untouched paths are untouched; lint; types.
  5. Success:
     - [x] Settings changes never request consent `[ref: SDD/AC — PRD F3]`
     - [x] Imported content keeps its existing protection `[ref: ADR-0003 §Consequences]`

- [x] **T3.5 Settings fields** `[activity: frontend-ui]`

  > **Two scope decisions, 2026-08-03 (user).**
  >
  > 1. **`excludedFolders` is wired through, not just stored.** `src/scoping/workspaceScope.ts`
  >    hardcoded `DEFAULT_EXCLUDED_FOLDERS = ["00 Meta"]`, self-described as *"the placeholder for the
  >    future `excludedFolders` settings picker"*. `resolveWorkspaceScope` and `resolvePlotlineScope`
  >    now take the list as a parameter, threaded from settings through a `getExcludedFolders` seam on
  >    `AnvilView` and `SidebarView` (mirroring `getLinkClickAction`, read per call so a change needs
  >    no reload). The shipped default is unchanged, and tests pin implicit-call == explicit-default so
  >    only a user who edits the setting sees a difference. This closes the long-deferred
  >    folder-exclusion debt. The literal now lives in `src/types/index.ts` — `workspaceScope`
  >    re-exports it — so the settings model keeps **zero framework dependency**.
  > 2. **No tag field ships here.** F3's *"both its tag and its excluded folders are editable"* is
  >    satisfied by **Phase 7**'s per-entry Library UI, per the 2026-08-02 decision that per-collection
  >    tag editing belongs there. Recorded so T3.6's drift check does not read it as a dropped
  >    criterion. `cardByCollection` and `dismissedHints` are likewise **not** in this task despite
  >    appearing in the SDD's Data Storage Changes — they belong to Phase 4 and F8.
  >
  > `main.ts`'s `collectionParams` stays a placeholder: no collection record can exist yet
  > (`catalog/` ships zero entries), and install-time and classify-time params must keep reading one
  > shared value or a spurious `regenerate` results. Wiring it is Phase 7's.

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
       — excluded folders done; **open until Phase 7's per-entry Library UI** ships the tag field
     - [x] The **Link click action** setting's UI copy says *inspect*, and says it
           surface-neutrally `[ref: SDD/ADR-28]`

  > **Also owns two settings-copy defects, assigned here 2026-07-31** because this is the task that
  > already touches the settings fields — neither had an owner in phases 3–8.
  >
  > 1. **The dropdown still says "drill".** ADR-28 decided the *stored* values stay `"drill"` /
  >    `"open"` for compatibility **while the UI says *inspect***. The storage half shipped; the UI
  >    half did not — `src/settings/SettingsTab.ts:121` still reads *"Drill into linked note (stay
  >    in Workbench)"*. Rename the **option labels only**; the persisted values and
  >    `normalizeLinkClickAction` are untouched, and a test should assert that explicitly, since
  >    renaming a stored value would silently reset every user's setting to the fail-closed default
  >    `[ref: SDD/ADR-28]`.
  > 2. **The description names one surface for a global setting.** The wording introduced in T2.6 —
  >    *"when you click a link in **the Workbench**"* — is wrong: there is one setting, read per
  >    click by the **shared** `NavigationController` for **both** the Anvil and the Workbench
  >    (`getLinkClickAction`). A user reading it would reasonably expect the Anvil to be unaffected.
  >    It needs surface-neutral wording. *(The string itself is being corrected separately; recorded
  >    here so the requirement is not lost, and so this task verifies rather than re-fixes it.)*

- [x] **T3.6 Phase Validation** `[activity: validate]`

  - Run all Phase 3 tests plus the full suite — the consent and catalog paths are load-bearing for
    M4 features that must not regress. Verify with a hand-built legacy `data.json` fixture that an
    existing install migrates silently. `npm test`, `npm run lint`, `npm run typecheck` green.

  > **Closed 2026-08-03.** All eight gates green: `npm test` (108 files, 1992 tests, **0 skipped**),
  > `lint`, `typecheck`, `typecheck:test`, `typecheck:mock`, `schema:check` (PASS, 0 errors), `build`.
  > No `CONSTITUTION.md` exists, so that check does not apply.
  >
  > **The legacy-fixture check found a real defect and is why this gate exists.** The *migration* half
  > of the criterion is moot (T3.2 descoped), but the underlying question was live and unverified:
  > Phase 3 changed both persisted shapes, so a pre-Phase-3 `data.json` had to be proven to load
  > without loss. `test/integration/phase-3-upgrade.test.ts` — built from the live test vault's actual
  > `data.json` — caught that `loadSettings()`'s `Object.assign({}, DEFAULT_SETTINGS, stored)` copies
  > **every** persisted key, so `exampleSetting` rode back onto `plugin.settings` on upgrade and the
  > next save wrote it to disk. **G17 was reopening for exactly the upgrading users T3.5's removal was
  > meant to fix.** Fixed in `0d0ec52` by a `normalizeSettings(raw)` allow-list in `src/types/index.ts`
  > that returns a typed literal, so adding a sixth field without normalizing it is a **compile error**.
  >
  > **Drift check: clean apart from the recorded descopes**, plus two documentation-drift findings,
  > both fixed here rather than deferred: ADR-29 (`solution.md`) and ADR-0003's Migration consequence
  > still described the withdrawn migration as decided — both now carry a *Revised 2026-08-02* note;
  > and T3.3's `BasesFenceEngine` dispatch gap claimed Phase 7 as its owner while **no Phase 7 task
  > actually held it** — now a GATE on **T7.1**, the task that first binds a collection to a surface.
