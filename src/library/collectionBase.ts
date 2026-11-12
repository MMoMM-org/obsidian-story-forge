/**
 * collectionBase — which part of a user's `.base` the Anvil draws (spec 008 mockups-library P9).
 *
 * A user's file may hold several views of its own. The Anvil uses the file's global `filters`,
 * `formulas` and `properties`, plus the FIRST view's filters and sort; that view's type is
 * replaced by the Card view type, and the other views are ignored. The result is a new document
 * handed to Bases. The user's file is read, never patched (ADR-34).
 */
import { parse, stringify } from "yaml";
import {
	CODEX_COMPACT_VIEW_ID,
	CODEX_HERO_VIEW_ID,
	CODEX_TABLE_VIEW_ID,
} from "pluginConstants";

/** The Bases view type each built-in Card draws through. */
const CARD_VIEW_TYPES: Readonly<Record<string, string>> = {
	hero: CODEX_HERO_VIEW_ID,
	table: CODEX_TABLE_VIEW_ID,
	compact: CODEX_COMPACT_VIEW_ID,
};

/** The view type for a Card id. Only the built-in Cards have one, so any other id draws as Hero. */
export function cardViewType(cardId: string | undefined): string {
	return CARD_VIEW_TYPES[cardId ?? ""] ?? CODEX_HERO_VIEW_ID;
}

const GLOBAL_KEYS = ["filters", "formulas", "properties"] as const;
const FIRST_VIEW_KEYS = ["name", "filters", "sort", "order", "groupBy", "limit"] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function pick(from: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
	return Object.fromEntries(keys.filter((k) => from[k] !== undefined).map((k) => [k, from[k]]));
}

/** Parse the file or say why it cannot be drawn; the Anvil shows the message. */
function parseBase(yaml: string): Record<string, unknown> {
	let doc: unknown;
	try {
		doc = parse(yaml);
	} catch (e) {
		throw new Error(`Collection file is not valid YAML: ${e instanceof Error ? e.message : String(e)}`);
	}
	const base = asRecord(doc);
	if (!base) throw new Error("Collection file is not a .base document.");
	return base;
}

/** The `.base` document the Anvil embeds for `yaml`, with its view drawn as `viewType`. */
export function toCardBase(yaml: string, viewType: string): string {
	const base = parseBase(yaml);
	const views = Array.isArray(base["views"]) ? base["views"] : [];
	const first = asRecord(views[0]) ?? {};
	return stringify({
		...pick(base, GLOBAL_KEYS),
		views: [{ type: viewType, ...pick(first, FIRST_VIEW_KEYS) }],
	});
}
