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
| 2026-11-20 | Correction to the R1 row | R1 also removes these files from the result notice, as drawn in the mockup (the row above says only that it revises O4 for the dialog rows); PRD F2.7/F4.1 and the SDD follow the mockup |
| 2026-11-20 | Phase 3 done | Live walk passed with R1–R3 and the notice fix; #31 confirmed fixed in a popout |
| 2026-11-20 | Phase 5 done | Docs lead with Community Plugins; setup, updates and refusals documented; README/PRIVACY disclosures tied to code; reader test PASS; optional-plugins checked live (metadata-menu form not checkable: metadata-menu error) |

## Context

Issue #27 (part of epic #9). Open questions from the issue: how the artifacts ship; what
happens on upgrade when the user edited a shipped artifact; seeding must respect folder
settings (#14). The documentation half is #19. The spec ends with the first 0.x GitHub
release, which also makes the manual and BRAT install paths in `docs/installation.md` work.

---
*This file is managed by the xdd-meta skill.*

## T5.3 disclosure checklist

Checked 2026-11-20 against the code. Obsidian's developer-policy pages could not be fetched
(the docs site returned "Not Found"), so the policy rules are applied from the Community
Plugins submission rules as known.

- [x] README and PRIVACY state no network use. `grep` of `src/` finds no `requestUrl`, `fetch(`,
  `XMLHttpRequest` or `WebSocket`; the only URLs are doc links (`src/settings/HeaderSection.ts:41`,
  `src/codex/codexEmptyState.ts:46`). The catalog index is bundled (`src/main.ts:52-53`).
- [x] Story frontmatter is written only through `processFrontMatter`
  (`src/inspector/frontmatterWriter.ts:247`, `:353`), on deliberate editor/Board actions and undo.
- [x] Every other vault write goes through `src/vault/managedFileWriter.ts` (`createFolder` :69,
  `create` :92, `process` :106, `trashFile` :120); no other `vault.create/modify/process`
  exists in `src/`.
- [x] Set up story files writes only on confirm (`src/artifacts/StoryFilesModal.ts:583`, `:610`,
  `:631`).
- [x] Repo collections are written only by install (`src/catalog/CatalogService.ts:235`).
- [x] DataviewJS runs code only after consent: `src/catalog/CatalogService.ts:402-412`,
  `src/import/ImportFlow.ts:120`, `src/consent/ConsentGate.ts:126`; execution at
  `src/engines/DataviewJsEngine.ts:81`.
- [x] Plugin-folder files: `data.json` via `saveData` (`src/main.ts:49-50`),
  `undo-journal.json` (`src/undo/journalStore.ts:38-41`, write :83).
- [x] No telemetry: no analytics code or hosts in `src/`.
- [x] `PRIVACY.md` has no template placeholders (no `YYYY-MM-DD`, `_e.g._` or HTML comments).
- [x] `manifest.json` description: 143 characters, ends with a period, no "Obsidian" or "plugin".
  Maintainer: confirm `author`/`authorUrl`, and the funding links, before submission.

## Release 0.2.0: checks and maintainer checklist (T6.3)

**Checks done (2026-11-20, on `feat/ship-vault-artifacts`):**

- Next version: `@semantic-release/commit-analyzer` over the 848 commits since tag `0.1.0`
  returns `minor`, and no commit carries a breaking-change marker, so the release is **0.2.0**.
  A real `npx semantic-release --dry-run` needs the release branch on the remote; run it on
  `main` after the merge is pushed (step 2 below).
- `manifest.json` and `package.json` already read 0.2.0 (manual bump 902e481); `versions.json`
  maps 0.2.0 → 1.12.7. `@semantic-release/npm` uses `--allow-same-version` and
  `version-bump.mjs` writes `versions.json` only on a change, so the release step is a no-op
  for these files.
- Release assets: `build/main.js`, `build/manifest.json`, `build/styles.css` (`.releaserc.json`),
  all produced by `npm run build`; attested in `release.yml`.
- Submission requirements and developer policies, read from obsidianmd/obsidian-developer-docs
  (`en/Community directory/…`): description 143 characters, ends with a period, no emoji;
  `minAppVersion` 1.12.7; no Node.js or Electron imports in `src/` (`isDesktopOnly: false` is
  right); command ids carry no plugin id; no sample code; MIT `LICENSE`; no ads, no telemetry,
  no network, no account, no payment, no files outside the vault (README "What Story Forge does
  to your vault", `PRIVACY.md`). `fundingUrl` lists Buy Me a Coffee and GitHub Sponsors: keep it
  only if you accept donations.

**Maintainer steps (never done by the agent):**

1. Make the GitHub repository public.
2. On `main` (after the merge is pushed): `npx semantic-release --dry-run` and check it says
   0.2.0; then run the **Release** workflow (Actions → Release → Run workflow).
3. In a fresh vault, install the release manually (main.js, manifest.json, styles.css into
   `.obsidian/plugins/story-forge/`) and once with BRAT (`MMoMM-org/obsidian-story-forge`).
4. Run **Set up story files** there and open the Anvil.
5. When ready, submit on community.obsidian.md. After acceptance, change "Once Story Forge is
   listed…" / "not listed yet" in `README.md` and `docs/installation.md`.
