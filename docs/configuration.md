# Configuration

This page lists every Story Forge setting, its default, and what it does. Settings are saved as
soon as you change them.

## How to open settings

1. Open Obsidian's **Settings**.
2. Under **Community plugins**, choose **Story Forge**.
3. Pick one of the three tabs at the top: **Library**, **Scope** or **Behaviour**. Library opens
   first.

Two places in Story Forge also take you there: **Manage in settings…** in the Anvil's
**+ Collection** menu, and **Change tag** on an empty Codex page, which opens that collection's
settings with the tag field ready.

<!-- screenshot: the Story Forge settings with the three tabs -->

## Settings reference

### Library

The Library tab holds the Collections and Cards lists. They are described in full in
[The Library](library.md). The settings in it are:

| Name | Default | What it does |
|------|---------|--------------|
| Collection enable checkbox | On for built-ins; on for anything you import or install | The master switch for one collection. Off, the collection shows nowhere. |
| Anvil switch | On for built-ins and Bases collections; off for Dataview and DataviewJS | Shows the collection in the Anvil's Codex. |
| Workbench switch | On for built-ins, Dataview and DataviewJS; off for Bases collections | Shows the collection in the Workbench. |
| Tag (Configure, built-ins) | `canon/character`, `canon/location`, `canon/object`, `canon/lore` | The tag a built-in collection selects notes by. Clear it to restore the default. |
| Excluded folders › Same as Scope (Configure, built-ins) | On | Follows the Scope tab's excluded folders. Untick it to give this collection its own comma-separated list. |
| Name (Configure, imported and repo) | The `sf-name` or the file name | The name shown in the Library, the Codex and the command palette. Clear it to use the file name. |
| Add to command palette (Configure, Dataview and DataviewJS) | Off | Adds a command that opens the Workbench on this collection. |
| Command name | The collection's name | The name of that command in the command palette. |
| Card enable checkbox | On | Turns one Card on or off in the Library. Hero is the fallback Card and cannot be disabled. |
| Folder for collections from the repo | `00 Meta/Bases` | Where **Browse repo…** places the `.base` files and Dataview notes it installs. Clear it to go back to the default. |

### Scope

Scope decides which notes feed every collection.

| Name | Default | What it does |
|------|---------|--------------|
| FileClasses folder | `00 Meta/FileClasses` | The vault folder with your FileClass definitions (`fc-*.md`). Story Forge reads the editor's fields from here. Clear it to go back to the default. |
| Excluded folders | `00 Meta` | Comma-separated vault folders left out of every collection and scope view. A collection can use its own list instead (Library › Configure). Clearing the field means "exclude nothing"; it does not restore the default. |

### Behaviour

**Links and cards**

| Name | Default | What it does |
|------|---------|--------------|
| Link click action | Inspect the linked note (show it in place) | What happens when you click a link to another entity. The other choice is **Open in editor**. Ctrl-click (Cmd-click on macOS) does the opposite. |
| Open note from card title | On | Clicking a Card's title opens the note in a new tab. Off, it shows the note in the editor pane. Ctrl-click (Cmd-click) does the opposite. |

**Undo history**

| Name | Default | What it does |
|------|---------|--------------|
| Keep undo history across restarts | On | Stores the undo history in the plugin folder so you can still undo after restarting Obsidian. It holds copies of field values from your notes and stays on this device. Turning this off deletes the stored history. |
| Clear undo history | (button) | Empties undo and redo and deletes the stored history. Your notes are not changed. |

See [Undo](undo.md) for how undo works.

## Tips

- **Some choices are remembered without a setting.** Story Forge saves the Card you pick for
  each collection in the Anvil and where you dock the Anvil's editor pane (bottom by default).
  It also remembers which one-time hints you closed, such as the capability screen.
- **None of this is stored in your notes.** Settings and remembered choices live in Story
  Forge's plugin folder. Your story data stays in your notes' properties.
- **Moving your FileClasses?** Change **FileClasses folder** in Scope, or the editor will not
  find them. The capability screen shows how many FileClasses Story Forge found there.
- **A collection shows notes from a folder you don't want?** Add the folder to **Excluded
  folders** in Scope, or to that collection's own list in Library › Configure.
