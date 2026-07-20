/**
 * NativeScopingEngine — always-available fallback engine.
 *
 * Dispatches to per-kind panel renderers via renderPanel (T3.5).
 * Wires PanelDeps (onOpenLink, collapsed, toggleCollapse) from the injected App.
 * NOT a registry entry — held directly on SidebarView as the fallback.
 *
 * @ref SDD/ADR-1 (native fallback held separately; NOT in EngineRegistry)
 * @ref SDD/ADR-2 (PanelDeps injected; engine wires onOpenLink)
 * @ref SDD/ADR-7 (teardown order: teardown → body.empty() → render)
 * @ref PRD/AC-F1.4
 * @ref T3.5
 */

import type { App } from "obsidian";
import type { NoteContext } from "scoping/NoteContext";
import type { ViewRecord } from "store/types";
import type { QueryEngine } from "engines/QueryEngine";
import { renderPanel } from "panel/renderPanel";
import type { PanelDeps } from "panel/renderPanel";

export class NativeScopingEngine implements QueryEngine {
	/** Discriminant sentinel — "native" is NOT a ViewRecord.engine value. */
	readonly kind = "native" as const;

	/** In-memory collapse state, persists across re-renders on this engine instance. */
	readonly collapsed: Record<string, boolean> = {};

	/** Reference to the last rendered container, for teardown. */
	private lastEl: HTMLElement | null = null;

	/** Built deps for last render — exposed as _lastDeps for testing. */
	_lastDeps: PanelDeps | null = null;

	constructor(private readonly app: App) {}

	/**
	 * Render entity context from NoteContext into `el` using the per-kind renderer.
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

		const deps = this._buildDeps(ctx, el);
		this._lastDeps = deps;

		renderPanel(ctx, el, deps);
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
		this._lastDeps = null;
	}

	// ---------------------------------------------------------------------------
	// Private helpers
	// ---------------------------------------------------------------------------

	/** Build the PanelDeps for a render pass. */
	private _buildDeps(ctx: NoteContext, el: HTMLElement): PanelDeps {
		const deps: PanelDeps = {
			onOpenLink: (path: string): void => {
				void this.app.workspace.openLinkText(path, ctx.activeFile.path, false);
			},
			collapsed: this.collapsed,
			toggleCollapse: (sectionId: string): void => {
				this.collapsed[sectionId] = !this.collapsed[sectionId];
				this._reRender(el, ctx);
			},
		};
		return deps;
	}

	/** Re-render into the same el after a collapse state change. */
	private _reRender(el: HTMLElement, ctx: NoteContext): void {
		el.empty();
		const deps = this._buildDeps(ctx, el);
		this._lastDeps = deps;
		renderPanel(ctx, el, deps);
	}
}
