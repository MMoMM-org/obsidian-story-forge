---
title: "Undo journal — take back Story Forge's own writes"
status: completed
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
- [x] Every metric has corresponding tracking events *(see Success Metrics — deliberately no telemetry; verification is by acceptance criteria and a live-vault walk, as in specs 006, 007 and 008)*
- [x] No feature redundancy (check for duplicates)
- [x] No technical implementation details included
- [x] A new team member could understand this PRD

---

## Product Overview

### Vision

A writer can change a fact from any Story Forge view without fear, because the last change can always be taken back — and brought back again.

### Problem Statement

Story Forge writes frontmatter from three places: the Anvil's editor pane, the Workbench inspector, and the Kanban board. None of those writes can be undone.

Evidence:

1. **Obsidian's own undo does not reach them.** Cmd+Z in a note undoes typing in the note editor. A value written into frontmatter from a plugin view is outside that history. Confirmed live on 2026-11-02 (Phase 5 walk of spec 008): an Anvil field write could not be reverted.
2. **Cmd+Z in our views does nothing.** There is no command, no button and no key that reverses a Story Forge write.
3. **The cost has already been paid.** Plotgrid's click-to-toggle emptied five vault notes and was reverted to read-only (`docs/gap-analysis.md` §2.G, issue #8). Timeline drag was never enabled (#7). Every interactive view has retreated to read-only for the same reason: a wrong write is unrecoverable (epic #16).
4. **Spec 008 shipped without it, knowingly.** Its Won't Have list says an editor mistake "is corrected by retyping, not by undo", and its risk register carries the item as Medium impact.

Consequence of not solving this: the editor stays a place where a slip of the finger changes canon with no way back, and #7 and #8 stay blocked.

This closes gap **G22** (issue #17). `docs/gap-analysis.md` §1.1 settles why it is allowed: Story Forge's undo history is **operational state** and may live in the plugin directory, while story data stays in frontmatter.

### Value Proposition

- **Take it back.** Every change Story Forge makes can be undone with the keystroke writers already know, and redone.
- **Nothing is lost, even when the file changed meanwhile.** If something else edited the same field, undo still works, and redo brings back the value it overwrote.
- **No ownership.** The journal records only what Story Forge itself changed. It is never a source of truth, never a copy of the vault, and no note depends on it. Delete it and every fact still reads correctly.
- **It unlocks the interactive tier.** Timeline drag (#7) and a Plotgrid write affordance (#8) can return because a wrong write is no longer final.

### Terms used in this document

| Term | Meaning |
|---|---|
| **Anvil / Workbench / Kanban** | Story Forge's main-window interface (Codex, Timeline, Plotgrid, Plotlines, Board tabs), its sidebar interface, and the Board tab's status board. Defined in spec 008. |
| **Change** | One field of one note going from one value to another because Story Forge wrote it. |
| **Step** | One undoable unit: everything a single user gesture changed, in one or several notes. Dragging a Kanban card is one step even though it renumbers its neighbours. |
| **Undo stack / redo stack** | The ordered steps that can be undone / re-done. One of each, shared by all surfaces. |
| **Journal** | The recorded steps (both stacks), kept as operational state in the plugin's own folder. |
| **Conflict** | A field's current value is not the value Story Forge last wrote there — someone or something else changed it since. |
| **Draft** | Text typed into an editor or inspector field and not yet saved. |
| **Plain Property** | A frontmatter value a human could have typed and the core Properties UI can edit (spec 008). Undo writes nothing else. |

## User Personas

### Primary Persona: the solo novelist who edits canon from the views

- **Demographics:** Writes long-form fiction in Obsidian with one canonical note per entity; comfortable in YAML but not a developer. Uses the Anvil's Codex editor, the Workbench inspector and the Kanban board daily.
- **Goals:** Correct a fact where they noticed it was wrong, and move scenes and cards around freely, without a fear of silently damaging canon.
- **Pain Points:** One wrong click or mistyped value changes a note and there is no way back except remembering the old value. Cmd+Z does nothing, or does something unrelated in a note. They stopped using the interactive views for anything important.

### Secondary Personas

**The tinkerer / automator.** Edits notes by hand, with scripts, and with other plugins, often at the same time as Story Forge is open. Needs undo to be honest when the file moved on, and never to erase their work.

**The multi-device writer.** Uses the vault on a laptop and a tablet through a sync service. Needs one device's history to stay out of the other's way.

## User Journey Maps

### Primary User Journey: change it, regret it, undo it

1. **Awareness:** In the Codex editor the writer sets Mara Stoneway's `status` to `dead`, then realises it was the wrong Mara.
2. **Consideration:** Today they can retype the old value if they remember it, or dig through file history. They do not trust the views enough to try anything bolder.
3. **Adoption:** They press Cmd+Z in the Anvil. Nothing needs setting up and no new concept is learned; it is the key they already use.
4. **Usage:** The field returns to `alive`. A notice reads "Undo: status in Mara Stoneway". The Workbench, if open on that note, shows `alive` too. A mistaken undo is repaired with Cmd+Shift+Z.
5. **Retention:** They start dragging Kanban cards and trying changes freely, because every one can be taken back. The journal is still there after they restart Obsidian.

### Secondary User Journeys

**Undo after an outside edit.** The tinkerer sets `status` to `alive` in Story Forge, then a script changes it to `missing`. Undo restores the pre-Story-Forge `dead` and says so: "status was 'dead', now 'alive' again". The notice also says how to get `missing` back. Redo restores `missing`. Nothing was lost.

**Undo a drag.** The novelist drags a scene card from "Draft" to "Revised", which also renumbers four neighbours in two notes. One Cmd+Z puts all of them back.

**Typing, not undoing.** The novelist is mid-sentence in an Anvil field. Cmd+Z undoes their typing, as in any text field. Story Forge steps aside until the text is saved.

**The sync user.** Opens the vault on a second device. The first device's history is not there to be applied to the wrong state, and the second device keeps its own.

## Feature Requirements

### Must Have Features

The minimum for "every write a view makes can be undone" (epic #16, "Done when").

#### Feature F1: Every Story Forge write is recorded as an undoable step

- **User Story:** As a novelist, I want everything Story Forge changes in my notes to be undoable, so that I never have to remember which surface was safe.
- **Acceptance Criteria:**
  - [ ] Given a field is saved from the Anvil editor, the Workbench inspector, or a Kanban gesture, When the write succeeds, Then exactly one step is added to the undo stack
  - [ ] Given a step is recorded, When it is examined, Then it identifies each note and field changed, the value before, the value after, and whether the field existed before
  - [ ] Given a field that did not exist before the write, When the step is later undone, Then the field is removed, not written as empty
  - [ ] Given a field that existed and was empty, When the step is later undone, Then the field is restored as empty, not removed
  - [ ] Given a Kanban card drag that changes its status and renumbers neighbours in several notes, When it completes, Then it is **one** step, not several
  - [ ] Given a write is rejected by validation, fails, has nothing to write, or leaves the value unchanged, When it finishes, Then no step is recorded
  - [ ] Given the value written is stored by Obsidian in a different form than typed (YAML quoting, spacing), When the step is recorded, Then undo and conflict checks use the form actually stored in the file, so formatting alone never counts as a conflict
  - [ ] Given any Story Forge write path that exists now or is added later, When it writes frontmatter, Then it is recorded without per-surface extra work *(verified by a test that every write path in the plugin produces a step — see Success Metrics)*

#### Feature F2: Undo and redo with bounded stacks

- **User Story:** As a novelist, I want to undo my last change and redo it if I was wrong, so that I can try things.
- **Acceptance Criteria:**
  - [ ] Given a step on the undo stack, When the user undoes, Then each field in that step returns to its earlier value (or is removed if it did not exist), the step moves to the redo stack, and no new step is recorded
  - [ ] Given a step on the redo stack, When the user redoes, Then the step's changes are re-applied, the step returns to the undo stack, and no new step is recorded
  - [ ] Given a step spans several notes, When it is undone, Then all of its notes are restored, one note at a time
  - [ ] Given a redo stack with entries, When Story Forge makes any new change, Then the redo stack is cleared
  - [ ] Given 50 steps on the undo stack, When a 51st is recorded, Then the oldest is dropped and the 50 most recent remain
  - [ ] Given the redo stack holds 50 steps, When another step is moved onto it, Then the oldest redo step is dropped
  - [ ] Given a step has been undone, When the user undoes again, Then the next-older step is undone; and Given an empty stack, When the user undoes or redoes, Then a "Nothing to undo" or "Nothing to redo" notice appears and nothing is written
  - [ ] Given an undo, When it completes, Then the note body and every frontmatter value outside the step are unchanged
  - [ ] Given a write fails during undo, When it is reported, Then the step stays on top of its stack and the user is told
  - [ ] Given a multi-note step where one note fails, When undo runs, Then the remaining notes are still restored, and a reduced step for the failed notes stays available so the user can retry

#### Feature F3: Conflicts restore anyway and stay recoverable

- **User Story:** As a tinkerer, I want undo to work even if something else touched the field, without losing what was there, so that I can trust it next to scripts and sync.
- **Acceptance Criteria:**
  - [ ] Given a field's current value differs from the value Story Forge last wrote, When the user undoes, Then the earlier value is still restored
  - [ ] Given that conflict, When undo completes, Then redo restores the value that undo found and overwrote — not the value Story Forge originally wrote
  - [ ] Given that conflict, When undo completes, Then the notice names the note, the field, and both values, and says which operation restores the overwritten one, e.g. "status was 'dead', now 'alive' again. Redo restores 'dead'" *(wording illustrative; it must carry the note, field and values; it names no keyboard shortcut, because Cmd+Shift+Z is the note editor's own redo outside the Anvil and Workbench; the signed-off wording is in `mockups.html`)*
  - [ ] Given a field was removed by someone else before undo, When the user undoes, Then the earlier value is restored and redo removes the field again
  - [ ] Given a conflict on redo, When the user redoes, Then the same rule applies against the redo step's recorded values
  - [ ] Given undo, redo, undo with an outside edit in between, When each runs, Then each follows the conflict rule and no value is lost
  - [ ] Given a field has no conflict, When the user undoes, Then the notice is the plain "Undo: …" notice of F4, with no conflict wording

#### Feature F4: A notice after every undo and redo

- **User Story:** As a novelist, I want to be told what an undo changed, so that I never wonder what just happened.
- **Acceptance Criteria:**
  - [ ] Given any successful undo, When it completes, Then a notice names the change, e.g. "Undo: status in Mara Stoneway"
  - [ ] Given any successful redo, When it completes, Then a notice names the change, e.g. "Redo: status in Mara Stoneway"
  - [ ] Given a step touching several fields or notes, When the notice shows, Then it summarises the extent, e.g. "Undo: 3 changes in 2 notes"
  - [ ] Given the Anvil is open, When an undo or redo completes, Then the Anvil's live region announces the same text, so a screen reader user hears it
  - [ ] Given a conflict, a refusal (F8), a failure, an empty stack or a vanished note, When it happens, Then the notice states which of these it is and what the user can do next
  - [ ] Given an undo or redo, When it completes, Then the plugin does **not** navigate, open or focus any note or view

#### Feature F5: Keyboard and command triggers

- **User Story:** As a novelist, I want Cmd/Ctrl+Z to undo in the Story Forge views the way it does everywhere else, without breaking text undo or note undo.
- **Acceptance Criteria:**
  - [ ] Given the Anvil or the Workbench is the active view, When the user presses Cmd/Ctrl+Z, Then the most recent step is undone
  - [ ] Given the Anvil or the Workbench is the active view, When the user presses Cmd/Ctrl+Shift+Z, Then the most recent undone step is redone
  - [ ] Given a field in the Anvil editor or the Workbench holds a draft, When the user presses Cmd/Ctrl+Z or Cmd/Ctrl+Shift+Z, Then the key does **text** undo/redo inside that field and Story Forge's journal is untouched
  - [ ] Given a field has been saved and the cursor is still in it, When the user presses Cmd/Ctrl+Z, Then the Story Forge change is undone (not the field's text history), so the field never looks edited while the file holds a different value
  - [ ] Given a Markdown note is the active view, When the user presses Cmd/Ctrl+Z, Then Obsidian's own editor undo runs and Story Forge does nothing
  - [ ] Given the command palette, When the user searches "last change", Then **Undo last change** and **Redo last change** are listed (the palette shows them as "Story Forge: Undo last change")
  - [ ] Given a fresh install, When hotkeys are inspected, Then neither command has a default hotkey and no Ctrl+Y binding exists; and Given the user binds a hotkey to either command, Then it works from any view
  - [ ] Given the commands, When the stack is empty, Then they give the "Nothing to undo / redo" notice rather than fail silently

#### Feature F6: Undo and redo buttons

- **User Story:** As a novelist who prefers the mouse — or who wants to see that undo exists — I want visible buttons that say what they will do.
- **Acceptance Criteria:**
  - [ ] Given the Anvil, When any tab is shown (Codex, Timeline, Plotgrid, Plotlines, Board), Then ↶ and ↷ are visible at the right of the tab strip
  - [ ] Given the Workbench, When it is open, Then ↶ and ↷ are visible in its header
  - [ ] Given the undo stack is empty, When the buttons render, Then ↶ is disabled; and Given the redo stack is empty, Then ↷ is disabled
  - [ ] Given a step is on top of a stack, When the pointer rests on its button, Then the tooltip says what a click will do, e.g. "Undo: status in Mara Stoneway" or "Undo: 3 changes in 2 notes"
  - [ ] Given a button is disabled, When it is inspected, Then it is exposed as disabled to assistive technology, and its tooltip says there is nothing to undo or redo
  - [ ] Given a draft or write is pending on a target note (F8), When the buttons render, Then they stay **enabled**, so a click can explain why nothing happened
  - [ ] Given any stack change, When it happens, Then both buttons' state and tooltips update in every open view without a reload
  - [ ] Given the buttons are used, When they are clicked, Then the effect is identical to the keyboard and command triggers

#### Feature F7: History survives a restart

- **User Story:** As a novelist, I want yesterday's last change to still be undoable after I reopen Obsidian, so that quitting is not a point of no return.
- **Acceptance Criteria:**
  - [ ] Given a fresh install, When settings are opened, Then **Keep undo history across restarts** is on
  - [ ] Given the setting is on, When Obsidian is restarted or the plugin reloaded, Then both stacks come back with the same steps in the same order
  - [ ] Given the setting is off, When Obsidian is restarted, Then both stacks start empty and nothing was persisted
  - [ ] Given the setting is turned off, When it is applied, Then any stored history is deleted
  - [ ] Given the stored history is missing, unreadable or corrupt, When the plugin starts, Then the stacks start empty, a warning is logged, and the plugin starts normally
  - [ ] Given the vault is synced between two devices, When each device records steps, Then each keeps its own history and neither overwrites the other's
  - [ ] Given the history grows large, When it is stored, Then it stays under a fixed size limit by dropping the oldest steps first, and a single very large value may be kept for this session but not stored
  - [ ] Given a crash, When the plugin restarts, Then at most the most recent steps may be missing, and nothing else is affected *(accepted limitation)*
  - [ ] Given the setting's description, When the user reads it, Then it says the history contains copies of field values from their notes

#### Feature F8: Undo waits for unsaved or in-flight work

- **User Story:** As a novelist, I want undo never to discard text I am typing or collide with a save in progress.
- **Acceptance Criteria:**
  - [ ] Given a target note of the step has a draft in the Anvil editor or the Workbench, When the user undoes or redoes, Then nothing is written, the draft is untouched, and the notice says "Save your edit first" with the note name
  - [ ] Given a write is still in flight on a target note, When the user undoes or redoes, Then the same refusal and notice apply
  - [ ] Given a draft exists on a note that is **not** a target of the step, When the user undoes, Then the undo proceeds
  - [ ] Given a Kanban gesture whose writes have not all landed yet, When the user undoes, Then those writes finish first and are included in the step being undone
  - [ ] Given the refusal, When the draft is saved or the field returns to its saved value and the user undoes again, Then the undo works
  - [ ] Given a refusal, When it happens, Then the stacks are unchanged

#### Feature F9: Every surface shows the result

- **User Story:** As a novelist, I want an undo to show wherever I am looking, so that I never see one value in the Workbench and another in the file.
- **Acceptance Criteria:**
  - [ ] Given a note is open in the Anvil editor, When its field is undone or redone, Then the editor shows the restored value
  - [ ] Given a note is shown in the Workbench, When its field is undone or redone, Then the Workbench shows the restored value
  - [ ] Given the Kanban board, Codex grid or any other Story Forge view lists the note, When its field is undone, Then that view reflects it
  - [ ] Given a Workbench field shows a saved value and the file then changes from outside the inspector (undo, redo, a hand edit, another plugin), When the change lands, Then the field shows the file's current value, not the older text that was saved earlier; and its status does not claim the stale text is saved *(closes the stale-draft behaviour found in research; relates to issue #30)*
  - [ ] Given a Workbench field holds a draft and the file changes underneath, When the change lands, Then that field keeps the user's text, and the other fields update
  - [ ] Given an edit that is abandoned rather than saved, When the field is discarded, Then it shows the file's current value, including any change that arrived while it was dirty

#### Feature F10: Renamed, moved and deleted notes

- **User Story:** As a novelist, I want undo to keep working after I rename or move a note, and to say plainly when a note is gone.
- **Acceptance Criteria:**
  - [ ] Given a note is renamed or moved in the vault, When a step that includes it is undone or redone, Then the change is applied to the renamed note, whichever stack the step is on
  - [ ] Given a note is deleted, When the journal is next consulted, Then steps that touched only that note are dropped; and Given a step touched that note and others, Then the others stay undoable
  - [ ] Given a note cannot be found when its step is undone, When undo runs, Then the step is dropped, a notice says so, and undo does not stop at an unrelated error
  - [ ] Given the journal never creates, renames or deletes notes, When any undo or redo runs, Then only frontmatter values of existing notes are written

### Should Have Features

- **User-facing documentation.** The docs state: values are restored, formatting is not; the history copies field values and should be excluded from version control; the history is per device; and **binding either command to Cmd/Ctrl+Z globally would shadow Obsidian's editor undo and redo**, so no default is shipped.
- **Wikilink staleness is documented.** A stored value that is a link goes stale in the history if its target is later renamed, because Obsidian updates links in notes, not in the history.
- **Manual walk recorded.** A live-vault walk (undo of a Kanban drag, undo with an outside edit, restart, Sync) is logged in `docs/live-testing.md`, as for earlier milestones.

### Could Have Features

- **Clear undo history** button in settings, for a writer who wants the stored copies gone without turning the setting off. *(Kept at PRD approval; shipped.)*

### Won't Have (This Phase)

- **A history list** to pick an older change from.
- **Per-surface labels** such as "card moved". Labels name the field and note, or the extent, only.
- **Undo for Timeline drag and Plotgrid** (#7, #8). They get it by writing through the same seam when they land; this spec ships no UI for them.
- **Syncing history between devices.** An edit on one device cannot be undone on another.
- **Byte-level restore.** Formatting, quoting and YAML comments are not restored; values are.
- **Undo of file create, rename or delete.** Story Forge never creates or deletes notes, so there is nothing to reverse (Storyline does this; see Competitive Analysis).
- **Undoing changes Story Forge did not make** — hand edits, other plugins, Obsidian's own editor.
- **A built-in Ctrl+Y binding** or any default hotkey for the commands.
- **Telemetry of any kind.**

## Detailed Feature Specifications

### Feature: F3 + F8 — conflicts, and waiting for unsaved work

**Description:** Undo is a promise that the previous value comes back. Two situations can make that promise unsafe: the field has moved on since Story Forge wrote it (conflict), or the user has typed something not yet saved that undo would trample (pending work). The rules below make the first recoverable and the second impossible.

**User Flow:**

1. User sets `status` of Mara Stoneway to `alive` in the Anvil editor (it was `dead`).
2. A script then sets it to `missing`.
3. User presses Cmd+Z in the Anvil.
4. System finds `missing`, not `alive`, restores `dead`, and puts `missing` on the redo stack.
5. System shows a notice naming the note, the field, both values and which command restores the overwritten value.
6. User presses Cmd+Shift+Z; System writes `missing` back, then shows "Redo: status in Mara Stoneway".

**Business Rules:**

- Rule 1: Undo always restores the earlier value, even on a conflict. It never refuses because of one.
- Rule 2: What redo restores is whatever undo overwrote. A value is never lost by an undo.
- Rule 3: A field's value is compared in the form stored in the file, not the form typed.
- Rule 4: "Draft" and "write in flight" are checked only for the note(s) the step touches.
- Rule 5: A draft is never discarded, overwritten or saved on the user's behalf by undo.
- Rule 6: A refused or failed undo leaves both stacks as they were (except the reduced step in F2).
- Rule 7: Undo and redo never create a step of their own.
- Rule 8: A bare click never undoes; only a key, a command, or a button that names the change.

**Edge Cases:**

- Several fields in one step, only some in conflict → Expected: all are restored; the notice names the conflicting ones.
- The field was changed back by hand to exactly what Story Forge wrote → Expected: no conflict.
- Undo pressed twice quickly → Expected: the second press undoes the next step after the first finished; the writes do not interleave.
- A draft sits on a note that the step does not touch → Expected: undo proceeds (F8).
- Two Story Forge views both hold the target note → Expected: both show the restored value (F9).

## Success Metrics

### Key Performance Indicators

This is a local, single-user plugin with **no telemetry** (see `PRIVACY.md`). Adoption and business impact have no meaning here and are not invented. Success is observable behaviour:

- **Coverage:** every place Story Forge writes frontmatter produces an undoable step, shown by a test that fails when a write path does not (so #7 and #8 cannot forget it).
- **Correctness:** every acceptance criterion above has a passing automated test, and each new test has been mutation-checked.
- **Safety:** undo never changes a note body or an unrelated value, never discards a draft, and never creates, renames or deletes a note.
- **Recoverability:** after any undo, redo restores exactly what undo overwrote, including after a conflict.
- **Visibility:** after an undo, the Anvil, the Workbench and the file agree on every field.
- **Unlocking:** at least one interactive view can leave read-only once this ships (the follow-up is #7 or #8, not this spec).
- **Live-vault walk:** the manual walk in Should Have passes on `test/StoryForge/` and is recorded in `docs/live-testing.md`.

### Tracking Requirements

| Event | Properties | Purpose |
|-------|------------|---------|
| *(none)* | — | **No events are tracked.** The plugin sends nothing anywhere. Verification is by automated acceptance tests plus a manual walk. |

---

## Constraints and Assumptions

### Constraints

- **Story data stays in frontmatter.** The journal is operational state in the plugin's folder (CLAUDE.md invariant 2). No note, view or feature may depend on it to read story data.
- **Frontmatter is only ever written as plain Properties,** by the same route as every other Story Forge write.
- **A bare click must not mutate.** Undo and redo are explicit: a key, a command, or a button.
- **One fact, one place.** The journal holds only values Story Forge changed, not a copy of any note's frontmatter.
- **Values are restored, not formatting.** Obsidian re-writes the frontmatter block on every write, so quoting, spacing and YAML comments cannot be restored.
- **Limits:** 50 steps per stack; a gesture counts as one.
- **Per device:** history is not shared across devices.
- **Mockup gate.** Every UI state (button strip, Workbench header, tooltips, conflict notice, "save your edit first" notice) is drawn in this spec's `mockups.html` and signed off **before** any UI code (CLAUDE.md; G23). Passed 2026-11-06.
- **Storyline is the reference model.** Deviations are recorded below and in the spec's decision log.
- **English for all committed content**; UI text follows the Obsidian sentence-case rule.
- **Left to the SDD:** the numeric size limits for the stored history and for a single value, and the technical shape of grouping a gesture into one step.

### Assumptions

- The writer wants Cmd/Ctrl+Z, not a new gesture, as the primary trigger.
- Most undos are of the last one or two changes; a 50-step window is ample. A history list is not needed for that.
- Plugin-directory files survive restarts and are not wiped by the vault's own tooling.
- Two devices syncing the plugin directory is common enough to design for (the primary risk to the history).
- Story Forge's own writes are the only ones the journal needs to know about; other tools' edits are discovered by comparison at undo time.

## Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Obsidian's global Cmd+Z takes the key before the Story Forge view does, so the keyboard trigger fails | High | Medium | Settle it in an early live spike in the plan (Open Questions). Commands and buttons work regardless, so undo is never unreachable. |
| Undo overwrites a value someone else wrote | High | Medium | Conflict rule: undo restores anyway, redo recovers the overwritten value, and the notice says exactly what happened (F3). |
| Undo trampling a draft or a write in progress | High | Medium | F8: undo refuses, names why, never touches the draft. |
| Two devices overwrite each other's history through Sync | Medium | Medium | History is kept per device (F7). Behaviour under real Sync is checked in the live walk. |
| The history file leaks field values into version control or backups | Medium | Medium | The setting describes what it contains; docs recommend excluding it; the setting can be turned off, which deletes it (F7). |
| A new write path (#7, #8) bypasses recording | High | Medium | Coverage test (F1, Success Metrics) fails if a write path is not recorded. |
| The Workbench change (F9) regresses editing, e.g. overwriting text being typed | Medium | Low | Draft-keeps-text acceptance criteria; the stale-state fix is scoped to saved or clean fields only. |
| A crash loses the latest unsaved steps | Low | Low | Accepted and documented (F7). |
| Wikilink values go stale in the history after a rename | Low | Medium | Accepted and documented (Should Have). |
| Cmd+Z in a field is ambiguous (text undo vs file undo) and surprises the writer | Medium | Medium | Rule fixed in F5: draft means text undo; saved means Story Forge undo. Verified in the live walk. |

## Open Questions

- [ ] **Does a view's own key scope really receive Cmd/Ctrl+Z ahead of Obsidian's global handling?** To be settled by an early live spike in the plan, before building F5. If it does not, F5 falls back to commands and buttons only and the keyboard decision is re-opened.
- [ ] **How does the history behave under real Obsidian Sync and other sync tools?** Per-device files are the design; confirmation is a live check, not a desk decision.
- [ ] **Do any other Story Forge surfaces than the three listed write frontmatter today?** The design's search found none; the coverage test in F1 is the confirmation.
- [x] **Resolved: persistence defaults on.** User's choice, deviating from Storyline's in-memory stacks.
- [x] **Resolved: a notice after every undo and redo,** as Storyline does, not only on conflict.
- [x] **Resolved: no built-in Ctrl+Y.** The commands have no default hotkey; the docs warn that a global binding shadows editor undo.
- [x] **Resolved: undo waits only on the step's own notes.**
- [x] **Resolved: the Workbench stale-draft behaviour is fixed here,** since undo's result must be visible on every surface (closes #30, which has the same cause; to be confirmed in the live walk).

---

## Supporting Research

### Competitive Analysis

**Storyline** (MIT) is the reference model (CLAUDE.md). Read from `services/UndoManager.ts`, `main.ts` and `views/BoardView.ts` on the main branch of `pixerojan/obsidian-storyline`. What it does, and what we do with it:

| Storyline behaviour | Ours | Reason |
|---|---|---|
| 50-entry undo and redo stacks; a new action clears redo | **Adopt** | Proven size; clearing redo is the expected model. |
| Stacks in memory only | **Deviate** — persisted across restarts, on by default, with a setting to switch off | User's choice. A restart is not a reason to lose the safety net. Cost: the history holds field values (documented). |
| A human-readable label per entry | **Adopt** | Names the note and field, or the extent. |
| "Undo: <label>" and "Nothing to undo" notices | **Adopt** — after every undo and redo | Writers should always see what changed. |
| No check against what the file now holds | **Deviate** — restore anyway, put the overwritten value on redo, and say so | Nothing is lost when a script, hand edit or sync moves the field first. |
| One file per entry, no grouping | **Deviate** — a gesture is one step across several notes | A Kanban drag changes several notes; undoing half of it would be wrong. |
| Also undoes file create and delete | **Reject** | Story Forge never creates or deletes notes. |
| A global key handler routes Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z and Ctrl+Y whenever a Storyline view is active and focus is not in a text field | **Adopt** (global capture-phase handler, ADR-37) **+ deviate** (a saved field with the caret still in it gets journal undo) | The saved-field rule avoids the trap where text undo makes a field look edited while the file keeps the new value. Ctrl+Y is rejected (next row). |
| Ctrl+Y for redo | **Reject** | Commands carry no default hotkey; the docs explain the shadowing risk. |
| Commands "Undo last scene change" / "Redo last scene change" | **Adopt** as "Undo / Redo last change" | Same shape; broader scope. |
| ↶ ↷ buttons in the Board toolbar, tooltip "Undo (Ctrl+Z)" | **Adopt** and extend — on every Anvil tab and in the Workbench; the tooltip names the change; disabled when empty | The button states what it will do. |

Obsidian's own undo, and the Properties UI, do not cover frontmatter written by a plugin view; that is the gap.

### User Research

No formal study. The requirements come from the live walk of spec 008 (2026-11-02), the Plotgrid data-loss incident (issue #8), the gap audit (`docs/gap-analysis.md`, G22; issue #17; epic #16), and the brainstormed design `docs/XDD/ideas/2026-11-04-undo-journal.md`. Code research found the Workbench inspector keeps showing an older saved draft when the file changes from outside, which would hide an undo; F9 closes that.

### Market Data

Not applicable — a personal plugin with no commercial dimension. The one relevant comparison is Storyline's undo, covered above.
