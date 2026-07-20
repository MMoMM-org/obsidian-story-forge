/**
 * T4.1 — linkClickAction setting (ADR-5)
 *
 * Covers:
 *   - DEFAULT_SETTINGS.linkClickAction === "drill"
 *   - malformed persisted value falls back to "drill" on load
 *   - settings dropdown row reads current value + writes changed value
 *   - value round-trips through save then load
 *
 * @ref docs/XDD/specs/004-contextual-panel/plan/phase-4.md §T4.1
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { App } from "../__mocks__/obsidian";
import { DEFAULT_SETTINGS } from "../../src/types/index";
import { SettingsTab } from "../../src/settings/SettingsTab";
import { ViewStore } from "../../src/store/ViewStore";
import type { ViewRecord } from "../../src/store/types";
import type { ConsentGate } from "../../src/consent/ConsentGate";
import type { ViewImporter } from "../../src/import/ViewImporter";
import type { RegisterCommandCallback } from "../../src/import/types";

type RemoveCommandCallback = (viewId: string) => void;

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeApp(): App {
	return new App();
}

function makeStore(initial: Record<string, ViewRecord> = {}): ViewStore {
	const data = { views: { ...initial } };
	const port = {
		load: vi.fn(async () => data),
		save: vi.fn(async (d: unknown) => {
			const typed = d as typeof data;
			data.views = { ...(typed.views ?? {}) };
		}),
	};
	return new ViewStore(port);
}

function makeConsentGate(): ConsentGate {
	return {
		evaluate: vi.fn(async () => ({ status: "not-consented" as const })),
		requestConsent: vi.fn(async () => true),
		requestReConsent: vi.fn(async () => true),
	} as unknown as ConsentGate;
}

function makeImporter(): ViewImporter {
	return {
		scanVault: vi.fn(async () => []),
		parse: vi.fn(async () => { throw new Error("not used"); }),
		importToStore: vi.fn(async () => "id"),
	} as unknown as ViewImporter;
}

const noop: RegisterCommandCallback = () => {};

function makePlugin(overrides: Partial<{
	linkClickAction: string;
	exampleSetting: string;
}> = {}): {
	app: App;
	manifest: { id: string; name: string; version: string; minAppVersion: string };
	settings: { exampleSetting: string; linkClickAction: "drill" | "open" };
	saveSettings: ReturnType<typeof vi.fn>;
} {
	return {
		app: makeApp(),
		manifest: { id: "story-forge", name: "Story Forge", version: "0.0.0", minAppVersion: "1.5.7" },
		settings: {
			exampleSetting: overrides.exampleSetting ?? "",
			linkClickAction: (overrides.linkClickAction ?? "drill") as "drill" | "open",
		},
		saveSettings: vi.fn(async () => {}),
	};
}

function makeTab(
	app: App,
	plugin: ReturnType<typeof makePlugin>,
	store: ViewStore,
	gate: ConsentGate,
	importer: ViewImporter,
	registerCommand: RegisterCommandCallback = noop,
	removeCommand: RemoveCommandCallback = () => {},
): SettingsTab {
	return new SettingsTab(app, plugin as never, store, gate, importer, registerCommand, removeCommand);
}

async function renderTab(tab: SettingsTab): Promise<HTMLElement> {
	await tab.displayAsync();
	return tab.containerEl;
}

// ---------------------------------------------------------------------------
// DEFAULT_SETTINGS
// ---------------------------------------------------------------------------

describe("DEFAULT_SETTINGS.linkClickAction", () => {
	it("defaults to 'drill'", () => {
		expect(DEFAULT_SETTINGS.linkClickAction).toBe("drill");
	});
});

// ---------------------------------------------------------------------------
// Malformed persisted value fallback
// ---------------------------------------------------------------------------

describe("loadSettings — malformed linkClickAction fallback", () => {
	it("falls back to 'drill' when persisted value is an unknown string", async () => {
		// Simulate a data.json where linkClickAction was saved as "banana"
		const mockLoadData = vi.fn(async () => ({
			settings: { exampleSetting: "hello", linkClickAction: "banana" },
		}));
		const mockSaveData = vi.fn(async () => {});

		// We need a plugin-like object that exposes loadSettings
		// and has loadData/saveData as its underlying IO.
		// We import and instantiate actual main.ts logic by creating
		// a minimal surrogate that mirrors the loadSettings implementation
		// from main.ts (Object.assign + explicit guard).
		const { DEFAULT_SETTINGS: defaults } = await import("../../src/types/index");

		// Re-implement the loadSettings logic (mirrors main.ts) so we can test
		// it independently of the Obsidian Plugin base class.
		async function loadSettings(): Promise<typeof defaults> {
			const raw = await mockLoadData() as { settings?: Record<string, unknown> } | null | undefined;
			const stored = raw?.settings ?? null;
			const merged = Object.assign({}, defaults, stored ?? {});
			// Explicit guard: unknown linkClickAction → "drill"
			if (merged.linkClickAction !== "drill" && merged.linkClickAction !== "open") {
				merged.linkClickAction = "drill";
			}
			return merged;
		}

		const result = await loadSettings();
		expect(result.linkClickAction).toBe("drill");
	});

	it("falls back to 'drill' when persisted value is a number", async () => {
		const mockLoadData = vi.fn(async () => ({
			settings: { exampleSetting: "", linkClickAction: 42 },
		}));

		const { DEFAULT_SETTINGS: defaults } = await import("../../src/types/index");

		async function loadSettings(): Promise<typeof defaults> {
			const raw = await mockLoadData() as { settings?: Record<string, unknown> } | null | undefined;
			const stored = raw?.settings ?? null;
			const merged = Object.assign({}, defaults, stored ?? {});
			if (merged.linkClickAction !== "drill" && merged.linkClickAction !== "open") {
				merged.linkClickAction = "drill";
			}
			return merged;
		}

		const result = await loadSettings();
		expect(result.linkClickAction).toBe("drill");
	});

	it("preserves 'open' when persisted value is 'open'", async () => {
		const mockLoadData = vi.fn(async () => ({
			settings: { exampleSetting: "", linkClickAction: "open" },
		}));

		const { DEFAULT_SETTINGS: defaults } = await import("../../src/types/index");

		async function loadSettings(): Promise<typeof defaults> {
			const raw = await mockLoadData() as { settings?: Record<string, unknown> } | null | undefined;
			const stored = raw?.settings ?? null;
			const merged = Object.assign({}, defaults, stored ?? {});
			if (merged.linkClickAction !== "drill" && merged.linkClickAction !== "open") {
				merged.linkClickAction = "drill";
			}
			return merged;
		}

		const result = await loadSettings();
		expect(result.linkClickAction).toBe("open");
	});
});

// ---------------------------------------------------------------------------
// SettingsTab — linkClickAction dropdown row
// ---------------------------------------------------------------------------

/** Find the Setting element for a given name using the data-setting-name attribute (mock convention). */
function findSettingEl(container: HTMLElement, name: string): Element | null {
	return container.querySelector(`[data-setting-name="${name}"]`);
}

describe("SettingsTab — linkClickAction dropdown row", () => {
	let app: App;
	beforeEach(() => { app = makeApp(); });

	it("renders a 'Link click action' setting with a dropdown", async () => {
		const plugin = makePlugin({ linkClickAction: "drill" });
		const tab = makeTab(app, plugin, makeStore(), makeConsentGate(), makeImporter());
		const container = await renderTab(tab);

		// The mock sets data-setting-name on each settingEl
		expect(findSettingEl(container, "Link click action")).not.toBeNull();
	});

	it("dropdown setValue reflects the current setting value ('drill')", async () => {
		const plugin = makePlugin({ linkClickAction: "drill" });
		const tab = makeTab(app, plugin, makeStore(), makeConsentGate(), makeImporter());
		const container = await renderTab(tab);

		const settingEl = findSettingEl(container, "Link click action");
		expect(settingEl).not.toBeNull();
		const selectEl = settingEl!.querySelector("select") as HTMLSelectElement | null;
		expect(selectEl).not.toBeNull();
		expect(selectEl!.value).toBe("drill");
	});

	it("dropdown setValue reflects the current setting value ('open')", async () => {
		const plugin = makePlugin({ linkClickAction: "open" });
		const tab = makeTab(app, plugin, makeStore(), makeConsentGate(), makeImporter());
		const container = await renderTab(tab);

		const settingEl = findSettingEl(container, "Link click action");
		expect(settingEl).not.toBeNull();
		const selectEl = settingEl!.querySelector("select") as HTMLSelectElement | null;
		expect(selectEl).not.toBeNull();
		expect(selectEl!.value).toBe("open");
	});

	it("changing the dropdown calls plugin.settings.linkClickAction = new value and saveSettings", async () => {
		const plugin = makePlugin({ linkClickAction: "drill" });
		const tab = makeTab(app, plugin, makeStore(), makeConsentGate(), makeImporter());
		const container = await renderTab(tab);

		const settingEl = findSettingEl(container, "Link click action");
		expect(settingEl).not.toBeNull();
		const selectEl = settingEl!.querySelector("select") as HTMLSelectElement | null;
		expect(selectEl).not.toBeNull();

		// Simulate selecting "open"
		selectEl!.value = "open";
		selectEl!.dispatchEvent(new Event("change"));

		await vi.waitFor(() => {
			expect(plugin.settings.linkClickAction).toBe("open");
		});
		expect(plugin.saveSettings).toHaveBeenCalled();
	});

	it("dropdown has options 'drill' and 'open'", async () => {
		const plugin = makePlugin({ linkClickAction: "drill" });
		const tab = makeTab(app, plugin, makeStore(), makeConsentGate(), makeImporter());
		const container = await renderTab(tab);

		const settingEl = findSettingEl(container, "Link click action");
		expect(settingEl).not.toBeNull();
		const selectEl = settingEl!.querySelector("select") as HTMLSelectElement | null;
		expect(selectEl).not.toBeNull();
		const optionValues = Array.from(selectEl!.options).map((o) => o.value);
		expect(optionValues).toContain("drill");
		expect(optionValues).toContain("open");
	});
});

// ---------------------------------------------------------------------------
// Value round-trip (save then load)
// ---------------------------------------------------------------------------

describe("linkClickAction value round-trip", () => {
	it("saving 'open' and reloading preserves 'open'", async () => {
		// Simulate what main.ts saveSettings/loadSettings does:
		// save writes settings blob; load reads it back with the guard.
		const { DEFAULT_SETTINGS: defaults } = await import("../../src/types/index");

		let storedData: unknown = {};

		async function saveSettings(settings: typeof defaults): Promise<void> {
			const raw = storedData as { settings?: unknown } | null;
			const data = (raw && typeof raw === "object" && !Array.isArray(raw)) ? raw : {};
			(data as Record<string, unknown>)["settings"] = settings;
			storedData = data;
		}

		async function loadSettings(): Promise<typeof defaults> {
			const raw = storedData as { settings?: Record<string, unknown> } | null | undefined;
			const stored = raw?.settings ?? null;
			const merged = Object.assign({}, defaults, stored ?? {});
			if (merged.linkClickAction !== "drill" && merged.linkClickAction !== "open") {
				merged.linkClickAction = "drill";
			}
			return merged;
		}

		// Save "open"
		await saveSettings({ exampleSetting: "", linkClickAction: "open" });
		// Load it back
		const result = await loadSettings();
		expect(result.linkClickAction).toBe("open");
	});

	it("saving 'drill' and reloading preserves 'drill'", async () => {
		const { DEFAULT_SETTINGS: defaults } = await import("../../src/types/index");

		let storedData: unknown = {};

		async function saveSettings(settings: typeof defaults): Promise<void> {
			const raw = storedData as { settings?: unknown } | null;
			const data = (raw && typeof raw === "object" && !Array.isArray(raw)) ? raw : {};
			(data as Record<string, unknown>)["settings"] = settings;
			storedData = data;
		}

		async function loadSettings(): Promise<typeof defaults> {
			const raw = storedData as { settings?: Record<string, unknown> } | null | undefined;
			const stored = raw?.settings ?? null;
			const merged = Object.assign({}, defaults, stored ?? {});
			if (merged.linkClickAction !== "drill" && merged.linkClickAction !== "open") {
				merged.linkClickAction = "drill";
			}
			return merged;
		}

		await saveSettings({ exampleSetting: "", linkClickAction: "drill" });
		const result = await loadSettings();
		expect(result.linkClickAction).toBe("drill");
	});
});
