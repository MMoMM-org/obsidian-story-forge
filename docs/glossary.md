# Glossary

The words Story Forge and these docs use, in plain language.

## Anvil

Story Forge's main view. It opens as a tab in the main area, like a note, and holds the
Codex, Timeline, Plotgrid, Plotlines and Board tabs. See [The Anvil](anvil.md).

## Bases

A core plugin that ships with Obsidian (you turn it on, you don't install it). It shows notes
as a table or grid, defined in a `.base` file. Story Forge can draw a `.base` file as a
collection. See [Optional plugins](optional-plugins.md#bases).

## `.base` file

A file that the Bases plugin reads. It says which notes to show (its filters) and how. You
usually edit it in Bases.

## Board

The Anvil tab that shows scenes in columns by their `status`. Dragging a card writes the new
`status` (and `order`) to the note. The command that opens it is **Open board** (older versions call it
**Open Kanban**).

## Capability screen

The window **What Story Forge can use**. It lists the optional plugins, what each one adds,
and whether you have it. See [Optional plugins](optional-plugins.md#the-capability-screen).

## Card

How one entry of a collection is drawn in the Codex. Story Forge ships three:
**Hero** (a card with the portrait or an initial, the name, key facts and links), **Table**
(one full-width row per entry, with every fact and link) and **Compact** (one line: the name
and two key facts). Hero is the *fallback Card*: whenever a collection's Card is missing, it is drawn with
Hero.

## Codex

Your story entities shown as cards, one collection at a time. It is a tab in both the Anvil
and the Workbench. In the Workbench, the Codex tab shows the open note and what it links to.

## Collection

One list of notes in the Codex, such as **Characters**. Four are built in and pick notes by
tag. You can add more from a `.base` file or a Dataview query. You manage collections in the
Library.

## Consent

Your approval before Story Forge runs a DataviewJS collection. DataviewJS runs code, so Story
Forge shows you the code first and runs it only after you press **Enable**. Nothing else asks
for consent. See [Consent and DataviewJS](library.md#consent-and-dataviewjs).

## Dataview, DQL and DataviewJS

Dataview is a community plugin that lists notes from a query you write in a note. A plain
Dataview query uses Dataview's own query language, called DQL (`sf-engine: dataview-dql`). A
DataviewJS query is a small JavaScript program instead, which is why Story Forge asks for
consent before it runs one. See [Optional plugins](optional-plugins.md#dataview).

## Engine badge

The label on a Library row that says what draws the collection: **Bases**, **Dataview** or
**DataviewJS**. Built-in collections have none.

## FileClass

A note, named like `fc-character.md`, that lists the fields one kind of note has: their
order, type and allowed values. Story Forge's editor uses it to decide which fields to show.
The format comes from the Metadata Menu plugin, but you don't need that plugin. See
[FileClasses and the editor](fileclasses.md).

## Frontmatter and Properties

The block of facts at the very top of a note, such as `status: draft`. In Obsidian you see
and edit it as **Properties**, a form above the note text. "Frontmatter" is the name of the
same block when you look at the note's raw text. Story Forge reads and writes only these
Properties.

## Library

The first tab of Story Forge's settings. It lists your collections and Cards, and is where
you add, configure and remove them. See [The Library](library.md).

## Master switch

The checkbox at the start of a Library row. Off, the collection shows nowhere, whatever its
Anvil and Workbench switches say.

## Plotgrid

The Anvil tab that shows a table of scenes (rows) against plotlines (columns). A filled cell
means the scene belongs to that plotline. It is read-only.

## Provenance badge

The label on a Library row that says where the entry came from: **built-in**, **from repo**
or **imported**.

## Scope

The second tab of Story Forge's settings. It sets the FileClasses folder and the excluded
folders, which decide which notes Story Forge looks at. See [Configuration](configuration.md#scope).

## Swimlane

A Timeline mode with one column per point-of-view character, location or plotline, and each
scene placed in its column.

## Wikilink

A link to another note written in double square brackets, such as `[[Mara Stoneway]]`. Story
Forge reads a relation, such as a scene's point-of-view character, from a wikilink stored in a
Property.

## Workbench

Story Forge's sidebar view. It opens in the right sidebar and follows the note you have open,
showing that note's facts and the story entities it links to. See [The Workbench](workbench.md).
