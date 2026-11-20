# Privacy Policy: Story Forge

_Last updated: 2026-11-20 (version 0.2.0)._

## Summary

Story Forge works entirely on your machine. It makes no network requests, has no accounts and
collects no telemetry or analytics. Your vault content is never uploaded.

## What Story Forge reads and writes

Story Forge reads the notes in your vault to show your story entities. It writes only in the
cases below.

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
