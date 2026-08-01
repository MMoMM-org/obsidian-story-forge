/**
 * migrateLegacyBases — silent migration of legacy `bases` ViewRecords (T3.2).
 *
 * ADR-29 (docs/XDD/specs/008-codex-surface/solution.md §Building Block View):
 * store records gain a `kind` discriminant. Legacy `bases` records — persisted
 * before `kind` existed, or defaulted to `"view"` by `applyDefaults` — become
 * `kind:"collection"` with `source` rewritten from the raw `.base` YAML
 * (ADR-5) to the vault PATH of the file CatalogService materialised
 * (`src/catalog/CatalogService.ts` `_materialise`).
 *
 * `ViewStore` has no vault access (only a `PluginDataPort`), so this module
 * takes injected dependencies instead of an `App` — it stays unit-testable
 * with fixture data and no vault:
 *   - `readFile(path)`      — the vault file's current text, or `null` when absent.
 *   - `curatedBasesFolder`  — where CatalogService materialises `.base` files.
 *   - `currentParams`       — the `CollectionParams` a freshly-rendered artifact
 *     would use today. Stored verbatim as `generated.params`, which is what
 *     makes `classify()` read "clean" immediately after migration — ADR-29's
 *     "an existing install upgrades without visible change".
 *
 * Deliberately accepted nuance (ADR-29): `generated.instanceChecksum` is
 * computed from the vault file AS IT EXISTS NOW, never re-derived from the
 * old `source` YAML. If a user hand-edited the `.base` file before this
 * upgrade shipped, that edit becomes the new baseline — no drift prompt
 * appears retroactively for an edit that predates this record ever tracking
 * drift. This is intentional, not a gap: SDD/Implementation Examples and the
 * decision log record it as accepted, not deferred.
 *
 * A record with no `catalogId` (persisted before T4.5) cannot resolve a path
 * — it migrates with an empty `filePath`/`source`; the caller's later
 * `classify()` call then sees a missing file (`fileChecksum: null`) and
 * reports `"regenerate"`. Same outcome for a record whose file the reader
 * reports absent.
 *
 * @ref SDD/ADR-29
 * @ref docs/XDD/specs/008-codex-surface/plan/phase-3.md T3.2
 */

import { normalizePath } from "obsidian";
import { computeChecksum } from "consent/checksum";
import type { CollectionParams } from "library/baseGenerator";
import type { ViewRecord } from "store/types";

// ---------------------------------------------------------------------------
// Injected dependencies
// ---------------------------------------------------------------------------

/** Reads a vault file's raw text by path. Resolves `null` when the file is absent. */
export type VaultTextReader = (path: string) => Promise<string | null>;

export interface MigrateLegacyBasesDeps {
	readonly readFile: VaultTextReader;
	/** Vault folder where curated `.base` files are materialised (settings.curatedBasesFolder). */
	readonly curatedBasesFolder: string;
	/** The params a freshly-rendered artifact would use today. */
	readonly currentParams: CollectionParams;
}

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

/**
 * True when `rec` still needs migrating: engine `"bases"`, and not already
 * migrated. "Already migrated" is `kind === "collection"` OR a `generated`
 * block already present — either alone is sufficient evidence a previous
 * migration ran, so a record caught mid-transition by neither signal still
 * migrates exactly once.
 */
function needsMigration(rec: ViewRecord): boolean {
	return rec.engine === "bases" && rec.kind !== "collection" && rec.generated === undefined;
}

/** Resolve the materialised `.base` file's vault path, or `""` when unresolvable. */
function resolveFilePath(rec: ViewRecord, curatedBasesFolder: string): string {
	if (!rec.catalogId) return "";
	return normalizePath(`${curatedBasesFolder}/${rec.catalogId}.base`);
}

/** Migrate a single legacy `bases` record to the `collection` shape (ADR-29). */
async function migrateOne(
	rec: ViewRecord,
	deps: MigrateLegacyBasesDeps,
): Promise<ViewRecord> {
	const filePath = resolveFilePath(rec, deps.curatedBasesFolder);
	const fileContent = filePath ? await deps.readFile(filePath) : null;
	const instanceChecksum = fileContent !== null ? await computeChecksum(fileContent) : "";

	return {
		...rec,
		kind: "collection",
		source: filePath,
		generated: {
			// The template checksum verified at install (ADR-0003) — not
			// re-verified here; a null okayed (never consented) degrades to "".
			sourceChecksum: rec.okayed?.checksum ?? "",
			params: {
				tag: deps.currentParams.tag,
				excludedFolders: [...deps.currentParams.excludedFolders],
			},
			instanceChecksum,
			filePath,
			verify: true,
		},
	};
}

/**
 * Migrate every legacy `bases` record in `views`. Pure over the injected map
 * — returns a NEW map with migrated records; never mutates its input, so a
 * caller holding a reference to the original records is unaffected.
 *
 * `changed: false` (with `views` returned as-is) means nothing needed
 * migration — the caller (ViewStore.getViews) uses this to skip the
 * exceptional write when a load finds already-migrated data, which is what
 * makes running this twice a true no-op on the second pass.
 */
export async function migrateLegacyBases(
	views: Readonly<Record<string, ViewRecord>>,
	deps: MigrateLegacyBasesDeps,
): Promise<{ views: Record<string, ViewRecord>; changed: boolean }> {
	let changed = false;
	const next: Record<string, ViewRecord> = {};

	for (const [id, rec] of Object.entries(views)) {
		if (needsMigration(rec)) {
			next[id] = await migrateOne(rec, deps);
			changed = true;
		} else {
			next[id] = rec;
		}
	}

	return changed ? { views: next, changed: true } : { views, changed: false };
}
