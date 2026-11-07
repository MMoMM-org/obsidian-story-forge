# Story Forge

Property-driven reference panels that follow the active note, showing linked story entities and their fields in the sidebar.

## Installation

### Community Plugins (after listing)
1. Open Obsidian Settings → Community Plugins
2. Search for "Story Forge"
3. Install and enable

### Manual
1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/MMoMM-org/obsidian-story-forge/releases/latest)
2. Create folder `<vault>/.obsidian/plugins/story-forge/`
3. Copy the downloaded files into that folder
4. Restart Obsidian and enable the plugin

### BRAT (Beta)
1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat)
2. Add beta plugin: `MMoMM-org/obsidian-story-forge`

## Usage

<!-- Describe how to use the plugin -->

## Undo

Story Forge keeps an undo history of the field changes it writes to your notes. Undo and redo are in the Anvil and Workbench (the ↶ and ↷ buttons, or Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z while one of them is active) and in the command palette: **Story Forge: Undo last change** and **Story Forge: Redo last change**.

- **Values are restored, not formatting.** Undo puts the earlier value back. It does not restore how the frontmatter was laid out.
- **Only Story Forge's own writes are undone.** Hand edits in the note, scripts, other plugins and sync changes are not. Use the editor's own undo for those. If a field was changed elsewhere since, undo still restores the earlier value, and redo brings back the value it replaced.
- **The history holds copies of field values from your notes.** It keeps up to 50 steps and is stored in `.obsidian/plugins/story-forge/undo-journal.json`. Keep that file out of git, for example by ignoring `.obsidian/plugins/story-forge/undo-journal.json`.
- **The history is per device.** Obsidian Sync does not transfer it (it syncs only the plugin's known files). Other sync tools that copy the plugin folder may copy it; that is your choice.
- **Links go stale.** A link stored in the history (a `[[wikilink]]` value) still points at the old name if its target is renamed afterwards.
- **No default hotkey.** The two commands ship without one. Binding a command to Cmd/Ctrl+Z globally also takes over Obsidian's editor undo and redo, so do that only if you want it.

In Settings → Story Forge, **Keep undo history across restarts** turns the stored file on or off (turning it off deletes it), and **Clear undo history** empties undo and redo. Neither changes your notes.

## Development

```bash
git clone https://github.com/MMoMM-org/obsidian-story-forge.git
cd obsidian-story-forge
git config core.hooksPath .githooks
npm install
npm run dev       # Watch mode
npm run build     # Production build
npm test          # Run tests
npm run lint      # Lint src/ (eslint) + styles.css (stylelint)
npm run lint:css  # Just the CSS browser-compat check
```

`npm run lint` also runs stylelint with `stylelint-no-unsupported-browser-features`
over `styles.css`, reproducing the Obsidian community-plugin bot's CSS
browser-compat check locally. The Chromium floor it validates against is the
`browserslist` field in `package.json` (template default `chrome 114` for
`minAppVersion` 1.5.7) — **bump it to match your own `minAppVersion`'s Chromium**
when you raise the floor (Obsidian 1.6.5 / Electron 30 → `chrome 124`).

### Hot-reload vault for development

Plugin development is dramatically faster (~30x per iteration) when the build output is symlinked into a dedicated test vault that can be reload-cycled via `Settings → Community Plugins → toggle off, then on`, rather than restarting Obsidian.

**One-time setup:**

1. Create the test vault directory structure inside the repo:

   ```
   test/story-forge/
   ├── .obsidian/
   │   └── plugins/
   │       └── story-forge/   # this is what you symlink to
   └── (test notes go here)
   ```

   Add `test/story-forge/.obsidian/workspace*` to `.gitignore` (per-developer state).

2. Symlink build outputs into the plugin folder:

   ```bash
   cd test/story-forge/.obsidian/plugins/story-forge/
   ln -s ../../../../../main.js main.js
   ln -s ../../../../../manifest.json manifest.json
   ln -s ../../../../../styles.css styles.css 2>/dev/null || true
   ```

3. Open the test vault in Obsidian, enable the plugin under Community Plugins.

**Iteration loop:**

```bash
npm run dev    # esbuild watch — rebuilds main.js on every save
```

When you change source: switch to Obsidian → Settings → Community Plugins → toggle the plugin off, then on. The new build is loaded.

**First-light gate.** Don't wait until feature-complete to exercise the plugin in a real vault. UI and API-boundary code carry roughly 80% of plugin bugs but ~30% of LOC, and unit tests against the Obsidian mock cannot catch path conventions, vault-modify-vs-adapter mistakes, popout-window assumptions, or layout-ready timing. Schedule a real-vault smoke session at ~50% of total scope and again before any milestone.

### Diagnostics for external APIs

If this plugin integrates with an external HTTP API or daemon, copy `scripts/api-inspect.template.mjs` to `scripts/<service>-inspect.mjs` and adapt the `BASE_URL` / auth scheme. Use it from day 1 — when an integration bug appears, the SDK's error message rarely tells you whether the bug is auth, path, content-type, or schema. Raw HTTP status + headers + body usually localises in seconds. Observed usage in MiYo: Dropbox path-prefix bugs (archivist), Docker daemon attach hangs (Hashi).

## License

MIT - see [LICENSE](LICENSE)
