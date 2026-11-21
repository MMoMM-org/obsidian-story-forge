# Story Forge

Story Forge shows your story notes back to you inside Obsidian: the **Anvil**, a main-area view
with your characters, places and lore as cards plus a scene Timeline, Plotgrid, Plotlines and
status Board, and the **Workbench**, a sidebar that follows the note you have open and shows
what it links to, such as a scene's characters and location.

## Installation

Install Story Forge from **Settings → Community plugins → Browse** once it is listed there
(search "Story Forge", then **Install** and **Enable**). Until then, install it manually or
with BRAT, below. Requirements, verification and updating are in
[docs/installation.md](docs/installation.md).

### Manual
1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/MMoMM-org/obsidian-story-forge/releases/latest)
2. Create folder `<vault>/.obsidian/plugins/story-forge/`
3. Copy the downloaded files into that folder
4. Restart Obsidian and enable the plugin

### BRAT (Beta)
1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat), a community plugin that
   installs plugins straight from GitHub
2. Add beta plugin: `MMoMM-org/obsidian-story-forge`

## Usage

Story Forge reads plain notes: one note per story entity, facts as Properties (the frontmatter
at the top of the note) and relations as `[[wikilinks]]` in those Properties. It never owns your
story data.

- **Anvil** (main area, **Open Anvil**): Codex cards, Timeline, Plotgrid, Plotlines and a
  status Board, with an editor pane for the selected entry. See [docs/anvil.md](docs/anvil.md).
- **Workbench** (right sidebar, **Open Workbench**): the active note's story context, a scene
  Navigator and your collection tabs. See [docs/workbench.md](docs/workbench.md).
- **Library** (Settings → Story Forge): collections and Cards. See [docs/library.md](docs/library.md).

New here? Start with [Getting started](docs/getting-started.md). The full documentation is in
[docs/README.md](docs/README.md), and the terms are explained in the
[Glossary](docs/glossary.md).

## What Story Forge does to your vault

- **No network.** It makes no network requests, has no accounts and sends no telemetry. The
  catalog of ready-made collections is bundled in the plugin; nothing is downloaded.
- **Reads the file list.** It asks Obsidian for the list of files in your vault and reads
  each note's frontmatter and tags from Obsidian's metadata cache, to find your story entities
  wherever they are. The list stays in memory. Obsidian's community directory flags this as
  "vault enumeration".
- **Your story notes.** It changes a note's frontmatter (Properties) only when you save an edit
  in the Anvil editor or the Workbench, or move a card on the Board. Each change is written with
  Obsidian's own frontmatter API, one field at a time, and nothing is written on a bare click.
- **Set up story files** (Settings → Story Forge) creates FileClasses, templates and schema
  notes in your vault, only after you confirm in the dialog. It never overwrites a file you
  edited.
- **Collections from the repo** write one `.base` or `.md` file into your chosen folder, only
  when you install one.
- **DataviewJS collections run code** (through the Dataview plugin), and only after you have
  read the code and consented. Bases and Dataview (DQL) collections run no code.
- **In the plugin folder** (`.obsidian/plugins/story-forge/`): `data.json` holds your settings
  and collection list, and `undo-journal.json` holds the undo history.

See [PRIVACY.md](PRIVACY.md) for the details.

## Undo

Story Forge keeps its own undo history for the field changes it writes; see [docs/undo.md](docs/undo.md).

## Contributing

To build Story Forge or work on it, see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT - see [LICENSE](LICENSE)
