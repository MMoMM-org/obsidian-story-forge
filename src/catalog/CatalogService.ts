/**
 * CatalogService — T4.4 curated-catalog install, verify, materialise, persist.
 *
 * The CatalogIndex is provided via constructor injection (never read from dist/
 * at runtime) so this service is fully testable without build artifacts.
 *
 * Install order (SDD Runtime View — curated-install algorithm):
 *   1. VERIFY   — computeChecksum(entry.source) vs entry.checksum; fail-closed
 *                 on mismatch (nothing written, reason surfaced).
 *   2. GATE     — DataviewJS only: requestConsentForDef; declined → nothing
 *                 written. Bases/.base entries are declarative → skip gate.
 *   3. MATERIALISE (bases only) — write raw .base YAML into curatedBasesFolder,
 *                 normalizePath'd; create folder on demand.
 *   4. PERSIST:
 *       - bases entries: store.setRecord directly with engine:"bases",
 *         source:<raw YAML>, provenance:"curated" (ADR-5 — ViewRecord.source
 *         IS the raw YAML, and ViewDefinition.engine excludes "bases").
 *       - DQL/DataviewJS entries: installCurated (existing ImportFlow path).
 *
 * Why bases entries skip importToStore (route b, ADR-5):
 *   ViewDefinition.engine is typed "dataview-dql"|"dataviewjs" — "bases" is not
 *   in the union. Routing through toRecord() would either (a) require lying about
 *   the engine or (b) require touching src/import/* in a way that risks T4.3
 *   regressions. Writing directly is the minimal, correct path: ConsentGate and
 *   BasesFenceEngine both require engine:"bases" AND source:<raw YAML> on the
 *   record (src/consent/ConsentGate.ts:117 + src/engines/BasesFenceEngine.ts:27).
 *
 * @ref PRD/AC-F4.5 (fail-closed on mismatch)
 * @ref PRD/AC-F4.6 (surfaced via existing view surfaces)
 * @ref PRD/AC-F4.7 (offline — zero network on any path, CON-9)
 * @ref SDD/ADR-5 (bases record source = raw .base YAML; curatedBasesFolder)
 * @ref SDD/ADR-6 (reuse installCurated for DQL/DataviewJS; bases bypass)
 */

import { normalizePath } from "obsidian";
import type { App } from "obsidian";
import { computeChecksum } from "consent/checksum";
import { installCurated } from "import/ImportFlow";
import type { ImportFlowDeps } from "import/ImportFlow";
import type { ViewImporter } from "import/ViewImporter";
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
	 * Follows the four-step curated-install algorithm (SDD Runtime View):
	 * VERIFY → GATE → MATERIALISE → PERSIST.
	 *
	 * Returns InstallResult — never throws.
	 */
	async install(id: string): Promise<InstallResult> {
		const entry = this.index.entries.find((e) => e.id === id);
		if (!entry) {
			return { ok: false, reason: `not-found: no catalog entry with id "${id}"` };
		}

		// 1. VERIFY checksum before any side effect (fail-closed, AC-F4.5).
		const computed = await computeChecksum(entry.source);
		if (computed !== entry.checksum) {
			return {
				ok: false,
				reason: `checksum mismatch: expected ${entry.checksum}, got ${computed}`,
			};
		}

		if (entry.engine === "bases") {
			return this._installBasesEntry(entry, computed);
		}

		// Non-bases (DQL / DataviewJS): use the existing installCurated path.
		return this._installNonBasesEntry(entry);
	}

	// ---------------------------------------------------------------------------
	// Private — bases install path (route b)
	// ---------------------------------------------------------------------------

	/**
	 * Install a bases entry directly: materialise the .base file into the vault,
	 * then write a ViewRecord with engine:"bases" and source:<raw YAML> directly
	 * to the store (bypassing importToStore which cannot produce a bases engine
	 * record — ViewDefinition.engine excludes "bases").
	 *
	 * Duplicate detection mirrors importToStore: if a record with the same source
	 * already exists, surface "up-to-date" without an error.
	 */
	private async _installBasesEntry(
		entry: CatalogEntry,
		computedChecksum: string,
	): Promise<InstallResult> {
		// Duplicate check: same raw YAML already in the store → up-to-date.
		const existing = await this.deps.store.getViews();
		for (const rec of Object.values(existing)) {
			if (rec.source === entry.source) {
				return { ok: false, reason: "up-to-date: already installed" };
			}
		}

		// 3. MATERIALISE: write the .base YAML file into the vault folder.
		const writtenPath = await this._materialise(entry);

		// 4. PERSIST: write ViewRecord directly — engine:"bases", source:<raw YAML>.
		//    okayed records the checksum so ConsentGate._evaluateBasesRecord returns
		//    "consented" (no modal for declarative .base — ADR-6).
		const record: ViewRecord = {
			provenance: "curated",
			enabled: true,
			okayed: { version: 1, checksum: computedChecksum },
			source: entry.source,
			engine: "bases",
			command: false,
			commandName: entry.name,
			...(entry.description !== undefined ? { description: entry.description } : {}),
		};

		const newId = crypto.randomUUID();
		await this.deps.store.setRecord(newId, record);

		return { ok: true, path: writtenPath };
	}

	// ---------------------------------------------------------------------------
	// Private — non-bases install path (installCurated)
	// ---------------------------------------------------------------------------

	/**
	 * Install a DQL or DataviewJS entry via the existing installCurated flow.
	 * DataviewJS routes through requestConsentForDef; DQL is 1-click.
	 */
	private async _installNonBasesEntry(entry: CatalogEntry): Promise<InstallResult> {
		const def = this._buildDefForNonBases(entry);
		const flowDeps: ImportFlowDeps = {
			app: this.deps.app,
			importer: this.deps.importer,
			gate: this.deps.gate,
		};
		await installCurated(flowDeps, def);
		return { ok: true };
	}

	/**
	 * Build a ViewDefinition for DQL or DataviewJS entries only.
	 * Never called for bases entries (they bypass importToStore entirely).
	 */
	private _buildDefForNonBases(entry: CatalogEntry): Parameters<typeof installCurated>[1] {
		const engine = entry.engine as "dataview-dql" | "dataviewjs";
		return {
			sourcePath: entry.id,
			engine,
			version: 1,
			name: entry.name,
			description: entry.description,
			command: false,
			querySource: entry.source,
			checksum: entry.checksum as import("consent/checksum").Checksum,
		};
	}

	// ---------------------------------------------------------------------------
	// Private — vault materialise helper
	// ---------------------------------------------------------------------------

	/**
	 * Materialise a .base entry into the configured curatedBasesFolder.
	 *
	 * Creates the folder if it does not exist (vault.adapter.exists + mkdir).
	 * Writes the raw source YAML via vault.adapter.write.
	 * Returns the normalizePath'd vault path.
	 */
	private async _materialise(entry: CatalogEntry): Promise<string> {
		const { app, curatedBasesFolder } = this.deps;
		const folderPath = normalizePath(curatedBasesFolder);
		const filePath = normalizePath(`${curatedBasesFolder}/${entry.id}.base`);

		// Ensure the folder exists.
		const folderExists = await app.vault.adapter.exists(folderPath);
		if (!folderExists) {
			// DataAdapter typings don't expose mkdir; we access it as unknown first.
			const adapter = app.vault.adapter as unknown as Record<string, unknown>;
			if (typeof adapter["mkdir"] === "function") {
				await (adapter["mkdir"] as (path: string) => Promise<void>)(folderPath);
			}
		}

		// Write the raw .base YAML.
		await app.vault.adapter.write(filePath, entry.source);

		return filePath;
	}
}
