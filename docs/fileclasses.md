# FileClasses and the editor

A FileClass tells Story Forge's editor which fields an entity has: their order, their type,
the values a choice field offers, and how they are grouped into sections. FileClasses are
optional. Without them the editor still works from the Properties a note already has.

Want to fill in notes without typing YAML? See
[Without writing YAML](getting-started.md#without-writing-yaml).

## What a FileClass is

A FileClass is an ordinary note in your FileClasses folder, named like `fc-character.md`. It
uses the format of the [Metadata Menu](https://mdelobelle.github.io/metadatamenu/fileclasses/)
plugin. Story Forge reads that format directly, so you don't need Metadata Menu installed. If
you do use it, both plugins read the same files.

The folder is `00 Meta/FileClasses` by default. You can change it with **FileClasses folder**
under **Settings → Story Forge → Scope**. **Set up story files** writes Story Forge's FileClasses
into that folder.

Story Forge picks the FileClass for a note in this order:

1. The note's own `fileClass` Property, for example `fileClass: fc-character-fantasy`.
2. A FileClass whose `tagNames` list (the tags it applies to) contains one of the note's tags.
3. A FileClass whose `filesPaths` list (the folders it applies to) contains the note's folder.

Story Forge's own FileClasses are eight: one for each of the seven entity types (`fc-book`,
`fc-character`, `fc-location`, `fc-lore`, `fc-object`, `fc-plotline` and `fc-scene`), plus
`fc-character-fantasy`, which adds fantasy fields to characters. You get them from
**Set up story files**: see [Getting started](getting-started.md#set-up-story-files). It writes
them into your FileClasses folder. You don't copy anything by hand.

Story Forge's editor only reads FileClasses. It never edits them. The only time Story Forge
writes a FileClass is **Set up story files**, when you confirm, and then only as described below.

## Updating story files

A new version of Story Forge can ship newer FileClasses. They are not written by themselves.
When updates are available, **Settings → Story Forge → Library** shows "1 story file update
available." (or "2 story file updates available.", and so on) with the buttons **Review updates…** and **Not now**. **Not now** hides the hint
until the next Story Forge version. You can also run **Story Forge: Set up story files** at any
time. The dialog sorts every file into one of these states:

- **Update**: you did not edit the file since Story Forge wrote it, so it is updated.
- **Up to date**: nothing to do.
- **Not updated**: you edited the file. It is left as it is, and nothing overwrites your edits.
  To get the new version, move or rename your file and run the dialog again.
- **Already there**: a file with that name was in the folder before Story Forge wrote anything,
  so Story Forge has no record of writing it. It is never taken over, even if it is identical.
  To get Story Forge's copy, choose another folder, or move your file away first.
- **Missing**: Story Forge wrote the file once, but it was moved or deleted. It is set up
  again only if you tick it (**Set up again**).

Templates and schema notes follow the same rules. If you move a set's folder, updates stay
where the files already are; only files set up from now on go to the new folder.

## Fields and types

Each entry in a FileClass's `fields` list becomes one field in the editor. The `fieldsOrder`
list (the field names in the order you want them) sets their order. A field missing from `fieldsOrder` is shown after the others.

The field type chooses the control. The type names come from Metadata Menu:

| FileClass type             | Control in the editor                                |
|----------------------------|------------------------------------------------------|
| `Input`                    | Text box                                             |
| `Number`                   | Number box                                           |
| `Boolean`                  | Checkbox                                             |
| `Select`, `Cycle`          | Drop-down of the values in the FileClass. `Cycle` is Metadata Menu's "step through a list" choice; Story Forge shows it as a drop-down too |
| `Date`, `Datetime`, `Time` | Date or time box                                     |
| `File`                     | A single link                                        |
| `Multi`, `MultiFile`       | A row of chips, one per value. `Multi` holds several plain values; `MultiFile` holds several links |
| `Media`                    | An image (a link to a picture in your vault): preview with **Choose image…** and **Clear** |
| `MultiMedia`, other types  | Plain text box                                       |

A few rules to know:

- If a note holds a value that isn't in a choice field's list, the editor shows it but you
  can't pick it again. Story Forge never adds values the FileClass doesn't declare.
- If a field holds a list, it is shown as chips, whatever its declared type. That way a list is
  never flattened into one value.
- A value no control can represent, such as a nested map, is shown but can't be edited.
- `tags` is never shown as a field, and `type` is read-only. Both decide what kind of note
  this is. `fileClass` is shown only if your FileClass declares it.
- A field the FileClass declares but the note doesn't have yet is shown empty. Fill it, and
  Story Forge adds that Property to the note.

## Sections

A FileClass can build on another one with `extends`: it gets all the fields of that
FileClass, plus its own. For example, `fc-character-fantasy` extends
`fc-character`. The editor then shows one section per FileClass, starting with the base:

- **Character**: the fields of `fc-character.md`.
- **Character fantasy**: the extra fields of `fc-character-fantasy.md`, marked
  `extends fc-character`.

A section is named after the FileClass's `title` if it has one. Otherwise the name comes from
the file name without `fc-`. Under each heading, a line names the file the fields come from.
A FileClass you wrote yourself is marked `yours`.

If two FileClasses in a chain declare the same field, the first one wins.

Any Property the note has but no FileClass declares appears last, under **Other properties**,
marked "on the note, not declared by any FileClass".

<!-- screenshot: the editor pane with Character and Character fantasy sections and Other properties -->

## Adding your own entity type

To give some notes extra fields, write a FileClass that extends one of ours, and point the
notes at it:

For example, say some of your lore notes describe factions, and you want fields such as
`leader` and `motto` on them:

1. Create `fc-faction.md` (any name starting with `fc-`) in your FileClasses folder.
2. Add `extends: fc-lore`, then a `fields` list and a `fieldsOrder` list in the same format as
   the shipped files. Copying a shipped file and editing it is the easiest start. This step is
   written in YAML; with the Metadata Menu plugin you can use its form instead.
3. On each faction note, add the Property `fileClass` with the value `fc-faction`.

The editor now shows the Lore section first, then your Faction section marked `yours`. Your
fields look and behave exactly like ours. The notes stay lore notes: they keep their
`canon/lore` tag.

A FileClass sets the fields only. Which notes appear in a collection is decided by the
collection's tag or query, which you manage in the [Library](library.md). The Workbench's
story views only know the seven entity types, so a note of a brand-new type shows as not
tracked there.

## Without FileClasses

If no FileClass applies to a note, the editor shows a single **Properties** section built from
the note's own Properties. Story Forge guesses each field's type from its value: text, number,
true/false, list, and so on. You can still edit everything, but you get no choice lists and no
fixed order. A field that doesn't exist on the note yet can't be added this way.

When a Codex collection is empty, the **What are FileClasses?** button links to Metadata Menu's
FileClass documentation.
