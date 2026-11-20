---
title: "Phase 5: Documentation and disclosures"
status: in_progress
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

**Dependencies**: Phase 3 (UI wording). Phase 4 for the final command name ("Open board").

---

## Tasks

Tells users how to set up story files, what the add-ons give them, and what the plugin does to
their vault.

- [ ] **T5.1 Setup and installation docs** `[activity: documentation]`

  1. Prime: `docs/installation.md`, `docs/getting-started.md`, `docs/fileclasses.md`
  2. Test: Docs review against the shipped UI: every quoted label exists; no instruction to copy
     files from `test/StoryForge`
  3. Implement: Installation leads with Community Plugins; getting-started and fileclasses
     describe "Set up story files", the folder settings and updates; troubleshooting gains the
     refusal messages
  4. Validate: Link check; quoted strings grep-checked against `src/`
  5. Success: `[ref: PRD/F7.1; PRD/F7.2]`

- [ ] **T5.2 What metadata-menu and meta-bind add (#19)** `[activity: documentation]`
  `[parallel: true]`

  1. Prime: issue #19, `docs/optional-plugins.md`, shipped FileClasses and template bodies
  2. Test: Docs review: each add-on lists what it adds and what is missing without it, checked
     against the shipped files
  3. Implement: Extend `docs/optional-plugins.md`
  4. Validate: Statements verified in the test vault with each plugin on and off
  5. Success: `[ref: PRD/F7.3]`

- [ ] **T5.3 README and PRIVACY disclosures** `[activity: documentation]` `[parallel: true]`

  1. Prime: Submission requirements, developer policies, the audit findings
  2. Test: Checklist: README states no network use, which files and frontmatter it writes and
     when, that DataviewJS collections run code after consent; PRIVACY.md has no template
     placeholders and matches the code; manifest description still valid
  3. Implement: Edit `README.md`, `PRIVACY.md`
  4. Validate: Checklist ticked in the spec README
  5. Success: `[ref: PRD/F6.3]`

- [ ] **T5.4 Gap analysis and issues** `[activity: documentation]` `[parallel: true]`

  1. Prime: `docs/gap-analysis.md` G4, G14, G25
  2. Test: Review: G25 marked resolved by spec 010; G14's provision half resolved; G4 text matches
     today's settings
  3. Implement: Edit `docs/gap-analysis.md`
  4. Validate: Cross-links to spec 010
  5. Success: Register reflects reality `[ref: SDD/Known Technical Issues]`

- [ ] **T5.5 Phase validation** `[activity: validate]`

  - Run the doc-product reader test (novelist persona) on installation and getting-started;
    fix gaps; lint and tests still green.
