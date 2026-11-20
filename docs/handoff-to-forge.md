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

---

# 2026-11-18 — Spec 010: shipped artifacts

**Why:** spec 010 (ADR-43) makes the generated vault artifacts a **shipped set** that must work in any
vault layout. A shipped FileClass, template or schema note therefore cannot name a folder, a series, or a
demo-vault asset. The dev vault (`test/StoryForge/00 Meta/`) is regenerated from the same `schema/*.json`
and `npm run schema:check` verifies the two agree (27 files equal). Nothing here changes a field name,
type or enum value: **no field was added, renamed or removed.** The changes are defaults, description
text, and what the generator emits. Source of this list: `git diff ea1ad41..HEAD -- schema/`.

## Default changes (these alter what a new note starts with)

| Change | Where | Reason | `_forge` may want to |
|---|---|---|---|
| `series` default `"Forge"` removed | book, character, location, lore, object, plotline, scene | A shipped template must not preset a series name from the demo vault. Descriptions lose "(defaults to the vault's series name)". | Drop the `"Forge"` default and the `{{SERIES_NAME}}` placeholder idea; series starts empty. |
| `character.gender` default `"male"` -> `""` | character | Presetting a gender is a story decision, not a schema default. Empty is a valid option; the template presets none. | Mirror `"default": ""` (generator: `"default": ""` presets none; omitted default still means first value). |
| `character.status` default `"alive"` removed | character | `alive` is already the first value, and the generator's rule is "first value unless `default`". The explicit key was redundant. Behaviour is unchanged. | Remove the redundant key. |

## Schema text changes (descriptions and notes; no behaviour)

- **Folder-free text.** Every entity `note` and field `description` no longer names a vault folder
  (`under 30 Canon/31 Characters/`, `(in 20 Planning/)`, `under 10 Manuscript/<book>/`, "Machine source:
  00 Meta/Templates/entity-location.md" and similar). Affects book, character, character-fantasy,
  location, lore, object, plotline, scene (`book`, `plotlines`, `beat`, `magical_items`).
- **Media examples.** `portrait` / `image` examples use `[[Images/<name>.svg]]` instead of
  `[[95 Assets/<name>.svg]]` (character, location, object).
- **`character.gender` description** now says `nonbinary` (was `non-binary`), matching the actual value;
  adds "or empty". This was a text bug in the schema, not an enum change.
- **`lore.related`** query changed from `dv.pages('"30 Canon"')` (a folder) to `dv.pages("#canon")`
  (the `canon` tag family); description says "notes tagged `canon/...`". Emitted into `fc-lore`.
- **`character-fantasy` `valuesFrom`** paths are now the placeholder `{{sf:fileClassesFolder}}/fc-<list>.md`
  instead of `00 Meta/FileClasses/fc-<list>.md`; descriptions refer to "the value-list note `fc-<list>` in
  the FileClasses folder". The placeholder is resolved when the file is installed into a vault.
- **`folder` is kept in `schema/*.json`** (dev-vault location of the type, used by tooling and tests) but
  is **not emitted** into any artifact. In particular `filesPaths` is emitted empty (the folder values are
  removed), so FileClasses classify by `tagNames` only (see below).

## Generator and artifact changes

- **FileClass `filesPaths` emptied.** `filesPaths` is emitted empty (the folder values are removed), so
  FileClasses classify by `tagNames` only. Checked against the
  28 non-Meta seed notes: 23 classify by tag, 5 have no FileClass (3 READMEs, 2 `type: beat` notes). Under
  the old files two beat notes (`The Failing Light`, `The Gathering Dark`) matched `fc-book` only through
  `filesPaths: 20 Planning` - a false positive (they are beats, not books), so nothing legitimate lost.
  No note relied on `filesPaths`; none classifies by the `fileClass` key.
- **Template bodies are now owned by the generator.** They live in `schema/templates/<template>.md`
  (book, character, location, lore, object, plotline, scene) and are no longer "author content preserved
  across regeneration". A type without a body file gets a minimal `# {{title}}`. Bodies use `{{sf:<folder>}}`
  placeholders and stay folder-free.
- **Value-list notes are generated, empty.** `fc-armor.md`, `fc-combat-skills.md`,
  `fc-magical-abilities.md` are emitted (one per `valuesFrom`) so the FileClass field has something to point
  at. They are value lists, **not FileClasses** (no `fileClass` entry, not part of
  `generatedFileClasses.ts`).
- **`Schema/README.md` is generated** (one row per type) instead of hand-maintained.
- `types.json` (60 widget types), `generatedUiHints.ts` and the artifact index are unaffected in meaning;
  `schema:check` now also gates the shipped set, the index (`dist/artifact-index.json`) and banned
  folder/series text.

## Ask of `_forge`

Nothing blocks StoryForge. If `_forge` keeps its own copy of `schema/*.json` or the templates, mirror
the defaults and text above so a future bundle does not reintroduce `"Forge"`, `male`, the folder prose,
`95 Assets/`, or `filesPaths`. Tell us if `_forge` relies on `filesPaths` classification or on template
bodies being author-owned; both changed here.

## 2026-11-20 addendum: Media field options

FileClass `Media` fields (`portrait` in fc-character, the thumbnails in fc-location and fc-object)
now carry metadata-menu's Media defaults instead of `options: {}`:

```yaml
    options:
      embed: false
      folders: []
      display: card
      thumbnailSize: "100"
```

metadata-menu 0.8.12 reads `options.folders` without a fallback, so its FileClass form crashed on
`options: {}` ("Cannot read properties of undefined (reading 'join')"). Found in the spec 010 live
walk. `_forge`'s FileClasses need the same block.
