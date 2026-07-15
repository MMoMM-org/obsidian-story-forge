/**
 * ViewImporter — stateless service for scanning the vault and parsing
 * view-definition notes into ViewDefinitions and ViewRecords.
 *
 * Auto-scan uses metadataCache only (no vault reads for the listing step, ADR-6).
 * Parsing reads the note file once via readFencedBlock to extract the fenced block.
 *
 * @ref SDD/Interface Specifications — ViewDefinition + ViewImporter
 * @ref SDD/ADR-6 (view-definition format; metadataCache scan; exactly-one-block rule)
 * @ref SDD/ADR-9 (store-generated id; source = vault path; no UUID to vault)
 */

import { TFile } from "obsidian";
import type { App } from "obsidian";
import { readFencedBlock } from "import/fencedBlock";
import { computeChecksum } from "consent/checksum";
import { ImportError } from "import/ViewDefinition";
import type { ViewDefinition } from "import/ViewDefinition";
import type { ViewStore } from "store/ViewStore";
import type { ViewRecord } from "store/types";

export { ImportError } from "import/ViewDefinition";
export type { ViewDefinition } from "import/ViewDefinition";

/**
 * Minimal interface extension so TypeScript knows about `iterateAllFiles`,
 * which is present on Obsidian's MetadataCache but not typed in @types/obsidian.
 * Using `unknown` to stay safely typed without `any` (ADR, CON-8).
 */
interface MetadataCacheWithIterate {
	iterateAllFiles(cb: (file: TFile) => void): void;
}

/**
 * ViewImporter — stateless service.
 *
 * Injected dependencies: `app` (for vault + metadataCache) and `store` (for
 * duplicate detection and record persistence). No other state is held.
 *
 * @ref SDD/Key Decisions — "ViewImporter is STATELESS"
 */
export class ViewImporter {
	constructor(
		private readonly app: App,
		private readonly store: ViewStore,
	) {}

	// -------------------------------------------------------------------------
	// parse() — T2.1
	// -------------------------------------------------------------------------

	/**
	 * Parse a view-definition note into a ViewDefinition.
	 *
	 * Validates:
	 * - Exactly one fenced block with language "dataview" or "dataviewjs".
	 * - sf-version: present and a non-float integer (typeof number && Number.isInteger).
	 * - sf-name: non-empty string (or absent — defaults to file.basename).
	 * - sf-engine if present: must match the inferred engine.
	 *
	 * @throws ImportError on any validation failure.
	 * @ref SDD/ADR-6; SDD/Implementation Examples — ViewImporter.parse()
	 */
	async parse(file: TFile): Promise<ViewDefinition> {
		// 1. Read the single fenced block via the Phase 1 extractor.
		//    readFencedBlock returns null for 0 or >1 matching blocks.
		//    We distinguish 0 vs >1 to throw the right error code.
		const block = await this._readBlock(file);

		// 2. Read frontmatter from metadataCache — no extra vault.read().
		const cache = this.app.metadataCache.getFileCache(file);
		const fm: Record<string, unknown> = cache?.frontmatter ?? {};

		// 3. Validate sf-version (must be an integer).
		const rawVersion: unknown = fm["sf-version"];
		if (
			rawVersion === undefined ||
			rawVersion === null ||
			typeof rawVersion !== "number" ||
			!Number.isInteger(rawVersion)
		) {
			throw new ImportError(
				"INVALID_FRONTMATTER",
				"sf-version must be an integer",
			);
		}
		// rawVersion is now narrowed to number (integer)
		const version: number = rawVersion;

		// 4. Validate sf-name (may be absent — defaults to file.basename; but if
		//    present, must be a non-empty string).
		const rawName: unknown = fm["sf-name"];
		if (rawName !== undefined && rawName !== null) {
			if (typeof rawName !== "string" || rawName.trim() === "") {
				throw new ImportError(
					"INVALID_FRONTMATTER",
					"sf-name must be a non-empty string",
				);
			}
		}
		const name: string =
			typeof rawName === "string" && rawName.length > 0
				? rawName
				: file.basename;

		// 5. Infer engine from fence language tag.
		const engine: "dataview-dql" | "dataviewjs" =
			block.lang === "dataviewjs" ? "dataviewjs" : "dataview-dql";

		// 6. Cross-check sf-engine if present.
		const sfEngine: unknown = fm["sf-engine"];
		if (sfEngine !== undefined && sfEngine !== null) {
			// Only compare if sf-engine is a string (non-string values are ignored).
			if (typeof sfEngine === "string" && sfEngine !== engine) {
				throw new ImportError(
					"ENGINE_MISMATCH",
					`sf-engine "${sfEngine}" contradicts the fenced block language "${block.lang}"`,
				);
			}
		}

		// 7. Compute checksum over the block body (Web Crypto, cross-platform).
		const checksum = await computeChecksum(block.body);

		const rawDesc: unknown = fm["sf-description"];
		return {
			sourcePath: file.path,
			engine,
			version,
			name,
			description: typeof rawDesc === "string" ? rawDesc : undefined,
			command: fm["sf-command"] === true,
			querySource: block.body,
			checksum,
		};
	}

	// -------------------------------------------------------------------------
	// toRecord() — T2.2
	// -------------------------------------------------------------------------

	/**
	 * Convert a ViewDefinition into a new (not yet consented) ViewRecord.
	 *
	 * - provenance: "imported"
	 * - enabled: false (ADR-5 safe default)
	 * - okayed: null (not yet consented; ADR-9)
	 *
	 * @ref SDD/Interface Specifications — ViewRecord mapping from ViewDefinition
	 */
	toRecord(def: ViewDefinition): ViewRecord {
		const rec: ViewRecord = {
			provenance: "imported",
			enabled: false,
			okayed: null,
			source: def.sourcePath,
			engine: def.engine,
			command: def.command,
			commandName: def.name,
		};
		if (def.description !== undefined) {
			rec.description = def.description;
		}
		return rec;
	}

	// -------------------------------------------------------------------------
	// importToStore() — T2.2
	// -------------------------------------------------------------------------

	/**
	 * Persist a ViewDefinition as a new ViewRecord in the store.
	 *
	 * - Checks store.getViews() for an existing record whose source matches
	 *   def.sourcePath; throws ImportError("DUPLICATE") without writing if found.
	 * - Generates a new UUID via crypto.randomUUID() (Web Crypto, all platforms).
	 * - Calls store.setRecord(newId, record) exactly once.
	 * - Never sets okayed on the record (ADR-9, ADR-5 safe default).
	 *
	 * @returns The newly-assigned view id.
	 * @ref SDD/Key Decisions — duplicate detection, store-generated id
	 */
	async importToStore(def: ViewDefinition): Promise<string> {
		// Duplicate detection: check existing source paths.
		const views = await this.store.getViews();
		for (const rec of Object.values(views)) {
			if (rec.source === def.sourcePath) {
				throw new ImportError("DUPLICATE", "View already imported");
			}
		}

		const newId = crypto.randomUUID();
		const record = this.toRecord(def);
		await this.store.setRecord(newId, record);
		return newId;
	}

	// -------------------------------------------------------------------------
	// scanVault() — T2.3
	// -------------------------------------------------------------------------

	/**
	 * Return all vault notes whose CachedMetadata has sf-view === true (strict
	 * boolean), excluding any paths already present in the store.
	 *
	 * Uses metadataCache.iterateAllFiles + getFileCache — NO vault.read() calls.
	 * (ADR-6: auto-scan is cache-only.)
	 *
	 * @ref SDD/ADR-6 — metadataCache-only scan; no vault reads at scan time
	 */
	async scanVault(): Promise<TFile[]> {
		// Pre-load the set of already-imported source paths.
		const views = await this.store.getViews();
		const importedSources = new Set(
			Object.values(views).map((r) => r.source),
		);

		const result: TFile[] = [];
		// iterateAllFiles is present on Obsidian MetadataCache at runtime but not
		// in @types/obsidian. Cast to the minimal typed interface we defined above.
		(this.app.metadataCache as unknown as MetadataCacheWithIterate).iterateAllFiles(
			(file: TFile) => {
				// Strict boolean true — exclude absent, false, or non-boolean truthy.
				const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
				if (fm?.["sf-view"] !== true) return;

				// Exclude already-imported paths.
				if (importedSources.has(file.path)) return;

				result.push(file);
			},
		);

		return result;
	}

	// -------------------------------------------------------------------------
	// Private helpers
	// -------------------------------------------------------------------------

	/**
	 * Read the single fenced block from `file`, distinguishing 0-block (NO_QUERY_BLOCK)
	 * from >1-block (MULTIPLE_QUERY_BLOCKS) cases.
	 *
	 * readFencedBlock returns null for BOTH 0 and >1 blocks (per its contract).
	 * We detect the >1 case by re-reading the raw content and counting matching
	 * language tags so we can throw the correct ImportError code.
	 */
	private async _readBlock(
		file: TFile,
	): Promise<{ lang: string; body: string }> {
		const block = await readFencedBlock(this.app, file.path);
		if (block !== null) {
			return block;
		}

		// Determine whether zero or multiple blocks are present.
		// readFencedBlock already read the file; re-read on the error path to count.
		const abstractFile = this.app.vault.getAbstractFileByPath(file.path);
		// If the file doesn't exist at all, treat as NO_QUERY_BLOCK.
		if (!(abstractFile instanceof TFile)) {
			throw new ImportError("NO_QUERY_BLOCK", "No query block found");
		}

		const content = await this.app.vault.read(abstractFile);
		const count = this._countQueryBlocks(content);
		if (count > 1) {
			throw new ImportError(
				"MULTIPLE_QUERY_BLOCKS",
				"View definitions must contain exactly one query block",
			);
		}
		throw new ImportError("NO_QUERY_BLOCK", "No query block found");
	}

	/**
	 * Count the number of top-level dataview/dataviewjs fenced blocks in `content`.
	 * Mirrors the logic in fencedBlock.ts extractQueryBlocks, kept minimal here.
	 */
	private _countQueryBlocks(content: string): number {
		const lines = content.split("\n");
		const queryLangs = new Set(["dataview", "dataviewjs"]);
		let count = 0;
		let i = 0;
		while (i < lines.length) {
			const openMatch = lines[i]!.match(/^```([a-zA-Z][a-zA-Z0-9-]*)[ \t\r]*$/);
			if (!openMatch) {
				i++;
				continue;
			}
			const lang = openMatch[1]!;
			const isQuery = queryLangs.has(lang);
			// Scan forward to closing fence.
			let j = i + 1;
			while (j < lines.length && !/^```[ \t\r]*$/.test(lines[j]!)) {
				j++;
			}
			if (isQuery) count++;
			i = j < lines.length ? j + 1 : j;
		}
		return count;
	}
}
