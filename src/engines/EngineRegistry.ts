/**
 * getDataviewApi  — reads the Dataview plugin API (version-gated).
 * getDvSettings   — reads Dataview's runtime settings (enableDataviewJs).
 * buildEngineRegistry — constructs the wired registry for SidebarView.
 *
 * ADR-2: ALL reads of the undocumented `app.plugins` registry are confined to
 * THIS file. getDataviewApi and getDvSettings are the ONLY two surfaces; both
 * access cross-plugin state via the Obsidian community plugin convention
 * (plugins.plugins["dataview"]), read as `unknown` and narrowed — no `any`.
 *
 * @ref SDD/ADR-2 (feature detection; any-cast isolation; version gate >=0.5.31;
 *              re-read per render — no cached reference)
 * @ref SDD/ADR-1 (EngineRegistry wired-only; may be empty; native NOT in registry)
 * @ref PRD/AC-F1.3 (no crash when Dataview absent)
 */

import type { App } from "obsidian";
import type { DataviewApi } from "types/dataview";
import { EngineRegistry } from "engines/QueryEngine";
import type { QueryEngine } from "engines/QueryEngine";
import type { ViewRecord } from "store/types";
import { DataviewDqlEngine } from "engines/DataviewDqlEngine";
import { DataviewJsEngine } from "engines/DataviewJsEngine";
import { BasesFenceEngine } from "engines/BasesFenceEngine";

/**
 * Read the Dataview plugin API from the app's plugin registry.
 *
 * Registry read #1 of 2 (both in this file, through dataviewPlugin()).
 * Accessing cross-plugin API via plugins.plugins["dataview"]?.api
 * is the Obsidian community plugin convention.
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
	const api = dataviewPlugin(app)?.api;
	if (!api || typeof api !== "object") return undefined;
	const typed = api as DataviewApi;
	if (!typed.version?.satisfies?.(">=0.5.31")) return undefined;
	return typed;
}

/**
 * Read Dataview's runtime settings from the app's plugin registry.
 *
 * Registry read #2 of 2 (both in this file, through dataviewPlugin()).
 * Used by ConsentGate (via DvSettingsReader) to check whether DataviewJS
 * execution is enabled in Dataview's own settings panel. Does NOT require the
 * version gate — we need raw settings access independent of API readiness.
 *
 * Returns `{ enableDataviewJs: false }` when Dataview is absent.
 * Re-read on every call — no cached reference (same rationale as getDataviewApi).
 */
export function getDvSettings(app: App): { enableDataviewJs: boolean } {
	const api = dataviewPlugin(app)?.api;
	const settings = isRecord(api) ? api.settings : undefined;
	const enabled = isRecord(settings) ? settings.enableDataviewJs : undefined;
	return { enableDataviewJs: enabled === true };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

/**
 * Dataview's entry in `app.plugins.plugins`, or `undefined` when any step is
 * missing. `App` does not declare `plugins` (it is undocumented), so the
 * registry is read with `Reflect.get` as `unknown` and narrowed one level at a
 * time instead of casting `app`.
 */
function dataviewPlugin(app: App): Record<string, unknown> | undefined {
	const registry: unknown = Reflect.get(app, "plugins");
	const plugins = isRecord(registry) ? registry.plugins : undefined;
	const dataview = isRecord(plugins) ? plugins["dataview"] : undefined;
	return isRecord(dataview) ? dataview : undefined;
}

/**
 * One engine of its own for `kind`, or `undefined` when it is not wired (Dataview absent or too
 * old; Bases off). For a host that must not share the registry's instances (the Anvil's embed).
 */
export function createEngineFor(app: App, kind: ViewRecord["engine"], basesAvailable: boolean): QueryEngine | undefined {
	switch (kind) {
		case "bases":
			return basesAvailable ? new BasesFenceEngine(app) : undefined;
		case "dataview-dql":
			return getDataviewApi(app) ? new DataviewDqlEngine(app) : undefined;
		case "dataviewjs":
			return getDataviewApi(app) ? new DataviewJsEngine(app) : undefined;
	}
}

/**
 * Build the EngineRegistry for the plugin lifecycle.
 *
 * Registers DataviewDqlEngine + DataviewJsEngine only when Dataview is present
 * and version >=0.5.31. Registers BasesFenceEngine when basesAvailable is true
 * (the boolean captured once at onload via registerCodexView — ADR-8).
 *
 * The second parameter is optional (defaults to false) — an engine is only added
 * when its runtime is confirmed present; absence is the safe fallback.
 *
 * Called from main.ts:
 *   - once in workspace.onLayoutReady (initial detection)
 *   - again in the "dataview:api-ready" late-join handler (T4.4)
 *
 * @param basesAvailable - cached result of registerCodexView (ADR-8); defaults false
 */
export function buildEngineRegistry(app: App, basesAvailable = false): EngineRegistry {
	const dvApi = getDataviewApi(app);
	const engines: QueryEngine[] = [];

	if (!dvApi) {
		console.debug("[StoryForge] Dataview absent or version < 0.5.31 — Dataview engines skipped");
	} else {
		engines.push(new DataviewDqlEngine(app));
		engines.push(new DataviewJsEngine(app));
	}

	if (basesAvailable) {
		engines.push(new BasesFenceEngine(app));
	}

	return new EngineRegistry(engines);
}
