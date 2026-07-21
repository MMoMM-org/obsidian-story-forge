/**
 * EngineRegistry + getDataviewApi + buildEngineRegistry tests — T3.2 (RED first).
 *
 * Tests:
 *  - getDataviewApi returns the api when Dataview is present and version >=0.5.31
 *  - getDataviewApi returns undefined when Dataview plugin is absent
 *  - getDataviewApi returns undefined when version.satisfies(">=0.5.31") returns false
 *  - buildEngineRegistry registers both engines when Dataview present+version-ok
 *  - buildEngineRegistry returns empty registry when Dataview absent
 *  - registered engines have correct kind discriminants
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { App, createMockDataviewApi, wireDataviewApi } from "../__mocks__/obsidian";
import { getDataviewApi, buildEngineRegistry } from "engines/EngineRegistry";
import { EngineRegistry } from "engines/QueryEngine";
import { NativeScopingEngine } from "engines/NativeScopingEngine";

describe("getDataviewApi", () => {
	let app: App;

	beforeEach(() => {
		app = new App();
	});

	it("returns the DataviewApi when Dataview is present and version >=0.5.31", () => {
		const dvApi = createMockDataviewApi({ satisfies: true });
		wireDataviewApi(app, dvApi);

		const result = getDataviewApi(app);

		expect(result).toBe(dvApi);
	});

	it("returns undefined when Dataview plugin is absent", () => {
		// No plugins wired — app has no plugins property by default

		const result = getDataviewApi(app);

		expect(result).toBeUndefined();
	});

	it("returns undefined when plugins.plugins['dataview'] is absent", () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(app as any).plugins = { plugins: {} };

		const result = getDataviewApi(app);

		expect(result).toBeUndefined();
	});

	it("returns undefined when version.satisfies('>=0.5.31') returns false", () => {
		const dvApi = createMockDataviewApi({ satisfies: false });
		wireDataviewApi(app, dvApi);

		const result = getDataviewApi(app);

		expect(result).toBeUndefined();
	});

	it("returns undefined (not a throw) when api has no version property (W3)", () => {
		// Wire an api object that is present but has NO version property
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(app as any).plugins = {
			plugins: {
				dataview: {
					api: { execute: vi.fn(), executeJs: vi.fn(), settings: {} },
				},
			},
		};

		// Must return undefined gracefully, not throw
		expect(() => getDataviewApi(app)).not.toThrow();
		expect(getDataviewApi(app)).toBeUndefined();
	});

	it("calls version.satisfies with '>=0.5.31'", () => {
		const dvApi = createMockDataviewApi({ satisfies: true });
		wireDataviewApi(app, dvApi);

		getDataviewApi(app);

		expect(dvApi.version.satisfies).toHaveBeenCalledWith(">=0.5.31");
	});
});

describe("buildEngineRegistry", () => {
	let app: App;

	beforeEach(() => {
		app = new App();
	});

	it("returns an EngineRegistry instance", () => {
		const registry = buildEngineRegistry(app);

		expect(registry).toBeInstanceOf(EngineRegistry);
	});

	it("returns an empty registry when Dataview is absent (no crash)", () => {
		const registry = buildEngineRegistry(app);

		// Both engine kinds should return undefined — empty registry
		expect(registry.get("dataview-dql")).toBeUndefined();
		expect(registry.get("dataviewjs")).toBeUndefined();
	});

	it("registers DataviewDqlEngine and DataviewJsEngine when Dataview present + version-ok", () => {
		const dvApi = createMockDataviewApi({ satisfies: true });
		wireDataviewApi(app, dvApi);

		const registry = buildEngineRegistry(app);

		expect(registry.get("dataview-dql")).toBeDefined();
		expect(registry.get("dataviewjs")).toBeDefined();
	});

	it("registered DataviewDqlEngine has kind 'dataview-dql'", () => {
		const dvApi = createMockDataviewApi({ satisfies: true });
		wireDataviewApi(app, dvApi);

		const registry = buildEngineRegistry(app);
		const engine = registry.get("dataview-dql");

		expect(engine?.kind).toBe("dataview-dql");
	});

	it("registered DataviewJsEngine has kind 'dataviewjs'", () => {
		const dvApi = createMockDataviewApi({ satisfies: true });
		wireDataviewApi(app, dvApi);

		const registry = buildEngineRegistry(app);
		const engine = registry.get("dataviewjs");

		expect(engine?.kind).toBe("dataviewjs");
	});

	it("returns empty registry when Dataview version < 0.5.31", () => {
		const dvApi = createMockDataviewApi({ satisfies: false });
		wireDataviewApi(app, dvApi);

		const registry = buildEngineRegistry(app);

		expect(registry.get("dataview-dql")).toBeUndefined();
		expect(registry.get("dataviewjs")).toBeUndefined();
	});

	it("'bases' engine is UNDEFINED when basesAvailable is false (default, backward-compat)", () => {
		const dvApi = createMockDataviewApi({ satisfies: true });
		wireDataviewApi(app, dvApi);

		// Default second arg = false → no bases engine
		const registry = buildEngineRegistry(app);

		expect(registry.get("bases")).toBeUndefined();
	});

	it("registers BasesFenceEngine when basesAvailable is true", () => {
		const registry = buildEngineRegistry(app, true);

		expect(registry.get("bases")).toBeDefined();
	});

	it("registered BasesFenceEngine has kind 'bases'", () => {
		const registry = buildEngineRegistry(app, true);

		expect(registry.get("bases")?.kind).toBe("bases");
	});

	it("basesAvailable=true does NOT affect Dataview registration (regression)", () => {
		const dvApi = createMockDataviewApi({ satisfies: true });
		wireDataviewApi(app, dvApi);

		const registry = buildEngineRegistry(app, true);

		expect(registry.get("dataview-dql")).toBeDefined();
		expect(registry.get("dataviewjs")).toBeDefined();
	});

	it("basesAvailable=false with Dataview present — Dataview engines registered, bases absent", () => {
		const dvApi = createMockDataviewApi({ satisfies: true });
		wireDataviewApi(app, dvApi);

		const registry = buildEngineRegistry(app, false);

		expect(registry.get("dataview-dql")).toBeDefined();
		expect(registry.get("dataviewjs")).toBeDefined();
		expect(registry.get("bases")).toBeUndefined();
	});
});

describe("EngineRegistry.replace (late-join post-construction update)", () => {
	it("replace populates an initially-empty registry (late-join case)", () => {
		const registry = new EngineRegistry([]);
		expect(registry.get("dataview-dql")).toBeUndefined();

		const app = new App();
		const dvApi = createMockDataviewApi({ satisfies: true });
		wireDataviewApi(app, dvApi);

		const built = buildEngineRegistry(app);
		const engines = (["dataview-dql", "dataviewjs"] as const)
			.map((k) => built.get(k))
			.filter((e): e is NonNullable<typeof e> => e !== undefined);

		registry.replace(engines);

		expect(registry.get("dataview-dql")).toBeDefined();
		expect(registry.get("dataviewjs")).toBeDefined();
	});

	it("replace with empty array clears the registry", () => {
		const app = new App();
		const dvApi = createMockDataviewApi({ satisfies: true });
		wireDataviewApi(app, dvApi);

		const registry = buildEngineRegistry(app);
		expect(registry.get("dataview-dql")).toBeDefined();

		registry.replace([]);

		expect(registry.get("dataview-dql")).toBeUndefined();
		expect(registry.get("dataviewjs")).toBeUndefined();
	});

	it("replace does not include the native sentinel in the map", () => {
		// NativeScopingEngine has kind="native" — not a ViewRecord.engine value.
		// replace() must filter it out just like the constructor does.
		const app = new App();
		const native = new NativeScopingEngine(app);
		const registry = new EngineRegistry([]);

		registry.replace([native]);

		// "native" is not a valid ViewRecord["engine"] kind; map stays empty
		expect(registry.get("bases")).toBeUndefined();
		expect(registry.get("dataview-dql")).toBeUndefined();
	});
});
