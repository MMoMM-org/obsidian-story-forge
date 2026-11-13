# ADR-0003 — Generated `.base` collections: template resolution and two checksums

- **Status:** Accepted
- **Date:** 2026-07-27
- **Milestone:** the Codex surface spec (epic #9; issues #10, #14, #27)
- **Revises:** the single-checksum consent model (M4) for **bases** records only
- **Mockups:** `docs/mockups/anvil-workbench-codex.html` S98, S101 (signed off)
- **Amended 2026-11-13 (spec 008 T7.3, reduced):** settings-driven regeneration is **deferred**, not built;
  curated `.base` files install **verbatim** with no `generated` block (and `Codex.base` is retired).

## Context

Two settings must reach a Bases query: **the tag** a collection selects on, and **the folders it
excludes** (templates, meta). Today `Codex.base` hardcodes the opposite — `file.inFolder("30 Canon")`,
an *include* — which forces the vault layout (`gap-analysis.md` G4) and cannot follow settings.

**A vault file is unavoidable.** Rendering through the normal Bases renderer requires a real `.base`
in the vault: `MarkdownRenderer` needs a source path, and `registerBasesView` is instantiated by the
Bases runtime inside a user's file. So the artifact must exist on disk and be writable by us.

**The collision.** The M4 consent model checksums a view's source and re-verifies it on **every**
evaluate (`ConsentGate.evaluate` — "fresh read on every evaluate", fail-closed). For bases records
the YAML is stored in `record.source` inside `data.json` and checksummed there
(`_evaluateBasesRecord`). Rewriting that YAML to inject settings therefore produces **permanent
drift**: every settings change would demand re-consent, on every render. Regex-patching the file has
the same effect, plus the fragility of pattern-matching YAML.

**A second defect, found while tracing this.** `CatalogService` **materialises** the YAML into
`curatedBasesFolder` *and* persists the same YAML as `record.source`. Two copies. Drift is computed
only over the store copy, so editing `00 Meta/Bases/Codex.base` in the vault raises **no** drift —
yet `_openCodex` opens exactly that file. For the Anvil path the checksum guards the wrong artifact.

**The categorical error underneath.** Our own generated defaults were modelled as *consented
imports*. Those are different things: a consented import contains content we do not author, and its
checksum catches changes the user did not sanction. A generated artifact is produced
deterministically from our schema and the user's own settings — checksumming it asks the user to
re-consent to their own input. The repo already has the right precedent: **FileClasses**, written
into the vault by `schema:gen`, regenerated freely, never checksum-gated.

## Decision

**One artifact, two checksums, and the parameters that produced it.**

1. **Import** — verify the catalog/user source against its **source checksum** (unchanged from M4).
2. **Resolve** the source as a **template**, substituting the settings parameters (tag, excluded
   folders, scope). **Never regex-patch a resolved file** — always re-render the whole artifact from
   the template, so the result is deterministic and diffable.
3. **Write** the resolved artifact into the configured folder (setting, default `00 Meta/Bases`).
4. **Compute an instance checksum** over the written file and store it, together with the
   **parameters** used to resolve it.
5. **Verify the instance** against the file on disk. Divergence is interpreted using the parameters:

   | Source checksum | Params | Instance checksum | Meaning | Action |
   |---|---|---|---|---|
   | same | same | same | nothing happened | — |
   | same | **changed** | same | **we** caused it | regenerate silently, store the new instance checksum |
   | same | any | **differs** | a foreign hand edited the file | ask the user; offer regenerate |
   | **differs** | — | — | upstream changed | re-consent, then regenerate |

   > **Revised 2026-11-02.** A settings change does not touch the file, so row 2's instance
   > checksum is *same*, not *differs* as first written. A hand edit now outranks a params change:
   > when both happened the state is `ask`, because silently overwriting the edit is unrecoverable.

6. **The store keeps no YAML copy.** Per collection it holds `{ sourceChecksum, params,
   instanceChecksum }`; the vault file is the artifact. This removes the double-copy divergence.
7. **Instance verification is switchable off per collection**, not globally — the corner case is one
   hand-tuned base, not a blanket opt-out. Its meaning is deliberately stronger than "stop checking":
   **the file becomes the user's**. We stop verifying *and* stop regenerating it; the generated
   artifact becomes a user-owned collection.

*Point 5's parameter store is an addition made while recording this ADR. Without it, "the user
changed a setting" and "someone edited the file" are indistinguishable — both surface only as an
instance-checksum mismatch.*

## Consequences

- **Settings become usable.** Changing the tag or the excluded folders re-renders the artifact and
  updates its instance checksum in the same operation — no drift, no prompt, no re-consent. This is
  what unblocks S98 and issue #14.
- **The consent gate keeps its real job.** Checksum and consent still guard content we did not author
  — imported views, repo-curated entries, DataviewJS. Their value is undiminished; they simply stop
  policing the user's own settings.
  An **imported `.base`** is the user's own file, not one we generated: it is exempt from consent
  and drift and is read as it is on every render (spec 008 T7.2; see the phase-7 decision).
- **`Codex.base`'s include-by-folder filter is removed**, replaced by tag selection plus generated
  `not: [file.inFolder(…)]` exclusions. Bases supports negation natively
  (`BasesConfigFileFilter.not`, `obsidian.d.ts:600`, since 1.10.0).
- **Editing our generated base is no longer a conflict someone loses.** It is a transition: switch
  verification off and the file is yours. This follows "curated views are a default, not a fixture"
  to its conclusion.
- **A template format is required** — placeholders for tag, exclusions and scope, plus a renderer.
  Small, but new surface that must be specified and tested, including empty parameters and quoting of
  folder names containing spaces.
- **Migration:** existing installs hold a `bases` ViewRecord with `source` = YAML and a single
  `okayed.checksum`. They must be converted to the new record shape, or dropped and re-installed from
  the catalog.
  > **Revised 2026-08-02 — no migration ships.** This consequence was discharged by *not* needing it.
  > Spec 008's T3.2 built the conversion, reviewed it twice, then reverted it (`1759be7`) once it was
  > confirmed that **no such record exists in any vault**: the only install is the test vault, whose
  > `data.json` holds two Dataview imports and no `bases` record at all. `CatalogService` now persists
  > the new shape at install time (T3.3), so there is nothing to convert *from*. If a pre-ADR-0003
  > install is ever discovered, "dropped and re-installed from the catalog" is the remaining option.
  > See spec 008's decision log, 2026-08-02.
- **The instance check costs a file read per evaluate.** Acceptable at Codex scale; compare `mtime`
  first if it ever is not.

## Alternatives considered

- **Regex-patch the `.base` on settings change** → rejected: trips the drift gate on every change,
  and pattern-matching YAML breaks on comments, quoting and nesting.
- **Filter the excluded folders at render time inside our registered view type** → rejected: it hides
  notes from a query the user can read, and diverges from what Bases reports outside our container.
  Exclusion belongs in the query.
- **Drop `.base` files for built-in collections and query natively** → rejected: it would work for
  our defaults, but a user's own `.base` could then not be hosted in the Codex without us
  implementing a Bases query interpreter. The signed-off S97 substitutability depends on Bases
  running the query.
- **Keep one checksum and exempt bases records from drift** → rejected: it would also stop detecting
  genuine tampering with a file that sits in the vault — the one place a user *can* break it.

## References

- `src/consent/ConsentGate.ts` — `evaluate` decision order, `_evaluateBasesRecord`
- `src/catalog/CatalogService.ts` — VERIFY → MATERIALISE → PERSIST, `_materialise`
- `src/consent/checksum.ts` — byte-exact SHA-256, `sha256:<hex>`
- `obsidian.d.ts:583-600` — `BasesConfigFileFilter` with `and` / `or` / `not`
- `scripts/schema-gen.mjs` — the generated-artifact precedent (write-only, no delete path)
- `docs/gap-analysis.md` G4 (scope settings), G25/#27 (shipping vault artifacts)
