/**
 * CodexBasesView — the one polymorphic Bases view type (ADR-2).
 *
 * Lives in src/bases/ (CON-3 firewall) because it extends BasesView, which
 * carries Bases typings. It is intentionally THIN: it maps BasesEntry[] →
 * plain CodexRow[] and delegates all DOM/grid work to codexGrid (pure DOM,
 * no Bases typings).
 *
 * NEVER cache BasesEntry between onDataUpdated calls (ADR-2): the Bases
 * runtime recreates both BasesQueryResult and BasesEntry on every update.
 * A cached reference is a stale/leak bug. Read this.data.data FRESH each call.
 *
 * @ref SDD/ADR-2   — one polymorphic type; category via config.get; NEVER cache BasesEntry
 * @ref SDD/CON-3   — Bases typings firewall (src/bases/ only)
 * @ref SDD/CON-4   — teardown → empty → render
 * @ref PRD/AC-F2.1 — category grid renders
 * @ref PRD/AC-F2.3 — empty-state shown
 * @ref PRD/AC-F2.4 — read-only
 */

import type { App, BasesEntry, BasesPropertyId } from "obsidian";
import { BasesView } from "obsidian";
import type { QueryController } from "obsidian";
import { buildCodexGrid } from "codex/codexGrid";
import type { CodexRow } from "codex/codexGrid";
import { kindFields } from "panel/kindFields";
import { isEntityKind } from "scoping/NoteContext";
import type { EntityKind } from "scoping/NoteContext";
import { CODEX_VIEW_ID } from "pluginConstants";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Dependencies injected at construction time (T3.3 supplies the real wiring). */
export interface CodexBasesViewDeps {
	app: App;
	/** Called when the user clicks a row. Receives the vault-relative file path. */
	onRowClick: (path: string) => void;
}

// ---------------------------------------------------------------------------
// CodexBasesView
// ---------------------------------------------------------------------------

/**
 * The one polymorphic Bases view for Story Forge (ADR-2).
 *
 * Constructor: `new CodexBasesView(controller, containerEl, deps)`
 *
 * T3.3 will wire this as the factory in BasesAdapter.registerCodexView,
 * injecting `onRowClick` → `SidebarView.showFile` (ADR-4).
 */
export class CodexBasesView extends BasesView {
	/** View type discriminant (required by BasesView abstract contract). */
	readonly type = CODEX_VIEW_ID;

	/** The element this view renders into (supplied by the Bases runtime). */
	private readonly containerEl: HTMLElement;

	/** Injected deps (app + row-click handler). */
	private readonly deps: CodexBasesViewDeps;

	/** CON-4: set to true on unload; guards onDataUpdated against post-teardown repaints. */
	private disposed = false;

	constructor(
		controller: QueryController,
		containerEl: HTMLElement,
		deps: CodexBasesViewDeps,
	) {
		super(controller);
		this.containerEl = containerEl;
		this.deps = deps;
		// CON-4: mark disposed when Obsidian unloads this Component.
		this.register(() => { this.disposed = true; });
	}

	/**
	 * Called by the Bases runtime whenever query results change.
	 *
	 * ADR-2 invariant: read this.data.data FRESH every call — never store a
	 * BasesEntry reference between calls. The runtime recreates entries and
	 * BasesQueryResult on every update; a cached reference is stale/leaked.
	 *
	 * CON-4: empty the container before repaint.
	 */
	onDataUpdated(): void {
		// CON-4: no stale content bleed after teardown.
		if (this.disposed) return;

		// CON-4: empty before repaint.
		this.containerEl.innerHTML = "";

		// ADR-2: read this.data FRESH — no cached references.
		const entries: BasesEntry[] = this.data.data;

		// Resolve the category from config (ADR-2: discriminant via config.get).
		const rawCategory: unknown = this.config.get("category");
		const category: EntityKind = isEntityKind(rawCategory) ? rawCategory : "unknown";

		// Map BasesEntry[] → plain CodexRow[] (no Bases typings cross this boundary).
		const rows: CodexRow[] = mapEntriesToRows(entries, category);

		buildCodexGrid(this.containerEl, {
			category,
			rows,
			onRowClick: this.deps.onRowClick,
		});
	}
}

// ---------------------------------------------------------------------------
// Mapping helper — BasesEntry[] → CodexRow[] (stays inside src/bases/)
// ---------------------------------------------------------------------------

/**
 * Map BasesEntry[] → plain CodexRow[].
 *
 * This function is the ONLY place in src/bases/ where BasesEntry members are
 * accessed. The resulting CodexRow[] contains no Bases typings, which is what
 * makes it safe to pass to codexGrid (CON-3).
 *
 * ADR-2: we access the entries here and immediately extract plain values —
 * the resulting CodexRow[] holds no reference to any BasesEntry.
 *
 * Note: kindFields returns plain string IDs (e.g. "role", "status"). The Bases
 * API expects BasesPropertyId (`${BasesPropertyType}.${string}`). We cast to
 * BasesPropertyId — the Bases runtime resolves plain property names at runtime
 * (this is the same pattern used by other BasesView implementations).
 */
function mapEntriesToRows(entries: BasesEntry[], category: EntityKind): CodexRow[] {
	const { facts, relations } = kindFields(category);
	const propertyIds = [...facts, ...relations];

	return entries.map((entry) => {
		const fields: Record<string, unknown> = {};
		for (const id of propertyIds) {
			// getValue returns a Bases `Value` wrapper (or null), NOT a scalar.
			// toString() is the display form — JSON.stringify would emit the raw
			// wrapper (e.g. {"icon":…}). This is the only place Value is touched
			// (CON-3): the resulting CodexRow carries plain strings only.
			const v = entry.getValue(id as BasesPropertyId);
			fields[id] = v == null ? null : v.toString();
		}
		return { path: entry.file.path, fields };
	});
}
