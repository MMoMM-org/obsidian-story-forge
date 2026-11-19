---
title: "Phase 4: Scanner-clean source"
status: completed
version: "1.0"
phase: 4
---

# Phase 4: Scanner-clean source

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: SDD/ADR-44]` — scanner-aligned lint, brands, disables
- `[ref: SDD/CON-7]`
- `[ref: SDD/Technical Debt]` — warnings that stay
- https://github.com/obsidianmd/eslint-plugin — "Community plugin scanner configuration"

**Key Decisions**:
- `eslint-plugin-obsidianmd` 0.5.1 (0.6.0 is under two weeks old).
- Brands (Anvil, Workbench, Codex, Timeline, Plotlines, Plotgrid, FileClasses, Story Forge) come
  from a local list in `eslint.config.mts`, not a deep import into the plugin's `dist/`.
- "Open Board" becomes "Open board"; command ids do not change.
- Warnings (`prefer-create-el`, `prefer-instanceof`) stay out of scope unless a fix is one line.

**Decisions taken during implementation**:
- RED was 66 errors, not ≈47: 0.5.1 also reports 19 `ui/sentence-case` errors (stricter, narrower
  brands). The scanner itself turns `ui/sentence-case` off since 0.5.0; we keep it on locally with
  a local brands list (stricter than the scanner) and `ignoreRegex: [" › "]` for breadcrumbs.
- `npm run lint` runs `eslint .` so `validate-manifest`/`validate-license` reach the root files;
  local ignores for `.claude/**`, `temp/**`, `infra/**`, coverage and docker folders.
- Visible text changes (command ids unchanged): "Open Board" → "Open board"; "markdown notes" →
  "Markdown notes"; ImportPickerModal "The Library links to it" → "Story Forge links to it";
  the legacy stub's "appears in: — (M3)" now renders "Appears in: — (M3)" (lowercasing would turn
  M3 into m3). Other capitalised source strings keep their signed-off rendering through
  `text-transform: lowercase` (`.sf-pin-tag`, `.sf-trail-lead`, `.sf-cx-miss i`, `.sf-resolving`,
  `.sf-badge`).
- `interactionHandler` now resolves cards with the cross-window `isHtmlElement`: cards in popout
  windows resolve. This is very likely the cause of #31; #31 stays open until a click in a real
  popout is checked in the live walk.
- `app.plugins` (Dataview) and `registerBasesView` are read with `Reflect.get` as `unknown` and
  narrowed — the same reads as before, no `any`.
- 128 warnings remain (116 `prefer-create-el`, 11 `prefer-instanceof`, 1
  `prefer-setting-definitions`), out of scope. `reportUnusedDisableDirectives` is "warn" locally.
- Review follow-ups: `.sf-pin-tag` lowercased again ("pinned" as signed off); Plotgrid aria-label
  "Plotgrid: scenes by plotline"; a test pins the cross-window card resolve.
- Drift: covered by the spec-compliance review (PASS); no SDD change beyond ADR-44's wording.

**Dependencies**: Phase 2 (T2.4 touches the catalog files). Can run beside Phase 3.

---

## Tasks

Makes the release source pass the directory's automated review with zero errors.

- [x] **T4.1 Scanner rules in local lint** `[activity: build-tooling]`

  1. Prime: `eslint.config.mts`, `package.json`, the scanner configuration in the plugin README
  2. Test: `npm run lint` runs the scanner rule set (including `eslint-comments` rules and
     `validate-manifest`/`validate-license`) and currently reports the known errors
  3. Implement: Upgrade the plugin to 0.5.1; adopt the scanner configuration; local brands list
  4. Validate: The error list matches the audit (≈47) before fixes
  5. Success: Local lint is the scanner `[ref: PRD/F6.2]`

- [x] **T4.2 Remove or justify every disable** `[activity: refactor]`

  1. Prime: Error list from T4.1
  2. Test: Lint itself; plus existing UI text tests (sentence case helper) still pass
  3. Implement: Drop sentence-case disables covered by brands; rewrite Title Case strings
     ("Open board"); add `-- reason` to remaining disables; replace the three
     `no-explicit-any` disables with typed code
  4. Validate: `npm run lint` 0 errors; full suite green; typecheck ×3
  5. Success: Scanner configuration reports 0 errors `[ref: PRD/F6.2]`

- [x] **T4.3 Phase validation** `[activity: validate]`

  - Lint 0 errors, tests, typecheck ×3, build. Record remaining warnings count in the spec README.
