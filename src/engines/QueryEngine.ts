/**
 * QueryEngine — the M2 render contract.
 * EngineRegistry — discriminant map for WIRED engines.
 *
 * @ref SDD/Interface Specifications — QueryEngine + EngineRegistry
 * @ref SDD/ADR-1 (registry wired-only; native fallback NOT in registry;
 *              registry may be empty; NativeScopingEngine held on SidebarView)
 */

import type { NoteContext } from "scoping/NoteContext";
import type { ViewRecord } from "store/types";

// ---------------------------------------------------------------------------
// QueryEngine interface
// ---------------------------------------------------------------------------

/**
 * QueryEngine — the M2 render contract.
 *
 * Each engine owns the lifecycle of the content it renders into `el`.
 * SidebarView calls teardown() before every re-render and in onClose().
 * Engines register their own event listeners on the injected Component
 * so Obsidian auto-cleans them on component.unload() (ADR-7).
 */
export interface QueryEngine {
	/** Discriminant matching ViewRecord.engine (or "native" for the fallback). */
	readonly kind: ViewRecord["engine"] | "native";

	/**
	 * Render view content into `el`, scoped to `ctx.activeFile`.
	 * Must be idempotent: called after teardown() leaves `el` empty.
	 *
	 * @param view  The resolved, consented ViewRecord — or null for the native fallback.
	 * @param ctx   The panel subject's NoteContext (from ScopingService).
	 * @param el    Empty container element owned by SidebarView.
	 */
	render(view: ViewRecord | null, ctx: NoteContext, el: HTMLElement): Promise<void>;

	/**
	 * Unload the engine's Component and remove any DOM nodes it added to `el`.
	 * Called before every re-render and in SidebarView.onClose().
	 * Must be safe to call when render() has never been called.
	 */
	teardown(): void;
}

// ---------------------------------------------------------------------------
// EngineRegistry class
// ---------------------------------------------------------------------------

/**
 * EngineRegistry — maps a ViewRecord.engine discriminant to the WIRED engine
 * instance responsible for rendering views of that kind.
 *
 * The registry holds ONLY real, wired engines:
 *   - "dataview-dql"  → DataviewDqlEngine   (registered only when Dataview present + version-ok)
 *   - "dataviewjs"    → DataviewJsEngine    (registered only when Dataview present + version-ok)
 * The "bases" slot is intentionally UNWIRED in M2 (Won't-have; M4 fills it) —
 * get("bases") returns undefined.
 *
 * The registry is ALLOWED TO BE EMPTY (e.g. Dataview absent). It does NOT hold
 * the native fallback: NativeScopingEngine is held separately by SidebarView
 * and always exists independently of the registry (see the render pipeline).
 *
 * Constructed in main.ts; injected into SidebarView and ConsentGate.
 */
export class EngineRegistry {
	private readonly map: Map<ViewRecord["engine"], QueryEngine>;

	constructor(engines: QueryEngine[]) {
		this.map = new Map(
			engines
				.filter(
					(e): e is QueryEngine & { kind: ViewRecord["engine"] } =>
						e.kind !== "native",
				)
				.map((e) => [e.kind, e]),
		);
	}

	/**
	 * Returns the wired engine for the given kind, or undefined if none is wired
	 * (Dataview absent for a dataview-* kind, or the unwired "bases" kind).
	 * Callers fall back to the separately-held NativeScopingEngine.
	 */
	get(kind: ViewRecord["engine"]): QueryEngine | undefined {
		return this.map.get(kind);
	}
}
