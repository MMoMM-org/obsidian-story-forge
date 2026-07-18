# Specification: 002-query-engine-dataview

## Status

| Field | Value |
|-------|-------|
| **Created** | 2026-07-15 |
| **Current Phase** | Implemented |
| **Last Updated** | 2026-07-15 |
| **PRD Completed** | 2026-07-15 |

## Documents

| Document | Status | Notes |
|----------|--------|-------|
| requirements.md | completed | M2 PRD — Dataview adapter, consent gate, user-import flow |
| solution.md | completed | M2 SDD — QueryEngine adapter, consent/checksum module, import parser, engine registry; ADR-1…9; mockups.html S11–S26 |
| plan/ | completed | 5 phases, 23 tasks: P1 Foundation → (P2 Import ∥ P3 Engines) → P4 Integration → P5 Validation; all 31 ACs mapped |

**Status values**: `pending` | `in_progress` | `completed` | `skipped`

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-07-15 | Scaffold spec 002-query-engine-dataview | M2 milestone per docs/build-plan.md; next after M1 (001, Implemented). Adds the query-engine layer + consent gate on top of the M1 spine. |
| 2026-07-15 | Research: 3 parallel agents (Security/consent-ref, Dataview-integration, UX/requirements); Agent Team mode | Consent maps 1:1 to M1 ViewRecord; Dataview API verified from installed main.js v0.5.68; 16 new states S11–S26 enumerated |
| 2026-07-15 | View-definition = vault note (`sf-view:true` frontmatter + one fenced query block); import via auto-scan picker | mason-pattern, self-documenting, maps cleanly to ViewRecord; picker scans metadataCache for sf-view |
| 2026-07-15 | DataviewJS engine is **desktop-only** (checksum via node:crypto); DQL + native fallback run on all platforms | Dataview blocks DataviewJS on mobile anyway → no artificial mobile-crypto work; DQL/native stay mobile-safe |
| 2026-07-15 | Consent bundle: DQL ungated (light confirm only); NO "enable-once" (Enable/Disable only); re-consent on version-OR-checksum drift | DQL is declarative/read-only; views re-render continuously so enable-once is wrong UX; OR-drift is the safer re-consent trigger |
| 2026-07-15 | Imported views managed by extending the existing SettingsTab (view list S22–S26) | Simplest for M2; dedicated manage-views modal/catalog deferred to M4 |
| 2026-07-15 | Open SDD spike: DataviewJS scoping-injection (how a DVJS view targets the panel subject vs dv.current()) | Genuine API unknown; resolve during SDD, not a PRD blocker |
| 2026-07-15 | PRD approved → proceed to SDD | 29 Gherkin ACs across F1–F4; exit criteria mapped; 4 open questions deferred to SDD |
| 2026-07-15 | Spike resolved (Open Q#1): DataviewJS/DQL subject-scoping via the `filePath` arg → `dv.current()`/DQL `this` = subject; no injection | Verified from Dataview main.js v0.5.68 (DataviewInlineApi.currentFilePath → dv.current) |
| 2026-07-15 | SDD ADR-1…9 confirmed | Engine registry (wired-only) + separate native fallback; feature-detect app.plugins.plugins.dataview.api on onLayoutReady + api-ready late-join (min 0.5.31); subject-scoping via filePath; sha256 raw-bytes checksum via node:crypto (DataviewJS desktop-only); DataviewJS full-disclosure + OR-drift re-consent, DQL light, no enable-once; sf-view note + one fenced block, auto-scan import; Component-teardown leak-free; extend SettingsTab; store-generated view id (source=path) |
| 2026-07-15 | SDD correction: query text read fresh from `source` note (never persisted, no M1 ViewRecord change); native fallback is NOT the `bases` slot (registry wired-only, may be empty) | Resolves the two flagged inconsistencies; keeps M1 contract intact |
| 2026-07-15 | Open Q#2 resolved (view-id = store-generated, data.json only); Q#3 (tab overflow = ellipsis+title) and Q#4 (sf-version = integer) fixed in ADR-9 | Preserves frontmatter-truth/read-only; sf-version integer forced by M1 okayed.version:number |
| 2026-07-15 | PLAN complete → spec Ready | 5 phases, 23 tasks; P1 Foundation → (P2 Import ∥ P3 Engines) → P4 Integration → P5 Validation; all 29 PRD ACs mapped; ready for /implement |
| 2026-07-15 | Implementation complete | M2 shipped on branch `feat/002-query-engine-dataview` (HEAD 212ca97). All 5 phases green: consent/checksum, import parser, query engines & registry, panel/settings integration, integration + live-vault validation. **413 tests** pass; six gates green (test, lint, typecheck, typecheck:test, schema:check, build). Every task passed tdd-guardian → spec-compliance → code-quality. PRD AC count reconciled to 31 (F1=7, F2=11, F3=7, F4=6) — plan docs corrected from an earlier 29; historical PRD/PLAN log rows left as-is. |
| 2026-07-18 | Docs reconciled to shipped reality (mason-alignment) | Import bind step (S22) retired in PRD/SDD/plan/live-checklist — shipped import is picker → single consent (S20/S21) → atomic commit, with command binding moved to a separate Settings "Edit" action (S27). Checksum corrected to cross-platform Web Crypto (`crypto.subtle.digest`), not desktop-only `node:crypto`. SDD interfaces backfilled (`commandLabel`, render signature, `requestConsentForDef`, `[[this]]` rewrite, add/removeCommand LOCAL-id gotcha). Historical 29-AC log rows left as-is. |

## Context

Milestone **M2 — Dataview engine + consent** from `docs/build-plan.md` (slug
`query-engine-dataview`). Puts the first real query engine behind the M1 seams.

**Scope:**
- **Dataview adapter** — run DQL + DataviewJS; Dataview is a feature-detected
  *soft* dependency; fall back to native `metadataCache` when Dataview is absent.
- **Consent gate** — clone markdown-mason `disclosure.ts` + checksum re-consent:
  full disclosure only for **DataviewJS** (arbitrary JS); **DQL** is
  declarative/low-risk. Per-view kill-switch; re-consent on version/checksum
  drift; safe-default = **disabled**.
- **User-import flow** — import a view definition from the vault; bind to a
  sidebar tab and/or a command; enable/disable.

**Exit:** a DataviewJS view can be imported, consented, run, and killed; a DQL
view runs without the full gate.

**Builds on M1 (spec 001, Implemented):**
- `ViewStore` already carries the consent slot `okayed:{version,checksum}|null`,
  the `engine` discriminant (`bases|dataview-dql|dataviewjs`), and the `command`
  flag — M2 fills these in.
- `ScopingService` / `NoteContext` provide the native `metadataCache` fallback.
- `SidebarView` exposes the `ContextTab` interface (tab seam) M2 renders into.

Governing docs: `DESIGN.md` §4 (query-engine seam), `views-and-integration.md`.
Reference implementation: markdown-mason `disclosure.ts` (consent/checksum).

---
*This file is managed by the xdd-meta skill.*
