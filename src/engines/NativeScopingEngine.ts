/**
 * NativeScopingEngine — always-available fallback engine.
 *
 * Renders the NoteContext entity list using XSS-safe DOM construction (createEl).
 * NOT a registry entry — held directly on SidebarView as the fallback.
 *
 * @ref SDD/ADR-1 (native fallback held separately; NOT in EngineRegistry)
 * @ref SDD/Runtime View — Flow E (native fallback when Dataview absent)
 * @ref SDD/ADR-7 (teardown order: teardown → body.empty() → render)
 * @ref PRD/AC-F1.4
 */

import type { NoteContext } from "scoping/NoteContext";
import type { ViewRecord } from "store/types";
import type { QueryEngine } from "engines/QueryEngine";

export class NativeScopingEngine implements QueryEngine {
	/** Discriminant sentinel — "native" is NOT a ViewRecord.engine value. */
	readonly kind = "native" as const;

	/** Reference to the last rendered container, for teardown. */
	private lastEl: HTMLElement | null = null;

	/**
	 * Render entity context from NoteContext into `el` using XSS-safe DOM construction.
	 *
	 * @param view  ViewRecord (may be null when no view is selected) — not used for rendering content.
	 * @param ctx   NoteContext with entities to render.
	 * @param el    Container element to render into.
	 */
	async render(
		_view: ViewRecord | null,
		ctx: NoteContext,
		el: HTMLElement,
	): Promise<void> {
		this.lastEl = el;

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
	 * Empty the last rendered container.
	 * Safe to call before any render() (no-op when lastEl is null).
	 */
	teardown(): void {
		if (this.lastEl) {
			this.lastEl.empty();
			this.lastEl = null;
		}
	}
}
