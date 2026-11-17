# Optional plugins

Story Forge works without any other plugin. The four built-in collections, the Workbench, the
Anvil and the field editor need nothing else. Three optional plugins add more:

| Plugin | Kind | What it adds |
|--------|------|--------------|
| [Bases](glossary.md#bases) | Core plugin, ships with Obsidian | Draws `.base` collections and adds Story Forge Cards to your own `.base` files |
| [Dataview](glossary.md#dataview-dql-and-dataviewjs) | Community plugin | Runs Dataview and DataviewJS collections |
| metadata-menu | Community plugin | A form for editing FileClasses |

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

**With metadata-menu**, you get a form for editing FileClasses: which fields a kind of note has,
their types, options and order.

**Without it, nothing changes in Story Forge.** Story Forge reads FileClass files itself. The
example vault in the repository has eight of them, under `test/StoryForge/00 Meta/FileClasses/`:
one for each of the seven entity types, plus `fc-character-fantasy` for fantasy characters. Story
Forge doesn't copy them into your vault; copy them yourself. You can edit them as plain notes.

With no FileClasses at all, the editor lists every property under "Properties", without sections
or option lists. See [FileClasses and the editor](fileclasses.md).

## The capability screen

The **What optional plugins add** screen lists the three plugins with what each adds, what you
have without it, and its current status:

- Bases: **On**, **Off**, or **Not in this Obsidian version**.
- Dataview: **Active** or **Not active**, and whether JavaScript queries are on.
- metadata-menu: how many FileClasses Story Forge found in your FileClasses folder, for example
  "<n> FileClasses in 00 Meta/FileClasses".

The status is read when the screen opens. None of these states is an error.

<!-- screenshot: the What optional plugins add screen -->

**It opens by itself once**, the first time you open the Anvil or the Workbench. Close it with
**Got it**, ✕ or Escape, and it does not open by itself again.

**To open it again**, go to **Settings › Story Forge › Library** and use the link **What optional
plugins add…** at the bottom. The same link appears on a Library row that needs Dataview or
Bases.
