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
 *   4. PERSIST  — importToStore(def, { provenance:"curated" }) → store.setRecord
 *                 → store subscribers (sidebar re-render).
 *
 * @ref PRD/AC-F4.5 (fail-closed on mismatch)
 * @ref PRD/AC-F4.6 (surfaced via existing view surfaces)
 * @ref PRD/AC-F4.7 (offline — zero network on any path, CON-9)
 * @ref SDD/ADR-5 (bases source = raw .base YAML; curatedBasesFolder)
 * @ref SDD/ADR-6 (reuse installCurated + importToStore provenance override)
 */

import { normalizePath } from "obsidian";
import type { App } from "obsidian";
import { computeChecksum } from "consent/checksum";
import { installCurated } from "import/ImportFlow";
import type { ImportFlowDeps } from "import/ImportFlow";
import type { ViewImporter } from "import/ViewImporter";
import type { ViewStore } from "store/ViewStore";
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

		// 1. VERIFY checksum before any side effect.
		const computed = await computeChecksum(entry.source);
		if (computed !== entry.checksum) {
			return {
				ok: false,
				reason: `checksum mismatch: expected ${entry.checksum}, got ${computed}`,
			};
		}

		// 2. Build a ViewDefinition-compatible object for the install path.
		//    engine "bases" is declarative → installCurated skips the consent modal.
		const def = this._buildDef(entry);

		// 3. MATERIALISE (bases engine only): write raw .base YAML into vault.
		let writtenPath: string | undefined;
		if (entry.engine === "bases") {
			writtenPath = await this._materialise(entry);
		}

		// 4. PERSIST via installCurated (reuses ImportFlow + importToStore provenance:"curated").
		const flowDeps: ImportFlowDeps = {
			app: this.deps.app,
			importer: this.deps.importer,
			gate: this.deps.gate,
		};
		await installCurated(flowDeps, def);

		return { ok: true, ...(writtenPath !== undefined ? { path: writtenPath } : {}) };
	}

	// ---------------------------------------------------------------------------
	// Private helpers
	// ---------------------------------------------------------------------------

	/**
	 * Build a ViewDefinition-compatible plain object from a CatalogEntry.
	 *
	 * ViewDefinition.engine is "dataview-dql" | "dataviewjs" (not "bases"),
	 * so bases entries are mapped to "dataview-dql" — both are declarative
	 * (no executable code) and the installCurated DECLARATIVE_ENGINES set
	 * treats them identically: 1-click, no consent modal (SDD/ADR-6).
	 *
	 * checksum must satisfy the Checksum branded type; the bundled index
	 * emits "sha256:<hex>" via computeChecksum — the format is correct.
	 */
	private _buildDef(entry: CatalogEntry): Parameters<typeof installCurated>[1] {
		const engineForDef: "dataview-dql" | "dataviewjs" =
			entry.engine === "bases" ? "dataview-dql" : entry.engine;

		return {
			sourcePath: entry.id,
			engine: engineForDef,
			version: 1,
			name: entry.name,
			description: entry.description,
			command: false,
			querySource: entry.source,
			checksum: entry.checksum as import("consent/checksum").Checksum,
		};
	}

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
