# _forge Claude Code skills — division from the plugin

> What the **_forge Claude Code component** owns, so Story Forge (the plugin)
> doesn't. The plugin **renders and edits frontmatter**; Claude Code **reasons
> over it**. Anything that needs judgement across many notes — continuity,
> plot-holes, warnings — is a Claude skill, not plugin code.

## Why this split

The plugin's job is a fast, declarative, frontmatter-truth reference surface. It
deliberately does **not** compute analysis, detect inconsistencies, or emit
warnings — that is slow, judgemental, and better done by an LLM with the whole
canon in context. Storyline bakes plot-hole/pacing/setup-payoff detection into its
codebase; we push that to Claude Code instead. This keeps the plugin small and the
data un-owned.

## Skills the _forge component should provide

Each is a Claude Code skill run in the vault (read-only over `30 Canon/` +
`40 Timeline/`, proposing changes via `90 Inbox/`, never editing canon directly —
per the vault `00 Meta/CLAUDE.md`).

### `continuity-check`
Compare a draft scene against `30 Canon/` + the scene time model. Report
contradictions, most severe first: character behaviour vs established traits;
physical facts (height, appearance) vs the character note; timeline order
(`storyDay`) vs stated elapsed time in prose; object ownership/state; location
consistency. Output a findings list. Read-only.

### `plot-holes`
Scan the manuscript for unresolved setups and dangling threads: a plotline
(`plotlines`) introduced but never paid off; an object/lore referenced then
dropped; a character present in a scene with no arc progression. Output a
prioritised list of gaps. Read-only.

### `warnings` / canon lint
Lighter, mechanical checks that still need cross-note reasoning: entities linked
in prose but missing a canon note; scenes missing required frontmatter (`pov`,
`location`); `first_appearance` pointing at a non-existent scene; relation fields
that are not reciprocated (A lists B as ally, B doesn't list A). Output a checklist.

### (future) `pacing` / coverage
Optional: character screen-time distribution, act balance, scenes-per-plotline.
Analytical, no judgement on quality — only if wanted later.

## What stays in the plugin

Rendering the facts, following the active note, the interactive views (Kanban,
Plotgrid, Timeline drag → frontmatter), and the Codex. The plugin surfaces the
data these skills reason over; it does not reproduce their reasoning.
