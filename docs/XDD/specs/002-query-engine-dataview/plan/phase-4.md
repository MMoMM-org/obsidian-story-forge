---
title: "Phase 4: Panel & settings integration"
status: completed
version: "1.0"
phase: 4
---

# Phase 4: Panel & settings integration

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: SDD/Building Block View — Directory Map]` (MODIFY entries: `SidebarView.ts`, `SettingsTab.ts`, `main.ts`)
- `[ref: SDD/Building Block View — Components diagram]`
- `[ref: SDD/Building Block View — Integration Points]`
- `[ref: SDD/Interface Specifications — ConsentGate — requestConsent/requestReConsent]`
- `[ref: SDD/ADR-1]` (registry dispatch; NativeScopingEngine fallback; teardown → empty → render order)
- `[ref: SDD/ADR-2]` (late-join listener via `registerEvent`; re-check dvApi per render)
- `[ref: SDD/ADR-7]` (teardown in `onClose`; single dispatch entry point)
- `[ref: SDD/ADR-8]` (extend existing `SettingsTab.display()`; no new registered view type)
- `[ref: SDD/Runtime View — Flow A (startup)]`
- `[ref: SDD/Runtime View — Flow B (render pipeline)]`
- `[ref: SDD/Runtime View — Flow C (import → consent → render)]`
- `[ref: SDD/Cross-Cutting Concepts — User Interface & UX]` (states S11–S18 in panel; S19–S21/S23 modals; S24–S27 settings rows + Edit view)
- `[ref: SDD/Cross-Cutting Concepts — Lifecycle / Leaks]`
- `[ref: PRD/Feature 1 — Dataview adapter]`
- `[ref: PRD/Feature 3 — User-import flow]`
- `[ref: PRD/Feature 4 — View management surface in Settings]`

**Key Decisions**:
- `SidebarView._renderResolved` is the **only** entry point for engine dispatch (ADR-7); no other method calls engine `render()` directly.
- Teardown order in `_renderResolved` is always: `currentEngine?.teardown()` → `body.empty()` → `engine.render(...)` (ADR-7). This order must be preserved in all branches.
- `onClose` calls `currentEngine?.teardown()` — this is submission-critical for leak prevention.
- `main.ts` is kept thin: it constructs objects and wires them together; no business logic lives there.
- The `dataview:api-ready` late-join listener is registered via `this.registerEvent(this.app.metadataCache.on("dataview:api-ready", ...))` in `main.ts` so it is auto-cleaned on plugin unload.
- `SettingsTab` re-renders its view-list section by calling `display()` again (standard Obsidian pattern) — no reactive binding needed for M2.
- Command registration/unregistration for bound views happens in `main.ts` via `this.addCommand` (when a command is enabled via the Settings "Edit"/S27 action) and `this.removeCommand` (on remove or when the command is toggled off). Commands are stored with their registered id so they can be removed. Note: `removeCommand` needs the LOCAL id — Obsidian auto-prefixes the plugin id.
- Import picker (S19) is a modal subclass opened from `SettingsTab`. There is no bind modal in the import flow: the picker hands the parsed definition to `runImportFlow` (consent → atomic commit). Command binding is a separate Settings "Edit" action (S27), backed by a reusable `BindModal`.

**Dependencies**:
- Phase 1 (`ConsentGate` complete with `requestConsent` + `requestReConsent`).
- Phase 2 (`ViewImporter` with `scanVault`, `parse`, `importToStore`).
- Phase 3 (`EngineRegistry`, `NativeScopingEngine`, `DataviewDqlEngine`, `DataviewJsEngine`, `buildEngineRegistry`).
- All three prior phases must be complete before Phase 4 begins.

---

## Tasks

Wires all M2 components into the existing `SidebarView`, `SettingsTab`, and `main.ts` seams to produce the complete user-facing feature.

- [x] **T4.1 SidebarView engine dispatch + panel states** `[activity: frontend-ui]`

  1. Prime: Read `src/views/SidebarView.ts` in full (current state post-M1). Pay special attention to `_renderResolved` (~line 504) — this is the seam to replace — and `onClose`. Read `[ref: SDD/Implementation Examples — Engine dispatch in SidebarView._renderResolved]` (the illustrative full dispatch body). Read `[ref: SDD/ADR-1]` (dispatch logic; native fallback; unwired "bases" hint). Read `[ref: SDD/ADR-7]` (teardown order; onClose). Read mockups.html states S11–S18 for each panel state layout. Read `[ref: SDD/Cross-Cutting Concepts — Accessibility]` (`role=region`, `aria-live=polite` on empty states).
  2. Test (RED): after injecting `EngineRegistry`, `ConsentGate`, and `NativeScopingEngine` into `SidebarView` constructor: `_renderResolved` with a `"consented"` decision calls `currentEngine.teardown()`, then `body.empty()`, then `engine.render()` in that exact order (mock spy sequence); `_renderResolved` with `"not-consented"` renders S12 state (consent-required element present in el); `_renderResolved` with `"drift"` renders S17 state; `_renderResolved` with `"disabled"` renders S16 state; `_renderResolved` with `"platform-restricted"` renders S11 variant; `_renderResolved` with `"engine-missing"` renders S11 state and falls back to `nativeEngine.render()`; `_renderResolved` with `"dvjs-off"` renders S15 variant; `onClose` calls `currentEngine.teardown()` (verified by spy on the engine mock); native fallback renders when `registry.get(view.engine)` returns undefined; panel renders loading state S13 during async `engine.render()` in-flight.
  3. Implement (GREEN): Modify `src/views/SidebarView.ts` — update constructor signature to accept `EngineRegistry`, `ConsentGate`, and `NativeScopingEngine` as injected dependencies. Replace `_renderResolved(body, ctx)` with the full engine-dispatch implementation (following the SDD illustrative example). Add `_renderEngineMissing`, `_renderConsentRequired`, `_renderReConsentRequired`, `_renderDisabled`, `_renderPlatformRestriction`, `_renderDvJsOff`, `_renderLoading` private methods rendering the S11–S18 states via `createEl` (XSS-safe, no innerHTML). Update `onClose` to call `this.currentEngine?.teardown()`.
  4. Validate: unit tests pass; `npm run lint`; `npm run typecheck`; `npm run typecheck:test`.
  - Success: teardown → empty → render order is enforced (verified by mock spy) `[ref: SDD/ADR-7]`; all 7 `ConsentDecision` statuses produce the correct panel state `[ref: SDD/EARS F1 + F2]`; `onClose` calls teardown (no leak) `[ref: SDD/ADR-7]` `[ref: PRD/AC-F1.3]`; native fallback active when engine absent `[ref: PRD/AC-F1.4]`.

- [x] **T4.2 SettingsTab view list** `[activity: frontend-ui]`

  1. Prime: Read `src/settings/SettingsTab.ts` (current M1 state — understand the `display()` structure and `Setting` API usage). Read `[ref: SDD/ADR-8]` (extend existing `display()` with "Views" section; S24–S26 rows). Read mockups.html states S24 (Enabled), S25 (Disabled / Consent required), S26 (Engine missing). Read `[ref: SDD/Cross-Cutting Concepts — Accessibility]` (Setting API is Obsidian-native accessible). Read `src/store/ViewStore.ts` (`getViews`, `setRecord`, `deleteRecord`).
  2. Test (RED): `display()` renders a "Views" heading section; a view with `enabled:true` renders an S24 row with a Disable action; a view with `enabled:false` and `okayed:null` renders an S25 row with an Enable action; for a DataviewJS view in S25, clicking Enable opens the `ConsentGate.requestConsent` flow (not a light confirm); for a DQL view in S25, clicking Enable calls `ConsentGate.requestConsent` (which uses the light-confirm path internally); a view with engine absent (registry returns undefined) renders an S26 row; clicking Disable on any row calls `store.setRecord` with `enabled:false` and preserves `okayed`; clicking Remove calls `store.deleteRecord(id)` and re-renders the section; the vault note is NOT modified on Remove; re-rendering `display()` after a Remove shows the correct remaining views; if no views exist, the section shows a helpful empty state message ("No views imported yet. Use 'Import view' to add a view.").
  3. Implement (GREEN): Modify `src/settings/SettingsTab.ts` — add a "Views" section at the end of `display()`. Iterate `this.store.getViews()` and render one `Setting` row per view. Row state (S24/S25/S26) determined by `enabled` and `consentGate.evaluate()` result (synchronous check — use `registry.get(view.engine) === undefined` for S26 at display time). Disable action: `store.setRecord(id, {...record, enabled:false})` then `display()`. Enable action: calls `consentGate.requestConsent(id, record)` → `display()` on return. Remove action: `store.deleteRecord(id)` → `display()`. Add an "Import view" action button that opens the import picker modal (T4.3).
  4. Validate: unit tests pass; `npm run lint`; `npm run typecheck`; `npm run typecheck:test`.
  - Success: each imported view shows name/engine/state `[ref: SDD/EARS F4 — "display a Views section listing each imported view"]` `[ref: PRD/AC-F4.1]`; engine-absent S26 state `[ref: PRD/AC-F4.2]`; DataviewJS Enable → full disclosure S20 `[ref: PRD/AC-F4.3]`; Disable preserves `okayed` `[ref: PRD/AC-F4.4]`; Remove → `deleteRecord`, vault note untouched `[ref: PRD/AC-F4.5]`.

- [x] **T4.3 Import picker + consent-commit flow** `[activity: frontend-ui]`

  1. Prime: Read mockups.html state S19 (import picker) and S20/S21 (the single consent step). Read `[ref: SDD/Runtime View — Flow C]` (the import leg: scanVault → picker → parse → consent → atomic commit → tab). Read `[ref: SDD/ADR-6]` (`sf-name` as default tab label). Read `[ref: SDD/ADR-9]` (store-generated id; never write to vault). Note: there is no bind step in the import flow — command binding is a separate Settings "Edit" action (S27, see T4.2).
  2. Test (RED): `ImportPickerModal` lists all `TFile` objects returned by `ViewImporter.scanVault()`; selecting a file and confirming calls `ViewImporter.parse(file)`; if `parse` throws `ImportError`, the modal shows a human-readable error ("No query block found" / "View definitions must contain exactly one query block") and does NOT close; on a successful parse the modal closes and hands the parsed def to `runImportFlow`; `runImportFlow` calls `ConsentGate.requestConsentForDef(def)` (single consent gate — S20 for DataviewJS, S21 for DQL); a null/cancel result aborts with NO store write; on granted tokens `runImportFlow` calls `ViewImporter.importToStore(def, {okayed, enabled:true, commandName: def.name})` exactly once (tab label defaults to `sf-name`); a late duplicate `ImportError` from `importToStore` surfaces a `Notice` and commits nothing.
  3. Implement (GREEN): Create `src/import/ImportPickerModal.ts` — `Modal` subclass; shows a list of `TFile` entries from `scanVault()`; on confirm: calls `parse`, handles parse errors inline; on success closes and delegates to `runImportFlow`. Create `src/import/ImportFlow.ts` — `runImportFlow(deps, def)`: consent (`requestConsentForDef`, null aborts) → atomic `importToStore` with the tokens + `def.name` label. (`BindModal` is created here too but is reused by the Settings "Edit"/S27 action, not by import.)
  4. Validate: unit tests pass (error display; cancel-aborts-no-write; duplicate-race Notice); `npm run lint`; `npm run typecheck`; `npm run typecheck:test`.
  - Success: picker lists all unimported `sf-view:true` notes `[ref: SDD/EARS F3]` `[ref: PRD/AC-F3.1]`; import errors shown inline, no ViewRecord created `[ref: PRD/AC-F3.3]` `[ref: PRD/AC-F3.4]`; committed tab label defaults to `sf-name` `[ref: PRD/AC-F3.6]`; after commit, tab appears in correct initial state `[ref: PRD/AC-F3.7]`.

- [x] **T4.4 main.ts wiring** `[activity: integration]`

  1. Prime: Read `src/main.ts` in full (current M1 state). Read `[ref: SDD/Runtime View — Flow A]` (startup sequence: construct → `onLayoutReady` → detect Dataview → register late-join listener). Read `[ref: SDD/ADR-2]` (late-join via `registerEvent`). Read `[ref: SDD/Building Block View — Components diagram]` (wiring map). Read `[ref: SDD/Cross-Cutting Concepts — Lifecycle / Leaks]` (all events via `register*`). Read `[ref: SDD/Implementation Gotchas — Component.load() before dvApi]`.
  2. Test (RED): `onload` constructs `NativeScopingEngine`, `EngineRegistry` (empty initially), `ConsentGate`, and passes them to `SidebarView` and `SettingsTab` constructors; `onload` registers the late-join `dataview:api-ready` listener via `this.registerEvent(this.app.metadataCache.on("dataview:api-ready", ...))` so it is auto-cleaned on unload; after `workspace.onLayoutReady`: if Dataview present+version-ok, `buildEngineRegistry(app)` is called and the registry is populated; if Dataview absent, registry stays empty; late-join handler calls `buildEngineRegistry(app)` and updates the registry; `registerCommand` callback passed to `BindModal` calls `this.addCommand` and stores the command id; `removeCommand` is called when `store.deleteRecord` removes a view that had a registered command (verified via mock `addCommand`/`removeCommand` spy).
  3. Implement (GREEN): Modify `src/main.ts` — in `onload`: construct `NativeScopingEngine`; construct `EngineRegistry([])`; construct `ConsentGate(app, registry, store)`; update `SidebarView` and `SettingsTab` constructor calls to inject new dependencies. In `workspace.onLayoutReady` callback: call `buildEngineRegistry(app)`, update registry via `registry.register(engines)` (or replace the internal map — design `EngineRegistry` to allow post-construction registration for the late-join case). Register `this.registerEvent(this.app.metadataCache.on("dataview:api-ready", lateJoinHandler))`. In `lateJoinHandler`: call `buildEngineRegistry(app)` and update registry. Track registered command ids in a `Map<viewId, string>` for removal on `deleteRecord`.
  4. Validate: unit tests pass (wiring: injected dependencies reach `SidebarView` via mock; late-join listener is registered via `registerEvent`; `_runCleanup()` from `test/__mocks__/obsidian.ts` shows the listener is cleaned up on unload); `npm run lint`; `npm run typecheck`; `npm run typecheck:test`.
  - Success: `main.ts` is thin (no business logic, wiring only) `[ref: SDD/Solution Strategy — "thin-main.ts / injected-dependency convention"]`; late-join listener auto-cleaned on unload `[ref: SDD/ADR-2]` `[ref: SDD/Cross-Cutting Concepts — Lifecycle / Leaks]`; Dataview engines available after late-join without plugin reload `[ref: SDD/EARS F1 — "THE SYSTEM SHALL register the Dataview engines via the dataview:api-ready listener"]` `[ref: PRD/AC-F1.8]`; plugin reload restores all views from `data.json` `[ref: PRD/AC-F4.6]`.

- [x] **T4.5 Phase Validation** `[activity: validate]`

  - Run `npm test` (all Phase 4 tests pass). Run `npm run lint`. Run `npm run typecheck`. Run `npm run typecheck:test`. Run `npm run build` (confirm production bundle builds without errors).
  - Verify: `onClose` teardown confirmed by test; teardown → empty → render order confirmed by spy sequence; `_runCleanup()` confirms late-join listener is registered and auto-cleaned; import picker error messages are exactly `"No query block found"` and `"View definitions must contain exactly one query block"` (string-match in test); no `innerHTML` with user-supplied data anywhere in new UI code (ESLint `no-unsanitized` or manual audit). All `[ref: SDD/ADR-1]`, `[ref: SDD/ADR-7]`, `[ref: SDD/ADR-8]`, `[ref: PRD/Feature 1]`, `[ref: PRD/Feature 3]`, `[ref: PRD/Feature 4]` acceptance criteria covered.
