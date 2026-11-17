# Installation

## Prerequisites

- **Obsidian 1.12.7 or later.** This is the oldest version Story Forge supports.
- Story Forge is not limited to desktop. Some collections need the core Bases plugin or the
  Dataview community plugin, and a few features are not available on mobile (DataviewJS
  views, for example). See [Optional plugins](optional-plugins.md).

No other plugin is required. Story Forge reads your notes' Properties directly.

## Install from Community Plugins

Story Forge is not listed in Obsidian's Community Plugins directory yet. Once it is:

1. Open **Settings → Community plugins** and turn off Restricted mode if it is on.
2. Select **Browse** and search for "Story Forge".
3. Select **Install**, then **Enable**.

Until then, use one of the two methods below.

## Install manually

1. Download `main.js`, `manifest.json` and `styles.css` from the
   [latest release](https://github.com/MMoMM-org/obsidian-story-forge/releases/latest).
2. In your vault, create the folder `.obsidian/plugins/story-forge/`. If your vault uses a
   different config folder than `.obsidian`, use that one instead.
3. Copy the three files into that folder.
4. Restart Obsidian, or reload the plugin list, then enable **Story Forge** under
   **Settings → Community plugins**.

## Install with BRAT

[BRAT](https://github.com/TfTHacker/obsidian42-brat) installs plugins straight from GitHub.

1. Install and enable BRAT from Community Plugins.
2. In BRAT's settings, add a beta plugin with the repository `MMoMM-org/obsidian-story-forge`.
3. Enable **Story Forge** under **Settings → Community plugins**.

## Verify the installation

When Story Forge is enabled:

- A book icon appears in the left ribbon. Hover over it to see **Story Forge: open Workbench**.
  Select it, and the Workbench opens in the right sidebar.
- The command palette (Cmd/Ctrl+P) lists **Story Forge: Open Anvil** and
  **Story Forge: Open Workbench**.
- **Settings → Story Forge** shows the settings tabs **Library**, **Scope** and **Behaviour**.

The first time you open the Anvil or the Workbench, Story Forge shows a short screen called
**What optional plugins add**. You can open it again later from the Library settings.

<!-- screenshot: the ribbon icon tooltip and the empty Workbench in the right sidebar -->

Next, read [Getting started](getting-started.md).

## Updating

- **Community Plugins:** open **Settings → Community plugins** and select **Check for updates**.
- **Manual:** download the three files from the newest release, replace the ones in
  `.obsidian/plugins/story-forge/`, and reload the plugin.
- **BRAT:** use BRAT's own update check.

Updating never changes your notes. Your settings and Library are kept.
