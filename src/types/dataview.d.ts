/**
 * Minimal type declarations for the Dataview plugin API surface used by M2.
 *
 * NOT an npm dependency — these types are verified against the installed
 * Dataview main.js v0.5.68. NOT imported at runtime.
 *
 * @ref SDD/Interface Specifications — Dataview API shim
 * @ref SDD/ADR-2 (single sanctioned any-cast; version gate >=0.5.31)
 */

import type { Component } from "obsidian";

/**
 * Minimal Dataview API surface used by M2.
 * The installed Dataview v0.5.68 satisfies this interface.
 */
export interface DataviewApi {
	/** Execute a DQL query block, rendering into `el` scoped to `filePath`. */
	execute(
		source: string,
		el: HTMLElement,
		component: Component,
		filePath: string,
	): Promise<void>;

	/** Execute a DataviewJS block, rendering into `el` scoped to `filePath`. */
	executeJs(
		source: string,
		el: HTMLElement,
		component: Component,
		filePath: string,
	): Promise<void>;

	/** Semver version helper. */
	version: {
		satisfies(range: string): boolean;
	};

	/** Dataview settings (used to check if DataviewJS is enabled). */
	settings?: {
		enableDataviewJs?: boolean;
	};
}

/**
 * Shape of the undocumented plugin registry EngineRegistry reads (ADR-2).
 * Usage: app.plugins.plugins["dataview"]?.api, read via Reflect.get + narrowing
 *
 * Never used as a real runtime type — only for documentation purposes.
 */
export interface DataviewApp {
	plugins: {
		plugins: Record<string, { api?: DataviewApi } | undefined>;
	};
}
