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
