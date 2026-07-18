---
title: "Phase 3: Query engines & registry"
status: completed
version: "1.0"
phase: 3
---

# Phase 3: Query engines & registry

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: SDD/Building Block View — Directory Map]` (`src/engines/`, `src/types/dataview.d.ts`)
- `[ref: SDD/Interface Specifications — QueryEngine + EngineRegistry]`
- `[ref: SDD/Interface Specifications — Dataview API shim]`
- `[ref: SDD/ADR-1]` (QueryEngine interface; EngineRegistry wired-only; NativeScopingEngine NOT in registry; registry may be empty)
- `[ref: SDD/ADR-2]` (feature detection: `(app as any).plugins.plugins["dataview"]?.api`; `onLayoutReady`; late-join listener; re-check per render; min version 0.5.31)
- `[ref: SDD/ADR-3]` (filePath = `ctx.activeFile.path`, NOT view-note path; query read fresh from `view.source` at render time)
- `[ref: SDD/ADR-4]` (ConsentGate already gating DVJS; desktop-only; `Platform.isMobile` guard at engine level too)
- `[ref: SDD/ADR-7]` (each engine owns one `Component`; `component.unload()` in `teardown()`; teardown → empty → render order)
- `[ref: SDD/Implementation Examples — Engine dispatch in SidebarView._renderResolved]`
- `[ref: SDD/Implementation Examples — filePath scoping in DataviewDqlEngine]`
- `[ref: SDD/Runtime View — Flow A (startup, engine detection, late-join)]`
- `[ref: SDD/Runtime View — Flow B (render pipeline, engine dispatch)]`
- `[ref: SDD/Runtime View — Flow E (native fallback when Dataview absent)]`
- `[ref: PRD/Feature 1 — Dataview adapter]`

**Key Decisions**:
- `NativeScopingEngine` is NOT a registry entry — it is held directly on `SidebarView` as the always-present fallback. Phase 3 creates it but Phase 4 wires it.
- The `EngineRegistry` may be empty (Dataview absent) — callers must handle `get()` returning `undefined`.
- `getDataviewApi(app)` is the **only** permitted `app as any` cast in the codebase (CON-8/ADR-2). All other code uses `unknown` + narrowing.
- Engines re-read the Dataview API on every `render()` call — no cached API reference across renders (ADR-2 gotcha).
- `component.load()` must be called before passing `component` to `dvApi.execute()` / `dvApi.executeJs()` (implementation gotcha from SDD).
- `DataviewJsEngine.render()` checks `Platform.isMobile` as a belt-and-suspenders guard (ConsentGate also blocks DVJS on mobile, but the engine is independently safe).
- `NativeScopingEngine.render()` receives a `ViewRecord | null` — when null, it renders the raw entity context; when a wired engine is absent, it renders the entity context below a "missing engine" hint.

**Dependencies**:
- Phase 1 (T1.1 `fencedBlock.ts`, T1.3 `ConsentGate.evaluate()`) must be complete — `DataviewJsEngine` and `DataviewDqlEngine` call `readFencedBlock` at render time.
- Phase 1 is the only hard dependency; Phase 3 runs **in parallel with Phase 2** once Phase 1 is complete.

---

## Tasks

Establishes the `QueryEngine` contract, minimal Dataview type shim, `EngineRegistry`, all three engine implementations, and the feature-detection + late-join wiring skeleton.

- [x] **T3.1 QueryEngine contract + NativeScopingEngine + Dataview type shim** `[activity: domain-modeling]`

  1. Prime: Read `[ref: SDD/Interface Specifications — QueryEngine + EngineRegistry]` (full interface + class spec). Read `[ref: SDD/Interface Specifications — Dataview API shim]` (the `DataviewApi` and `DataviewApp` type declarations). Read `src/scoping/NoteContext.ts` (`NoteContext`, `ResolvedEntity`). Read `src/scoping/ScopingService.ts` (inspires `NativeScopingEngine.render()` output shape). Read `src/store/types.ts` (`ViewRecord.engine` discriminant values for `kind`).
  2. Test (RED): `QueryEngine` interface is exported and structurally correct (type-only, no runtime test needed — verified by typecheck); `NativeScopingEngine` implements `QueryEngine` with `kind` set to a sentinel value (e.g., `"native"` — not registered in the registry); `NativeScopingEngine.render(null, ctx, el)` creates DOM nodes for each entity in `ctx.entities` (field, basename, kind); `NativeScopingEngine.render(view, ctx, el)` (view provided but engine missing) renders entity context without crashing; `NativeScopingEngine.teardown()` empties the last rendered DOM nodes; `teardown()` is safe to call before any `render()` (no-op).
  3. Implement (GREEN): Create `src/engines/QueryEngine.ts` — export `QueryEngine` interface and `EngineRegistry` class (constructor takes `QueryEngine[]`; `get(kind)` returns `QueryEngine | undefined`). Create `src/types/dataview.d.ts` — the minimal `DataviewApi` + `DataviewApp` type declarations (NOT imported at runtime). Create `src/engines/NativeScopingEngine.ts` — implements `QueryEngine`; renders `NoteContext.entities` into `el` using `createEl` (XSS-safe); `teardown()` calls `el.empty()` on the last rendered container.
  4. Validate: unit tests pass for `NativeScopingEngine`; `npm run lint`; `npm run typecheck`; `npm run typecheck:test`.
  - Success: `QueryEngine` interface matches SDD spec exactly `[ref: SDD/Interface Specifications — QueryEngine + EngineRegistry]`; native fallback renders entity context when no wired engine is available `[ref: SDD/Runtime View — Flow E]` `[ref: PRD/AC-F1.4]`; registry is an opaque map `[ref: SDD/ADR-1]`.

- [x] **T3.2 EngineRegistry + feature detection** `[activity: integration]`

  1. Prime: Read `[ref: SDD/ADR-2]` (the complete feature-detection spec: `onLayoutReady`, `app as any`, `dvApi.version.satisfies`, late-join listener via `registerEvent`, re-check per render). Read `[ref: SDD/Runtime View — Flow A]` (startup sequence diagram). Read `src/main.ts` (current `onload` structure — understand the injection points). Read `[ref: SDD/Implementation Gotchas — dvApi can become undefined between startup and render]`.
  2. Test (RED): `getDataviewApi(app)` returns the `DataviewApi` if `(app as any).plugins.plugins["dataview"]?.api` exists; returns `undefined` if the plugin is absent; returns `undefined` if `dvApi.version.satisfies(">=0.5.31")` returns false; a helper `buildEngineRegistry(app)` (used by main.ts in T4.4) returns an `EngineRegistry` with both engines registered when Dataview is present+version-ok; returns an empty `EngineRegistry` when Dataview absent; engines registered by `buildEngineRegistry` have the correct `kind` discriminants (`"dataview-dql"`, `"dataviewjs"`).
  3. Implement (GREEN): Add `getDataviewApi(app: App): DataviewApi | undefined` to `src/engines/EngineRegistry.ts` (or a shared helper file) — contains the single sanctioned `any` cast. Add `buildEngineRegistry(app: App): EngineRegistry` — constructs `DataviewDqlEngine` + `DataviewJsEngine` and registers them only when `getDataviewApi` returns a valid API. (The late-join listener is wired in T4.4 via `main.ts`; this task provides the re-registration helper `buildEngineRegistry` so T4.4 can call it from the listener.)
  4. Validate: unit tests pass; `npm run lint`; `npm run typecheck`; `npm run typecheck:test`.
  - Success: `any` cast isolated to one function `[ref: SDD/ADR-2]` `[ref: SDD/CON-8]`; empty registry when Dataview absent — no crash `[ref: PRD/AC-F1.3]`; version gate enforced `[ref: SDD/EARS F1 — "version below 0.5.31 → engine-missing"]`.

- [x] **T3.3 DataviewDqlEngine** `[activity: integration]`

  1. Prime: Read `[ref: SDD/Interface Specifications — Dataview API shim]` (`dvApi.execute` signature). Read `[ref: SDD/ADR-3]` (filePath = `ctx.activeFile.path`; query read fresh via `readFencedBlock` at render time). Read `[ref: SDD/ADR-7]` (Component lifecycle; `component.load()` before passing to dvApi; `teardown()` calls `component.unload()`). Read `[ref: SDD/Implementation Examples — filePath scoping in DataviewDqlEngine]`. Read `[ref: SDD/Implementation Gotchas]` (`filePath` must be bare path; `component.load()` required before dvApi call; re-read dvApi on every render).
  2. Test (RED): `DataviewDqlEngine.kind` equals `"dataview-dql"`; `render(view, ctx, el)` calls `readFencedBlock(app, view.source)` to get the query text; calls `dvApi.execute(queryText, el, component, ctx.activeFile.path)` — NOT `view.source` as the filePath; `teardown()` calls `component.unload()` and sets component to null; `teardown()` is safe before any `render()` (no-op); a second `render()` after `teardown()` creates a new `Component` (no stale reference); if `readFencedBlock` returns null, renders a "source missing" message in `el` instead of calling `dvApi.execute`; re-reads `getDataviewApi(app)` on every `render()` call (not cached).
  3. Implement (GREEN): Create `src/engines/DataviewDqlEngine.ts` — `implements QueryEngine`. Private `component: Component | null = null`. `render()`: call `getDataviewApi`; if absent render engine-missing text; call `readFencedBlock`; if null render source-missing text; create new `Component()`, call `.load()`, call `dvApi.execute(queryText, el, component, ctx.activeFile.path)`. `teardown()`: `component?.unload(); component = null`.
  4. Validate: unit tests pass (render + teardown + filePath scoping + null-source guard); `npm run lint`; `npm run typecheck`; `npm run typecheck:test`.
  - Success: DQL renders in the tab body scoped to the subject's path `[ref: SDD/ADR-3]` `[ref: SDD/EARS F1 — "execute it via dvApi.execute(queryText, el, component, ctx.activeFile.path)"]` `[ref: PRD/AC-F1.1]`; re-runs on note change (driven by SidebarView debounce) `[ref: PRD/AC-F1.7]`; Component lifecycle is leak-free `[ref: SDD/ADR-7]`.

- [x] **T3.4 DataviewJsEngine** `[activity: integration]`

  1. Prime: Read `[ref: SDD/Interface Specifications — Dataview API shim]` (`dvApi.executeJs` signature). Read `[ref: SDD/ADR-3]` (same filePath rule as DQL). Read `[ref: SDD/ADR-4]` (checksum is byte-exact, cross-platform Web Crypto). Read `[ref: SDD/ADR-7]` (Component lifecycle). Read `[ref: SDD/Error Handling — "enableDataviewJs:false in Dataview settings"]`. Read `[ref: SDD/CON-7]` (DataviewJS is desktop-only). Read mockups.html state S15 (dvjs-off prompt).
  2. Test (RED): `DataviewJsEngine.kind` equals `"dataviewjs"`; `render()` on `Platform.isMobile` renders the platform-restriction message and does NOT call `dvApi.executeJs` (mock `Platform.isMobile = true`); `render()` when `enableDataviewJs` is false in Dataview settings renders the "DataviewJS disabled in Dataview settings" prompt instead of calling `dvApi.executeJs`; `render()` when `readFencedBlock` returns null renders source-missing message; `render()` happy path: calls `dvApi.executeJs(queryText, el, component, ctx.activeFile.path)` with the correct filePath; `teardown()` calls `component.unload()` and nulls the reference; `teardown()` is safe before `render()`; re-reads `getDataviewApi(app)` on every render (not cached); `isDvJsEnabled(app)` helper function returns false when `enableDataviewJs` setting is off.
  3. Implement (GREEN): Create `src/engines/DataviewJsEngine.ts` — `implements QueryEngine`. Add mobile guard (`if (Platform.isMobile) { /* platform-restriction */ return; }`). Add `isDvJsEnabled(app)` helper (reads `(app as any).plugins.plugins["dataview"]?.api?.settings?.enableDataviewJs ?? false` — or the equivalent property confirmed in installed Dataview v0.5.68). Otherwise identical lifecycle to `DataviewDqlEngine` but calls `dvApi.executeJs`.
  4. Validate: unit tests pass (mobile guard + dvjs-off path + happy path + teardown); `npm run lint`; `npm run typecheck`; `npm run typecheck:test`.
  - Success: DataviewJS never executes on mobile `[ref: SDD/CON-7]` `[ref: SDD/EARS F1 — "platform-restriction state ... SHALL NOT attempt ... dvApi.executeJs"]` `[ref: PRD/AC-F1.6]`; `enableDataviewJs:false` surfaces friendly prompt `[ref: SDD/EARS F1 — "DataviewJS disabled in Dataview settings prompt"]` `[ref: PRD/AC-F1.5]`; Component lifecycle leak-free `[ref: SDD/ADR-7]`; renders with correct filePath `[ref: SDD/ADR-3]` `[ref: PRD/AC-F1.2]`.

- [x] **T3.5 Phase Validation** `[activity: validate]`

  - Run `npm test` (all Phase 3 tests pass). Run `npm run lint`. Run `npm run typecheck`. Run `npm run typecheck:test`.
  - Verify: `getDataviewApi` is the ONLY `any` cast in the engines directory (ESLint will catch stray casts); `NativeScopingEngine.teardown()` and all engine `teardown()` calls are safe-before-render; both Dataview engines pass filePath as `ctx.activeFile.path` NOT `view.source` (assert via mock spy); `buildEngineRegistry(app)` produces empty registry when Dataview is absent — no crash path. All `[ref: SDD/ADR-1]`, `[ref: SDD/ADR-2]`, `[ref: SDD/ADR-3]`, `[ref: SDD/ADR-7]`, `[ref: PRD/Feature 1]` acceptance criteria covered.
