---
type: meta
name: "Canon-Entität anlegen — Workflow"
tags: [meta/doc]
---

# Canon-Entität anlegen

Wie eine Figur, ein Ort, ein Objekt oder ein Lore-Eintrag als **kanonische** Notiz in `30 Canon/` entsteht. Canon ist die **einzige Quelle der Wahrheit** je Entität: harte Fakten im Frontmatter (Properties), Prosa im Body. Handlung gehört **nicht** hierher (die steht in Beats/Szenen) — hier stehen Entitäts-Fakten.

> **Write-Zone — read-only.** `30 Canon/` (und `40 Timeline/`) sind schreibgeschützt: **Claude schlägt vor**, der **Autor schreibt**. Eine neue oder geänderte Entität wird als Vorschlag geliefert (Diff oder Notiz in `90 Inbox/`), nicht direkt nach `30 Canon/` geschrieben.

## Vor dem Anlegen

**Existiert die Entität schon?** Ein Prinzip der einzigen Quelle: pro Entität **genau eine** Notiz. Erst suchen (Name, Aliase), bevor eine neue entsteht — sonst droht ein Fakten-Split über zwei Notizen. Gibt es eine, wird sie **ergänzt**, nicht dupliziert.

## Ordner, Tag, FileClass

Der `type`/Tag bestimmt Ordner **und** die automatisch gebundene FileClass (metadata-menu bindet über den Tag):

| Kind | Ordner | `type` | Tag | FileClass |
|---|---|---|---|---|
| Figur | `30 Canon/31 Characters/` | `character` | `canon/character` | `fc-character` (+ `fc-character-fantasy`) |
| Ort | `30 Canon/32 Locations/` | `location` | `canon/location` | — |
| Objekt | `30 Canon/33 Objects/` | `object` | `canon/object` | — |
| Lore | `30 Canon/34 Lore/` | `lore` | `canon/lore` | — |

Ein Templater-Template für Canon gibt es (noch) **nicht** — die Notiz entsteht per Hand oder als Kopie einer bestehenden Geschwister-Notiz, dann Frontmatter anpassen.

## Frontmatter je Kind

**Jede Entität:** `type`, `name`, `aliases`, `series: Forge`, `tags: [canon/<kind>]`, `first_appearance` (Wikilink auf die Szene des ersten Auftritts).

| Kind | Zusätzliche Felder |
|---|---|
| Character | `role`/`status`/`gender` (Enums), `age`, `occupation`, `height`/`build`/`hair`/`eyes`, `distinctive_features` (Array), `nickname`, `tagline`, `portrait`, und die typisierten Relationen `significant_other`/`family`/`friends`/`allies`/`enemies` (je `[[wikilink]]`-Liste) |
| Location | `locationType`, `world`, `region`, `inhabitants` (`[[wikilink]]`-Liste) |
| Object | `owner` (`[[wikilink]]`), `kind` (`contract`\|`artifact`\|`relic`\|`item`) |
| Lore | `scope`, `related` (`[[wikilink]]`-Liste) |

## Body (Prosa)

Unter dem Frontmatter folgt die Prosa in Abschnitten. **Figuren** (der ausführlichste Typ) haben u. a.: Overview, Appearance, Personality, Background, Goals & Motivation, Fears, Strengths, Weaknesses, Habits & Quirks, Relationships, Character Arc, Notes. Im **Appearance**-Abschnitt steht eine **Meta-Bind-/`VIEW[…]`-Statuszeile**, die Größe/Statur/Haare/Augen aus dem Frontmatter zieht — so bleibt die Fakten-Quelle das Frontmatter, der Fließtext nur die Ausformung. Orte/Objekte/Lore sind schlanker (Overview + das, was die Entität braucht).

## Konventionen

- **Saubere Dateinamen:** kein `@`, kein `(Character)`/`(Location)`, **kein** Nummern-Präfix — der Dateiname ist der Entitätsname (z. B. `Michael Ritter.md`).
- **Enum-Werte Englisch** (`role: antagonist`, `status: alive`, `kind: contract`, `gender: male`), **Freitext Deutsch** (`build: athletisch`, `hair: "…"`, `region: "…"`).
- **Relationen sind echte `[[wikilinks]]`** in den Properties (Graph/Backlinks/Rename-sicher), in Anführungszeichen. Wo sinnvoll, beidseitig verlinken (A `friends: [[B]]` ↔ B `friends: [[A]]`).
- Der Vault nutzt **namensbasierte Links** — Verschieben bricht nichts; **Umbenennen** braucht Link-Redirects.

## Ablauf (als Vorschlag)

1. **Prüfen**, ob die Entität schon existiert (Name/Aliase). Falls ja → Ergänzung vorschlagen.
2. **Kind wählen** → Ordner/Tag/FileClass (Tabelle oben).
3. **Frontmatter** befüllen (gemeinsame Felder + kind-spezifische); Enums Englisch, Freitext Deutsch.
4. **Body** schreiben (Abschnitte je Kind; Figur mit Statuszeile im Appearance).
5. **Relationen** als `[[wikilinks]]` setzen, wo möglich beidseitig; `first_appearance` verlinken.
6. **Als Vorschlag liefern** (Diff / `90 Inbox/`) — der **Autor** legt die Notiz in `30 Canon/` an. Fehlt ein Fakt, wird er als *canon gap* markiert, **nicht erfunden**.

## Verwandt

- [[Continuity-Check]] — prüft Szenen gegen genau diese Canon-Fakten (und meldet *canon gaps*).
- [[Szene-Anlegen]] — `characters`/`location`/`pov` einer Szene verweisen auf diese Notizen.
- `00 Meta/CLAUDE.md` — Schema-Referenz und Write-Zone-Regeln.
- [[README]] (`30 Canon`) — Überblick der Canon-Zone.
