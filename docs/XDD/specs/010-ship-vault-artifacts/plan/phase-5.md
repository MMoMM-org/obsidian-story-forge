---
title: "Phase 5: Documentation and disclosures"
status: completed
version: "1.0"
phase: 5
---

# Phase 5: Documentation and disclosures

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: PRD/F7]` — setup docs, installation, #19
- `[ref: PRD/F6.3]` — README, LICENSE, PRIVACY, manifest
- `[ref: SDD/ADR-44]` — disclosures
- `docs/README.md` (user docs index), `docs/gap-analysis.md` (G4, G14, G25)

**Key Decisions**:
- Community Plugins is the preferred install path; manual and BRAT follow.
- Quoted UI strings must match the shipped UI exactly (from Phase 3).
- No claim that a feature needs metadata-menu or meta-bind.

**Decisions taken during implementation**:
- T5.1 (9e314de): installation leads with Community Plugins ("Once Story Forge is listed…", still
  marked not listed yet), then BRAT, then manual; getting-started, fileclasses, troubleshooting,
  commands-reference and configuration describe Set up story files, the folder settings, updates
  and every refusal text. About 48 quoted UI strings grep-checked against `src/`; links resolve.
- T5.2 (54187fc): optional-plugins covers Bases, Dataview, metadata-menu, meta-bind and core
  Templates; meta-bind only adds the two `VIEW[]` lines of the character template; no Templater
  syntax ships. Live check (2026-11-20, maintainer): without meta-bind the `VIEW[]` lines show as
  plain text; with it the values show, empty fields stay blank until selected; `{{title}}` is
  filled by core Templates only (Templater leaves it), now stated. metadata-menu's FileClass form
  could not be opened: metadata-menu itself threw "Attempting to register an existing view type
  FileClassView__fc-character", so the doc no longer claims the form reads the files (b647fac).
- T5.3 (f340025, 76f74e4): README section "What Story Forge does to your vault" and a rewritten
  PRIVACY.md, each claim tied to code (checklist in the spec README). The Obsidian policy pages
  could not be fetched; re-check them before submission (Phase 6).
- T5.4 (1adec4a, 4e998d3): G25 resolved, G14 provision half resolved, G4 matches the settings.
- T5.5: reader test with a local novelist persona (`.claude/doc-personas.md`, not committed) on
  installation and getting-started: PASS. Its gaps were fixed in getting-started (core Templates
  steps, templates never change notes made from them, what each dialog row means); re-run PASS.

**Dependencies**: Phase 3 (UI wording). Phase 4 for the final command name ("Open board").

---

## Tasks

Tells users how to set up story files, what the add-ons give them, and what the plugin does to
their vault.

- [x] **T5.1 Setup and installation docs** `[activity: documentation]`

  1. Prime: `docs/installation.md`, `docs/getting-started.md`, `docs/fileclasses.md`
  2. Test: Docs review against the shipped UI: every quoted label exists; no instruction to copy
     files from `test/StoryForge`
  3. Implement: Installation leads with Community Plugins; getting-started and fileclasses
     describe "Set up story files", the folder settings and updates; troubleshooting gains the
     refusal messages
  4. Validate: Link check; quoted strings grep-checked against `src/`
  5. Success: `[ref: PRD/F7.1; PRD/F7.2]`

- [x] **T5.2 What metadata-menu and meta-bind add (#19)** `[activity: documentation]`
  `[parallel: true]`

  1. Prime: issue #19, `docs/optional-plugins.md`, shipped FileClasses and template bodies
  2. Test: Docs review: each add-on lists what it adds and what is missing without it, checked
     against the shipped files
  3. Implement: Extend `docs/optional-plugins.md`
  4. Validate: Statements verified in the test vault with each plugin on and off
  5. Success: `[ref: PRD/F7.3]`

- [x] **T5.3 README and PRIVACY disclosures** `[activity: documentation]` `[parallel: true]`

  1. Prime: Submission requirements, developer policies, the audit findings
  2. Test: Checklist: README states no network use, which files and frontmatter it writes and
     when, that DataviewJS collections run code after consent; PRIVACY.md has no template
     placeholders and matches the code; manifest description still valid
  3. Implement: Edit `README.md`, `PRIVACY.md`
  4. Validate: Checklist ticked in the spec README
  5. Success: `[ref: PRD/F6.3]`

- [x] **T5.4 Gap analysis and issues** `[activity: documentation]` `[parallel: true]`

  1. Prime: `docs/gap-analysis.md` G4, G14, G25
  2. Test: Review: G25 marked resolved by spec 010; G14's provision half resolved; G4 text matches
     today's settings
  3. Implement: Edit `docs/gap-analysis.md`
  4. Validate: Cross-links to spec 010
  5. Success: Register reflects reality `[ref: SDD/Known Technical Issues]`

- [x] **T5.5 Phase validation** `[activity: validate]`

  - Run the doc-product reader test (novelist persona) on installation and getting-started;
    fix gaps; lint and tests still green.
