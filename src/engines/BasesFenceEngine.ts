/**
 * BasesFenceEngine — renders .base YAML views via a ```base``` fence.
 *
 * @ref SDD/ADR-1  — BasesFenceEngine; bases fence render via MarkdownRenderer
 * @ref SDD/ADR-5  — ViewRecord.source = raw .base YAML for the "bases" engine
 * @ref SDD/ADR-7  — Component lifecycle; component.load() before async render
 * @ref PRD/AC-F1.1 — fence renders read-only in the container
 * @ref PRD/AC-F1.3 — leak-free teardown
 * @ref PRD/AC-F1.5 — missing-field tolerated (fence handles blank/omitted cell)
 * @ref SDD/CON-3  — no Bases typings here; import renderBaseFence, not Bases types
 *
 * KNOWN GAP (ADR-35, opened by T3.3 — not this file's to close): render()
 * assumes `view.source` is raw .base YAML. That is only true for kind:"view"
 * records. A kind:"collection" record's `source` is a vault PATH
 * (src/catalog/CatalogService.ts), not YAML — feeding it to renderBaseFence
 * would hand a path to the YAML parser. Engine dispatch (SidebarView →
 * EngineRegistry.get(view.engine)) branches on `engine` only, never on `kind`,
 * so nothing today stops a kind:"collection" record from reaching here.
 * Unreachable in practice right now — the catalog ships zero entries and F7's
 * surface-binding UI does not exist yet — but the contract is broken and no
 * plan task owns the fix. Do NOT close this gap by making render() read vault
 * files; that is async file IO in a render path and belongs to a future task.
 * Must be closed before any kind:"collection" record is bound to a surface
 * (PRD F7).
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
		// Assumes raw .base YAML — true only for kind:"view" records. A
		// kind:"collection" record's source is a vault path, not YAML; see the
		// KNOWN GAP note in the file header (ADR-35).
		const yaml = view.source;
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

	/**
	 * Unload the Component and null the reference.
	 * Safe to call before any render() (no-op when component is null).
	 */
	teardown(): void {
		this.component?.unload();
		this.component = null;
	}
}
