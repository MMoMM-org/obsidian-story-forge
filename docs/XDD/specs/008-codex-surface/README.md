# Specification: 008-codex-surface

## Status

| Field | Value |
|-------|-------|
| **Created** | 2026-07-27 |
| **Current Phase** | SDD |
| **Last Updated** | 2026-07-28 |

## Documents

| Document | Status | Notes |
|----------|--------|-------|
| requirements.md | completed | **7 flat-Must features + 1 Should, 70 Gherkin ACs.** F1 Anvil (one view, tab switcher, old commands resolve to it, sidebar → Workbench) · **F2 Navigation semantics** (one target-kind matrix for every surface; inspect stays in place, open note never switches a panel's tab) · F3 Collections (tag + excluded folders **editable in settings** with shipped defaults; cleared tag = misconfigured, not "list the vault") · F4 Cards (Hero/Table/Compact, per-collection, native fallback; **core** Bases may be suggested, **community** plugins never) · F5 Editor pane (three docks, full field set in each, relation chips, external-change sync) · F6 FileClass-driven fields (sections from `extends`, order/types/enums/layout as data, three tiers; the plugin only writes files it authored) · F7 Library (three provenances, `.base` import, curated Dataview, per-entry Anvil/Workbench toggles). **F8 Capability disclosure** (Should): what each optional plugin adds and what is lost without it. Won't: undo journal (#17), management-tab config (#15), #8/#7/#5/#22/#23/#25/#3, in-plugin FileClass editing, `Lookup`/`Formula`/`Canvas`, telemetry. 3 SDD-level open questions. |
| solution.md | completed | **ADR-27…ADR-36 all confirmed 2026-07-28.** Pattern: *pure model → thin renderer → ItemView host* (the established repo shape), extend-don't-replace. Three new model layers: `collectionResolver`, `fieldModel`+`fileClassReader`, `baseGenerator`. Key calls: **ADR-27** view type **ids stay frozen** (`pluginConstants` says so), renaming is display-only · **ADR-28** one `NavigationController` implementing the F2 target-kind matrix for both surfaces · **ADR-29** store records gain a `kind` discriminant with legacy → `"view"` · **ADR-30** one `CardRenderer` contract, Bases + native backends (CON-3/CON-9) · **ADR-31** pure `FieldModel` between reader and editor, containing the metadata-menu format risk · **ADR-32** width from type, `ui` hints in *our* schema · **ADR-33** three docks, never automatic · **ADR-34** templates rendered whole, never patched · **ADR-35** two checksums + params, store keeps no YAML copy (fixes the double-copy defect) · **ADR-36** core may be suggested, community never. Includes traced walkthroughs for the width rule and the artifact classifier, and EARS ACs tracing F1–F7. |
| mockups.html | **completed (pre-existing)** | `docs/mockups/anvil-workbench-codex.html` — **S91–S103, signed off 2026-07-27 at v4**. Authored and approved *before* this spec, over four review rounds. Moves into this directory when the PRD lands. |
| plan/ | pending | |

**Status values**: `pending` | `in_progress` | `completed` | `skipped`

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-07-27 | Scaffold spec 008-codex-surface | Not a `build-plan.md` milestone. This spec comes out of `docs/gap-analysis.md`, which the user commissioned after judging that ~50% of the founding idea was never really built. M7 (`release-hardening`) was explicitly rejected until the structural gaps close. Covers issues **#6, #10, #11, #12, #13, #21, #26** — six register entries and one surface; specced apart they would be built three times. |
| 2026-07-27 | **Mockups precede the spec, and are already signed off** | Reverses the usual order deliberately. `docs/mockups/anvil-workbench-codex.html` (S91–S103) went through four review rounds and was signed off at v4 before any spec text existed. Per the `CLAUDE.md` rule the file is now the specification for what gets built: divergence is raised *before* coding, not re-synced afterwards. Four modelling errors were caught this way — conflated Collection/Card axes, a hardcoded field list, a hardcoded layout, and generated artifacts misfiled as consented imports — each of which would have been considerably more expensive as code. |
| 2026-07-28 | **SDD complete — ADR-27…ADR-36 confirmed** (`solution.md`) | Pattern: *pure model → thin renderer → ItemView host*, **extend don't replace** — the surfaces already carry leaf restoration, collapse state, follow semantics and consent, and rebuilding them would risk the one thing this spec must not break. Three new pure layers: `collectionResolver`, `fileClassReader`+`fieldModel`, `baseGenerator`. **Three ADRs had real trade-offs and were decided by the user:** **ADR-27** ids stay frozen (`pluginConstants`: "stable API"; changing one orphans saved layouts) **and the files move** `workspace/WorkspaceView` → `anvil/AnvilView`, because vocabulary that lives only in the UI decays in the code — how "Codex" came to mean two things. **ADR-29** legacy `bases` records **migrate silently**; if the vault file was edited pre-upgrade its content becomes the baseline, which is right because that file is the one rendered. **ADR-30** **all three** built-in Cards get both backends (Bases + native), so the Card selector does not change length depending on whether a plugin is enabled. Also settled: ADR-28 one `NavigationController` for the F2 matrix, ADR-31 pure `FieldModel` containing the metadata-menu format risk, ADR-32 width-from-type with `ui` hints in *our* schema, ADR-33 three docks never automatic, ADR-34 templates rendered whole, ADR-35 two checksums + params (fixes the double-copy defect), ADR-36 core suggestible / community never. **PRD open question answered:** the hardcoded field surface is larger than `portrait` — character uses `portrait`, location and object use `image`, plus a `locationType` display remap and a `tagline` case; the image field has **two names by kind**, so `ui: image` replaces a per-kind convention. Traced walkthroughs included for the width rule (checked field-by-field against S102/S103) and the artifact classifier. |
| 2026-07-28 | **PRD review round — 6 comments resolved, 2 features added** (user) | **(1) Navigation was missing entirely** → new **F2**: today a click in the Anvil may reveal the Workbench and switch its tab, a link may open a note, and the rule lives only in code comments. F2 defines a **target-kind matrix** (name/link · card body · structural control · editable field) that is **general across surfaces**, not invented per tab; *inspect* replaces "drill" as the term, since drill described only the Workbench's stack navigation. **(2) A contradiction the comment exposed:** F4 said "the user is not told to install anything", but **Bases is a core plugin** — enabled, not installed. Split: core may be *suggested* via one dismissible hint, community plugins are **listed, never nagged**; new Should-have **F8** carries the disclosure and discharges G14/#19. **(3)** Tag + excluded folders are now explicit per-collection settings with shipped defaults. **(4)** "Plain Property" is defined concretely — a value a human could have typed, with the delete-the-plugin test — because the term was used without ever being pinned down. **(5)** The `schema:gen` AC was **developer-facing**, not user-facing; rewritten as "the plugin only ever writes files it authored". **(6)** Open question on Anvil/Workbench binding **resolved**: per-entry toggles in the Library row, not a per-surface settings tab. Features renumbered into document order. |
| 2026-07-27 | **PRD complete** (`requirements.md`) | 6 flat-Must features, **51 Gherkin ACs** *(revised to 7+1 features / 70 ACs in the 2026-07-28 review round)*, zero `[NEEDS CLARIFICATION]`. Written directly from the signed-off mockups + ADR-0001/0002/0003 + `gap-analysis.md` §1.1–1.4. **Two deliberate deviations from the PRD checklist**, both following spec 006/007 precedent: (1) **no adoption/engagement/business KPIs** — a local single-user plugin with no telemetry; success is defined as every AC passing, no regression in the moved management tabs, and one demonstrated extension (a hand-written FileClass + `.base` producing a working collection with no plugin change); (2) **4 open questions remain**, all SDD-level (setup-wizard placement, the inventory of other hardcoded field behaviours besides `portrait`, whether a Card declares required fields, how an imported Collection binds to Anvil vs Workbench). Validation also caught and fixed two real defects: a user journey with no matching persona, and `FileClass` used throughout without being defined — the PRD now carries a terms table. |
| 2026-07-27 | **Workflow: PRD-first, research skipped** (user) | The XDD research phase would largely rediscover what the last rounds established — `gap-analysis.md` (25 gaps with code evidence), three ADRs, four mockup rounds, and code verified in-session (`ConsentGate`, `CatalogService`, the fc-files, Bases typings, `schema-gen`). Agent-based research declined; the PRD was written from that material directly. |
| 2026-07-27 | **Three ADRs written before the spec** | ADR-0002 (FileClass-driven editor), ADR-0003 (generated `.base` collections, template resolution, two checksums) join the existing ADR-0001 (Bases integration). They record decisions reached in dialogue, with rejected alternatives and stated risks, so the SDD inherits settled ground rather than re-opening it. |

## Context

**The Codex surface** — the entity browser this plugin has been circling since M4, now defined as one
surface rather than six issues.

### What it covers

| Issue | Gap | In this spec |
|---|---|---|
| **#26** | G24 | The `Anvil` / `Workbench` / `Codex` vocabulary; four `open-*` commands become one Anvil view with a tab switcher |
| **#6** | G6 | The Codex card grid — hero cards over open categories |
| **#12** | G19 | `registerBasesView` Card types (Hero, Table, Compact) selectable in any `.base` |
| **#13** | G20 | User properties reach the editor via the FileClass chain (ADR-0002) |
| **#21** | G5 | The editor pane — docks bottom/right/fullscreen; the "note panel" surface was a phantom |
| **#10** | G1 | Engine coverage: import a `.base`, ship a curated Dataview view, bind to both interfaces |
| **#11** | G2 | The `_forge` note-scoped views as catalog data, with the native renderers kept as fallback |

### Foundations (read before writing anything)

- **`docs/mockups/anvil-workbench-codex.html`** — S91–S103, signed off. The visual specification.
- **`docs/gap-analysis.md`** §1.1 (two invariants), §1.2 (extensibility contract), §1.3 (surface
  taxonomy), §1.4 (add-ons are never requirements), §5 (sequence).
- **ADR-0001** — Bases integration: fence for in-panel, `registerBasesView` for main area, no
  programmatic cell read/write, editing is custom DOM over `processFrontMatter`.
- **ADR-0002** — the editor derives fields, order, types, enum values, sections *and column layout*
  from the FileClass chain; `inspectorFields.ts` is derived away.
- **ADR-0003** — built-in `.base` collections are **generated artifacts**, not consented imports:
  template resolution + source checksum + instance checksum + stored parameters.
- **`DESIGN.md` §2** (surfaces), **`views-and-integration.md`** (Collection/Card, the Codex tab).

### Settled before the spec (do not re-open)

- **Two axes, never one.** *Collection* = what is shown (a query). *Card* = how an entry is drawn.
  The word "view" is retired from the UI.
- **Obligation is per tab, not per interface.** The Codex tab is substitutable; the management tabs
  (Timeline, Plotgrid, Plotlines, Board) are deliberately opinionated and configurable.
- **Selection is by tag**; folders only ever *exclude*, from settings.
- **Add-ons are never required** — native fallback is a hard requirement, not a courtesy.
- **Field types in scope:** `Input`, `Select`, `Multi`, `MultiFile`, `Number`, `File`, `Boolean`,
  `Date`. Out: `Lookup`, `Formula`, `Canvas` — metadata-menu *computes* those, so without it there is
  no engine behind them.

### Known defect to fix here

`CatalogService` materialises a `.base` into the vault **and** persists a copy as `record.source`.
Drift is computed only over the store copy, so editing the vault file raises no drift — yet
`_openCodex` opens exactly that file. ADR-0003 removes the second copy.

---
*This file is managed by the xdd-meta skill.*
