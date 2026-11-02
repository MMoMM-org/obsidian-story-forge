/**
 * cardTileField — the host-side answer to "which field draws this Card's tile".
 *
 * A Card is free of `App` (ADR-30), so the host resolves the field and hands it
 * over as `CardRenderDeps.tileField`. Both backends (the Anvil's Codex tab and a
 * standalone `.base`) build it here, so they cannot disagree with each other or
 * with the panel: it is `resolveTileField`, the panel's own function (T6.2).
 *
 * Cost: a grid asks once per card, and the plugin's one FileClass cache answers
 * them all from the same scan (T6.4).
 *
 * @ref docs/XDD/specs/008-codex-surface/plan/phase-6.md — T6.2b
 */

import type { TFile } from "obsidian";
import type { CardEntry } from "codex/cardRegistry";
import { entryKind } from "codex/cards/shared";
import type { FileClassSource } from "fileclass/fileClassVault";
import { kindFields } from "panel/kindFields";
import { resolveTileField } from "panel/tileField";

/** The shipped names only: what a host without FileClasses or a file to read gives. */
export function nativeTileField(entry: CardEntry): string | null {
	return kindFields(entryKind(entry)).image ?? null;
}

/**
 * A tile-field resolver over one host's files.
 *
 * @param source   absent means every entry takes the native names
 * @param fileFor  the entry's file, or `null` when the host has none
 */
export function createCardTileField(
	source: FileClassSource | undefined,
	fileFor: (path: string) => TFile | null,
): (entry: CardEntry) => string | null {
	return (entry: CardEntry): string | null => {
		const file = fileFor(entry.path);
		if (file === null) return nativeTileField(entry);
		return resolveTileField(entryKind(entry), file, source);
	};
}
