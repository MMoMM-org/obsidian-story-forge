# Traceability: spec 008 (Codex surface)

T8.5 step 2. Every EARS criterion in `solution.md` § Acceptance Criteria and every Gherkin AC in
`requirements.md` F1–F8 is mapped to the task that owns it and to the test that proves it.
Tests are cited as `file > test name` (test files under `test/`). Compiled 2026-11-17 against
`codex-surface` at `75e0a8a`. The full suite (202 files, 4032 tests) passed on that tree in the
T8.5 gate run, so every test cited here passes.

**Status values**

| Status | Meaning |
|---|---|
| covered | A passing automated test asserts the criterion |
| deviated-recorded | The criterion was changed by a recorded decision; the row names the decision and what the tests now assert |
| manual-only | No automated equivalent is possible (CSS layout, Obsidian's own link rewriting, the core Properties UI). Listed in `docs/live-testing.md` § Spec 008 |
| GAP | No test and no recorded decision |

**Totals:** EARS criteria (40): covered 37, deviated-recorded 3, manual-only 0, GAP 0.
PRD ACs (74): covered 73, deviated-recorded 1, manual-only 0, GAP 0. Success metric "Truth
preservation": manual-only (automated half covered). Several covered rows also have a part only a
live vault can show (CSS placement, Obsidian's link rewriting); the row says so and
`docs/live-testing.md` § Spec 008 lists it.

## SDD EARS criteria

| # | Criterion (abridged) | Task | Test | Status |
|---|---|---|---|---|
| E1 | `Open Anvil` opens one view with Codex, Timeline, Plotgrid, Plotlines, Board | T2.2, T2.3 | `anvil/anvilTabs.test.ts > lists the five tabs in mockup S91 order: Codex, Timeline, Plotgrid, Plotlines, Board`; `main.anvil.test.ts > opens a new leaf with the Codex tab selected when no Anvil is open` | covered |
| E2 | A legacy command opens the Anvil with its tab | T2.3 | `main.anvil.test.ts > %s still exists and opens the Anvil with the %s tab selected` (4 cases) | covered |
| E3 | `WORKSPACE_VIEW_TYPE` and `SIDEBAR_VIEW_TYPE` unchanged | T2.1, T8.4 | `anvil/AnvilView.test.ts > CON-4 guard: the view type id is still the literal string from before the move`; `views/SidebarView.registration.test.ts > SIDEBAR_VIEW_TYPE is 'story-forge-panel'`; `main.layoutRestore.test.ts > the main-area leaf saved as 'story-forge-workspace' restores as the Anvil with its management tabs` | covered |
| E4 | A management tab keeps its M5/M6 behaviour | T2.2, T8.4 | `anvil/AnvilView.m6.test.ts` (layout routing, toolbar, zoom); `integration/anvilKanbanDrag.test.ts > dragging an 'outline' card onto the 'draft' column writes both keys in a single call`; `anvil/AnvilView.plotgridMatrix.test.ts > each scene × plotline cell is filled exactly when the scene is on that plotline` | covered |
| E5 | Click behaviour comes from the target kind alone | T2.4, T2.5 | `navigation/navigationController.test.ts > resolveNavigationOutcome — the matrix`; `navigation/markerVocabulary.test.ts > maps every known marker attribute to its correct TargetKind` | covered |
| E6 | Inspect in the Anvil stays in the Anvil, no other leaf touched | T2.5, T5.1 | `anvil/AnvilView.navigationController.test.ts > a click in the Anvil no longer hijacks the Workbench [PRD/F2]`; `editor/editorPane.test.ts > opens no other leaf and reveals nothing when inspecting (PRD/F2)`; `main.editorPane.test.ts > inspects within the Anvil on a plain click, opening no other leaf` | covered |
| E7 | Opening a note changes no panel's tab | T2.5 | `anvil/AnvilView.navigationController.test.ts > modifier-click opens the note and leaves the Anvil's own layout tab unchanged`; `views/SidebarView.navigationController.test.ts > modifier-click (open) from the Navigator tab does NOT switch to the Context tab — unlike drill` | covered |
| E8 | An unknown target takes no action | T2.4 | `navigation/navigationController.test.ts > never resolves an unknown target to an action, across every modifier/setting combination`; `anvil/AnvilView.navigationController.test.ts > clicking the brand label (no marker attributes) does nothing`; `views/SidebarView.navigationController.test.ts > clicking an unmarked element in the body does not mutate the subject or open anything` | covered |
| E9 | A collection includes by tag and excludes the excluded folders | T1.1, T4.1 | `codex/collectionResolver.test.ts > returns notes carrying the collection's configured tag`; `> excludes a tag-matching note that lives under an excluded folder`; `codex/codexTab.test.ts > leaves notes under an excluded folder out of the grid [PRD/F3 AC]` | covered |
| E10 | A tag or folder change shows with no consent request | T3.4, T7.1 | `main.test.ts > the Anvil reads built-ins with the Library's own tag and folders, live`; `codex/codexTab.test.ts > resolves by the tag override, not the shipped tag`; `catalog/curatedBase.test.ts > tripwire: a Library or Scope change after the install touches no vault file` | covered |
| E11 | An empty tag is misconfigured, never the whole vault | T1.1, T4.6 | `codex/collectionResolver.test.ts > reports misconfigured for an empty tag, never listing the whole vault`; `codex/codexTab.test.ts > reports a cleared tag as misconfigured instead of listing the whole vault [PRD/F3 AC]` | covered |
| E12 | Where Bases is available, Cards render through registered Bases view types | T4.5, T7.1d2 | `bases/BasesAdapter.test.ts > calls registerBasesView once per view type (four: codex + hero/table/compact) on the first call`; `anvil/anvilLibrary.test.ts > embeds the user's file through Bases with the chosen Card, applying only the global parts and the first view`. The Anvil draws the four built-ins natively on every platform (T7.1, T8.2 decision "CON-9 is held by the ConsentGate"); Bases draws a `.base` collection and a user's own `.base` | covered |
| E13 | Where Bases is unavailable, the same Cards render natively | T4.5, T8.2 | `bases/BasesAdapter.test.ts > skips ALL FOUR registrations when registerBasesView is absent (native backend renders)`; `integration/degradationMatrix.test.ts > draws the built-ins natively, and hands the .base to Bases only where Bases can draw it` (24 cells) | covered |
| E14 | A Card choice persists per collection and writes no frontmatter | T4.4 | `codex/codexTab.test.ts > picking a Card re-renders the same entries and writes no frontmatter [PRD/F4 AC]`; `> remembers the Card choice per collection — Characters Hero while Objects is Table [PRD/F4 AC]`; `main.cardSelect.test.ts > picking a Card calls plugin.saveSettings and updates plugin.settings.cardByCollection` | covered |
| E15 | Bases present but disabled: at most one dismissible hint | T4.6, T8.2 | `codex/codexTab.test.ts > shows the hint when Bases is present but disabled`; `integration/degradationMatrix.test.ts > shows exactly one dismissible Bases hint`; `main.dismissHint.test.ts > PERMANENCE: a dismissal survives a fresh plugin instance reloading the same persisted data.json` | covered |
| E16 | A missing community plugin is never prompted for | T4.6, T7.4, T8.2 | `integration/degradationMatrix.test.ts > never prompts for a community plugin, in the Anvil, the Workbench, the Library or a Notice`; `library/CapabilitiesModal.test.ts > a Dataview collection without Dataview says why and prompts nothing` | covered |
| E17 | Inspect opens the editor in the configured dock with the full field set | T5.1, T5.3 | `editor/editorPane.test.ts > opens on a plain click on the card BODY, not only on the name`; `editor/editorSections.test.ts > shows the full field set in the bottom dock` / `in the right dock` / `in fullscreen` | covered |
| E18 | A commit writes exactly one plain Property through `frontmatterWriter` | T5.4 | `editor/fieldCommit.test.ts > calls the writer once and sets only the edited key`; `> writes plain YAML values, never an object or a class instance`; `> %s calls no vault write API of its own` | covered |
| E19 | The dock never changes on a resize | T5.1 | `editor/editorPane.test.ts > never changes the dock on a window resize (ADR-33)` | covered |
| E20 | An external change updates the editor | T5.4 | `editor/fieldCommit.test.ts > updates a clean control when the note changes outside the plugin` | covered |
| E21 | Fields, order, types, enums and sections come from the FileClass chain | T1.2, T1.3, T5.3, T8.1 | `fileclass/fileClassReader.test.ts > produces a base-first chain when a class extends another`; `> reads selectable values from options.valuesList for a Select field`; `integration/demonstrated-extension.test.ts > become a Codex collection whose entries open a typed, sectioned editor that writes plain Properties` | covered |
| E22 | One section per FileClass, base first | T1.3, T5.3 | `editor/fieldModel.test.ts > renders one section per FileClass in the chain, base first`; `editor/editorSections.test.ts > renders one section per FileClass in chain order, base first` | covered |
| E23 | Half width for short types, full for Multi/MultiFile, unless a `ui` hint | T1.3, T6.1b | `editor/fieldModel.test.ts > resolves every half-width type`; `> resolves every list-valued or media type to full width`; `schema/uiHints.test.ts > renders the tagline label full width through a real AnvilView` | covered |
| E24 | No FileClass: the note's own keys, typed by value | T1.3, T6.4 | `editor/fieldModel.test.ts > types the note's own frontmatter keys by inspecting their values`; `integration/fileclass-tiers.test.ts > the Anvil editor shows the note's own keys, typed by value` | covered |
| E25 | An undeclared key goes under "Other properties" | T1.3, T6.4 | `editor/fieldModel.test.ts > appears last, in a distinct Other properties section`; `integration/fileclass-tiers.test.ts > appears under Other properties in the Anvil` | covered |
| E26 | The plugin writes no FileClass file | T1.2, T6.4 | `integration/fileclass-tiers.test.ts > across an edit session on both surfaces, every write lands on the note`; `schema/schemaGenHandwritten.test.ts > leaves its bytes and mtime alone` | covered |
| E27 | An imported `.base` becomes a Collection | T7.2 | `import/importEngineCoverage.test.ts > lists the .base in the picker and, on Import, stores it as an imported Bases collection for the Anvil` | covered |
| E28 | A curated Dataview view installs | T7.2 | `catalog/catalogDataview.test.ts > writes the note into the repo folder and stores a from-repo Dataview collection for the Workbench` | covered |
| E29 | Built-ins can be disabled, never removed | T7.1 | `settings/libraryTab.test.ts > a built-in offers configure and no remove; from-repo and imported offer both`; `settings/libraryCards.test.ts > gives a built-in Card no Remove, and an imported one a Remove`. Hero cannot be disabled either (P19, README 2026-11-12) | covered |
| E30 | Imported and from-repo entries can be disabled and removed | T7.1 | `settings/libraryTab.test.ts > a built-in offers configure and no remove; from-repo and imported offer both`; `> Remove calls the store, the command is removed, a notice repeats that the file stays, and focus moves on` | covered |
| E31 | Surface toggles show an entry in exactly those surfaces | T7.1d2, T7.1d3 | `anvil/anvilLibrary.endToEnd.test.ts > appears in the Anvil's Codex, draws through Bases, and leaves nothing behind once removed`; `> is a Workbench tab beside Codex and Navigator, and leaves with its collection`; `anvil/anvilLibrary.test.ts > equal anvilPills of the Library in Library order; a disabled or Anvil-off collection has none` | covered |
| E32 | A failed commit restores and surfaces the reason | T5.4 | `editor/fieldCommit.test.ts > restores on a VALIDATION failure, without ever reaching the vault`; `> restores on a WRITE failure, after the vault rejected the write` | covered |
| E33 | A malformed FileClass is skipped, the rest renders | T1.2 | `fileclass/fileClassReader.test.ts > skips a malformed class but still parses the rest of the chain via its extends` | covered |
| E34 | A chain cycle truncates at the first repeat | T1.2 | `fileclass/fileClassReader.test.ts > truncates a cycle at the first repeat` | covered |
| E35 | An unresolvable import is refused and persists nothing | T7.2 | `import/importEngineCoverage.test.ts > refuses a .base with %s, shows the reason in the picker, and writes nothing`; `> refuses a Dataview note with two query blocks, saying so in collection terms` | covered |
| E36 | A generated artifact whose file differs from its checksum: ask before overwriting | T1.4, T3.4, T7.3 | `library/baseGenerator.test.ts > row 3 — user hand-edits the file: source/params same, file differs → ask`; `consent/ConsentGate.test.ts > keeps a hand-edited file as-is: consented [ask maps to consented]`; `catalog/curatedBase.test.ts > refuses to update a file the user edited, and changes nothing`. No runtime regeneration exists to ask about: README 2026-11-13 "T7.3 reduced" deferred ADR-0003 regeneration; the only overwrite path (catalog Update) refuses an edited file | deviated-recorded |
| E37 | Params changed, file not hand-edited: regenerate without prompting | T1.4, T3.4, T7.3 | `library/baseGenerator.test.ts > row 2 — user changes a setting: source same, params differ, file untouched → regenerate (silent)`; `consent/ConsentGate.test.ts > regenerates silently when only params changed: consented, no drift, no modal constructed [SDD Edge Case]`. Pure model and legacy records only; no settings-driven `.base` is written (README 2026-11-13 "T7.3 reduced"); `catalog/curatedBase.test.ts > tripwire: a Library or Scope change after the install touches no vault file` pins that | deviated-recorded |
| E38 | Verification off: neither verify nor regenerate | T1.4, T3.4, T7.3 | `library/baseGenerator.test.ts > row 5 — verification switched off: clean regardless of source/params/file`; `consent/ConsentGate.test.ts > returns {status:'consented'} when verify:false, even when source/params/file all differ [the file is the user's now]`. The switch has no UI (the "this file is yours now" Could-have; T7.3 reduced) | deviated-recorded |
| E39 | A field declared twice renders once, in the earliest section | T1.3 | `editor/fieldModel.test.ts > renders a field declared twice once, in the earliest section` | covered |
| E40 | A `Select` value outside the list is preserved and displayed | T1.3, T5.2 | `editor/fieldControls.test.ts > displays the current value, marked, and keeps it selected`; `> never offers it: selectable is the declared list exactly, and it cannot be re-selected` (README 2026-08-05 Select reconciliation) | covered |

## PRD acceptance criteria

### F1 — Anvil

| # | AC (abridged) | Task | Test | Status |
|---|---|---|---|---|
| F1.1 | `Open Anvil` opens a view with the five-tab strip | T2.2, T2.3 | `anvil/anvilTabs.test.ts > renders one pill per registry tab, in registry order, with the S91 labels` | covered |
| F1.2 | Selecting a tab swaps the body; the strip stays | T2.2 | `anvil/anvilTabs.test.ts > selecting a tab swaps the body and keeps the strip visible` | covered |
| F1.3 | Management tabs identical to before: layout, controls, zoom, drag | T2.2, T8.4 | `anvil/AnvilView.m6.test.ts`; `integration/anvilKanbanDrag.test.ts > dragging an 'outline' card onto the 'draft' column writes both keys in a single call`; `anvil/AnvilView.plotgridMatrix.test.ts`; the M5/M6 suite (T8.4 note). Visual parity: live walk 008-A | covered |
| F1.4 | Timeline controls on the Timeline tab only | T2.2 | `anvil/anvilTabs.test.ts > Timeline-only controls are hidden on every other tab, including Codex (S94)` | covered |
| F1.5 | Legacy `Open Timeline/Plotlines/Kanban/Plotgrid` resolve to the Anvil tab | T2.3 | `main.anvil.test.ts > %s still exists and opens the Anvil with the %s tab selected`; `> all four legacy command ids are registered after onload (hotkeys survive)` | covered |
| F1.6 | `Open Workbench`, labelled Workbench in palette, ribbon, settings | T2.6 | `main.test.ts > addCommand registers 'open-panel' command named 'Open Workbench'`; `> addRibbonIcon is called with the ICON and 'Story Forge: open Workbench'`; `views/SidebarView.registration.test.ts > getDisplayText() returns 'Workbench'`; `settings/libraryTab.test.ts > labels the checkbox and the switches with the row name (P4)` | covered |
| F1.7 | `Open Anvil` twice reveals the existing view | T2.3 | `main.anvil.test.ts > reveals the existing leaf instead of creating a second when 'Open Anvil' runs twice` | covered |

### F2 — Navigation semantics

| # | AC (abridged) | Task | Test | Status |
|---|---|---|---|---|
| F2.1 | Behaviour follows the target kind, not the surface | T2.4, T2.5 | `navigation/markerVocabulary.test.ts > the same DOM tree yields different markers for the Anvil vs the Sidebar whitelist`; `navigation/navigationController.test.ts > resolveNavigationOutcome — the matrix` | covered |
| F2.2 | The target-kind matrix (incl. Card title and pane name, added 2026-11-02) | T2.4, T4.1, T5.2 | `navigation/navigationController.test.ts > resolveNavigationOutcome — the matrix`; `navigation/cardTitle.test.ts > the controller reads the setting per click and inspects when it is off`; `anvil/AnvilView.cardTitle.test.ts > modifier inverts both ways`; `editor/paneTitleLink.test.ts > %s dock: a plain click opens a new tab, not the pane again`; `codex/codexTab.test.ts > a pill is a structural control — it operates, it never navigates [PRD/F2 matrix]`; `editor/fieldControls.test.ts > resolves a click on a rendered control to focusField` | covered |
| F2.3 | Inspect in the Anvil shows the entry in the Anvil; no other leaf | T2.5, T5.1 | `editor/editorPane.test.ts > opens no other leaf and reveals nothing when inspecting (PRD/F2)`; `main.editorPane.test.ts > inspects within the Anvil on a plain click, opening no other leaf` | covered |
| F2.4 | Inspect in the Workbench suspends follow until Back or open-note | T2.5 | `views/SidebarView.navigationController.test.ts > after inspecting (drilling), the active-leaf-change follow pipeline no longer re-subjects`; `> Back resumes follow…`; `> open-note resumes follow…` | covered |
| F2.5 | Open note: no panel silently changes tab | T2.5 | `views/SidebarView.navigationController.test.ts > open-note footer click leaves selectedViewId untouched`; `anvil/AnvilView.navigationController.test.ts > modifier-click opens the note and leaves the Anvil's own layout tab unchanged` | covered |
| F2.6 | The name wins over the card body | T2.4, T4.1 | `codex/codexTab.test.ts > the name wins over the surrounding card body BY PROXIMITY, not by a ranking`; `bases/CardBasesView.navigation.test.ts > a plain click on the nested name element opens under the same setting — name wins by DOM proximity` | covered |
| F2.7 | An unknown target: nothing happens | T2.4 | `navigation/navigationController.test.ts > resolves an unknown target to no action and never invokes inspect — no navigation, no write` | covered |
| F2.8 | A changed setting applies on every surface without reload | T2.4, T3.5 | `navigation/navigationController.test.ts > reads the configured action live — a setting change takes effect without reconstruction [PRD/F2 AC]`; `anvil/AnvilView.cardTitle.test.ts > reads the setting per click: a flip needs no reload` | covered |

### F3 — Codex collections

| # | AC (abridged) | Task | Test | Status |
|---|---|---|---|---|
| F3.1 | Pill row; the first enabled collection selected | T4.1 | `codex/codexTab.test.ts > selects the first enabled collection on open [PRD/F3 AC]` | covered |
| F3.2 | A collection lists the notes carrying its tag | T1.1 | `codex/collectionResolver.test.ts > returns notes carrying the collection's configured tag` | covered |
| F3.3 | Notes in excluded folders are absent | T1.1, T3.5 | `codex/codexTab.test.ts > leaves notes under an excluded folder out of the grid [PRD/F3 AC]`; `anvil/AnvilView.excludedFolders.test.ts > Timeline: a custom getExcludedFolders excludes the scene under that folder` | covered |
| F3.4 | A changed tag shows with no consent prompt | T3.4, T7.1 | `main.test.ts > the Anvil reads built-ins with the Library's own tag and folders, live`; `codex/codexTab.test.ts > resolves by the tag override, not the shipped tag` | covered |
| F3.5 | Four built-ins available and enabled by default | T7.1a | `library/collectionStore.test.ts > is the four built-ins, then user collections in record order (cards and legacy views excluded)`; `> ships the built-ins enabled and shown on both surfaces` | covered |
| F3.6 | Empty state names the tag; offers Change tag and What are FileClasses? | T4.6, T7.1d2 | `codex/codexTab.test.ts > names the heading after the collection and the tag it looked for`; `> offers a primary Change tag action…`; `> offers a secondary What are FileClasses? documentation link`; `anvil/anvilLibrary.endToEnd.test.ts > S98's 'Change tag' opens the Library tab on that collection's configure panel` | covered |
| F3.7 | Switching collection closes or follows the editor pane | T5.1 | `editor/editorPane.test.ts > never shows a note from the previous collection after a collection switch` | covered |
| F3.8 | A built-in's tag and excluded folders are editable, pre-filled | T3.5, T7.1b | `settings/libraryTab.test.ts > shows the tag, 'Same as Scope' and a live count that excludes the Scope folders`; `> unchecking 'Same as Scope' reveals a list prefilled with Scope's, saved on change, and the count follows`; `library/collectionStore.test.ts > defaults to the shipped tag and 'same as Scope' excluded folders`. L3a keeps a "Same as Scope" checkbox (approved deviation, README 2026-11-17) | covered |
| F3.9 | A change shows in the Codex with no hand-edited file | T7.1d1 | `codex/codexTab.test.ts > excludes its own folders, and not the ones Scope excludes`; `settings/libraryTab.test.ts > strips a leading # from the typed tag, saves it, and refreshes the count` | covered |
| F3.10 | A cleared tag reports misconfigured, never the vault | T1.1, T4.6 | `codex/collectionResolver.test.ts > reports misconfigured for an empty tag, never listing the whole vault`; `codex/codexTab.test.ts > a MISCONFIGURED (empty-tag) collection says so, with no Change tag / FileClasses actions to offer`. Note: the Library field restores the shipped tag when cleared (`library/collectionStore.test.ts > an empty tag falls back to the default; a non-built-in id is refused`) | covered |

### F4 — Cards

| # | AC (abridged) | Task | Test | Status |
|---|---|---|---|---|
| F4.1 | A Card selector offers Hero, Table, Compact | T4.3, T4.4 | `codex/codexTab.test.ts > Hero is shown as the active Card by default (the registry default, T4.2)`; `> persists via the injected callback with the collection id and the picked Card id (mutation guard)` (picks Compact); `> picking a Card re-renders the same entries and writes no frontmatter [PRD/F4 AC]` (picks Table) | covered |
| F4.2 | Hero: image or monogram, name, key facts, relation pills | T4.3 | `codex/cards/heroCard.test.ts > shows the portrait image…`; `> falls back to a monogram when the portrait is absent`; `> shows relation pills, one per linked entity, in the same pill row` | covered |
| F4.3 | A different Card: same entries, no frontmatter written | T4.4 | `codex/codexTab.test.ts > picking a Card re-renders the same entries and writes no frontmatter [PRD/F4 AC]` | covered |
| F4.4 | The Card choice is remembered per collection | T4.4 | `codex/codexTab.test.ts > remembers the Card choice per collection — Characters Hero while Objects is Table [PRD/F4 AC]`; `> a fresh AnvilView reflects a persisted per-collection Card choice immediately (reload) [SDD/AC]` | covered |
| F4.5 | An imported Card is under its own heading | T4.4 | `codex/codexTab.test.ts > groups an imported Card under a heading distinct from the built-ins [PRD/F4 AC]`. An imported Card draws as Hero in a `.base` embed (T7.1d2 deviation, accepted live, README 2026-11-13) | covered |
| F4.6 | A present property shows normally, blank included | T4.2, T4.5 | `codex/cardRegistry.test.ts > renders a blank-but-present property normally — not marked absent`; `bases/CardBasesView.test.ts > renders a blank-but-present property as present, not marked absent`; `codex/cards/tableCard.test.ts > renders a present-but-blank column normally, without .miss` | covered |
| F4.7 | An absent property is marked (tint + label), never `undefined` | T4.2, T4.3 | `codex/cards/heroCard.test.ts > marks an absent core fact in the facts line with a visible label AND a tooltip`; `codex/cardRegistry.test.ts > puts no literal 'undefined' in the DOM when a Card reads an absent field` | covered |
| F4.8 | Tooltip; legible without a pointer | T4.3 | `codex/cards/heroCard.test.ts > carries the same explanation to assistive tech via aria-label, keeping the field name in it` | covered |
| F4.9 | Bases unavailable: native grid, fully usable | T4.5, T8.2 | `integration/degradationMatrix.test.ts > draws the built-ins natively, and hands the .base to Bases only where Bases can draw it`; `> opens the editor from an entry, and a commit writes a plain value`; `codex/codexTab.test.ts > with Bases off and no Dataview, the built-in collections still draw their entries` | covered |
| F4.10 | Bases disabled: one dismissible hint, dismissal permanent | T4.6, T7.4 | `codex/codexTab.test.ts > dismissing is a structural control routed through the real click walk, and calls the host callback with the hint id`; `main.dismissHint.test.ts > PERMANENCE: a dismissal survives a fresh plugin instance reloading the same persisted data.json`; `integration/degradationMatrix.test.ts > stays away with Bases off` | covered |
| F4.11 | A missing community plugin prompts nothing | T4.6, T8.2 | `codex/codexTab.test.ts > shows no hint — ever — regardless of a community plugin's absence…`; `integration/degradationMatrix.test.ts > never prompts for a community plugin, in the Anvil, the Workbench, the Library or a Notice` | covered |

### F5 — The editor pane

| # | AC (abridged) | Task | Test | Status |
|---|---|---|---|---|
| F5.1 | Selecting an entry opens the pane | T5.1 | `editor/editorPane.test.ts > opens showing the selected entry when a Codex entry's name is clicked` | covered |
| F5.2 | A commit writes a plain Property; the grid reflects it | T5.4 | `editor/fieldCommit.test.ts > calls the writer once and sets only the edited key`; `anvil/AnvilView.cardRefresh.test.ts > shows its new value on the note's card in the grid` | covered |
| F5.3 | Close returns the full grid | T5.1 | `editor/editorPane.test.ts > closes back to the full grid` | covered |
| F5.4 | Fullscreen takes the grid's space; Back returns to the dock | T5.1 | `editor/editorPane.test.ts > takes the grid's space in fullscreen (S100)`; `> returns from fullscreen to the previous dock (%s) via Back`. The real box model: live walk (T5.6, verified) | covered |
| F5.5 | Dock right from the header toggle: one column beside; never automatic | T5.1 | `editor/editorPane.test.ts > docks beside a single card column when the dock is 'right' (S99)`; `> switches dock only when the dock tool is used, persisting through the host`; `> never changes the dock on a window resize (ADR-33)` (header toggle is the setting, README 2026-11-02) | covered |
| F5.6 | Every dock shows the complete field set | T5.3 | `editor/editorSections.test.ts > shows the full field set in the bottom dock` / `right dock` / `fullscreen` | covered |
| F5.7 | A declared but absent field is an ordinary empty control, not marked | T5.3 | `anvil/AnvilView.absentField.test.ts > %s renders as an ordinary control with no value and no 'not set' marking`; `> creates the key in the note when the user types into it` | covered |
| F5.8 | A failed write restores the value and says so | T5.4 | `editor/fieldCommit.test.ts > restores on a WRITE failure, after the vault rejected the write` | covered |
| F5.9 | An external change updates the editor | T5.4 | `editor/fieldCommit.test.ts > updates a clean control when the note changes outside the plugin`; `> does NOT clobber an in-flight edit, and catches up once it settles` | covered |
| F5.10 | Relation add/remove writes `[[wikilinks]]` a human could type | T5.2, T5.4 | `editor/fieldCommit.test.ts > writes an added chip as a [[wikilink]] a human could have typed`; `> writes the remaining list when a chip is removed` | covered |

### F6 — Fields from the FileClass chain

| # | AC (abridged) | Task | Test | Status |
|---|---|---|---|---|
| F6.1 | Fields in the FileClass's order | T1.2, T1.3 | `fileclass/fileClassReader.test.ts > resolves fieldsOrder through ids, not names, using the real fc-character-fantasy shape`; `editor/fieldModel.test.ts > passes the reader's field order through untouched, including fieldsOrder-omitted fields appended last` | covered |
| F6.2 | One labelled section per FileClass in the chain | T5.3 | `editor/editorSections.test.ts > renders one section per FileClass in chain order, base first`; `> takes a section's label from the FileClass's own title key when it has one` (OQ-1) | covered |
| F6.3 | `Select`/`Cycle` offer exactly the declared values | T5.2 | `editor/fieldControls.test.ts > renders a select offering exactly the declared values for Select`; `> renders an appropriate control for the remaining declared type %s` (Cycle). `Multi` stays free chips (README 2026-11-02, AC narrowed) | covered |
| F6.4 | A user FileClass extending ours gets its own section, no plugin change | T5.3, T8.1 | `editor/editorSections.test.ts > gives it its own labelled section rather than appending its fields to ours`; `integration/demonstrated-extension.test.ts > become a Codex collection whose entries open a typed, sectioned editor that writes plain Properties` | covered |
| F6.5 | All 13 flat types map to an appropriate control | T5.2, T5.4 | `editor/fieldControls.test.ts > field controls — one per type (T5.2)` (Input, Number, Boolean, Date, Select, MultiFile, File, Multi; `renders an appropriate control for the remaining declared type %s` for Cycle, Datetime, Time); `> gives a Media field named portrait the preview, path and buttons`; `editor/fieldModel.test.ts > %s holding only [[links]] becomes link chips` (MultiMedia); `editor/fieldCommit.test.ts > maps %s to the writer's %s spec` | covered |
| F6.6 | `Media`: preview + picker in the Anvil; `MultiMedia` list: link chips; stored as a wikilink that survives a rename | T5.5, T6.1 | `editor/fieldControls.test.ts > gives a Media field with an arbitrary name the same control`; `editor/mediaPicker.test.ts > resolves to a [[wikilink]] holding the full vault path`; `editor/fieldCommit.test.ts > keeps every link of a list stored in a Media field, as link chips`. The rename is Obsidian's link updater: live walk 2026-11-02 (re-run on a full-path value) | covered |
| F6.7 | An unsupported type falls back to text | T5.2 | `editor/fieldControls.test.ts > falls back to a plain text control for an unknown type, preserving the value` | covered |
| F6.8 | No FileClass: the note's keys, typed by value | T1.3, T6.4 | `integration/fileclass-tiers.test.ts > the Anvil editor shows the note's own keys, typed by value`; `> the Workbench editor shows the note's own keys, typed by value` | covered |
| F6.9 | An undeclared key is in "Other properties" | T1.3, T5.3 | `editor/editorSections.test.ts > puts a key no FileClass declares in its own Other properties section`; `integration/fileclass-tiers.test.ts > appears under Other properties in the Workbench` | covered |
| F6.10 | Short types two columns; list types full width | T1.3, T5.3 | `editor/editorSections.test.ts > stamps half width for the short types and full width for the list types`. The two-up placement is CSS: live walk (T5.6, verified) | covered |
| F6.11 | `wide` in our schema is full width; `Media` is full width with preview from its type | T6.1, T6.1b | `schema/uiHints.test.ts > renders the tagline label full width through a real AnvilView`; `> does not widen a user's own FileClass field that happens to be called tagline`; `editor/fieldModel.test.ts > gives name/role/status/occupation half width, tagline (ui:wide) and portrait (Media) full` | covered |
| F6.12 | `schema:gen` leaves a hand-written FileClass untouched | T6.5 | `schema/schemaGenHandwritten.test.ts > leaves its bytes and mtime alone` | covered |

### F7 — The Library

| # | AC (abridged) | Task | Test | Status |
|---|---|---|---|---|
| F7.1 | Two lists, Collections and Cards, each entry marked by provenance | T7.1b, T7.1c | `settings/libraryTab.test.ts > gives every row a provenance badge, and an engine badge to non-built-ins only`; `settings/libraryCards.test.ts > lists the Cards in store order, each with its provenance badge and no surface switches` | covered |
| F7.2 | A built-in can be disabled, never removed | T7.1 | `settings/libraryTab.test.ts > a built-in offers configure and no remove; from-repo and imported offer both`; `> the checkbox calls setEnabled and the row shows the stored state`. Hero is the fallback Card and cannot be disabled (P19, README 2026-11-12: "narrows F7's per-entry disable criterion for that one Card") | deviated-recorded |
| F7.3 | Imported and from-repo entries can be disabled and removed | T7.1 | `settings/libraryTab.test.ts > Remove calls the store, the command is removed, a notice repeats that the file stays, and focus moves on`; `settings/libraryCards.test.ts > removes through removeCard on confirm…` | covered |
| F7.4 | A disabled collection has no pill | T4.1, T7.1d2 | `codex/codexTab.test.ts > gives a disabled collection no pill at all [PRD/F7 AC]`; `anvil/anvilLibrary.test.ts > equal anvilPills of the Library in Library order; a disabled or Anvil-off collection has none` | covered |
| F7.5 | A vault `.base` imports as a Collection | T7.2 | `import/importEngineCoverage.test.ts > lists the .base in the picker and, on Import, stores it as an imported Bases collection for the Anvil` | covered |
| F7.6 | A Dataview query imports as a Collection | T7.2 | `import/importEngineCoverage.test.ts > stores a DQL note as an imported Dataview collection for the Workbench, with no disclosure (R1)` | covered |
| F7.7 | An unparsable/unresolvable import is refused with a reason; nothing persisted | T7.2 | `import/importEngineCoverage.test.ts > refuses a .base with %s, shows the reason in the picker, and writes nothing`; `import/ImportPickerModal.test.ts > a note that changed since the scan is refused with its reason and fix line` | covered |
| F7.8 | DataviewJS keeps the consent gate; Bases and DQL are enable/disable only | T7.2 | `import/importEngineCoverage.test.ts > a DataviewJS import goes through the consent modal, and declining it persists nothing`; `> an imported .base stays drawable after the user edits it in Bases — no re-consent`; `consent/ConsentGate.test.ts > ConsentGate.evaluate() — a Dataview DQL record is enable/disable only`; `anvil/anvilLibrary.test.ts > draws a hand-edited DQL query as it now is, with no re-consent prompt (DQL never drifts)`. README 2026-11-17 "A DQL collection never drifts", R1 (2026-11-13) and the S21 removal record how this was reached | covered |
| F7.9 | A curated Dataview view installs; the catalog is not Bases-only | T7.2, T7.3 | `catalog/catalogDataview.test.ts > writes the note into the repo folder and stores a from-repo Dataview collection for the Workbench`; `> is mixed: it also holds a curated .base (T7.3)` | covered |
| F7.10 | Bound to the Workbench: a tab; to the Anvil: a Codex collection | T7.1d2, T7.1d3 | `anvil/anvilLibrary.endToEnd.test.ts > appears in the Anvil's Codex, draws through Bases, and leaves nothing behind once removed`; `> is a Workbench tab beside Codex and Navigator, and leaves with its collection`; `views/SidebarView.library.test.ts > give no tab to a Workbench-off collection, a disabled one or a Card; a migrated Dataview collection keeps its tab` | covered |

### F8 — Capability disclosure (Should)

| # | AC (abridged) | Task | Test | Status |
|---|---|---|---|---|
| F8.1 | A one-time first-run screen lists each optional plugin, marked core or community | T7.4 | `library/capabilityReport.test.ts > lists Bases (core), Dataview and metadata-menu (community), in that order`; `library/CapabilitiesModal.test.ts > opens the first time a view opens after layout is ready`; `main.capabilities.test.ts > opens exactly once at layout ready when an Anvil and a Workbench were restored before it`. First run = first Anvil or Workbench open (S1, README 2026-11-13) | covered |
| F8.2 | Each row says what is lost without it | T7.4 | `library/capabilityReport.test.ts > every row has a kind, what it adds and what is lost without it`; `library/CapabilitiesModal.test.ts > draws what it adds and what is lost without it, with \`code\` as code` | covered |
| F8.3 | Dismissed once, never again; reachable from settings | T7.4 | `library/CapabilitiesModal.test.ts > never opens once dismissed`; `main.capabilities.test.ts > opens the same screen with only Close, and closing it records nothing`; `settings/libraryTab.test.ts > shows 'What optional plugins add…' at the foot of the Library and calls the T7.4 hook` | covered |
| F8.4 | A disabled core plugin: one dismissible hint | T4.6, T7.4 | `codex/codexTab.test.ts > shows the hint when Bases is present but disabled`; `integration/degradationMatrix.test.ts > shows exactly one dismissible Bases hint`. The Bases status is read at load (README 2026-11-17, L12 amended twice) | covered |
| F8.5 | A missing community plugin: no prompt, banner or nag | T7.4, T8.2 | `integration/degradationMatrix.test.ts > never prompts for a community plugin, in the Anvil, the Workbench, the Library or a Notice`; `library/CapabilitiesModal.test.ts > only the core row says where to turn it on, as text; community rows have no action at all (S4)`; `settings/libraryTab.test.ts > (c) engine missing: a neutral badge, the cause with a link to the capability screen, and the switches stay live` (S5) | covered |
| F8.6 | Every optional plugin absent: nothing empty, broken or blocked | T8.2 | `integration/degradationMatrix.test.ts` cells "Bases absent × Dataview absent × metadata-menu absent" (desktop and mobile): all four tests per cell; `library/CapabilitiesModal.test.ts > with everything absent, every row is still drawn (L12c)` | covered |

### Rows not counted above, kept for the record

| # | AC (abridged) | Task | Test | Status |
|---|---|---|---|---|
| F7.2b | (inside F7.2) Built-in **collections** disable without remove | T7.1 | as F7.2; only the Hero Card is narrowed | covered |
| M-TP | Success metric "Truth preservation": every value the editor writes is visible and editable in the core Properties UI | T5.4, T8.5 | Automated half: `editor/fieldCommit.test.ts > writes plain YAML values, never an object or a class instance`; `> maps %s to the writer's %s spec` (every type reaches the writer as a plain YAML value); `integration/degradationMatrix.test.ts > opens the editor from an entry, and a commit writes a plain value`. The Properties UI itself: live walk 008-N | manual-only |
| M-UNDO | (struck) Cmd+Z reverts a pane write | — | Struck 2026-11-02 (G22); spec 009 delivered undo | deviated-recorded |

F7.2b and M-UNDO are not counted in the totals; M-TP is the success metric above. **No GAP
was found.**

## Notes for finalizing

- `plan/phase-3.md` T3.5 still has its first success box unticked ("open until Phase 7's per-entry
  Library UI ships the tag field"). T7.1b shipped that field (F3.8 above). The box can be ticked
  with a pointer to T7.1b.
- The success criterion "Every AC has a passing test" holds for every behavioural criterion. The
  parts no jsdom test can prove (CSS placement, Obsidian rewriting a link on rename, the core
  Properties UI) are live-walk items by T5.6's own ruling, which the SDD records.
