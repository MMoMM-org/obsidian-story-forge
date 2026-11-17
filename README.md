# Story Forge

Story Forge shows your story notes back to you inside Obsidian: the **Anvil**, a main-area view
with your characters, places and lore as cards plus a scene Timeline, Plotgrid, Plotlines and
status Board, and the **Workbench**, a sidebar that follows the note you have open and shows
what it links to, such as a scene's characters and location.

## Installation

See [docs/installation.md](docs/installation.md) for requirements, verification and updating.

### Community Plugins (not available yet)

Story Forge is not listed in Obsidian's Community Plugins directory yet. Use a manual install or
BRAT until it is. Once it is listed:

1. Open **Settings → Community plugins**
2. Search for "Story Forge"
3. Install and enable

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

## Undo

Story Forge keeps its own undo history for the field changes it writes; see [docs/undo.md](docs/undo.md).

## Contributing

To build Story Forge or work on it, see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT - see [LICENSE](LICENSE)
