# The Library

The Library is where you decide what the Codex can show and how it draws it. Open it in
**Settings › Story Forge › Library**. It has two lists: **Collections** (what is shown) and
**Cards** (how each entry is drawn).

<!-- screenshot: the Library tab with the Collections list, the Cards list and the footer link -->

## Collections

A collection is a query over your vault. Each row in **Collections** has:

- an **enable checkbox**. This is the master switch. A disabled collection shows nowhere.
- two switches, **Anvil** and **Workbench**, that choose where the collection appears. While the
  checkbox is off the switches keep their values, and the row says where the collection will
  return when you enable it again.
- a **provenance** badge, which tells you where the entry came from:
  - **built-in**: ships with Story Forge.
  - **from repo**: installed with **+ Browse repo…**.
  - **imported**: a file from your own vault, added with **+ Import from vault…**.
- an **engine** badge for collections that a query draws: **Bases**, **Dataview** or
  **DataviewJS**. Built-in collections have none.
- a **status** badge, only when something stops the collection from drawing. See
  [Troubleshooting](troubleshooting.md).
- **Configure**, which opens the collection's settings under the row, and **Remove** for
  anything that is not built-in.

If both switches are off, the row says "Shown nowhere. Turn on Anvil or Workbench to see it."

### Built-in collections

Story Forge ships four built-in collections. Each one selects notes by tag:

| Collection | Default tag |
|------------|-------------|
| Characters | `canon/character` |
| Locations | `canon/location` |
| Objects | `canon/object` |
| Lore | `canon/lore` |

Built-ins start enabled and switched on for both the Anvil and the Workbench. In **Configure**
you can change:

- **Tag**: the tag the collection looks for. A leading `#` is dropped. Clear the field to go
  back to the default tag.
- **Excluded folders**: by default **Same as Scope** is ticked, so the collection follows the
  excluded folders in the Scope tab. Untick it to give this collection its own
  comma-separated list.

Under the fields a live count shows what matches, for example "3 notes match: tagged
canon/character, outside 00 Meta." Selection is by tag; folders only ever exclude. A built-in can
be disabled but not removed or renamed.

### Imported and repo collections

For a collection that is not built-in, **Configure** shows:

- **Name**: the name shown in the Library, the Codex and the command palette. Clear it to use
  the file name.
- **File** (Bases) or **Source** (Dataview), with an **Open file** button.
- For a `.base` collection, whether the file was found. What it shows is decided by the file:
  edit it in Bases. Story Forge reads it on every render and never changes it. Its filters are
  used; its own views are not.
- For a Dataview or DataviewJS collection, the query is the first `dataview` or `dataviewjs`
  block in the source note. Edit the note to change the query.
- **Command** (Dataview and DataviewJS only): turn on **Add to command palette** to get a
  command that opens the Workbench on this collection. You can then set the **Command name**.
- **Consent** (DataviewJS only). See [Consent and DataviewJS](#consent-and-dataviewjs).

### Where a new collection shows

A new collection, imported or installed, starts on one surface. You can change this at any time
with its switches:

| Engine | Anvil | Workbench |
|--------|-------|-----------|
| Bases (`.base` file) | on | off |
| Dataview or DataviewJS | off | on |

A Bases grid suits the Anvil. A Dataview query is usually written against the open note, so it
starts in the Workbench.

### Views from older versions

If you used Dataview views in an earlier version of Story Forge, they were moved into the Library
as imported collections. A one-time notice says so: "Your views are now collections." They still
show in the Workbench. Dismiss the notice with ✕.

## Cards

A Card decides how each entry of a collection is drawn in the Anvil's Codex. Story Forge ships
three built-in Cards: **Hero**, **Table** and **Compact**. You choose the Card for each collection
in the Anvil, and Story Forge remembers your choice. Dataview and DataviewJS collections draw
their own output and do not use a Card.

Each row in **Cards** has:

- an **enable checkbox**.
- the **provenance** badge.
- **used by**, which lists the collections drawn with this Card.
- **Preview**, which draws a real note with this Card. Pick the collection to take the note from
  in **Sample from**; the first entry is used. The preview is read-only and clicks do nothing in
  it.

**Hero is the fallback Card and cannot be disabled.** Its checkbox is greyed out. Any collection
whose Card is missing is drawn with Hero.

Under the Cards list, **+ Browse repo…** is disabled ("Coming in a future release"). There is no
catalog of Cards yet.

## Importing from your vault

Use **+ Import from vault…** under the Collections list. The **Import a collection** window lists
two kinds of files:

- every `.base` file in your vault;
- every note with `sf-view: true` in its frontmatter.

Files already in the Library are not listed. Select a file to see its source path, where it will
show, and its query or `.base` preview. The file stays where it is: the Library links to it, so
editing the file changes the collection.

<!-- screenshot: the Import a collection window with one file selected -->

### Preparing a Dataview note for import

A note you want to import needs this frontmatter and exactly one query block:

~~~markdown
---
sf-view: true
sf-version: 1
sf-name: Scenes with this note
sf-description: Scenes that name the open note.
---

```dataview
TABLE status FROM #manuscript/scene
```
~~~

- `sf-view: true` makes the note appear in the import window.
- `sf-version` is required and must be a whole number.
- `sf-name` is optional. Without it, the file name is used. If present, it must not be empty.
- `sf-description` is optional and is shown in the window.
- `sf-engine` is optional. If you set it, it must match the block: `dataview-dql` for a
  `dataview` block, `dataviewjs` for a `dataviewjs` block.

The block's language decides the engine: a `dataview` block is Dataview, a `dataviewjs` block is
DataviewJS.

### Importing

Press **Import** for a Bases or Dataview file. It is saved at once, enabled, and the window says
"Imported <name>. It is in Library › Collections and shows in the Anvil" (or "the Workbench").
The window stays open so you can import more.

A DataviewJS note has **Review and import…** instead. It shows you the code first. See
[Consent and DataviewJS](#consent-and-dataviewjs).

### "Can't import"

A file that Story Forge cannot read is still listed, marked **Can't import**. Select it to see why
and how to fix it. Fix the file, then open the window again.

| Reason shown | How to fix it |
|--------------|---------------|
| This .base file is not a valid Bases file: … | Add a `views:` list, `filters:` or `formulas:`, or open it in Bases to check it. |
| This .base file could not be found / could not be read: … | The file is gone or unreadable. Check it in your vault. |
| No query block found | Add one ` ```dataview ` or ` ```dataviewjs ` block to the note. |
| A collection must contain exactly one query block | Keep one block, or split the note into one note per query. |
| sf-engine "…" contradicts the fenced block language "…" | Make `sf-engine` match the block, or remove `sf-engine`: the block's language decides. |
| sf-version must be an integer | Use a whole number, like `sf-version: 1`. |
| sf-name must be a non-empty string | Give it a name, or remove `sf-name` to use the file name. |

If the same file was imported meanwhile, for example from another window, the window says
"Not imported: <path> is already in Library › Collections."

If nothing qualifies, the window says: "Nothing to import — add sf-view: true to a vault note, or
create a .base file, to make it available here."

## Browsing the repo

**+ Browse repo…** under the Collections list opens **Collections from the repo**. The same window
opens with the command **Browse collections from the repo**. It is a curated library bundled with
Story Forge, so it needs no network.

Story Forge currently ships two entries:

- **Characters by role** (Bases): your characters, grouped by role.
- **Scenes with this note** (Dataview): scenes that name the open note as point of view, a
  character, the location or a plotline, in story order.

Select an entry to see where it will be installed, its query, and whether it is safe. Bases and
Dataview entries say "Safe: declarative query, no code."

<!-- screenshot: Collections from the repo with an entry selected -->

### Installing

Press **Install**. The file is written to the folder set in **Folder for collections from the
repo** (Settings › Library). The default is `00 Meta/Bases`, and the folder is created if it is
missing. Once installed, the window says "Installed to <path>. It is in Library › Collections."
and the entry is marked **✓ Installed**. The collection is enabled at once.

A DataviewJS entry has **Review and install…** instead, which shows you its code first.

### Updating

When a newer version of an installed entry ships with Story Forge, the entry shows **Update
available**. Press **Update** (or **Review and update…** for DataviewJS). Update replaces the
installed file with the new version and keeps your choices: enabled, the Anvil and Workbench
switches, and the command.

### When Story Forge refuses

Story Forge never overwrites a file you changed or a file it did not write:

- **"Not updated: <path> was edited after it was installed, and updating would overwrite those
  edits."** You changed the installed file. Your file is left alone. To take the new version,
  move or rename your edited copy first.
- **"Not installed: <path> already exists. Move, rename or remove it, then install again."**
  Another file already sits where the entry would go. Move, rename or remove it, or change
  **Folder for collections from the repo**, and install again.

If an entry is already installed and current, the window says the collection is already
installed and up to date.

## Consent and DataviewJS

Only DataviewJS asks for your consent. A DataviewJS collection runs JavaScript with full access to
your vault, so Story Forge shows you its code before it runs.

- **Bases and Dataview collections never ask.** You enable or disable them, nothing more. If you
  edit a Dataview query by hand, the collection simply draws the new query.
- **DataviewJS collections** open a review window when you import them (**Review and import…**),
  install them (**Review and install…**), or enable one you have not approved. The window shows
  the source and a warning. Press **Enable** to approve, or **Cancel**. If you close the review,
  nothing is saved or written.
- If the script changes after you approved it, it stops running until you review it again. The
  Workbench and the Anvil say "Query changed since you last enabled…".

To check or redo an approval, open **Configure** on the collection. The **Consent** line says
"Approved v1.", "You have not approved this script yet." or "The script changed since you
approved v1.". **Review consent…** opens the review again.

DataviewJS also needs Dataview's own JavaScript setting. See [Optional plugins](optional-plugins.md).

## Removing entries

Built-in collections and built-in Cards cannot be removed; you can only disable them (except
Hero, which stays on).

To remove an imported or repo entry, press **Remove** on its row. A confirmation opens under the
row and says what will happen, for example that the collection leaves the Anvil, that its Card
choice is forgotten, or that its command is removed too. Press **Remove** again to confirm, or
**Cancel** (or Escape).

Removing only takes the entry out of the Library. **Your file stays in your vault. Nothing is
deleted.** A notice confirms: "Removed <name> from the Library. The file is still in your vault."
You can import the file again later.

When you remove a Card, the collections that used it are drawn with Hero.
