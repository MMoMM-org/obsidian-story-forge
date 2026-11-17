# The Workbench

The Workbench is Story Forge's sidebar. It follows the note you have open and shows that
note's story context: its facts and the entities it links to. Its tabs are **Codex**,
**Navigator**, and one tab for each collection you put there.

<!-- screenshot: the Workbench showing a scene's context in the Codex tab -->

## Opening the Workbench

Select the book icon in the left ribbon (**Story Forge: open Workbench**), or run
**Story Forge: Open Workbench** from the command palette. It opens in the right sidebar.

The header shows the note's name and its entity type, for example `character` or `scene`.
Next to it are these buttons:

- **↶ ↷** undo and redo the last change Story Forge made. See [Undo](undo.md).
- **📌 Pin Workbench to current note** keeps the Workbench on this note while you open other
  notes. While pinned and looking at a different note, it says "Pinned — not following the
  active note." Select the pin again to resume following.
- **✎ Toggle edit mode** switches the Codex tab between reading and editing. See below.

## Codex tab

The Codex tab shows the current note as a story entity. What you see depends on the type. A
scene, for example, shows its facts, point of view, characters, location, plotlines and
reading order. A character shows its relationships and the scenes it appears in. Links to
characters, locations, objects and lore are grouped by collection, using the collections whose
Workbench switch is on in the [Library](library.md). Turn a collection's Workbench switch
off, and its links are not shown here.

**Following links.** A click on a linked entity follows the **Link click action** setting.
With the default, **Inspect the linked note (show it in place)**, the Workbench shows that
entity right here in the sidebar:

- The Workbench stops following the active note while you browse. A line at the top shows
  where you came from.
- **‹ Back** returns to the previous note. When you're back where you started, the Workbench
  follows the active note again.
- **⤷ Open note** opens the note you're looking at in the editor.

With **Open in editor**, a click opens the linked note itself in Obsidian's note editor.
Cmd/Ctrl-click does the other one. Right-click a link for Obsidian's file menu.

**Editing.** Turn on edit mode with ✎ to edit the note's fields right in the sidebar. Text,
number and choice fields are editable. Relations and lists are shown but can't be edited here;
use the Anvil's editor pane for those. A field
you change gets a **Save** button, and nothing is written until you select it. If saving
fails, the reason is shown next to the field, with **Retry** for a failed write. The fields
come from the note's FileClass, the same as in the Anvil's editor pane. See
[FileClasses and the editor](fileclasses.md).

**Empty states.**

- "No note open": open a note to see its story context.
- "Story Forge follows markdown notes.": the active file isn't a note, for example an image.
- "This note isn't a tracked …" (the message lists the entity types): the note has none of
  the entity tags and no `type` Property. See
  [Getting started](getting-started.md#tag-your-entities).

## Navigator tab

The Navigator is a compact scene browser for the book you're working on. Like the Anvil's
scene tabs, it follows the open note: a book or a plotline shows its scenes, and a scene shows
the scenes of its book. Any other note shows every scene in the vault.

- **Plotlines** lists each plotline with its scene count. Select a plotline to show only its
  scenes, or **All** to show every scene again.
- Scenes are grouped by act, with their `order` number and `when` text. Select a group
  heading to fold it.
- Select a scene's title to show it in the Codex tab (with the default Link click action).
- A bar at the bottom shows progress: how many scenes are at each status. Scenes at
  `revised`, `done` or `final` count as written.

The Navigator is read-only.

<!-- screenshot: the Navigator tab with the plotline filter and act groups -->

## Collection tabs

Collections you add from the repo or import from your vault can get a tab of their own in the
Workbench. Turn on a collection's Workbench switch in the [Library](library.md), and its tab
appears after Navigator. Each tab runs that collection's query for the note you have open.

The built-in collections (Characters, Locations, Objects and Lore) don't get tabs. They appear
as groups in the Codex tab instead.

Some collections need another plugin, or your approval before they run:

- "Needs Dataview": install and enable the Dataview plugin. See
  [Optional plugins](optional-plugins.md).
- **Review and enable**: the collection runs DataviewJS code, so Story Forge asks before it runs.
  See [The Library](library.md).
- "Collection disabled": the collection is turned off in the Library.

Below the result, a **Source** line shows which file the collection comes from.
