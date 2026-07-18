# Handoff from `_forge` — add `types.json` as a 4th generated artifact

> **Source:** the `_forge` schema-hub session (2026-07-17). This is a *suggestion* to
> implement inside StoryForge — `_forge` cannot reach this repo and this repo cannot reach
> `_forge`, so everything you need is embedded below. Nothing here requires reading `_forge`.
>
> **Status:** proposal / not yet implemented. Left untracked for the next StoryForge schema
> session to pick up, branch, and implement.

## Why

StoryForge's `schema:gen` produces **three** artifacts per entity type (FileClass, Template,
human `Schema/` doc) and `schema:check` gates that they agree. But Obsidian has a **fourth**
schema-derived surface that is currently unmanaged: **`.obsidian/types.json`**.

`types.json` is Obsidian's *vault-wide* property-type registry — a flat `{"types": {name:
type}}` map that sets the **editor widget** per property name (date-picker, checkbox, link
list, number). It is a global namespace: one property name → exactly one widget type for the
whole vault. Properties absent from it fall back to value-inference.

Right now the test-vaults' `types.json` (`test/StoryForge/.obsidian/types.json`,
`temp/lauren/.obsidian/types.json`) do **not** carry the schema fields — they are hand/Obsidian
-managed and drift silently from `schema/*.json`. `_forge` just closed this gap on its side
(a merge-only generator + a deploy gate). StoryForge, as the canonical schema owner, should
generate and gate `types.json` too.

## The mapping (StoryForge `schema` field type → Obsidian native widget type)

| `schema/*.json` field `type` | Obsidian native (`types.json` value) |
|---|---|
| `fixed`     | `text` |
| `text`      | `text` |
| `select`    | `text` |
| `relation`  | `text`  (a single `[[link]]` is a text scalar) |
| `number`    | `number` |
| `list` (with `relation` or `query`) | `multitext` |
| `list` (plain text, e.g. `aliases`) | `multitext` — **except** reserved names below |
| `tags`      | **excluded** — never emitted (see the rule below) |

**Reserved names** — Obsidian fixes these regardless of the schema type (a `list`-typed
`aliases` field must still be the special widget):

```
aliases    -> aliases
cssclasses -> multitext
```

Valid native values, nothing else may be emitted:
`text, number, checkbox, date, datetime, multitext, tags, aliases`.

## The hard rule: **merge, never overwrite**

`types.json` also holds many keys **no schema owns** and that must survive untouched:
Breadcrumbs (`BC-*`), Tasks (`TQ_*`), the special `aliases`/`tags`, relation fields, etc.
The generator must therefore:

1. **preserve every existing key** and its order; only *append* new schema-derived keys;
2. treat a schema key whose native type **differs** from the one already in `types.json` as a
   **conflict** — report it and **keep the existing value** (do not clobber) unless an explicit
   `--force`. (This protects e.g. `aliases -> aliases` from being flattened to `multitext`.)
3. **never remove** a key.
4. a `--check` mode = dry-run drift gate (exit 1 on drift), no write — wire it into
   `npm run schema:check` next to the existing three-artifact check.
5. cross-type clash guard: if two `schema/*.json` files give the same property name different
   native types, that is fatal (the vault namespace can't hold both) — fail loudly.

**`tags` is excluded** (ruling Q2, 2026-07-18): the `tags` classifier is not a FileClass field
(it is the note's tag, handled by `tagNames`/`mapWithTag`), Obsidian types it natively, and
`schema:check` already excludes it — so never emit it into `types.json`. Skip any field whose
`type` is `tags`. The reference `gen-types-json.py` enforces this with `SKIP = {"tags"}`.

## Reference algorithm (implement in `scripts/schema-gen.mjs` + `schema-check.mjs`)

```
derived = {}                        # name -> native type, from every schema/*.json field
for each schema file, for each field:
    native = RESERVED[field.name] ?? MAP[field.type]
    if field.name in derived and derived[field.name] != native: FATAL (cross-type clash)
    derived[field.name] = native

registry = load(test/StoryForge/.obsidian/types.json)   # Ordered- preserve key order
for name, native in derived:
    if name not in registry.types:      registry.types[name] = native    # safe add
    elif registry.types[name] == native: unchanged
    else:                               CONFLICT -> keep existing unless --force
# never delete a key
--check: report adds/conflicts, write nothing, exit 1 if any drift
default: apply safe adds; report conflicts; exit 1 if unresolved
--force: also apply conflicting type changes
```

`_forge`'s implementation is a ~180-line Python script (`blueprint/gen-types-json.py`) with a
`--fileclasses DIR` / `--types-json FILE` interface so a deploy step can gate the exact copies
it ships. In StoryForge the natural home is JS inside the existing `schema-gen.mjs` /
`schema-check.mjs`, reading `schema/*.json` directly (richer than the FileClass) and writing the
test-vault `types.json`. Do it for **both** test-vaults if both are generated targets.

## Reconcile note — `scene.act`

`_forge` set `scene.act` = **number** (canonical). StoryForge's `schema/scene.json` **already**
has `act: number` — so we are aligned, no change needed on your side. (Recorded here only so the
decision is traceable: `chapter` stays `text` for labels like `1a`/`Prologue`; `act` is purely
numeric.)

## Inbound schema addition — `scene.notes` (ACTION: add to `schema/scene.json`)

The real Lauren vault carries a **`notes`** field on scenes (free-text author annotations,
present in all 26 scene notes) that neither the blueprint nor StoryForge's `scene.json` had —
surfaced when `_forge`'s deploy schema-guard blocked overwriting it. Per the schema-hub model
(real-vault feedback flows Lauren → `_forge` → StoryForge), it was **adopted canonically** in
`_forge`. Add it to StoryForge's `schema/scene.json` too, as the last field:

```jsonc
{ "name": "notes", "type": "text",
  "description": "Text. Free-form author notes about the scene — scratch/annotations, not story content." }
```

Then `npm run schema:gen` + `schema:check` to regenerate the artifacts (and, once you implement
the types.json artifact above, `notes` maps to native `text`).

## Note on clobber-safety (context — the deploy learned this the hard way)

`_forge`'s deploy used to blindly overwrite content docs; a Lauren deploy silently reverted its
story-specific `Prozesse/*` + timeline README to generic blueprint text. `_forge` fixed
`deploy-vault.sh` to **write-aside** (`<file>.forge-incoming`) instead of clobbering an existing,
author-localised file. StoryForge's `schema:gen` overwrites its *test-vault* artifacts, which are
generated (not author-localised), so the risk is lower — but if you ever generate into a vault
that carries author edits, apply the same "propose, don't clobber" rule.

## What `_forge` did on its side (for context, not action)

- Added `fc-location` / `fc-lore` / `fc-object` fileclasses so `_forge` (the schema hub) now
  holds all six entity types StoryForge defines — `_forge` had the templates but not the
  fileclasses.
- Built the merge-only `types.json` generator and wired `--check` into its `deploy-vault.sh`
  as a second gate (next to its property-set `schema-guard`).

Direction of the flow: **`_forge` holds the schemas and distributes both ways** — Lauren (the
real story vault) surfaces what's missing; StoryForge (the interface / general-purpose plugin)
is where suggestions like this one get implemented. StoryForge stays self-contained: no access
to data outside this repo.
