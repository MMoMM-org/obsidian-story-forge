# Rulings from `_forge` — answers to StoryForge's 6 decisions (2026-07-18)

In response to `docs/handoff-to-forge.md`. `_forge` (the schema hub) rules; StoryForge implements
in its own way. The bundle files in this folder have been **updated** where a ruling required a fix —
re-pull them. Nothing in StoryForge's own source was touched.

---

### Q1 — `scene.notes`: canonical description + position → RESOLVED (bundle fixed)
- **Canonical `description`:** `Text. Free-form author notes about the scene — scratch/annotations, working reminders. Not story prose.`
- **Canonical position:** after `next`, **before** `series`/`tags` (i.e. `series` + `tags` remain the
  last two housekeeping fields). This is what the bundled `schema/scene.json` already does.
- The README's "add it as the last field" and the `types-json-artifact.md` "not story content" wording
  were **wrong/inconsistent** — both have been corrected to match the above. Adopt the bundled
  `schema/scene.json` string and position verbatim.

### Q2 — `types.json` and `tags` → RESOLVED: **exclude `tags`** (bundle fixed)
Do **not** emit the `tags` classifier into `types.json`. Obsidian types `tags` natively and your
`schema:check` already excludes it; emitting it is redundant. The mapping table in
`types-json-artifact.md` has been corrected (the `tags -> tags` row removed), and the reference
`gen-types-json.py` now has an explicit `SKIP = {"tags"}` so it never emits it. Skip any field whose
`type` is `tags`.

### Q3 — plain author-lists → `multitext` → CONFIRMED
Yes. Emit `multitext` for `list`-typed fields with no `relation`/`query`
(`distinctive_features, combat_skills, magical_abilities, weapons, armor, plotlines`). Explicit is
better than Obsidian value-inference — a deterministic widget is the whole point of `types.json`.
(`aliases` stays the reserved `aliases` widget.)

### Q4 — canonical `scene.status` vocabulary → CONFIRMED (no change)
`idea | outline | draft | revised | done | final` is canonical in `_forge` (matches the `fc-scene`
`valuesList` and `schema/scene.json` `status.values`). The vault side did **not** diverge. This is
exactly what the Action-4 scripts step through.

### Q5 — infra language → AGREED: **English-first** (bundle fixed)
You are right — shared blueprint infra must be English (StoryForge is English-only; German is
Lauren's runtime EN→DE concern, not baked into shared infra). The bundled infra is now English:
`infra/Scripts/*` Notices, both `infra/Bases/*.base` displayNames + view names, and
`infra/dataview-views/active-scenes.js` labels/comments. Re-pull and adopt directly.

### Q6a — canonical runtime enum read-source → RULING: **emit machine-readable `00 Meta/Schema/<type>.json`**
The runtime enum SoT is the **machine-readable schema JSON in the vault**, not the FileClass
`valuesList` (MM-internal) and not `types.json` (widget types only). `_forge` already emits
`00 Meta/Schema/<type>.json` into its vaults; the Action-4 scripts read `Schema/scene.json →
status.values` from there. **For StoryForge to agree:** add `00 Meta/Schema/<entity>.json` (the raw
machine schema) as a new `schema:gen` output artifact, alongside the human `Schema/<entity>.md`. Then
both hubs' vaults carry the same read-source and the scripts are genuinely drift-proof (not just
falling back). This is the missing generation target you identified — please add it.

### Q6b — `active-scenes.js` Longform coupling → RESOLVED: **soft dependency** (bundle fixed)
No hard Longform dependency. The bundled `active-scenes.js` now: uses Longform's active draft folder
**if** Longform is present, otherwise **falls back to all `#manuscript/scene` notes** (never errors
out). Adopt as-is.

---

## Net effect on your action plan
- **Action 1** (`scene.notes`): unblocked — Q1 resolved. Adopt bundled `schema/scene.json`.
- **Action 2** (`types.json` artifact): unblocked — Q2 (exclude tags) + Q3 (lists→multitext) resolved;
  `gen-types-json.py` reference updated.
- **Action 3** (vault infra): unblocked — Q5 (English) + Q6b (Longform soft-dep) resolved; re-pull `infra/`.
- **Action 4** (enum scripts): unblocked once you add the `00 Meta/Schema/<type>.json` gen target
  (Q6a) — Q4 confirms the vocabulary the scripts step through.
