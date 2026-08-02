/**
 * CatalogService — T4.4 curated-catalog install, verify, materialise, persist.
 * Record shape reworked at T3.3 to close the double-copy defect (ADR-35).
 *
 * The CatalogIndex is provided via constructor injection (never read from dist/
 * at runtime) so this service is fully testable without build artifacts.
 *
 * Install order (SDD Runtime View — curated-install algorithm):
 *   1. VERIFY      — computeChecksum(entry.source) vs entry.checksum; fail-closed
 *                    on mismatch (nothing written, reason surfaced).
 *   2. MATERIALISE — write raw .base YAML into curatedBasesFolder,
 *                    normalizePath'd; create folder on demand. The vault file is
 *                    the single copy of the YAML.
 *   3. PERSIST     — store.setRecord with engine:"bases", kind:"collection",
 *                    source:<vault path — NOT the YAML>, provenance:"curated",
 *                    okayed:{checksum}, and a `generated` block (ADR-35) carrying
 *                    the two-checksum bookkeeping `classify()`
 *                    (src/library/baseGenerator.ts) needs to tell "clean" apart
 *                    from "a foreign hand edited the file".
 *   If PERSIST fails after MATERIALISE, the orphaned .base file is removed so
 *   no partial state is left. install() NEVER throws — always returns InstallResult.
 *
 * Why the record no longer stores the YAML (ADR-35, closes the double-copy defect):
 *   Storing `record.source` as a second copy of the YAML meant drift detection
 *   (ConsentGate._evaluateBasesRecord) checksummed the STORE's copy while
 *   `_openCodex` opened the VAULT file — editing the rendered file was invisible.
 *   The vault file is now the single artifact; `record.source` is its path, and
 *   `record.generated.instanceChecksum` is the checksum of the bytes actually
 *   written, so classify() can detect a hand-edit against what is really on disk.
 *
 * Known gap this leaves open (ADR-35 — not this task's to close): ConsentGate
 * already reads `record.generated` for a collection record and no longer
 * assumes `source` is YAML (src/consent/ConsentGate.ts:124). BasesFenceEngine
 * (src/engines/BasesFenceEngine.ts) has NOT been updated to match — it still
 * treats `record.source` as raw .base YAML, which is only true for
 * kind:"view". Engine dispatch (SidebarView → EngineRegistry.get(view.engine))
 * branches on `engine` only, never on `kind`, so nothing prevents a
 * kind:"collection" record reaching that renderer. Unreachable today (zero
 * catalog entries ship; F7's surface-binding UI does not exist), but must be
 * closed before a collection record is bound to a surface (PRD F7).
 *
 * Why bases entries bypass importToStore (ADR-5):
 *   ViewDefinition.engine is typed "dataview-dql"|"dataviewjs" — "bases" is not
 *   in the union. Routing through toRecord() would either (a) require lying about
 *   the engine or (b) require touching src/import/* in a way that risks T4.3
 *   regressions. Writing directly is the minimal, correct path.
 *
 * The catalog only emits engine:"bases" today. An exhaustive guard ensures a
 * future non-bases CatalogEntry variant fails to compile until handled.
 *
 * Out of scope here (see plan/phase-3.md T3.3 / T7.3): `renderBase`'s output
 * shape and wiring `sourceChecksum` to a real template producer — the catalog
 * entry's own checksum is stored honestly instead, and `classify()`'s
 * `reconsent` branch stays inert until T7.3.
 *
 * HAZARD this leaves open (see the constructor's `collectionParams` deps and
 * main.ts's placeholder): curated entries are written VERBATIM by
 * `_materialise` — `renderBase` is never invoked to produce them — so
 * `generated.params` on a curated record does NOT describe the bytes on disk.
 * It is bookkeeping for a future render, not a description of the past write.
 * `classify()` (src/library/baseGenerator.ts) checks params BEFORE the
 * instance checksum, so once the injected params change (T3.5 wires real
 * settings-backed values in place of today's placeholder), every
 * already-installed record classifies "regenerate" instead of "ask" — a
 * hand-edited file gets silently overwritten. T3.5 must reconcile
 * already-installed records' `generated.params` when it introduces real
 * values, not merely swap the injection site. See the
 * "[HAZARD]" test in test/catalog/CatalogService.test.ts, which pins today's
 * (undesirable) behaviour so a future change to it is deliberate, not silent.
 *
 * @ref PRD/AC-F4.5 (fail-closed on mismatch)
 * @ref PRD/AC-F4.6 (surfaced via existing view surfaces)
 * @ref PRD/AC-F4.7 (offline — zero network on any path, CON-9)
 * @ref SDD/ADR-35 (single artifact copy; record.source is a vault path)
 * @ref SDD/Known Technical Issues (the double-copy defect this closes)
 */

import { normalizePath } from "obsidian";
import type { App } from "obsidian";
import { computeChecksum } from "consent/checksum";
import type { CollectionParams } from "library/baseGenerator";
import type { ViewStore } from "store/ViewStore";
import type { ViewRecord } from "store/types";
import type { ConsentGate } from "consent/ConsentGate";
import type { CatalogEntry, CatalogIndex } from "catalog/catalogTypes";

// ---------------------------------------------------------------------------
// Public result type
// ---------------------------------------------------------------------------

export type InstallResult =
	| { ok: true; path?: string }
	| { ok: false; reason: string };

// ---------------------------------------------------------------------------
// Deps interface
// ---------------------------------------------------------------------------

export interface CatalogServiceDeps {
	app: App;
	gate: ConsentGate;
	store: ViewStore;
	/** Vault folder where curated .base files are materialised. Default "00 Meta/Bases". */
	curatedBasesFolder: string;
	/**
	 * The params a freshly-installed collection is recorded as rendered with
	 * (ADR-0003 `generated.params`). NOT read from settings here — `excludedFolders`
	 * does not exist on `PluginSettings` yet (T3.5 adds it); the construction site
	 * injects a placeholder until then. CatalogService does not call `renderBase`
	 * with these — it only stores them for `classify()` to compare against later.
	 */
	collectionParams: CollectionParams;
}

// ---------------------------------------------------------------------------
// CatalogService
// ---------------------------------------------------------------------------

/**
 * Stateless service for browsing and installing curated catalog entries.
 *
 * The index is injected at construction time (from the bundled asset or a test
 * fixture) — never fetched from the network and never read from dist/ at runtime.
 */
export class CatalogService {
	private readonly index: CatalogIndex;
	private readonly deps: CatalogServiceDeps;

	constructor(index: CatalogIndex, deps: CatalogServiceDeps) {
		this.index = index;
		this.deps = deps;
	}

	/** Return all entries from the injected index. */
	getEntries(): CatalogEntry[] {
		return this.index.entries;
	}

	/**
	 * Install a catalog entry by id.
	 *
	 * Follows the curated-install algorithm (SDD Runtime View):
	 * VERIFY → MATERIALISE → PERSIST.
	 *
	 * Never throws — always returns InstallResult. If PERSIST fails after
	 * MATERIALISE, the orphaned .base file is removed to avoid partial state.
	 */
	async install(id: string): Promise<InstallResult> {
		const entry = this.index.entries.find((e) => e.id === id);
		if (!entry) {
			return { ok: false, reason: `not-found: no catalog entry with id "${id}"` };
		}

		if (entry.engine === "bases") {
			return this._installBasesEntry(entry);
		}

		// Exhaustive guard: a future non-bases CatalogEntry variant must be handled
		// here before it reaches production. This will fail to compile until done.
		const _exhaustive: never = entry.engine;
		return { ok: false, reason: `unsupported engine: ${String(_exhaustive)}` };
	}

	// ---------------------------------------------------------------------------
	// Private — bases install path
	// ---------------------------------------------------------------------------

	/**
	 * Install a bases entry atomically:
	 *   duplicate-check → materialise .base file → persist ViewRecord.
	 *
	 * Atomic guarantee: if store.setRecord throws after the .base file was written,
	 * the orphaned file is removed (best-effort rollback) so no partial state remains.
	 *
	 * Duplicate detection matches on rec.catalogId === entry.id — the stable slug,
	 * mirroring BrowseOfficialModal's own installed-record lookup (which pairs the
	 * same catalogId match with an okayed.checksum comparison to tell "up to date"
	 * apart from "update available" — F7). The paired checksum comparison is what
	 * keeps BrowseOfficialModal's "Update" affordance working: it also calls
	 * install() on the same entry.id, and a stale record (okayed.checksum !==
	 * entry.checksum) must fall through to a fresh install rather than being
	 * reported as an already-installed duplicate. Records persisted before
	 * catalogId existed (pre-T4.5) have none; for those we fall back to the
	 * legacy source === source comparison.
	 */
	private async _installBasesEntry(entry: CatalogEntry): Promise<InstallResult> {
		// 1. VERIFY checksum before any side effect.
		const computed = await computeChecksum(entry.source);
		if (computed !== entry.checksum) {
			return {
				ok: false,
				reason: `checksum mismatch: expected ${entry.checksum}, got ${computed}`,
			};
		}

		// 2. Duplicate check: same catalog entry, at the same checksum, already
		// installed → up-to-date. Match by catalogId when the record has one
		// (also requiring the stored checksum to match entry.checksum, so a
		// stale record falls through to a fresh install instead of being
		// reported as a duplicate); fall back to source equality only for
		// pre-T4.5 records that predate catalogId.
		try {
			const existing = await this.deps.store.getViews();
			for (const rec of Object.values(existing)) {
				const isDuplicate =
					rec.catalogId !== undefined
						? rec.catalogId === entry.id && rec.okayed?.checksum === entry.checksum
						: rec.source === entry.source;
				if (isDuplicate) {
					return { ok: false, reason: "up-to-date: already installed" };
				}
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			return { ok: false, reason: `store read failed: ${msg}` };
		}

		// 3. MATERIALISE: write the .base YAML file into the vault folder.
		let writtenPath: string;
		try {
			writtenPath = await this._materialise(entry);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			return { ok: false, reason: `materialise failed: ${msg}` };
		}

		// 4. PERSIST: write ViewRecord (ADR-35 shape). On failure, remove the
		// orphaned .base file.
		//
		// instanceChecksum is the checksum of the bytes actually written to
		// writtenPath — NOT a re-read or re-serialisation. _materialise writes
		// entry.source verbatim, and `computed` (from VERIFY, above) is already
		// computeChecksum(entry.source) — the same bytes — so it doubles as the
		// checksum of what landed on disk.
		const instanceChecksum = computed;
		const record: ViewRecord = {
			provenance: "curated",
			enabled: true,
			okayed: { version: 1, checksum: computed },
			// ADR-35: source is the vault PATH, not the YAML — the vault file is
			// the single copy (closes the double-copy defect).
			source: writtenPath,
			engine: "bases",
			command: false,
			commandName: entry.name,
			kind: "collection",
			surfaces: { anvil: false, workbench: false },
			// catalogId is the stable entry slug — never changes for an existing entry,
			// survives catalog renames. Used by BrowseOfficialModal for update detection.
			catalogId: entry.id,
			generated: {
				// The catalog entry's own checksum — honest until T7.3 wires a real
				// template producer; the `reconsent` classify() branch stays inert
				// until then (see class docstring).
				sourceChecksum: entry.checksum,
				params: {
					tag: this.deps.collectionParams.tag,
					excludedFolders: [...this.deps.collectionParams.excludedFolders],
				},
				instanceChecksum,
				filePath: writtenPath,
				verify: true,
			},
			...(entry.description !== undefined ? { description: entry.description } : {}),
		};

		try {
			const newId = crypto.randomUUID();
			await this.deps.store.setRecord(newId, record);
		} catch (err) {
			// Roll back the orphaned .base file so no partial state is left.
			try {
				await this.deps.app.vault.adapter.remove(writtenPath);
			} catch {
				// Best-effort rollback: log and continue — don't mask the original error.
				console.debug("[StoryForge] CatalogService: rollback remove failed", writtenPath);
			}
			const msg = err instanceof Error ? err.message : String(err);
			return { ok: false, reason: `persist failed: ${msg}` };
		}

		return { ok: true, path: writtenPath };
	}

	// ---------------------------------------------------------------------------
	// Private — vault materialise helper
	// ---------------------------------------------------------------------------

	/**
	 * Write a .base entry into the configured curatedBasesFolder.
	 *
	 * Creates the folder via vault.adapter.mkdir when absent. mkdir is a properly
	 * typed method on the DataAdapter interface (obsidian.d.ts:2099) — no `as
	 * unknown` cast needed; no fictional-method risk.
	 *
	 * Throws on any vault error — the caller (_installBasesEntry) catches and
	 * returns { ok:false }.
	 */
	private async _materialise(entry: CatalogEntry): Promise<string> {
		const { app, curatedBasesFolder } = this.deps;
		const folderPath = normalizePath(curatedBasesFolder);
		const filePath = normalizePath(`${curatedBasesFolder}/${entry.id}.base`);

		const folderExists = await app.vault.adapter.exists(folderPath);
		if (!folderExists) {
			await app.vault.adapter.mkdir(folderPath);
		}

		await app.vault.adapter.write(filePath, entry.source);

		return filePath;
	}
}
