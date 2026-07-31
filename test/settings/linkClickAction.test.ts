/**
 * T4.1 — linkClickAction setting (ADR-5)
 *
 * Covers:
 *   - DEFAULT_SETTINGS.linkClickAction === "drill"
 *   - isLinkClickAction type guard narrows correctly
 *   - normalizeLinkClickAction normalizes malformed / nullish values to "drill"
 *   - settings dropdown row reads current value + writes changed value
 *   - value round-trips through save then load
 *
 * @ref docs/XDD/specs/004-contextual-panel/plan/phase-4.md §T4.1
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { App } from "../__mocks__/obsidian";
import { DEFAULT_SETTINGS, isLinkClickAction, normalizeLinkClickAction } from "../../src/types/index";
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
			linkClickAction: normalizeLinkClickAction(overrides.linkClickAction ?? "drill"),
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
// isLinkClickAction type guard
// ---------------------------------------------------------------------------

describe("isLinkClickAction", () => {
	it("returns true for 'drill'", () => {
		expect(isLinkClickAction("drill")).toBe(true);
	});

	it("returns true for 'open'", () => {
		expect(isLinkClickAction("open")).toBe(true);
	});

	it("returns false for an unknown string", () => {
		expect(isLinkClickAction("banana")).toBe(false);
	});

	it("returns false for a number", () => {
		expect(isLinkClickAction(42)).toBe(false);
	});

	it("returns false for null", () => {
		expect(isLinkClickAction(null)).toBe(false);
	});

	it("returns false for undefined", () => {
		expect(isLinkClickAction(undefined)).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// normalizeLinkClickAction pure normalizer
// ---------------------------------------------------------------------------

describe("normalizeLinkClickAction", () => {
	it("falls back to 'drill' when value is an unknown string", () => {
		expect(normalizeLinkClickAction("banana")).toBe("drill");
	});

	it("falls back to 'drill' when value is a number", () => {
		expect(normalizeLinkClickAction(42)).toBe("drill");
	});

	it("falls back to 'drill' when value is null", () => {
		expect(normalizeLinkClickAction(null)).toBe("drill");
	});

	it("falls back to 'drill' when value is undefined", () => {
		expect(normalizeLinkClickAction(undefined)).toBe("drill");
	});

	it("preserves 'open'", () => {
		expect(normalizeLinkClickAction("open")).toBe("open");
	});

	it("preserves 'drill'", () => {
		expect(normalizeLinkClickAction("drill")).toBe("drill");
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

	// Fix for a Phase 2 regression: this setting is global — the shared
	// NavigationController (PRD F2) reads it for both the Anvil and the
	// Workbench — but the description and 'drill' option wording named only
	// the Workbench, which is actively wrong for the Anvil. The copy must be
	// surface-neutral: it names neither surface.
	it("description and 'drill' option are surface-neutral", async () => {
		const plugin = makePlugin({ linkClickAction: "drill" });
		const tab = makeTab(app, plugin, makeStore(), makeConsentGate(), makeImporter());
		const container = await renderTab(tab);

		const settingEl = findSettingEl(container, "Link click action");
		expect(settingEl).not.toBeNull();
		expect(settingEl!.textContent).toContain(
			"What happens when you click a link to another entity. Modifier-click (ctrl/cmd) inverts this choice.",
		);
		expect(settingEl!.textContent).not.toContain("Workbench");
		expect(settingEl!.textContent).not.toContain("Anvil");

		const selectEl = settingEl!.querySelector("select") as HTMLSelectElement | null;
		expect(selectEl).not.toBeNull();
		const drillOption = Array.from(selectEl!.options).find((o) => o.value === "drill");
		expect(drillOption?.textContent).toBe("Drill into linked note (show it in place)");
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
// Value round-trip (save then load) — via normalizeLinkClickAction
// ---------------------------------------------------------------------------

describe("linkClickAction value round-trip", () => {
	it("saving 'open' and reloading preserves 'open'", async () => {
		let storedData: unknown = {};

		async function saveSettings(settings: typeof DEFAULT_SETTINGS): Promise<void> {
			const raw = storedData as { settings?: unknown } | null;
			const data = (raw && typeof raw === "object" && !Array.isArray(raw)) ? raw : {};
			(data as Record<string, unknown>)["settings"] = settings;
			storedData = data;
		}

		async function loadSettings(): Promise<typeof DEFAULT_SETTINGS> {
			const raw = storedData as { settings?: Record<string, unknown> } | null | undefined;
			const stored = raw?.settings ?? null;
			const merged = Object.assign({}, DEFAULT_SETTINGS, stored ?? {});
			merged.linkClickAction = normalizeLinkClickAction(merged.linkClickAction);
			return merged;
		}

		// Save "open"
		await saveSettings({ exampleSetting: "", linkClickAction: "open", curatedBasesFolder: "00 Meta/Bases" });
		// Load it back
		const result = await loadSettings();
		expect(result.linkClickAction).toBe("open");
	});

	it("saving 'drill' and reloading preserves 'drill'", async () => {
		let storedData: unknown = {};

		async function saveSettings(settings: typeof DEFAULT_SETTINGS): Promise<void> {
			const raw = storedData as { settings?: unknown } | null;
			const data = (raw && typeof raw === "object" && !Array.isArray(raw)) ? raw : {};
			(data as Record<string, unknown>)["settings"] = settings;
			storedData = data;
		}

		async function loadSettings(): Promise<typeof DEFAULT_SETTINGS> {
			const raw = storedData as { settings?: Record<string, unknown> } | null | undefined;
			const stored = raw?.settings ?? null;
			const merged = Object.assign({}, DEFAULT_SETTINGS, stored ?? {});
			merged.linkClickAction = normalizeLinkClickAction(merged.linkClickAction);
			return merged;
		}

		await saveSettings({ exampleSetting: "", linkClickAction: "drill", curatedBasesFolder: "00 Meta/Bases" });
		const result = await loadSettings();
		expect(result.linkClickAction).toBe("drill");
	});

	it("falls back to 'drill' when persisted settings is null", async () => {
		// Simulates { settings: null } in data.json
		const raw = { settings: null } as { settings: Record<string, unknown> | null };
		const stored = raw.settings ?? null;
		const merged = Object.assign({}, DEFAULT_SETTINGS, stored ?? {});
		merged.linkClickAction = normalizeLinkClickAction(merged.linkClickAction);
		expect(merged.linkClickAction).toBe("drill");
	});
});
