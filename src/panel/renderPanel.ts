/**
 * renderPanel — dispatch to the correct per-kind renderer, or fall back to the
 * flat entity list when activeKind is "unknown" or has no registered renderer.
 *
 * PanelDeps — shared dependency surface for panel renderers.
 *
 * Renderers are pure DOM builders that accept a context snapshot. They don't
 * own navigation or state; callers inject these capabilities via PanelDeps.
 *
 * - `onOpenLink` — open a file or path in Obsidian (wired by SidebarView, T3.5)
 * - `collapsed`  — persistent collapsed-state map keyed by section id
 * - `toggleCollapse` — flip the collapsed state for a section id
 *
 * @ref SDD/ADR-2 (pure DOM renderers, deps injected from view)
 * @ref T3.5 (NativeScopingEngine dispatch wires onOpenLink)
 */

import type { NoteContext, EntityKind } from "scoping/NoteContext";
import { renderCharacter } from "panel/renderers/character";
import { renderLocation } from "panel/renderers/location";
import { renderObject } from "panel/renderers/object";
import { renderLore } from "panel/renderers/lore";
import { renderScene } from "panel/renderers/scene";
import { renderPlotline } from "panel/renderers/plotline";
import { renderBook } from "panel/renderers/book";

export interface PanelDeps {
	/** Open a linked note. The path is the TFile path or wikilink target. */
	onOpenLink: (path: string) => void;
	/** Section collapse state, keyed by a stable section identifier. */
	collapsed: Record<string, boolean>;
	/** Toggle the collapsed state for the given section id. */
	toggleCollapse: (sectionId: string) => void;
}

/** The common signature for all per-kind panel renderers. */
export type PanelRenderer = (ctx: NoteContext, el: HTMLElement, deps: PanelDeps) => void;

/**
 * Flat fallback renderer — used when activeKind is "unknown" or unmapped.
 * Renders a simple ul/li list of entity basenames (the original NativeScopingEngine behaviour).
 */
function renderFallback(ctx: NoteContext, el: HTMLElement, _deps: PanelDeps): void {
	const list = el.createEl("ul", { cls: "sf-native-entities" });

	for (const entity of ctx.entities) {
		const item = list.createEl("li", { cls: "sf-entity-item" });
		if (entity.field) {
			item.createEl("span", { cls: "sf-entity-field", text: entity.field });
			item.createEl("span", { cls: "sf-entity-sep", text: ": " });
		}
		item.createEl("span", { cls: "sf-entity-name", text: entity.file.basename });
		item.createEl("span", { cls: "sf-entity-kind", text: ` (${entity.kind})` });
	}
}

/**
 * Dispatch table: maps every known EntityKind to its panel renderer.
 * "character-fantasy" reuses the character renderer (per schema design).
 * "unknown" uses the flat fallback.
 */
const RENDERERS: Record<EntityKind, PanelRenderer> = {
	character: renderCharacter,
	location: renderLocation,
	object: renderObject,
	lore: renderLore,
	scene: renderScene,
	plotline: renderPlotline,
	book: renderBook,
	unknown: renderFallback,
};

/**
 * Render the context panel for the given NoteContext into `el`.
 * Dispatches to the per-kind renderer via RENDERERS, falling back to the
 * flat entity list for unknown kinds.
 */
export function renderPanel(ctx: NoteContext, el: HTMLElement, deps: PanelDeps): void {
	const renderer = RENDERERS[ctx.activeKind] ?? renderFallback;
	renderer(ctx, el, deps);
}
