/**
 * T4.2 — SettingsTab Views section (RED → GREEN)
 *
 * Tests the "Views" section added to SettingsTab.display() in M2.
 * Covers S24 (Enabled), S25 (Disabled / Consent required), S26 (Engine missing)
 * row states and the Import button.
 *
 * @ref SDD/ADR-8 (extend display() with view-list section)
 * @ref SDD/S24–S26 (UI states, mockups.html source of truth)
 * @ref PRD/AC-F4.1–F4.5
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { App } from "../__mocks__/obsidian";
import { SettingsTab } from "../../src/settings/SettingsTab";
import { ViewStore } from "../../src/store/ViewStore";
import { EngineRegistry } from "../../src/engines/QueryEngine";
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

function makeEmptyRegistry(): EngineRegistry {
	return new EngineRegistry([]);
}

function makeRegistryWith(...kinds: ViewRecord["engine"][]): EngineRegistry {
	const engines = kinds.map((kind) => ({
		kind,
		render: vi.fn(async () => {}),
		teardown: vi.fn(),
	}));
	return new EngineRegistry(engines);
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

function makeRecord(overrides: Partial<ViewRecord> = {}): ViewRecord {
	return {
		provenance: "imported",
		enabled: false,
		okayed: null,
		source: "views/my-view.md",
		engine: "dataview-dql",
		command: false,
		commandName: "My View",
		...overrides,
	};
}

/**
 * Build a SettingsTab with all M2 deps injected. Uses a real plugin stub
 * minimal enough for PluginSettingTab super() to accept.
 */
function makeTab(
	app: App,
	store: ViewStore,
	registry: EngineRegistry,
	gate: ConsentGate,
	importer: ViewImporter,
	registerCommand: RegisterCommandCallback = noop,
	removeCommand: RemoveCommandCallback = () => {},
): SettingsTab {
	// PluginSettingTab requires a plugin with settings + saveSettings
	const plugin = {
		app,
		manifest: { id: "story-forge", name: "Story Forge", version: "0.0.0", minAppVersion: "1.5.7" },
		settings: { exampleSetting: "" },
		saveSettings: vi.fn(async () => {}),
	};
	return new SettingsTab(app, plugin as never, store, registry, gate, importer, registerCommand, removeCommand);
}

/**
 * Call display() and return the rendered containerEl.
 * PluginSettingTab.containerEl is already augmented by the mock.
 */
async function renderTab(tab: SettingsTab): Promise<HTMLElement> {
	await tab.displayAsync();
	return tab.containerEl;
}

/**
 * Helper: find a button by its text within a container.
 */
function findButton(root: ParentNode, label: string): HTMLButtonElement | null {
	const buttons = root.querySelectorAll("button");
	for (const btn of buttons) {
		if (btn.textContent?.trim() === label) return btn as HTMLButtonElement;
	}
	return null;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SettingsTab — Views section", () => {
	let app: App;

	beforeEach(() => {
		app = makeApp();
	});

	// -------------------------------------------------------------------------
	// Section structure
	// -------------------------------------------------------------------------

	it("display() renders a 'Views' heading section", async () => {
		const store = makeStore();
		const tab = makeTab(app, store, makeEmptyRegistry(), makeConsentGate(), makeImporter());
		const container = await renderTab(tab);

		const text = container.textContent ?? "";
		expect(text).toContain("Views");
	});

	it("renders empty-state message when no views are imported", async () => {
		const store = makeStore();
		const tab = makeTab(app, store, makeEmptyRegistry(), makeConsentGate(), makeImporter());
		const container = await renderTab(tab);

		const text = container.textContent ?? "";
		expect(text).toContain("No views imported yet. Use 'Import view' to add a view.");
	});

	it("does not show empty-state when at least one view exists", async () => {
		const store = makeStore({ "v1": makeRecord({ enabled: true }) });
		const tab = makeTab(app, store, makeRegistryWith("dataview-dql"), makeConsentGate(), makeImporter());
		const container = await renderTab(tab);

		const text = container.textContent ?? "";
		expect(text).not.toContain("No views imported yet");
	});

	// -------------------------------------------------------------------------
	// S24 — Enabled row
	// -------------------------------------------------------------------------

	it("renders S24 row with Disable action for an enabled view", async () => {
		const store = makeStore({ "v1": makeRecord({ enabled: true, commandName: "My DQL View" }) });
		const registry = makeRegistryWith("dataview-dql");
		const tab = makeTab(app, store, registry, makeConsentGate(), makeImporter());
		const container = await renderTab(tab);

		// Should show name and have a Disable button
		expect(container.textContent).toContain("My DQL View");
		expect(findButton(container, "Disable")).not.toBeNull();
	});

	it("S24 row shows engine type in description", async () => {
		const store = makeStore({ "v1": makeRecord({ enabled: true, engine: "dataview-dql", commandName: "DQL View" }) });
		const registry = makeRegistryWith("dataview-dql");
		const tab = makeTab(app, store, registry, makeConsentGate(), makeImporter());
		const container = await renderTab(tab);

		const text = container.textContent ?? "";
		expect(text).toContain("dataview-dql");
	});

	// -------------------------------------------------------------------------
	// S25 — Disabled / Consent required row
	// -------------------------------------------------------------------------

	it("renders S25 row with Enable action for disabled view with okayed:null", async () => {
		const store = makeStore({ "v1": makeRecord({ enabled: false, okayed: null, commandName: "DQL View" }) });
		const registry = makeRegistryWith("dataview-dql");
		const tab = makeTab(app, store, registry, makeConsentGate(), makeImporter());
		const container = await renderTab(tab);

		expect(findButton(container, "Enable")).not.toBeNull();
	});

	it("clicking Enable for DataviewJS view calls consentGate.requestConsent", async () => {
		const store = makeStore({ "v1": makeRecord({ enabled: false, okayed: null, engine: "dataviewjs", commandName: "JS View" }) });
		const registry = makeRegistryWith("dataviewjs");
		const gate = makeConsentGate();
		const tab = makeTab(app, store, registry, gate, makeImporter());
		const container = await renderTab(tab);

		const enableBtn = findButton(container, "Enable");
		expect(enableBtn).not.toBeNull();
		enableBtn!.click();
		await vi.waitFor(() => expect(gate.requestConsent).toHaveBeenCalledWith("v1", expect.objectContaining({ engine: "dataviewjs" })));
	});

	it("clicking Enable for DQL view calls consentGate.requestConsent", async () => {
		const store = makeStore({ "v1": makeRecord({ enabled: false, okayed: null, engine: "dataview-dql", commandName: "DQL View" }) });
		const registry = makeRegistryWith("dataview-dql");
		const gate = makeConsentGate();
		const tab = makeTab(app, store, registry, gate, makeImporter());
		const container = await renderTab(tab);

		const enableBtn = findButton(container, "Enable");
		expect(enableBtn).not.toBeNull();
		enableBtn!.click();
		await vi.waitFor(() => expect(gate.requestConsent).toHaveBeenCalledWith("v1", expect.objectContaining({ engine: "dataview-dql" })));
	});

	it("dismissed consent (requestConsent returns false) does not call store.setRecord and row stays S25", async () => {
		const store = makeStore({ "v1": makeRecord({ enabled: false, okayed: null, engine: "dataviewjs", commandName: "JS View" }) });
		const registry = makeRegistryWith("dataviewjs");
		const gate = makeConsentGate();
		// Stub requestConsent to return false (user cancelled)
		vi.mocked(gate.requestConsent).mockResolvedValue(false);
		const setRecordSpy = vi.spyOn(store, "setRecord");
		const tab = makeTab(app, store, registry, gate, makeImporter());
		const container = await renderTab(tab);

		const enableBtn = findButton(container, "Enable");
		expect(enableBtn).not.toBeNull();
		enableBtn!.click();

		// Wait for requestConsent to be called then ensure no re-render happened
		await vi.waitFor(() => expect(gate.requestConsent).toHaveBeenCalled());
		// No store write on cancel
		expect(setRecordSpy).not.toHaveBeenCalled();
		// Row is still S25 — Enable button still present (no re-render occurred)
		expect(findButton(container, "Enable")).not.toBeNull();
	});

	// -------------------------------------------------------------------------
	// S26 — Engine missing row
	// -------------------------------------------------------------------------

	it("renders S26 row when engine is absent from registry", async () => {
		// Registry has no engines registered — dataview-dql is absent
		const store = makeStore({ "v1": makeRecord({ enabled: true, engine: "dataview-dql", commandName: "Missing Engine View" }) });
		const registry = makeEmptyRegistry(); // no engines wired
		const tab = makeTab(app, store, registry, makeConsentGate(), makeImporter());
		const container = await renderTab(tab);

		const text = container.textContent ?? "";
		expect(text).toContain("Missing Engine View");
		// S26 state: engine missing indicator shown — no Enable/Disable buttons
		expect(findButton(container, "Disable")).toBeNull();
		expect(findButton(container, "Enable")).toBeNull();
	});

	it("S26 row description mentions engine missing", async () => {
		const store = makeStore({ "v1": makeRecord({ enabled: true, engine: "dataview-dql", commandName: "No Engine View" }) });
		const registry = makeEmptyRegistry();
		const tab = makeTab(app, store, registry, makeConsentGate(), makeImporter());
		const container = await renderTab(tab);

		const text = container.textContent ?? "";
		// Should indicate the engine is missing/unavailable
		expect(text.toLowerCase()).toMatch(/missing|unavailable|not installed/);
	});

	// -------------------------------------------------------------------------
	// Disable action — preserves okayed
	// -------------------------------------------------------------------------

	it("clicking Disable calls store.setRecord with enabled:false and preserves okayed", async () => {
		const okayed = { version: 1, checksum: "sha256:abc" };
		const store = makeStore({
			"v1": makeRecord({ enabled: true, okayed, engine: "dataview-dql", commandName: "Active View" }),
		});
		const registry = makeRegistryWith("dataview-dql");
		const setRecordSpy = vi.spyOn(store, "setRecord");
		const tab = makeTab(app, store, registry, makeConsentGate(), makeImporter());
		const container = await renderTab(tab);

		const disableBtn = findButton(container, "Disable");
		expect(disableBtn).not.toBeNull();
		disableBtn!.click();

		await vi.waitFor(() => expect(setRecordSpy).toHaveBeenCalledWith("v1", expect.objectContaining({
			enabled: false,
			okayed,
		})));
	});

	// -------------------------------------------------------------------------
	// Remove action
	// -------------------------------------------------------------------------

	it("clicking Remove calls store.deleteRecord with the view id", async () => {
		const store = makeStore({ "v1": makeRecord({ enabled: false, commandName: "Remove Me" }) });
		const deleteRecordSpy = vi.spyOn(store, "deleteRecord");
		const tab = makeTab(app, store, makeRegistryWith("dataview-dql"), makeConsentGate(), makeImporter());
		const container = await renderTab(tab);

		const removeBtn = findButton(container, "Remove");
		expect(removeBtn).not.toBeNull();
		removeBtn!.click();

		await vi.waitFor(() => expect(deleteRecordSpy).toHaveBeenCalledWith("v1"));
	});

	it("Remove does not call any vault write API", async () => {
		const store = makeStore({ "v1": makeRecord({ enabled: false, commandName: "Remove Me" }) });
		const tab = makeTab(app, store, makeRegistryWith("dataview-dql"), makeConsentGate(), makeImporter());
		const container = await renderTab(tab);

		const removeBtn = findButton(container, "Remove");
		removeBtn!.click();
		await vi.waitFor(() => expect(app.vault.modify).not.toHaveBeenCalled());
		expect(app.vault.create).not.toHaveBeenCalled();
		expect(app.vault.delete).not.toHaveBeenCalled();
		expect(app.vault.trash).not.toHaveBeenCalled();
	});

	it("re-rendering display() after Remove shows only remaining views", async () => {
		const store = makeStore({
			"v1": makeRecord({ enabled: false, commandName: "Keep Me" }),
			"v2": makeRecord({ enabled: false, commandName: "Remove Me" }),
		});
		const deleteRecordSpy = vi.spyOn(store, "deleteRecord");
		const tab = makeTab(app, store, makeRegistryWith("dataview-dql"), makeConsentGate(), makeImporter());
		const container = await renderTab(tab);

		// Find the setting row for "Remove Me" and click its Remove button
		const allSettings = container.querySelectorAll("[data-setting-name]");
		let removeBtnForV2: HTMLButtonElement | null = null;
		for (const setting of allSettings) {
			if (setting.getAttribute("data-setting-name") === "Remove Me") {
				// Find the "Remove" button specifically within this setting row
				const buttons = setting.querySelectorAll("button");
				for (const btn of buttons) {
					if (btn.textContent?.trim() === "Remove") {
						removeBtnForV2 = btn as HTMLButtonElement;
						break;
					}
				}
				break;
			}
		}
		expect(removeBtnForV2).not.toBeNull();
		removeBtnForV2!.click();

		// Wait for deleteRecord to be called
		await vi.waitFor(() => expect(deleteRecordSpy).toHaveBeenCalledWith("v2"));

		// Re-render
		const newContainer = await renderTab(tab);
		expect(newContainer.textContent).toContain("Keep Me");
		expect(newContainer.textContent).not.toContain("Remove Me");
	});

	it("clicking Remove calls the injected removeCommand callback with the view id", async () => {
		const store = makeStore({ "v-cmd": makeRecord({ enabled: false, commandName: "Cmd View" }) });
		const removeCommand = vi.fn();
		const tab = makeTab(app, store, makeRegistryWith("dataview-dql"), makeConsentGate(), makeImporter(), noop, removeCommand);
		const container = await renderTab(tab);

		const removeBtn = findButton(container, "Remove");
		expect(removeBtn).not.toBeNull();
		removeBtn!.click();

		await vi.waitFor(() => expect(removeCommand).toHaveBeenCalledWith("v-cmd"));
	});

	it("clicking Remove on a view with no registered command does not throw", async () => {
		// removeCommand is a no-op (the default); this proves the call is safe
		const store = makeStore({ "v-no-cmd": makeRecord({ enabled: false, commandName: "No Cmd View" }) });
		const removeCommand = vi.fn(); // will be called but it's a no-op at the plugin level
		const tab = makeTab(app, store, makeRegistryWith("dataview-dql"), makeConsentGate(), makeImporter(), noop, removeCommand);
		const container = await renderTab(tab);

		const removeBtn = findButton(container, "Remove");
		expect(removeBtn).not.toBeNull();
		// Must not throw regardless of whether a command was registered
		expect(() => removeBtn!.click()).not.toThrow();
		await vi.waitFor(() => expect(removeCommand).toHaveBeenCalledWith("v-no-cmd"));
	});

	// -------------------------------------------------------------------------
	// Import button
	// -------------------------------------------------------------------------

	it("renders an 'Import view' button", async () => {
		const store = makeStore();
		const tab = makeTab(app, store, makeEmptyRegistry(), makeConsentGate(), makeImporter());
		const container = await renderTab(tab);

		expect(findButton(container, "Import view")).not.toBeNull();
	});
});
