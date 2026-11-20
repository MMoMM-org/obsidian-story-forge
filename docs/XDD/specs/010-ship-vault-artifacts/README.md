# Specification: 010-ship-vault-artifacts

## Status

| Field | Value |
|-------|-------|
| **Created** | 2026-11-18 |
| **Current Phase** | Ready |
| **Last Updated** | 2026-11-18 |

## Documents

| Document | Status | Notes |
|----------|--------|-------|
| requirements.md | completed | 7 Must features, approved 2026-11-18 |
| solution.md | completed | ADR-38–44, confirmed 2026-11-18 |
| plan/ | completed | 6 phases, 33 tasks; every PRD AC mapped |

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
| 2026-11-18 | Approach A: placeholders + ADR-0003 two checksums | Explicit, testable folder rewriting; dev vault = index resolved with defaults |
| 2026-11-18 | Shipped files are folder-free (tags only), neutral defaults, three empty value lists | Works in any layout; `_forge` to be told about the schema text changes |
| 2026-11-18 | Repo made public and release triggered by the maintainer as the last step | Outward actions stay with the user; release is 0.2.0 (what semantic-release computes) |
| 2026-11-18 | ADR-38–44 confirmed | Index, CI drift gate, `data.json` records, shared Vault-API writer, Scope-tab UI, neutral content, scanner-aligned lint + release |
| 2026-11-18 | PLAN complete: 6 phases | 1 generator/index/gate → 2 core → 3 UI (mockup gate) → 4 scanner-clean (beside 3) → 5 docs → 6 live walk + release checklist |
| 2026-11-19 | Mockup open questions O1–O6 decided | O1 a folder change in the dialog is saved only on confirm, Cancel changes nothing; O2 the partial status names the sets not set up; O3 value lists stay independent of fc-character-fantasy; O4 refusals keep "Not installed"/"Not updated"; O5 the missing-row checkbox has a visible "Set up again" label; O6 the notice lists up to 5 skipped files by name. Mockups S1–S6 (D1–D12) await sign-off |
| 2026-11-19 | Phase 4 done: scanner-clean, 0 errors, 128 warnings left (116 prefer-create-el, 11 prefer-instanceof, 1 prefer-setting-definitions) | ADR-44; warnings are out of scope; the popout card fix likely addresses #31 (to confirm live) |
| 2026-11-20 | Mockups S1–S7 signed off | User review added O7–O9: the capability screen is renamed "What Story Forge can use" everywhere it is named (title, footer, Library link, Dataview hints, user docs, PRD text); the Library tab shows a hint with "Don't show again" while no story file is set up (S7); the metadata-menu row names its option lists in Obsidian's Properties panel, to be confirmed in the live walk before it ships |
| 2026-11-20 | Phase 3 built: setup dialog, command, Scope tab group, Library hint, capability row | Live walk items 5–6 still open; #31 confirmed fixed in a popout; O9 wording corrected to the buttons metadata-menu draws in the Properties panel; SDD synced to the build |
| 2026-11-20 | Mockups R1–R2 signed off (live walk review) | R1: files already in the folder but not written by Story Forge show "Already there", dimmed, with a reason line (same content / your own file) and a set line when the whole set is affected; they leave the result notice; revises O4 for the dialog rows only. R2: the result notice adds one line per written set with count and folder. Also found live: the notice showed no text, only something like an object name; fixed by filling `Notice.messageEl` instead of passing a DocumentFragment |
| 2026-11-20 | Mockup R3 signed off (live walk review) | The Library hint slot also shows "N story file updates available." with Review updates… and Not now when the status has at least one update and something is set up (S7a wins when nothing is). Not now stores one dismissed id per plugin version, independent of S7a's Don't show again; the Scope tab line still shows the count |

## Context

Issue #27 (part of epic #9). Open questions from the issue: how the artifacts ship; what
happens on upgrade when the user edited a shipped artifact; seeding must respect folder
settings (#14). The documentation half is #19. The spec ends with the first 0.x GitHub
release, which also makes the manual and BRAT install paths in `docs/installation.md` work.

---
*This file is managed by the xdd-meta skill.*
