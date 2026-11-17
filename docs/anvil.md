# The Anvil

The Anvil is Story Forge's main-area view. It opens as a tab named **Anvil**, and has five
tabs of its own: **Codex**, **Timeline**, **Plotgrid**, **Plotlines** and **Board**. An editor
pane for the selected entry can be shown on every tab.

<!-- screenshot: the Anvil header with its five tabs, zoom controls and the undo/redo buttons -->

## Opening the Anvil

Run **Story Forge: Open Anvil** from the command palette. It opens on the Codex tab. There is
only ever one Anvil: if it is already open, the command brings it to the front.

These commands open the Anvil straight on a tab: **Open Timeline**, **Open Plotlines**,
**Open Plotgrid** and **Open Kanban** (which opens the Board tab).

The header holds the tabs, zoom controls (**Zoom out**, **Reset zoom**, **Zoom in**) and the
↶ ↷ buttons for [Undo](undo.md).

**Which scenes you see.** The Timeline, Plotgrid, Plotlines and Board tabs follow the note
you have open:

- a book note shows the scenes that link to it in their `book` Property;
- a plotline note shows the scenes that list it in `plotlines`;
- a scene shows the scenes of its book;
- any other note shows every scene in the vault, with the hint "No book/plotline in focus —
  showing all scenes in the vault."

Notes in your excluded folders (default `00 Meta`) are always left out.

**Clicking names.** On these four tabs, a click on a scene, character, place or plotline name
follows the **Link click action** setting. By default the entry appears in the editor pane,
and Cmd/Ctrl-click opens the note instead. See [Configuration](configuration.md).

## Codex

The Codex shows your story entities as cards, one collection at a time.

- **Collection pills** across the top switch between collections. Out of the box these are
  **Characters**, **Locations**, **Objects** and **Lore**. Collections you added yourself are
  drawn with a dashed outline.
- **+ Collection** lists collections that are turned on but not shown in the Anvil yet, plus
  **Manage in settings…**, which opens the [Library](library.md).
- **Card:** picks how entries are drawn: **Hero**, **Table** or **Compact**, plus any Cards of
  your own under **Yours**. The choice is remembered per collection.

Clicking works like this:

- Click a card to show that entry in the editor pane.
- Click a card's title to open the note in a new tab. To make a title click show the editor
  pane instead, turn off **Open note from card title** in the settings.
- Cmd/Ctrl-click swaps the two.
- Right-click any link for Obsidian's usual file menu.

If a collection finds nothing, it says which tag it looked for, for example "No characters
found". Use **Change tag** to fix the tag, or **What are FileClasses?** to read about
FileClasses. A collection drawn by a `.base` file needs the core Bases plugin. A Dataview
collection needs the Dataview plugin, and shows "Drawn by Dataview" instead of the Card picker.

A small badge on a card means "This property does not exist in this note". It usually means
a Card is showing a collection it wasn't made for.

## Timeline

The Timeline puts scenes in story order. It sorts by `storyDay`, then by `order`, and groups
scenes by `act` (scenes without an act go under "No act").

Two modes:

- **Rail:** one scene card per row along a line, with the `when` text beside it. The dot's
  colour shows the plotline. The card links to the POV character, the location and the other
  characters.
- **Swimlane:** one column per value, with scenes placed in their column. Use
  **Group swimlanes by** to choose **POV**, **Location** or **Plotline**.

The Timeline is read-only.

## Plotgrid

The Plotgrid is a table of scenes (rows) against plotlines (columns). A filled cell means the
scene belongs to that plotline, and shows its status and `when`. Every plotline gets a
column, even one no scene uses yet.

The Plotgrid is read-only. Clicking a cell changes nothing.

## Plotlines

Plotlines lists your scenes grouped by plotline, with a scene count on each group. Scenes
without a plotline appear under "Unassigned" at the end. Click a group heading to fold it.

## Board

The Board shows scenes in columns by `status`: **idea**, **outline**, **draft**,
**revised**, **done** and **final**. Scenes without a status go in a "No status" column.

**The Board writes to your notes.** Drag a scene card to another column, or to another place
in a column, and Story Forge updates the scene's `status` and `order` Properties. Sometimes
other cards in the column need new `order` numbers to make room. When that happens, those
notes are updated too. With the keyboard, focus a card and press the left or right arrow to
move it one column.

If a write fails, the card is marked and a notice tells you why. You can take back any move
with [Undo](undo.md).

## The editor pane

When you select an entry, its fields open in the editor pane. The fields come from the note's
FileClass, or from the Properties the note already has if it has none. See
[FileClasses and the editor](fileclasses.md).

- **Editing:** each change is written to the note's frontmatter as soon as you finish it. For
  a text box, that is when you press Enter or leave the box. If Story Forge can't save a
  value, it puts back the value the note holds and tells you why. Relations appear as chips.
  Image fields show a preview with **Choose image…** and **Clear**.
- **Title:** click the note's name in the pane header to open the note in a new tab.
- **Dock:** the pane starts below the tab's content. **Dock right** moves it beside the
  content, and **Dock bottom** moves it back. Story Forge remembers your choice. It never
  moves the pane by itself, for example when you resize the window.
- **Fullscreen:** **Fullscreen** gives the pane the whole Anvil. **← Back** returns to the
  dock you came from.
- **Close:** **Close** (✕) hides the pane.

If the note is renamed while it is open, the pane follows it. If the note is deleted, the pane
closes and tells you.

<!-- screenshot: the editor pane docked at the bottom, with a character's sections -->
