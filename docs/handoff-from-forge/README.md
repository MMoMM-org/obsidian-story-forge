# Handoff bundle from `_forge` — schema SoT, vault infra, types.json generator

**Source:** the `_forge` schema-hub session, 2026-07-18. `_forge` and StoryForge cannot read each
other's repos, so **every file referenced below is included in this bundle** — you need no external
access to act on it.

**Nature:** this is *reference material to adopt in StoryForge's own way*, not a patch. Nothing in
StoryForge's own source (`src/`, `schema/`, existing docs) was touched. Decide what to adopt and
implement it here (`npm run schema:gen` / `schema:check` etc.).

**Governance recap:** `_forge` is the schema **hub** (holds the schemas, distributes both ways).
Lauren = real story vault (feedback). StoryForge = the interface / general-purpose plugin — suggestions
come from here and plugin-side changes get implemented here. StoryForge stays self-contained.

---

## What's in this bundle

```
handoff-from-forge/
  README.md                 ← you are here
  types-json-artifact.md    ← detailed spec for action 2 (types.json as a 4th artifact)
  gen-types-json.py         ← reference impl of the merge-only types.json generator
  schema/*.json (6)         ← _forge's reconciled schema (StoryForge form; see deltas below)
  infra/
    Scripts/*.js (3)        ← QuickAdd user scripts (status set/advance read enum from schema)
    Bases/*.base (2)        ← Canon.base, Manuscript.base (Obsidian Bases views)
    dataview-views/*.js (1) ← active-scenes.js (shared scene table/timeline)
```

## Action items (ordered; adopt in StoryForge's own way)

### 1. Add `scene.notes` to `schema/scene.json`
The real Lauren vault carries a `notes` scene field (free-text author annotations, all 26 scenes)
that StoryForge's schema lacked. `_forge` adopted it canonically. Diff `schema/scene.json` in this
bundle against StoryForge's — the delta is one field (and `series` default, see below):
```jsonc
{ "name": "notes", "type": "text",
  "description": "Text. Free-form author notes about the scene — scratch/annotations, not story prose." }
```
Then `npm run schema:gen` + `schema:check`.

### 2. Add `types.json` as a 4th generated artifact
StoryForge's `schema:gen` produces FileClass + Template + human-doc, but **not** Obsidian's
`.obsidian/types.json` (the vault-wide property→widget-type registry). See **`types-json-artifact.md`**
for the full spec and **`gen-types-json.py`** for a working merge-only implementation (adds new keys,
never clobbers `BC-*`/`TQ_*`/`aliases`, reports type conflicts). Port it into `schema-gen.mjs` /
`schema-check.mjs`, reading `schema/*.json` (richer than the FileClass). Key point:
`types.json` stores only the **widget type** (`"status": "text"`) — never enum values.

### 3. (Consider) generate the vault infra from `schema:gen`
`_forge` now ships `00 Meta/{Scripts,Bases,dataview-views}` as blueprint-managed, schema-coupled
tooling (see `infra/`). As the general-purpose plugin, StoryForge may want `schema:gen` to emit these
too (or ship them as static assets), so every generated vault gets the QuickAdd status/character
commands, the Canon/Manuscript Bases, and the scene timeline view.

### 4. Single-source enum pattern (already applied in `infra/Scripts/`)
`scene-status-set.js` / `scene-status-advance.js` read the status enum **at runtime** from
`00 Meta/Schema/scene.json → status.values` (hardcoded list only as fallback) → drift-proof. The
**enum values are the SoT in the schema JSON**, deliberately not the `fc-*` FileClass (MM-internal),
not `types.json` (no values), not a prose enum-map. If StoryForge ships equivalent scripts, use the
same pattern.

## Deltas vs StoryForge's own `schema/*.json`
The bundled `schema/*.json` are `_forge`'s reconciled copies. Two intentional differences:
1. `scene.json` has the extra `notes` field (action 1).
2. `series` `default` is `"{{SERIES_NAME}}"` (a deploy-time placeholder in the `_forge` vault
   template) instead of `"Forge"`. StoryForge keeps its own default convention — ignore this delta.

## Also worth knowing — the "never clobber" rule
`_forge`'s `deploy-vault.sh` no longer blindly overwrites author-localised files; it write-asides a
differing file as `<file>.forge-incoming` for manual merge. StoryForge's `schema:gen` overwrites its
*generated* test-vault artifacts (fine — they're not author-localised), but if it ever writes into a
vault that carries author edits, apply the same "propose, don't clobber" instinct.
