---
title: "Phase 7: The Library, import and capability disclosure"
status: pending
version: "1.0"
phase: 7
---

# Phase 7: The Library, import and capability disclosure

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: PRD/F7]` — the Library, 10 ACs · `[ref: PRD/F8]` — capability disclosure, 6 ACs
- `[ref: SDD/ADR-34]`, `[ref: SDD/ADR-35]`, `[ref: SDD/ADR-36]`, `[ref: ADR-0003]`
- Mockup **S101** (two lists, three provenances, enable/remove/import)

**Key Decisions**:
- Binding to a surface is a **per-entry toggle in the Library row** (*Anvil* / *Workbench*), decided
  in the PRD review round — not a settings tab per surface.
- **ADR-36** — core plugins may be suggested; community plugins are listed, never nagged.

**Dependencies**: **Phase 3** (records, generation, consent), **Phase 4** (somewhere for a collection
to appear).

**Ships**: extensibility end-to-end — the user can add, replace and remove Collections and Cards, and
finally learns what the optional plugins are for.

---

## Tasks

> **Note from T6.2b (2026-11-02):** the Workbench's Codex tab must pass `createCardTileField` to `renderCodexTab`. `CodexTabOptions.tileField` is required, so TypeScript catches an omission.

Closes the gap that started this whole spec: the distribution machinery served five static files.

- [ ] **T7.1 The Library settings section** `[activity: frontend-ui]`

  1. Prime: Mockup **S101**; `[ref: SDD/Data Storage Changes]` (`surfaces`).
  2. Test: two lists render, each entry marked built-in / from repo / imported `[ref: PRD/F7 AC]`;
     **built-in offers disable but no remove**; imported and from-repo offer **disable and remove**
     `[ref: PRD/F7 AC]`; disabling a collection removes its pill from the Codex `[ref: PRD/F7 AC]`;
     the per-entry Anvil/Workbench toggles put it in exactly the toggled surfaces
     `[ref: PRD/F7 AC]`; removing an entry that is currently displayed leaves no dangling selection.
  3. Implement: Library section in `src/settings/SettingsTab.ts` + `src/library/collectionStore.ts`.
  4. Validate: unit tests; lint (sentence-case UI text); types.
  5. Success:
     - [ ] Provenance governs what may be removed `[ref: SDD/AC — PRD F7]`
     - [ ] A `kind:"collection"` record bound to a surface **renders**, rather than feeding a vault
           path to the YAML renderer — see the gate below

  > **GATE — inherited from Phase 3 (T3.3, assigned here 2026-08-02).** This is the task that first
  > makes a `kind:"collection"` record reachable by a surface, and it must not ship until the
  > dispatch gap is closed. **`src/engines/BasesFenceEngine.ts:27` reads `record.source` as raw
  > `.base` YAML** — true only for `kind:"view"` records. Since T3.3, a collection record's `source`
  > is a vault **path**, and engine dispatch (`src/views/SidebarView.ts` ~l.1369,
  > `EngineRegistry.get(view.engine)`) branches on **`engine` alone, never on `kind`** — so nothing
  > stops a path being handed to the YAML parser. It is unreachable today only because no surface
  > binds a collection; **the per-entry toggles in step 2 are exactly what makes it reachable.**
  > Fix by branching dispatch on `kind` (or reading the vault file for records carrying `generated`),
  > and add a test that a bound collection renders. The hazard is commented at
  > `BasesFenceEngine.ts:12-24` and `CatalogService.ts:31-40`.
  > *Recorded here because the Phase 3 close-out found this gap claimed an owner it had never been
  > given — the same "green suite standing in for a working path" failure the 2026-07-31 decision-log
  > entry warns about.*

- [ ] **T7.2 Engine coverage — import a `.base`, ship a curated Dataview view** `[activity: backend-api]`

  1. Prime: Read `src/import/ViewDefinition.ts` (`engine: "dataview-dql" | "dataviewjs"`) and
     `scripts/build-catalog.mjs` (*"engine: always `bases`"*) — the two halves of the original G1
     defect.
  2. Test: a `.base` imports and becomes a Collection `[ref: PRD/F7 AC]`; a Dataview query imports
     `[ref: PRD/F7 AC]`; **a curated Dataview view installs from the catalog** `[ref: PRD/F7 AC]`;
     an import whose query cannot be parsed or resolved is **refused with a reason and persists
     nothing** `[ref: PRD/F7 AC]`; a DataviewJS import keeps the full consent gate; Bases and DQL
     stay enable/disable `[ref: PRD/F7 AC]`.
  3. Implement: widen the import engine union; widen the catalog builder's validation; validate a
     `.base` through the existing `validateBasesConfig` `[ref: SDD/CON-6]`.
  4. Validate: unit tests; `npm run catalog:build` succeeds with a mixed-engine catalog; lint; types.
  5. Success:
     - [ ] Catalog and import cover the same engines `[ref: SDD/AC — PRD F7]`

- [ ] **T7.3 Generation wired to settings** `[activity: integration]`

  > **This task now owns the templating half of `baseGenerator`** (reassigned from T1.4,
  > 2026-07-30). T1.4 shipped `renderBase(params)` — no template input — so:
  > **(a)** giving `renderBase` its template input is T7.3's;
  > **(b)** producing a `sourceChecksum` is T7.3's — **nothing in `src/` computes one today**;
  > **(c)** consequently `classify()`'s **`reconsent` branch is inert until (b) lands**: it is
  > covered by unit tests over synthetic checksums, but no runtime path can reach it, so "upstream
  > changed" cannot currently be detected. Do not treat the existing tests as evidence that the
  > branch works end-to-end.
  >
  > **GATE — inherited from T3.3, assigned here 2026-11-02.** Curated entries are copied verbatim, so
  > `generated.params` does not describe the bytes on disk. When real settings-backed values replace
  > the `collectionParams` placeholder in `main.ts`, **reconcile `generated.params` on installed
  > records**. Otherwise every unedited curated file classifies `regenerate` and its curated content
  > is replaced by `renderBase` output. Add a test for it. Hand-edited files are already safe: they
  > classify `ask` (`7cf6440`), and the ask prompt is this phase's to build.
  >
  > **Second, separate defect — the renderer is not yet a replacement for the shipped artifact.**
  > Today `renderBase` emits only `filters` plus a single `{type: CODEX_VIEW_ID, name: "Codex"}`
  > view. The real shipped `infra/Bases/Codex.base` carries a `properties:` block **and five views**,
  > each with a `category:` discriminant (character, location, object, lore, scene); the curated
  > `test/StoryForge/00 Meta/Bases/overview-characters.base` carries **four `displayName` mappings**. Step 3 below tasks
  > this with **replacing** the shipped `Codex.base` — doing that with today's renderer would
  > **silently delete** the five categorised views and the property display names, turning a working
  > five-category Codex into a single unnamed view. The renderer must reproduce them (or the
  > template must carry them) **before** anything overwrites the shipped file.

  1. Prime: `[ref: ADR-0003 §Decision]`; T1.4's `classify` and renderer; **read
     `infra/Bases/Codex.base` and `test/StoryForge/00 Meta/Bases/overview-characters.base` first** and enumerate what the
     replacement must preserve.
  2. Test: changing a tag or an excluded folder **regenerates the artifact and updates its instance
     checksum silently** `[ref: PRD/F3 AC]`; hand-editing the artifact then changing nothing yields
     **ask** `[ref: SDD/AC — Edge Cases]`; hand-editing **and** changing a setting also yields **ask**,
     never an overwrite; switching verification off means we **neither verify nor
     regenerate** `[ref: SDD/AC — Edge Cases]`; the generated `.base` contains a tag filter and a
     `not:` exclusion and **no `file.inFolder` include** `[ref: SDD/Known Technical Issues]`; a
     regenerated `Codex.base` **still carries its `properties:` block and all five categorised
     views** — assert against the shipped file, so a regression that drops them fails the test
     rather than the vault; `reconsent` is reachable from a real changed template, not only from a
     synthetic checksum.
  3. Implement: template input for `renderBase` + `sourceChecksum`; settings-change → regenerate;
     replace the shipped `Codex.base` include filter **without losing its views or properties**.
  4. Validate: unit tests; a live check that the regenerated file opens in Bases; lint; types.
  5. Success:
     - [ ] The vault layout is no longer compulsory `[ref: PRD/Problem Statement 6]`

- [ ] **T7.4 Capability disclosure** `[activity: frontend-ui]`

  1. Prime: `[ref: PRD/F8]`; `[ref: ADR-36]`. This also discharges the G14/#19 obligation to
     document what each add-on adds.
  2. Test: a one-time screen lists each optional plugin marked **core** or **community** and states
     **what is lost without it** `[ref: PRD/F8 AC]`; dismissal is permanent and the screen stays
     reachable from settings `[ref: PRD/F8 AC]`; a **community** plugin being absent produces **no
     prompt anywhere** `[ref: PRD/F8 AC]`; with every optional plugin absent, no screen is empty,
     broken or blocked `[ref: PRD/F8 AC]`.
  3. Implement: `src/library/capabilityReport.ts` + the first-run screen.
  4. Validate: unit tests across availability combinations; lint; types.
  5. Success:
     - [ ] Core is suggestible, community is never nagged `[ref: SDD/AC — PRD F4]`

- [ ] **T7.5 Phase Validation** `[activity: validate]`

  - Run all Phase 7 tests. Manual walk: import a hand-written `.base` as a Collection, enable it for
    the Anvil only, confirm it appears in the Codex and **not** in the Workbench, then remove it and
    confirm nothing dangles. `npm test`, `npm run lint`, `npm run typecheck`,
    `npm run catalog:build` green.
