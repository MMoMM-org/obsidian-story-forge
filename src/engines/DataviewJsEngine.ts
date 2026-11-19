/**
 * DataviewJsEngine — renders DataviewJS (arbitrary JavaScript) views.
 * Desktop-only: Platform.isMobile guard (belt-and-suspenders; ConsentGate
 * also blocks DVJS on mobile, but the engine is independently safe).
 *
 * @ref SDD/CON-7 (DataviewJS desktop-only; Platform.isMobile guard)
 * @ref SDD/ADR-3 (filePath = ctx.activeFile.path, NOT view.source)
 * @ref SDD/ADR-4 (DataviewJS desktop-only guard at engine level too)
 * @ref SDD/ADR-7 (Component lifecycle)
 * @ref PRD/AC-F1.2 (DVJS renders scoped to subject path)
 * @ref PRD/AC-F1.5 (enableDataviewJs:false prompt)
 * @ref PRD/AC-F1.6 (platform-restriction state on mobile)
 */

import { Component, Platform } from "obsidian";
import type { App } from "obsidian";
import type { NoteContext } from "scoping/NoteContext";
import type { ViewRecord } from "store/types";
import type { QueryEngine } from "engines/QueryEngine";
import { getDataviewApi } from "engines/EngineRegistry";
import { readFencedBlock } from "import/fencedBlock";

/**
 * Read whether DataviewJS is enabled in Dataview's settings.
 *
 * Delegates to getDataviewApi() — no additional any-cast here (CON-8).
 * Returns false when Dataview is absent or the setting is not configured.
 */
export function isDvJsEnabled(app: App): boolean {
	const dvApi = getDataviewApi(app);
	// The shim types settings as optional — narrow to boolean
	return dvApi?.settings?.enableDataviewJs === true;
}

export class DataviewJsEngine implements QueryEngine {
	readonly kind = "dataviewjs" as const;
	private component: Component | null = null;

	constructor(private readonly app: App) {}

	async render(view: ViewRecord, ctx: NoteContext, el: HTMLElement): Promise<void> {
		// Belt-and-suspenders mobile guard (ConsentGate also blocks this, but
		// the engine must be independently safe — CON-7 / ADR-4)
		if (Platform.isMobile) {
			el.createEl("p", {
				text: "DataviewJS collections are not available on mobile.",
				cls: "sf-platform-restriction",
			});
			return;
		}

		// Re-read dvApi on every render — no cached reference (ADR-2)
		const dvApi = getDataviewApi(this.app);
		if (!dvApi) {
			el.createEl("p", { text: "Dataview not available", cls: "sf-engine-missing" });
			return;
		}

		// DataviewJS disabled in Dataview settings
		if (!isDvJsEnabled(this.app)) {
			el.createEl("p", {
				text: "JavaScript queries are disabled in the query engine settings",
				cls: "sf-dvjs-off",
			});
			return;
		}

		// Read the query text fresh from the view-definition note (ADR-3)
		const block = await readFencedBlock(this.app, view.source);
		if (block === null) {
			el.createEl("p", { text: "Collection source missing or unreadable", cls: "sf-source-missing" });
			return;
		}

		// Component lifecycle: new Component + load() BEFORE passing to dvApi (ADR-7)
		this.component = new Component();
		this.component.load();

		// KEY: filePath is the PANEL SUBJECT's path, NOT view.source (ADR-3)
		try {
			await dvApi.executeJs(block.body, el, this.component, ctx.activeFile.path);
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
