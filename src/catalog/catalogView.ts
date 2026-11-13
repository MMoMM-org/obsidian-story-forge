/**
 * catalogView — the pure parts of the catalog browser (mockups-catalog.html L10, Q2/Q5/Q6), kept
 * free of DOM and `obsidian` so they are unit-tested on their own and can be shared with the vault
 * import modal (mockups-import.html L11), which lists the same kind of rows.
 *
 * `filterEntries` is generic over any item with a name, an optional description and an engine.
 */

import { extractQueryBlocks } from "import/queryBlocks";
import { ENGINE_LABEL } from "settings/libraryShared";
import type { CatalogEntry } from "catalog/catalogTypes";

/** What a list row filters on. Callers' own fields ride along untouched. */
export interface Filterable<E extends string> {
	name: string;
	description?: string;
	engine: E;
}

/** "all", or one engine. */
export type EngineFilter<E extends string> = "all" | E;

/** Search matches per engine, plus `all`. An engine with no match is absent (read it as 0). */
export type EngineCounts<E extends string> = { all: number } & Partial<Record<E, number>>;

export interface FilterResult<T, E extends string> {
	/** The items to show: matching the search and the engine filter, in their original order. */
	shown: T[];
	/** Search matches per engine, whatever the engine filter is (the filter's own counts, Q2). */
	counts: EngineCounts<E>;
}

/** Does `item` match `query` (already trimmed and lowercased) by name or description? */
function matches(item: Filterable<string>, query: string): boolean {
	return `${item.name} ${item.description ?? ""}`.toLowerCase().includes(query);
}

/**
 * Filter `items` by a search `query` (name or description; case-insensitive; surrounding spaces
 * ignored) and an `engine` filter. Counts describe the search alone, so the filter's numbers say
 * how many rows each choice would show.
 */
export function filterEntries<T extends Filterable<string>>(
	items: readonly T[],
	query: string,
	engine: EngineFilter<T["engine"]>,
): FilterResult<T, T["engine"]> {
	const q = query.trim().toLowerCase();
	const found = items.filter((item) => matches(item, q));
	const byEngine = new Map<string, number>();
	for (const item of found) byEngine.set(item.engine, (byEngine.get(item.engine) ?? 0) + 1);
	const shown = engine === "all" ? found : found.filter((item) => item.engine === engine);
	// Every key came from an item's `engine`, so the record is keyed by T["engine"].
	const perEngine = Object.fromEntries(byEngine) as Partial<Record<T["engine"], number>>;
	return { shown, counts: { ...perEngine, all: found.length } };
}

// ---------------------------------------------------------------------------
// The catalog's own vocabulary
// ---------------------------------------------------------------------------

export type CatalogEngine = CatalogEntry["engine"];

/** The engine filter's choices, in the mockup's order, with the Library's product names (Q7). */
export const FILTERS: ReadonlyArray<{ key: EngineFilter<CatalogEngine>; label: string }> = [
	{ key: "all", label: "All" },
	{ key: "bases", label: ENGINE_LABEL.bases },
	{ key: "dataview-dql", label: ENGINE_LABEL["dataview-dql"] },
	{ key: "dataviewjs", label: ENGINE_LABEL.dataviewjs },
];

/** An entry's install state in the browser: not installed, installed and current, or stale. */
export type Status = "none" | "installed" | "update";

/** What a row and the detail header say for each status (Q4); nothing for "none". */
export const STATUS_TEXT: Readonly<Record<Status, string>> = {
	none: "",
	installed: "✓ Installed",
	update: "Update available",
};

/** Hex digits of the checksum shown in Details (L10d); the full value is the element's title. */
const CHECKSUM_DIGITS = 10;

/** The query block a user reads (Q5): a Bases entry's YAML, a Dataview note's one fenced block body. */
export function queryOf(entry: CatalogEntry): string {
	if (entry.engine === "bases") return entry.source.trimEnd();
	const blocks = extractQueryBlocks(entry.source);
	return (blocks.length === 1 ? blocks[0]!.body : entry.source).trimEnd();
}

/** "sha256:<first 10 hex>…" (L10d). */
export function shortChecksum(checksum: string): string {
	const [algo, hex] = checksum.includes(":") ? checksum.split(":", 2) : ["", checksum];
	const head = (hex ?? "").slice(0, CHECKSUM_DIGITS);
	return `${algo ? `${algo}:` : ""}${head}…`;
}
