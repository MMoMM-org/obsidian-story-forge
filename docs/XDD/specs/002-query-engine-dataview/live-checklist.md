---
title: "M2 Live-Vault Checklist"
status: in_progress
version: "1.0"
---

# M2 Live-Vault Checklist (test/StoryForge/)

Run `npm run dev` and open the `test/StoryForge/` vault in Obsidian before manual steps.
Confirm all AUTO items are green via `npm test` before proceeding to manual checks.

## Seed notes

| Note | Engine | Vault path |
|---|---|---|
| `characters-in-scene.md` | `dataview-dql` | `sf-views/characters-in-scene.md` |
| `scene-debug-dvjs.md` | `dataviewjs` | `sf-views/scene-debug-dvjs.md` |

Both notes are verified parseable by `ViewImporter.parse()` via `test/import/seedNotes.test.ts`.

---

## Panel body states (S11–S18)

### S11 — Engine missing

**Trigger**: Dataview plugin not installed or disabled in the test vault.

**Coverage**: [AUTO] — `test/integration/m2-flows.test.ts` > "Native fallback when Dataview absent" — `buildEngineRegistry(app)` with no Dataview returns an empty registry; `SidebarView._renderResolved` renders the S11 engine-missing placeholder and native entity context without crashing.

**Manual step**: [ ] Disable the Dataview community plugin in `test/StoryForge/.obsidian/plugins/`; reload Obsidian; open the Story Forge sidebar panel; confirm the S11 "engine missing" banner renders and the native entity context (scene/character fields) is still visible below it. Re-enable Dataview when done.

---

### S12 — Consent required (DataviewJS)

**Trigger**: A DataviewJS view tab is selected; `okayed` is null — consent never given.

**Coverage**: [AUTO] — `test/integration/m2-flows.test.ts` > "DataviewJS full flow" — after `importToStore`, `ConsentGate.evaluate()` returns `not-consented`; the panel renders the S12 state before any modal interaction; code is NOT executing at this point.

---

### S13 — Loading

**Trigger**: A consented view is active; the query has been dispatched but the result has not yet arrived (debounced on note switch).

**Coverage**: Manual only — requires a live Dataview instance with a slow query.

**Manual step**: [ ] Import and consent `characters-in-scene.md`; open a scene note with many backlinks; switch notes rapidly to catch the debounce window; confirm the loading spinner (S13) appears in the tab body before the result arrives.

---

### S14 — Result

**Trigger**: A consented DQL query has returned rows; the engine has rendered them into the tab body.

**Coverage**: Manual — requires live Dataview rendering.

**Manual step**: [ ] Import and consent `characters-in-scene.md`; open a scene note that links to at least one character note tagged `#canon/character`; confirm a Dataview table appears in the tab body showing character names (S14).

---

### S15 — Error (source missing)

**Trigger**: The source note was deleted after import; `evaluate()` returns `not-consented` with a source-missing reason.

**Coverage**: [AUTO] — `test/integration/m2-flows.test.ts` > "Source missing after import" — vault mock returns null for the note path; `evaluate()` returns `{status: "not-consented", reason: "source-missing"}`; S15 error state is asserted in the panel render.

**Manual step**: [ ] Import `characters-in-scene.md`; then delete the file from the vault; re-open the panel tab; confirm the S15 "source missing" error box appears with a Retry button.

---

### S16 — Disabled

**Trigger**: The view exists in the store but `enabled: false` (user toggled it off via the kill-switch in settings).

**Coverage**: [AUTO] — `test/integration/m2-flows.test.ts` > "Kill-switch preserves okayed" — after Disable, `enabled: false`, `okayed` unchanged; the panel renders the S16 disabled placeholder.

---

### S17 — Re-consent required (DataviewJS)

**Trigger**: A DataviewJS view is active; the live checksum of the fenced block differs from `okayed.checksum`.

**Coverage**: [AUTO] — `test/integration/m2-flows.test.ts` > "Re-consent on checksum drift" — after editing the fenced block bytes, `evaluate()` returns `{status: "drift", reason: "checksum"}`; S17 state asserted before re-consent flow.

**Manual step**: [ ] Import and consent `scene-debug-dvjs.md`; edit the `dataviewjs` fenced block body (add a comment line); save and switch back to the panel tab; confirm S17 "re-consent required" banner appears with "Review & Re-enable…" button and that code is NOT executing.

---

### S18 — DQL light-confirm pending

**Trigger**: A DQL view tab is selected; `okayed` is null — the one-time light confirm has not been given.

**Coverage**: [AUTO] — `test/integration/m2-flows.test.ts` > "DQL light-confirm flow" — after `importToStore`, `evaluate()` returns `not-consented`; S18 state asserted before Enable is clicked.

**Manual step**: [ ] Import `characters-in-scene.md` without consenting; select its panel tab; confirm S18 "Enable…" button appears and DQL is not yet executing.

---

## Modals (S19–S23)

### S19 — Import picker modal

**Trigger**: User clicks "Import view" in the Story Forge settings tab.

**Coverage**: Manual — requires Obsidian UI interaction.

**Manual step**: [ ] Open Settings → Story Forge → Manage Views → "Import view"; confirm the S19 picker modal lists both seed notes (`characters-in-scene.md` and `scene-debug-dvjs.md`); confirm the modal title and list display correctly; close without importing.

---

### S20 — Full disclosure modal (DataviewJS)

**Trigger**: S19 "Next →" selected on a DataviewJS view (`scene-debug-dvjs.md`).

**Coverage**: Manual — requires Obsidian Modal interaction.

**Manual step**: [ ] From S19, select `scene-debug-dvjs.md` and click "Next →"; confirm the S20 full disclosure modal appears showing: source path, checksum (sha256:…), security warning banner, query source preview; confirm "Cancel" is auto-focused (default action); click Cancel to dismiss.

---

### S21 — Light confirm modal (DQL)

**Trigger**: S19 "Next →" selected on a DQL view (`characters-in-scene.md`).

**Coverage**: [AUTO] — `test/integration/m2-flows.test.ts` > "DQL light-confirm flow" — `requestConsent()` opens light-confirm modal; Enable click writes `okayed`; `evaluate()` then returns `consented`.

**Manual step**: [ ] From S19, select `characters-in-scene.md` and click "Next →"; confirm the S21 light confirm modal shows the DQL source, a read-only note, and NO security warning banner; click "Enable" to proceed.

---

### S22 — Bind modal

**Trigger**: S20 or S21 "Enable" pressed; user chooses sidebar tab label and optional command name.

**Coverage**: Manual — requires modal interaction after consent.

**Manual step**: [ ] After S21 Enable on `characters-in-scene.md`, confirm the S22 Bind modal appears; verify the tab label is pre-filled with "Characters in scene" (from `sf-name`); verify the command checkbox is present; complete the bind step and confirm the view appears in the panel.

---

### S23 — Re-consent modal (DataviewJS)

**Trigger**: S17 "Review & Re-enable…" clicked; same layout as S20 but with a "Query changed" warning banner at the top.

**Coverage**: [AUTO] — `test/integration/m2-flows.test.ts` > "Re-consent on checksum drift" — `requestReConsent()` is called; after Enable, `evaluate()` returns `consented` again.

**Manual step**: [ ] After triggering S17 (see S17 manual step), click "Review & Re-enable…"; confirm S23 modal shows the "Query changed" warning banner at the top; confirm Cancel is auto-focused; click Enable and verify the panel transitions back to S13/S14 (loading then result).

---

## Settings rows (S24–S26)

### S24 — Settings row, Enabled

**Trigger**: A view in the store has `enabled: true` and a current (non-drifted) checksum.

**Coverage**: Manual — requires Obsidian settings UI.

**Manual step**: [ ] Import and consent `characters-in-scene.md`; open Settings → Story Forge → Manage Views; confirm the row shows "Enabled" status badge and a "Disable" action button.

---

### S25 — Settings row, Disabled / Consent-required

**Trigger**: Sub-variant A: `enabled: false` (user toggled off). Sub-variant B: live checksum differs from stored checksum (consent stale).

**Coverage**: Manual.

**Manual step A**: [ ] Disable a previously enabled view in settings; confirm the row shows "Disabled" badge and a "Re-enable" button that re-enables immediately without opening a new consent modal (since the source is unchanged).

**Manual step B**: [ ] Edit a consented view's fenced block (checksum drift); open Settings; confirm the row shows "Consent required" badge and a "Review" button that opens S20/S21.

---

### S26 — Settings row, Engine unavailable

**Trigger**: A view in the store references a Dataview engine, but the Dataview plugin is not installed.

**Coverage**: [AUTO] — `test/integration/m2-flows.test.ts` > "Native fallback when Dataview absent" — registry is empty; `SidebarView._renderResolved` renders the engine-missing state (S11 in panel, S26 in settings row).

**Manual step**: [ ] Disable the Dataview plugin; open Settings → Story Forge → Manage Views; confirm both rows show S26 "Engine unavailable" badge; confirm no crash or unhandled exception occurs; re-enable Dataview when done.

---

## State coverage summary

| State | Description | Coverage |
|---|---|---|
| S11 | Engine missing | [AUTO] m2-flows: native fallback test + [Manual] |
| S12 | Consent required (DataviewJS) | [AUTO] m2-flows: full-flow test |
| S13 | Loading | [Manual] |
| S14 | Result rendered | [Manual] |
| S15 | Error / source missing | [AUTO] m2-flows: source-missing test |
| S16 | Disabled | [AUTO] m2-flows: kill-switch test |
| S17 | Re-consent required | [AUTO] m2-flows: checksum-drift test |
| S18 | DQL light-confirm pending | [AUTO] m2-flows: DQL-flow test |
| S19 | Import picker modal | [Manual] |
| S20 | Full disclosure modal (DataviewJS) | [Manual] |
| S21 | Light confirm modal (DQL) | [AUTO] m2-flows: DQL-flow test + [Manual] |
| S22 | Bind modal | [Manual] |
| S23 | Re-consent modal (DataviewJS) | [AUTO] m2-flows: re-consent test + [Manual] |
| S24 | Settings row — Enabled | [Manual] |
| S25 | Settings row — Disabled / Consent-required | [Manual] |
| S26 | Settings row — Engine missing | [AUTO] m2-flows: native fallback test + [Manual] |
