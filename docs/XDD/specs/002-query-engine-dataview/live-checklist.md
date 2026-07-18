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

**Coverage**: [AUTO] `test/integration/m2-flows.test.ts`:
- `"buildEngineRegistry returns empty registry when Dataview absent"` — confirms the registry is empty when Dataview is not present.
- `"SidebarView with empty registry renders S11 engine-missing and calls nativeEngine.render (no crash)"` — confirms the panel renders the S11 state and native entity context without crashing.

**Manual step**: [ ] Disable the Dataview community plugin in `test/StoryForge/.obsidian/plugins/`; reload Obsidian; open the Story Forge sidebar panel; confirm the S11 "engine missing" banner renders and the native entity context (scene/character fields) is still visible below it. Re-enable Dataview when done.

---

### S12 — Consent required (DataviewJS)

**Trigger**: A DataviewJS view tab is selected; `okayed` is null — consent never given.

**Coverage**: [AUTO] `test/integration/m2-flows.test.ts`:
- `"executeJs is NOT called before okayed is written; after Enable it is called with subject path"` — asserts that code is NOT executing in the pre-consent (S12) state; the test asserts `executeJs` is not called until after Enable is clicked and `okayed` is written.

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

**Coverage**: [AUTO] `test/integration/m2-flows.test.ts`:
- `"evaluate returns not-consented when source note is deleted after consent was granted"` — vault mock returns null for the note path; `evaluate()` returns the source-missing not-consented variant.

**Manual step**: [ ] Import `characters-in-scene.md`; then delete the file from the vault; re-open the panel tab; confirm the S15 "source missing" error box appears with a Retry button.

---

### S16 — Disabled

**Trigger**: The view exists in the store but `enabled: false` (user toggled it off via the kill-switch in settings).

**Coverage**: [AUTO] `test/integration/m2-flows.test.ts`:
- `"disabling a consented view keeps okayed intact; re-enabling returns consented without modal"` — after Disable, `enabled: false`, `okayed` unchanged; re-enabling immediately returns `consented` without opening a modal.

---

### S17 — Re-consent required (DataviewJS)

**Trigger**: A DataviewJS view is active; the live checksum of the fenced block differs from `okayed.checksum`.

**Coverage**: [AUTO] `test/integration/m2-flows.test.ts`:
- `"evaluate returns drift/checksum after fenced block body changes; re-consent restores consented"` — after editing the fenced block bytes, `evaluate()` returns `{status: "drift", reason: "checksum"}`; S17 state is exercised before re-consent; after `requestReConsent()` and Enable, `evaluate()` returns `consented` again.

**Manual step**: [ ] Import and consent `scene-debug-dvjs.md`; edit the `dataviewjs` fenced block body (add a comment line); save and switch back to the panel tab; confirm S17 "re-consent required" banner appears with "Review & Re-enable…" button and that code is NOT executing.

---

### S18 — DQL light-confirm pending

**Trigger**: A DQL view tab is selected; `okayed` is null — the one-time light confirm has not been given.

**Coverage**: [AUTO] `test/integration/m2-flows.test.ts`:
- `"DQL import → light-confirm Enable → consented → dvApi.execute called with subject path"` — the pre-Enable state (S18) is exercised when `evaluate()` returns `not-consented` before `requestConsent()` is called; after Enable, `dvApi.execute` is called with the subject path.

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

**Coverage**: [AUTO] `test/integration/m2-flows.test.ts`:
- `"DQL import → light-confirm Enable → consented → dvApi.execute called with subject path"` — `requestConsent()` opens the light-confirm modal; Enable click writes `okayed`; `evaluate()` then returns `consented`; `dvApi.execute` is called with the correct subject path.

**Manual step**: [ ] From S19, select `characters-in-scene.md` and click "Next →"; confirm the S21 light confirm modal shows the DQL source, a read-only note, and NO security warning banner; click "Enable" to proceed.

---

### Import commit (no bind modal)

**Trigger**: S20 or S21 "Enable" pressed. The import flow is picker → single consent → atomic commit; there is NO bind step (retired, mason-aligned).

**Coverage**: Manual — requires modal interaction after consent.

**Manual step**: [ ] After S21 Enable on `characters-in-scene.md`, confirm NO bind modal appears; the view commits immediately with its sidebar tab label defaulting to "Characters in scene" (from `sf-name`) and appears in the panel. (Command binding is set later via the S27 Edit view, below.)

---

### S27 — Edit view

**Trigger**: User clicks "Edit" on a view row in Settings → Story Forge → Manage Views.

**Coverage**: Manual — requires Obsidian settings UI.

**Manual step**: [ ] Import and consent `characters-in-scene.md`; open Settings → Story Forge → Manage Views; click "Edit" on its row; rename the sidebar tab label (e.g. to "Cast") and confirm the panel tab label updates; toggle the command binding on and confirm an independent, editable command name field appears and a command palette entry is registered; toggle it off and confirm the command is removed.

---

### S23 — Re-consent modal (DataviewJS)

**Trigger**: S17 "Review & Re-enable…" clicked; same layout as S20 but with a "Query changed" warning banner at the top.

**Coverage**: [AUTO] `test/integration/m2-flows.test.ts`:
- `"evaluate returns drift/checksum after fenced block body changes; re-consent restores consented"` — `requestReConsent()` is invoked; after Enable, `evaluate()` returns `consented` again.

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

**Coverage**: [AUTO] `test/integration/m2-flows.test.ts`:
- `"buildEngineRegistry returns empty registry when Dataview absent"` — registry is empty when Dataview is not present.
- `"ConsentGate returns engine-missing when registry is empty"` — `evaluate()` returns `engine-missing` for a view whose engine is not available in the registry.

**Manual step**: [ ] Disable the Dataview plugin; open Settings → Story Forge → Manage Views; confirm both rows show S26 "Engine unavailable" badge; confirm no crash or unhandled exception occurs; re-enable Dataview when done.

---

## State coverage summary

| State | Description | Coverage |
|---|---|---|
| S11 | Engine missing | [AUTO] `"buildEngineRegistry returns empty registry when Dataview absent"` + `"SidebarView with empty registry renders S11 engine-missing and calls nativeEngine.render (no crash)"` + [Manual] |
| S12 | Consent required (DataviewJS) | [AUTO] `"executeJs is NOT called before okayed is written; after Enable it is called with subject path"` |
| S13 | Loading | [Manual] |
| S14 | Result rendered | [Manual] |
| S15 | Error / source missing | [AUTO] `"evaluate returns not-consented when source note is deleted after consent was granted"` |
| S16 | Disabled | [AUTO] `"disabling a consented view keeps okayed intact; re-enabling returns consented without modal"` |
| S17 | Re-consent required | [AUTO] `"evaluate returns drift/checksum after fenced block body changes; re-consent restores consented"` |
| S18 | DQL light-confirm pending | [AUTO] `"DQL import → light-confirm Enable → consented → dvApi.execute called with subject path"` |
| S19 | Import picker modal | [Manual] |
| S20 | Full disclosure modal (DataviewJS) | [Manual] |
| S21 | Light confirm modal (DQL) | [AUTO] `"DQL import → light-confirm Enable → consented → dvApi.execute called with subject path"` + [Manual] |
| — | Import commit (no bind modal) | [Manual] |
| S27 | Edit view (rename tab label / toggle command) | [Manual] |
| S23 | Re-consent modal (DataviewJS) | [AUTO] `"evaluate returns drift/checksum after fenced block body changes; re-consent restores consented"` + [Manual] |
| S24 | Settings row — Enabled | [Manual] |
| S25 | Settings row — Disabled / Consent-required | [Manual] |
| S26 | Settings row — Engine missing | [AUTO] `"buildEngineRegistry returns empty registry when Dataview absent"` + `"ConsentGate returns engine-missing when registry is empty"` + [Manual] |
