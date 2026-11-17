# FileClasses and the editor

A FileClass tells Story Forge's editor which fields an entity has: their order, their type,
the values a choice field offers, and how they are grouped into sections. FileClasses are
optional. Without them the editor still works from the Properties a note already has.

## What a FileClass is

A FileClass is an ordinary note in your FileClasses folder, named like `fc-character.md`. It
uses the format of the [Metadata Menu](https://mdelobelle.github.io/metadatamenu/fileclasses/)
plugin. Story Forge reads that format directly, so you don't need Metadata Menu installed. If
you do use it, both plugins read the same files.

The folder is `00 Meta/FileClasses` by default. You can change it with **FileClasses folder**
under **Settings → Story Forge → Scope**.

Story Forge picks the FileClass for a note in this order:

1. The note's own `fileClass` Property, for example `fileClass: fc-character-fantasy`.
2. A FileClass whose `tagNames` list contains one of the note's tags.
3. A FileClass whose `filesPaths` list contains the note's folder.

The FileClasses for the shipped entity types (`fc-book`, `fc-character`,
`fc-character-fantasy`, `fc-location`, `fc-lore`, `fc-object`, `fc-plotline` and `fc-scene`) are
in the example vault in the repository, under `test/StoryForge/00 Meta/FileClasses/`. Copy
them into your own FileClasses folder to start from them.

Story Forge only reads FileClasses. It never edits them.

## Fields and types

Each entry in a FileClass's `fields` list becomes one field in the editor. The `fieldsOrder`
list sets their order. A field missing from `fieldsOrder` is shown after the others.

The field type chooses the control:

| FileClass type             | Control in the editor                                |
|----------------------------|------------------------------------------------------|
| `Input`                    | Text box                                             |
| `Number`                   | Number box                                           |
| `Boolean`                  | Checkbox                                             |
| `Select`, `Cycle`          | Drop-down of the values in the FileClass             |
| `Date`, `Datetime`, `Time` | Date or time box                                     |
| `File`                     | A single link                                        |
| `Multi`, `MultiFile`       | A row of chips (`MultiFile` chips are links)         |
| `Media`                    | Image preview with **Choose image…** and **Clear**   |
| `MultiMedia`, other types  | Plain text box                                       |

A few rules to know:

- If a note holds a value that isn't in a choice field's list, the editor shows it but you
  can't pick it again. Story Forge never adds values the FileClass doesn't declare.
- If a field holds a list, it is shown as chips, whatever its declared type. That way a list is
  never flattened into one value.
- A value no control can represent, such as a nested map, is shown but can't be edited.
- `tags` is never shown as a field, and `type` is read-only. Both decide what kind of note
  this is. `fileClass` is shown only if your FileClass declares it.

## Sections

A FileClass can extend another one with `extends`. For example, `fc-character-fantasy` extends
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

1. Create `fc-isekai.md` (any name starting with `fc-`) in your FileClasses folder.
2. Add `extends: fc-character`, then a `fields` list and a `fieldsOrder` list in the same
   format as the shipped files.
3. On each note that should use it, set `fileClass: fc-isekai`.

The editor now shows the Character section first, then your Isekai section marked `yours`.
Your fields look and behave exactly like ours.

A FileClass sets the fields only. Which notes appear in a collection is decided by the
collection's tag or query, which you manage in the [Library](library.md). The Workbench's
story views only know the seven shipped entity types, so a note of a brand-new type shows as
"not an entity" there.

## Without FileClasses

If no FileClass applies to a note, the editor shows a single **Properties** section built from
the note's own Properties. Story Forge guesses each field's type from its value: text, number,
true/false, list, and so on. You can still edit everything, but you get no choice lists and no
fixed order. A field that doesn't exist on the note yet can't be added this way.

When a Codex collection is empty, the **What are FileClasses?** button links to Metadata Menu's
FileClass documentation.
