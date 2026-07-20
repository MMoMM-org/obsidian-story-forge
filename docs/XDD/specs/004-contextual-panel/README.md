# Specification: 004-contextual-panel

## Status

| Field | Value |
|-------|-------|
| **Created** | 2026-07-19 |
| **Current Phase** | Implemented |
| **Last Updated** | 2026-07-20 |

## Documents

| Document | Status | Notes |
|----------|--------|-------|
| requirements.md | completed | M3 PRD — F1–F7, ~42 ACs; mockups S32–S43; character-panel first; decisions D1–D6 embedded |
| mockups.html | completed | 12 styled-HTML states S32–S43 (per UI-as-mockups rule), real seed-vault data; image slots S36/S37 |
| solution.md | completed | M3 SDD — ADR-1…9; reverse index (sync, field-filtered), per-kind renderers in new src/panel/, plotline/book+image schema, drill-in nav + link-click setting |
| plan/ | completed | 5 phases, 19 tasks: P1 Schema ∥ P2 Reverse-index → P3 Renderers → P4 Nav/Settings → P5 Curated views + seed + validation; all F1–F7 ACs mapped |

**Status values**: `pending` | `in_progress` | `completed` | `skipped`

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-07-19 | Scaffold spec 004-contextual-panel | M3 milestone per `docs/build-plan.md` (slug `contextual-panel`, ships v0.1); next after M2 (spec 002, Implemented) and the M2.5 settings work (spec 003). The payoff milestone — the panel finally shows type-aware story facts. |
| 2026-07-19 | Research: 4 parallel agents (Requirements, UX/mockups, Technical, Integration), Agent Team mode | 4 perspectives converge: Context tab = native/dependency-free (reverse relations fill `NoteContext.backlinks` via field-filtered `frontmatterLinks`, NOT `getBacklinksForFile` → CON-8/mock-mismatch); hybrid render (native panel + curated Dataview view tabs); 12 mockup states S32–S43 authored; Security/Performance skipped (read-only render, consent shipped in M2). |
| 2026-07-19 | **D1 — Minimal schema for plotline + book NOW** (non-default) | Build-plan's plotline panel + scene's `book` relation target have no `schema/*.json`. Rather than render them schema-lessly, M3 authors minimal `schema/plotline.json` + `schema/book.json` (runbook-gated ADD, `schema:gen`) so they get full facts panels. Couples M3 to a schema change; follow `docs/schema-change-runbook.md`. |
| 2026-07-19 | D2 — Object/Lore "appears in" = fuzzy backlinks | Scenes carry no `objects`/`lore` frontmatter relation, so reverse "appears in" for those kinds falls back to generic prose backlinks (any `[[mention]]` in a scene). Documented as a known imprecision; no `scene.json` change in M3. |
| 2026-07-19 | **D3 — Link-click: drill-in default + open-on-modifier, settings-configurable** (non-default) | Panel entity rows support BOTH actions. Default = plain-click drills in (panel re-subjects, S41 nav stack), modifier-click opens the note. A new settings row lets the user swap which is the default. Extends the settings surface (spec 003 lineage). |
| 2026-07-19 | D4 — All 6 entity kinds ship in M3/v0.1 | character (first), scene, location, object, lore, plotline — full build-plan M3 scope in one spec. Larger PLAN, but v0.1 panel is complete for every canon + scene note. |
| 2026-07-19 | **D5 — Optional `image` for object + location, in M3** (review feedback) | Only `character.json` had `portrait`; per Marcus's review, add an optional `image` field to `object.json` + `location.json` (D1 already touches schema) and render a thumbnail tile like the portrait — but only when present, no monogram placeholder. Mockups S36/S37 updated. |
| 2026-07-19 | D6 — Contextual view switcher deferred to a GH issue (review feedback) | Marcus: view tabs like "characters in scene" are useless on a character note. Filtering view tabs/dropdown by the active note's kind + a dropdown switcher (strategy: contextual by default, "show all views" escape hatch) is a follow-on feature, not M3. Captured as [GH issue #1](https://github.com/MMoMM-org/obsidian-story-forge/issues/1); M3 keeps the M2 tab strip. Clarified S40 trigger: plotline panel shows when the active note is classified `plotline` (tag `#planning/plotline`, `ScopingService.ts:31`). |
| 2026-07-20 | PLAN complete → spec Ready | 5 phases, 19 tasks. P1 Schema (plotline/book/image/EntityKind) ∥ P2 Reverse-index (buildBacklinks, sync) → P3 Renderers (src/panel/ + dispatch, 6 kinds) → P4 Nav/Settings (drill-in stack + linkClickAction) → P5 Curated views + seed notes + full-gate validation. Every F1–F7 AC mapped; dependency graph acyclic; ready for /implement. |
| 2026-07-20 | Implementation complete | Phase 4–5 shipped the M3 contextual panel: linkClickAction setting + drill-in navigation (SubjectSource "drilled", navStack, single delegated leak-free link handler, data-sf-link target stamping), 6 curated reverse-relation sf-view notes, seed-vault gap notes (fantasy char Lyra Tidecall + non-empty portrait), and a 29-test integration suite. PRD F3 + SDD world-cycle reconciled to single-level breadcrumb per DV-2. 949 tests + all six gates green at e1e5670 on branch contextual-panel (unpushed). |
| 2026-07-19 | SDD complete — ADR-1…9 | Reverse index sync/field-filtered in `ScopingService.resolve()` filling `NoteContext.backlinks` via `resolvedLinks` prefilter + `frontmatterLinks` scan (NOT `getBacklinksForFile`, CON-2); per-kind renderers in a new `src/panel/` module with `NativeScopingEngine` as thin type dispatcher (contract-preserving); `ResolvedEntity` gains optional `fuzzy?`; drill-in nav stack (`SubjectSource` +`"drilled"`) + `linkClickAction` setting; `plotline`+`book` first-class schema (book needs new `EntityKind`+`TAG_MAP` row); optional `image` on object/location; character-fantasy = conditional sub-block. All interfaces verified against current code. |
| 2026-07-19 | PRD approved → proceed to SDD | 7 feature groups (F1 character panel, F2 reverse resolution, F3 other 5 kinds, F4 plotline/book schema, F5 empty states, F6 navigation, F7 curated views), ~40 Gherkin ACs; 12 mockup states S32–S43; MoSCoW set; 4 SDD-level open questions carried forward (reverse-index construction, renderer home, settings-row shape, new-schema field lists). |

## Context

Milestone **M3 — Contextual sidebar panel** from `docs/build-plan.md` (slug
`contextual-panel`, ships **v0.1**). The heart of the plugin: type-aware content
in the sidebar **Context tab**, driven by the scoping layer + Dataview, that
follows the active note and shows the right facts + relationships live.

**Scope (build-plan M3):**
- **character** first — facts + portrait, relationships
  (`significant_other`/`family`/`friends`/`allies`/`enemies`), **"appears in"**
  (reverse query on scenes' `pov`/`characters`), **owns** (objects with
  `owner` = this character), related locations/lore.
- then **location** (hierarchy + inhabitants + scenes here), **object**,
  **lore**, **scene** (entities in scene), **plotline** (scenes in it).
- Seed the default `_forge` views into the curated set (authored here; installed
  in M4's catalog).

**Exit:** open any canon or scene note → the panel shows the right facts and
"appears in"/links, live-updating as the active note changes. **v0.1 tag.**

**Builds on M1 (spec 001) + M2 (spec 002), both Implemented:**
- `SidebarView` — the panel shell with the **Context tab** seam
  (`NativeScopingEngine` renders it today); explicit M3 markers already in code
  (`"appears in: — (M3)"` footer, "M3: drill-in navigation (S10), backlinks
  seam" header note).
- `NoteContext.backlinks` — reserved M3 seam, currently always `[]`; M3 fills it.
- `ScopingService` resolves outgoing frontmatter links; M3 adds reverse
  resolution ("appears in", "owns", "inhabitants").
- M2 query engines (Dataview DQL/DVJS + native fallback) available behind the
  engine registry.

Governing docs: `DESIGN.md` §2 (surfaces), §5 (phasing), `build-plan.md` (M3),
`views-and-integration.md`. Entity fields are canonical in `schema/*.json`.

---
*This file is managed by the xdd-meta skill.*
