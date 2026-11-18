---
title: "Phase 1: Generator, artifact index and drift gate"
status: in_progress
version: "1.0"
phase: 1
---

# Phase 1: Generator, artifact index and drift gate

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: SDD/ADR-38]` — placeholders, index shape, generated Schema README
- `[ref: SDD/ADR-39]` — content drift gate, banned text, CI
- `[ref: SDD/ADR-43]` — folder-free, neutral content, value lists
- `[ref: SDD/Application Data Models]` — `ArtifactIndex`, `ArtifactEntry`
- `[ref: SDD/Implementation Examples; placeholder resolution]`
- `[ref: SDD/Implementation Gotchas]` — `{{title}}` is not ours; template bodies keep `VIEW[...]`
- `docs/schema-change-runbook.md`

**Key Decisions**:
- Placeholders are `{{sf:fileClassesFolder}}`, `{{sf:templatesFolder}}`, `{{sf:schemaFolder}}`.
  Any other `{{sf:…}}` name fails the build. `{{title}}` passes through untouched.
- The dev vault is the index resolved with the defaults `00 Meta/FileClasses`,
  `00 Meta/Templates`, `00 Meta/Schema`; nothing else in `00 Meta/` changes role.
- `schema/*.json` keeps its `folder` field; schema-gen stops emitting it.
- The index carries no timestamp, so two builds are byte-identical.
- The resolver is written once in TypeScript (`src/artifacts/resolvePlaceholders.ts`) and used by
  the scripts through jiti, as `build-catalog.mjs` does with `computeChecksum`.

**Dependencies**: none.

**Decisions taken during implementation**:
- T1.4 ran first, then T1.1–T1.3 together: all three change `schema-gen.mjs`, and the dev vault
  is written by resolving placeholders, which needs the resolver.
- `series` stays a Property and is emitted empty (`series: ""`). ADR-43's "no `series`" means no
  `"Forge"` preset; removing the Property would be a schema REMOVE that ripples into seed notes.
- `scripts/schema-artifacts.mjs` (pure renderers, `renderArtifacts`) was created in T1.1–T1.3;
  T1.5 adds only `build-artifacts.mjs`, the index and the import.
- Value-list notes are empty files (a comment line would be read by metadata-menu as a value),
  live in the FileClasses folder and are not in `GENERATED_FILE_CLASSES`. They inflate
  `fileClassVault.count()` (11 instead of 8); the fix is part of T3.4.
- `gender`'s description said `non-binary`; the value is `nonbinary`; fixed.
- Lint crash `no-unsupported-api` "Invalid version" was a cache file
  (`node_modules/.cache/eslint-plugin-obsidianmd/since-map.json`) written by the 0.5.1 audit run;
  removed. Not a code issue.
- T1.5: the bundled index lives in `src/artifacts/artifactIndex.ts`, not in `main.ts`. Nothing
  imports it yet, so esbuild leaves it out of `main.js` until T2.7 wires it; T2.7 checks that
  `main.js` carries it (PRD F1.1). `predev` builds the catalog and artifact indexes.

---

## Tasks

Establishes one source for the shipped files: neutral content generated from `schema/`, a
bundled checksummed index, and a gate that fails on any drift.

- [x] **T1.1 Neutral, folder-free schema content** `[activity: domain-modeling]`

  1. Prime: Read `schema/*.json`, `scripts/schema-gen.mjs`, the generated files in
     `test/StoryForge/00 Meta/` `[ref: SDD/ADR-43]` `[ref: PRD/F5]`
  2. Test: Generated FileClasses have no `filesPaths` entries and no empty list items;
     `fc-lore`'s query is tag-based; `character-fantasy`'s `valuesFrom` uses
     `{{sf:fileClassesFolder}}`; templates have no `series` default and no `gender` default;
     `status` defaults to its first value; descriptions and notes name no `30 Canon`,
     `10 Manuscript`, `20 Planning`, `95 Assets` and no `00 Meta/` path
  3. Implement: Edit `schema/*.json` text and defaults; change the FileClass, template and
     reference generators in `scripts/schema-gen.mjs` accordingly
  4. Validate: schema tests (`test/schema/*`) pass after updating expectations that encoded the
     old content; mutation-check each new assertion
  5. Success:
     - [ ] FileClasses match by tag only `[ref: PRD/F5.5]`
     - [ ] Templates have neutral defaults and no `series: "Forge"` `[ref: PRD/F5.2; PRD/F5.6]`

- [x] **T1.2 Template bodies and value lists as generator inputs** `[activity: domain-modeling]`

  1. Prime: `schema-gen.mjs:157-168` (body preservation), the 7 checked-in template bodies, the
     three value-list references `[ref: SDD/ADR-38 trade-offs]` `[ref: SDD/ADR-43]`
  2. Test: Generating into an empty folder yields the same bodies as the checked-in templates
     (meta-bind `VIEW[...]` lines intact); every template heading is `# {{title}}`; three empty
     value-list notes (`fc-combat-skills`, `fc-magical-abilities`, `fc-armor`) are generated
     into the FileClasses set
  3. Implement: Move template bodies to `schema/templates/<template>.md`; schema-gen reads them
     instead of preserving vault files; add the value-list notes as generated FileClass-set
     files
  4. Validate: Generation is idempotent; mutation-check the body and heading assertions
  5. Success:
     - [ ] Template heading shows the note title with core Templates `[ref: PRD/F5.1]`
     - [ ] Fantasy FileClass ships with its three value lists `[ref: PRD/F5.7]`

- [x] **T1.3 Generated Schema index note** `[activity: domain-modeling]` `[parallel: true]`

  1. Prime: `test/StoryForge/00 Meta/Schema/README.md` and the agent findings on its dev-only
     parts `[ref: SDD/ADR-38]` `[ref: PRD/F5.3]`
  2. Test: The generated index lists all eight types (read from `schema/*.json`, not a list in
     code); names the FileClasses and templates folders only through placeholders; mentions no
     `schema:check`, `npm` or plugin repo
  3. Implement: Generate `Schema/README.md` in schema-gen from a user-facing body
  4. Validate: Adding a type JSON adds a row with no code change; mutation-check
  5. Success: The index describes the configured folders and no developer tooling
     `[ref: PRD/F5.3; PRD/F5.8]`

- [x] **T1.4 Placeholder resolver** `[activity: domain-modeling]` `[parallel: true]`

  1. Prime: `[ref: SDD/Implementation Examples; placeholder resolution]`
     `[ref: SDD/Implementation Gotchas]`
  2. Test: Each known placeholder resolves; `{{title}}` and other non-`sf:` braces pass through;
     unknown `{{sf:x}}` is an error listing the name; folder values are normalised, no trailing
     slash; resolution of a text without placeholders is the identity
  3. Implement: `src/artifacts/resolvePlaceholders.ts` and the closed placeholder list in
     `src/artifacts/artifactTypes.ts`
  4. Validate: Unit tests pass; mutation-check
  5. Success: Resolution is explicit and total over the closed list `[ref: SDD/ADR-38]`

- [x] **T1.5 Artifact index build** `[activity: build-tooling]`

  1. Prime: `scripts/build-catalog.mjs`, `test/catalog/buildCatalog.test.ts`, `src/main.ts:27`
     `[ref: SDD/ADR-38]` `[ref: SDD/Application Data Models]`
  2. Test: `buildArtifacts({outDir})` writes `artifact-index.json` with one entry per shipped file
     (set, relPath, source, `sha256:` checksum over the unresolved source, placeholders used);
     two builds are byte-identical; dev-only files (Processes, CLAUDE.md, Bases, Scripts,
     dataview-views, schema `.json` copies) are absent; an unknown placeholder fails the build
  3. Implement: `scripts/schema-artifacts.mjs` (pure renderers shared with schema-gen),
     `scripts/build-artifacts.mjs` (exported core + CLI), `artifacts:build` in `package.json`
     `build`; schema-gen writes the dev vault by resolving the same sources with defaults;
     `main.ts` imports `dist/artifact-index.json` statically
  4. Validate: `npm run build` succeeds; index size ≤ 200 KB; mutation-check
  5. Success:
     - [ ] Shipped set available offline from main.js `[ref: PRD/F1.1]`
     - [ ] Dev-only files never shipped `[ref: PRD/F1.3]`

- [ ] **T1.6 Content drift gate in CI** `[activity: build-tooling]`

  1. Prime: `scripts/schema-check.mjs`, `test/schema/schemaCheck.test.ts`,
     `.github/workflows/lint.yml` `[ref: SDD/ADR-39]`
  2. Test: The gate fails when a dev vault artifact differs from the index resolved with
     defaults (one byte); when the index differs from a fresh build; when a shipped source
     contains banned text (`00 Meta/`, `30 Canon`, `10 Manuscript`, `20 Planning`, `95 Assets`,
     `%title%`, `%name%`, `"Forge"`); and passes on the regenerated repo
  3. Implement: Extend `schema-check.mjs`; add `npm run schema:check` to `lint.yml`
  4. Validate: Each failure path triggered once by a deliberate mutation; CI job green on the
     branch
  5. Success:
     - [ ] Shipped set equals the dev vault set `[ref: PRD/F1.2]`
     - [ ] Out-of-date shipped set fails the gate `[ref: PRD/F1.4]`

- [ ] **T1.7 Regenerate the dev vault and notify `_forge`** `[activity: build-tooling]`

  1. Prime: `docs/schema-change-runbook.md` (seed notes, spec ripple)
  2. Test: `npm run schema:gen && npm run schema:check` clean; full suite green; seed notes in
     `test/StoryForge/` still classify (no test depended on `filesPaths`)
  3. Implement: Regenerate `test/StoryForge/00 Meta/`; update `src/editor/generatedFileClasses.ts`
     if the value-list notes join the generated set; write a short note for `_forge` in
     `docs/handoff-from-forge/` (or the spec README) listing the schema text and default changes
  4. Validate: `git diff` of the vault reviewed; only intended changes
  5. Success: Dev vault and shipped set agree; `_forge` has the change list `[ref: SDD/CON-8]`

- [ ] **T1.8 Phase validation** `[activity: validate]`

  - Run all Phase 1 tests, `schema:check`, `build`, lint, typecheck ×3. Verify against ADR-38,
    ADR-39, ADR-43 and PRD F1, F5.
