# Undo

Story Forge keeps an undo history of the field changes it writes to your notes. It is separate
from Obsidian's own undo in the note editor.

## Undo and redo

You can undo and redo in three ways:

- **Buttons:** ↶ and ↷ in the Anvil header and in the Workbench header. Hover over a button to
  see what it will undo, for example "Undo: status in Scene 1". When there is nothing to take
  back, it says "Nothing to undo".
- **Keys:** Cmd/Ctrl+Z to undo and Cmd/Ctrl+Shift+Z to redo, while the Anvil or the Workbench
  is the active view. While you are typing in a text field, these keys undo your typing in that
  field instead.
- **Command palette:** **Story Forge: Undo last change** and **Story Forge: Redo last change**.

After each undo or redo, a notice says what changed.

If you have an edit in a field that isn't saved yet, Story Forge asks you to save it first:
"Save your edit first".

**No default hotkey.** The two commands ship without one. If you bind a command to Cmd/Ctrl+Z
globally, it also takes over Obsidian's editor undo and redo, so only do that if you want it.

## What is undone

- **Only Story Forge's own writes are undone.** That means changes from the Anvil's editor
  pane, the Workbench's edit mode and moves on the Board. A Board move that also renumbers
  other cards is one step. Hand edits in the note, scripts, other plugins and sync changes are
  not undone; use the editor's own undo for those.
- **Values are restored, not formatting.** Undo puts the earlier value back. It does not
  restore how the frontmatter was laid out.
- **Changes made elsewhere since.** If a field was changed elsewhere since, undo still restores
  the earlier value, and redo brings back the value it replaced. The notice tells you when this
  happens.
- **Renamed and deleted notes.** The history follows a note that is renamed. If a note is
  deleted, its changes are dropped from the history.
- **Links go stale.** A link stored in the history (a `[[wikilink]]` value) still points at the
  old name if its target is renamed afterwards.

## Where the history is stored

- **The history holds copies of field values from your notes.** It keeps up to 50 undo and 50
  redo steps.
- It is stored in `undo-journal.json` in the plugin folder inside your vault's config folder,
  usually `.obsidian/plugins/story-forge/undo-journal.json`.
- **Keep that file out of git**, for example by adding
  `.obsidian/plugins/story-forge/undo-journal.json` to your `.gitignore`.
- **The history is meant to stay on one device.** Obsidian Sync is not expected to transfer
  it, but this has not been verified yet. Other sync tools that copy the plugin folder may copy
  it. If you sync that folder, exclude the file.

## Settings

Under **Settings → Story Forge → Behaviour → Undo history**:

- **Keep undo history across restarts** (on by default) stores the history in the file above,
  so you can still undo after restarting Obsidian. Turning it off deletes the stored file.
- **Clear undo history** empties undo and redo and deletes the stored history. The notice
  "Undo history cleared" confirms it.

Neither setting changes your notes. See [Configuration](configuration.md) for every setting.
