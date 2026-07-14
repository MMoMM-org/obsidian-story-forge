---
type: meta
name: "Git & backup flow — Workflow"
tags: [meta/doc]
---

# Git & backup flow

Two **git** mechanisms run side by side in the vault: automatic **backup** via the obsidian-git plugin, and manual **work** on `claude/<slug>` branches. They share **one** worktree and **one** HEAD — which is why it matters to know how they get along.

| | Backup (obsidian-git) | Work (branch) |
|---|---|---|
| Trigger | automatic, timed (interval per machine; **0 = off**) | deliberate, by Claude/author |
| Scope | **all** changes (not just staged) | **precisely** staged paths |
| Commit message | `vault: <YYYY-MM-DD HH:mm:ss>` | descriptive (`docs(vault): …`) |
| Branch | the **currently checked-out** one | `claude/<slug>` |
| Remote | none — push disabled, purely local | ditto |

## Backup — obsidian-git

The plugin commits at a timed interval (`autoSaveInterval`, minutes — **per-machine**, because `.obsidian/` is gitignored) **the complete** worktree state under the message `vault: <timestamp>` on the currently checked-out branch. **Push is disabled** (`disablePush`), there is **no remote** — the content is private, everything stays local. These `vault: …` commits are the safety timestamp, not the substantive history. **`autoSaveInterval: 0` turns the timer off entirely** (then only manual "commit-and-sync" snapshots remain) — the simplest mitigation against the WIP sweeping below.

## Work — branches

Claude works on `claude/<slug>` branches, **never on `main`**, stages the affected paths **precisely** (never a blind `git add -A`) and writes descriptive commits. The **author merges** to `main`. This keeps Claude's diff cleanly separated from the author's prose flow and reviewable.

## The shared worktree — the one trap

Obsidian and Claude see the **same** checkout. Two consequences:

- **A branch switch applies to both.** If Claude checks out `claude/<slug>`, Obsidian is on that branch too — and the next auto-backup commit lands there, not on `main`.
- **Auto-backup sweeps in-progress work along.** Because the plugin commits *everything* (`autoCommitOnlyStaged: false`), a timer tick in the middle of a still-open change by Claude or in unsaved Obsidian edits can create a `vault: …` commit and thereby preempt or blend into Claude's planned, clean commit.

**Safeguards:**

- For Claude sessions, **turn off** the timed auto-backup (`autoSaveInterval: 0`) or close Obsidian; commit Claude's changes promptly and precisely. (If it happens anyway: `git reset <main>` + re-commit cleanly — the tree hash stays identical, so it's lossless.)
- After the session, check `git log --oneline` — if `vault: …` commits appeared on the `claude/` branch, they need sorting during the merge/rebase (or the author merges deliberately, including them).
- Always stage with **precise paths** — then it doesn't matter what else sits in the worktree.

## What is versioned — and what is not

Ignored (`.gitignore`), because per-machine/regenerable, **not** story content:

- `.obsidian/` — plugin configuration & binaries (incl. `longform/data.json`, which churns when selecting a draft).
- `.smart-env/` — Smart Connections embedding cache.
- `.trash/`, `.DS_Store`.

**Versioned** remains the actual infrastructure in `00 Meta/` (templates, FileClasses, Bases, dataview views, CLAUDE.md) as well as all notes. Note: `.obsidian/` changes do **not** show up in the diff — the older note "the repo also tracks `.obsidian/`" is outdated; today the reason for precise staging is the **separation of Claude's edits and the author's prose**, not `.obsidian` churn.

## Restoring

Purely local, no remote — restoration runs via the git history (`git log`, `git checkout <commit> -- <path>`) or the obsidian-git history view. The dense `vault: …` timestamps allow fine-grained rollback.

## Related

- [[Create-Scene]], [[Create-New-Book]] — each names the branch/staging discipline.
- `00 Meta/CLAUDE.md` — the vault rules (write-zones, `claude/<slug>` branches, author merges).
