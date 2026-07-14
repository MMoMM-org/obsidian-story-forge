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
npm run schema:gen    # regenerate vault artifacts from canonical schema/*.json
npm run schema:check  # verify the story frontmatter schema is in sync (gate)
npm run dev           # esbuild watch — redeploys into test/StoryForge/ vault
```

## Changing the story schema

The story-entity schema is canonical in **`schema/*.json`** (see `schema/README.md`). The vault
artifacts under `test/StoryForge/00 Meta/` — FileClasses, entity/scene Templates, and the human
reference `Schema/` — are **generated** from it: edit the JSON, then `npm run schema:gen`.
`npm run schema:check` is the gate. **Before changing the schema, read
`docs/schema-change-runbook.md`** — it covers add/rename/remove, seed-note updates, and the
ripple into the XDD spec. Migration is per type: `scene` is generated from `schema/scene.json`;
the rest are still hand-maintained in the vault (kept green by `schema:check`) until migrated.

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
