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
		const yaml = view.source; // bases record source = raw .base YAML (ADR-5)
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
