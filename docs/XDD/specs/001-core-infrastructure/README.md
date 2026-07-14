# Specification: 001-core-infrastructure

## Status

| Field | Value |
|-------|-------|
| **Created** | 2026-07-13 |
| **Current Phase** | Implemented |
| **Last Updated** | 2026-07-14 |

## Documents

| Document | Status | Notes |
|----------|--------|-------|
| requirements.md | completed | M1 PRD + mockups.html (S1–S10) |
| solution.md | completed | ADR-1…6 confirmed; ViewStore/ScopingService/SidebarView design |
| plan/ | completed | 4 phases, 15 tasks (P1∥P2 → P3 → P4) |

**Status values**: `pending` | `in_progress` | `completed` | `skipped`

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-07-13 | Scaffold spec 001-core-infrastructure | First XDD spec; M1 is the critical-path spine (store + scoping layer + sidebar shell) per docs/build-plan.md |
| 2026-07-13 | Start with PRD; Standard research mode | Default XDD cycle; M1 scope is bounded, integrations come in later milestones |
| 2026-07-13 | View store clones mason `store.ts` verbatim (flat record keyed by id, no schemaVersion/migration, `command: boolean`, `okayed:{version,checksum}\|null`, fail-closed defaults, immediate save) + an `engine` discriminant | Battle-tested sibling pattern; avoids inventing migration; resolves the Technical-vs-mason record-shape conflict toward the proven code |
| 2026-07-13 | M1 scoping resolves **outgoing relations only**; backlinks/"appears in" seam present in NoteContext but the reverse index is deferred to M3 | Lower-risk M1; both research agents flagged reverse-links as the risky bit; build it when it's actually rendered |
| 2026-07-13 | Pin / lock-to-note toggle **included** in the M1 shell | Highest-value follow affordance and cheap to build in the shell (UX finding) |
| 2026-07-13 | Interfaces captured as **HTML mockups** (`mockups.html`), not prose | Marcus: mockups beat describing layout; standing preference for all view milestones |
| 2026-07-13 | Panel **navigation model**: entity name-click = drill-in (subject changes, editor stays); `↗`/⌘-click = open note; `▾` = sibling entities of same category; `‹ pill ›` = switch category; `‹` = back. Built in **M3**; M1 ships only the subject-source seam (follow/pinned) | Answers the "view a character in the panel / jump between them" use case; pin already proves subject ≠ active note |
| 2026-07-13 | PRD approved → proceed to SDD | Requirements + mockups reviewed and accepted |
| 2026-07-13 | SDD ADR-1…6 confirmed → proceed to PLAN | Store=mason clone; single tabbed ItemView + subject abstraction; metadataCache-only scoping (backlinks→M3); tag-first classification; active-leaf-change+debounce+onLayoutReady; persist only on store mutations |
| 2026-07-13 | PLAN complete → spec Ready | 4 phases, 15 tasks; P1 View store ∥ P2 Scoping → P3 Panel shell → P4 Integration/E2E; all PRD ACs mapped |
| 2026-07-14 | Implementation complete | M1 shipped on branch feat/001-core-infrastructure (25 commits, not yet merged to main). Delivered: ViewStore (src/store/) with fail-closed defaults; ScopingService + engine-free NoteContext (src/scoping/); SidebarView panel shell with follow/pin/S2–S9 state machine + a11y (src/views/); main.ts wiring (shared PluginDataPort, ribbon+command, settings/views read-modify-write). 172 unit tests; gates green (test/lint/typecheck/schema:check/build). Deferred: tsconfig.test.json + mock fidelity (TaskList #5); manual GUI live-testing checklist (docs/live-testing.md) pending maintainer pass. Drift resolved: minAppVersion held at 1.5.7 (CON-1); no detach-leaves on unload (obsidianmd guidance); constants→pluginConstants rename accepted. |

## Context

Milestone **M1 — Core infrastructure** from `docs/build-plan.md`. The shared spine
every view sits on, with no user-facing views yet:

- **View store** (clone markdown-mason `store.ts` shape): per-view record in
  `data.json` — `{ provenance, enabled, okayed, source, command }`.
- **Scoping layer:** resolve the active note's links/backlinks via `metadataCache`,
  classify against canon tags — the "follows the active note" glue.
- **Sidebar `ItemView` shell:** dockable, tabbed, follows the active editor.

Governing docs: `DESIGN.md`, `views-and-integration.md`, `build-plan.md`,
`storyline-analysis.md`. Guiding principle: frontmatter is the source of truth;
Bases/Dataview render; the plugin writes back only plain Properties.

---
*This file is managed by the xdd-meta skill.*
