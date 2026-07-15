/**
 * getDataviewApi — the ONLY sanctioned `app as any` cast (CON-8, ADR-2).
 * buildEngineRegistry — constructs the wired registry for SidebarView.
 *
 * @ref SDD/ADR-2 (feature detection; single any-cast; version gate >=0.5.31;
 *              re-read per render — no cached reference)
 * @ref SDD/ADR-1 (EngineRegistry wired-only; may be empty; native NOT in registry)
 * @ref PRD/AC-F1.3 (no crash when Dataview absent)
 */

import type { App } from "obsidian";
import type { DataviewApi } from "types/dataview";
import { EngineRegistry } from "engines/QueryEngine";
import { DataviewDqlEngine } from "engines/DataviewDqlEngine";
import { DataviewJsEngine } from "engines/DataviewJsEngine";

/**
 * Read the Dataview plugin API from the app's plugin registry.
 *
 * This is the ONLY permitted `app as any` cast in the entire codebase (CON-8).
 *
 * Returns undefined when:
 *  - Dataview is not installed (plugins.plugins["dataview"] absent)
 *  - Dataview's api is absent
 *  - dvApi.version.satisfies(">=0.5.31") returns false
 *
 * Re-read on every render call — no cached reference (ADR-2 gotcha:
 * Dataview can be disabled at runtime).
 */
export function getDataviewApi(app: App): DataviewApi | undefined {
	// CON-8 / ADR-2: the ONLY sanctioned any-cast in the codebase.
	// Accessing cross-plugin API via plugins.plugins["dataview"]?.api
	// is the Obsidian community plugin convention.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
	const api: unknown = (app as any).plugins?.plugins?.["dataview"]?.api;
	if (!api || typeof api !== "object") return undefined;
	const typed = api as DataviewApi;
	if (!typed.version.satisfies(">=0.5.31")) return undefined;
	return typed;
}

/**
 * Build the EngineRegistry for the plugin lifecycle.
 *
 * Registers DataviewDqlEngine + DataviewJsEngine only when Dataview is present
 * and version >=0.5.31. Returns an empty registry when Dataview is absent
 * (no crash — callers handle undefined from get()).
 *
 * Called from main.ts:
 *   - once in workspace.onLayoutReady (initial detection)
 *   - again in the "dataview:api-ready" late-join handler (T4.4)
 */
export function buildEngineRegistry(app: App): EngineRegistry {
	const dvApi = getDataviewApi(app);

	if (!dvApi) {
		console.debug("[StoryForge] Dataview absent or version < 0.5.31 — engine registry empty");
		return new EngineRegistry([]);
	}

	return new EngineRegistry([
		new DataviewDqlEngine(app),
		new DataviewJsEngine(app),
	]);
}
