---
title: "Dataview engine + consent — Dataview adapter, consent gate, and user-import flow"
status: complete
version: "1.0"
---

# Product Requirements Document

## Validation Checklist

### CRITICAL GATES (Must Pass)

- [x] All required sections are complete
- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Problem statement is specific and measurable
- [x] Every feature has testable acceptance criteria (Gherkin format)
- [x] No contradictions between sections

### QUALITY CHECKS (Should Pass)

- [x] Problem is validated by evidence (spec README decisions log + 3 parallel research agents)
- [x] Context → Problem → Solution flow makes sense
- [x] Every persona has at least one user journey
- [x] All MoSCoW categories addressed (Must/Should/Could/Won't)
- [x] Every metric has corresponding verification events
- [x] No feature redundancy
- [x] No technical implementation details included (deferred to SDD)
- [x] A new team member could understand this PRD

---

## Product Overview

### Vision

A note-following sidebar that runs real query views against the writer's vault — with a consent gate that keeps arbitrary-JavaScript execution opt-in, explicit, and byte-exact — built on the Dataview plugin as the M2 query engine and designed so every engine slot that follows (Bases in M4) plugs into the same seam.

### Problem Statement

After M1, Story Forge has a note-following panel and a view store, but no engine to put real content inside it. Two coupled gaps block progress:

1. **For the writer:** the panel opened by M1 is empty — no views render content yet. The writer cannot query their `_forge` vault (who are the characters in this scene? what objects appear?) through the sidebar. Without a real engine, Story Forge is a skeleton with no function.
2. **For the plugin:** the M1 ViewStore carries an `engine` discriminant and a consent slot `okayed:{version,checksum}|null`, but nothing fills them. M3 (the contextual panel) needs DQL and DataviewJS views to already work and be consent-managed before it can render type-specific content. Without M2, M3 cannot ship.

The M2 gap is precise: no adapter translates a DQL or DataviewJS view definition into rendered output; no consent flow gates DataviewJS execution; no user-facing import path populates the view store with vault-sourced view definitions.

### Value Proposition

- **Immediate query power from existing Dataview investment:** writers who already have Dataview installed get their vault queryable inside the Story Forge panel without rebuilding their knowledge. Writers without Dataview get a safe native fallback.
- **Trustworthy, re-auditable consent:** DataviewJS views are arbitrary JavaScript; the writer sees exactly what they are consenting to run, can revoke it at any time, and is re-prompted the moment the view definition changes even by a single byte — so trust is never silent.
- **A stable, engine-agnostic seam:** M2 wires the first real engine through the ViewStore contract established by M1; M4 (Bases) and every engine after it plugs into the same slot without reshaping the panel.

## User Personas

### Primary Persona: The fiction writer

- **Demographics:** Novelist/worldbuilder, 25–55, uses Obsidian daily on desktop and sometimes on mobile; comfortable with Markdown and frontmatter Properties but not a programmer; maintains a `_forge`-style vault (one canonical note per entity); likely has Dataview installed.
- **Goals:** Query their `_forge` vault from the sidebar ("which characters are in this scene?", "where does this character appear?") without leaving the writing context; import a view they find useful; trust that no JavaScript runs without their knowledge.
- **Pain Points:** M1 shipped an empty panel — the sidebar does nothing useful yet; importing a custom view requires understanding the internals; DataviewJS arbitrary-code risk is real and they expect to be told about it before it runs.

### Secondary Personas

**The plugin developer (M3+ consumer).**
- **Demographics:** The author/maintainer building M3–M7 on top of M2.
- **Goals:** Consume a stable Dataview adapter and consent-state contract so that authoring `_forge` default views in M3 requires no changes to the engine layer.
- **Pain Points:** Without M2, M3 has no engine to drive its character/location/scene content; the consent slot in M1's ViewStore is empty and unexercised.

## User Journey Maps

### Primary User Journey: Importing and running a DataviewJS view

1. **Awareness:** The writer wants the sidebar to show the characters in their current scene. They know they have a Dataview view definition note in their vault.
2. **Consideration:** They open Story Forge settings and see an "Import view" action that scans the vault for notes marked as Story Forge views.
3. **Adoption:** They pick their view from the auto-scan picker. A disclosure modal explains that the view contains DataviewJS (arbitrary JavaScript) and shows the view's source along with a checksum. They read it and click "Enable".
4. **Usage:** The view appears as a tab in the sidebar panel. It renders against the current note's context. When they switch notes, the view re-runs and the output updates.
5. **Retention:** If they ever edit their view definition note, the sidebar shows a "Re-consent required" state the next time they open the panel — so they are never running stale or changed code without knowing.

### Secondary User Journey: Importing and running a DQL view (no full gate)

1. **Awareness:** The writer has a DQL (non-JavaScript) Dataview query note they want in their sidebar.
2. **Consideration:** Same import flow as DataviewJS — auto-scan picker from the vault.
3. **Adoption:** Because DQL is declarative and read-only, the consent step is a light informational confirm ("This view uses a Dataview DQL query — declarative, read-only.") with a single "Enable" action. No full disclosure gate.
4. **Usage:** The view renders in the panel. On version-or-checksum drift the writer is re-prompted with the same light confirm.
5. **Retention:** The writer can disable or remove the view from Settings without losing their view definition note in the vault.

### Secondary User Journey: Dataview absent — native fallback

1. **Awareness:** The writer does not have Dataview installed.
2. **Consideration:** They open the panel; Story Forge detects the missing plugin at load time.
3. **Adoption:** Any tab that requires Dataview shows an "Engine missing" state (not an error crash) with a human-readable explanation and a link to the Dataview plugin.
4. **Usage:** Native `metadataCache`-driven context (the M1 scoping layer) continues to work — the panel shows entity context from the active note's outgoing links. Only Dataview-engine views are unavailable.
5. **Retention:** If the writer installs Dataview later and reloads Obsidian, the engine-missing state clears and queued views render.

## Feature Requirements

### Must Have Features

The minimum for M2 to be valuable and to unblock M3: a Dataview adapter that runs DQL and DataviewJS, a consent gate that differentiates the two, a user-import flow that populates the ViewStore from vault notes, and a view-management surface in Settings.

#### Feature 1 (F1): Dataview adapter

- **User Story:** As Story Forge, I want to run DQL and DataviewJS queries scoped to the active note's context, so that the sidebar panel can render real query results for the writer.
- **Acceptance Criteria (Gherkin Format):**
  - [ ] Given Dataview is installed and a view with a DQL fenced block is enabled, When the panel renders that view's tab, Then the DQL query result is displayed in the tab body.
  - [ ] Given Dataview is installed and a DataviewJS view is consented and enabled, When the panel renders that view's tab, Then the DataviewJS block executes and its output is displayed.
  - [ ] Given Dataview is not installed, When Story Forge loads, Then the Dataview engine is feature-detected as absent and any Dataview-engine view tab shows an "Engine missing" state — not a crash, not a blank pane.
  - [ ] Given Dataview is not installed, When the panel renders, Then native `metadataCache` context (the M1 scoping layer) continues to serve entity-context data unaffected.
  - [ ] Given Dataview is installed but `enableDataviewJs` is disabled in Dataview's own settings, When a DataviewJS view tab is rendered, Then the panel shows a friendly "DataviewJS is disabled in Dataview settings" prompt rather than a silent failure.
  - [ ] Given a DataviewJS view is running on mobile (iOS/Android), When the panel renders, Then the DataviewJS engine is unavailable on mobile and the tab shows the platform-restriction state; DQL views continue to render on mobile.
  - [ ] Given a DQL view is enabled and Dataview is installed, When the active note changes, Then the DQL query re-runs against the new note's context and the tab updates.

#### Feature 2 (F2): Consent gate

- **User Story:** As the fiction writer, I want to see exactly what a DataviewJS view will execute before it runs — and be re-prompted if it ever changes — so that no arbitrary JavaScript runs in my vault without my explicit, informed approval.
- **Acceptance Criteria (Gherkin Format):**
  - [ ] Given a DataviewJS view has been imported but not yet consented, When the writer opens the panel tab for that view, Then the tab shows a "Consent required" state with a call-to-action; the DataviewJS code does NOT execute.
  - [ ] Given a DataviewJS view is in the "Consent required" state, When the writer opens the consent flow, Then a full disclosure modal displays the view's name, description, source note path, the complete DataviewJS source, and a byte-exact checksum; the writer must explicitly click "Enable" to proceed.
  - [ ] Given the writer clicks "Enable" in the disclosure modal, When the consent is recorded, Then the ViewStore records `okayed: { version, checksum }` for that view, the modal closes, and the view begins rendering in the tab.
  - [ ] Given a DataviewJS view has been consented and is rendering, When the view definition note's DataviewJS source changes (checksum drifts), Then the next render shows the "Re-consent required" state; the previously-consented code stops executing until the writer re-consents.
  - [ ] Given a DataviewJS view has been consented and is rendering, When the view definition note's `sf-version` field changes (version drifts), Then the "Re-consent required" state is shown and execution stops until re-consent.
  - [ ] Given a DataviewJS view is rendering, When the writer activates the per-view kill-switch ("Disable" in Settings), Then the view stops executing immediately; `okayed` is preserved in the ViewStore (not cleared); the tab shows a "Disabled" state.
  - [ ] Given a DataviewJS view has been disabled via the kill-switch, When the writer re-enables the view in Settings, Then the view resumes rendering without requiring re-consent (checksum has not changed).
  - [ ] Given a DQL view has been imported, When the writer enables it, Then a light informational confirm dialog (not the full disclosure modal) is shown; clicking "Enable" activates the view with no further gate.
  - [ ] Given a DQL view is enabled and its checksum drifts, When the panel next renders, Then a light re-confirm (not a full disclosure modal) is shown before the updated query runs.
  - [ ] Given any view (DataviewJS or DQL), When it has not been explicitly enabled, Then the safe default is "disabled" — no query runs, no consent is assumed.
  - [ ] Given a view is in any state, When the writer chooses "Remove" in Settings, Then the ViewRecord is deleted from the ViewStore; the view definition note in the vault is NOT modified or deleted.

#### Feature 3 (F3): User-import flow

- **User Story:** As the fiction writer, I want to import a view from my vault into Story Forge by picking it from a list, so that I can use view definitions I've written or copied without manually editing plugin settings.
- **Acceptance Criteria (Gherkin Format):**
  - [ ] Given the writer opens the "Import view" action in Settings, When the auto-scan picker opens, Then it lists all vault notes whose frontmatter contains `sf-view: true`, sourced from the live metadataCache (no manual path entry required).
  - [ ] Given a vault note has `sf-view: true` frontmatter plus exactly one fenced query block (` ```dataview ` or ` ```dataviewjs `), When the writer selects it in the picker and confirms, Then a ViewRecord is created in the ViewStore with the correct `engine` discriminant (`dataview-dql` or `dataviewjs`), `provenance: "imported"`, `enabled: false`, and `okayed: null`.
  - [ ] Given a vault note selected in the picker lacks a fenced query block, When the writer confirms the import, Then the import is rejected with a clear error message ("No query block found"); no ViewRecord is created.
  - [ ] Given a vault note selected in the picker has more than one fenced query block, When the writer confirms the import, Then the import is rejected with a clear error message ("View definitions must contain exactly one query block"); no ViewRecord is created.
  - [ ] Given a vault note that is already imported (its path is already in a ViewRecord), When the writer selects it in the picker again, Then the picker shows a clear indicator that it is already imported and prevents a duplicate import.
  - [ ] Given a view has been imported, When the bind step completes, Then the writer is prompted to assign the view to a sidebar tab label (the `sf-name` value is used as the default label); the option to register a command palette command is also offered.
  - [ ] Given a view has been imported and bound, When the writer opens the sidebar panel, Then a new tab appears for the view (initially in "Disabled" or "Consent required" state, depending on engine type).

#### Feature 4 (F4): View management surface in Settings

- **User Story:** As the fiction writer, I want to see and manage all my imported views in one place within the Story Forge settings, so that I can enable, disable, re-consent, or remove views without navigating away from the plugin.
- **Acceptance Criteria (Gherkin Format):**
  - [ ] Given the writer opens Story Forge Settings, When they navigate to the view list section, Then each imported view is listed with its name, engine type, and current state (Enabled / Disabled / Consent required / Engine missing).
  - [ ] Given a view is listed in the Settings view list, When the view's Dataview engine is absent, Then the view row shows the "Engine missing" state alongside the view name and a note about the missing dependency.
  - [ ] Given a DataviewJS view is listed in the Settings view list with state "Consent required", When the writer clicks its Enable action, Then the full disclosure modal opens (same modal as the in-panel consent flow).
  - [ ] Given any view in the Settings view list, When the writer clicks "Disable", Then the view is disabled and the panel tab shows the "Disabled" state; `okayed` is preserved.
  - [ ] Given any view in the Settings view list, When the writer clicks "Remove", Then the ViewRecord is deleted from the ViewStore and the tab disappears from the panel; the vault note is unchanged.
  - [ ] Given the writer reloads Obsidian, When the plugin loads, Then the Settings view list restores all imported views and their states from the persisted ViewStore — no re-import required.

### Should Have Features

- **Friendly "DataviewJS is off in Dataview" prompt with a deep-link:** rather than a generic error, detect when Dataview is present but `enableDataviewJs` is false and surface a specific actionable message pointing the writer to the Dataview plugin settings.
- **Tab label truncation handling:** when a view's `sf-name` is long, the sidebar tab label truncates gracefully with the full name accessible on hover.
- **Live-refresh on view-definition-note change:** when the vault note backing an imported view is edited and saved, the panel updates its state (e.g., moves to "Re-consent required") without requiring a plugin reload.

### Could Have Features

- **Import from URL / clipboard** — paste a view definition from outside the vault; deferred, not blocked by M2.
- **Sort / reorder views in the Settings list** — drag-to-reorder the sidebar tab sequence; deferred to M4 when the catalog and a richer manage-views surface lands.
- **View definition note validation on save** — a hint in the vault note editor when the `sf-view: true` note has a structural problem (missing query block, duplicate blocks); nice-to-have, not a gate for M2.

### Won't Have (This Phase)

- **Curated view catalog and "Browse official" modal** — the in-plugin catalog with reviewed, checksummed default views is M4. M2 handles only user-imported views.
- **Bases engine wiring** — the `bases` engine discriminant exists in the ViewStore (M1) but is NOT wired to a renderer in M2. Bases is the M4 spike.
- **Reverse "appears in" / backlink queries** — queries that find which scenes a character appears in require the reverse index built in M3. M2 views may express such queries (valid DQL), but the data they rely on is not seeded until M3.
- **Type-specific default views authored** — the `_forge` default view set (Characters-in-scene, Locations-in-scene, etc.) is authored in M3 alongside the contextual panel content.
- **Drag-to-frontmatter write-back** — interactive write-back to frontmatter is M6.
- **Note panel surface** — the second render surface (the Storyline-style inspector that renders with the active note) is designed in the DESIGN.md open-decision and deferred past M3.
- **"Enable once" / one-shot execution mode** — there is no "run once" consent; all views are either Enabled (render continuously) or Disabled. One-shot consent is wrong UX for a live-updating panel.

## Detailed Feature Specifications

### Feature: Consent gate (the most complex M2 feature)

**Description:** The consent gate is the trust boundary between the writer and any code that runs inside the Story Forge panel. It differentiates between two risk levels — DataviewJS (arbitrary JavaScript, full gate) and DQL (declarative query, light path) — and enforces that consent is byte-exact, re-prompted on any drift, and fail-closed by default.

**Interface:** the panel states and modal layouts for the consent gate (states S11–S26, modals for import-picker, full disclosure, light confirm, bind, and re-consent) are defined as versioned mockups, not in prose here. The mockups are the source of truth for what each state looks like; the rules below govern when each state shows and what transitions are allowed.

> Mockup state inventory (to be authored alongside the SDD):
> - **S11** Panel — engine missing
> - **S12** Panel — consent required (DataviewJS)
> - **S13** Panel — loading
> - **S14** Panel — result (rendering)
> - **S15** Panel — error
> - **S16** Panel — disabled
> - **S17** Panel — re-consent required
> - **S18** Panel — DQL light-confirm pending
> - **S19** Modal — import picker
> - **S20** Modal — full disclosure (DataviewJS)
> - **S21** Modal — light confirm (DQL)
> - **S22** Modal — bind (tab label + command)
> - **S23** Modal — re-consent (DataviewJS)
> - **S24** Settings row — Enabled
> - **S25** Settings row — Disabled / Consent required
> - **S26** Settings row — Engine missing

**User Flow:**

DataviewJS consent path:
1. Writer imports a DataviewJS view definition note via the auto-scan picker (F3).
2. System creates a ViewRecord: `engine: "dataviewjs"`, `enabled: false`, `okayed: null`.
3. Writer opens the panel tab for that view.
4. System shows the "Consent required" state (S12); DataviewJS does NOT execute.
5. Writer clicks "Review & Enable".
6. System opens the full disclosure modal (S20): name, description, source path, complete DataviewJS source, byte-exact checksum.
7. Writer reads the code and clicks "Enable".
8. System records `okayed: { version, checksum }`, closes the modal, begins rendering (S14).
9. Writer later edits the view definition note (checksum drifts).
10. System shows "Re-consent required" (S17); execution stops; writer goes back to step 5 (re-consent modal S23).

DQL light-confirm path:
1. Writer imports a DQL view definition note via the auto-scan picker (F3).
2. System creates a ViewRecord: `engine: "dataview-dql"`, `enabled: false`, `okayed: null`.
3. Writer opens the panel tab or clicks Enable in Settings.
4. System shows the light informational confirm (S21): "This view uses a Dataview DQL query — declarative, read-only. Enable?"
5. Writer clicks "Enable".
6. System records `okayed: { version, checksum }`, begins rendering (S14).

**Business Rules:**
- Rule 1: The safe default is disabled. No view executes until the writer explicitly enables it, even if `okayed` has been recorded from a previous session.
- Rule 2: DataviewJS requires the full disclosure modal every time consent is required or re-required — there is no abbreviated path for DataviewJS on re-consent.
- Rule 3: DQL uses only the light confirm, never the full disclosure modal. DQL re-consent is also the light confirm, not a full gate.
- Rule 4: Re-consent is triggered by version-OR-checksum drift. A version bump without a code change, or a byte change without a version bump, each independently triggers re-consent.
- Rule 5: Disabling a view (kill-switch) does NOT clear `okayed`. If the writer re-enables a view whose checksum has not changed since last consent, no re-consent modal is shown.
- Rule 6: Removing a view deletes the ViewRecord only. The vault note that defined the view is never touched.
- Rule 7: DataviewJS views are unavailable on mobile. On a mobile platform, any DataviewJS-engine view tab shows the platform-restriction state (variant of S11) without attempting execution.
- Rule 8: If `enableDataviewJs` is disabled in Dataview's own settings, Story Forge shows a specific, actionable prompt rather than silently failing or showing a generic error.

**Edge Cases:**
- Dataview plugin not installed → engine-missing state (S11); native context fallback remains active; no crash.
- DataviewJS view imported while on mobile → ViewRecord is created, but the tab shows platform-restriction state. If the same profile is later opened on desktop, the view becomes available for consent and execution.
- Writer enables DataviewJS view, then `enableDataviewJs` goes false in Dataview settings → next render shows the "DataviewJS disabled in Dataview" prompt; execution stops; `okayed` is preserved.
- Checksum computation fails (malformed note, encoding edge case) → view moves to error state (S15); writer is notified; no consent is recorded.
- Synchronous infinite loop in a DataviewJS view → Story Forge cannot interrupt a synchronous JS loop from within the Obsidian renderer. This is an accepted limitation, documented at the consent step ("Infinite loops in DataviewJS are not preventable and will freeze the panel until Obsidian is reloaded"). Writers are responsible for the code they consent to run.

## Success Metrics

Story Forge ships with telemetry off and does not phone home, so "metrics" here are **verification signals** measured in tests and manual live-vault checks, not analytics.

### Key Performance Indicators

- **Adoption:** The import picker opens, lists `sf-view: true` notes from the test vault, and completes an import in a live-vault check. A DataviewJS view reaches the "rendering" state after the disclosure modal flow. A DQL view reaches "rendering" after the light confirm.
- **Engagement:** Every view state (S11–S26) is reachable and correctly rendered, verified by a scripted live-vault checklist covering each state transition.
- **Quality:** Zero unhandled exceptions from the Dataview adapter (verified); DataviewJS does not execute before consent is recorded (unit test); checksum re-consent fires on any byte change to the view definition note (unit test); green `build`, `lint`, `typecheck`, and `schema:check`; all M2 unit tests and live-vault checks pass.
- **Foundation readiness:** M3 can register a `_forge` DQL or DataviewJS view and have it render in the panel with **no changes to the M2 engine layer** — the true measure that the seam is right.

### Tracking Requirements

Measured via automated tests and a scripted live-vault checklist (no user analytics):

| Event | Properties | Purpose |
|-------|------------|---------|
| DataviewJS consent flow (integration) | view source → `okayed` recorded, execution starts | Verify consent gate records correctly and unblocks rendering |
| Checksum drift re-consent (unit) | edit view note → consent state resets | Verify re-consent trigger fires on any byte change |
| DQL light-confirm path (integration) | import → light confirm → rendering | Verify DQL bypasses full gate |
| Engine-missing fallback (live check) | Dataview absent → S11 state, native context active | Verify native fallback is unaffected |
| Kill-switch toggle (live check) | disable → tab state; re-enable → renders without re-consent | Verify `okayed` is preserved through disable/re-enable |
| Import picker scan (live check) | vault with `sf-view: true` notes → picker lists them | Verify auto-scan against metadataCache |
| ViewStore round-trip (unit) | ViewRecord written with `engine` + `okayed` → loads correctly | Verify M2 fills the M1 store contract |

## Constraints and Assumptions

### Constraints

- Targets Obsidian `minAppVersion` 1.5.7; `isDesktopOnly: false` (mobile must work — no Node/Electron APIs in the core path; DataviewJS is desktop-only as a separate gate, not a manifest flag).
- Must satisfy Obsidian community-plugin submission rules (listener/timer cleanup via register hooks, `console.debug` only, XSS-safe DOM, no sample-plugin residue).
- **Frontmatter-truth principle:** Story Forge never owns canonical story data. M2 is read-only with respect to story notes; it writes only to `data.json` (the ViewStore).
- Dataview is a **soft dependency** — feature-detected at runtime; Story Forge must load and function without Dataview installed.
- Toolchain fixed: TypeScript + esbuild, vitest for tests, eslint-plugin-obsidianmd already wired.
- No telemetry / no network in M2.

### Assumptions

- M1 (spec 001, Implemented) is the foundation: ViewStore with `okayed` consent slot, `engine` discriminant, `command` flag, ScopingService, and the SidebarView with tab seam are all in place and stable. M2 fills these without reshaping M1.
- The test vault `test/StoryForge/` (Wardens of Moonharbor seed data) has at least one `sf-view: true` note for each engine type to exercise the import and consent flows in live-vault checks.
- Dataview v0.5.68 (the installed version verified during M2 research) is the minimum version target; the Dataview API used is the version confirmed available in `main.js`.
- Writers keep view definitions as standard vault notes (Markdown with frontmatter); no special file type or location is required.
- The `_forge` schema from M0 is stable — entity classification tags (`canon/*`, `manuscript/scene`) are reliable inputs for any view that scopes to entity type.

## Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Arbitrary JavaScript execution (DataviewJS) | High | Certain (by design) | Full disclosure modal + byte-exact checksum + fail-closed default (disabled) + re-consent on any drift; accepted risk, mitigated by explicit informed consent |
| Synchronous infinite loop in a DataviewJS view freezes the panel | High | Low | Cannot be prevented from within the renderer; documented as an accepted limitation at the consent disclosure step; the writer owns the code they consent to run |
| Dataview API drift between versions breaks the adapter | Medium | Medium | Soft dependency with feature detection; pin a minimum Dataview version in documentation; native fallback remains active if the adapter breaks |
| `enableDataviewJs` is OFF by default in Dataview | Medium | High | Detect this condition explicitly and surface a friendly, actionable prompt directing the writer to Dataview settings — not a generic error |
| Checksum mismatch false positives (encoding, trailing whitespace) | Medium | Low | Normalize source before hashing (byte-exact on the normalized form); document the normalization rule in the SDD |
| ViewStore race with Obsidian Sync on `data.json` | Low | Low | Write to the store only on user-initiated actions (import, consent, kill-switch); read-modify-write preserves all siblings |
| View definition note deleted from vault after import | Medium | Low | ViewRecord remains in the store; the panel tab shows an error/missing state (variant of S15) with a clear message; writer can Remove the view from Settings |

## Open Questions

Deferred — not blocking the PRD; resolved in the SDD phase or later:

- [ ] **DataviewJS scoping-injection:** how does a DataviewJS view target the panel's active subject (the note resolved by M1's ScopingService) vs Dataview's own `dv.current()` which returns the note where the DataviewJS block is embedded? This is a genuine API unknown requiring an SDD-phase technical spike before the SDD can specify the adapter interface.
- [ ] **View-id scheme:** what is the stable identifier for a ViewRecord when the backing vault note is moved or renamed? Does the id track the note's path (fragile) or a UUID written into the note's frontmatter? Requires a decision in the SDD.
- [ ] **Tab-label overflow policy:** when `sf-name` exceeds the sidebar tab width, is the label truncated with an ellipsis or abbreviated? Where does the full name appear on hover? Should be specified in the mockups (S14/S24); confirm with the maintainer if needed.
- [ ] **View definition note format for `sf-version`:** the view-definition schema specifies `sf-version` as a frontmatter field, but is it a semver string, an integer, or a free-form string? The re-consent trigger fires on any change to this field; the SDD should fix the type.

---

## Supporting Research

### Competitive Analysis

Dataview (v0.5.68, analyzed at installed `main.js`) is the most-used community plugin for vault queries — DQL for declarative tables/lists, DataviewJS for arbitrary rendering. Story Forge does not compete with Dataview; it consumes it as an engine layer. The consent approach (full disclosure + checksum) mirrors the markdown-mason `disclosure.ts` pattern from the sibling plugin, the proven reference implementation for this project.

Storyline (v1.10.41, analyzed for M1) hard-codes its views in plugin TypeScript — writers cannot import or author views. Story Forge's user-import flow is a deliberate contrast: vault notes as portable, human-readable view definitions that the writer owns.

### User Research

Grounded in this project's design work and the M2 research phase (three parallel agents: Security/consent-reference, Dataview-integration, and UX/requirements). Key findings: DQL is declarative and read-only — no meaningful security gate is warranted for it; DataviewJS is arbitrary code and requires the full informed-consent path; the consent gate must be byte-exact (not version-only) because writers often edit views without bumping a version field; the 16-state UI inventory (S11–S26) covers all reachable states including engine-missing, mobile restriction, and Settings row variants.

### Market Data

The Obsidian community-plugin ecosystem treats Dataview as near-ubiquitous infrastructure for fiction vaults. No quantitative sizing is in scope for a personal-first plugin. The design choice to treat Dataview as a soft dependency (with a native fallback) keeps Story Forge functional for users who prefer not to install it, without penalising the majority who already have it.
