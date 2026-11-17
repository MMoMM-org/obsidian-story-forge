# Getting started

This page takes you from a freshly installed plugin to seeing your own characters, places and
scenes in Story Forge.

## How Story Forge reads your notes

Story Forge works on plain notes you already own:

- **One note per story entity.** Each character, location, object, piece of lore, scene,
  plotline and book is a single note.
- **Facts live in frontmatter as plain Properties**, such as `age: 19` or `status: draft`.
- **Relations are `[[wikilinks]]` in Properties**, such as `pov: "[[Mara Stoneway]]"`.

Story Forge only reads and edits those Properties. It never owns your story data. There is no
hidden database, so if you disable the plugin, every fact is still in your notes.

## Tag your entities

Story Forge recognizes an entity by its tag. These are the tags of the shipped story schema:

| Entity    | Tag                 |
|-----------|---------------------|
| Character | `canon/character`   |
| Location  | `canon/location`    |
| Object    | `canon/object`      |
| Lore      | `canon/lore`        |
| Scene     | `manuscript/scene`  |
| Plotline  | `planning/plotline` |
| Book      | `planning/book`     |

If a note has none of these tags, a `type` Property with one of the entity names also works,
for example `type: character`.

A scene connects everything else through its Properties: `book`, `pov`, `characters`,
`location` and `plotlines`. The scene views also read `act`, `order`, `storyDay`, `when` and
`status`. Here is a scene from the example vault:

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

The scene `status` values are `idea`, `outline`, `draft`, `revised`, `done` and `final`.

Story Forge ignores notes in the `00 Meta` folder by default, so templates there don't show
up as entities. You can change this under **Settings → Story Forge → Scope**. See
[Configuration](configuration.md).

To see a complete setup, browse the example vault in the repository: `test/StoryForge/`
(the "Wardens of Moonharbor" story).

## FileClasses (optional)

FileClasses decide which fields the editor shows for each entity, in what order, and of what
type. You don't need them. Without them, the editor shows the Properties a note already has.
See [FileClasses and the editor](fileclasses.md).

## Open the Anvil and the Workbench

Story Forge has two places to work:

- **The Anvil** opens in the main area. Run **Story Forge: Open Anvil** from the command
  palette. Its tabs are **Codex**, **Timeline**, **Plotgrid**, **Plotlines** and **Board**.
  See [The Anvil](anvil.md).
- **The Workbench** opens in the right sidebar and follows the note you are reading. Select the
  book icon in the ribbon, or run **Story Forge: Open Workbench**. See
  [The Workbench](workbench.md).

Open a character note with the Workbench open, and you see that character's facts and links.
Open the Anvil's **Codex** tab, and you see your **Characters**, **Locations**, **Objects** and
**Lore** as cards.

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
