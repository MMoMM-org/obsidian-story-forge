---
title: "Phase 2: Scope seam + pure derivations"
status: done
version: "2.0"
phase: 2
---

# Phase 2: Scope seam + pure derivations

## Phase Context

**GATE**: Read all referenced files before starting this phase.

**Specification References**:
- `[ref: SDD/Interface Specifications; workspaceScope.ts, workspaceModel.ts]`
- `[ref: SDD/ADR-1, ADR-4, ADR-11, ADR-12]`
- `[ref: PRD/F0, F3]`
- `src/scoping/{ScopingService,NoteContext}.ts` (neighbouring scope logic; `activeKind`)
- `schema/scene.json` (`book`, `plotlines`, `beat`, `location`, `characters`, `wordcount`, `status`)

**Key Decisions**:
- ADR-4: a pure, testable helper deriving `{book|plotline|none}` + in-scope scene `TFile[]` from the
  active note, reading `metadataCache` (ADR-1). Include scenes by tag/type; exclude
  `DEFAULT_EXCLUDED_FOLDERS = ["00 Meta"]` (structure-agnostic, CON-7).
- ADR-11: `actLabel(act, scenes)` = `Act N · <beat alias>` when the act's scenes share one beat,
  else `Act N`. No schema change (`beat` already on `scene`; verified 1:1 act↔beat in the _forge vault).
- ADR-12: `plotlineColor(name)` = deterministic hash → fixed palette (Navigator dots, Timeline nodes).

**Dependencies**: Phase 1 shipped `timelineModel`/`plotlineModel`; this phase adds the scope seam
and the pure derivations they and the renderers consume. Independent of Phases 3–5.

---

## Tasks

- [ ] **T2.1 resolveWorkspaceScope** `[activity: domain-modeling]` `[ref: SDD/ADR-4; PRD/F3]`

  1. Prime: Read `NoteContext.activeKind` + how scenes reference `book`/`plotlines`; the M3 resolve
     pattern `[ref: src/scoping/ScopingService.ts]`.
  2. Test (RED): active note is a **book** → `{kind:"book", ref}` + all scenes whose `book` links ref;
     a **plotline** → `{kind:"plotline", ref}` + scenes linking it; a **scene** → scope to that
     scene's `book`; a character/other/null → `{kind:"none"}` + whole-vault book scenes; unresolved /
     `[[ ]]`-wrapped links tolerated; never throws. **Scenes included by tag/type; notes in
     `DEFAULT_EXCLUDED_FOLDERS` excluded** (so the `scene.md` template is never surfaced).
  3. Implement (GREEN): Create `src/scoping/workspaceScope.ts` — `WorkspaceScope`, `ResolvedScope`,
     `DEFAULT_EXCLUDED_FOLDERS`, `resolveWorkspaceScope(app, activeFile)` using `metadataCache`
     (`getFileCache`, `getFirstLinkpathDest`, `resolvedLinks`).
  4. Validate: `test/scoping/workspaceScope.test.ts` green with a mocked `app`/`metadataCache`; lint; types.
  5. Success:
     - [ ] Book/plotline/scene active notes yield the correct scene set `[ref: PRD/AC-T7, AC-P6]`
     - [ ] No-scope note falls back to whole-vault books, never throws `[ref: PRD/AC F3-4]`

- [ ] **T2.2 SceneRow extension + actLabel / plotlineColor / statusTally** `[activity: domain-modeling]` `[parallel: true]` `[ref: SDD/ADR-11, ADR-12; PRD/F1]`

  1. Prime: Re-read the P1 `SceneRow`/`Group` + the `actLabel` example `[ref: SDD/Implementation Examples]`;
     confirm `beat`/`location`/`characters`/`wordcount` names against `schema/scene.json`; the beat-note
     `aliases`/`title` shape (`temp/lauren` `201 🎬 …` notes — reference only, never committed).
  2. Test (RED):
     - `SceneRow` mapping now carries `beat`, `beatName`, `location`, `characters[]`, `wordcount`
       (a `mapSceneRow(app, file)` reads + resolves these; missing → `""`/`[]`/`null`).
     - `actLabel(act, scenes)`: all scenes share one beat → `Act N · <alias>`; mixed/empty beats →
       `Act N`; `act === null` → `No act`.
     - `plotlineColor(name)`: deterministic (same name → same color across calls); distinct sample
       names spread across the palette; stable and side-effect-free.
     - `statusTally(rows)`: counts by `status`, tolerates `""`.
  3. Implement (GREEN): extend `SceneRow` + add `mapSceneRow`, `actLabel`, `plotlineColor`,
     `statusTally` to `src/workspace/workspaceModel.ts`; wire `actLabel` into `timelineModel` act-group
     labels. Beat name prefers `aliases[0]`, else title stripped of the leading emoji.
  4. Validate: extend `test/workspace/workspaceModel.test.ts`; green; lint; types.
  5. Success:
     - [ ] Act divider shows the beat name when shared, else `Act N` `[ref: PRD/AC-T? act label; SDD/ADR-11]`
     - [ ] Plotline colors are stable + deterministic; status tally correct `[ref: SDD/ADR-12]`

- [ ] **T2.3 Phase Validation** `[activity: validate]`

  Run Phase 2 tests; verify scope derivation (book/plotline/scene/none) + all pure derivations.
  Lint + typecheck (src + test + mock). Verify against SDD ADR-4/-11/-12 and PRD F1/F3.
