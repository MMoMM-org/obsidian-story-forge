---
title: "Phase 7: The Library, import and capability disclosure"
status: in_progress
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

  > **Split after the Library addendum sign-off (2026-11-12).** `mockups-library.html` (L1–L9,
  > P1–P19, accepted as recommended) replaces S101 as the binding picture for this task. It is too
  > large for one dispatch, so it runs as four sub-tasks in order; each is reviewed on its own.
  > - **T7.1a Collection store** *(done: 677c8ea, 8afa3ff, 637a42d)* — `src/library/collectionStore.ts`: built-ins and user collections
  >   as one ordered list; checkbox master with kept surface values (P1); engine-based defaults
  >   (P2); built-in tag/excluded-folder config (P10); migration of old views to collections with
  >   Workbench on, Anvil off, and a once-only notice flag (D2, P13); remove drops the record and
  >   its `cardByCollection` entry, never a file (P5, P16); Cards with "used by" and Hero not
  >   disablable (P19); selectors for the Anvil pills, the Workbench sections and the Workbench
  >   tabs. Pure, no DOM.
  > - **T7.1b Settings tabs and the Collections list** *(done: ed38944…b1c34ab; the L3b "File found" line in place of an entry count awaits the user's confirmation)* — L1 (Library | Scope | Behaviour, every
  >   existing setting placed), L2, L3, L8a, L9, P11–P14, P17.
  > - **T7.1c Cards list and preview** *(done)* — L4, L5, L8c, P3.
  > - **T7.1d Surfaces**, run as three steps: **d1 wiring** (one shared `CollectionStore` from
  >   `main.ts`, `migrate()` at load, the importer emitting `kind:"collection"`, Dataview
  >   collection records rendering, resolution reading a built-in's own tag and excluded folders,
  >   one change signal for record and settings changes); **d2 Anvil** (L6a, L6b, L8b, P5, P8, P9,
  >   P15); **d3 Workbench** (L7a, L7b, P6, P7). Scope — the Anvil pills from the store, an imported `.base` embedded with its
  >   Card, Dataview in the Anvil, `+ Collection`, fallback after removal (L6a, L6b, L8b, P5, P8, P9,
  >   P15); the Workbench Codex sections per built-in toggle and a tab per imported collection
  >   (L7a, L7b, P6, P7).
  >   **d1 wiring is done** (see the T7.1d1 decisions). **d2 Anvil is done** (see the T7.1d2 decisions). **Carried over from T7.1a:** a Dataview import still creates `kind:"view"`, so either the
  >   importer emits `kind:"collection"` or `migrate()` must not count new imports; `SidebarView`
  >   and the engines must render a migrated Dataview `kind:"collection"` record; collection
  >   resolution must read a built-in's own excluded folders and tag override; `configureBuiltIn`
  >   (T7.1b input) should strip a leading `#`.

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

---

## Decisions taken during implementation

- **T7.1 gate — the kind branch lives in `BasesFenceEngine`, not in `SidebarView`'s dispatch**
  (2026-11-11, `6315f03`). Where an engine's YAML comes from is the engine's question. Dispatch
  still selects by `engine`, and adding a `kind` branch there would mean two places know the
  ADR-35 source shape. A `kind:"collection"` record's file is read with `vault.getFileByPath` +
  `cachedRead` on every render, so a hand-edit shows without re-importing. A missing file throws
  `Collection file not found: <path>`, which the Workbench shows as its existing engine error. The
  path never reaches the fence. `kind:"view"` records are unchanged. This replaces the T3.3 header
  note that said "do not make render() read vault files".

- **T7.1a — Collection store: choices the mockup and spec do not settle** (2026-11-12).
  - *Persistence.* User collections and Cards stay records in `ViewStore`. A built-in's state
    lives in a new `settings.builtInCollections` (per id: `enabled`, `anvil`, `workbench`, `tag`,
    `excludedFolders`; every member optional, absent = shipped default). Disabled built-in Cards
    are `settings.disabledCards`. The migration count is `settings.libraryMigratedCount`; the
    notice shows while it is above zero and `"library-migrated"` is not in `dismissedHints`
    (P13). All three fail closed in `normalizeSettings`.
  - *Built-in defaults.* Enabled, Anvil on, Workbench on (the Workbench Codex tab would be empty
    otherwise). "Same as Scope" is the absence of an `excludedFolders` override.
  - *P2 at creation.* `defaultSurfaces(engine)` lives in `store/types.ts`; `CatalogService`
    (Bases: Anvil on) and `ViewImporter.toRecord` (Dataview: Workbench on) use it, so a new
    record is born with the engine default rather than both off.
  - *Migration scope.* Only legacy `kind:"view"` records with a Dataview engine move (D2). A
    legacy Bases view has YAML in `source`, not a path, and ADR-29's revision records that none
    exist, so it is left alone. The count accumulates until the notice is dismissed; after
    that it is not touched.
  - *Row label.* `commandName`, else the source file's basename (L3b "defaults to the file's
    basename"); there is no separate name field.
  - *"Used by".* A collection's chosen Card is its `cardByCollection` entry when that names a
    known Card, else Hero. A disabled Card still lists its users (that is what disabling
    affects). Dataview collections are left out (P8).
  - *Added beyond the brief:* `removeCard` (L8c) and `configureBuiltIn`, because T7.1b/c need
    them and they are tested.

- **T7.1b — Settings tabs and the Collections list: choices the mockup does not settle** (2026-11-12).
  - *Panels.* All three tab panels are rendered into the page at once and the inactive ones are
    `hidden`, so a setting exists exactly once in the DOM under its mapped tab and each tab keeps
    its state. Library is the default; arrow keys, Home and End move between tabs (roving
    tabindex). `SettingsTab.openTab(tab, {configure})` is the S98 "Change tag" deep link and
    focuses the tag field; T7.1d only has to call it.
  - *Structure.* `SettingsTab` keeps the tab strip, Scope, Behaviour and the folder setting.
    `LibrarySection` owns the list (open panels, the pending removal, which control to refocus
    after a repaint); `libraryPanels` draws the three configure panels; `settingsPort` is the
    plugin-side `LibraryPort` (records via `ViewStore`, patches merged into `plugin.settings` and
    saved through the plugin, read back through `normalizeSettings`). `SettingsTab` takes an
    optional ninth argument `LibraryDeps` (collection store, note provider, T7.4 hook); omitted,
    it builds its own, so `main.ts` is untouched.
  - *Row text.* **Configure** and **Remove** are capitalised, where the mockup draws lowercase
    `configure` / `remove`: `obsidianmd/ui/sentence-case` rejects the lowercase and the lint gate
    is binding. `+ Browse repo…` and `+ Import from vault…` keep the mockup text with a scoped
    `eslint-disable` (the rule misreads the leading `+`).
  - *Status badge scope (P11).* Platform, engine and DataviewJS-off states are shown for every
    non-built-in row (labels: "Dataview not installed", "DataviewJS disabled", "Not available on
    mobile"). "Consent required" is shown for **DataviewJS only**: consent is that engine's gate
    (PRD F7 AC 8), and an imported `.base` or a DQL entry with no stored consent would otherwise
    read as blocked on every row. The status is the enabled projection of `ConsentGate.evaluate`,
    as before, so a disabled row still shows what would block it. The disabled hint (L9b) wins over
    the blocked hint (L9c); the badge is shown either way.
  - *Ticking the checkbox* of a DataviewJS row that is `not-consented` or `drift` opens the
    existing consent / re-consent modal first; cancel leaves it unticked (L9 transitions). Every
    other row writes `setEnabled` directly.
  - *Live count (P10).* Built-ins: `resolveCollection` over the injected note index (the Anvil's
    `createNoteIndex`, created lazily on the tab's own `registerEvent`). "1 note matches" in the
    singular. Excluded folders are listed after "outside"; an empty list drops the clause.
  - *Imported `.base` line (L3b) has no entry count.* The mockup draws "3 entries · read from the
    file on every render". Counting a `.base`'s entries needs Bases' own evaluator, which the
    plugin does not have, so the line reads "File found · read from the file on every render" and
    "File not found: <path>" in amber when the file is gone. **This is a divergence from the
    mockup**, reported to the reviewer rather than papered over with a number.
  - *From-repo panel.* Shows the template's Tag and Excluded folders (ADR-35 `params`) **read-only**.
    Editing them regenerates the file, which is T7.3's checksum flow (ADR-0003); T7.1b has no
    write for generated params.
  - *Dataview panel.* The "Migrated from the Views list on <date>" sentence is dropped: no
    migration date is stored. Version appears only in the consent line ("Approved v2." / "The
    script changed since you approved v2." / "You have not approved this script yet."), with
    Review consent… opening the first-consent or re-consent modal.
  - *Deep copy.* The S98/CON-7 references in the built-in panel's description are mockup
    annotations, not UI text, and are left out.
  - *Remove.* The confirmation text is built from the row: the surfaces that are effectively on,
    "its Card choice is forgotten" for a Bases row, "its command is removed too" for a row with a
    palette command, "file" or "note" by the source extension. Confirm calls `collections.remove`,
    then `removeCommand`, then a `Notice`. After removal focus moves to the next row's checkbox;
    for the last row it moves to **+ Import from vault…**, because **+ Browse repo…** is disabled
    until T7.2 and cannot take focus.
  - *+ Browse repo….* Still the disabled "coming in a future release" control the old Views
    section had; the catalog browser is T7.2.
  - *P14 capability link.* "What optional plugins add…" renders at the foot of the Library and
    calls `LibraryDeps.openCapabilities`, which is a no-op until T7.4 supplies the screen.
  - *Cards slot.* `div[data-slot="cards"].sf-lb-cards-slot` sits between the collection list and
    the folder setting, empty, for T7.1c.
  - *Old Views tests.* `test/settings/SettingsTab.test.ts` tested the retired card list and the ⋯
    menu (P12). Each behaviour it covered that survives (status mapping, enable consent flow,
    command reconcile, store subscription, re-entrancy, remove) is re-covered in
    `test/settings/libraryTab.test.ts`; the file is removed. The old `.sf-view-*` CSS is removed
    with it.
  - *Mock typing.* `obsidian-augment.d.ts` now lets `createDiv`/`createSpan` take `attr` and
    `title`, as the real `DomElementInfo` does (the runtime mock already supported them).
  - *Carried to T7.1d (unchanged and now sharper).* The list shows `kind:"collection"` records
    only. A Dataview import still creates `kind:"view"`, and nothing calls `migrate()` yet, so on
    this branch an existing or newly imported Dataview view does not appear in Library until
    T7.1d wires `migrate()` and the importer.
  - *L3a "Same as Scope" keeps its checkbox.* The mockup note says unchecking "replaces the
    checkbox line with an editable list". The code keeps the checkbox and adds the list under it.
    **Divergence, recorded after review:** with the checkbox gone there would be no control to
    go back to "same as Scope" short of emptying the list by hand, and an emptied list means
    "exclude nothing", not "follow Scope". The checkbox stays so the way back is one click.
  - *+ Browse repo….* Its accessible name is its visible text. "Coming in a future release" is
    the `title` and an `aria-describedby` description, not a replacement `aria-label`.

- **T7.1c — Cards list and preview: choices the mockup does not settle** (2026-11-12).
  - *Structure.* `CardsSection` (list, confirmation, focus), `cardPreview` (the preview region) and
    `libraryShared` (the `data-focus` capture and restore, the provenance labels and the add row,
    now used by both lists). `LibrarySection` was changed only to use `libraryShared`.
    `SettingsTab` paints a "Cards" heading and the list into `div[data-slot="cards"]`, and its
    store subscription, tab selection and `hide()` drive the Cards list as they do the collections.
  - *Words.* **Preview** and **Remove** are capitalised, as T7.1b did for Configure and Remove:
    the sentence-case lint rule rejects the lowercase. The Hero checkbox's reason is also its
    `title`.
  - *The preview is the real Card.* It calls `buildCardWrapper` with `nativeCardEntry` on the sample
    note's `metadataCache` frontmatter and `CODEX_CARD_REGISTRY.resolve(id)`, the path
    `codexTab.renderEntry` uses. `LibraryDeps` gained an optional `fileClasses` (passed from
    `main.ts`) so the tile follows the FileClass Media field as the Anvil does; without it the
    tile uses the shipped names.
  - *Inert.* After building, the card loses its `role`, `tabindex` and `data-sf-card-body`, every
    `data-sf-link` and `data-sf-card-title` marker, and gets `inert`. A title click does nothing
    in Settings (no controller listens there); stripping the markers keeps it that way if one ever does.
  - *Sample from lists enabled, non-Dataview collections.* The mockup says "every enabled
    collection". A Dataview collection ignores Cards (P8) and has no tag to resolve, so offering
    it could only ever say "no entries". A disabled collection is not offered. When the only enabled
    collections are Dataview ones, the preview says "Only Dataview collections are enabled, and
    they don't use Cards." instead of "Enable a collection to preview this Card.", which would be
    untrue.
  - *An imported `.base` collection has no tag.* Samples resolve by tag and folder exclusion
    (`resolveCollection`, as the T7.1b count does). A collection with no tag therefore reads as
    "has no entries yet" in L5b, although the Anvil would draw it through Bases. Sampling a
    `.base` needs the Bases query and is not attempted.
  - *Imported Cards draw as Hero.* No imported Card is registered in `CODEX_CARD_REGISTRY` yet, so
    previewing one resolves to Hero, which is what the Anvil does with it today. Whoever registers
    imported Cards gets the right preview with no change here.
  - *Chosen sample.* It is kept per Card across repaints and falls back to the default (first
    enabled collection using the Card, else the first enabled) when the choice is no longer
    offered. Removing a Card forgets its preview and sample.
  - *Focus.* Opening a preview focuses Close preview; closing by button, Preview again or Esc
    returns to Preview; changing the sample keeps focus on the dropdown. After a removal focus
    goes to the next row's checkbox, or to **+ Import from vault…** for the last row.
  - *No held repaint.* The Cards list has no text input, so the "hold a repaint while an input is
    dirty" half of the LibrarySection pattern does not apply and was not copied.
  - *Add row.* L4 draws **+ Browse repo…** and **+ Import from vault…** under Cards as well; both
    are drawn (Browse disabled, as in the collections list) via the shared `paintAddRow`.
  - *Known gap (closed in T7.1d1).* A change to a built-in collection (enable, tag, folders) writes settings, not a
    record, so it does not notify the store: "used by" and "Sample from" catch up on the next
    repaint (any Cards action, a record change, or reselecting the Library tab).
  - *Tests.* The sentence-case checker moved to `test/helpers/sentenceCase.ts` (its mid-sentence
    allow-list gained "Hero"; its skip list gained `.sf-lb-prev-body`, user data). The T7.1b
    "marked place for the Cards list" test no longer asserts the slot is empty, and its
    row-name selector is scoped to `[data-collection-id]`.

- **T7.1d1 — Library wiring: choices the mockup and spec do not settle** (2026-11-12).
  - *Where it lives.* `src/library/wireLibrary.ts` (mirrors `wireUndoJournal`). `main.ts` calls
    it right after `loadSettings()` and keeps the result as `plugin.library`
    (`collections`, `snapshot()`, `builtIns()`, `onChange()`). `migrate()` runs inside it, once per
    load, before any view factory can run. A failed migrate is a `console.warn`, not a failed load.
  - *One store.* `SettingsTab` receives `plugin.library.collections` (`LibraryDeps.collections`);
    `openCapabilities` is passed as an explicit no-op for T7.4. `SidebarView` is **not** given the
    store yet (d3 adds the parameter); the Anvil gets `codex.getCollections`.
  - *Synchronous snapshot.* The Codex hosts read their list while rendering, and the store is
    async, so `wireLibrary` keeps the last `collections()` result. It is rebuilt after every
    `CollectionStore` signal and every `ViewStore` record signal (an import writes a record without
    going through the store); only the newest read may land. `onChange` fires after the rebuild.
    A repaint-on-change in the Anvil is **not** wired; d2 calls `library.onChange`.
  - *The Anvil still shows the built-ins only.* `getCollections` returns `builtIns()`, the
    built-in rows with their tag and own excluded folders applied. Their `enabled` flag is the
    checkbox, as before; `effective.anvil` belongs to d2.
  - *Per-collection excluded folders.* `CodexCollection` gained an optional `excludedFolders`;
    `renderCodexTab` resolves with it when present and with the host's Scope list when absent. An
    empty own list means "exclude nothing", not "follow Scope". `LibraryCollection` already
    carries Scope's list for "same as Scope", so a store row is correct as it stands. The tag
    override needed no change (`CodexCollection.tag`). `resolveCollection` is untouched.
  - *Importer.* `ViewImporter.toRecord` emits `kind:"collection"`. `migrate()` therefore never counts
    a new import (test: import, then `migrate()` returns 0 and no notice).
  - *Dataview collections render with no dispatch change.* Dispatch selects by `engine`, the
    consent gate branches on `record.generated` and the record's engine only, and only
    `BasesFenceEngine` reads `kind`. So SidebarView, `EngineRegistry`, palette commands
    (`_registerViewCommand` / `_restoreViewCommands` are kind-agnostic) and consent needed no
    change; the new SidebarView tests pin it (DQL, DataviewJS with consent, without consent,
    drift) and that the Bases fence is not touched.
  - *Workbench tab gating is deferred to d3.* `_renderTabs` still lists every record in the store,
    whatever its kind or surface, exactly as before, so a migrated view keeps its tab (D2). That
    includes `kind:"card"` records and a Bases collection with Workbench off, which d3 must filter
    with `workbenchTabs()` / `effective.workbench`.
  - *The change signal.* `CollectionStore.subscribe` fires once after a write that changed
    something: refused writes, a `migrate()` that moved nothing and a dismiss that was already
    recorded do not fire. A throwing listener is logged and does not stop the others. The store also
    exposes `writing` (true from the request until the write has run). `SettingsTab` subscribes to
    both signals and drops the `ViewStore` one while `writing`: a store write moves a record, so
    that signal would repaint a second time; the store's own signal follows and reads the finished
    state. An import (a record written outside the store) still repaints. Both subscriptions end
    in `hide()`. This closes the T7.1c "known gap".
  - *Not tested, equivalent.* Removing the `collections.subscribe` unsubscribe in the unload hook
    while keeping the listener clear is not observable; `migrate()` being called again on every
    snapshot is idempotent by design.
  - *Scope edits are a store write (review fix).* A built-in with no list of its own carries
    Scope's list in its row, so a Scope edit has to reach the snapshot, the open lists and the
    Anvil. The Scope field in Settings now calls `CollectionStore.setScope(folders)` instead of
    writing `plugin.settings` directly: it is serialised, saved through the port, and signals like
    every other write. The snapshot is rebuilt and `library.onChange` fires, so d2 repaints on it
    with no extra hook; the Settings live count and Cards "Sample from" repaint from the same
    signal. Chosen over reading Scope at call time in the snapshot because the lists in Settings
    read the store, not the snapshot, and would have stayed stale. A built-in with its own list is
    unaffected.
  - *Review fixes (code review).* (1) `SettingsTab` drops the record signal while a store write
    runs; it now tells the store (`noteDroppedSignal`), and the store signals once on completion
    when one was dropped, even if the write was refused, threw or changed nothing. (2) A throwing
    `library.onChange` listener is logged and does not stop the next. (3) The snapshot keeps the
    newest read that succeeded: a failed read never discards an older success, and a slow older
    read cannot overwrite a newer one. (4) `snapshot()` is documented as consumed by d2/d3.
    (5) The unload test now proves the store and record subscriptions are both released.

- **T7.1d2 — Anvil surfaces: choices the mockup and spec do not settle** (2026-11-12).
  - *Where it lives.* `src/anvil/anvilCodexOpts.ts` builds the Anvil's whole `codex` seam from the
    Library; `main.ts` only passes it what it owns, and the tests build the Anvil from the same
    function. `src/anvil/collectionEmbed.ts` draws a collection a query engine owns;
    `src/library/collectionBase.ts` is the P9 reduction; `src/library/openLibrary.ts` is the one
    place that reaches Obsidian's untyped `app.setting` (the cast moved out of `main.ts`, not new).
  - *Pills.* `getCollections` is `anvilPills(library.snapshot())`. The `LibraryCollection` row
    is the `CodexCollection`: `CodexCollection` gained optional `engine` and `provenance`, so a
    pill is drawn dashed when it is not built-in (S93's `.usr`) and the tab knows which collections
    a query engine draws. `AnvilView` gained `codex.subscribe` (repaint on `library.onChange`,
    released on close and on unload), `getAddable`, `onAddToAnvil`, `onManage` and `embed`.
  - *P9: where the reduction lives.* In `BasesFenceEngine`, selected by a new optional fourth
    argument of `QueryEngine.render` (`EngineRenderOptions.cardViewType`), because the engine already
    owns "where the YAML comes from". Kept: `filters`, `formulas`, `properties`; the first view's
    `name`, `filters`, `sort`, `order`, `groupBy` and `limit`; its `type` becomes the Card's
    Bases view type. A file that is not YAML, or not a mapping, throws a message the Anvil shows.
    The Workbench passes no option, so its embed is unchanged until d3.
  - *DEVIATION from "drawn with its Card" (imported Cards).* Only `hero`, `table` and `compact`
    have a registered Bases view type (`story-forge-hero|table|compact`, T4.5's `registerCardViews`).
    An imported Card (`kind:"card"`) has none, so in a `.base` embed it is drawn as Hero while the
    dropdown shows its name. Reason: Bases draws an embedded file's views by registered view type,
    and a type can only be registered at load. What would close it: T4.5 registering one view type
    per imported Card (id derived from the Card id, re-registered when Cards change), or the embed
    drawing the Bases rows through the native Card registry instead of through Bases. Needs the
    user's decision; not built in d2.
  - *The consent gate judges contents (the known defect).* For `engine:"bases"` and
    `kind:"collection"` the gate reads the file with `vault.cachedRead`, the same read the engine renders
    from, and checksums that. A missing file is `consented`, so the engine reports "Collection file not
    found: <path>" (nothing exists to run, and `okayed:null` still returns `not-consented` first). A
    `generated` record still takes its own branch. `kind:"view"` is unchanged.
  - *Engine instances of the Anvil's own.* The registry's engines are singletons holding one
    `Component`; a Workbench `teardown()` would unload what the Anvil drew. `createEngine` builds a
    fresh engine per draw (`buildEngineRegistry(...).get(kind)`); the shared registry still serves the
    gate's "is the engine wired" check.
  - *States the mockup does not draw.* The embed reuses the Workbench's own classes and wording for
    S11/S12/S16/S17 (not consented, drift, Dataview missing, DataviewJS off, mobile, disabled) in
    place of the grid, and "Open a note to draw this collection." when the Anvil follows no note (the
    engines scope to a note; `NoteContext` needs a `TFile`). The engine error shows the message itself
    ("Collection file not found: <path>") in the hint line; the Workbench's generic text is unchanged.
    **Bases off** draws S98's box (`renderBasesOffState`: "<label> needs Bases" and one line) above
    which the existing ADR-36 hint shows; it has no `Change tag` button, because a `.base` collection has
    no tag. The mockup says only "S98's degrade path"; this copy is new and needs the user's eye.
  - *Selection of the open card.* `CardBasesView` cannot know the editor pane's path (view types
    are registered once), so the embed marks `.sf-cx-card--sel` itself and re-marks it from a
    `MutationObserver` whenever Bases redraws. Click, pane and S91 missing-property marking are the
    built-in ones: the cards are `buildCardWrapper` markup and bubble to the Anvil's own handler.
  - *`+ Collection` (P15).* A `span` pill with `data-sf-cx-add`, classified `structuralControl`;
    the click opens an Obsidian `Menu` and writes nothing. Items: `addableCollections(snapshot)`
    (enabled, Anvil switch off, Library order), a separator, then "Manage in settings…". A pick calls
    `setSurface(id, "anvil", true)` (a refusal shows a Notice), selects the id at once and re-renders;
    the pill itself arrives with the store's signal. The pill is drawn only when the host asks
    (`showAdd`): the Anvil does, the Workbench's pills (d3) do not.
  - *Fallback (L8b, P5).* No new rule: `CodexSelectionStore.resolve` already falls to the first enabled
    pill, and the tests drive it with real store writes (remove, disable, Anvil switch off). A Library
    write that moves the shown collection also closes an open editor pane, as switching a pill does.
    `cardByCollection` of a removed collection was already dropped by the store (test pins it).
  - *Deep links.* `SettingsTab.openTab("library", {})` for "Manage in settings…" and
    `openTab("library", {configure: id})` for S98's "Change tag", checked on the real tab in the
    end-to-end test.
  - *Not asserted in d2.* The Workbench half of T7.5 ("not in the Workbench") needs d3: `_renderTabs`
    still lists every record, so the end-to-end test asserts the Anvil half and the removal only.
  - *One click, one navigation (review fix).* With `linkClickAction:"open"` a name click in an
    embedded card reached both the Anvil's handler and `CardBasesView`'s own `onEntryClick`
    (`revealAndShowFile`). The embed now carries `data-sf-nav-host` (`NAVIGATION_HOST_ATTR`, in
    `cardWrapper.ts`) and `CardBasesView._onCardClick` skips `onEntryClick` when its container sits
    inside one. A standalone `.base` and the Workbench have no such ancestor: unchanged.
  - *Tests.* `test/anvil/anvilLibrary.test.ts` (21) and `anvilLibrary.endToEnd.test.ts` (3), plus the single-navigation test and two `CardBasesView` navigation tests; the
    marker vocabulary pin gained `data-sf-cx-add`.

