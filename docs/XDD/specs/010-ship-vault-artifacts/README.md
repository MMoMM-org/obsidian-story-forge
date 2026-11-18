# Specification: 010-ship-vault-artifacts

## Status

| Field | Value |
|-------|-------|
| **Created** | 2026-11-18 |
| **Current Phase** | SDD |
| **Last Updated** | 2026-11-18 |

## Documents

| Document | Status | Notes |
|----------|--------|-------|
| requirements.md | completed | 7 Must features, approved 2026-11-18 |
| solution.md | pending | |
| plan/ | pending | |

**Status values**: `pending` | `in_progress` | `completed` | `skipped`

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-11-18 | Spec created for issue #27 (gap G25) | A fresh install gets none of the vault artifacts: `schema:gen` writes them only into the development vault |
| 2026-11-18 | Community Plugins is the preferred install path | The user will submit Story Forge to the directory once it is done. A directory install ships only `main.js`, `manifest.json` and `styles.css`, so every artifact must be bundled and written into the vault on demand |
| 2026-11-18 | Ship FileClasses, templates and the schema reference only | `Canon.base`/`Manuscript.base` duplicate the Anvil's built-in collections and `Canon.base` hardcodes `30 Canon`; QuickAdd scripts, `dataview-views/` and the schema `.json` copies are dev tooling |
| 2026-11-18 | Write only on request: command + settings button; the first-run screen only points to it | Reviewers object to unprompted vault writes; "nothing writes unasked" is a standing project rule |
| 2026-11-18 | One folder setting per artifact set | Fits #14; the core Templates folder is not readable through a public API |
| 2026-11-18 | Updates work like curated collections: replace unedited, refuse edited | Same checksum pattern and wording as spec 008; no copy-beside option |
| 2026-11-18 | Templates use core Templates syntax (`{{title}}`); no `series: "Forge"` | `%title%` is resolved by nothing; the series default is dev-vault specific |
| 2026-11-18 | Spec ends with the first release plus submission readiness; the maintainer submits | Manual and BRAT installs need a release; the directory submission is the user's call |
| 2026-11-18 | Docs half of #19 is in scope | The shipped files are exactly what metadata-menu and meta-bind use |
| 2026-11-18 | Adopt EngramQuest's per-file preview, install-time folder rewriting and record-based upgrade detection | User-supplied analysis (2026-11-11); its marker-based detection fails for some file types |

## Context

Issue #27 (part of epic #9). Open questions from the issue: how the artifacts ship; what
happens on upgrade when the user edited a shipped artifact; seeding must respect folder
settings (#14). The documentation half is #19. The spec ends with the first 0.x GitHub
release, which also makes the manual and BRAT install paths in `docs/installation.md` work.

---
*This file is managed by the xdd-meta skill.*
