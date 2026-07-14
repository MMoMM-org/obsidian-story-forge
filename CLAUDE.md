# Story Forge

Property-driven reference panels that follow the active note, showing linked story entities and their fields in the sidebar.

Standalone Obsidian plugin repo (own git repo, no remote required). Seeded from the Kouzou
obsidian-plugin blueprint, then decoupled from MiYo — mirrors the `obsidian-markdown-mason`
sibling. Personal global standards still apply via `~/.claude/CLAUDE.md`; this repo carries
no MiYo project coupling (no `team.md` import, no `_inbox/_outbox` handoff mesh).

## What this plugin is

Story Forge renders **property-driven reference views** that follow the active note. It reads
the facts-as-Properties story canon (the `_forge` model: one canonical note per entity, hard
facts in frontmatter, typed relations as `[[wikilinks]]`) and surfaces the entities linked from
the current note — no single-database lock-in.

Views are a **curated + user-authored library** (the markdown-mason pattern): a catalog of
reviewed views plus views you import from your vault, each an underlying **Bases / Dataview /
DataviewJS** query, managed and consent-gated in-plugin. Two render surfaces: a **sidebar
panel** and a Storyline-style **note panel**.

See `docs/DESIGN.md` for the architecture, the two surfaces, the query-engine model, and the
open decision points.

## Build commands

```bash
npm run build         # tsc check + esbuild production build
npm test              # vitest unit tests
npm run lint          # eslint (obsidianmd rules) + stylelint
npm run typecheck     # tsc --noEmit
npm run schema:check  # verify _forge frontmatter schema is in sync (gate)
npm run dev           # esbuild watch — redeploys into test/StoryForge/ vault
```

## Changing the `_forge` schema

FileClasses (`test/StoryForge/00 Meta/FileClasses/`), entity/scene templates
(`00 Meta/Templates/`), and the human property reference (`00 Meta/Schema/`) must stay in sync;
`npm run schema:check` is the gate. **Before editing any of them, read
`docs/schema-change-runbook.md`** — it lists exactly what to update for add/rename/remove and the
ripple into the XDD spec.

## Memory & context

Routing for `docs/ai/memory/`:
- Repo conventions/style → `general.md`
- Tool/CI/build knowledge → `tools.md`
- Domain/business rules → `domain.md`
- Architectural decisions → `decisions.md`
- Current focus/blockers → `context.md`
- Bugs/fixes → `troubleshooting.md`

## Rules

- Use Plan Mode for any change touching more than 2 files
- Commit after every completed task (Conventional Commits; hooks block direct commits to `main`)
- English for all committed content
- One feature or fix per change
