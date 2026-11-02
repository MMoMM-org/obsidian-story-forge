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
}> = {}): {
	app: App;
	manifest: { id: string; name: string; version: string; minAppVersion: string };
	settings: { linkClickAction: "drill" | "open" };
	saveSettings: ReturnType<typeof vi.fn>;
} {
	return {
		app: makeApp(),
		manifest: { id: "story-forge", name: "Story Forge", version: "0.0.0", minAppVersion: "1.5.7" },
		settings: {
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
		expect(drillOption?.textContent).toBe("Inspect the linked note (show it in place)");
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

	// T3.5: ADR-28 renames the UI copy to "inspect" but keeps the PERSISTED values
	// "drill"/"open" for compatibility — renaming a stored value would silently
	// reset every user's setting to the fail-closed default. Values and labels are
	// asserted SEPARATELY so a future label edit cannot silently change what is
	// persisted.
	it("stored-value regression: option VALUES stay 'drill'/'open' while LABELS say inspect", async () => {
		const plugin = makePlugin({ linkClickAction: "drill" });
		const tab = makeTab(app, plugin, makeStore(), makeConsentGate(), makeImporter());
		const container = await renderTab(tab);

		const settingEl = findSettingEl(container, "Link click action");
		const selectEl = settingEl!.querySelector("select") as HTMLSelectElement;
		const options = Array.from(selectEl.options);

		// Values: unchanged — this is what gets persisted via saveSettings.
		expect(options.map((o) => o.value)).toEqual(["drill", "open"]);

		// Labels: the visible copy says "inspect", not "drill".
		const drillLabel = options.find((o) => o.value === "drill")?.textContent;
		expect(drillLabel).toContain("Inspect");
		expect(drillLabel).not.toContain("Drill");
		expect(drillLabel).not.toContain("drill");

		// The normalizer itself is untouched by the label rename.
		expect(normalizeLinkClickAction("drill")).toBe("drill");
		expect(normalizeLinkClickAction("open")).toBe("open");
		expect(normalizeLinkClickAction("inspect")).toBe("drill"); // "inspect" is UI copy only, never a stored value
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
		await saveSettings({
			linkClickAction: "open",
			cardTitleOpensNote: true,
			curatedBasesFolder: "00 Meta/Bases",
			fileClassesFolder: "00 Meta/FileClasses",
			excludedFolders: ["00 Meta"],
			editorDock: "bottom",
			cardByCollection: {},
			dismissedHints: [],
		});
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

		await saveSettings({
			linkClickAction: "drill",
			cardTitleOpensNote: true,
			curatedBasesFolder: "00 Meta/Bases",
			fileClassesFolder: "00 Meta/FileClasses",
			excludedFolders: ["00 Meta"],
			editorDock: "bottom",
			cardByCollection: {},
			dismissedHints: [],
		});
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

// ---------------------------------------------------------------------------
// SettingsTab — cardTitleOpensNote toggle row
// ---------------------------------------------------------------------------

describe("SettingsTab — 'Open note from card title' toggle", () => {
	async function render(initial: boolean) {
		const app = makeApp();
		const plugin = makePlugin() as ReturnType<typeof makePlugin> & {
			settings: { cardTitleOpensNote: boolean; linkClickAction: "drill" | "open" };
		};
		plugin.settings.cardTitleOpensNote = initial;
		const tab = makeTab(app, plugin, makeStore(), makeConsentGate(), makeImporter());
		const container = await renderTab(tab);
		const row = container.querySelector('[data-setting-name="Open note from card title"]');
		return { plugin, row };
	}

	it("renders with the sentence-case name and a description naming both behaviours", async () => {
		const { row } = await render(true);
		expect(row).not.toBeNull();
		const desc = row?.getAttribute("data-setting-desc") ?? row?.textContent ?? "";
		expect(desc).toContain("new tab");
		expect(desc).toContain("editor pane");
	});

	it("toggling off persists false and saves", async () => {
		const { plugin, row } = await render(true);
		(row?.querySelector('[role="switch"]') as HTMLElement).click();
		expect(plugin.settings.cardTitleOpensNote).toBe(false);
		expect(plugin.saveSettings).toHaveBeenCalled();
	});
});
