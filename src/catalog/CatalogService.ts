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
 *   the removed Open Codex command opened the VAULT file — editing the rendered file was invisible.
 *   The vault file is now the single artifact; `record.source` is its path, and
 *   `record.generated.instanceChecksum` is the checksum of the bytes actually
 *   written, so classify() can detect a hand-edit against what is really on disk.
 *
 * The renderer half of ADR-35 (closed in T7.1): BasesFenceEngine branches on
 * `kind` and reads the vault file for a kind:"collection" record, so the path
 * stored in `source` never reaches the YAML parser. ConsentGate reads
 * `record.generated` instead of checksumming `source` (ConsentGate.ts).
 *
 * Why bases entries bypass importToStore (ADR-5):
 *   ViewDefinition.engine is typed "dataview-dql"|"dataviewjs" — "bases" is not
 *   in the union. Routing through toRecord() would either (a) require lying about
 *   the engine or (b) require touching src/import/* in a way that risks T4.3
 *   regressions. Writing directly is the minimal, correct path.
 *
 * T7.2: the catalog also emits curated Dataview notes (engine "dataview-dql" /
 * "dataviewjs"), installed by `_installDataviewEntry` into the same folder. An
 * exhaustive guard ensures a future CatalogEntry variant fails to compile until handled.
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
 * Once the injected params change, an unedited curated file classifies
 * "regenerate" and its curated content would be replaced by `renderBase`
 * output. T7.3 owns this: reconcile already-installed records'
 * `generated.params` when it wires real settings-backed values. A hand-edited
 * file is safe either way — it classifies "ask" (see `classify()`).
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
import { defaultSurfaces, type ViewRecord } from "store/types";
import type { ConsentGate } from "consent/ConsentGate";
import { installedChecksum } from "catalog/catalogTypes";
import type { BasesCatalogEntry, CatalogEntry, CatalogIndex, DataviewCatalogEntry } from "catalog/catalogTypes";
import { extractQueryBlocks } from "import/queryBlocks";

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

		switch (entry.engine) {
			case "bases":
				return this._installBasesEntry(entry);
			case "dataview-dql":
			case "dataviewjs":
				return this._installDataviewEntry(entry);
			default: {
				// Exhaustive guard: a future CatalogEntry variant must be handled here
				// before it reaches production. This will fail to compile until done.
				const _exhaustive: never = entry;
				return { ok: false, reason: `unsupported engine: ${String(_exhaustive)}` };
			}
		}
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
	private async _installBasesEntry(entry: BasesCatalogEntry): Promise<InstallResult> {
		// 1. VERIFY checksum before any side effect.
		const computed = await computeChecksum(entry.source);
		if (computed !== entry.checksum) {
			return {
				ok: false,
				reason: `checksum mismatch: expected ${entry.checksum}, got ${computed}`,
			};
		}

		// 2. Duplicate check (see the method docstring and `_findInstalled`).
		const installed = await this._findInstalled(entry);
		if (installed !== null) return installed;

		// 3. MATERIALISE: write the .base YAML file into the vault folder.
		let writtenPath: string;
		try {
			writtenPath = await this._materialise(entry, "base");
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
			surfaces: defaultSurfaces("bases"),
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

		return this._persist(record, writtenPath);
	}

	// ---------------------------------------------------------------------------
	// Private — Dataview install path (T7.2)
	// ---------------------------------------------------------------------------

	/**
	 * Install a curated Dataview note: verify → duplicate-check → (DataviewJS: consent) →
	 * materialise `<folder>/<id>.md` → persist. The note lands in the same folder as a `.base`
	 * ("Folder for collections from the repo", P14). The record carries no `generated` block:
	 * the note is copied verbatim and is not a template (ADR-0003 covers `.base` templates).
	 *
	 * `okayed` is what ConsentGate computes from the written note (block checksum, sf-version),
	 * so a DQL entry draws with no modal (PRD F7 AC 8) and an edited note reads as drift like any
	 * other Dataview collection. DataviewJS asks BEFORE anything is written; a decline writes
	 * nothing.
	 */
	private async _installDataviewEntry(entry: DataviewCatalogEntry): Promise<InstallResult> {
		const mismatch = await this._verifyDataview(entry);
		if (mismatch !== null) return { ok: false, reason: mismatch };
		const installed = await this._findInstalled(entry);
		if (installed !== null) return installed;

		const okayed = await this._dataviewApproval(entry);
		if (okayed === null) return { ok: false, reason: "consent declined" };

		let writtenPath: string;
		try {
			writtenPath = await this._materialise(entry, "md");
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			return { ok: false, reason: `materialise failed: ${msg}` };
		}
		return this._persist(this._dataviewRecord(entry, writtenPath, okayed), writtenPath);
	}

	/** Fail closed: the note's bytes and its one query block must match what the catalog recorded. */
	private async _verifyDataview(entry: DataviewCatalogEntry): Promise<string | null> {
		const computed = await computeChecksum(entry.source);
		if (computed !== entry.checksum) {
			return `checksum mismatch: expected ${entry.checksum}, got ${computed}`;
		}
		const blocks = extractQueryBlocks(entry.source);
		const query = blocks.length === 1 ? await computeChecksum(blocks[0]!.body) : null;
		if (query !== entry.queryChecksum) {
			return `query checksum mismatch: expected ${entry.queryChecksum}, got ${query ?? "no single query block"}`;
		}
		return null;
	}

	/** DQL: approved by provenance. DataviewJS: the full consent modal, before any write. */
	private async _dataviewApproval(entry: DataviewCatalogEntry): Promise<{ version: number; checksum: string } | null> {
		if (entry.engine === "dataview-dql") return { version: entry.version, checksum: entry.queryChecksum };
		const query = extractQueryBlocks(entry.source)[0]!;
		return this.deps.gate.requestConsentForQuery({
			engine: entry.engine,
			name: entry.name,
			...(entry.description !== undefined ? { description: entry.description } : {}),
			body: query.body,
			version: entry.version,
			sourcePath: this._targetPath(entry, "md"),
		});
	}

	private _dataviewRecord(entry: DataviewCatalogEntry, path: string, okayed: { version: number; checksum: string }): ViewRecord {
		return {
			provenance: "curated",
			enabled: true,
			okayed,
			source: path,
			engine: entry.engine,
			command: false,
			commandName: entry.name,
			kind: "collection",
			surfaces: defaultSurfaces(entry.engine),
			catalogId: entry.id,
			...(entry.description !== undefined ? { description: entry.description } : {}),
		};
	}

	// ---------------------------------------------------------------------------
	// Private — shared by both paths
	// ---------------------------------------------------------------------------

	/**
	 * "up-to-date" when the same catalog entry is already installed at its current checksum.
	 * Match by catalogId when the record has one (also requiring the stored checksum to match
	 * `installedChecksum(entry)`, so a stale record falls through to a fresh install instead of
	 * being reported as a duplicate); fall back to source equality only for pre-T4.5 records that
	 * predate catalogId. `null` when it is not installed.
	 */
	private async _findInstalled(entry: CatalogEntry): Promise<InstallResult | null> {
		try {
			const existing = await this.deps.store.getViews();
			const current = installedChecksum(entry);
			for (const rec of Object.values(existing)) {
				const isDuplicate =
					rec.catalogId !== undefined
						? rec.catalogId === entry.id && rec.okayed?.checksum === current
						: rec.source === entry.source;
				if (isDuplicate) return { ok: false, reason: "up-to-date: already installed" };
			}
			return null;
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			return { ok: false, reason: `store read failed: ${msg}` };
		}
	}

	/** Write `record`; on failure remove the file just written, so no partial state is left. */
	private async _persist(record: ViewRecord, writtenPath: string): Promise<InstallResult> {
		try {
			await this.deps.store.setRecord(crypto.randomUUID(), record);
		} catch (err) {
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
	 * Write an entry (`.base` or, T7.2, a Dataview `.md`) into the configured curatedBasesFolder.
	 *
	 * Creates the folder via vault.adapter.mkdir when absent. mkdir is a properly
	 * typed method on the DataAdapter interface (obsidian.d.ts:2099) — no `as
	 * unknown` cast needed; no fictional-method risk.
	 *
	 * Throws on any vault error — the callers (_installBasesEntry, _installDataviewEntry) catch and
	 * returns { ok:false }.
	 */
	private async _materialise(entry: CatalogEntry, extension: "base" | "md"): Promise<string> {
		const { app, curatedBasesFolder } = this.deps;
		const folderPath = normalizePath(curatedBasesFolder);
		const filePath = this._targetPath(entry, extension);

		const folderExists = await app.vault.adapter.exists(folderPath);
		if (!folderExists) {
			await app.vault.adapter.mkdir(folderPath);
		}

		await app.vault.adapter.write(filePath, entry.source);

		return filePath;
	}

	/** Where `entry` is written: `<curatedBasesFolder>/<id>.<extension>`. */
	private _targetPath(entry: CatalogEntry, extension: "base" | "md"): string {
		return normalizePath(`${this.deps.curatedBasesFolder}/${entry.id}.${extension}`);
	}
}
