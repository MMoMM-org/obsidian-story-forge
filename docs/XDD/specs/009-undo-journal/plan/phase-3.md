---
title: "Phase 3: Gestures and pending work"
status: in_progress
version: "1.0"
phase: 3
---

# Phase 3: Gestures and pending work

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: SDD/ADR-38]` — explicit groups, `openGroup`/`join`/`track`/`close`/`settled`, 10 s force-close
- `[ref: SDD/ADR-39]` — probe and flusher registry, `Debouncer.run()`
- `[ref: SDD/ADR-52]` — `InteractionHandler.destroy()` runs pending flushes
- `[ref: SDD/Internal API Changes; interactionHandler, renderKanban]` — `GestureContext`, `flushPending`, `isBusy`
- `[ref: SDD/Traced walkthrough 1]` — the RENUMBER drag, undo inside the debounce window
- `[ref: SDD/Traced walkthrough 3]` — refusal because of a draft
- `[ref: SDD/Implementation Gotchas]` — merging the same key in a group; renumber with unchanged siblings

**Key Decisions**:
- A gesture is one step, however many files it writes. Within a group, merging keeps the first
  `before` and the last `after`, and drops the change if the two become equal.
- Undo order: run the flushers → wait until no group is open → choose the top step → ask the probes
  for every path in it → refuse or apply.
- Refusal writes nothing and leaves the stacks and the draft untouched. The buttons stay enabled.

**Dependencies**: Phase 2 (journal, writer `group` option, mock `Debouncer.run`).

---

## Tasks

Makes multi-file gestures one undo step and stops undo from colliding with unsaved text or a
pending write.

- [ ] **T3.1 JournalGroup** `[activity: domain-modeling]`

  1. Prime: `[ref: SDD/ADR-38]`; `[ref: SDD/Application Data Models; JournalGroup]`.
  2. Test: `undoJournal.record.test.ts` (extended):
     - writes with `{group}` collect into one step, committed when holds reach zero and tracked
       promises have settled;
     - `join` needs its own `close`;
     - a rejected tracked promise still lets the group commit;
     - an empty group commits nothing;
     - the same key twice keeps the first `before` and the last `after`;
     - an A→B→A sequence drops the change;
     - a group open after 10 s force-closes with a warning;
     - a write that arrives after its group committed records its own step and warns;
     - `group(fn)` closes in `finally`;
     - `dispose` closes open groups.
  3. Implement: `openGroup`, `group`, and the merge in `undoJournal.ts`; the writer passes
     `options.group` to `record`.
  4. Validate: unit tests, mutation-checked.
  5. Success: `[ref: SDD/AC-F1.1, AC-F1.5]`

- [ ] **T3.2 Probe and flusher registry; refusal** `[activity: domain-modeling]`

  1. Prime: `[ref: SDD/ADR-39]`; `[ref: SDD/Traced walkthrough 3]`.
  2. Test: `undoJournal.pending.test.ts`:
     - flushers run and are awaited before the step is chosen;
     - undo waits for open groups to settle;
     - a probe reporting `draft` on a step's path refuses, writes nothing, leaves the stacks as they
       were, and gives `refused`/`draft`; the same with `write`;
     - a busy note outside the step proceeds;
     - after the probe clears, the next undo applies;
     - unregistering a probe or a flusher removes it;
     - a throwing flusher is warned about and undo continues.

     All of this applies to redo too.
  3. Implement: `registerProbe`, `registerFlusher`, and the pre-apply sequence in `undoJournal.ts`.
  4. Validate: unit tests, mutation-checked.
  5. Success: `[ref: SDD/AC-F8.1–AC-F8.5]`

- [ ] **T3.3 InteractionHandler: groups, flushPending, isBusy, flushing destroy** `[activity: frontend-logic]`

  1. Prime: `src/workspace/interactionHandler.ts` (the 200 ms per-file debounce; `destroy` cancels
     today); `[ref: SDD/ADR-38, ADR-39, ADR-52]`.
  2. Test: `interactionHandler.group.test.ts`:
     - the first entry for a file opens a group, and later coalesced moves join it;
     - `_flush` passes the group to `onWrite` and closes it in `finally`;
     - `computeDrop`/`computeKey` receive the `GestureContext`;
     - `flushPending()` runs every pending debouncer via `run()` and awaits the writes;
     - `isBusy(path)` is true while entries are pending or a flush is in flight;
     - `destroy()` runs the pending flushes instead of cancelling them (the ADR-52 data-loss fix);
     - without `openGroup`, the old behaviour holds.
  3. Implement: the handler changes. Its probe and flusher are registered by the owning view
     (T3.4).
  4. Validate: the new and the existing handler tests pass; mutation-checked.
  5. Success: `[ref: SDD/AC-F1.5, AC-F8.4]`; the ADR-52 regression test fails on the old `destroy`

- [ ] **T3.4 Kanban renumber and the Anvil's probes** `[activity: frontend-logic]`

  1. Prime: `src/workspace/renderKanban.ts` (`void deps.renumber`, ~l.434);
     `src/anvil/AnvilView.ts` (`onWrite` ~425, `renumber` ~1101, `_inFlight`, `_draftEl`);
     `[ref: SDD/Traced walkthrough 1]`.
  2. Test:
     - `renderKanban`: `computeDrop` with RENUMBER calls `group.track(deps.renumber(writes, group))`,
       and no promise is dropped;
     - `AnvilView.undo.test.ts` (probe part):
       - the Anvil's `onWrite` and `renumber` pass the group into `commit`/`commitMany`;
       - the Anvil registers a probe that reports `draft` for the editor note while `_draftEl` holds
         unsaved text, and `write` while `_inFlight` covers the path;
       - it registers the handler's `flushPending` as a flusher and `isBusy` as a probe;
       - all of these unregister on close;
     - the walkthrough-1 scenario end to end in the mock: a RENUMBER drag followed by undo at 150 ms
       gives one step, "4 changes in 3 notes", and Scene 2 is absent.
  3. Implement: `renderKanban.ts`; the `AnvilView` wiring, with the journal injected through
     `opts.undo` (ADR-43); `main.ts` passes the journal into the Anvil's view factory. The
     "4 changes in 3 notes" assertion uses the provisional wording, and T5.1 updates it.
  4. Validate: tests, mutation-checked; `npm run build`.
  5. Success: `[ref: SDD/AC-F1.5, AC-F8.1, AC-F8.2, AC-F8.4]`

- [ ] **T3.5 Phase Validation** `[activity: validate]`

  - All gates green. Check by hand with the palette command: a Kanban drag with RENUMBER, then undo
    restores every note. Drift check against ADR-38/39/52.

## Decisions taken during implementation

- **T3.1: a group's step is stamped at commit.** `at` and the id come from `now()` when the group commits, not when it opened, so ids stay in commit order. The step shares the id counter with ungrouped steps.
- **T3.1: `join()` and `track()` return the same handle / promise.** There is no child group (ADR-38). `join()` or `track()` on a group that already committed does nothing; an extra `close()` beyond the holds is ignored.
- **T3.1: a write naming an unknown or committed group records its own step and warns** (one `console.warn`). A group handle the journal did not create is treated the same way.
- **T3.1: `dispose` clears listeners, then force-commits open groups.** The merged step lands on the in-memory stack but is not saved (dispose stops saving) and `settled` resolves. Disposing does not warn.
- **T3.1: the 10 s timer uses `window.setTimeout`** (obsidianmd/prefer-window-timers) and is cleared on commit, so a group that commits in time leaves no timer behind.
- **T3.1: merged changes keep first-write order** by file and by key; a key set again keeps its first position.
