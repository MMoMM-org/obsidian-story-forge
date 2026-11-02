---
title: "The Codex surface — Anvil, Workbench, Collections and Cards"
status: draft
version: "1.0"
---

# Product Requirements Document

## Validation Checklist

### CRITICAL GATES (Must Pass)

- [x] All required sections are complete
- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Problem statement is specific and measurable
- [x] Every feature has testable acceptance criteria (Gherkin format)
- [x] No contradictions between sections

### QUALITY CHECKS (Should Pass)

- [x] Problem is validated by evidence (not assumptions)
- [x] Context → Problem → Solution flow makes sense
- [x] Every persona has at least one user journey
- [x] All MoSCoW categories addressed (Must/Should/Could/Won't)
- [x] Every metric has corresponding tracking events *(see Success Metrics — deliberately no telemetry; verification is by acceptance criteria and a live-vault walk, as in specs 006/007)*
- [x] No feature redundancy (check for duplicates)
- [x] No technical implementation details included
- [x] A new team member could understand this PRD

---

## Product Overview

### Vision

One place in Obsidian where a writer sees every story object they have invented, in a form that
fits the story they are actually writing — including the parts Story Forge never anticipated.

### Problem Statement

Story Forge can already follow the active note and render five workspace views, all from
frontmatter. What it cannot do is let a writer **look their world up**, or **shape what looking it
up means**.

Concretely, today:

1. **The Codex is a table.** `Codex.base` renders four fixed entity kinds as rows. Storyline — the
   reference model — sells its Codex on *"Characters, Locations, and your own custom categories
   (Props, Factions, Magic Systems — whatever you need)"*. A writer with creatures, guilds or magic
   systems has nowhere to put them.
2. **Extending the model means forking the plugin.** A new field must pass through
   `schema/*.json` plus two compiled TypeScript lists. An unknown frontmatter key is invisible;
   an unknown entity kind falls through to a flat fallback. The plugin supports *one* story model —
   the one that ships with it.
3. **Nothing can be edited where it is read.** The sidebar commits scalars and enums; relations —
   the field type the entire model is built on — cannot be edited anywhere.
4. **There is no main-window surface, only four commands.** `Open Timeline` is the entry point
   behind which Kanban, Plotgrid, Plotlines, swimlanes and zoom actually live. A user has no way to
   learn these are one thing.
5. **The distribution machinery serves almost nothing.** The curated catalog can ship *only* Bases
   entries; the import flow accepts *only* Dataview. A user's own `.base` has no route in, and no
   user view can reach the main window at all.
6. **The vault layout is compulsory.** `Codex.base` filters `file.inFolder("30 Canon")` — an
   *include* — so the plugin only fits a vault shaped like the development vault.

The consequence is a plugin that is genuinely useful to exactly one story model in exactly one
folder layout, while its stated purpose (`DESIGN.md`, `gap-analysis.md` §1.2) is the opposite.

### Value Proposition

Two properties no other tool in this space combines:

- **Storyline's Codex without Storyline's ownership.** The same hub, hero cards and detail editing —
  but every value is a plain frontmatter Property, editable from the core Properties UI,
  metadata-menu, a script, or by hand. Storyline is capable and rigid because it owns the data; we
  render and write, and own nothing.
- **A story model the writer defines.** Categories, fields, enum values, section grouping and even
  column layout come from files in the vault. Adding `skills` to characters, or an entire
  *Organizations* category, is something a writer does in their vault — not something they file an
  issue about.

### Terms used in this document

| Term | Meaning |
|---|---|
| **Anvil** | The main-window interface — one view with a tab switcher (Codex, Timeline, Plotgrid, Plotlines, Board). Where the manuscript is managed. |
| **Workbench** | The sidebar interface. Follows the active note. The Codex is one of its tabs, alongside the Navigator and any imported views. |
| **Codex** | The story *objects* — characters, locations, items, creatures, lore, and whatever else a writer adds. **Content, not an interface**: it appears as a card grid in the Anvil and as a compact tab in the Workbench. |
| **Collection** | *What* is shown — a query yielding a set of notes (Characters, Organizations). One pill in the Codex. |
| **Card** | *How* an entry is drawn — Hero, Table, Compact, or the user's own. Chosen per collection. |
| **FileClass** | A note in the vault whose frontmatter declares a set of fields — their names, types, selectable values, order, and which other FileClass they extend. The format is metadata-menu's; the plugin generates its own and reads any the user adds. Having metadata-menu installed is **not** required to read them. |
| **Frontmatter / Property** | The YAML block at the top of a note. |
| **Plain Property** | A frontmatter value **a human could have typed, and that the core Obsidian Properties UI can display and edit**. `status: alive`, `age: 34`, `allies: ["[[Tobias Ferro]]"]` are plain. A plugin-encoded blob (`sf-state: "{\"v\":2,\"sel\":…}"`), an opaque id, or a value only this plugin can interpret is **not** — and the plugin never writes one. The test: delete Story Forge, and every fact it ever wrote still reads correctly in Obsidian and in any other tool. |
| **Core vs community plugin** | **Core** plugins (Bases, Properties) ship with Obsidian and are *enabled*, not installed. **Community** plugins (Dataview, metadata-menu, meta-bind, Calendarium) are third-party installs. The distinction matters for what we may suggest — see F8. |

## User Personas

### Primary Persona: the solo novelist with a frontmatter canon

- **Demographics:** Writes long-form fiction in Obsidian; keeps one canonical note per entity with
  facts in frontmatter and relations as `[[wikilinks]]`; comfortable editing YAML but not a
  developer; may or may not have Dataview, metadata-menu or Bases installed.
- **Goals:** Look up what they established three months ago without breaking flow. Fix a fact in the
  place they noticed it was wrong. Keep the canon usable by other tools — and by their future self
  without this plugin.
- **Pain Points:** Facts are spread across notes and only findable by search. Editing means leaving
  the view, opening the note, scrolling to frontmatter. The plugin's idea of a character is not
  their idea of a character.

### Secondary Personas

**The genre outlier.** Writes something the shipped schema never modelled — isekai with levels and
skills, a mystery with clues and suspects, a series bible with cultures and languages. Their
frontmatter is *different*, not wrong. Today the plugin renders none of it. They are the honest test
of whether the extensibility contract is real: if they must wait for a release, it is not.

**The tinkerer.** Already writes their own `.base` files and Dataview queries. Wants Story Forge's
presentation (hero cards, the editor) applied to *their* queries, and wants to swap out anything
shipped that does not suit them. They will find every place where "curated" quietly means
"mandatory".

## User Journey Maps

### Primary User Journey: look it up, fix it, keep writing

1. **Awareness:** Mid-scene, the writer cannot remember whether the harbour warden's sister is older
   or younger, and whether they are still on speaking terms after chapter 9.
2. **Consideration:** Today's options are vault search, opening the character note and reading raw
   frontmatter, or the sidebar panel — which shows the fact but cannot fix it.
3. **Adoption:** One command opens the Anvil; the Codex tab shows every character as a card with
   portrait, role and status. No query to write, no folder to remember.
4. **Usage:** Click the sister's card → the editor opens beneath the grid with her full field set →
   correct `status` → the value is written to her note's frontmatter as a plain Property. Close the
   pane, return to the grid, keep writing.
5. **Retention:** It is faster than search and it never lies, because it reads the same frontmatter
   the writer edits by hand. Nothing is trapped in the plugin.

### Secondary User Journeys

**The genre outlier adds a category.** Writes an `fc-organization.md` FileClass into their
FileClasses folder and a small `.base` that selects `canon/organization`. In settings, imports the
base as a **Collection** and enables it. The Codex grows an *Organizations* pill; selecting an
organization opens the editor with their own fields — typed, ordered, grouped under their own
section heading. **No plugin release was involved at any point.**

**The tinkerer replaces a shipped view.** Dislikes what the built-in Characters collection shows.
Writes their own `.base`, imports it as a Collection, and selects it instead. Later writes an
"Isekai hero" **Card** that renders `level` and `skills`, imports it, and picks it from the Card
dropdown — same collection, different presentation, remembered for next time.

**The primary persona again, with no add-ons installed.** The same solo novelist, on a vault with
neither Dataview nor metadata-menu — an explicitly supported configuration, not a degraded one. They
open the Anvil; the Codex works, the editor works, cards render. Nothing tells them to install
anything, and features that would need an absent plugin are simply not offered.

## Feature Requirements

### Must Have Features

The minimum for the Codex to be a surface rather than a table.

#### Feature F1: Anvil — one main-window view with a tab switcher

- **User Story:** As a writer, I want one place I open to work on my manuscript, so that I do not
  have to learn four unrelated commands and guess which one hides the board.
- **Acceptance Criteria:**
  - [ ] Given the plugin is installed, When the user runs `Open Anvil`, Then a main-window view opens with a tab strip containing **Codex · Timeline · Plotgrid · Plotlines · Board**
  - [ ] Given the Anvil is open, When the user selects a tab, Then that tab's content replaces the body and the tab strip stays visible
  - [ ] Given a management tab is selected, When it renders, Then its behaviour is **identical to the current Timeline/Plotgrid/Plotlines/Kanban** — no regression in layout, controls, zoom or drag
  - [ ] Given the Timeline tab is selected, When it renders, Then its own controls (Rail | Swimlane, group-by) appear, and Then they are hidden on every other tab
  - [ ] Given the commands `Open Timeline`, `Open Plotlines`, `Open Kanban`, `Open Plotgrid` existed before, When the user upgrades, Then they resolve to the Anvil with the corresponding tab selected
  - [ ] Given the sidebar view, When the user runs `Open Workbench`, Then the sidebar opens; and Then it is labelled **Workbench** in the command palette, ribbon tooltip and settings
  - [ ] Given an Anvil is already open, When the user runs `Open Anvil` again, Then the existing view is revealed rather than a second one created

#### Feature F2: Navigation semantics — one rule, every surface

- **User Story:** As a writer, I want a click to do the same kind of thing wherever I am, so that I
  can build a habit instead of guessing what a particular tab will do.
- **Why this exists:** today the behaviour is defined only by code and differs by surface. A click in
  the Anvil may reveal the Workbench and switch it to the Codex for that note; a link may open the
  note in a tab; sometimes the Workbench appears showing the Navigator. There is a single global
  `linkClickAction` setting (`drill` | `open`, modifier-click inverts it), but no stated rule for
  *what is clickable* and *what each target does*. The rule must be **general across surfaces**, not
  invented per tab.
- **Acceptance Criteria:**
  - [ ] Given any surface, When the user clicks an element, Then its behaviour is determined by **what kind of target it is**, not by which tab or panel it sits in
  - [ ] Given the target kinds below, When the user clicks one, Then the behaviour matches this matrix:

    | Target | Plain click | Modifier-click |
    |---|---|---|
    | **Entity name / link** | the configured action (default **inspect**) | the other action (**open note**) |
    | **Card title** (Anvil Codex; added 2026-11-02) | **open note in a new tab**; with *Open note from card title* off, **inspect** | the other of the two |
    | **Editor pane name** (added 2026-11-02) | **open note in a new tab** | same |
    | **Card / row body** (not a name) | **inspect** — show it in place; never navigate away | **open note** |
    | **Structural control** (chevron, collapse header, tab, pill, dropdown) | operate the control only | same — modifiers do not navigate |
    | **Editable field** (in the editor pane) | focus the control for editing | same |

  - [ ] Given **inspect** in the Anvil, When the user inspects an entry, Then it is shown **within the Anvil** (the editor pane) and Then no other leaf is opened, revealed or re-targeted
  - [ ] Given **inspect** in the Workbench, When the user inspects an entry, Then the Workbench shows it and follow-the-active-note is suspended until Back or open-note resumes it
  - [ ] Given **open note**, When the user opens an entry from any surface, Then the note opens in the workspace and no panel silently changes tab
  - [ ] Given the user clicks the body of a card whose name is also clickable, When the click lands on the name, Then the name's behaviour wins over the card's
  - [ ] Given a click resolves to no known target kind, When it is handled, Then nothing happens — no navigation, no write
  - [ ] Given the configured action, When the user changes it in settings, Then every surface honours the new value without a reload

*Naming note for the SDD: the setting's values are currently `drill` | `open`. "Drill" describes the
Workbench's stack-navigation and reads oddly for the Anvil's editor pane. **Inspect** is the
behaviour both share — showing the thing where you are — and is the term used above.*


#### Feature F3: Codex collections

- **User Story:** As a writer, I want to browse my story objects by category, so that I can find what
  I invented without writing a query or remembering a folder.
- **Acceptance Criteria:**
  - [ ] Given the Codex tab, When it opens, Then a row of collection pills is shown and the first enabled collection is selected
  - [ ] Given a collection is selected, When it resolves, Then the notes it lists are those carrying its configured **tag**
  - [ ] Given excluded folders are configured, When a collection resolves, Then notes inside those folders are **absent** from the result
  - [ ] Given a collection's tag is changed in settings, When the user returns to the Codex, Then the grid reflects the new tag **without any consent or re-approval prompt**
  - [ ] Given the four built-in collections (`character`, `location`, `object`, `lore`), When the plugin is installed, Then all four are available and enabled by default
  - [ ] Given a collection resolves to no notes, When the grid renders, Then an empty state names **the tag it looked for** and offers **Change tag** and **What are FileClasses?** *(reworded 2026-11-02: **Set up my vault…** was withdrawn 2026-08-04 and returns with #27, see Should Have)*
  - [ ] Given the user selects a different collection, When the grid re-renders, Then any open editor pane closes or follows the new selection — never shows a note from the previous collection
  - [ ] Given a built-in collection, When the user opens its settings, Then **both its tag and its excluded folders are editable**, each pre-filled with a shipped default (`canon/character`… and `00 Meta`)
  - [ ] Given the user changes a tag or an excluded folder, When they confirm, Then the Codex reflects it **without the user editing any file by hand**
  - [ ] Given a collection whose tag has been cleared, When it resolves, Then it reports itself as misconfigured — it does **not** silently list the entire vault

#### Feature F4: Cards — how an entry is drawn

- **User Story:** As a writer, I want my characters shown as portrait cards and my lore as a table,
  so that each kind of thing is shown at the density it deserves.
- **Acceptance Criteria:**
  - [ ] Given a collection is selected, When the Codex renders, Then a **Card selector** is shown in the header offering at minimum **Hero**, **Table** and **Compact**
  - [ ] Given the Hero card, When an entry renders, Then it shows the entry's image (or a monogram fallback), its name, key facts and relation pills
  - [ ] Given the user picks a different Card, When the grid re-renders, Then the same entries are shown in the new presentation and **no frontmatter is written**
  - [ ] Given the user picked a Card for a collection, When they leave and return to that collection, Then their choice is **remembered per collection** — Characters may be Hero while Lore is Table
  - [ ] Given an imported Card, When the user selects it, Then it appears in the selector under a heading distinguishing it from built-ins
  - [ ] Given a Card reads a property that **exists** on the note, When it renders, Then the field is shown normally — including when the value is blank; `null`, `""` and `[]` are **not** distinguished from one another
  - [ ] Given a Card reads a property that is **absent** from the note, When it renders, Then the field is shown **marked as not set** — a red tint **plus** a short visible label, so the marking never depends on colour alone — and never the literal text `undefined`
  - [ ] Given a marked field, When the pointer rests on it, Then a tooltip explains that the property does not exist in that note; and Then the marking stays legible without a pointer (mobile, keyboard, colour-blind)
  - [ ] Given Bases is unavailable, When the Codex renders, Then a native card grid is shown instead, and Then the Codex stays fully usable
  - [ ] Given Bases is **disabled but present** (it is a core plugin), When the Codex renders, Then a **dismissible** hint states that enabling it adds card options; and Then dismissing it is permanent
  - [ ] Given a **community** plugin is absent (Dataview, metadata-menu), When the Codex renders, Then nothing prompts the user to install it — see F8


#### Feature F5: The editor pane

- **User Story:** As a writer, I want to correct a fact where I noticed it was wrong, so that I do
  not have to open the note, find the frontmatter and lose my place.
- **Acceptance Criteria:**
  - [ ] Given the Codex grid, When the user selects an entry, Then an editor pane opens showing that note's fields
  - [ ] Given the editor is open, When the user changes a field and commits it, Then the value is written to that note's frontmatter as a **plain Property**, and Then the grid reflects the change
  - [ ] Given the editor is open, When the user activates **close**, Then the pane closes and the full grid returns
  - [ ] Given the editor is open, When the user activates **fullscreen**, Then the pane occupies the tab body including the grid's space, and Then a **Back** affordance returns to the previous dock
  - [ ] Given the dock position is set to *right* with the toggle in the pane's header, When the editor opens, Then the grid is shown as a single column beside it; and Then the position **never changes automatically** on resize *(reworded 2026-11-02: the header toggle is the dock setting; there is no settings row)*
  - [ ] Given any dock (bottom, right, fullscreen), When the editor renders, Then it shows the **complete** field set — the docks differ only in room
  - [ ] Given a field declared by a FileClass but absent from the note, When the **editor** renders it, Then it is shown as an ordinary empty control and is **not** marked as missing — unlike a Card, typing here creates the property, so the absence is not a dead end
  - [ ] Given a write fails, When the user commits a field, Then the previous value is restored in the editor and the failure is surfaced to the user
  - [ ] Given a note is changed outside the plugin, When the editor is showing it, Then the displayed values update to match the file
  - [ ] Given a relation field, When the user adds or removes a linked entity, Then the frontmatter list is written as `[[wikilinks]]` a human could have typed

#### Feature F6: Fields come from the FileClass chain

- **User Story:** As a writer whose story has fields the plugin never heard of, I want them edited
  like every other field, so that my model is as first-class as the shipped one.
- **Acceptance Criteria:**
  - [ ] Given a FileClass applies to the selected note, When the editor renders, Then its fields appear in the order given by that FileClass
  - [ ] Given a FileClass extends another, When the editor renders, Then **one section per FileClass in the chain** is shown, each labelled with that FileClass
  - [ ] Given a `Select` or `Cycle` field declares selectable values, When the editor renders it, Then the control offers exactly those values *(narrowed 2026-11-02: `Multi` stays free chips, as ADR-0002 says)*
  - [ ] Given a user adds a FileClass extending a shipped one, When they select an affected entry, Then their fields appear **in their own labelled section**, typed and laid out like any other — with no plugin change
  - [ ] Given any of metadata-menu's **13 flat field types** — `Input`, `Boolean`, `Number`, `Select`, `Cycle`, `Multi`, `Date`, `Datetime`, `Time`, `File`, `MultiFile`, `Media`, `MultiMedia` — When the editor renders one, Then it maps to a control appropriate to that type
  - [ ] Given a `Media` or `MultiMedia` field, When it renders, Then it shows an image preview with a file picker, and Then the stored value is a **wikilink**, so Obsidian keeps it correct when the file is renamed
  - [ ] Given a field type the plugin does not support, When the editor renders it, Then it falls back to a plain text control rather than failing
  - [ ] Given no FileClass applies to a note, When the editor opens, Then the frontmatter keys present on the note are shown, typed by inspecting their values
  - [ ] Given the note carries a key no FileClass declares, When the editor renders, Then it appears in a distinct **Other properties** section
  - [ ] Given short field types, When the editor lays out a section, Then they occupy **two columns**; and Given list-valued types, Then they occupy the **full width**
  - [ ] Given a field declared `wide` in the plugin's own schema, When it renders, Then it uses the full width; and Given a field of the `Media` **type**, When it renders, Then it uses the full width and shows a preview with a file picker — the image control follows from the type, never from a `ui` hint
  - [ ] Given the plugin writes or updates **its own** FileClasses (setup wizard, or an upgrade), When it completes, Then a user-authored FileClass in the same folder is **untouched** — the plugin only ever writes files it authored

#### Feature F7: The Library — Collections and Cards in settings

- **User Story:** As a writer, I want to choose which collections and cards I use, and add my own,
  so that what ships is a starting point rather than a fixture.
- **Acceptance Criteria:**
  - [ ] Given settings, When the user opens the Library, Then two lists are shown — **Collections** and **Cards** — each entry marked **built-in**, **from repo** or **imported**
  - [ ] Given a built-in entry, When the user views it, Then it can be **disabled** but offers no remove action
  - [ ] Given an imported or from-repo entry, When the user views it, Then it can be **disabled and removed**
  - [ ] Given the user disables a collection, When they open the Codex, Then its pill is absent
  - [ ] Given the user imports a `.base` file from their vault, When the import completes, Then it is available as a Collection — **a `.base` can be imported**
  - [ ] Given the user imports a Dataview query, When the import completes, Then it is available as a Collection
  - [ ] Given an import whose query cannot be parsed or resolved, When the user confirms it, Then the import is **refused with a reason** and nothing is persisted
  - [ ] Given an imported DataviewJS entry, When it is enabled, Then the existing consent gate applies unchanged; and Given a Bases or Dataview-DQL entry, Then it is enable/disable without a consent modal
  - [ ] Given a curated Dataview view in the catalog, When the user installs it, Then it installs successfully — **the catalog is no longer Bases-only**
  - [ ] Given a user Collection, When the user binds it to the Workbench, Then it appears as a Workbench tab; and When bound to the Anvil, Then it appears as a Codex collection

### Should Have Features

- **Change tag / Choose folders from the empty state.** The empty state's actions open settings at
  the relevant setting rather than merely naming it.
- **Empty-state guidance instead of a wizard.** Seeding the vault is **out of scope** — it lives
  entirely in #27. The S98 empty state therefore offers **Change tag** (which works) and a link to
  documentation explaining what FileClasses add and how to create them. The **Set up my vault…**
  action returns with #27. Until then, a vault without FileClasses is a supported configuration
  served by the editor's tier-2 fallback, not a broken one.
- **Card preview in settings.** Seeing what a Card looks like before selecting it.

#### Feature F8: Capability disclosure — what Story Forge can use, and what you lose without it

- **User Story:** As a writer, I want to know once what Story Forge can do with the plugins I have —
  and what I am missing without them — so that I can decide deliberately instead of wondering why a
  screen looks plainer than a screenshot.
- **Why this is Should, not Must:** everything works without it. But a writer who never learns that
  enabling a **core** plugin unlocks card options will conclude the feature does not exist.
- **The line we hold:** **core** plugins may be *suggested* (they ship with Obsidian and cost only a
  toggle); **community** plugins are **listed, never nagged**. Story Forge must never push a user
  toward a third-party install, and no feature may be gated behind one.
- **Acceptance Criteria:**
  - [ ] Given first run, When the user opens Story Forge, Then a one-time screen lists what each optional plugin adds and marks each **core** or **community**
  - [ ] Given that screen, When the user reads a row, Then it states **what is lost without it** in concrete terms, not marketing
  - [ ] Given the screen, When the user dismisses it, Then it does not appear again and remains reachable from settings
  - [ ] Given a **core** plugin that is present but disabled, When a surface would benefit, Then a single dismissible hint may say so
  - [ ] Given a **community** plugin that is absent, When any surface renders, Then **no prompt, banner or nag is shown** — the capability list in settings is the only mention
  - [ ] Given every optional plugin is absent, When the user works, Then no screen is empty, broken or blocked

*This also discharges the obligation recorded as `gap-analysis.md` G14 / issue #19: document what each
add-on adds and what is missing without it.*

### Could Have Features

- **Per-collection "this file is yours now"** — switching off instance verification for one
  generated collection, after which the plugin stops regenerating it (ADR-0003 §7).
- ~~Value-inspection image fallback~~ — **not needed.** metadata-menu has a native **`Media`** type
  (a wikilink to a media file), so a user who wants an image declares `type: Media` and the control
  follows from the type like every other field. No hint, no guessing, no asymmetry between our fields
  and theirs. *Consequence:* our own `portrait` and `image` move from `text` to the media type too,
  which is a **schema change** — see F6 and the constraint note.
- **Keyboard navigation of the card grid** — arrow keys between cards, Enter to open the editor.

### Won't Have (This Phase)

- **Undo journal** — the editor writes through the same seam as every other write, but the journal
  and its "undo last change" command are issue #17. **Consequence to accept knowingly:** an editor
  mistake is corrected by retyping, not by undo.
- **Management-tab configurability** — status vocabulary, grouping keys, visible columns (issue #15).
  The tabs move into the Anvil unchanged; making them configurable is separate.
- **Plotgrid's richer cells** (#8), **Timeline drag → `storyDay`** (#7), **the subway map** (#5).
- **The Locations tree** (#22) — a Codex concern eventually, but not this phase.
- **Story graph / relationship map** (#23).
- **Calendar support** (#25) and **Longform absorption** (#3).
- **Editing FileClass definitions in-plugin.** We *read* FileClasses; authoring or editing them is
  metadata-menu's job or a text editor's.
- **Nine of metadata-menu's 22 field types**, excluded for **two different reasons**:
  - *Computed by metadata-menu* — `Lookup`, `Formula`, `Canvas`, `Canvas Group`, `Canvas Group Link`.
    Without the plugin there is no engine behind them, so rendering one would present a value we can
    neither produce nor maintain. Excluding them follows from the add-ons rule.
  - *Not a flat property* — `JSON`, `YAML`, `Object`, `Object List`. These are nested structures, not
    single Properties; editing them needs a nested editor, which is a different feature.
  Either way an excluded or unrecognised type falls back to a plain text control — never a failure.
- **Telemetry of any kind.**

## Detailed Feature Specifications

### Feature: F6 — Fields come from the FileClass chain

**Description:** The editor does not know what a character is. It resolves which FileClasses apply
to the selected note, reads their field declarations, and renders controls from them. Everything the
editor shows — which fields, in what order, under which heading, as which control, with which
selectable values, at which column width — is data in the vault. The shipped model is simply the set
of FileClasses that ship with the plugin.

**User Flow:**

1. User selects an entry in the Codex grid.
2. System resolves the FileClass chain for that note.
3. System renders one section per FileClass, in chain order, each labelled.
4. Within a section, System renders each declared field in its declared order, as a control matching
   its declared type, at a width derived from that type.
5. User edits a field.
6. System writes that single Property to the note's frontmatter and reflects it in the grid.

**Business Rules:**

- **R1** — A field's *presence and order* come from its FileClass, never from plugin code.
- **R2** — A field's *control* is chosen by its declared type; an unrecognised type renders as plain
  text rather than failing.
- **R3** — A field's *width* is derived from its type: short types share a row, list-valued types
  take the full width. Only two declared exceptions override this, and both live in the plugin's own
  schema, not in the FileClass.
- **R4** — Sections follow the inheritance chain, base class first, in order.
- **R5** — A key present on the note but declared by no FileClass appears last, in *Other properties*.
- **R6** — The plugin **never writes** to a FileClass. It reads them; the user (or metadata-menu)
  owns them.
- **R7** — No add-on may be required. With no metadata-menu installed, FileClasses are still read;
  with no FileClass at all, the editor falls back to the note's own keys.
- **R8** — Every write is a single plain Property, valid in the core Properties UI.

**Edge Cases:**

- A FileClass chain contains a cycle (A extends B extends A) → Expected: the chain is truncated at
  the repeat, sections render once each, no hang.
- Two FileClasses in the chain declare the same field name → Expected: the field appears once, in the
  earliest section that declares it; the later declaration does not create a duplicate row.
- A `Select` field's declared values do not include the note's current value → Expected: the current
  value is shown and preserved; committing a different value is still possible. The user's data is
  never silently discarded because a list disagrees with it.
- A FileClass declares a field the note does not have → Expected: the control renders empty and
  committing a value creates the key.
- The FileClasses folder does not exist or is empty → Expected: tier-2 behaviour (note's own keys),
  with no error.
- A FileClass file is malformed → Expected: it is skipped with a diagnosable message; other
  FileClasses in the chain still render.
- The note has no frontmatter at all → Expected: declared fields render empty; the first commit
  creates the frontmatter block.

## Success Metrics

### Key Performance Indicators

This is a local, single-user plugin with **no telemetry** (see `PRIVACY.md`). "Adoption" and
"business impact" have no meaning here and are deliberately not invented. Success is defined by
observable behaviour, verified the way specs 006 and 007 were:

- **Correctness:** every acceptance criterion above has a passing automated test.
- **Non-regression:** the existing suite stays green; the management tabs behave exactly as before
  their move into the Anvil.
- **Extensibility, demonstrated:** a FileClass and a `.base` written **by hand, without changing
  plugin code**, produce a working new Codex collection with a typed, sectioned editor. This is the
  one metric that decides whether the extensibility contract is real, and it is verified by doing it
  on the seed vault.
- **Independence:** with Dataview, metadata-menu and Bases all absent, the Codex and editor still
  work, and nothing prompts the user to install anything.
- **Truth preservation:** every value written by the editor is visible and editable in the core
  Properties UI. **Revised 2026-11-02:** this metric no longer claims undo. This spec ships none, and
  Cmd+Z in the note does not revert a pane write (live test 2026-11-02; G22 in
  `docs/gap-analysis.md`). The undo journal is issue #17, out of scope here.

### Tracking Requirements

| Event | Properties | Purpose |
|-------|------------|---------|
| *(none)* | — | **No events are tracked.** The plugin sends nothing anywhere. Verification is by automated acceptance tests plus a manual walk on `test/StoryForge/`, recorded in `docs/live-testing.md` as for previous milestones. |

---

## Constraints and Assumptions

### Constraints

- **Frontmatter is the source of truth for story data.** Every write is a plain Property via the
  established write seam. The plugin never becomes the owner of story facts.
- **Operational state may live in the plugin directory** — dock position, selected Card per
  collection, UI preferences. This is not story data and does not belong in a note.
- **Add-ons are never requirements.** Dataview, metadata-menu, Bases and Calendarium are detected and
  used where they help; everything degrades to native rendering without them.
- **Bases surfaces are desktop-only** and require a recent Obsidian; the Codex must degrade on mobile
  rather than break.
- **The signed-off mockups are binding.** `docs/mockups/anvil-workbench-codex.html` S91–S103 is the
  visual specification; divergence is raised before it is coded.
- **ADR-0001, ADR-0002 and ADR-0003 are settled** and are not re-opened by this spec.
- **No new story-schema fields.** This spec adds presentation hints to the plugin's own schema, not
  new facts to the story model.
- **English for all committed content**; UI text follows the Obsidian sentence-case rule.

### Assumptions

- The writer keeps one canonical note per entity with facts in frontmatter — the `_forge` model the
  plugin already assumes.
- A writer able to add a category is able to write a small YAML file, or copy and adapt one we ship.
  We are not building a FileClass editor.
- metadata-menu's FileClass file format is stable enough to read at v3, and a format change would be
  a visible, adaptable event rather than silent corruption.
- Vaults are small enough that resolving a collection and reading a FileClass chain per selection is
  not a performance concern at Codex scale.
- The user's own `.base` files may use any Bases feature; we render entries, we do not interpret
  queries ourselves.

## Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| **Scope**: six issues in one spec is large, and a partial delivery leaves the Codex worse than today | High | Medium | Sequence so each phase is independently shippable: the Anvil shell (F1) does not depend on the editor; the editor (F5) works on built-in fields before F6 derives them. Nothing is removed until its replacement passes its ACs. |
| Coupling to metadata-menu's FileClass format; a v4 breaks the editor | High | Low | Read defensively, unknown type → text, never write to those files; cover the reader with fixtures so a format change fails loudly in tests rather than silently in a user's vault. |
| Deriving the field list removes a hardcoded behaviour that was carrying an unnoticed requirement (e.g. `portrait` is special-cased **by field name** today) | Medium | Medium | Inventory every existing hardcoded field behaviour before deleting the list, and give each one a declared equivalent. `portrait` → the `Media` **type** is the known case (revised 2026-07-29 with ADR-32: not the withdrawn `ui: image` hint); look for others. |
| The generated-artifact model (ADR-0003) mishandles an existing install and a user loses a customised `.base` | High | Low | Migration is explicit, not implicit: never overwrite a file whose instance checksum is unknown; on doubt, ask. |
| No undo for editor writes this phase (#17 is out of scope) | Medium | Medium | The editor commits on deliberate field edits, not on bare clicks — the interaction that caused the earlier data loss. Obsidian's own file history remains available. Revisit if #17 slips further. |
| Moving four commands into one view breaks a user's hotkeys or saved layout | Low | Medium | Keep the old command ids resolving to the Anvil with the right tab; do not detach existing leaves on upgrade. |
| The empty state is what a new user sees first, because a fresh install ships no vault artifacts (#27) | Medium | High | The empty state must be genuinely helpful — name the tag, offer **Change tag** and the **What are FileClasses?** documentation link (reworded 2026-11-02: the setup action returns with #27) — and is an acceptance criterion, not a nicety. |

## Open Questions

- [x] **Resolved: the vault artifacts stay entirely in #27.** 008 ships no seeding at all. The
      argument for pulling it in was "a fresh install falls back to untyped fields — a poor first
      impression"; **that argument has no subject, because the plugin has never been released.** The
      cost of deferring is zero, and writing files into someone's vault is the most opinionated act
      this plugin could perform, so it earns its own spec with its own mockups. *Consequence for
      S98: the empty state's primary action becomes documentation, not a wizard — see the Should
      list.*
- [x] **Resolved during SDD** — inventoried in `solution.md` §Technical Debt. Larger than expected:
      character uses `portrait`, **location and object use `image`**, each triggering a tile instead
      of a fact row; plus `locationType` → "type" as a display remap (`components.ts:467`) and a
      `tagline` special case (`character.ts:119`). The image field has **two different names by
      kind** — so the fix is not a declaration but a **type change**: both fields become
      metadata-menu's native `Media` type, the control follows from the type, and the per-kind
      convention disappears instead of being restated.
- [x] **Resolved: no declaration. The field itself reports.** A Card does not declare what it reads;
      instead a property that is **absent** from a note renders marked (red tint + a short visible
      label + tooltip), while a property that **exists** renders normally even when blank. This needs
      no heuristic and no accuracy burden on Card authors, and it buys **property hygiene** as a side
      effect: "never filled in" and "deliberately blank" stop looking identical. The card/collection
      mismatch then diagnoses itself — an Isekai Card on Locations marks every field, and a whole
      column of markings is self-explanatory. *Deliberately not distinguished:* "missing on this
      note" versus "this Card does not fit this collection" — that is extra code for something the
      eye already reports. *The editor is exempt* (see F5): there, typing creates the property, so
      marking it would flag a fresh note as broken. **Filtering a collection by kind was raised and
      parked as #28** — adjacent, but it changes what is shown without changing the definition, which
      needs its own state and its own mockups.
- [x] **Resolved:** by **per-entry toggles in the Library row** (*Anvil* / *Workbench*), not by which
      list it was imported into. Two toggles beside each entry keep one list authoritative; a
      settings tab per surface would show the same entries twice and then need its own ordering
      rules. *(Alternative offered and not taken: a per-surface settings tab listing every Collection
      and Card with enable toggles.)*

---

## Supporting Research

### Competitive Analysis

**Storyline** (MIT, v1.10.41, source-read; `docs/storyline-analysis.md`) is the reference model. Its
Codex is *"a unified hub for Characters, Locations, and your own custom categories (Props, Factions,
Magic Systems — whatever you need)"*, with per-category folders, search and rich detail pages
including images and relationship maps. It stores facts in frontmatter — a compatible data model —
but every detail view is an inline editor backed by its own manager/undo layer, which is precisely
what makes it powerful and rigid. **We take the hub and the cards; we refuse the ownership layer.**

**Obsidian Bases** (core) supplies queries, filters and formulas, and lets a plugin register its own
view type — which is how our Cards render. It offers no API to read or write cell values
programmatically (ADR-0001), so editing is ours.

**metadata-menu** already defines a FileClass format expressing exactly what an editor needs: field
types, selectable values, order and inheritance. Rather than invent a competing format, we read
theirs — and because a FileClass is plain frontmatter, we can do so without requiring the plugin.

### User Research

No formal study. The requirements come from a documented audit of this codebase against its own
design (`docs/gap-analysis.md`, 25 registered gaps with code evidence) and four rounds of design
review with the primary user, in which four modelling errors were caught before implementation:
conflated Collection/Card axes, a hardcoded field list, a hardcoded layout, and generated artifacts
misfiled as consented imports.

### Market Data

Not applicable — a personal plugin with no commercial dimension. The only relevant population data
is the shape of the reference model's feature set, covered above.
