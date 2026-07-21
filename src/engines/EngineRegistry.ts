/**
 * getDataviewApi  — reads the Dataview plugin API (version-gated).
 * getDvSettings   — reads Dataview's runtime settings (enableDataviewJs).
 * buildEngineRegistry — constructs the wired registry for SidebarView.
 *
 * CON-8 / ADR-2: ALL `app as any` casts in the codebase are confined to THIS
 * file. getDataviewApi and getDvSettings are the ONLY two sanctioned any-cast
 * surfaces; both access cross-plugin state via the Obsidian community plugin
 * convention (plugins.plugins["dataview"]). No other file may cast app to any.
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
import { DataviewDqlEngine } from "engines/DataviewDqlEngine";
import { DataviewJsEngine } from "engines/DataviewJsEngine";
import { BasesFenceEngine } from "engines/BasesFenceEngine";

/**
 * Read the Dataview plugin API from the app's plugin registry.
 *
 * CON-8 sanctioned any-cast #1 of 2 (both in this file).
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
	// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
	const api: unknown = (app as any).plugins?.plugins?.["dataview"]?.api;
	if (!api || typeof api !== "object") return undefined;
	const typed = api as DataviewApi;
	if (!typed.version?.satisfies?.(">=0.5.31")) return undefined;
	return typed;
}

/**
 * Read Dataview's runtime settings from the app's plugin registry.
 *
 * CON-8 sanctioned any-cast #2 of 2 (both in this file).
 * Used by ConsentGate (via DvSettingsReader) to check whether DataviewJS
 * execution is enabled in Dataview's own settings panel. Does NOT require the
 * version gate — we need raw settings access independent of API readiness.
 *
 * Returns `{ enableDataviewJs: false }` when Dataview is absent.
 * Re-read on every call — no cached reference (same rationale as getDataviewApi).
 */
export function getDvSettings(app: App): { enableDataviewJs: boolean } {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
	const dv = (app as any).plugins?.plugins?.["dataview"];
	// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
	const enabled: unknown = dv?.api?.settings?.enableDataviewJs;
	return { enableDataviewJs: enabled === true };
}

/**
 * Build the EngineRegistry for the plugin lifecycle.
 *
 * Registers DataviewDqlEngine + DataviewJsEngine only when Dataview is present
 * and version >=0.5.31. Registers BasesFenceEngine when basesAvailable is true
 * (the boolean captured once at onload via registerCodexView — ADR-8).
 *
 * The second parameter is optional (defaults to false) for backward-compatibility:
 * existing callers that pass only `app` get no bases engine, no breakage.
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
