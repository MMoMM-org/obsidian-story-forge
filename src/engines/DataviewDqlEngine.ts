/**
 * DataviewDqlEngine — renders DQL (Dataview Query Language) views.
 *
 * @ref SDD/ADR-3 (filePath = ctx.activeFile.path, NOT view.source)
 * @ref SDD/ADR-7 (Component lifecycle; component.load() before dvApi.execute)
 * @ref SDD/Implementation Examples — filePath scoping in DataviewDqlEngine
 * @ref PRD/AC-F1.1 (DQL renders scoped to subject path)
 */

import { Component } from "obsidian";
import type { App } from "obsidian";
import type { NoteContext } from "scoping/NoteContext";
import type { ViewRecord } from "store/types";
import type { QueryEngine } from "engines/QueryEngine";
import { getDataviewApi } from "engines/EngineRegistry";
import { readFencedBlock } from "import/fencedBlock";

export class DataviewDqlEngine implements QueryEngine {
	readonly kind = "dataview-dql" as const;
	private component: Component | null = null;

	constructor(private readonly app: App) {}

	async render(view: ViewRecord, ctx: NoteContext, el: HTMLElement): Promise<void> {
		// Re-read dvApi on every render — no cached reference (ADR-2)
		const dvApi = getDataviewApi(this.app);
		if (!dvApi) {
			el.createEl("p", { text: "Dataview not available", cls: "sf-engine-missing" });
			return;
		}

		// Read the query text fresh from the view-definition note (ADR-3)
		const block = await readFencedBlock(this.app, view.source);
		if (block === null) {
			el.createEl("p", { text: "View source missing or unreadable", cls: "sf-source-missing" });
			return;
		}

		// Component lifecycle: new Component + load() BEFORE passing to dvApi (ADR-7 / implementation gotcha)
		this.component = new Component();
		this.component.load();

		// KEY: filePath is the PANEL SUBJECT's path, NOT view.source (ADR-3)
		await dvApi.execute(block.body, el, this.component, ctx.activeFile.path);
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
