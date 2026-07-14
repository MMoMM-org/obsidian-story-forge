---
type: meta
name: "Git- & Backup-Flow — Workflow"
tags: [meta/doc]
---

# Git- & Backup-Flow

Im Vault laufen **zwei** Git-Mechanismen nebeneinander: das automatische **Backup** durch das obsidian-git-Plugin und die manuelle **Arbeit** auf `claude/<slug>`-Branches. Sie teilen sich **einen** Arbeitsbaum und **einen** HEAD — deshalb ist es wichtig zu wissen, wie sie sich vertragen.

| | Backup (obsidian-git) | Arbeit (Branch) |
|---|---|---|
| Auslöser | automatisch, getaktet (Intervall pro Maschine; **0 = aus**) | bewusst, durch Claude/Autor |
| Umfang | **alle** Änderungen (nicht nur gestaged) | **präzise** gestagte Pfade |
| Commit-Message | `vault: <YYYY-MM-DD HH:mm:ss>` | sprechend (`docs(vault): …`) |
| Branch | der **gerade ausgecheckte** | `claude/<slug>` |
| Remote | keiner — Push deaktiviert, rein lokal | dito |

## Backup — obsidian-git

Das Plugin committet in einem getakteten Intervall (`autoSaveInterval`, Minuten — **per-Maschine**, weil `.obsidian/` gitignored ist) **den kompletten** Arbeitsbaum-Stand unter der Message `vault: <Zeitstempel>` auf den aktuell ausgecheckten Branch. **Push ist deaktiviert** (`disablePush`), es gibt **kein Remote** — der Inhalt ist privat, alles bleibt lokal. Diese `vault: …`-Commits sind der Sicherheits-Zeitstempel, nicht die inhaltliche Historie. **`autoSaveInterval: 0` schaltet den Timer ganz ab** (dann nur noch manuelle „Commit-and-sync"-Snapshots) — die einfachste Mitigation gegen das WIP-Sweeping unten.

## Arbeit — Branches

Claude arbeitet auf `claude/<slug>`-Branches, **nie auf `main`**, staged **präzise** die betroffenen Pfade (nie blind `git add -A`) und schreibt sprechende Commits. Der **Autor merged** nach `main`. So bleibt Claudes Diff sauber vom Prosa-Fluss des Autors getrennt und reviewbar.

## Der geteilte Arbeitsbaum — die eine Falle

Obsidian und Claude sehen **denselben** Checkout. Zwei Konsequenzen:

- **Branch-Wechsel gilt für beide.** Checkt Claude `claude/<slug>` aus, ist auch Obsidian auf diesem Branch — und der nächste Auto-Backup-Commit landet dort, nicht auf `main`.
- **Auto-Backup fegt In-Progress-Arbeit mit ein.** Weil das Plugin *alles* committet (`autoCommitOnlyStaged: false`), kann ein Timer-Tick mitten in einer noch offenen Änderung von Claude oder in ungespeicherten Obsidian-Edits einen `vault: …`-Commit setzen und so Claudes geplanten, sauberen Commit vorwegnehmen oder vermischen.

**Absicherung:**

- Für Claude-Sessions das getaktete Auto-Backup **abschalten** (`autoSaveInterval: 0`) oder Obsidian schließen; Claudes Änderungen zügig präzise committen. (Passiert es doch: `git reset <main>` + sauber neu committen — der Baum-Hash bleibt identisch, also verlustfrei.)
- Nach der Session prüfen: `git log --oneline` — sind `vault: …`-Commits auf dem `claude/`-Branch entstanden, gehören sie beim Merge/Rebase einsortiert (oder der Autor merged bewusst inklusive).
- Immer mit **präzisen Pfaden** stagen — dann ist egal, was sonst noch im Arbeitsbaum liegt.

## Was versioniert wird — und was nicht

Ignoriert (`.gitignore`), weil per-Maschine/regenerierbar, **kein** Story-Inhalt:

- `.obsidian/` — Plugin-Konfiguration & Binaries (inkl. `longform/data.json`, der beim Draft-Wählen churnt).
- `.smart-env/` — Smart-Connections-Embedding-Cache.
- `.trash/`, `.DS_Store`.

**Versioniert** bleibt die eigentliche Infrastruktur in `00 Meta/` (Templates, FileClasses, Bases, dataview-views, CLAUDE.md) sowie alle Notizen. Merke: `.obsidian/`-Änderungen tauchen **nicht** im Diff auf — der ältere Hinweis „der Repo trackt auch `.obsidian/`" ist überholt; der Grund für präzises Staging ist heute die **Trennung von Claudes Edits und der Autoren-Prosa**, nicht `.obsidian`-Churn.

## Wiederherstellen

Rein lokal, kein Remote — Wiederherstellung läuft über die Git-Historie (`git log`, `git checkout <commit> -- <pfad>`) bzw. die obsidian-git-Historienansicht. Die dichten `vault: …`-Zeitstempel erlauben ein feinkörniges Zurückgehen.

## Verwandt

- [[Szene-Anlegen]], [[Neues-Buch-Anlegen]] — nennen jeweils die Branch-/Staging-Disziplin.
- `00 Meta/CLAUDE.md` — die Vault-Regeln (Write-Zones, `claude/<slug>`-Branches, Autor merged).
