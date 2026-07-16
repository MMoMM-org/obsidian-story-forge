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

		// Substitute [[this]] → [[<active-note-path-without-.md>]] (T3.3-this).
		// Dataview does NOT treat the literal [[this]] token as a self-reference —
		// it resolves it as a link to a note actually named "this", which is always
		// empty. We rewrite the exact token [[this]] to the full-path wikilink of
		// the active note (without .md extension) so Dataview resolves it correctly.
		// Limitation: [[this|alias]] and [[this#heading]] are NOT substituted; only
		// the exact [[this]] token is matched. Use the literal note name for those.
		const activeLink = "[[" + ctx.activeFile.path.replace(/\.md$/, "") + "]]";
		const queryBody = block.body.replace(/\[\[this\]\]/g, activeLink);

		// Component lifecycle: new Component + load() BEFORE passing to dvApi (ADR-7 / implementation gotcha)
		this.component = new Component();
		this.component.load();

		// KEY: filePath is the PANEL SUBJECT's path, NOT view.source (ADR-3)
		try {
			await dvApi.execute(queryBody, el, this.component, ctx.activeFile.path);
		} catch (err) {
			// Self-clean the loaded Component so it is never leaked on error (W1).
			// teardown() will not be called by the caller after a throw, so we must
			// unload here before re-throwing.
			this.component?.unload();
			this.component = null;
			throw err;
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
