---
type: meta
name: "Create canon entity — Workflow"
tags: [meta/doc]
---

# Create canon entity

How a character, location, object, or lore entry is created as a **canonical** note in `30 Canon/`. Canon is the **single source of truth** per entity: hard facts in the frontmatter (Properties), prose in the body. Plot does **not** belong here (it lives in beats/scenes) — this is where entity facts live.

> **Write-zone — read-only.** `30 Canon/` (and `40 Timeline/`) are write-protected: **Claude proposes**, the **author writes**. A new or changed entity is delivered as a proposal (diff or note in `90 Inbox/`), not written directly to `30 Canon/`.

## Before creating

**Does the entity already exist?** A single-source principle: exactly **one** note per entity. Search first (name, aliases) before creating a new one — otherwise you risk splitting facts across two notes. If one exists, it is **extended**, not duplicated.

## Folder, tag, FileClass

The `type`/tag determines the folder **and** the automatically bound FileClass (metadata-menu binds via the tag):

| Kind | Folder | `type` | Tag | FileClass |
|---|---|---|---|---|
| Character | `30 Canon/31 Characters/` | `character` | `canon/character` | `fc-character` (+ `fc-character-fantasy`) |
| Location | `30 Canon/32 Locations/` | `location` | `canon/location` | — |
| Object | `30 Canon/33 Objects/` | `object` | `canon/object` | — |
| Lore | `30 Canon/34 Lore/` | `lore` | `canon/lore` | — |

There is (as yet) **no** Templater template for canon — the note is created by hand or as a copy of an existing sibling note, then the frontmatter is adjusted.

## Frontmatter per kind

**Every entity:** `type`, `name`, `aliases`, `series: Forge`, `tags: [canon/<kind>]`, `first_appearance` (wikilink to the scene of the first appearance).

| Kind | Additional fields |
|---|---|
| Character | `role`/`status`/`gender` (enums), `age`, `occupation`, `height`/`build`/`hair`/`eyes`, `distinctive_features` (array), `nickname`, `tagline`, `portrait`, and the typed relations `significant_other`/`family`/`friends`/`allies`/`enemies` (each a `[[wikilink]]` list) |
| Location | `locationType`, `world`, `region`, `inhabitants` (`[[wikilink]]` list) |
| Object | `owner` (`[[wikilink]]`), `kind` (`contract`\|`artifact`\|`relic`\|`item`) |
| Lore | `scope`, `related` (`[[wikilink]]` list) |

## Body (prose)

Below the frontmatter comes the prose in sections. **Characters** (the most detailed type) have, among others: Overview, Appearance, Personality, Background, Goals & Motivation, Fears, Strengths, Weaknesses, Habits & Quirks, Relationships, Character Arc, Notes. The **Appearance** section holds a **meta-bind/`VIEW[…]` status line** that pulls height/build/hair/eyes from the frontmatter — so the fact source stays the frontmatter, the prose is only the elaboration. Locations/objects/lore are leaner (Overview + whatever the entity needs).

## Conventions

- **Clean file names:** no `@`, no `(Character)`/`(Location)`, **no** number prefix — the file name is the entity name (e.g. `Michael Ritter.md`).
- **Enum values in English** (`role: antagonist`, `status: alive`, `kind: contract`, `gender: male`), **free text in English too** (`build: athletic`, `hair: "…"`, `region: "…"`).
- **Relations are real `[[wikilinks]]`** in the Properties (graph/backlink/rename-safe), in quotes. Where it makes sense, link both ways (A `friends: [[B]]` ↔ B `friends: [[A]]`).
- The vault uses **name-based links** — moving breaks nothing; **renaming** needs link redirects.

## Flow (as a proposal)

1. **Check** whether the entity already exists (name/aliases). If so → propose an extension.
2. **Choose the kind** → folder/tag/FileClass (table above).
3. **Fill the frontmatter** (common fields + kind-specific ones).
4. **Write the body** (sections per kind; character with the status line in Appearance).
5. **Set relations** as `[[wikilinks]]`, both ways where possible; link `first_appearance`.
6. **Deliver as a proposal** (diff / `90 Inbox/`) — the **author** creates the note in `30 Canon/`. If a fact is missing, it is marked as a *canon gap*, **not invented**.

## Related

- [[Continuity-Check]] — checks scenes against exactly these canon facts (and reports *canon gaps*).
- [[Create-Scene]] — a scene's `characters`/`location`/`pov` point to these notes.
- `00 Meta/CLAUDE.md` — schema reference and write-zone rules.
- [[README]] (`30 Canon`) — overview of the canon zone.
