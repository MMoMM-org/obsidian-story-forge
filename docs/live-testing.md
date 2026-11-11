# Story Forge M1 — Live Testing Checklist

> **Vault:** `test/StoryForge/` (Wardens of Moonharbor seed data)
> **Build:** `npm run dev` (hot-reload via pjeby/hot-reload v0.3.0)
> **Scope:** Phase 4 / spec 001-core-infrastructure

This checklist covers every M1 PRD acceptance criterion.  For each item the
automated coverage is cited where it exists.  Items marked **REQUIRES MANUAL
RUN** cannot be verified headlessly — the GUI must be open in Obsidian.

---

## Automation coverage key

| Symbol | Meaning |
|--------|---------|
| AUTO   | Covered by an existing automated unit test (file + test name cited) |
| PARTIAL | Core logic is unit-tested; the GUI wiring still needs a visual smoke-check |
| MANUAL | No automated equivalent; requires a live Obsidian session |

---

## 1  Open panel via ribbon icon and command palette

| Step | Expected | Coverage |
|------|----------|----------|
| 1a. Click the `book-open` ribbon icon | Story Forge panel docks in the right sidebar; title "Story Forge" visible | PARTIAL — `test/main.test.ts > addRibbonIcon` asserts the icon is registered; panel open behaviour is GUI-only |
| 1b. Close the panel; run command "Story Forge: Open panel" | Same panel re-opens | PARTIAL — `test/main.test.ts > addCommand registers 'open-panel'` asserts the command is registered; actual reveal is GUI-only |
| 1c. Trigger the ribbon or command a second time when panel is already open | No duplicate panel created; existing panel is revealed | AUTO — `test/views/SidebarView.registration.test.ts > activateView > calling activateView twice → only one leaf created` |

Status: ✅ verified by maintainer 2026-07-15 (1a, 1b, 1c)

---

## 2  No note open → S2 empty state

| Step | Expected | Coverage |
|------|----------|----------|
| 2a. Open the panel when no markdown note is active | Body shows "No note open" empty state | AUTO — `test/views/SidebarView.rendering.test.ts > S2 — no note state > renders the no-note empty state` |
| 2b. Header shows "—" title and "—" badge | | AUTO — same test |

Status: AUTO ✓

---

## 3  Non-markdown file focused → S3 state

| Step | Expected | Coverage |
|------|----------|----------|
| 3a. Focus a Canvas or PDF | Body shows "Story Forge follows markdown notes." | AUTO — `test/views/SidebarView.rendering.test.ts > S3 — non-markdown file` |
| 3b. Panel title shows the file name | | AUTO — same suite |

Status: AUTO ✓

---

## 4  Non-entity markdown note → S4 state

| Step | Expected | Coverage |
|------|----------|----------|
| 4a. Open `getting-started.md` (no `#canon/*` or `#manuscript/*` tag, no `type` field) | Panel shows "not an entity" badge; body explains the note isn't tracked | AUTO — `test/views/SidebarView.rendering.test.ts > S4 — non-entity (non-md file or non-entity md)` and `test/views/SidebarView.follow.test.ts > active-leaf-change … non-entity → S4` |
| 4b. Header title shows note basename | | AUTO — same suites |

Status: AUTO ✓

---

## 5  Open Scene 1 → S6 resolved state with pov/characters/location/plotlines

| Step | Expected | Coverage |
|------|----------|----------|
| 5a. Open `10 Manuscript/Wardens of Moonharbor/Scene 1 - The Extinguished Fire.md` | Panel badge shows "scene"; body shows stub with resolved entities: Mara Stoneway (pov), Mara Stoneway + Tobias Ferro (characters), Moonharbor Lighthouse (location), The Dying Light (plotlines) | PARTIAL — `test/views/SidebarView.rendering.test.ts > S6/S7 resolved context > renders resolved context stub with entity rows` verifies the rendering shape; `test/scoping/ScopingService.resolve.test.ts` verifies entity extraction from frontmatterLinks. GUI wiring of both into the live panel requires manual check. |
| 5b. Title shows "The Extinguished Fire" | | AUTO — rendering tests cover title update |

Status: ✅ verified by maintainer 2026-07-15 (badge + entity rows visible in vault)

---

## 6  Open Mara Stoneway → S7 resolved state (character entity)

| Step | Expected | Coverage |
|------|----------|----------|
| 6a. Open `30 Canon/31 Characters/Mara Stoneway.md` | Badge shows "character"; body shows resolved context stub (relations from her frontmatter) | PARTIAL — same as item 5; character classification tested in `test/scoping/ScopingService.classify.test.ts > classifies character tag` |
| 6b. Header title shows "Mara Stoneway" | | AUTO — rendering tests cover title update |

Status: ✅ verified by maintainer 2026-07-15 (character badge + rows visible)

---

## 7  Pin Mara + switch notes → panel stays on Mara (S8)

| Step | Expected | Coverage |
|------|----------|----------|
| 7a. With Mara Stoneway open, click the pin button (📌) | Panel freezes; pin button shows `aria-pressed="true"` and `sf-pin-active` class; "pinned" tag appears in header | AUTO — `test/views/SidebarView.pin.test.ts > pin toggle: activating pin > pin button gets aria-pressed=true and sf-pin-active class` |
| 7b. Switch to Scene 1 while pinned | Panel still shows Mara Stoneway | AUTO — `test/views/SidebarView.pin.test.ts > when panel is pinned, active-note changes are ignored` |
| 7c. Click pin button again to unpin | Panel resumes following; on next note switch it follows again | AUTO — `test/views/SidebarView.pin.test.ts > togglePin releases the pin and sets source to follow` |

Status: AUTO ✓ (DOM behaviour verified; visual confirm is nice-to-have)

---

## 8  Reload → saved view record persists

| Step | Expected | Coverage |
|------|----------|----------|
| 8a. Call `store.setRecord("my-view", {...})` from the dev console, reload the plugin | After reload, `store.getViews()` returns "my-view" intact | PARTIAL — `test/store/ViewStore.test.ts > setRecord then getViews returns the record` verifies round-trip via the port; `test/main.test.ts > clobber guards > ViewStore.setRecord does NOT drop settings` verifies co-existence with settings. The live data.json round-trip through Obsidian's storage requires manual confirmation. |
| 8b. Saving settings after a view record is written does not erase the record | | AUTO — `test/main.test.ts > clobber guards > saveSettings does NOT drop the views map` |
| 8c. Settings persist across reload | | AUTO — `test/main.test.ts > settings persist across reload > settings loaded from data.json are reflected in plugin.settings` |

Status: ✅ verified by maintainer 2026-07-15 — `store.setRecord("console-test", …)` wrote `{ views: { "console-test": … } }` to `data.json`; survived "Reload app without saving" (`getViews()` still returned it); `deleteRecord` removed it, leaving `{ views: {} }`.

---

## 9  Rapid note switches → panel coalesces (no flicker)

| Step | Expected | Coverage |
|------|----------|----------|
| 9a. Switch notes 5× quickly | Panel settles on the last note after the debounce window | AUTO — `test/views/SidebarView.follow.test.ts > rapid leaf switches within debounce window coalesce to the LAST note` |

Status: AUTO ✓

---

## 10  Plugin unloads cleanly — no orphaned listeners

| Step | Expected | Coverage |
|------|----------|----------|
| 10a. Disable the plugin from Settings → Community Plugins | No JS console errors; no orphaned event listeners (devtools Memory/Listeners panel) | PARTIAL — `test/main.test.ts > T4.2 lifecycle cleanup > SidebarView listeners are registered via registerEvent (tracked)` asserts listeners go through registerEvent (so Obsidian cleans them up); `test/views/SidebarView.registration.test.ts > all listeners registered via registerEvent` verifies the same at view level; `test/views/SidebarView.follow.test.ts > onClose cancels the debounced follow function` confirms debounce cancel. Visual console check in Obsidian is GUI-only. |
| 10b. Plugin does NOT detach leaves on unload (preserves user layout per obsidianmd guidance; Obsidian releases the registered view type natively) | Sidebar view type is unregistered by Obsidian; the leaf position is preserved for the next load | AUTO — `test/main.test.ts > does NOT detach leaves on unload (obsidianmd guidance — preserve layout)` |

Status: ✅ verified by maintainer 2026-07-15 — disabling the plugin removed the panel with no console errors; re-enabling restored it (ribbon/command work again).

---

## PRD Feature → Test Mapping

| Feature | Acceptance Criterion (abbreviated) | Test file(s) | Status |
|---------|-------------------------------------|--------------|--------|
| F1: Panel shell | Ribbon/command opens panel | `test/main.test.ts > addRibbonIcon`, `addCommand` | AUTO (registration); GUI (visual) |
| F1: Panel shell | Switches note → header updates | `test/views/SidebarView.follow.test.ts` | AUTO |
| F1: Panel shell | No note → empty state | `test/views/SidebarView.rendering.test.ts > S2` | AUTO |
| F1: Panel shell | Non-markdown → S3 message | `test/views/SidebarView.rendering.test.ts > S3` | AUTO |
| F1: Panel shell | Not-entity → S4 state | `test/views/SidebarView.rendering.test.ts > S4`, `SidebarView.follow.test.ts` | AUTO |
| F1: Panel shell | Rapid switches coalesce | `test/views/SidebarView.follow.test.ts > debounce coalesce` | AUTO |
| F1: Panel shell | Unloads cleanly, no orphaned listeners | `test/main.test.ts > T4.2`, `test/views/SidebarView.registration.test.ts` | AUTO (structural); GUI (visual) |
| F2: Pin | Pin freezes subject | `test/views/SidebarView.pin.test.ts > activating pin` | AUTO |
| F2: Pin | Pinned → ignores active-note changes | `test/views/SidebarView.pin.test.ts > active-note changes ignored` | AUTO |
| F2: Pin | Unpin resumes following | `test/views/SidebarView.pin.test.ts > togglePin releases pin` | AUTO |
| F3: Entity-context resolution | Scene note → resolver produces entity list with fields + kinds | `test/scoping/ScopingService.resolve.test.ts` | AUTO |
| F3: Entity-context resolution | Unresolved link → reported, no crash | `test/scoping/ScopingService.resolve.test.ts > unresolved link` | AUTO |
| F3: Entity-context resolution | Non-entity target → marked as unknown | `test/scoping/ScopingService.resolve.test.ts` | AUTO |
| F3: Entity-context resolution | Metadata change → context refreshes | `test/views/SidebarView.follow.test.ts > metadataCache changed re-resolves` | AUTO |
| F3: Entity-context resolution | Resolver testable without Obsidian | All `test/scoping/` tests (run in jsdom) | AUTO |
| F4: View store | Record round-trips intact | `test/store/ViewStore.test.ts > setRecord then getViews` | AUTO |
| F4: View store | Malformed fields → safe defaults | `test/store/types.test.ts > applyDefaults` | AUTO |
| F4: View store | Shared data file — no settings clobber | `test/main.test.ts > clobber guards` | AUTO |
| F4: View store | Delete absent record → safe no-op | `test/store/ViewStore.test.ts > deleteRecord` | AUTO |

---

## Items requiring a manual run

The following items have no automated equivalent and require a live Obsidian
session with `test/StoryForge/` as the vault:

- [x] 1a. Ribbon icon opens the panel visually — verified 2026-07-15
- [x] 1b. Command palette "Story Forge: Open panel" opens the panel — verified 2026-07-15
- [x] 5 (visual). Scene 1 shows badge "scene" and the entity rows for pov/characters/location/plotlines — verified 2026-07-15
- [x] 6 (visual). Mara Stoneway shows badge "character" and her entity rows — verified 2026-07-15
- [x] 8 (live storage). `store.setRecord` + plugin reload → record still present in `data.json` — verified 2026-07-15 (write → reload → still present → `deleteRecord` clean)
- [x] 10 (console). Disabling plugin produces no JS console errors and leaves no listeners — verified 2026-07-15 (clean disable/enable, no errors)

> **Note:** The full GUI pass — open panel, follow, states S2–S9, resolved entity
> rows, pin/unpin, styling, **live `data.json` record persistence across reload**,
> and **clean disable/enable** — was walked through and verified by the maintainer
> on 2026-07-15. All checklist items pass. Automated results above are real
> (172 tests).

---

## Spec 009 Phase 1: live spike (2026-11-05)

A throwaway build (never committed) added a capture-phase `keydown` listener on `activeDocument`
and on each popout document (`workspace.on("window-open")`). It showed a Notice for every Mod+Z
and Mod+Shift+Z. In the Anvil and the Workbench it called `preventDefault` and `stopPropagation`
when the target was inside the view.

| Item | Action | Result |
|------|--------|--------|
| (a) | Anvil, after clicking a Codex card, Mod+Z | Key received. `inside=false`: the target is the document body, because a card does not keep focus. The real handler treats the body as the active view's (`onBody`, SDD ADR-37 example). |
| (b) | Anvil, caret in a text field with typed text, Mod+Z | Key received, `inside=true`. **The field's text was unchanged**, so `preventDefault` ran before the field's own undo. Our handler is first. |
| (c) | Workbench, a field and empty space | Key received. `inside=true` only with a text field focused, otherwise the body (as in a). |
| (d) | Markdown note, Mod+Z | Notice shown, nothing prevented. Obsidian's editor undo works as normal. |
| (e) | Anvil in a popout window | Same behaviour as the main window, so the key arrives through `window-open`. |

**OQ-1 resolved: yes.** ADR-37 stands.

**Found on the way, not part of 009:** in a popout Anvil, clicking a different card does nothing.
`AnvilView._onClick` starts with `target instanceof HTMLElement`, which is false for an element
from the popout's window realm. The Undo key handler must use Obsidian's `instanceOf`. See the
note in SDD ADR-37.

**T1.2 (dev deploy keeps unknown files):** a dummy `undo-journal.json` in the deployed plugin folder
survived `npm run build` with an identical sha256 (`fd945c97…`). `esbuild.config.mjs` only copies
and writes files; it never deletes. A full Obsidian restart also left it unchanged (same sha256). The dummy file was then removed and the normal build redeployed.

## Spec 009 Phase 2: palette undo (2026-11-06)

Build at 2b283d2, vault `test/StoryForge/`, Mara Stoneway in the Anvil editor.

| Step | Action | Result |
|---|---|---|
| 1 | Change `status` in the Anvil editor | Written to frontmatter |
| 2 | "Story Forge: Undo last change" | Old value back, provisional notice shown |
| 3 | "Story Forge: Redo last change" | New value back |
| 4 | Undo, full Obsidian restart, then Redo | Redo still available after the restart, so the journal persisted and loaded |
| 5 | Undo/Redo with an empty stack | "Nothing to undo" / "Nothing to redo" |

All five passed. Side note: a `processFrontMatter` write reformats the whole frontmatter block. It
expands flow lists, drops redundant quotes, and drops inline comments (`height: 168  # cm`). The
values stay the same. This is Obsidian's behaviour on every frontmatter write, not the journal's.
The note was restored from git afterwards.

## Spec 009 Phase 3: gestures and pending work (2026-11-06)

Build at 078abcf, vault `test/StoryForge/`, Anvil Kanban board. The `draft` column held Scene 1
(`order` 1), Scene 2 (2) and Scene 6 (6).

| Step | Action | Result |
|---|---|---|
| 1 | Drag Scene 3 from `outline` between Scene 1 and Scene 2 | RENUMBER: Scene 1 → 10, Scene 3 → 20 (and `status` → `draft`), Scene 2 → 30, Scene 6 → 40 |
| 2 | "Undo last change" | One step restores all four notes: Scene 3 back in `outline` with `order` 3, the others at 1, 2, 6 |
| 3 | "Redo last change" | The whole drag is back |
| 4 | Anvil: edit Scene 3's `title` without leaving the field, then "Undo last change" | No refusal. The palette took focus, the blur fired `change` and committed the title as its own step, and undo reverted that step. This is the SDD gotcha "Focus moves on a button click" |
| 5 | Workbench: an unsaved field edit, then "Undo last change" | No refusal: the drag was undone and the Workbench draft stayed unsaved. Expected for now, because the Workbench probe arrives in Phase 4 (T4.3) |

The persisted journal confirms steps 1 and 4. The redo stack held the title step
(`The Black Cliffs` → `The Black Cliffs!`) and the drag step, with all four files and the five
changes listed in step 1.

**Finding for Phase 5:** with the palette as the trigger, an Anvil draft can never reach the probe,
because opening the palette commits it. The Anvil `draft` probe only matters for Mod+Z with focus
outside the draft field. That case also commits on blur, so it is close to unreachable. Keep it as
a cheap guard; the live walk in Phase 6 checks the Workbench refusal instead.

**Found on the way, not part of 009:**
- Kanban cards show only the title, the status and the tag. Storyline's cards carry more
  (POV, location, synopsis), so this is a gap against the reference model.
- Clicking a card with the grab cursor focuses it but does not switch the editor pane. Only a
  click near the title (pointer cursor) does. Storyline opens the scene on any click on the card.

The scene notes were restored from git afterwards (`processFrontMatter` reformat only).

## Spec 009 Phase 4: Workbench refresh and the undo probe (2026-11-07)

Build at b9d5f25 (docs-only commits since), vault `test/StoryForge/`. Mara Stoneway open in the
editor, the Workbench on Mara.

| Step | Action | Result |
|---|---|---|
| 1 | Workbench: save `nickname` Spark → Spark2, then hand-edit it in the note to Spark3 | The Workbench shows Spark3 without a click (#30 fixed) |
| 2 | Workbench: unsaved text in `occupation`, then hand-edit `age` in the note to 20 | 20 shows, the `occupation` draft stays. The caret is not in the field, because clicking into the editor moved focus there. The test step was wrong, not the code (see step 2b) |
| 2b | Workbench: typing in `occupation`; `age` changed on disk from outside (a shell write, no click) | 22 shows, the draft and the caret stay where they were; typing goes on without a click (U10, ADR-54) |
| 3 | "Undo last change" with the `occupation` draft unsaved | Refused with the provisional notice, nothing written (T4.3 probe) |
| 4 | Leave edit mode, "Undo last change" | `nickname` back to Spark, with a conflict notice naming `nickname` (the file held Spark3) |
| 5 | Pin the Workbench on Mara, open another note, "Redo last change" | The pinned Workbench shows the redone value at once (ADR-51) |

**Not a bug:** undo did not touch `age`. The journal records only Story Forge's own writes
(ADR-44); a hand edit in the note is undone with the editor's own undo.

Mara Stoneway was restored from git afterwards (`processFrontMatter` reformat only).

## Spec 009 Phase 5: controls, notices, keys and settings (2026-11-08)

Build at bfe18d8, vault `test/StoryForge/`, light and dark theme, compared side by side with the
signed-off `mockups.html` (U1–U11, narrow width for U3).

| Area | Result |
|---|---|
| Anvil ↶ ↷, Workbench ↶ ↷, notices, Mod+Z, settings "Undo history" | As signed off |
| Anvil header, light theme | The zoom buttons (− ⊙ +) kept Obsidian's grey button look with no hover change, while ↶ ↷ had a white background and a grey hover |
| Anvil header, dark theme | The ↶ glyph was light grey, and a disabled ↷ was almost invisible; the zoom glyphs were full white |

**Fix (0f4a654), user decision:** the zoom and undo controls share one chrome. The background is
`--background-primary` with a hover background, and the glyph is `--text-normal`. A disabled
control shows a `--text-muted` glyph with no dimming. The Workbench buttons are unchanged.

**Found, filed:** on the Board, a card can only be dropped onto another card, and nothing shows
where it will land. Filed as #34 (an insertion line between cards).

The vault notes touched by the test were restored from git (`processFrontMatter` reformat and a
test `height` value only).

## Spec 009 Phase 6: live walk (2026-11-11)

Build at 9289bb2 (the code is unchanged since 0f4a654), vault `test/StoryForge/`. Walk items from
the SDD's live walk list; item 1 is recorded under Phase 1.

| Item | Action | Result |
|---|---|---|
| 2 | Anvil editor pane (opened by a click on a Board card title): change `status`, Cmd+Z with the caret in the field, then Cmd+Shift+Z | Undo and redo apply; the caret stays in the field. Passed |
| 3 | Type in an Anvil text field without committing, Cmd+Z | Only the typed text is undone; no journal step, no notice. Passed |
| 4 | Workbench: save a field, Cmd+Z; then an unsaved Workbench draft on the same note and ↶ in the Anvil | Undone; the Anvil undo is refused with "Save your edit first (<note>)". Passed |
| 5 | Board drag that renumbers, one Cmd+Z; again with Cmd+Z right after the drop | Every note restored by one step, also within 200 ms of the drop. Passed |
| 6 | Anvil change, then the same value edited by hand in the YAML, ↶ then ↷ | Conflict notice; redo restores the hand value. Passed |
| 7 | Change a field, rename the note, ↶; change a field, delete the note, ↶ | The undo follows the rename. After the delete: "Nothing to undo", because the delete drops the note's records and the emptied step (AC-F10.2). That is correct; the test instruction expecting a vanished notice was wrong (that notice is for a note missing at apply time, AC-F10.3, covered by tests). Passed |
| 8 | Anvil change, quit and restart Obsidian | The ↶ tooltip names the change and ↶ undoes it. A production rebuild (`npm run build`, 2026-11-08) left `undo-journal.json` in place. Passed |
| 9 | Setting "Keep undo history across restarts" off; restart; on again; change; Clear | The file is gone from the plugin folder and `data.json` holds `"keepUndoHistory": false`; after the restart "Nothing to undo"; Clear shows "Undo history cleared" and disables ↶. Passed |
| 10 | Obsidian Sync on two devices | **Not run**: no second device. OQ-2 stays open |
| 11 | #30: save a Workbench field, then hand-edit the same value in the YAML | The Workbench shows the hand value without a click. Passed |
| 12 | A user hotkey Cmd+Z bound to "Undo last change"; two Anvil changes, one Cmd+Z | Only one change is undone (ADR-53 guard). The hotkey was removed afterwards. Passed |
| 13 | Codex tab: change a field shown on a character card, ↶; the same for a scene `status` on the Timeline tab | The card, the editor pane, the Workbench and the Timeline show the restored value without a click. Passed |
| 14 | README "Undo" read by the user | Confirmed (AC-S.1, AC-S.2) |
| — | Anvil in a popout window: click, Enter and Space on ↶ ↷ | All three work. Passed |

**Performance** (SDD Quality Requirements):

| Target | Live (Obsidian) | Benchmark (real code, mock vault, no disk IO) |
|---|---|---|
| Undo of a 10-file step ≤ 500 ms | 3.9 ms for a 1-file step, timed around `processFrontMatter` from the command to the last write. The vault has 6 scenes and the measured drag touched one note, so a 10-file step was not timed live | median 0.39 ms, p95 0.87 ms (20 field writes in 10 notes) |
| Recording ≤ 2 ms per field | not measured live | overhead median 0.0014 ms; a 16,382-char value median 0.0116 ms, max 0.76 ms |
| Keydown handler on another view ≤ 0.1 ms | not measured live | median 0.0002 ms (no host), 0.0009 ms (a host that does not contain the target) |

**Found, filed:** on the Timeline tab the editor pane should dock to the right by default (#36).

The vault notes touched by the walk (including the Mara Stoneway rename and delete) were restored
from git.

