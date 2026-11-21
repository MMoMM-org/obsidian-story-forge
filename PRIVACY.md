# Privacy Policy: Story Forge

_Last updated: 2026-11-21._

## Summary

Story Forge works entirely on your machine. It makes no network requests, has no accounts and
collects no telemetry or analytics. Your vault content is never uploaded.

## Vault access

Story Forge asks Obsidian for the list of files in your vault. Obsidian's community directory
flags this as "vault enumeration", because the list gives a plugin every file path in the vault.
Story Forge needs the list because your story entities can live in any folder: it finds them
by their frontmatter, not by where they are.

| What it lists | Why | What it looks at |
|---|---|---|
| All notes | Find scenes and plotlines for the Workbench and the Anvil, and build the tag index for Codex filters | Each note's path, frontmatter `type` and tags, from Obsidian's metadata cache |
| Notes in your FileClass folder | Read the FileClasses that define the editor's fields | Their frontmatter |
| All notes and `.base` files | Offer the ones marked `sf-view: true`, and your `.base` files, as collections to import | Each note's frontmatter, and the file extension |
| All files | Fill the image picker, when you open it | File paths of images |

The file list and the metadata stay in memory and are not stored or sent anywhere. Story Forge
reads the full text of a file only when it needs it: a collection you import or open, its
DataviewJS code before you consent, and the story files it manages during **Set up story
files**. Folder exclusions in settings take notes out of what Story Forge shows; they do
not shorten the list Obsidian gives the plugin.

## What Story Forge writes

Story Forge writes only in the cases below.

| What | When | Where |
|---|---|---|
| Frontmatter fields of a story note | When you save an edit in the Anvil editor or the Workbench, or move a card on the Board, and when you undo or redo such a change. Written with Obsidian's frontmatter API. | The note you edited |
| FileClasses, templates and schema notes | Only after you confirm in **Set up story files** | The folders you chose in settings |
| A collection (`.base` or `.md` file) from the repo | Only when you install it from the repo browser | Your "Folder for collections from the repo" |
| Settings, collection list, install records | When you change a setting or install or remove a collection | `.obsidian/plugins/story-forge/data.json` |
| Undo history | After each change Story Forge makes to a note | `.obsidian/plugins/story-forge/undo-journal.json` |

A bare click never writes, and Story Forge does not overwrite a story file you have
edited. The undo history holds the old and new values of the fields Story Forge changed, so it
can contain text from your notes. It stays in the plugin folder.

## DataviewJS

A DataviewJS collection is JavaScript. Story Forge shows you the code and runs it, through the
Dataview plugin, only after you consent. If the code changes, Story Forge asks again. Bases and
Dataview (DQL) collections run no code.

## What Story Forge does not do

- **No telemetry.** No usage events, crash reports or analytics.
- **No third-party tracking.** No advertising IDs, cookies or fingerprinting.
- **No network use.** No hosts are contacted, and no account is needed. The list of collections
  you can install from the repo is bundled in the plugin itself.
- **No credentials.** Story Forge stores no tokens or API keys.

## Data retention

Uninstalling the plugin removes its bundle from `.obsidian/plugins/story-forge/`. Files Story
Forge created in your vault (story files, installed collections) and the changes it made to
your notes stay, because they are your notes. Delete the plugin folder to remove `data.json`
and `undo-journal.json`.

## Open source

- Source code: https://github.com/MMoMM-org/obsidian-story-forge
- Issue tracker: https://github.com/MMoMM-org/obsidian-story-forge/issues
- License: MIT
- Dependencies: see `package-lock.json`; security reporting is in `SECURITY.md`.

## Contact

Privacy-relevant bug reports: open an issue at the tracker above, or email `marcus@mmomm.org`.

## Changes to this policy

Changes are announced in the release notes and in `CHANGELOG.md`.
