/**
 * generatedFileClasses (test helper) — the FileClasses `schema:gen` really wrote,
 * read off disk, plus the `schema/*.json` they came from.
 *
 * Nothing here lists the entity types: `schema/` is read at call time, so adding
 * a type widens every test built on this helper without touching it (CLAUDE.md).
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { resolveFileClassChain } from "fileclass/fileClassReader";
import type { FileClassLookup, ParsedFileClass } from "fileclass/fileClassTypes";

const ROOT = path.resolve(__dirname, "../..");
const FILE_CLASSES = path.join(ROOT, "test/StoryForge/00 Meta/FileClasses");

export interface SchemaField {
	name: string;
	type: string;
	values?: string[];
	value?: string;
	relation?: string;
	query?: string;
}

export interface EntitySchema {
	entity: string;
	extends?: string;
	fields: SchemaField[];
}

/** A `list` field `schema-gen` emits as `MultiFile`: one holding `[[links]]`. */
export function holdsLinks(field: SchemaField): boolean {
	return field.relation !== undefined || field.query !== undefined;
}

export function loadSchemas(): EntitySchema[] {
	const dir = path.join(ROOT, "schema");
	return readdirSync(dir)
		.filter((name) => name.endsWith(".json"))
		.sort()
		.map((name) => JSON.parse(readFileSync(path.join(dir, name), "utf8")) as EntitySchema);
}

/** The frontmatter of a generated `fc-*.md`, YAML-parsed as `metadataCache` would hand it over. */
function fileClassFrontmatter(name: string): unknown {
	const markdown = readFileSync(path.join(FILE_CLASSES, `${name}.md`), "utf8");
	const yaml = /^---\n([\s\S]*?)\n---/.exec(markdown)?.[1];
	return yaml === undefined ? undefined : parse(yaml);
}

export const generatedLookup: FileClassLookup = { getFileClassFrontmatter: fileClassFrontmatter };

/** The resolved, base-first chain of the FileClass generated for `entity`. */
export function generatedChain(entity: string): ParsedFileClass[] {
	return resolveFileClassChain(`fc-${entity}`, generatedLookup);
}
