---
title: "Ship the vault artifacts — set up a story vault from a fresh install"
status: complete
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
- [x] Every metric has corresponding tracking events
- [x] No feature redundancy (check for duplicates)
- [x] No technical implementation details included
- [x] A new team member could understand this PRD

---

## Product Overview

### Vision

Someone who installs Story Forge from Obsidian's Community Plugins directory can, with one
deliberate action, get the same story vault foundation we develop against — FileClasses,
entity and scene templates, and a readable schema reference — and keep it current as the
plugin evolves, without ever losing an edit they made.

### Problem Statement

The `_forge` model is the default Story Forge builds on (`docs/gap-analysis.md` §1.2), but its
vault artifacts exist only in our development vault, `test/StoryForge/00 Meta/`
(issue #27, gap G25). A user who installs the plugin gets **none** of them:

- **No FileClasses.** The Anvil editor falls back to a single section typed from whatever
  frontmatter a note already has: no enum dropdowns, no fields the note does not have yet, no
  section order. metadata-menu, if installed, has nothing to read.
- **No templates.** There is no supported way to create a scene or an entity with the right
  Properties. The docs (`docs/getting-started.md`, `docs/fileclasses.md`) tell the user to copy
  files out of our test vault on GitHub.
- **No schema reference.** Nothing in the vault explains what `pov`, `storyDay` or `beat`
  mean or which values they take.

Consequence: every add-on story (metadata-menu value lists, meta-bind fields, template-based
creation) is unreachable in practice, and a submission to the Community Plugins directory
would ship a plugin that only works for us. A Community Plugins install downloads exactly
`main.js`, `manifest.json` and `styles.css`, so nothing outside the plugin code can travel with
it. There is also no GitHub release yet, so even the manual and BRAT install paths documented
in `docs/installation.md` do not work.

### Value Proposition

- **One action, not a copy job.** The user asks for the files and gets them where they want
  them, instead of hunting through a GitHub folder.
- **Safe by default.** Nothing is written unasked; the user sees what will be written and where
  before it happens; an existing file is never overwritten; an edited file is never replaced.
- **Stays current.** When a plugin update brings newer FileClasses or templates, the user is
  told and can update the files they have not edited, the same way curated collections from the
  repo update today.
- **Installable at all.** A first release that the Community Plugins directory would accept.

## User Personas

### Primary Persona: The new novelist

- **Demographics:** Writer, uses Obsidian for notes, comfortable with Properties, not with YAML
  or GitHub. Installs plugins from Community Plugins only.
- **Goals:** Start a story in their own vault and have Story Forge's editor, Anvil and Workbench
  work with it on day one.
- **Pain Points:** Today the plugin shows empty or bare views; the docs send them to a GitHub
  folder of a test vault to copy files by hand; they cannot tell which Properties the plugin
  expects.

### Secondary Personas

- **The existing user with their own setup.** Already has a FileClass folder (for example for
  metadata-menu) or their own `fc-scene.md`, and templates elsewhere. Needs the plugin to respect
  their folders and never clobber their files.
- **The maintainer (us).** Needs one source for the artifacts so the shipped files and the dev
  vault never drift, and a release that passes the Community Plugins review.

## User Journey Maps

### Primary User Journey: Set up a story vault after installing

1. **Awareness:** After enabling Story Forge, the first Anvil or Workbench opening shows the
   "What optional plugins add" screen, which now also points out that story files can be set up.
   The getting-started doc says the same.
2. **Consideration:** The user opens the setup, sees the list of files (FileClasses, templates,
   schema reference) with the folder each goes to, and can change the folders.
3. **Adoption:** They confirm. The files appear; a notice says how many were written and names
   any that were skipped and why.
4. **Usage:** They create a scene with the core Templates plugin from the new templates folder;
   the editor now shows the scene's sections and enum dropdowns.
5. **Retention:** After a later plugin update, the settings say updates are available; they
   update, and files they edited stay as they are.

### Secondary User Journeys

- **Existing setup:** The user already has `fc-scene.md` in their FileClasses folder. Setup
  writes the other files and reports `fc-scene.md` as not installed because a file already
  exists there; their file is untouched.
- **Partial set:** The user wants only the schema reference. They set it up on its own; the
  FileClasses and templates stay absent and can be set up later.
- **Maintainer release:** The maintainer cuts the first release; a fresh vault installs it
  manually or with BRAT, runs setup, and gets the same files as the dev vault.

## Feature Requirements

### Must Have Features

#### Feature 1: Bundled story artifacts

- **User Story:** As a new novelist, I want Story Forge to carry its FileClasses, templates and
  schema reference itself, so that I do not depend on files in a GitHub test vault.
- **Acceptance Criteria:**
  - [ ] Given a vault that has never contained Story Forge files, When Story Forge is installed
    with only `main.js`, `manifest.json` and `styles.css`, Then all three artifact sets can be
    set up without any network access
  - [ ] Given the shipped artifact set, When it is compared to the development vault's
    generated FileClasses, templates and schema reference notes, Then they are identical apart
    from the differences this PRD requires (Feature 5)
  - [ ] Given the development vault's dev-only files (`Processes/`, `CLAUDE.md`,
    `overview-*.base`, `Canon.base`, `Manuscript.base`, QuickAdd `Scripts/`, `dataview-views/`,
    the schema `.json` copies), When the shipped set is listed, Then none of them is in it
  - [ ] Given the schema changes and the maintainer regenerates the artifacts, When the shipped
    set is out of date with `schema/*.json`, Then the project's check gate fails

#### Feature 2: Set up on request

- **User Story:** As a new novelist, I want to set up the story files with one deliberate
  action and see beforehand what will be written where, so that nothing appears in my vault
  that I did not ask for.
- **Acceptance Criteria:**
  - [ ] Given Story Forge is enabled for the first time, When it loads, Then it writes no file
    into the vault
  - [ ] Given the command palette, When the user runs the setup command, Then a setup dialog
    opens listing each artifact set, its files and its target folder
  - [ ] Given the setup dialog, When it lists the files, Then each file shows what will happen
    to it before anything is written: created, already up to date, updated, or skipped with the
    reason (already exists, edited)
  - [ ] Given the Story Forge settings, When the user selects the setup button, Then the same
    setup dialog opens
  - [ ] Given the setup dialog, When the user deselects an artifact set and confirms, Then only
    the selected sets are written
  - [ ] Given the setup dialog, When the user cancels or closes it, Then no file is written
  - [ ] Given the user confirms, When setup finishes, Then a notice reports how many files were
    written and names each file that was skipped with its reason
  - [ ] Given a target folder does not exist, When setup writes into it, Then the folder is
    created
  - [ ] Given the "What optional plugins add" screen, When it is shown, Then it points to the
    setup without writing anything itself

#### Feature 3: Folder settings

- **User Story:** As an existing user with my own layout, I want to choose where the
  FileClasses, templates and schema reference go, so that the files fit my vault.
- **Acceptance Criteria:**
  - [ ] Given the settings, When the user opens them, Then there is one folder setting each for
    FileClasses (the existing Scope setting), templates and the schema reference, with defaults
    `00 Meta/FileClasses`, `00 Meta/Templates` and `00 Meta/Schema`
  - [ ] Given the setup dialog, When the user changes a target folder there, Then the change is
    saved to the matching setting and the files go to that folder
  - [ ] Given a folder setting changed after setup, When the user next looks for updates, Then
    the files already set up are still found where they were written, and the dialog says that
    the setting now points elsewhere

#### Feature 4: Never overwrite, update only unedited files

- **User Story:** As an existing user, I want setup and updates to leave my own and my edited
  files alone, so that I never lose work.
- **Acceptance Criteria:**
  - [ ] Given a file already exists at a target path that Story Forge did not write, When setup
    runs, Then that file is not changed and is reported as "Not installed: <path> already
    exists…"
  - [ ] Given a plugin update ships a newer version of a set-up file, When the user opens the
    settings, Then they see that updates are available and for how many files
  - [ ] Given an update is available and the user has not edited the file, When the user runs
    the update, Then the file is replaced with the new version
  - [ ] Given an update is available and the user has edited the file, When the user runs the
    update, Then the file is not changed and is reported as "Not updated: <path> was edited…"
  - [ ] Given a set-up file was deleted or moved by the user, When updates are checked, Then it
    is reported as missing and can be set up again; it is not recreated silently
  - [ ] Given a plugin update ships no change for a file, When updates are checked, Then that
    file is not offered as an update

#### Feature 5: Portable artifact content

- **User Story:** As a new novelist, I want the shipped files to work in my vault, not only in
  the developers' vault.
- **Acceptance Criteria:**
  - [ ] Given a shipped template, When it is inserted with Obsidian's core Templates plugin,
    Then its heading shows the new note's title
  - [ ] Given a shipped template, When it is inserted, Then it contains no value specific to the
    development vault (no `series: "Forge"`)
  - [ ] Given the shipped schema reference, When the user reads its index note, Then it
    describes the user's own configured folders or none, and mentions no developer tooling
  - [ ] Given a shipped FileClass, When metadata-menu reads it, Then it is a valid FileClass
  - [ ] Given a shipped file that names another artifact's folder (for example the schema
    index note naming the FileClasses and templates folders), When it is set up, Then it names
    the folders configured at that moment, not the defaults
  - [ ] Given every shipped file, When Story Forge checks for updates, Then it can tell from its
    own record — not from a marker inside the file — which shipped version wrote the file and
    whether the user has changed it since

#### Feature 6: First release, ready for submission

- **User Story:** As the maintainer, I want a first GitHub release that meets the Community
  Plugins rules, so that manual and BRAT installs work now and submission is a formality later.
- **Acceptance Criteria:**
  - [ ] Given the release, When it is published, Then its tag equals the manifest version
    without a `v` prefix, it carries `main.js`, `manifest.json` and `styles.css`, and
    `versions.json` maps it to its minimum Obsidian version
  - [ ] Given the release source, When the Community Plugins automated review rules
    (`eslint-plugin-obsidianmd` recommended) are run against it, Then they report no error
  - [ ] Given the repository root, When it is checked against the submission requirements, Then
    `README.md`, `LICENSE` and `manifest.json` meet them, including the README's statement on
    network use and on files written into the vault
  - [ ] Given a fresh vault, When the release is installed manually and with BRAT and setup is
    run, Then the result matches the primary journey

#### Feature 7: User documentation for setup and add-ons

- **User Story:** As a new novelist, I want the docs to tell me how to set up the story files and
  what metadata-menu and meta-bind add, so that I know what I gain by installing them (#19).
- **Acceptance Criteria:**
  - [ ] Given `docs/getting-started.md` and `docs/fileclasses.md`, When read, Then they describe
    the setup command instead of copying files from the test vault
  - [ ] Given `docs/installation.md`, When read, Then Community Plugins is the preferred install
    path and manual and BRAT installs point at a release that exists
  - [ ] Given `docs/optional-plugins.md`, When read, Then it states what metadata-menu and
    meta-bind add on top of the shipped files and exactly what is missing without them, and that
    no Story Forge feature requires either

### Should Have Features

- **Per-file choice in the update list.** The update view lists each updatable file so the user
  can leave one out.
- **Re-set-up of a missing file** from the same view that lists updates.

### Could Have Features

- A "show what changed" view for an edited file whose shipped version has an update.
- A Templater flavour of the templates.

### Won't Have (This Phase)

- **Automatic writes** on install, enable or update.
- **`Canon.base` / `Manuscript.base`** — the Anvil's built-in collections cover them, and
  `Canon.base` hardcodes the folder `30 Canon`; if wanted later they become catalog entries.
- **QuickAdd scripts, `dataview-views/`, schema `.json` copies** — QuickAdd-specific dev tooling.
- **Sample story content** (example characters, scenes).
- **Downloading artifacts at runtime** from GitHub.
- **Removing set-up files** on uninstall or on request.
- **Full #14** (folder scope for every view); this spec adds only the folder settings the
  setup needs.
- **The submission itself** on community.obsidian.md — the maintainer does it when ready.

## Detailed Feature Specifications

### Feature: Never overwrite, update only unedited files (Feature 4)

**Description:** Story Forge remembers, per set-up file, which shipped version it wrote and what
the file looked like when it wrote it. When the plugin ships a newer version, it compares the
file in the vault with what it wrote: unchanged files can be updated; changed, moved or deleted
files are left alone and reported. This is the same behaviour, wording and refusal prefix as
installing and updating curated collections from the repo (spec 008).

**User Flow:**
1. User updates Story Forge through Community Plugins.
2. System notices, when the settings are opened, that the shipped artifacts are newer than the
   set-up ones, and shows "updates available" with a count.
3. User selects update.
4. System replaces each unedited file, skips each edited one, and reports both in one notice.

**Business Rules:**
- Rule 1: Story Forge writes a file only in response to a user action in the setup or update
  flow.
- Rule 2: A file that Story Forge did not write is never changed, even if its content equals the
  shipped one; it is reported as already existing.
- Rule 3: A file that Story Forge wrote and the user changed is never changed by an update.
- Rule 4: A file is offered as an update only when the shipped version differs from the one
  Story Forge wrote.
- Rule 5: If writing one file fails, the others still proceed, and the failure is reported with
  the file's path; no record claims a file was written when it was not.
- Rule 6: The bookkeeping of what was written is operational state in the plugin directory,
  never in a note.

**Edge Cases:**
- The user set up files, then changed the templates folder setting → Expected: updates still
  target where the files were written; the dialog says the setting now points elsewhere.
- The user's FileClass in the target folder has the same name but different content → Expected:
  "Not installed: … already exists", untouched.
- The user deletes a set-up file → Expected: shown as missing; can be set up again; not
  recreated on its own.
- The vault is synced across devices and setup runs on two devices → Expected: the second
  device reports the files as already existing; nothing is duplicated or overwritten.
- Setup runs on mobile → Expected: works the same; these are plain notes.
- A target folder setting points into an excluded folder (default `00 Meta`) → Expected: the
  set-up notes are not treated as story entities.

## Success Metrics

### Key Performance Indicators

Story Forge collects no telemetry (Community Plugins policy), so success is measured by tests
and the live walk, not by usage data.

- **Adoption:** A fresh vault reaches a working editor (enum dropdowns on a new scene) using
  only the release and the docs — verified in the live walk.
- **Engagement:** Not measured (no telemetry).
- **Quality:** Zero overwritten user files across the setup and update tests; the shipped set is
  identical to the generated dev vault set (drift check passes in CI).
- **Business Impact:** The first release passes the automated review rules with zero errors.

### Tracking Requirements

| Event | Properties | Purpose |
|-------|------------|---------|
| Setup completed (notice) | files written, files skipped with reason | Lets the user — and the live walk — verify the outcome |
| Update completed (notice) | files updated, files not updated with reason | Same, for updates |
| Debug log line on refusal | path, reason | Troubleshooting, using the existing `[StoryForge]` log prefix |

No event leaves the user's device.

---

## Constraints and Assumptions

### Constraints

- A Community Plugins install ships only `main.js`, `manifest.json` and `styles.css`.
- Public Obsidian APIs only (standing project rule); the core Templates plugin's folder setting
  is not publicly readable, so Story Forge keeps its own templates folder setting.
- No runtime downloads of code-bearing content (Community Plugins policy).
- Story data stays in frontmatter; setup bookkeeping is operational state in the plugin
  directory (CLAUDE.md invariants).
- UI for the setup dialog and the update view goes through the mockup sign-off gate before any
  UI code.
- English for all shipped content.

### Assumptions

- Users who want enum dropdowns and section order accept FileClass notes in their vault.
- The core Templates plugin's `{{title}}` placeholder is the common denominator; Templater
  users can still insert the files.
- metadata-menu reads the shipped FileClasses as they are generated today.
- Bundling the artifacts grows `main.js` by well under 200 KB, which is unremarkable next to
  other plugins.

## Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Shipped set drifts from the dev vault | High | Medium | One source, check gate in CI fails on drift |
| A setup or update overwrites a user file | High | Low | Never-overwrite rules, tests per rule, mutation-checked |
| Reviewers object to vault writes | Medium | Low | Writes only on explicit user action, disclosed in the README |
| Template placeholder behaves differently in Templater | Low | Medium | Documented; Templater flavour is a Could |
| Folder setting changed after setup confuses updates | Medium | Medium | Updates track where files were written; the dialog says so |
| The automated review flags existing code | Medium | Medium | Run the rules early in the plan, fix before release |

## Open Questions

- [x] Which artifacts ship? — FileClasses, templates, schema reference (decided 2026-11-18).
- [x] When are they written? — Only on request; the first-run screen only points to it.
- [x] Where do they go? — One folder setting per set.
- [x] What happens on upgrade? — Like curated collections: update unedited, refuse edited.
- [x] Which template syntax? — Core Templates.
- [x] Release scope? — First release plus submission readiness; submission by the maintainer.
- [x] Docs half of #19? — In scope.
- [ ] Release version number — 0.3.0 assumed; confirm in the PLAN.

---

## Supporting Research

### Competitive Analysis

- **Fantasy Statblocks** keeps bundled defaults inside the plugin and never writes them to the
  vault, so updates are trivial — not an option here, because FileClasses and templates must be
  notes to be useful.
- **Longform, Kanban, Projects** create vault files only on an explicit command — the pattern we
  follow.
- **Excalidraw's script store and QuickAdd packages** let the user trigger installs and updates
  and show what will be written; QuickAdd refuses when files exist.
- **Templater, Metadata Menu, Periodic Notes** ship nothing and leave the folder to the user —
  this is the gap we are closing.
- **EngramQuest** (v1.11.1, commit 50a1af5; analysed 2026-11-11, see
  `docs/XDD/ideas/2026-11-11-ai-skills.md`) is the closest precedent:
  - It embeds its files in `main.js` at build time and writes them only from an explicit
    Settings → Install action.
  - Before writing it shows a per-file preview (create / replace / unchanged).
  - It rewrites paths at install time so they resolve from the vault root.
  - Adopted: all three (Features 1, 2 and 5).
  - Avoided: it detects earlier installs by a marker that only some file types carry, so
    upgrade detection likely fails for the rest; we keep a record with checksums of everything
    written instead (Feature 4, Feature 5).
  - Avoided: its partly minified source, which the Community Plugins obfuscation ban makes a
    review risk.
  - Its "replace" choice for edited files is not adopted: edited files are refused, as for
    curated collections (decided 2026-11-18).

### User Research

- The reader test of the new user docs (2026-11-17): the novelist persona stalled at "copy the
  templates from the test vault".
- `docs/gap-analysis.md` G25 and G14 (#27, #19) document the missing provision.

### Market Data

- Community Plugins downloads only the three release files (obsidianmd/obsidian-releases
  README). Typical `main.js` sizes: Templater 455 KB, Longform 1.2 MB, Fantasy Statblocks 1.6 MB.
