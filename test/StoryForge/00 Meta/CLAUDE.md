# Forge — Fiction Vault Canon

> Vault-level instructions for Claude Code. Copied into each series vault's `00 Meta/`.
> The prose content of this vault is **German**; these instructions are English.

## What this vault is

A single fiction series (Forge) with multiple books. It is a plain Markdown
Obsidian vault. Claude helps the author **write** and **verify** — it assists, it does not
author unsupervised.

## Single source of truth

Every entity (character, location, object, lore) is **one canonical note** under `30 Canon/`.
Hard facts live in the **frontmatter Properties**; prose lives in the body. Never create a
second note for an entity that already exists — extend the canonical one.

## Write-zones (default-deny, like MiYo Kado/Tomo)

| Zone | Your rights |
|---|---|
| `10 Manuscript/` | May draft / rewrite prose — only on a Git branch. The author reviews and merges. |
| `20 Planning/` | Collaborative — Snowflake, beats, outlines. |
| `30 Canon/`, `40 Timeline/` | **Read-only.** Propose changes as a note in `90 Inbox/`; never edit canon directly. |

## Git discipline

- Do prose work on a branch named `claude/<short-scene-slug>`.
- Commit small, one scene or one change per commit. Never commit to the vault's default branch.
- Leave the working tree in a state where `git diff` cleanly shows what you changed vs. the author's prose.

## When writing prose

- German, in the author's established voice. Match tone and register of the surrounding scenes.
- Stay inside the beats from `20 Planning/`. Do not invent canon — if a fact is missing, ask or flag it.
- Before writing a scene, read the linked entities' canon notes for continuity.

## When verifying (`/continuity-check`)

Read-only. Compare a draft against `30 Canon/` + `40 Timeline/` and report contradictions
(character behaviour vs. established traits, physical facts, timeline, object/contract
consistency). Do not edit — output a findings list, most severe first.

## Property schemas

See `00 Meta/` templates. Keep property sets small and stable — they are the columns of the
Bases views and the fields `/continuity-check` reasons over.
