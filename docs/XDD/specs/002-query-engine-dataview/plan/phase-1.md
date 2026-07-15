---
title: "Phase 1: Consent & checksum foundation"
status: in_progress
version: "1.0"
phase: 1
---

# Phase 1: Consent & checksum foundation

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: SDD/Building Block View — Directory Map]` (`src/consent/`, `src/import/fencedBlock.ts`)
- `[ref: SDD/Interface Specifications — Consent types + ConsentGate]`
- `[ref: SDD/Interface Specifications — Checksum]`
- `[ref: SDD/ADR-4]` (byte-exact SHA-256, `node:crypto` dynamic import, CRLF ≠ LF, desktop-only)
- `[ref: SDD/ADR-5]` (consent policy: DataviewJS full disclosure always; DQL light confirm only; drift on version-OR-checksum)
- `[ref: SDD/ADR-7]` (modal as standard Obsidian `Modal` subclass; focus trap inherited)
- `[ref: SDD/Runtime View — Flow C (DataviewJS consent path)]`
- `[ref: SDD/Runtime View — Flow D (Re-consent on checksum drift)]`
- `[ref: PRD/Feature 2 — Consent gate]`
- Reference (read before implementing): markdown-mason `src/consent/disclosure.ts` + `src/consent/checksum.ts`
- `[ref: SDD/Patterns Used — mason disclosure + checksum]`

**Key Decisions**:
- `fencedBlock.ts` is the shared extractor used by all phases; Phase 1 owns it — Phases 2 and 3 depend on it.
- SHA-256 is computed via `node:crypto` as a **dynamic import** (`await import("node:crypto")`) so the mobile bundle is never broken; call sites guard with `Platform.isDesktop`.
- `ConsentGate.evaluate()` reads the fenced block **fresh** from `record.source` on every call — this is what makes drift detection byte-exact and sound.
- `ConsentDecision` is a discriminated union; fail-closed means any unknown/error case resolves to `not-consented` or `engine-missing`.
- The disclosure modal writes `okayed:{version,checksum}` + `enabled:true` in a **single** `ViewStore.setRecord()` call (ADR-4/ADR-5). `okayed` is never partially written.
- Cancel is the default-focused button in the DataviewJS disclosure modal (S20/S23); the "Enable" button requires explicit click — no accidental keyboard activation.

**Dependencies**: none — this phase is the foundation all others build on. Must complete before Phase 2 or Phase 3 may start.

---

## Tasks

Establishes the fenced-block extractor, byte-exact checksum, consent-gate logic, and disclosure modals that all subsequent phases depend on.

- [ ] **T1.1 Fenced-block extractor** `[activity: domain-modeling]`

  1. Prime: Read `[ref: SDD/Building Block View — Directory Map]` (the `fencedBlock.ts` entry) and `[ref: SDD/Implementation Examples — ViewImporter.parse()]` (shows the extractor contract). Read `src/store/types.ts` to understand `ViewRecord.source` (vault path).
  2. Test (RED): `readFencedBlock(app, path)` returns `{lang, body}` when note exists with exactly one fenced block; returns `null` when the note does not exist (vault.getAbstractFileByPath → null); returns `null` when the note has zero fenced blocks; returns `null` when the note has more than one matching fenced block (the extractor is not the one that rejects — callers receive null and handle the ambiguous case); handles CRLF in block body (body bytes are returned as-is, no normalisation).
  3. Implement (GREEN): Create `src/import/fencedBlock.ts` — export `readFencedBlock(app: App, sourcePath: string): Promise<{lang: string; body: string} | null>`. Read the file via `app.vault.read()`; parse fenced blocks with language tags `dataview` or `dataviewjs`; return the single matching block or null. No CRLF normalisation.
  4. Validate: unit tests pass; `npm run lint`; `npm run typecheck`; `npm run typecheck:test`.
  - Success: extractor returns `null` for missing notes and ambiguous block counts (not a throw) `[ref: SDD/Error Handling — "view.source note deleted from vault"]`; body bytes are byte-exact `[ref: SDD/ADR-4]`; `[ref: PRD/F2 — "byte-exact SHA-256"]`.

- [ ] **T1.2 Checksum** `[activity: domain-modeling]`

  1. Prime: Read `[ref: SDD/Interface Specifications — Checksum]` (the full `checksum.ts` spec). Read `[ref: SDD/ADR-4]` (byte-exact, CRLF ≠ LF, dynamic import, `"sha256:<hex>"` prefix). Read `[ref: SDD/Implementation Gotchas]` (`node:crypto` must be a dynamic import).
  2. Test (RED): `computeChecksum("hello\n")` returns a string matching `/^sha256:[0-9a-f]{64}$/`; `computeChecksum("hello\r\n")` returns a different checksum than `computeChecksum("hello\n")` (CRLF ≠ LF); `computeChecksum("")` does not throw (empty source is valid); same input always produces the same output (deterministic); the `Checksum` type alias is exported.
  3. Implement (GREEN): Create `src/consent/checksum.ts` — export `computeChecksum(source: string): string` (using `await import("node:crypto")` inside the function body) and export the `Checksum = `sha256:${string}`` type alias. Encode source as UTF-8 bytes; SHA-256 digest; prefix `sha256:`.
  4. Validate: unit tests pass (including CRLF ≠ LF assertion); `npm run lint`; `npm run typecheck`; `npm run typecheck:test`.
  - Success: checksum is byte-exact over raw bytes `[ref: SDD/ADR-4]` `[ref: SDD/EARS F2 — "THE SYSTEM SHALL compute checksums over raw fenced block source bytes using SHA-256 via node:crypto, prefixed sha256:, with no CRLF normalisation"]`; `[ref: PRD/AC-F2.12]`.

- [ ] **T1.3 ConsentGate — evaluate logic** `[activity: domain-modeling]`

  1. Prime: Read `[ref: SDD/Interface Specifications — Consent types + ConsentGate]` (the full interface, `ConsentDecision` union, `evaluate()` contract). Read `[ref: SDD/ADR-5]` (consent policy, drift rules, kill-switch). Read `[ref: SDD/Implementation Examples — Consent drift detection]` (the illustrative evaluate() body). Read `src/store/types.ts` (`parseOkayed`, `ViewRecord.enabled`, `ViewRecord.engine`).
  2. Test (RED): `evaluate(record)` returns `{status:"disabled"}` when `record.enabled === false` regardless of `okayed`; returns `{status:"platform-restricted"}` for `engine:"dataviewjs"` on `Platform.isMobile` (mock Platform); returns `{status:"engine-missing"}` when `EngineRegistry.get(record.engine)` returns undefined; returns `{status:"dvjs-off"}` for `engine:"dataviewjs"` when `enableDataviewJs` is false in Dataview settings (mock the setting); returns `{status:"not-consented"}` when `okayed` is null; returns `{status:"not-consented"}` when `readFencedBlock` returns null (source missing); returns `{status:"drift", reason:"checksum"}` when checksum of fresh block ≠ `okayed.checksum`; returns `{status:"drift", reason:"version"}` when `okayed.version` ≠ `record.source`'s current `sf-version`; returns `{status:"drift", reason:"both"}` when both version and checksum differ; returns `{status:"consented"}` when `enabled`, engine wired, block present, version match, checksum match; check order: disabled → platform-restricted → engine-missing → dvjs-off → not-consented (null okayed or missing source) → drift → consented.
  3. Implement (GREEN): Create `src/consent/ConsentGate.ts` — export `ConsentDecision` union type and `ConsentGate` class implementing the interface from the SDD. `evaluate()` calls `readFencedBlock` + `computeChecksum` + compares to `record.okayed`. `requestConsent` and `requestReConsent` are stubs (return `false`) at this stage — implemented in T1.4.
  4. Validate: unit tests pass (all decision branches); `npm run lint`; `npm run typecheck`; `npm run typecheck:test`.
  - Success: fail-closed — any unconsented state prevents execution `[ref: SDD/ADR-5 — "safe default disabled"]` `[ref: SDD/EARS F2 — "not-consented SHALL NOT execute"]`; drift fires on version-OR-checksum independently `[ref: PRD/AC-F2.4]` `[ref: PRD/AC-F2.5]`; kill-switch leaves `okayed` intact `[ref: PRD/AC-F2.6]`.

- [ ] **T1.4 Disclosure modal** `[activity: frontend-ui]`

  1. Prime: Read `[ref: SDD/Cross-Cutting Concepts — User Interface & UX]` (state inventory S20, S21, S23). Read `[ref: SDD/ADR-5]` (DataviewJS full disclosure always; DQL light confirm only; Cancel default+autofocus). Read `[ref: SDD/Interface Specifications — ConsentGate — requestConsent/requestReConsent]`. Read `docs/XDD/specs/002-query-engine-dataview/mockups.html` (states S20, S21, S23). Read `[ref: SDD/System-Wide Patterns — Accessibility]` (standard `Modal` subclass, focus trap, keyboard dismiss). Read M1 `src/views/SidebarView.ts` for `createEl`-safe DOM creation patterns.
  2. Test (RED): DataviewJS disclosure modal (S20) displays view name, description, source note path, full DataviewJS source in a scrollable block, and the `sha256:` checksum; Cancel button is focused by default; clicking "Enable" returns `true` from `requestConsent`; clicking Cancel or pressing Escape returns `false`; `ViewStore.setRecord` is called with `okayed:{version,checksum}` + `enabled:true` ONLY when "Enable" is clicked (never on Cancel); DQL light confirm (S21) shows the view name, the DQL query source, and a "declarative, read-only" message — but NOT the DataviewJS security warning (per mockup S21; the S20↔S21 difference is the security framing, not source visibility); clicking "Enable" returns `true`; re-consent modal (S23) is identical in structure to S20 for DataviewJS and S21 for DQL; no `innerHTML` with untrusted data (XSS-safe: all source shown via `createEl`/`textContent`).
  3. Implement (GREEN): Complete `ConsentGate.requestConsent(id, record)` and `ConsentGate.requestReConsent(id, record)` stubs into full implementations. Create `src/consent/DisclosureModal.ts` (a `Modal` subclass) with two variants: full-disclosure (DataviewJS, S20/S23) and light-confirm (DQL, S21). On "Enable": call `readFencedBlock` fresh → `computeChecksum` → `this.store.setRecord(id, {...record, okayed:{version, checksum}, enabled:true})` in one call → resolve `true`. On Cancel/Escape: resolve `false` without writing. Default-focus Cancel button via `el.focus()` in `onOpen`. All user-supplied text rendered via `createEl` + `textContent` (never `innerHTML`).
  4. Validate: unit tests pass (via `test/__mocks__/obsidian.ts` Modal mock); `npm run lint`; `npm run typecheck`; `npm run typecheck:test`.
  - Success: DataviewJS source is shown verbatim and the checksum is displayed to the writer `[ref: SDD/EARS F2 — "THE SYSTEM SHALL display a full disclosure modal (S20)"]`; `okayed` is never written on Cancel `[ref: PRD/AC-F2.2]` `[ref: PRD/AC-F2.3]`; single `setRecord` call per Enable `[ref: SDD/ADR-4]`; DQL never shows full disclosure `[ref: SDD/ADR-5 Rule 3]` `[ref: PRD/AC-F2.8]`; re-consent modal (S23) identical path to initial consent for DataviewJS `[ref: SDD/ADR-5 Rule 2]`.

- [ ] **T1.5 Phase Validation** `[activity: validate]`

  - Run `npm test` (all Phase 1 tests pass). Run `npm run lint`. Run `npm run typecheck`. Run `npm run typecheck:test`.
  - Verify: `readFencedBlock` returns null (not throw) for all absent/ambiguous cases; `computeChecksum` produces `"sha256:<64hex>"` with CRLF ≠ LF confirmed by test; `ConsentGate.evaluate()` covers all 8 `ConsentDecision` branches; disclosure modal never calls `innerHTML` with untrusted content; `setRecord` called exactly once on Enable and never on Cancel. All `[ref: SDD/ADR-4]`, `[ref: SDD/ADR-5]`, `[ref: PRD/Feature 2]` acceptance criteria covered.
