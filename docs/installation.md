# Installation

## Prerequisites

- **Obsidian 1.12.7 or later.** This is the oldest version Story Forge supports. To check your
  version, open **Settings → General** and look for the current version.
- Story Forge runs on desktop and mobile, but two kinds of collections don't draw on mobile:
  collections from a `.base` file (Bases) and DataviewJS collections. The built-in
  collections and plain Dataview collections do draw on mobile. See [Optional plugins](optional-plugins.md).

No other plugin is required. Story Forge reads your notes' Properties directly.

## Before you start: Restricted mode

Obsidian runs no community plugin while **Restricted mode** is on. Restricted mode is
Obsidian's safety switch that keeps all community plugins off. Every install method below needs
it off: open **Settings → Community plugins** and select **Turn on community plugins** (or turn
off **Restricted mode**).

## Install from Community Plugins

This is the preferred way. Story Forge is not listed in Obsidian's Community Plugins directory
yet. Once Story Forge is listed:

1. Open **Settings → Community plugins**.
2. Select **Browse** and search for "Story Forge".
3. Select **Install**, then **Enable**.

Until it is listed, use BRAT or install manually, below.

## Install with BRAT

[BRAT](https://github.com/TfTHacker/obsidian42-brat) is a community plugin that installs other
plugins, including beta versions, straight from GitHub.

1. Install and enable BRAT from Community Plugins.
2. In BRAT's settings, add a beta plugin with the repository `MMoMM-org/obsidian-story-forge`.
3. Enable **Story Forge** under **Settings → Community plugins**.

## Install manually

1. Download `main.js`, `manifest.json` and `styles.css` from the
   [latest release](https://github.com/MMoMM-org/obsidian-story-forge/releases/latest).
2. Find your vault's config folder. It is called `.obsidian` and sits at the top of your vault
   folder, unless you changed it under **Settings → Files and links → Override config folder**.
   Its name starts with a dot, so your file manager may hide it: on macOS, press
   Cmd+Shift+. in Finder to show hidden files; on Windows, turn on **Hidden items** in File
   Explorer's **View** menu.
3. In that folder, create the folder `plugins/story-forge/`, so the full path is
   `.obsidian/plugins/story-forge/`.
4. Copy the three files into that folder.
5. Restart Obsidian. Or, instead of restarting, open **Settings → Community plugins** and
   select the reload button (the circular arrow next to **Installed plugins**) so Obsidian sees
   the new folder.
6. Enable **Story Forge** under **Installed plugins**.

## Verify the installation

When Story Forge is enabled:

- A book icon appears in the left ribbon (the narrow strip of icons at the left edge of the
  window). Hover over it to see the tooltip "Story Forge: open Workbench". Select it, and the
  Workbench opens in the right sidebar.
- The command palette (Cmd/Ctrl+P) lists **Story Forge: Open Anvil**,
  **Story Forge: Open Workbench** and **Story Forge: Set up story files**.
- **Settings → Story Forge** shows the plugin's name and version at the top, and the settings
  tabs **Library**, **Scope** and **Behaviour**.

The first time you open the Anvil or the Workbench, Story Forge shows a short screen called
**What Story Forge can use**. You can open it again later from the Library settings.

<!-- screenshot: the ribbon icon tooltip and the empty Workbench in the right sidebar -->

If the icon, the commands or the settings are missing, check that Restricted mode is off and
Story Forge is enabled under **Installed plugins**. For a manual install, check that the three
files are directly inside `.obsidian/plugins/story-forge/`, not in a subfolder. Still missing?
See [Troubleshooting](troubleshooting.md#debug-information).

Installing the plugin does not add any files to your vault. The FileClasses, templates and
schema notes come from **Set up story files**, which you run yourself. Next, read
[Getting started](getting-started.md).

## Updating

- **Community Plugins:** open **Settings → Community plugins** and select **Check for updates**.
- **Manual:** download the three files from the newest release, replace the ones in
  `.obsidian/plugins/story-forge/`, and restart Obsidian.
- **BRAT:** use BRAT's own update check.

Updating never changes your notes. Your settings and Library are kept. A new version may ship
newer story files (FileClasses, templates, schema notes); Story Forge does not write them by
itself. Settings → Story Forge → Library then shows a hint, and you review the updates in
**Set up story files**. See [FileClasses and the editor](fileclasses.md#updating-story-files).
