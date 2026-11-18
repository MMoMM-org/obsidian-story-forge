# Contributing to Story Forge

This page is for people who build Story Forge or change its code. If you only want to use the
plugin, read the [user documentation](docs/README.md) instead.

## Set up

```bash
git clone https://github.com/MMoMM-org/obsidian-story-forge.git
cd obsidian-story-forge
git config core.hooksPath .githooks
npm install
```

The hooks in `.githooks/` check commit messages (Conventional Commits) and block direct commits
to `main`. Work on a branch.

## Commands

```bash
npm run dev           # esbuild watch; copies each build into the test vault
npm run build         # catalog and artifact index build, tsc check and production build
npm test              # vitest unit tests
npm run typecheck     # tsc --noEmit
npm run lint          # eslint over src/ and stylelint over styles.css
npm run lint:css      # just the stylelint CSS check
npm run schema:gen    # regenerate the vault artifacts from schema/*.json
npm run schema:check  # check that the generated artifacts match schema/*.json
```

After a fresh clone, run `npm run build` (or `catalog:build` + `artifacts:build`) once before
`typecheck` or `test`: both read the generated `dist/*.json` indexes. After a schema change,
`schema:gen` regenerates the dev vault, while `artifacts:build` (part of `build` and `predev`)
regenerates `dist/artifact-index.json`.

`npm run lint` runs stylelint with `stylelint-no-unsupported-browser-features` over
`styles.css`. It reproduces the Obsidian community-plugin bot's CSS browser-compatibility check.
The Chromium version it checks against is the `browserslist` field in `package.json`. Keep it in
line with the Chromium of the Obsidian version in `manifest.json`'s `minAppVersion` when you
raise that.

## The test vault

The example vault is `test/StoryForge/` (the "Wardens of Moonharbor" story). Its `.obsidian/`
folder is not in git, so set it up once:

1. Open `test/StoryForge/` as a vault in Obsidian. This creates its `.obsidian/` folder.
2. Turn on community plugins in that vault.
3. Run `npm run dev`. On every build it copies `main.js`, `styles.css` and `manifest.json` into
   `test/StoryForge/.obsidian/plugins/story-forge/`. It copies real files rather than symlinks,
   because Obsidian does not load symlinked plugin files reliably. If the vault's `.obsidian/`
   folder does not exist, the copy is skipped.
4. Enable **Story Forge** in the vault.

To pick up a new build, toggle Story Forge off and on in **Settings → Community plugins**. With
the [Hot Reload](https://github.com/pjeby/hot-reload) plugin installed in the test vault, this
happens by itself: the build drops the `.hotreload` marker file that Hot Reload looks for.

Test in the real vault early, not only against the unit-test mock. Path handling, layout timing
and the Obsidian API boundary are where most plugin bugs hide, and the mock can't show them.
[docs/live-testing.md](docs/live-testing.md) has the manual checklists.

## Changing the story schema

The story schema is defined in `schema/*.json`. The FileClasses, templates and schema reference
in `test/StoryForge/00 Meta/` are generated from it, and so is `src/editor/generatedUiHints.ts`.
Edit the JSON, then run `npm run schema:gen`; never edit the generated files by hand. Read
[docs/schema-change-runbook.md](docs/schema-change-runbook.md) before you change the schema.

## Design documents

The design and engineering material is listed under
[For contributors](docs/README.md#for-contributors) in the documentation index.
