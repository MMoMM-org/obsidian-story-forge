# Optional plugins

Story Forge works without any other plugin. The four built-in collections, the Workbench, the
Anvil and the field editor need nothing else. These plugins add more:

| Plugin | Kind | What it adds |
|--------|------|--------------|
| [Bases](glossary.md#bases) | Core plugin, ships with Obsidian | Draws `.base` collections and adds Story Forge Cards to your own `.base` files |
| [Dataview](glossary.md#dataview-dql-and-dataviewjs) | Community plugin | Runs Dataview and DataviewJS collections |
| metadata-menu | Community plugin | Edits FileClasses, and adds buttons in Obsidian's Properties panel |
| meta-bind | Community plugin | Draws the height, build, hair, eyes and portrait lines in the character template |
| Templates | Core plugin, ships with Obsidian | Creates a new note from one of Story Forge's templates |

None of them is required. No Story Forge feature depends on any of them.

Story Forge may suggest turning on Bases, because it ships with Obsidian. It never asks you to
install a community plugin.

## Bases

Bases is a core plugin. Turn it on in **Settings › Core plugins › Bases**.

**With Bases on:**

- `.base` collections, imported or from the repo, are drawn in the Anvil and the Workbench with
  the Card you chose.
- Your own `.base` files can use **Story Forge Hero**, **Table** and **Compact** as view types.

**Without Bases:**

- `.base` collections show "<name> needs Bases" instead of their entries. Their Library row is
  marked **○ Needs Bases** with "Needs the core Bases plugin, which is off."
- Bases views in the Workbench fall back to a read-only list, without sorting, filtering or
  columns. The Workbench says "Bases is off — showing a simple list".
- The four built-in collections, the Workbench and the field editor work the same.

While Bases is off, the Anvil shows a hint once: "The core Bases plugin is off. Turn it on to draw
.base collections and to use Story Forge Cards in your own .base files." Close it with ✕ and it
does not come back.

**Restart after turning Bases on or off.** Story Forge reads whether Bases is on when it loads.
After you change it, restart Obsidian.

**On mobile**, `.base` collections are not drawn. Their Library row says **○ Not available on
mobile**, and the Anvil says "This collection is not available on mobile."

## Dataview

Dataview is a community plugin. Story Forge needs version 0.5.31 or later; an older version
counts as not active.

**With Dataview active**, Story Forge runs Dataview and DataviewJS collections: notes you imported,
views from older versions of Story Forge, and Dataview entries from the repo.

**Without Dataview:**

- Those collections do not run. The Library row says **○ Needs Dataview** with "Needs Dataview,
  which is not active." The Workbench tab says "This collection needs Dataview, which is not
  active."
- You can still import and install them. They run once Dataview is active.
- Built-in and `.base` collections are not affected.

Story Forge only sees plugins that are loaded, so a disabled Dataview and a missing one look the
same: "not active".

### JavaScript queries (DataviewJS)

DataviewJS collections also need Dataview's own setting for JavaScript queries. Without it,
DataviewJS collections show **○ DataviewJS disabled** in the Library ("DataviewJS is disabled in
Dataview settings.") and do not run. Turn it on in Dataview's settings.

This setting does not affect plain Dataview collections.

DataviewJS collections also ask for your consent before they run. See
[Consent and DataviewJS](library.md#consent-and-dataviewjs). On mobile, DataviewJS collections do
not run and show **○ Not available on mobile**.

## metadata-menu

metadata-menu is a community plugin. Story Forge never checks whether it is installed. It reads
the FileClass files (`fc-*.md`) that metadata-menu uses, in the folder set in **Settings › Story
Forge › Scope › FileClasses folder**.

**Story Forge's own FileClasses.** The **Set up story files** step (**Settings → Story Forge →
Scope → Set up story files…**, or the same button on the capability screen) writes a FileClass for
each of the eight story types: `book`, `character`, `character-fantasy`, `location`, `lore`,
`object`, `plotline` and `scene`. It shows every file first and writes nothing until you confirm.
They are written in metadata-menu's format and use its field types (Input, Number, Select,
Multi, File, MultiFile, Media).

**With metadata-menu you get:**

- A form for editing FileClasses: which fields a kind of note has, their types, options and order.
- Buttons in Obsidian's Properties panel, between a property's name and its value, that follow the
  FileClass by field type: pick an option such as _male_ for _gender_, edit a list, set a link.

**Without it, nothing changes in Story Forge.** Story Forge reads the FileClass files itself, and
its editor shows their sections, option lists and field order. You can edit them as plain notes.
What you miss is only metadata-menu's own tools: the FileClass form, and the buttons in the
Properties panel. Obsidian's Properties panel has no option lists of its own; they exist only in
Story Forge's editor.

With no FileClasses at all, the editor lists every property under "Properties", without sections
or option lists. See [FileClasses and the editor](fileclasses.md).

## meta-bind

meta-bind is a community plugin. Story Forge never checks whether it is installed and has no
feature that uses it.

**Where it appears.** Only in the shipped character template (`entity-character`). Its
Appearance section has two display lines written as meta-bind `VIEW[]` fields: one line with
height, build, hair and eyes, and one with the portrait image. They read the note's own
frontmatter, so the facts stay in the Properties. The other templates have no meta-bind fields.

**With meta-bind**, a note made from that template shows those two lines as values and the
portrait as an image. While a field is still empty, its place stays blank until you select it.

**Without it**, the notes work the same: the same Properties, the same editor, the same
collections. The two lines show as plain text such as `VIEW[{height}][text]` instead of values.
You can delete them or leave them.

## Templates

Story Forge's templates are written for Obsidian's core **Templates** plugin (**Settings › Core
plugins › Templates**). They use only its `{{title}}` variable. **Set up story files** writes seven
of them: one for each entity type except `character-fantasy`, plus one for a scene. They are
plain Markdown with no code. Templater is not needed, and no shipped template uses Templater
syntax. Insert them with **Templates: Insert template**, not with Templater: Templater has its own
syntax and leaves `{{title}}` as it is.

**Without the core Templates plugin**, you can still copy a template's text into a new note by
hand. You can also create scenes and entities by hand and add their Properties yourself.

## The capability screen

The **What Story Forge can use** screen starts with a **Story files** row for Story Forge's own
FileClasses, templates and schema reference. It shows whether they are set up, for example
"Not set up" or "27 set up", and its **Set up story files…** button opens the setup dialog.
Showing the screen writes nothing. Below it, the screen lists three plugins with what each adds,
what you have without it, and its current status:

- Bases: **On**, **Off**, or **Not in this Obsidian version**.
- Dataview: **Active** or **Not active**, and whether JavaScript queries are on.
- metadata-menu: how many FileClasses Story Forge found in your FileClasses folder, for example
  "<n> FileClasses in 00 Meta/FileClasses".

meta-bind and core Templates are not listed there. This page is where they are described.

The status is read when the screen opens. None of these states is an error.

<!-- screenshot: the What Story Forge can use screen -->

**It opens by itself once**, the first time you open the Anvil or the Workbench. Close it with
**Got it**, ✕ or Escape, and it does not open by itself again.

**To open it again**, go to **Settings › Story Forge › Library** and use the link **What optional
plugins add…** at the bottom. The same link appears on a Library row that needs Dataview or
Bases.
