# Commands

Story Forge adds these commands to the command palette (Ctrl+P, or Cmd+P on macOS). In the palette
each name is prefixed with "Story Forge:". None of them has a default hotkey; you can assign one
in **Settings › Hotkeys**.

## Commands

| Command | What it does | Default hotkey |
|---------|--------------|----------------|
| Open Workbench | Opens the Workbench in the sidebar. | none |
| Open Anvil | Opens the Anvil in the main area, on the Codex tab. If the Anvil is already open, it is shown instead of opening a second one. | none |
| Open Timeline | Opens the Anvil on the Timeline tab. | none |
| Open Plotlines | Opens the Anvil on the Plotlines tab. | none |
| Open Kanban | Opens the Anvil on the Kanban tab. | none |
| Open Plotgrid | Opens the Anvil on the Plotgrid tab. | none |
| Browse collections from the repo | Opens **Collections from the repo**, the bundled catalog. See [The Library](library.md#browsing-the-repo). | none |
| Undo last change | Undoes the last field change Story Forge made to your notes. See [Undo](undo.md). | none |
| Redo last change | Redoes the last change you undid. | none |
| *Your collection's command name* | Opens the Workbench on that collection. Only present for Dataview and DataviewJS collections where you turned on **Add to command palette**. | none |

The ribbon icon **Story Forge: open Workbench** does the same as **Open Workbench**.

## Notes

- **Undo keys.** While the Anvil or the Workbench is the active view, Ctrl+Z (Cmd+Z on macOS)
  undoes Story Forge's last change and Ctrl+Shift+Z (Cmd+Shift+Z) redoes it. In a text field you
  are typing in, the keys undo your typing instead. In a normal note they do Obsidian's own undo.
  These keys are built in and are not the hotkeys of the two commands.
- **Collection commands.** Turn them on per collection in **Settings › Story Forge › Library ›
  Configure › Add to command palette**, and set the **Command name** there. Removing the
  collection removes its command. If a command's collection no longer exists, running it shows
  "This Story Forge view no longer exists."
- **Hotkeys survive.** The Timeline, Plotlines, Kanban and Plotgrid commands are kept so that
  hotkeys you assigned in earlier versions still work. They all open the one Anvil.
