---
type: meta
name: "Continuity-Check — Workflow"
tags: [meta/doc]
---

# Continuity-Check

The reconciliation of a draft scene against the **canon** before it is finalized — it checks contradictions between prose and established facts. It runs via the **`/continuity-check`** skill (located in `../_forge/skills/`, read-only); this document places it in the write flow. The mechanics and check rules are defined in the skill as the source of truth.

> **Read-only:** The check **never** changes prose or canon. It produces a findings list sorted by severity. Fixes are proposed (diff or note in `90 Inbox/`), not written — `30 Canon/`/`40 Timeline/` stay write-zone protected.

## When

Before a scene advances to `status: done` (→ [[Scene-Status]]) — the last step in [[Create-Scene]]. Also any time you want to know whether a draft contradicts established facts. Triggers: `/continuity-check`, "continuity check", "check this scene against canon".

## What goes in and comes out

- **Target:** a scene note in `10 Manuscript/` (or a chapter / a span).
- **Canon:** everything under `30 Canon/` and `40 Timeline/`.
- **Result:** a ranked findings list (blocker / inconsistency / nit) — per finding: the location in the draft, the contradicted canon note, the concrete conflict. No edits.

## What is checked

From the scene's `[[wikilinks]]` and frontmatter (`characters`, `location`, `pov`, `beat`), the linked canon notes are resolved and their facts loaded. At minimum, the check covers:

- **Character behavior** consistent with established `role` / traits / relationships.
- **Physical facts** (appearance, age, names, ownership) match the canon.
- **Timeline:** events do not contradict the order in `40 Timeline/` or earlier scenes.
- **Objects/contracts:** conditions quoted in the prose match the note in `33 Objects/`.
- **Names/aliases** used correctly (no drift, no wrong alias).

**Canon gap instead of contradiction:** If a fact is missing from the canon (rather than being contradicted), it is reported as a *"canon gap"* — **not invented**. A missing detail is a finding, not a fill-in.

## Current limitation

`40 Timeline/` exists as a **relative tag model** (the timeline model in `40 Timeline/README.md`, derived from the `day` fields) — not yet an absolute Calendarium. The time check therefore relies on `day`, `order`, `prev`/`next` and the day↔weekday mapping in `40 Timeline/README.md`.

## After the check

If there are findings: correct the prose on the branch and re-check. If a finding concerns the **canon** (e.g. a fact must be added/changed), do not write directly to `30 Canon/`, but record it as a proposal (diff) or note in `90 Inbox/` — the author maintains the canon.

## Related

- [[Create-Scene]] — the write flow whose last step is this check.
- [[Scene-Status]] — `done` is only set after a passed check.
