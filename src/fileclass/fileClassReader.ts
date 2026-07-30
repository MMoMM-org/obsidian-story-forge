/**
 * fileClassReader — resolves a metadata-menu FileClass `extends` chain and
 * parses each link's field declarations, defensively.
 *
 * ADR-31 firewall: this is the sanctioned home for reading raw FileClass
 * frontmatter. Everything outside `src/fileclass/` sees only `ParsedFileClass`
 * / `FileClassField` (from `fileClassTypes.ts`) — never the metadata-menu
 * shape itself. This module is read-only: it has no write path, and it never
 * imports Obsidian at runtime (only the plain-data `FileClassLookup` port).
 *
 * @ref SDD/ADR-31       — a pure FieldModel sits between the reader and the editor
 * @ref SDD/Error Handling — malformed FileClass: skip it, render the rest of the chain
 * @ref SDD/Error Handling — FileClass chain cycle: truncate at the first repeat
 * @ref ADR-0002         — fieldsOrder holds ids (not names); tagNames/filesPaths
 *                          may be empty and are never consulted here
 */

import type { FieldType, FileClassField, FileClassLookup, ParsedFileClass } from "fileclass/fileClassTypes";

const KNOWN_FIELD_TYPES: ReadonlySet<string> = new Set<Exclude<FieldType, "Unknown">>([
	"Input",
	"Boolean",
	"Number",
	"Select",
	"Cycle",
	"Multi",
	"Date",
	"Datetime",
	"Time",
	"File",
	"MultiFile",
	"Media",
	"MultiMedia",
]);

/**
 * Resolve the FileClass `extends` chain starting at `startName` and parse
 * every reachable, well-formed link.
 *
 * Returns the chain **base first** (the AC ordering — "one section per
 * FileClass, base first"), containing only links that parsed successfully.
 * A malformed link is skipped but does not stop traversal past it, as long
 * as its own `extends` value is still readable. A cycle (a name repeating)
 * truncates the walk at the first repeat. An unreadable starting point
 * yields an empty array — this function never throws.
 */
export function resolveFileClassChain(
	startName: string,
	lookup: FileClassLookup,
): ParsedFileClass[] {
	const visited = new Set<string>();
	const leafToBase: ParsedFileClass[] = [];

	let current: string | undefined = startName;
	while (current !== undefined) {
		if (visited.has(current)) break; // cycle — truncate at the first repeat
		visited.add(current);

		const record = asRecord(lookup.getFileClassFrontmatter(current));
		if (record === undefined) break; // unreadable — nothing to add, nothing to continue from

		const extendsName = readExtends(record);
		const parsed = tryParseFileClass(current, record, extendsName);
		if (parsed !== undefined) leafToBase.push(parsed);

		current = extendsName;
	}

	return leafToBase.reverse();
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> | undefined {
	if (value === null || value === undefined || typeof value !== "object" || Array.isArray(value)) {
		return undefined;
	}
	return value as Record<string, unknown>;
}

function readExtends(record: Record<string, unknown>): string | undefined {
	const value = record["extends"];
	return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

/** Parse one FileClass's fields, ordered per fieldsOrder. Undefined = malformed (skip it). */
function tryParseFileClass(
	name: string,
	record: Record<string, unknown>,
	extendsName: string | undefined,
): ParsedFileClass | undefined {
	const rawFields = record["fields"];
	if (!Array.isArray(rawFields)) return undefined;

	const declared: FileClassField[] = [];
	for (const rawField of rawFields) {
		const field = parseField(rawField);
		if (field !== undefined) declared.push(field);
	}
	const byId = new Map(declared.map((field) => [field.id, field]));

	const rawOrder = record["fieldsOrder"];
	const order = Array.isArray(rawOrder) ? rawOrder.filter((id): id is string => typeof id === "string") : [];

	const fields: FileClassField[] = [];
	const used = new Set<string>();
	for (const id of order) {
		const field = byId.get(id);
		if (field !== undefined && !used.has(id)) {
			fields.push(field);
			used.add(id);
		}
	}
	// Declared fields fieldsOrder omitted still render — appended, declaration order.
	for (const field of declared) {
		if (!used.has(field.id)) {
			fields.push(field);
			used.add(field.id);
		}
	}

	const parsed: ParsedFileClass = { name, fields };
	if (extendsName !== undefined) parsed.extends = extendsName;
	return parsed;
}

/** Parse a single `fields[]` entry. Undefined = unusable (no stable id/name) — skip just this field. */
function parseField(raw: unknown): FileClassField | undefined {
	const record = asRecord(raw);
	if (record === undefined) return undefined;

	const id = record["id"];
	const name = record["name"];
	if (typeof id !== "string" || id.trim() === "") return undefined;
	if (typeof name !== "string") return undefined;

	const field: FileClassField = { id, name, type: parseFieldType(record["type"]) };
	const values = parseValues(record["options"]);
	if (values !== undefined) field.values = values;
	return field;
}

function parseFieldType(raw: unknown): FieldType {
	return typeof raw === "string" && KNOWN_FIELD_TYPES.has(raw) ? (raw as FieldType) : "Unknown";
}

/** Selectable values from `options.valuesList` (a Record<string,string>). Empty/absent → undefined. */
function parseValues(rawOptions: unknown): string[] | undefined {
	const options = asRecord(rawOptions);
	if (options === undefined) return undefined;

	const valuesList = asRecord(options["valuesList"]);
	if (valuesList === undefined) return undefined;

	const values = Object.values(valuesList).filter((value): value is string => typeof value === "string");
	return values.length > 0 ? values : undefined;
}
