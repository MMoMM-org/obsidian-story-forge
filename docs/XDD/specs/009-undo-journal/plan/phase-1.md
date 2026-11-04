---
title: "Phase 1: Live spike"
status: pending
version: "1.0"
phase: 1
---

# Phase 1: Live spike

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: SDD/Open Questions; OQ-1]` — does a capture-phase `keydown` get Mod+Z before Obsidian?
- `[ref: SDD/ADR-37]` — global capture-phase handler, popouts via `window-open`
- `[ref: SDD/Deployment View; Dev deployment gotcha]` and `[ref: SDD/Implementation Gotchas; Hot reload]`
- `[ref: SDD/Quality Requirements; Live walk list item 1, item 8]`

**Key Decisions**:
- ADR-37 is confirmed **only if** this spike passes. If it fails, stop and re-open ADR-37 with the
  user. The fallback is commands and buttons only (PRD Risks).
- Spike code is throwaway. It is never merged. Only the findings are committed.

**Dependencies**: none. This phase opens the plan because it can remove a whole task (T5.4).

---

## Tasks

Settles the two facts the mock cannot show, before any code depends on them.

- [ ] **T1.1 Mod+Z capture spike** `[activity: spike]`

  1. Prime: ADR-37; Storyline's global keydown handler (`docs/storyline-analysis.md`); how Obsidian
     dispatches hotkeys (`Scope`, `app.scope`).
  2. Test: a throwaway build adds one capture-phase `keydown` listener on `activeDocument`, and on
     each popout document via `workspace.on("window-open")`. It logs Mod+Z and Mod+Shift+Z with the
     active view type and target, and calls `preventDefault` only while the Anvil or Workbench is
     active. Check by hand: (a) Anvil, a Codex card focused; (b) Anvil editor input; (c) Workbench;
     (d) a Markdown note, where Obsidian's own editor undo must still work; (e) an Anvil in a popout
     window.
  3. Implement: the listener on a scratch branch (`spike/undo-keys`); deploy with `npm run dev`.
  4. Validate: the user runs (a)–(e) in `test/StoryForge/`. The results go into
     `docs/live-testing.md`.
  5. Success:
     - [ ] The handler receives the key in (a), (b), (c), (e), before Obsidian acts on it `[ref: SDD/OQ-1]`
     - [ ] (d) is unaffected `[ref: PRD/F5; SDD/AC-F5.5]`
     - [ ] OQ-1 is marked resolved in `solution.md`, or ADR-37 is re-opened with the user

- [ ] **T1.2 Dev deploy and hot reload keep unknown files** `[activity: spike]` `[parallel: true]`

  1. Prime: the `copyAssets` plugin in `esbuild.config.mjs`. It only copies `main.js`, `styles.css`
     and `manifest.json`, with no delete. The `hot-reload` plugin is in the test vault.
  2. Test: put a dummy `undo-journal.json` in `test/StoryForge/.obsidian/plugins/story-forge/`;
     rebuild with `npm run dev` and let hot-reload reload the plugin; then do a full Obsidian restart.
  3. Implement: nothing, unless the file disappears. In that case, exclude it from whatever cleans
     the folder.
  4. Validate: the file is still there with the same content after each step.
  5. Success: the journal survives rebuild, hot reload and restart `[ref: SDD/Live walk item 8]`;
     the result goes into `docs/live-testing.md`

- [ ] **T1.3 Phase Validation** `[activity: validate]`

  - Delete the spike branch. Commit the findings (`docs/live-testing.md`, the OQ-1 status in
    `solution.md`). If T1.1 failed, mark T5.4 as dropped and log the decision in the spec README.
