# ADR-0002 — The Codex editor is driven by FileClasses, not by hardcoded field lists

- **Status:** Accepted
- **Date:** 2026-07-27
- **Milestone:** the Codex surface spec (epic #9; issues #13, #21, #12)
- **Supersedes:** —
- **Mockups:** `docs/mockups/anvil-workbench-codex.html` S102/S103 (signed off 2026-07-27)

## Context

The Codex editor pane (Anvil, lower half — see `DESIGN.md §2`) must let a user edit an entity's
frontmatter. The open question was how a user's **own** properties reach that editor.

Three framings were considered and rejected:

- **Second-class citizens** — user fields appended, untyped, at the end. Rejected: it contradicts
  the extensibility contract (`gap-analysis.md §1.2`), where the whole point is that a user writing
  an isekai gets a first-class Codex over their own model.
- **First-class via an editor-styling mechanism** — the user configures how the editor looks.
  Rejected: it is a UI-builder, and it is the "mass of settings" we set out to avoid.
- **Per-FileClass layout files** — a separate artifact describing layout, falling back to a default.
  Rejected for now: a new format to design, ship, version and validate, when a derived rule already
  produces the requested result. Kept as a documented later escape hatch.

The decisive observation is that **the data already exists**. `npm run schema:gen` generates
metadata-menu FileClasses into the vault, and `test/StoryForge/00 Meta/FileClasses/fc-character-fantasy.md`
already carries:

- `extends: fc-character` — inheritance, with a shipped example
- `fieldsOrder` — field order
- `fields[].type` and `options.valuesList` — types and enum values (species, gender, …)

Meanwhile `src/inspector/inspectorFields.ts` hardcodes the same information in TypeScript. The six
generated types map one-to-one onto controls the inspector already has: `Input` (42 occurrences)
→ text, `Select` (17) → dropdown, `Multi` (10) → free chips, `MultiFile` (10) → wikilink chips,
`Number` (7) → number, `File` (5) → single wikilink. The hardcoded list is therefore **a copy of
vault data, not information.**

## Decision

1. **The editor derives its field list from the FileClass chain** — fields, order, types, enum
   values and section grouping — replacing `src/inspector/inspectorFields.ts` as the runtime source.
2. **One section per FileClass in the `extends` chain.** `fc-character` → "Character",
   `fc-character-fantasy` → "Fantasy", a user's `fc-character-custom1.md` → its own named section.
   No new grouping key is invented; `extends` already expresses it.
3. **Column layout is derived from the field type.** Half width for `Select`, `Number`, `Boolean`,
   `Date`, `Input`; full width for `Multi`, `MultiFile`. This reproduces the requested layout
   (name/status/role/occupation two-up, level/affinity two-up, list fields full width) for our
   fields and the user's alike, with no configuration — which is what makes user fields first-class
   in appearance and not merely in data.
4. **Exceptions carry an explicit `ui:` hint in `schema/*.json`** — *our* file, never the fc-file.
   Today: `tagline` → `ui: wide`, `portrait` → `ui: image`.
   **Revised 2026-07-29 (ADR-32):** `ui: image` is **withdrawn — it was never built**. metadata-menu
   has a native **`Media`** type, so the image control follows from the *type* like every other
   control, for our fields and a user's alike. `wide` is the only hint that remains; `portrait`
   (character) and `image` (location, object) change type instead, and their stored value becomes a
   wikilink rather than a path.
5. **Field types in scope:** the six generated, plus `Boolean` and `Date`. **Out of scope:**
   `Lookup`, `Formula`, `Canvas`.
6. **Three tiers, all data-driven:** (a) a FileClass declares the field → typed, ordered, sectioned,
   laid out; (b) no FileClass for the kind → render the frontmatter keys that exist, typed by
   inspecting their values; (c) a key no FileClass declares → an "Other properties" section.

## Consequences

- **A user extends the model without a plugin release.** Dropping `fc-character-custom1.md` into the
  FileClasses folder adds a typed, laid-out, named section. They declare fields; we render
  declarations. Styling stays ours. This is issue #13 satisfied by construction.
- **`inspectorFields.ts` is deleted, not extended.** Its content becomes derived.
- **The `portrait` hardcoding is replaced by a declaration.** `portrait` is `type: text`/`Input` in
  the schema, yet `src/panel/kindFields.ts` special-cases it **by field name** ("portrait triggers
  portraitTile, not a factRow"). That coupling cannot be derived from the type and means a user's
  field must literally be called `portrait` to get an image. `ui: image` replaces it.
  **Revised 2026-07-29 (ADR-32):** the replacement is **not** `ui: image` — that hint was withdrawn
  before it was ever built — but metadata-menu's native **`Media`** type. The control then follows
  from the type rather than from a declaration only *we* can make, so a user's image field works
  without being named `portrait`, and the stored wikilink survives a file rename where a path breaks
  silently.
- **metadata-menu remains optional.** A FileClass is frontmatter in a markdown note, readable via
  `metadataCache`. Installing metadata-menu adds *editing* those definitions, not reading them.
  This preserves the add-ons-are-never-required rule (`DESIGN.md §4`).
- **`Lookup`/`Formula`/`Canvas` are excluded on principle, not merely deferred.** metadata-menu
  *computes* them; without it there is no engine behind them, so rendering one would present a
  value we can neither produce nor maintain — precisely the dependency the rule forbids.
- **Accepted risk: coupling to metadata-menu's file format** (v3), not to the plugin. A v4 would
  require adapting. Mitigation: read defensively (unknown type → plain text), keep `schema/*.json`
  as the build-time source of truth, and cover the reader with fixtures.
- **User FileClasses are safe from regeneration.** `scripts/schema-gen.mjs` only ever writes
  (`writeFileSync`); it has no delete path. Our files stay generated and gated by `schema:check`;
  the user's are additive and untouched.
- **A FileClasses folder setting is required** (default `00 Meta/FileClasses`), which ties this to
  the scope settings (#14) and the vault-artifact seeding (#27) — a fresh install ships no
  FileClasses today, so the editor would fall back to tier (b) until the setup wizard runs.
- **Open:** a *user* field wanting an image cannot carry the `ui:` hint, since hints live in our
  schema. Proposed fallback is value inspection (looks like an image path or embed → preview).
  **Revised 2026-07-29 (ADR-32) — closed.** The asymmetry disappears with the hint: a user declares
  the field as `Media` in their own FileClass and gets the same control we do. No value inspection
  is needed. What remains open is only the cosmetic case of `wide`, which a user's field still
  cannot request.

## Alternatives considered

- **Keep the hardcoded list and append unknown keys** → rejected: creates the two-tier model the
  extensibility contract exists to prevent.
- **Invent our own field-definition format** → rejected: the vault already has one that
  metadata-menu, our generator and the user all understand.
- **Read FileClasses through metadata-menu's API** → rejected: it would make an add-on a
  requirement, contradicting `DESIGN.md §4`.

## References

- `docs/mockups/anvil-workbench-codex.html` — S102, S103 (signed off)
- `docs/gap-analysis.md` §1.2 (extensibility contract), §1.4 (add-ons), G20/#13
- `test/StoryForge/00 Meta/FileClasses/fc-character-fantasy.md` — `extends`, `fieldsOrder`, `valuesList`
- `src/inspector/inspectorFields.ts` — the list being derived away
- `src/panel/kindFields.ts` — the `portrait` name-coupling being replaced
- `scripts/schema-gen.mjs` — write-only, no delete path
