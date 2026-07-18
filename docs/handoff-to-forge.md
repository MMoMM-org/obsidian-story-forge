# Handoff → `_forge` — decisions StoryForge needs before adopting the 2026-07-18 bundle

**In response to:** the `_forge` bundle vendored at `docs/handoff-from-forge/` (schema SoT + `types.json`
generator + vault infra), reviewed on the StoryForge side on 2026-07-18.

**Governance:** `_forge` is the schema **hub** — it holds the canonical `schema/*.json` and decides all
schema/enum questions. StoryForge implements plugin-side **in its own way** and does **not** patch schema
decisions unilaterally. The items below need a `_forge` ruling before StoryForge adopts them. `_forge`
cannot read StoryForge's repo, so everything needed is embedded here.

**Status of the bundle in StoryForge:** committed as reference only (unchanged); nothing applied yet.

---

## StoryForge state `_forge` needs (embedded — no external read required)

- **Field `type` vocabulary** used across StoryForge `schema/*.json`: `fixed, text, select, relation,
  number, list, tags` (no `boolean` currently used anywhere).
- **Current `select` enums (English keys — canonical values):**
  - `character.role` = `protagonist | deuteragonist | antagonist | supporting | minor`
  - `character.status` = `alive | dead | missing | unknown`
  - `character.gender` = `male | female | diverse | nonbinary`
  - `character-fantasy.species` = `Human | HighElf | DarkElf | WoodElf | Dwarf | Halfling | Orc | Ogre | Beastfolk | Catfolk | Merfolk | Fae | Pixie | Dragonkin | Demon | Undead | Mystical | Other`
  - `location.locationType` = `world | realm | area | landmark | building | room`
  - `lore.scope` = `"world rule" | concept | faction | custom`
  - `object.kind` = `contract | artifact | relic | item`
  - `scene.status` = `idea | outline | draft | revised | done | final`
- **Generated artifacts** per entity type (via `npm run schema:gen`): (1) FileClass `fc-<type>` — enum
  values live here as the metadata-menu `valuesList`; (2) Template; (3) human doc
  `00 Meta/Schema/<entity>.md` (built from each field's `description`). **StoryForge does NOT emit raw
  `schema/*.json` into the vault**, and the canonical `schema/*.json` lives at repo root, not in the vault.
- **Already accepted from the bundle:** `scene.notes` add (pending Q1); `series.default` stays StoryForge's
  `"Forge"` (the bundle's `{{SERIES_NAME}}` is a deploy-time placeholder → ignored). Diff of all 6 schema
  files otherwise confirms **only these two deltas** — no other field/type/enum changes.

---

## Decisions requested

### Q1 — `scene.notes`: canonical `description` string + field position
The bundle says three different things:
- `README.md`: "…not story **prose**" **and** "add it as the **last field**".
- `types-json-artifact.md`: "…not story **content**".
- the actual bundled `schema/scene.json`: places `notes` **before** `series`/`tags` (not last) and uses
  "…scratch/annotations, working reminders. **Not story prose.**"

`description` is data (it generates `00 Meta/Schema/scene.md`), so the exact string matters.
**Please confirm the canonical `description` text and the canonical field position.** Absent a ruling,
StoryForge will use the bundled JSON's string and keep the JSON's position.

### Q2 — `types.json`: how to handle `tags` (the spec contradicts itself)
`types-json-artifact.md`'s mapping table says emit `tags -> tags`, but its note (~lines 68-70) says the
`tags` classifier should maybe be **excluded** (StoryForge's `schema:check` already excludes it).
**Pick one, consistently:** exclude `tags` from `types.json`, or emit `tags -> tags`.

### Q3 — `types.json`: confirm plain author-lists → `multitext`
StoryForge has `list`-typed fields with **no** `relation`/`query` that are **not** reserved names:
`distinctive_features, combat_skills, magical_abilities, weapons, armor, plotlines`. The mapping implies
these → `multitext`. **Confirm** plain author free-text lists should be emitted as `multitext` (vs left to
Obsidian's value-inference). (`aliases` is safe either way via the reserved-name override.)

### Q4 — canonical `scene.status` vocabulary (SoT decision)
StoryForge's current `scene.status` = `idea | outline | draft | revised | done | final`. Because the schema
SoT is influenced from two sides (the StoryForge plugin **and** the real story vault during
implementation), the status vocabulary may have evolved on the vault side. **Please confirm the canonical
status vocabulary** in `_forge`'s schema — this determines what the Action-4 status scripts should
read/step through. (StoryForge deliberately did **not** compare against its local `temp/lauren` copy — it
is known-stale.)

### Q5 — infra language: English displays
The bundled infra (`infra/Scripts/*` `Notice` strings, both `infra/Bases/*.base` displayNames + view
names, `infra/dataview-views/active-scenes.js`) is **German**. StoryForge is **English-only** (plugin +
generated vault content). Direction: **the shared/blueprint infra displays should be authored in
English**; German display is Lauren's concern (a runtime EN→DE swap when Longform runs), **not** baked
into the shared infra. Please make `_forge`'s infra **English-first** so StoryForge can adopt it directly.

### Q6 — Action-4 read path does not exist in a StoryForge vault (+ Longform coupling)
Action-4's scripts (`infra/Scripts/scene-status-set.js`, `scene-status-advance.js`) read the enum at
runtime from `00 Meta/Schema/scene.json`. **StoryForge never generates that file** — it emits
`00 Meta/Schema/scene.md` (human doc) and keeps enum values in the FileClass `valuesList`. As shipped, the
scripts **always** hit their hardcoded fallback in a StoryForge-generated vault, so the "drift-proof
enum SoT" is lost. If a runtime enum-SoT is the goal, please decide the **canonical machine-readable read
source** so both hubs agree — e.g. (a) also emit a machine-readable `00 Meta/Schema/*.json`, or (b) have
the scripts read the FileClass `valuesList`. **Also:** `active-scenes.js` hard-couples to the **Longform**
plugin's `data.json` (`selectedDraftVaultPath`) for the scene folder — confirm whether a hard Longform
dependency is acceptable for general-purpose infra, or it should fall back to the schema's scene folder
(`10 Manuscript`).

---

## What StoryForge will do once each is answered
- **Action 1** (`scene.notes`): adopt immediately after **Q1**.
- **Action 2** (`types.json` as a 4th generated artifact): implement after **Q2 + Q3**.
- **Action 3** (vault infra): adopt after **Q5** (English infra) + the Longform decision in **Q6**.
- **Action 4** (single-source enum scripts): implement after **Q4 + Q6** (canonical vocab + read path).

Nothing is applied on the StoryForge side until these are resolved.
