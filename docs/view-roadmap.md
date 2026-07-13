# Story Forge — View Roadmap

> Concrete per-view build specs + phasing. **Which views we ship, their layout,
> feature set, and plugin integration now live in `views-and-integration.md`**
> (the authoritative view spec, decided with Marcus). Categories (①–④) and
> rationale live in `storyline-analysis.md`; phasing in `DESIGN.md §5`. Every view
> obeys the guiding principle: **frontmatter is the source of truth; Bases/Dataview
> render it; any write is a plain-Property `processFrontMatter` call, never a
> plugin-owned store.**

## Conventions

- **Scope — "follows the active note":** resolve the active note's outgoing links
  via `metadataCache.getFileCache(active).frontmatterLinks` / `resolvedLinks`,
  then filter to canon entities. This scoping layer is ours; the render is the
  query engine's.
- **Engine:** Dataview (soft-dependency, feature-detected) for v0.1; Bases (core
  ≥ 1.9) added in v0.2 after the embedding spike.
- **Fields** come from the entity schema (see the schema-source decision — the
  view field lists below reference the `_forge` property names).
- **Write-back** is noted per view; absent = read-only.

---

## v0.1 — the note-following core (② Dataview)

The minimum that proves the concept: open a scene, see its entities and facts.

### V1 · Characters-in-scene
- **Trigger:** active note (typically a `manuscript/scene`) → resolve its
  `pov` + `characters` links to `canon/character` notes.
- **Show:** `name`, `role`, `status`, `tagline`, `portrait`; secondary
  `occupation`, `age`. POV character flagged.
- **Engine:** metadataCache scoping → Dataview render (DQL list or DataviewJS
  card). Fallback: native render if Dataview absent.
- **Write-back:** none (v0.1 is read-only).

### V2 · Locations-in-scene
- **Trigger:** active note `location` (+ each location's `inhabitants`) →
  `canon/location`.
- **Show:** `name`, `locationType`, `region`, `world` (as a hierarchy
  breadcrumb via the `world` chain), `inhabitants`.
- **Engine/Write-back:** as V1 / none.

### V3 · Scene-details
- **Trigger:** the active scene note's own frontmatter.
- **Show:** `title`, `status`, `pov`, `characters`, `location`, `plotlines`,
  `order`, `book` — compact fact panel with resolved links.
- **Engine/Write-back:** scoped single-note read / none.

**Exit criteria:** all three render in the sidebar `ItemView`, follow the active
note, and degrade gracefully when Dataview is missing.

---

## v0.2 — Bases engine + cheap overviews (④) + the spike

### S0 · Bases embedding + inline-edit spike *(gate)*
- Confirm a `.base` can render into our container (stable API?), fallback to a
  ` ```base ` block via `MarkdownRenderer`.
- **Confirm whether the Core Bases table edits property values inline** (writes
  straight to frontmatter). **This decides how much of the Inspector is ③ vs a
  ②-embed.**

### V4–V8 · Overview `.base` catalog views (④, no code)
Global (not note-scoped) catalog entries:
- **Characters** — `canon/character`: `name`, `role`, `status`, `tagline`.
- **Locations** — `canon/location`: table grouped by `locationType`; `world`, `region`.
- **Objects** — `canon/object`: `name`, `kind`, `owner`.
- **Lore** — `canon/lore`: `name`, `scope`, `related`.
- **Scenes** — `manuscript/scene`: `order`, `status`, `pov`, `location` (sorted by `order`).

### V9 · Timeline (linear) — ②/④
- Scenes sorted by `order` (then `act`/`chapter`), grouped by `act`.
- `.base` grouped view, or DQL list; no spatial layout yet.

### V10 · Plotlines (list) — ②
- Group scenes by `plotlines` membership; collapsible per plotline; unassigned
  bucket. Declarative grouping.

**Exit criteria:** Bases adapter live; overview views installable from the
catalog; spike verdict recorded → Inspector strategy chosen.

---

## Later — standalone views (③), some seeded by ports (①)

The confirmed set (see `views-and-integration.md` for layout/features), ordered by
value once the library + both surfaces exist:

1. **Kanban** — scenes in `status` columns; **drag → write `status`/`order`**.
2. **Plotgrid** — plotline × scene matrix; toggle cell → write `plotlines`.
3. **Timeline** — needs the scene time model (`storyDay` + `when`; `storyDate`
   via Calendarium optional/later, two-calendar-aware).
4. **Locations — hierarchical tree** (nest over the `world` chain).
5. **Plotlines — subway map** (the list variant is already ② in v0.2).

**Story graph:** use the **core Obsidian graph** (tag colour-groups + canon
filter) as the MVP — no code. A custom force-directed graph (port `StoryGraph.ts`)
is a low-priority later, only if typed/coloured edges are wanted.

**Dropped:** corkboard, manuscript view (Longform owns it), stats/analytics, and
plot-holes/warnings (→ `claude-skills.md`).

**Custom Inspector** — only if the S0 spike shows Bases inline-edit is
insufficient; else it stays a ②-embed.

**Sequencing rule:** ② and ④ first (cheapest, prove the flexible substrate);
the S0 spike decides how much ③ we actually owe.
