# Troubleshooting

Find the message or symptom you see, then follow the fix. Most states are not errors: they tell
you what a collection needs before it can draw.

## Common issues

### A collection says "needs Bases"

**You see:** the Codex shows "<name> needs Bases" and "This collection is a Bases file, and the
core Bases plugin is turned off." The Library row is marked **○ Needs Bases**.

**Fix:** turn on **Settings › Core plugins › Bases**, then **restart Obsidian**. Story Forge reads
whether Bases is on when it loads, so the change only shows after a restart. The same applies when
you turn Bases off.

### "Needs Dataview, which is not active."

**You see:** a Library row marked **○ Needs Dataview**, or a Workbench tab saying "This collection
needs Dataview, which is not active."

**Fix:** install and enable the Dataview community plugin, version 0.5.31 or later. Story Forge
only sees loaded plugins, so an installed but disabled Dataview also counts as not active. The
collection runs as soon as Dataview is active. See [Optional plugins](optional-plugins.md#dataview).

### "DataviewJS disabled"

**You see:** a Library row marked **○ DataviewJS disabled**, or "DataviewJS is disabled in
Dataview settings."

**Fix:** turn on JavaScript queries in Dataview's settings. Plain Dataview collections do not need
this.

### "Consent required" or "Review and enable"

**You see:** a DataviewJS collection marked **▲ Consent required**, or a "Review and enable" box
where it should draw. If the script changed since you approved it: "Query changed since you last
enabled…".

**Why:** DataviewJS runs code with full vault access, so Story Forge shows it to you first.

**Fix:** press the review button, read the code, and press **Enable** if you trust it. Or open
**Settings › Story Forge › Library › Configure › Review consent…**. See
[Consent and DataviewJS](library.md#consent-and-dataviewjs).

### "Not available on mobile"

**You see:** **○ Not available on mobile** in the Library, or "This collection is not available on
mobile." in the Anvil.

**Why:** `.base` and DataviewJS collections do not run on mobile. Built-in and Dataview collections
do. There is no fix on the phone; the collection draws on desktop.

### A file shows "Can't import"

**You see:** in **Import a collection**, a file marked **Can't import**.

**Fix:** select it. The window shows the reason and how to fix the file. Fix it, then open the
window again. The full list of reasons is in
[The Library](library.md#cant-import).

A file is missing from the import window? It must be a `.base` file, or a note with `sf-view:
true` in its frontmatter. Files already in the Library are not listed.

### "Not updated: … was edited"

**You see:** in **Collections from the repo**, "Not updated: <path> was edited after it was
installed, and updating would overwrite those edits."

**Why:** Story Forge won't overwrite a file you changed.

**Fix:** keep your version, or move or rename your edited file and press **Update** again to get
the new version.

### "Not installed: … already exists"

**You see:** "Not installed: <path> already exists. Move, rename or remove it, then install
again."

**Fix:** another file already sits where the entry goes. Move, rename or remove it, or change
**Folder for collections from the repo** in Settings › Library, and install again.

### The Codex says "No characters found"

**You see:** an empty Codex page: "No characters found" (or locations, objects, lore) and "This
collection looks for notes tagged … Nothing matched."

**Why:** no note outside the excluded folders has the collection's tag.

**Fix:** press **Change tag**. It opens the collection's settings with the **Tag** field ready, and
a live count shows how many notes match. Also check **Excluded folders** in the Scope tab. **What
are FileClasses?** opens the metadata-menu documentation on FileClasses.

If the page says "This collection has no tag configured, so nothing can be shown", the collection
has no tag. Story Forge will not fall back to listing the whole vault. Set a tag in
**Settings › Story Forge › Library › Configure**.

### "Collection source missing or unreadable"

**You see:** this line where a Dataview or DataviewJS collection should draw.

**Fix:** Story Forge cannot find or read the note the collection runs. Open **Configure** on the
collection to see its source path. Put the note back there, or import it again from its new place
and remove the old entry.

For a `.base` collection, **Configure** says "File not found: <path>" in the same case.

### The capability screen does not appear again

**Why:** it opens by itself only once, the first time you open the Anvil or the Workbench. Any
close (Got it, ✕ or Escape) is remembered.

**Fix:** open it any time from **Settings › Story Forge › Library › What Story Forge can use…**.

### Undo does not do what you expect

- **Ctrl+Z (Cmd+Z) undoes my typing, not my change.** In a text field you are typing in, the keys
  undo the typing. Click outside the field first, or use the command **Undo last change**.
- **Ctrl+Z does nothing for Story Forge in a note.** Story Forge's undo keys work only while the
  Anvil or the Workbench is the active view. Elsewhere Obsidian's own undo runs.
- **"Save your edit first (<note>)"**: a field for that note still holds an edit that is not
  saved yet. Finish or leave the field, then undo again.
- **The history is gone after a restart.** Check **Keep undo history across restarts** in
  Settings › Behaviour. It is on by default.
- **"Nothing to undo"**: there is no Story Forge change left to undo.

See [Undo](undo.md).

### A collection is "Shown nowhere"

**You see:** "Shown nowhere. Turn on Anvil or Workbench to see it."

**Fix:** turn on its **Anvil** or **Workbench** switch in the Library.

## Debug information

When something does not behave as described, the developer console often says why.

1. Open the developer console: Ctrl+Shift+I on Windows and Linux, Cmd+Option+I on macOS.
2. Choose the **Console** tab.
3. Type `StoryForge` in the filter box.
4. Story Forge's detail lines are debug messages. To see them, enable the **Verbose** level in the
   console's level menu.

Story Forge's messages start with `[StoryForge]`. For example, the capability screen logs why it
did or did not open, such as `[StoryForge] capability screen: not shown — already shown this
session`. A note the import window could not read is logged as `[StoryForge] could not parse
collection candidate`.

If an undo fails with "an unexpected error occurred", the console has the details.

## Getting help

Report a bug or ask a question at
[github.com/MMoMM-org/obsidian-story-forge/issues](https://github.com/MMoMM-org/obsidian-story-forge/issues).

Include:

- your Obsidian version and Story Forge version (shown at the top of the Story Forge settings);
- desktop or mobile;
- whether Bases is on and Dataview is active;
- the message you see, word for word;
- any `[StoryForge]` lines from the console.
