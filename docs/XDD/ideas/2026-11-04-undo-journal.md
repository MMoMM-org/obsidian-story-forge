# Undo journal for Story Forge's own writes (#17)

Brainstormed 2026-11-04 with the user. Closes gap **G22** in `docs/gap-analysis.md`, and is the
precondition for **#7** (Timeline drag) and **#8** (Plotgrid). Epic **#16**.

## Problem

Story Forge writes frontmatter from the Anvil editor, the Workbench inspector and the Kanban board.
None of these writes can be undone: Obsidian's editor undo does not cover `processFrontMatter` writes
made from a plugin view, and Cmd+Z in our views does nothing. A wrong write is unrecoverable, which is
why the interactive views keep retreating to read-only. The Phase 5 live walk (2026-11-02) confirmed
it: an Anvil field write could not be reverted.

## Invariants it must keep

- **Story data stays in frontmatter.** The journal never becomes a source of truth; it only records
  our own writes so they can be reversed. CLAUDE.md classes undo history as operational state that
  may live in the plugin directory.
- **A bare click must not mutate.** Undo and Redo are explicit actions: a keystroke, a command, or a
  button that names what it will do.
- **One fact, one place.** No mirror of the vault's frontmatter; only the values we changed.

## Approaches considered

- **A: the journal lives in the writer (chosen).** `commit` and `commitMany` in
  `src/inspector/frontmatterWriter.ts` record each successful write. Every current and future write
  path is covered automatically, including #7 and #8, and the recorded "before" value comes from the
  same write, so it can't be stale. A grep confirmed these are the only `processFrontMatter` call
  sites in `src/`, and nothing calls `vault.modify`/`process`/`create`/`rename`/`delete` on notes.
- **B: each surface records its own writes.** Better labels ("card moved"), but every new write path
  can forget it, which is exactly the gap behind #8. Rejected.
- **C: observe frontmatter changes.** We can't tell who changed what, and we would have to mirror all
  notes' frontmatter: the owning layer this project refuses. Rejected.

## Design

### 1. Entries and storage

- An entry is `{ id, at, files: [{ path, changes: [{ key, before, after, existed }] }] }`.
  `existed` tells "the key was absent" from "the key was empty"; undoing a key that did not exist
  deletes it rather than writing `null`.
- **One gesture is one entry.** A Kanban drag today issues several independent writes (each
  sibling's `order` via `renumber`, plus the dragged card's `status`/`order` through a debounced
  `commitMany`). The writer gains a grouping seam (a gesture id, or `begin`/`end`) so these become one
  entry spanning several files. The 50-entry limit counts gestures.
- `before` is read inside the `processFrontMatter` callback before assigning. `after` is the value
  **as it reads back** after serialization, not the value we intended to write, so YAML formatting
  never causes a false conflict. `undefined` counts as absent. Values compare with one deep
  `valuesEqual` (ordered arrays, plain objects).
- An entry is recorded only when the write succeeds. A validation rejection, a write error, an empty
  `commitMany`, or a write that changes nothing records no entry.
- **Stacks:** one global undo stack and one redo stack, 50 entries each. A new change clears redo.
- **Persistence:** `undo-journal.<deviceId>.json` in the plugin directory, written through the vault
  adapter, debounced after changes and flushed on unload. The device id is generated once and kept in the
  device's local storage (`app.saveLocalStorage`), never in the synced `data.json`, so two devices
  syncing `.obsidian` don't overwrite each other's history. A missing or unreadable file
  means an empty stack and a console warning; the plugin still starts. The file is size-capped; the
  oldest entries drop first, and a value over a size threshold is kept in memory but not persisted.
  A crash can lose the last unflushed entries, so some completed edits may not be undoable; that is
  accepted.
- **Setting:** "Keep undo history across restarts", **on by default**. Off means the stacks live only
  until the plugin reloads. The docs say the journal copies field values out of notes, and recommend
  excluding it from git.
- **Renames and deletes:** a renamed note's path is rewritten in both stacks. A deleted note's entries
  drop. A path that no longer resolves at undo time drops its entry with a notice.

### 2. Undo, redo and conflicts

- **Undo** takes the top entry and writes each field's `before` back (deleting a key that didn't
  exist), one write per file, files in sequence, through the writer with journaling off. The entry
  moves to the redo stack.
- **Conflict:** before writing, each field is compared with its `after`. If something else changed
  the field since (a hand edit, another plugin, sync), undo **still restores** `before`, and the
  redo entry records the value it actually found. The notice names the note, the field and what was
  overwritten, e.g. "status was 'dead', now 'alive' again. Cmd+Shift+Z restores 'dead'". Redo
  therefore brings back what the undo overwrote, so nothing is lost. A key deleted meanwhile counts as
  found-absent, and redo deletes it again.
- **Redo** mirrors undo, with the same conflict rule against `before`.
- **Pending work:** undo first flushes the Kanban handler's pending debounced writes. While a write is
  in flight on a target note, or a field in the Anvil editor or the Workbench holds unsaved text on a
  target note, undo does nothing and says "Save or discard your edit first". The draft is never
  discarded. The buttons stay enabled meanwhile, so the click explains itself rather than silently
  doing nothing.
- **Failures:** a write failure keeps the entry on top and notifies. A multi-file entry is not atomic:
  undo carries on with the remaining files and keeps a reduced entry for the files that failed, so a
  retry is possible.
- **After undo** the plugin does not navigate. A notice, and the Anvil's live region, name the change.
  The editor pane and the Workbench reseed from the file, so they show the restored value.
- **Value-level, not byte-level:** `processFrontMatter` re-serializes the YAML block, so undo restores
  values, not formatting, quoting or YAML comments.

### 3. Triggers and display

- **Keyboard:** the Anvil and Workbench views register Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z on their own
  `scope`, which Obsidian consults when that view is the active leaf. In a Markdown note, Cmd+Z stays
  Obsidian's own undo.
  - While the user is typing in a field (unsaved text), the keys pass through to that field's own text
  undo.
  - Once the field is saved, Cmd+Z undoes the Story Forge change **even with the cursor still in the
  field**. This avoids the trap where text undo makes the field look edited while the file keeps the
  new value.
- **Commands:** "Undo last Story Forge change" and "Redo last Story Forge change", with no default
  hotkey, so nothing shadows editor undo. The docs warn that binding them to Mod+Z globally would.
- **Buttons:** ↶ and ↷ on the right of the Anvil's tab strip, visible on every tab including Kanban,
  and in the Workbench header. They are disabled when the stack is empty. The tooltip says what would
  happen: "Undo: status in Mara Stoneway", or "Undo: 3 changes in 2 notes".
- **Mockup gate:** the HTML states go into the spec's mockups and need the user's sign-off before any
  UI code: the Anvil tab strip with enabled and disabled buttons, the Workbench header, a tooltip,
  the conflict notice and the "save or discard first" notice.

### 4. Tests

- **Writer:** one entry per successful call with correct `before`, read-back `after` and `existed`;
  none for a rejected, failed, empty or no-op write; a grouped gesture is one entry.
- **Stacks:** the 50 limit; redo cleared by a new change; undo and redo create no new entry; an
  undo, redo, undo sequence with an outside change in between follows the conflict rule each time.
- **Conflicts:** a changed field restores and puts the found value on redo; a deleted file drops the
  entry; a multi-file partial failure keeps a reduced entry; a rename rewrites paths on both stacks,
  including an entry sitting on redo.
- **Persistence:** a round-trip across reload; a corrupt or missing file gives an empty stack; the
  setting off persists nothing; the device-keyed file name.
- **Safety:** undo leaves the note body and unrelated frontmatter values unchanged; nothing is ever
  written to a note by the journal itself; undo refuses while a draft or in-flight write exists.
- **Keyboard:** Cmd+Z in the Anvil and Workbench triggers undo; it passes through while a field holds
  unsaved text; it undoes a saved field even with the cursor in it.
- **Live in Obsidian** (the mock can't show these): whether a view `scope` really takes Mod+Z ahead
  of Obsidian's global handling; undo of a Kanban drag; journal behaviour under Sync.

## Left to the SDD

- The grouping seam's exact shape (a gesture id or `begin`/`end`) and how a Kanban gesture closes,
  given its synchronous `renumber` writes and its debounced `commitMany`.
- The numbers for the journal's size cap and the per-value threshold.
- Scheduling the mockup sign-off before every UI task.

## Known limits

- Values are restored, not formatting.
- A wikilink stored in a journal value goes stale if its target is renamed, because Obsidian rewrites
  links in notes, not in our journal.
- The journal is per device: an edit made on one device can't be undone on another.

## Parking lot (not in this feature)

- A history list to pick an older change from.
- Per-surface labels such as "card moved".
- Timeline and Plotgrid undo: they arrive with #7 and #8 through the writer.
- Syncing the stack between devices.
