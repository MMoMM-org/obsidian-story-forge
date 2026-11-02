/**
 * cardTileField — the host-side answer to "which field draws this Card's tile".
 *
 * A Card is free of `App` (ADR-30), so the host resolves the field and hands it
 * over as `CardRenderDeps.tileField`. Both backends (the Anvil's Codex tab and a
 * standalone `.base`) build it here, so they cannot disagree with each other or
 * with the panel: it is `resolveTileField`, the panel's own function (T6.2).
 *
 * Cost: a grid asks once per card. A note with no `fileClass` key makes
 * `FileClassSource.nameFor` scan the vault, so each pass builds ONE snapshot
 * source, and the scan runs once per render, not once per card.
 *
 * @ref docs/XDD/specs/008-codex-surface/plan/phase-6.md — T6.2b
 */

import type { App, TFile } from "obsidian";
import type { CardEntry } from "codex/cardRegistry";
import { entryKind } from "codex/cards/shared";
import { createFileClassSource } from "fileclass/fileClassVault";
import { kindFields } from "panel/kindFields";
import { resolveTileField } from "panel/tileField";

/** The shipped names only: what a host without FileClasses or a file to read gives. */
export function nativeTileField(entry: CardEntry): string | null {
	return kindFields(entryKind(entry)).image ?? null;
}

/**
 * A tile-field resolver for ONE render pass. Call it again for the next pass.
 *
 * @param getFileClassesFolder  absent means every entry takes the native names
 * @param fileFor               the entry's file, or `null` when the host has none
 */
export function createCardTileField(
	app: App,
	getFileClassesFolder: (() => string) | undefined,
	fileFor: (path: string) => TFile | null,
): (entry: CardEntry) => string | null {
	const source = getFileClassesFolder
		? createFileClassSource(app, getFileClassesFolder, { snapshot: true })
		: undefined;
	return (entry: CardEntry): string | null => {
		const file = fileFor(entry.path);
		if (file === null) return nativeTileField(entry);
		return resolveTileField(entryKind(entry), file, source);
	};
}
