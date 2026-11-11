/**
 * BasesFenceEngine — renders .base YAML views via a ```base``` fence.
 *
 * @ref SDD/ADR-1  — BasesFenceEngine; bases fence render via MarkdownRenderer
 * @ref SDD/ADR-5  — kind:"view": ViewRecord.source = raw .base YAML
 * @ref SDD/ADR-35 — kind:"collection": ViewRecord.source = vault path of the .base file
 * @ref SDD/ADR-7  — Component lifecycle; component.load() before async render
 * @ref PRD/AC-F1.1 — fence renders read-only in the container
 * @ref PRD/AC-F1.3 — leak-free teardown
 * @ref PRD/AC-F1.5 — missing-field tolerated (fence handles blank/omitted cell)
 * @ref SDD/CON-3  — no Bases typings here; import renderBaseFence, not Bases types
 *
 * Two source shapes, chosen by `kind` (closed in T7.1, the gap T3.3 opened):
 *   - kind:"view"       → `source` IS the raw .base YAML (ADR-5).
 *   - kind:"collection" → `source` is a vault PATH to the .base file (ADR-35:
 *     the vault file is the single copy). The file is read on every render, so
 *     a hand-edit shows up without re-importing. A missing file is refused with
 *     a reason naming the path. The path itself never reaches the YAML parser.
 * The branch lives here, not in SidebarView's dispatch, because "where does
 * this engine's YAML come from" is the engine's question. Dispatch still
 * selects by `engine`, and every other engine reads `source` as a note path.
 */

import { Component } from "obsidian";
import type { App } from "obsidian";
import type { NoteContext } from "scoping/NoteContext";
import type { ViewRecord } from "store/types";
import type { QueryEngine } from "engines/QueryEngine";
import { renderBaseFence } from "bases/basesFence";

export class BasesFenceEngine implements QueryEngine {
	readonly kind = "bases" as const;
	private component: Component | null = null;

	constructor(private readonly app: App) {}

	async render(view: ViewRecord, ctx: NoteContext, el: HTMLElement): Promise<void> {
		const yaml = await this._readYaml(view);
		this.component = new Component();
		this.component.load(); // load BEFORE the async render (ADR-7)

		try {
			await renderBaseFence(this.app, yaml, el, ctx.activeFile.path, this.component);
		} catch (e) {
			this.component?.unload(); // self-clean on throw; teardown() won't be called
			this.component = null;
			throw e;
		}
	}

	/** The .base YAML for `view` — see the file header for the two source shapes. */
	private async _readYaml(view: ViewRecord): Promise<string> {
		if (view.kind !== "collection") return view.source;
		const file = this.app.vault.getFileByPath(view.source);
		if (!file) throw new Error(`Collection file not found: ${view.source}`);
		return this.app.vault.cachedRead(file);
	}

	/**
	 * Unload the Component and null the reference.
	 * Safe to call before any render() (no-op when component is null).
	 */
	teardown(): void {
		this.component?.unload();
		this.component = null;
	}
}
