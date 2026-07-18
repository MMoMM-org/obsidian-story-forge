# Plan — Manage Views settings rows, mason card style (spec 003)

**Mockup (source of truth):** `docs/XDD/specs/003-settings-view-rows/mockups.html` (v3).
**Scope:** replace the flat `Setting`-API rows in `SettingsTab._renderViewRow` with mason-style
**cards**; keep all existing state-decision logic and action methods. Imported-only (the Official
catalog / import-from-repo is M4). Everything in one Views place. Theme-token colours (light/dark).

## What stays (do NOT rewrite)
- `SettingsTab.displayAsync` / `_renderViewsSection(gen)` — the store subscription, the `_displayGen`
  re-entrancy guard, the `Promise.all(evaluate({...record, enabled:true}))` projection, and the two
  gen re-checks. Only the *painting* inside the row loop changes.
- Action methods `_disableView`, `_enableView`, `_reEnableView`, `_reviewView`, `_editView`/
  `_editViewAsync` (S27 BindModal — command-assign lives here), `_removeView`. Reuse verbatim.
- `ConsentGate.evaluate` decision statuses: `engine-missing | dvjs-off | platform-restricted |
  consented | not-consented | drift` (`disabled` excluded by the projection).

## Card contract (per row) — mockup S28–S31
Primary line (`.sf-view-head`, flex, `margin-left:auto` on the status pill pushes the right cluster):
`name → provenance chip → kind pill → [command pill] → status pill → [version] → [toggle] → ⋯ menu`.
Secondary line: `.sf-view-desc` = `record.description ?? record.source` (faint fallback when no description).

- **Provenance chip** `.sf-view-chip` + `.sf-chip-imported`/`.sf-chip-official` from `record.provenance`
  (`imported`→"Imported", `curated`→"Official"). All "Imported" now.
- **Kind pill** = engine — REUSE the existing `.sf-badge.sf-badge-dvjs`/`-dql` (add `-bases`) badges.
  Map `record.engine`: `dataviewjs`→dvjs, `dataview-dql`→dql, `bases`→bases.
- **Command pill** `.sf-view-cmd` (accent) — only when `record.command === true`; `title` = command name
  (`record.commandLabel ?? record.commandName`).
- **Status pill** `.sf-view-status` + modifier, icon glyph + word (never colour-only):
  - `● Active` (`--text-success`) — `record.enabled && consented`.
  - `○ Disabled` (muted) — `!record.enabled && (consented | not-consented)`.
  - `▲ Consent required` (`--text-warning`) — `drift` (either enabled state) or `enabled && not-consented`.
  - `■ Engine unavailable` (`--text-error`) — `engine-missing`.
  - `○ Unavailable` (muted) — `dvjs-off` / `platform-restricted` (reason on the desc/blocked line).
- **Version** `.sf-view-ver` — `v{record.okayed.version}` when `record.okayed` present; omit otherwise.
- **Toggle** — Obsidian `ToggleComponent` (theme-correct + mock-testable via `toggleEl`). Shown for
  `consented`/`not-consented` states; ABSENT for `drift`, `engine-missing`, `dvjs-off`,
  `platform-restricted` (can't safely toggle). `onChange`:
  - consented + enabled → OFF → `_disableView`; consented + disabled → ON → `_reEnableView`.
  - not-consented + disabled → ON → `_enableView` (opens consent); + enabled → OFF → `_disableView`.
- **⋯ overflow menu** — Obsidian `Menu`, opened at the button's mouse event. State-dependent items
  (each `addItem().setTitle().setIcon().onClick()`):
  - **View source** (icon `file-search`) — ALWAYS first → `_viewSource(record)` (new; opens the source
    note via `app.workspace.openLinkText(record.source, "", false)`).
  - **Edit (rename & command)…** (icon `pencil`) → `_editView` — for every state EXCEPT `engine-missing`.
  - **Re-review consent…** (icon `shield`) → `_reviewView` — when `record.okayed !== null` OR `drift`.
  - separator, then **Remove** (icon `trash`, warning) → `_removeView` — ALWAYS last.
- **Engine-missing / unavailable** get an inline `.sf-view-blocked` row: `.sf-view-blocked-reason`
  (`--text-error`) with the reason; engine-missing adds an "Install Dataview" link. No toggle.

Toolbar (`.sf-views-toolbar`, above the list): **Import from vault** (existing ImportPickerModal) +
**Import from repo** button rendered **disabled** with a "Coming in M4" tooltip (no handler now).

## Tasks (each: TDD RED→GREEN, spec-compliance → code-quality, commit per task)

### T1 — Obsidian mock: add `Menu` support  *(test infra; enables T3 tests)*
`test/__mocks__/obsidian.ts` currently ships Setting/Text/Toggle/Button/Dropdown. Add a `Menu` mock that
mirrors the real API surface used: `addItem(cb)` invokes `cb(item)` where `item` has chainable
`setTitle`, `setIcon`, `setDisabled`, `onClick(fn)`; `addSeparator()`; `showAtMouseEvent`/`showAtPosition`
record that it opened. Records items so a test can read titles/icons and invoke a chosen `onClick`.
Update `obsidian-augment.d.ts`/types to match real `obsidian.d.ts`. **Per [[obsidian-mock-must-match-real-api]]:
model the real shape, don't invent methods.** RED: a mock unit test asserting item capture + onClick fire.

### T2 — CSS: card styles in `styles.css`
Add a well-sectioned block (banner comment) for the card: `.sf-views-toolbar`, `.sf-view-card`,
`.sf-view-head`, `.sf-view-name`, `.sf-view-chip` + `.sf-chip-imported`/`.sf-chip-official`,
`.sf-view-cmd`, `.sf-view-status` + `.sf-status-active`/`-consent`/`-missing`, `.sf-view-ver`,
`.sf-view-menu-btn` (ghost), `.sf-view-desc`, `.sf-view-blocked`/`-reason`/`-recovery`. Reuse the
existing `.sf-badge*` engine pills for kind; add `.sf-badge-bases`. Add a global `--sf-origin-official`
token to the `body{}` design-token block (next to `--sf-engine-*`). Colours strictly from theme tokens
per the mockup's token-mapping table; status via `--text-success/-warning/-error`. Tabs, stylelint-clean.
(No unit test — gated by stylelint + build + the live visual re-test.)

### T3 — `SettingsTab`: card rendering + toggle + ⋯ menu
Rewrite `_renderViewRow` to build the card DOM per the contract above; add `_viewSource`; replace the
top Import `Setting` with the `.sf-views-toolbar` (vault button + disabled repo button). Keep
`_renderViewsSection` and all action methods. Helper decomposition suggested: `_buildStatusPill`,
`_buildToggle`, `_buildRowMenu`. RED first in `test/settings/SettingsTab.test.ts`:
- provenance chip text from `record.provenance`; kind pill class from `record.engine`; command pill only
  when `record.command`; version only when `record.okayed`.
- status pill glyph+label+modifier for each decision × enabled combination (the table above).
- toggle present/absent per state; toggling calls the right action (`_disableView`/`_reEnableView`/
  `_enableView`) — assert via spies on store/gate.
- ⋯ menu contains the right items per state (View source always; Edit except engine-missing; Re-review
  when okayed/drift; Remove always last) and each item's onClick calls the right method (uses T1 mock).
- description line shows `record.description`, falling back to `record.source` when absent.
- engine-missing renders the inline reason + no toggle + Remove-only menu.
- regression: gen-guard still prevents doubled rows; empty-state message preserved; the existing
  `_editViewAsync` reconcile (command register/remove) unchanged.

### T4 — docs: cross-link supersession
In `docs/XDD/specs/002-query-engine-dataview/mockups.html` add a one-line note on S24–S26 that the
settings rows are superseded by spec 003 (keep 002 states for history). Doc-only.

## Verification
- Gates per task: `npm test`, `npm run typecheck`, `typecheck:test`, `typecheck:mock`, `npm run lint`
  (eslint + **stylelint**), `npm run schema:check`; full `npm run build` at the end (redeploys to
  `test/StoryForge/`).
- **Live (real Obsidian):** the Manage Views list renders cards with name + Imported chip + engine pill
  (+ ⌘ command pill when bound) + status pill + toggle + ⋯; description on line two; toggle
  enables/disables; ⋯ → View source opens the note, Edit opens S27 (rename + command), Re-review on
  drift, Remove deletes; engine-missing shows the install hint; verify in BOTH a light and a dark theme.

## Not in scope (M4)
Official catalog, import-from-repo flow, update-available/materializing states, per-view version bumps.
The card is built so `provenance:"curated"` rows (gold Official chip) and the enabled repo button drop
in without a redesign.
