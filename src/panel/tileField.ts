/**
 * tileField — which frontmatter field draws a note's profile tile.
 *
 * The tile follows the field's TYPE, not its name (PRD/F6, ADR-0002): the first
 * `Media`-typed field of the note's FileClass chain, in chain order. Only a note
 * that no FileClass applies to falls back to the names `kindFields.ts` ships
 * with (CON-3), which is how a vault without FileClasses keeps its portraits.
 *
 * Resolution is synchronous (it reads `metadataCache`), so the panel never
 * waits on it. It is not cached here: T6.4 owns the per-file FileClass cache,
 * and this goes through the same `FileClassSource` it will cache.
 *
 * @ref docs/XDD/specs/008-codex-surface/plan/phase-6.md — T6.2
 * @ref docs/XDD/adr/0002-fileclass-driven-editor.md
 */

import type { TFile } from "obsidian";
import { buildFieldModel } from "editor/fieldModel";
import { resolveFileClassChain } from "fileclass/fileClassReader";
import type { FileClassSource } from "fileclass/fileClassVault";
import { kindFields } from "panel/kindFields";
import type { EntityKind } from "scoping/NoteContext";

/**
 * The field that draws `file`'s tile, or `null` when it has none (the
 * FileClass declares no `Media` field, or the kind has no tile).
 *
 * `source` is absent when no FileClasses folder is configured — the native
 * fallback then, exactly as for a note no FileClass claims.
 */
export function resolveTileField(
	kind: EntityKind,
	file: TFile,
	frontmatter: Record<string, unknown>,
	source: FileClassSource | undefined,
): string | null {
	const native = kindFields(kind).image ?? null;
	const startName = source?.nameFor(file);
	if (source === undefined || startName === undefined) return native;

	const chain = resolveFileClassChain(startName, source.lookup);
	if (chain.length === 0) return native;

	// Undeclared keys are typed by value and never `Media`, so every section counts.
	for (const section of buildFieldModel(chain, frontmatter).sections) {
		const media = section.fields.find((f) => f.type === "Media");
		if (media) return media.name;
	}
	return null;
}
