# Getting Started — Forge vault

> Shared runbook for the **author** and **Claude**. Read this when a vault is first stamped
> from `_forge/blueprint/vault-template/`, and whenever you need to know what a vault should
> contain or reconfigure. The prose content of this vault is **German**; this file is English.

## What this vault is

One fiction **series** (multiple books) as a plain Markdown Obsidian vault. Every entity
(character, location, object, lore) is **one canonical note** under `30 Canon/`; hard facts
live in frontmatter Properties, prose in the body. Claude helps **write** and **verify** — it
assists, it does not author unsupervised. See `00 Meta/CLAUDE.md` for the canon rules and
write-zones.

```
00 Meta/       Series bible, CLAUDE.md canon, Templates/, FileClasses/
10 Manuscript/ The prose (Longform), per book
20 Planning/   Snowflake → Synopsis → Beats → Outline, per book
30 Canon/      Single-source entities — series-wide  (31 Characters · 32 Locations · 33 Objects · 34 Lore)
40 Timeline/   Calendarium events — series-wide
90 Inbox/      Fleeting / unsorted (default location for new notes)
99 Archive/    Old drafts
```

**Write-zones** (enforced by `00 Meta/CLAUDE.md`): `10 Manuscript/` + `20 Planning/` are
collaborative (Claude drafts on a branch); `30 Canon/` + `40 Timeline/` are **read-only** to
Claude — canon changes are proposed via `90 Inbox/`, never written directly.

## First-time setup checklist

1. **Name the series** — replace `Forge` in `00 Meta/CLAUDE.md` and set the
   `series:` default in the templates under `00 Meta/Templates/`.
2. **Set the hashi instance** — in Obsidian, open *MiYo Tomo Hashi* settings and set the
   instance name + regenerate the IDE-bridge auth token (both are blank in the template —
   see "Reconfigure" below). This is the bridge for the Claude session into the container.
3. **Git** — `git init`, add `.gitignore` (rendered from `dot_gitignore`), baseline commit.
   Then **configure and enable the Obsidian Git plugin** (it ships installed but **disabled**
   on purpose, so it does not interfere with the Docker Claude session during setup).
4. **michael-core** (optional) — for a Michael-shared series, copy `_forge/michael-core/`
   entities into `30 Canon/`. An unrelated series skips this.
5. **Sanity-check rendering** — open a character note and confirm: Meta Bind stat line renders
   (`VIEW[{height}]…`), Dataview queries run, Metadata Menu shows the `fc-character` fields,
   Bases opens the canon. If any fail, check the plugin is enabled + the folder paths below.

## Plugin roster (shipped enabled)

Config travels in the snapshot — plugins open already-configured. Enabled set:

| Plugin | Role |
|---|---|
| longform | Manuscript authoring (scenes → drafts), per-book projects |
| dataview · js-engine | Reference side-panel + canon tables; JS-backed views |
| templater-obsidian | Instantiates the `00 Meta/Templates/` entity + scene templates |
| metadata-menu | Drives the FileClasses (`fc-character`, `fc-character-fantasy`) |
| obsidian-meta-bind-plugin | `VIEW[{…}]` stat lines / portrait view in notes |
| calendarium | `40 Timeline/` events (fresh calendar — set yours up) |
| quickadd | Create entities from templates |
| better-word-count · obsidian-reading-time | Longform progress |
| tag-wrangler · supercharged-links-obsidian · various-complements | Tag + link ergonomics |
| obsidian-style-settings | Theme controls (Blue Topaz ships active) |
| miyo-tomo-hashi | Bridge for the Claude session into the Docker container |

**Shipped installed but DISABLED** (enable after setup):

| Plugin | Why disabled |
|---|---|
| obsidian-git | Configure + enable after setup so it does not fight the Docker Claude session |

Bases is a **core** plugin (enabled) — it renders the canon as a browsable database.

## Reconfigure notes (vault-specific settings to check)

- **hashi** — `chosenInstanceName` and `ideBridgeAuthToken` are **blanked** in the template
  (the token was a live secret and must not be shared). Set both per vault in plugin settings.
- **Templates folder** — Templater + QuickAdd point at `00 Meta/Templates/`; Metadata Menu
  points at `00 Meta/FileClasses/`. Keep those folders (capitalized) or update the paths.
- **Longform** — projects/sessions are empty; the scene template is wired to
  `00 Meta/Templates/scene.md`. Create your book project inside `10 Manuscript/`.
- **New-file location** — new notes land in `90 Inbox/` (`app.json`). Change if you prefer.
- **Theme** — Blue Topaz is active (Shimmering Focus also bundled). Swap freely.

## How Claude works here

Read `00 Meta/CLAUDE.md` first — it defines the write-zones, branch discipline
(`claude/<scene-slug>`, small commits, never on the default branch), and the
`/continuity-check` contract (read-only compare against `30 Canon/` + `40 Timeline/`).
