/**
 * CatalogService — T4.4 curated-catalog install, verify, materialise, persist.
 *
 * The CatalogIndex is provided via constructor injection (never read from dist/
 * at runtime) so this service is fully testable without build artifacts.
 *
 * Install order (SDD Runtime View — curated-install algorithm):
 *   1. VERIFY   — computeChecksum(entry.source) vs entry.checksum; fail-closed
 *                 on mismatch (nothing written, reason surfaced).
 *   2. MATERIALISE — write raw .base YAML into curatedBasesFolder,
 *                 normalizePath'd; create folder on demand.
 *   3. PERSIST  — store.setRecord with engine:"bases", source:<raw YAML>,
 *                 provenance:"curated", okayed:{checksum}.
 *   If PERSIST fails after MATERIALISE, the orphaned .base file is removed so
 *   no partial state is left. install() NEVER throws — always returns InstallResult.
 *
 * Why bases entries bypass importToStore (ADR-5):
 *   ViewDefinition.engine is typed "dataview-dql"|"dataviewjs" — "bases" is not
 *   in the union. Routing through toRecord() would either (a) require lying about
 *   the engine or (b) require touching src/import/* in a way that risks T4.3
 *   regressions. Writing directly is the minimal, correct path: ConsentGate and
 *   BasesFenceEngine both require engine:"bases" AND source:<raw YAML> on the
 *   record (src/consent/ConsentGate.ts:117 + src/engines/BasesFenceEngine.ts:27).
 *
 * The catalog only emits engine:"bases" today. An exhaustive guard ensures a
 * future non-bases CatalogEntry variant fails to compile until handled.
 *
 * @ref PRD/AC-F4.5 (fail-closed on mismatch)
 * @ref PRD/AC-F4.6 (surfaced via existing view surfaces)
 * @ref PRD/AC-F4.7 (offline — zero network on any path, CON-9)
 * @ref SDD/ADR-5 (bases record source = raw .base YAML; curatedBasesFolder)
 */

import { normalizePath } from "obsidian";
import type { App } from "obsidian";
import { computeChecksum } from "consent/checksum";
import type { ViewStore } from "store/ViewStore";
import type { ViewRecord } from "store/types";
import type { ConsentGate } from "consent/ConsentGate";
import type { ViewImporter } from "import/ViewImporter";
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
	importer: ViewImporter;
	gate: ConsentGate;
	store: ViewStore;
	/** Vault folder where curated .base files are materialised. Default "00 Meta/Bases". */
	curatedBasesFolder: string;
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
	 * Duplicate detection compares record.source against entry.source. Bases records
	 * store the raw .base YAML in ViewRecord.source (not a vault path — ADR-5), so
	 * YAML equality means the same content is already installed.
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

		// 2. Duplicate check: same raw YAML already in the store → up-to-date.
		try {
			const existing = await this.deps.store.getViews();
			for (const rec of Object.values(existing)) {
				if (rec.source === entry.source) {
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

		// 4. PERSIST: write ViewRecord. On failure, remove the orphaned .base file.
		const record: ViewRecord = {
			provenance: "curated",
			enabled: true,
			okayed: { version: 1, checksum: computed },
			source: entry.source,
			engine: "bases",
			command: false,
			commandName: entry.name,
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
