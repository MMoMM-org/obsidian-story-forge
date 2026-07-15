---
title: "Phase 5: Integration & validation"
status: completed
version: "1.0"
phase: 5
---

# Phase 5: Integration & validation

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: SDD/Quality Requirements]` (performance, correctness, portability, reliability, usability, security)
- `[ref: SDD/Acceptance Criteria (EARS) — F1–F4]` (the full EARS list is the gate)
- `[ref: SDD/Risks and Technical Debt]` (gotchas to verify in integration)
- `[ref: SDD/Runtime View — Flows A–E]` (all five flows exercised in integration tests)
- `[ref: PRD/Success Metrics — Tracking Requirements]` (the verification event table)
- `[ref: PRD/Feature 1–4 — all 29 acceptance criteria]`
- M1 plan `docs/XDD/specs/001-core-infrastructure/plan/phase-4.md` — mirrors live-testing pattern and checklist format

**Key Decisions**:
- Integration tests are written against the existing `test/__mocks__/obsidian.ts` harness; no new mock infrastructure needed. They exercise full multi-component flows (import → consent → render → drift → re-consent → kill-switch → remove).
- The live-vault seed notes are the only writes to `test/StoryForge/` in M2 — one DQL view note and one DataviewJS view note, each with `sf-view:true` frontmatter and the correct fenced block.
- The live-vault checklist distinguishes automated states (covered by integration tests) from manual states (require `npm run dev` + Obsidian UI). Manual states are documented with reproduction steps.
- The full-gate pass at T5.3 is the M2 ship condition: all six commands green, plus the PRD AC→task mapping table confirms 100% coverage.
- No new dependencies are added in Phase 5. This phase is audit-and-validate only — no new source files beyond test fixtures and live-vault seed notes.

**Dependencies**: Phases 1, 2, 3, and 4 must all be complete.

---

## Tasks

Validates the fully integrated M2 feature through cross-component integration tests, a live-vault seed + checklist, and a gate pass confirming 100% PRD coverage.

- [x] **T5.1 Integration & E2E tests** `[activity: testing]`

  1. Prime: Read all four phase files (phase-1.md through phase-4.md) to understand the full component surface. Read `[ref: SDD/Runtime View — Flows A–E]` (the five sequenced flows to exercise). Read `[ref: PRD/Success Metrics — Tracking Requirements]` (the verification event table — each row in that table should map to one or more integration tests). Read `test/__mocks__/obsidian.ts` (`_runCleanup()`, Modal mock, Component mock, metadataCache mock — understand what integration-level setup is available).
  2. Test (RED): Write integration test files in `test/engines/`, `test/consent/`, `test/import/` that exercise the cross-component flows:
     - **DataviewJS full flow**: import DQL note (scanVault → parse → importToStore) → `ConsentGate.evaluate()` returns `not-consented` → `requestConsent()` opens DisclosureModal → user clicks Enable → `okayed:{version,checksum}` written → `evaluate()` returns `consented` → `DataviewJsEngine.render()` calls `dvApi.executeJs` with correct filePath.
     - **DQL light-confirm flow**: same import leg → `evaluate()` returns `not-consented` → `requestConsent()` opens light-confirm → Enable → `evaluate()` returns `consented` → `DataviewDqlEngine.render()` calls `dvApi.execute`.
     - **Native fallback when Dataview absent**: `buildEngineRegistry(app)` with no Dataview → empty registry → `SidebarView._renderResolved` renders S11 engine-missing + native entity context (not a crash).
     - **Re-consent on checksum drift**: consented DataviewJS view → edit the fenced block bytes → `evaluate()` returns `{status:"drift", reason:"checksum"}` → S17 rendered → `requestReConsent()` → Enable → `evaluate()` returns `consented` again.
     - **Re-consent on version drift**: consented DQL view → change `sf-version` in frontmatter (mock) → `evaluate()` returns `{status:"drift", reason:"version"}` → light re-confirm → re-consented.
     - **Kill-switch preserves `okayed`**: consented view → Disable → `enabled:false`, `okayed` unchanged → re-enable without drift → `evaluate()` returns `consented` immediately (no modal).
     - **Duplicate import blocked**: import same `sourcePath` twice → second `importToStore` throws `ImportError("DUPLICATE", ...)` → ViewStore has exactly one record.
     - **Source missing after import**: view imported → note deleted (vault mock returns null) → `evaluate()` returns `not-consented` (source-missing variant) → S15 rendered.
     - **Late-join wiring**: `main.ts` registers the `dataview:api-ready` listener → `_runCleanup()` confirms it is cleaned up on unload.
  3. Implement (GREEN): Write `test/integration/m2-flows.test.ts` (and any supporting helpers). Each flow above becomes one `it()` block or a tightly scoped `describe`. Use the existing mock harness; do not introduce new test infrastructure beyond minimal factories for `ViewRecord` and `ViewDefinition` test fixtures.
  4. Validate: `npm test` passes with all integration tests green; `npm run typecheck:test` passes; `npm run lint` passes.
  - Success: all five SDD runtime flows covered by at least one integration test `[ref: SDD/Runtime View — Flows A–E]`; DataviewJS never executes before `okayed` is written (assertion in the full-flow test) `[ref: SDD/Quality Requirements — Correctness]`; checksum re-consent fires on any byte change `[ref: SDD/Quality Requirements — Correctness]` `[ref: PRD/AC-F2.4]`; late-join listener is auto-cleaned `[ref: SDD/ADR-2]`.

- [x] **T5.2 Live-vault seed + checklist** `[activity: validate]`

  1. Prime: Read M1 plan `docs/XDD/specs/001-core-infrastructure/plan/phase-4.md` (the live-testing pattern and checklist format to mirror). Read mockups.html (all states S11–S26 — the checklist must reference each). Read `test/StoryForge/` directory structure to place seed notes correctly. Read `[ref: PRD/Success Metrics — Key Performance Indicators]` (the adoption/engagement criteria to verify).
  2. Test (RED): Seed notes must be parseable by `ViewImporter.parse()` — write unit tests (or extend existing import tests) that call `parse()` on the actual seed note paths in the test vault and assert no `ImportError` is thrown. Seed notes must have correct frontmatter schema — run `npm run schema:check` (must pass).
  3. Implement (GREEN): Create `test/StoryForge/sf-views/characters-in-scene.md` — a DQL view note with `sf-view: true`, `sf-version: 1`, `sf-name: "Characters in scene"`, `sf-engine: dataview`, and a single ` ```dataview ` fenced block containing a valid DQL query scoped to `this` (e.g. `TABLE file.name FROM [[this]] WHERE contains(tags, "#canon/character")`). Create `test/StoryForge/sf-views/scene-debug-dvjs.md` — a DataviewJS view note with `sf-view: true`, `sf-version: 1`, `sf-name: "Scene debug (DataviewJS)"`, `sf-engine: dataviewjs`, and a single ` ```dataviewjs ` fenced block containing a simple safe script (e.g. `dv.paragraph("Active note: " + dv.current()?.file?.name ?? "not indexed")`). Document the live-vault checklist inline in this task or in `docs/XDD/specs/002-query-engine-dataview/live-checklist.md` (planning artifact, not committed to main source):

     ```
     ## M2 Live-Vault Checklist (test/StoryForge/)

     Automated (covered by integration tests — verify green before manual checks):
     - [AUTO] S12: DataviewJS consent-required state (import flow test)
     - [AUTO] S16: Disabled state (kill-switch test)
     - [AUTO] S17: Re-consent required on checksum drift (drift test)
     - [AUTO] S21: DQL light confirm (DQL flow test)
     - [AUTO] Source-missing → not-consented (missing-source test)

     Manual (requires npm run dev + Obsidian open on test/StoryForge/):
     - [ ] S11: Engine missing — uninstall Dataview in test vault; open panel; confirm S11 renders and native entity context is visible
     - [ ] S11 (platform): not testable on desktop; confirmed by mobile guard unit test
     - [ ] S13: Loading — slow DQL query; observe spinner before result
     - [ ] S14: Result rendered — import characters-in-scene.md; consent DQL; open a scene note; confirm Dataview table renders
     - [ ] S15: Error — source note deleted after import; observe "source missing" state
     - [ ] S18: DQL light-confirm pending — visible in panel when DQL not yet enabled
     - [ ] S19: Import picker — "Import view" in Settings; confirm both seed notes listed
     - [ ] S20: Full disclosure modal — import scene-debug-dvjs.md; open DataviewJS tab; click "Review & Enable"; verify source + checksum shown; cancel default-focused
     - [ ] S22: Bind modal — after picker confirm; sf-name pre-filled; command checkbox present
     - [ ] S23: Re-consent (DataviewJS) — edit scene-debug-dvjs.md fenced block; re-open panel tab; verify S17 then S23 on "Review changes"
     - [ ] S24: Enabled row in Settings — DQL view enabled; confirm row shows Enabled state + Disable action
     - [ ] S25: Disabled/Consent-required row — freshly imported DataviewJS; confirm row shows Enable action
     - [ ] S26: Engine-missing row in Settings — Dataview absent; confirm S26 row for both engine types
     ```
  4. Validate: seed notes parse without `ImportError` (unit test); `npm run schema:check` passes; `npm run dev` deploys to `test/StoryForge/` without errors; manual checklist items documented with reproduction steps.
  - Success: at least one `sf-view:true` note per engine type exists in the test vault `[ref: PRD/Assumptions — "test vault has at least one sf-view:true note for each engine type"]`; all 16 states (S11–S26) are mapped to either an automated test or a manual checklist step `[ref: PRD/Success Metrics — Engagement]`; seed notes are valid per the view-definition format `[ref: SDD/ADR-6]`.

- [x] **T5.3 Full gate** `[activity: validate]`

  1. Prime: Re-read `[ref: PRD/Feature 1–4 — all 29 acceptance criteria]` and the Coverage map in `plan/README.md`. Re-read `[ref: SDD/Acceptance Criteria (EARS)]`. Re-read `[ref: SDD/Quality Requirements]`.
  2. Test (GREEN → verify all green):

     Run each command and confirm zero failures:
     ```bash
     npm test                # vitest — all unit + integration tests
     npm run lint            # eslint + stylelint — zero errors/warnings
     npm run typecheck       # tsc --noEmit (src/) — zero errors
     npm run typecheck:test  # tsc --noEmit (test/) — zero errors
     npm run schema:check    # frontmatter drift gate — exits 0
     npm run build           # tsc + esbuild production — exits 0
     ```

  3. Implement (fix any failures): this step is diagnostic — investigate each failure, trace it to the relevant task (T1.x–T4.x), and fix the root cause. Do not suppress linter warnings or typecheck errors with `// eslint-disable` or `// @ts-ignore` unless the SDD explicitly sanctions a suppression.

  4. Validate: PRD F1–F4 AC→task mapping table (reproduce from plan/README.md Coverage map; confirm no AC is mapped to zero tasks):

     | PRD Feature | AC count | Mapped tasks |
     |---|---|---|
     | F1 — Dataview adapter | 9 | T3.2, T3.3, T3.4, T4.1, T4.4 |
     | F2 — Consent gate | 12 | T1.2, T1.3, T1.4, T2.2, T4.1 |
     | F3 — User-import flow | 7 | T2.1, T2.2, T2.3, T4.3 |
     | F4 — View management | 6 | T4.2, T4.4 |
     | **Total** | **29** | all covered |

  - Success: all six commands exit 0 `[ref: SDD/Quality Requirements — Portability/Reliability]`; all 29 PRD ACs map to ≥1 task and ≥1 test `[ref: PRD/Success Metrics — Quality]`; zero unhandled exceptions from any Dataview adapter path `[ref: SDD/Quality Requirements — Reliability]`; DataviewJS never executes before `okayed` is recorded (confirmed by unit test + integration test both asserting this property) `[ref: SDD/Quality Requirements — Security]`.

- [x] **T5.4 Phase Validation** `[activity: validate]`

  - Confirm: `npm test` green (unit + integration); `npm run build` green; `npm run lint` green; `npm run typecheck` green; `npm run typecheck:test` green; `npm run schema:check` green.
  - Confirm: live-vault checklist completed (all AUTO items confirmed by test suite; all manual items documented with reproduction steps).
  - Confirm: the PRD Coverage map in `plan/README.md` has no unmapped acceptance criteria.
  - M2 is complete when this task passes. Signal readiness for M3 (`_forge` default views + contextual panel content).
