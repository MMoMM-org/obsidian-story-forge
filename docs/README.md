# Documentation

## Overview

Story Forge is an Obsidian plugin for fiction writers who keep their story in notes. Each
character, location, object, piece of lore, plotline and scene is a note, and its facts are plain
properties in that note's frontmatter. Story Forge reads those properties and shows your story
back to you: the **Workbench** in the sidebar follows the note you have open and shows what it is
linked to, and the **Anvil** in the main area holds the Codex, Timeline, Plotlines, Kanban and
Plotgrid. You decide what the Codex shows in the **Library**. Story Forge never takes ownership of
your story: every story fact it writes is a plain property in your own notes.

## Documentation map

- [Installation](installation.md)
- [Getting started](getting-started.md)
- [The Anvil](anvil.md)
- [The Workbench](workbench.md)
- [The Library](library.md)
- [FileClasses and the editor](fileclasses.md)
- [Optional plugins](optional-plugins.md)
- [Undo](undo.md)
- [Configuration](configuration.md)
- [Commands](commands-reference.md)
- [Troubleshooting](troubleshooting.md)

## Quick links

- **Add a collection to the Codex:** [Importing from your vault](library.md#importing-from-your-vault)
  or [Browsing the repo](library.md#browsing-the-repo).
- **Find out what Bases or Dataview would add:** [Optional plugins](optional-plugins.md).
- **Fix a collection that doesn't draw:** [Troubleshooting](troubleshooting.md#common-issues).

## For contributors

The other files in `docs/` are design and engineering material, not user documentation. They
describe how Story Forge is built and why, and may describe plans that have changed.

- [DESIGN.md](DESIGN.md): architecture, the surfaces and the query-engine model.
- [views-and-integration.md](views-and-integration.md): which views ship and how they fit with
  Longform and other plugins.
- [schema-change-runbook.md](schema-change-runbook.md): how to change the story frontmatter
  schema.
- [live-testing.md](live-testing.md): manual live-testing checklists for the test vault.
- [gap-analysis.md](gap-analysis.md): what the design promised against what the code does.
- [storyline-analysis.md](storyline-analysis.md): what Story Forge takes from Storyline.
- [view-roadmap.md](view-roadmap.md): per-view build specs and phasing.
- [build-plan.md](build-plan.md): the milestone plan.
- [XDD/specs/](XDD/specs/): the feature specifications (requirements, solution design, plans,
  mockups and decision logs).
