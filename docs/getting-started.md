# Getting started

This page takes you from a freshly installed plugin to seeing your own characters, places and
scenes in Story Forge. New words are explained in the [Glossary](glossary.md).

## Set up story files

Story Forge brings three sets of ready-made notes. You write them into your vault once, with
**Set up story files**:

- **FileClasses**: tell the editor which fields each story type has. See
  [FileClasses and the editor](fileclasses.md).
- **Templates**: one for each entity type and one for scenes, for Obsidian's core **Templates**
  plugin.
- **Schema reference**: one note per story type that explains each Property and its values.

Story Forge works without them, but the editor then shows no sections or option lists, and you
have no templates. Nothing is written until you ask.

Open the dialog in any of these ways:

- Run **Story Forge: Set up story files** from the command palette.
- Open **Settings → Story Forge → Scope** and select **Set up story files…** under **Story
  files**.
- In **Settings → Story Forge → Library**, select **Set up story files…** in the hint that says
  "Story files are not set up."
- In the screen **What Story Forge can use**, select **Set up story files…** in the **Story
  files** row.

The dialog shows what it would do, before it does anything:

- **One card per set**: **FileClasses**, **Templates** and **Schema reference**. Each card has a
  checkbox, a file count and a **Folder** field. The defaults are `00 Meta/FileClasses`,
  `00 Meta/Templates` and `00 Meta/Schema`. Change a folder and the dialog shows the new plan;
  the folder is saved only when you confirm.
- **One row per file**, with what will happen to it: **Create**, **Update**, **Up to date**,
  **Not updated**, **Already there**, **Missing**, **Unreadable** or **Damaged**. Rows that
  would write a file have their own checkbox, so you can leave single files out. A **Missing**
  file starts unticked, with the label **Set up again**. Only **Create**, **Update** and a ticked
  **Set up again** write anything:
  - **Already there**: a file of yours is at that path; it is left alone.
  - **Not updated**: you edited a file Story Forge set up; your edits are kept.
  - **Missing**: a file set up earlier was deleted or moved; it comes back only if you tick it.
  - **Unreadable** and **Damaged**: see [Troubleshooting](troubleshooting.md#story-files).
- **A warning** when a folder is not in your excluded folders: "Not in your excluded folders."
  Notes there would be treated as story entities. The button **Add <folder> to excluded
  folders** fixes it without writing any file. The default folders are in `00 Meta`, which is
  excluded already.
- **The footer**: "Folders that do not exist yet are created." The button names what it writes,
  for example **Set up 3 files** or **Update 2 files**. **Cancel**, Escape and ✕ change nothing.

Select the button to write. Story Forge then shows one notice that says what was set up, and
what was skipped and why. If something is refused, see
[Troubleshooting](troubleshooting.md#story-files).

Run the dialog again any time, for example after updating Story Forge. **Update** replaces only
a file you have not edited since it was set up. A file you edited shows **Not updated** and is
left as it is. Your own story notes are never touched by this dialog. See
[Updating story files](fileclasses.md#updating-story-files).

For a first novel, keep the default folders and all three sets ticked.

## How Story Forge reads your notes

Story Forge works on plain notes you already own:

- **One note per story entity.** Each character, location, object, piece of lore, scene,
  plotline and book is a single note.
- **Facts live in the note's Properties**, such as `age: 19` or `status: draft`. Properties are
  the form at the top of a note in Obsidian. In the note's raw text the same block is called
  *frontmatter*: the lines between two `---` at the very top.
- **Relations are [wikilinks](glossary.md#wikilink) in Properties**, such as
  `pov: "[[Mara Stoneway]]"`. A wikilink is a link to another note in double square brackets.

Story Forge only reads and edits those Properties. It never owns your story data. There is no
hidden database, so if you disable the plugin, every fact is still in your notes.

**Links in the note text don't count.** A `[[Mara Stoneway]]` in the body of a scene does not
make Mara that scene's character. Relations are read from Properties only. There is one
exception: when you open an object or a lore note, the Workbench's **Appears in** (object) or
**Referenced by** (lore) section also lists scenes that link to it only in their text.

## Tag your entities

Story Forge recognizes seven entity types by their tag:

| Entity    | Tag                 |
|-----------|---------------------|
| Character | `canon/character`   |
| Location  | `canon/location`    |
| Object    | `canon/object`      |
| Lore      | `canon/lore`        |
| Scene     | `manuscript/scene`  |
| Plotline  | `planning/plotline` |
| Book      | `planning/book`     |

The tag must match exactly. It can be in the `tags` Property or written as `#canon/character`
in the note's text.

If a note has none of these tags, a `type` Property with one of the entity names also works,
written in lower case: `book`, `character`, `location`, `lore`, `object`, `plotline` or `scene`.
For example `type: character`.

Fantasy characters are not an eighth type. They are characters, with extra fields from the
`fc-character-fantasy` FileClass. See [FileClasses and the editor](fileclasses.md#sections).

A scene connects everything else through its Properties: `book`, `pov` (the point-of-view
character), `characters`, `location` and `plotlines`. The scene views also read these:

- `act`: the number of the act the scene is in. The Timeline and Navigator group scenes by it.
- `order`: the scene's number in reading order within its book.
- `storyDay`: the day of the story the scene happens on, as a number (day 1 is `1`). The
  Timeline sorts by it.
- `when`: a free-text label for the time, such as "Night 1". It is shown, not sorted on.
- `status`: one of `idea`, `outline`, `draft`, `revised`, `done` and `final`.

Here is a scene from the example vault, as frontmatter:

```yaml
---
type: scene
title: The Extinguished Fire
book: "[[Wardens of Moonharbor]]"
act: 1
order: 1
storyDay: 1
when: "Night 1"
status: draft
pov: "[[Mara Stoneway]]"
characters:
  - "[[Mara Stoneway]]"
  - "[[Tobias Ferro]]"
location: "[[Moonharbor Lighthouse]]"
plotlines:
  - "[[The Dying Light]]"
tags: [manuscript/scene]
---
```

You don't have to type this. The next section shows how to get there without writing YAML.

Story Forge ignores notes in the `00 Meta` folder by default, so templates there don't show
up as entities. You can change this under **Settings → Story Forge → Scope**. See
[Configuration](configuration.md#scope).

To see a complete setup, browse the example vault in the repository: `test/StoryForge/`
(the "Wardens of Moonharbor" story). You don't need it to use the plugin.

## Without writing YAML

You never have to edit frontmatter as text. Three tools cover it.

**Obsidian's Properties panel.** In any note, run **Add file property** from the command
palette, or select **Add property** under the Properties the note already has.

- **Tag:** add a property named `tags` and type the tag, for example `canon/character`.
- **Type:** or add a property named `type` with the value `character`.
- **Relation:** add a property such as `pov`, type `[[`, and pick the note from Obsidian's
  suggestions. For a list such as `characters`, change the property's type to **List** (select
  the icon next to its name) and add one link per entry.

**A template.** [Set up story files](#set-up-story-files) writes one template per entity type,
except fantasy characters (`entity-character.md`, `entity-location.md`, `entity-object.md`,
`entity-lore.md`, `entity-plotline.md`, `entity-book.md` and `scene.md`), into the Templates
folder (`00 Meta/Templates` by default). Each already holds the tag, the `type` and every
field, empty. To use them with Obsidian's core **Templates** plugin:

1. Open **Settings → Core plugins** and turn on **Templates**.
2. Open **Settings → Templates** and set **Template folder location** to the Templates folder
   (`00 Meta/Templates` by default).
3. Create a new note, run **Templates: Insert template** from the command palette and pick, for
   example, `entity-character`. The note's title fills in `{{title}}`.

The templates also contain placeholders and blocks for other plugins in the note text (see
[Optional plugins](optional-plugins.md)); delete what you don't use.

A template is copied into the note when you insert it. Updating the templates later never
changes notes you already made from them.

**Story Forge's editor pane.** Once a note is recognized, select it in the Anvil to open it in
the editor pane. With a FileClass, the pane shows every field the FileClass declares, even the
ones the note doesn't have yet. Fill an empty field and Story Forge adds that Property to the
note. To add a relation, select **+ link** in a link field, type the note's name and press
Enter. Story Forge stores it as a wikilink. The FileClasses come from
[Set up story files](#set-up-story-files); see [FileClasses and the editor](fileclasses.md).

Two things the editor pane can't do:

- **It can't set the tag or the type.** `tags` is never shown, and `type` is read-only, because
  both decide what kind of note it is. Use the Properties panel or a template for those.
- **It can't add a field nobody declared.** Without a FileClass, the pane shows only the
  Properties the note already has.

No Story Forge command creates a new note. Create the note in Obsidian as usual, then tag it.

## Bring your existing notes in

If your story notes have no special tags yet, do this once:

1. **Characters, locations, objects and lore.** Add the tag from the table above to each note,
   or a `type` Property. Do this in the Properties panel or with a template (see
   [Without writing YAML](#without-writing-yaml)).
   - Already use your own tags, such as `people`? In the Anvil's Codex, use **Change tag** on
     the empty collection to point it at your tag. This changes only which notes that Codex
     collection lists. When you open the note, the Workbench still recognizes it as a
     character only by `canon/character` or `type: character`, so add one of those too.
2. **Books.** Add `planning/book` (or `type: book`) to each book note. **Change tag** doesn't
   apply to books, plotlines or scenes: their tags are fixed.
3. **Plotlines.** Add `planning/plotline` (or `type: plotline`) to each plotline note.
4. **Scenes.** Add `manuscript/scene` (or `type: scene`) to each scene note. Then give each
   scene its relations as Properties: `book`, `pov`, `characters`, `location` and `plotlines`,
   each holding wikilinks to the notes from steps 1 to 3.
5. **Move body links into Properties.** If a scene names its characters only in the text, add
   them to its `characters` Property as well. Story Forge doesn't read relations from the text.
6. **Scene order.** Add `order`, `act` and `storyDay` numbers and a `status` where you want the
   Timeline, Plotgrid and Board to place the scene. Scenes without them still appear, under
   "No act" or "No status".
7. **Check the folders.** Notes in `00 Meta` are ignored. If your story notes live there, change
   **Excluded folders** in **Settings → Story Forge → Scope**.
8. **Open a note** with the Workbench open. If it says the note isn't tracked, its tag or `type`
   is missing or misspelled.

## FileClasses (optional)

A [FileClass](glossary.md#fileclass) decides which fields the editor shows for each entity, in
what order, and of what type. [Set up story files](#set-up-story-files) writes Story Forge's
own. Without them, the editor shows the Properties a note already has. See [FileClasses and the editor](fileclasses.md).

## Open the Anvil and the Workbench

Story Forge has two places to work:

- **The [Anvil](glossary.md#anvil)** opens in the main area. Run **Story Forge: Open Anvil**
  from the command palette. Its tabs are **Codex**, **Timeline**, **Plotgrid**, **Plotlines**
  and **Board**. See [The Anvil](anvil.md).
- **The [Workbench](glossary.md#workbench)** opens in the right sidebar and follows the note you
  are reading. Select the book icon in the ribbon, or run **Story Forge: Open Workbench**. See
  [The Workbench](workbench.md).

Open a character note with the Workbench open, and you see that character's facts and links.
Open the Anvil's **Codex** tab, and you see your **Characters**, **Locations**, **Objects** and
**Lore** as cards. Each of these is a [collection](glossary.md#collection), drawn with a
[Card](glossary.md#card).

<!-- screenshot: the Anvil Codex tab showing character cards, with the Workbench open beside it -->

If a collection shows "No characters found", no note carries that collection's tag. Use
**Change tag** to point the collection at the tag you use.

## Next steps

- [The Library](library.md): choose which collections and cards appear, and add your own.
- [Optional plugins](optional-plugins.md): what Bases, Dataview and Metadata Menu add.
- [Undo](undo.md): take back a change Story Forge made.
- [Configuration](configuration.md) and [Commands](commands-reference.md): every setting and
  command.
- [Troubleshooting](troubleshooting.md): if something doesn't show up.
- [Glossary](glossary.md): every Story Forge term in plain language.
