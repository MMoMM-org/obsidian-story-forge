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

// ---------------------------------------------------------------------------
// Bug A — store subscriber re-renders the Views section without calling display() again
// ---------------------------------------------------------------------------

/**
 * A fake ViewStore that supports subscribe/_fire the same way SidebarView.tabs
 * uses it, but also has getViews() backed by a mutable _views bag.
 *
 * setRecord/deleteRecord mutate the backing store AND fire subscribers — mirroring
 * the real ViewStore._notify() calls so action-handler re-renders are observer-driven.
 */
function makeFakeStoreForTab(
	initial: Record<string, ViewRecord> = {},
): ViewStore & { _views: Record<string, ViewRecord>; _fire: () => void } {
	let views = { ...initial };
	const subscribers = new Set<() => void>();

	function fire(): void { for (const cb of subscribers) cb(); }

	const store = {
		async getViews(): Promise<Record<string, ViewRecord>> {
			return { ...views };
		},
		subscribe(cb: () => void): () => void {
			subscribers.add(cb);
			return () => { subscribers.delete(cb); };
		},
		async setRecord(id: string, rec: ViewRecord): Promise<void> {
			views = { ...views, [id]: rec };
			fire();
		},
		async deleteRecord(id: string): Promise<void> {
			const next = { ...views };
			delete next[id];
			views = next;
			fire();
		},
		get _views() { return views; },
		set _views(v: Record<string, ViewRecord>) { views = v; },
		_fire(): void { fire(); },
		get _subscriberCount(): number { return subscribers.size; },
	} as unknown as ViewStore & { _views: Record<string, ViewRecord>; _fire: () => void };

	return store;
}

describe("SettingsTab — Bug A: store subscription refreshes views list", () => {
	let app: App;

	beforeEach(() => {
		app = makeApp();
	});

	it("after display(), firing the store subscriber re-renders a newly added view without calling display() again", async () => {
		const store = makeFakeStoreForTab({});
		const tab = makeTab(app, store as unknown as ViewStore, makeRegistryWith("dataview-dql"), makeConsentGate(), makeImporter());
		// Open the tab (call display)
		await tab.displayAsync();

		// No views yet — empty state shown
		expect(tab.containerEl.textContent).toContain("No views imported yet");

		// Add a view to the store (simulating an import) and fire the subscriber
		(store as unknown as { _views: Record<string, ViewRecord> })._views = {
			"new-v1": makeRecord({ commandName: "Imported View" }),
		};
		store._fire();

		// Wait for async re-render triggered by subscriber
		await vi.waitFor(() => {
			expect(tab.containerEl.textContent).toContain("Imported View");
		});

		// The empty-state message must be gone
		expect(tab.containerEl.textContent).not.toContain("No views imported yet");
	});

	it("hide() unsubscribes so a post-hide store fire does NOT re-render", async () => {
		const store = makeFakeStoreForTab({ "v1": makeRecord({ commandName: "View 1" }) });
		const tab = makeTab(app, store as unknown as ViewStore, makeRegistryWith("dataview-dql"), makeConsentGate(), makeImporter());

		await tab.displayAsync();
		expect((store as unknown as { _subscriberCount: number })._subscriberCount).toBe(1);

		// Hide the tab — should unsubscribe
		tab.hide();

		expect((store as unknown as { _subscriberCount: number })._subscriberCount).toBe(0);

		// Change the store and fire — no re-render should happen
		const displayAsyncSpy = vi.spyOn(tab, "displayAsync");
		(store as unknown as { _views: Record<string, ViewRecord> })._views = {
			"v1": makeRecord({ commandName: "View 1" }),
			"v2": makeRecord({ commandName: "Should Not Appear" }),
		};
		store._fire();
		await Promise.resolve();
		await Promise.resolve();

		expect(displayAsyncSpy).not.toHaveBeenCalled();
		expect(tab.containerEl.textContent).not.toContain("Should Not Appear");
	});

	it("repeated display() calls do not create multiple subscriptions (no double-subscribe)", async () => {
		const store = makeFakeStoreForTab({});
		const tab = makeTab(app, store as unknown as ViewStore, makeEmptyRegistry(), makeConsentGate(), makeImporter());

		await tab.displayAsync();
		await tab.displayAsync();
		await tab.displayAsync();

		// Only one subscriber at a time — not 3
		expect((store as unknown as { _subscriberCount: number })._subscriberCount).toBe(1);
	});

	it("hide() → displayAsync() re-open cycle re-subscribes exactly once and store events still update the panel", async () => {
		// This is the real Obsidian settings lifecycle: display() on open, hide() on close, display() on re-open.
		// A regression where hide() forgets to null the handle OR the guard were inverted
		// would leave _subscriberCount at 0 (missed re-subscribe) or 2 (double-subscribe).
		const store = makeFakeStoreForTab({ "v1": makeRecord({ commandName: "View 1" }) });
		const tab = makeTab(app, store as unknown as ViewStore, makeRegistryWith("dataview-dql"), makeConsentGate(), makeImporter());

		// Open → hide → reopen
		await tab.displayAsync();
		tab.hide();
		await tab.displayAsync();

		// Exactly one live subscription — not 0 (would miss updates) and not 2 (would double-render)
		expect((store as unknown as { _subscriberCount: number })._subscriberCount).toBe(1);

		// A store event after re-open must still update the panel (the re-subscribed callback runs)
		(store as unknown as { _views: Record<string, ViewRecord> })._views = {
			"v1": makeRecord({ commandName: "View 1" }),
			"v2": makeRecord({ commandName: "Newly Imported" }),
		};
		store._fire();

		await vi.waitFor(() => {
			expect(tab.containerEl.textContent).toContain("Newly Imported");
		});
	});
});

// ---------------------------------------------------------------------------
// Bug B — no duplicate rows after action handlers trigger two concurrent renders
// ---------------------------------------------------------------------------

/**
 * Count view rows by counting `.setting` elements that appear AFTER the
 * "Views" heading and "Import view" Settings rows — i.e. actual view entries.
 *
 * The Settings mock adds a `data-setting-name` attribute to each Setting's
 * container div. We look for settings whose name matches one of the known
 * view display names (commandName/source).
 */
function countViewRows(container: HTMLElement, viewNames: string[]): number {
	let count = 0;
	const settings = container.querySelectorAll("[data-setting-name]");
	for (const s of settings) {
		const name = s.getAttribute("data-setting-name") ?? "";
		if (viewNames.includes(name)) count++;
	}
	return count;
}

describe("SettingsTab — Bug B: no duplicate rows on concurrent displayAsync()", () => {
	let app: App;

	beforeEach(() => {
		app = makeApp();
	});

	// -------------------------------------------------------------------------
	// No-doubling test — Disable action triggers both the store observer AND
	// (before the fix) a manual displayAsync() call → two renders → doubled rows.
	// After the fix, the _displayGen guard coalesces to a single render.
	// -------------------------------------------------------------------------

	it("clicking Disable produces exactly one row per view (no duplication)", async () => {
		const store = makeFakeStoreForTab({
			"v1": makeRecord({ enabled: true, commandName: "Alpha View", engine: "dataview-dql" }),
			"v2": makeRecord({ enabled: true, commandName: "Beta View", engine: "dataview-dql" }),
		});
		const tab = makeTab(
			app,
			store as unknown as ViewStore,
			makeRegistryWith("dataview-dql"),
			makeConsentGate(),
			makeImporter(),
		);
		await tab.displayAsync();

		// Confirm two rows rendered initially
		expect(countViewRows(tab.containerEl, ["Alpha View", "Beta View"])).toBe(2);

		// Click Disable on v1 — this mutates the store (fires observer) AND
		// previously also called displayAsync() manually → double render.
		const disableBtn = findButton(tab.containerEl, "Disable");
		expect(disableBtn).not.toBeNull();
		disableBtn!.click();

		// Wait for the re-render triggered by the store observer
		await vi.waitFor(() => {
			// v1 should now show Enable (was disabled), v2 still shows Disable
			expect(findButton(tab.containerEl, "Enable")).not.toBeNull();
		});

		// Each view must appear exactly once — no doubled rows
		expect(countViewRows(tab.containerEl, ["Alpha View", "Beta View"])).toBe(2);
	});

	// -------------------------------------------------------------------------
	// Concurrent-render test — fire displayAsync() twice rapidly; the _displayGen
	// guard must ensure only one final set of rows is painted.
	// -------------------------------------------------------------------------

	it("two concurrent displayAsync() calls coalesce to a single render (no doubled rows)", async () => {
		const store = makeFakeStoreForTab({
			"v1": makeRecord({ commandName: "Solo View", engine: "dataview-dql" }),
		});
		const tab = makeTab(
			app,
			store as unknown as ViewStore,
			makeRegistryWith("dataview-dql"),
			makeConsentGate(),
			makeImporter(),
		);

		// Fire two concurrent renders without awaiting the first
		const p1 = tab.displayAsync();
		const p2 = tab.displayAsync();
		await Promise.all([p1, p2]);

		// Exactly one row for the single view — not two
		expect(countViewRows(tab.containerEl, ["Solo View"])).toBe(1);
	});

	// -------------------------------------------------------------------------
	// Remove — observer-driven refresh: removed view disappears
	// -------------------------------------------------------------------------

	it("clicking Remove removes the view from the list (observer-driven, no manual displayAsync needed)", async () => {
		const store = makeFakeStoreForTab({
			"keep": makeRecord({ commandName: "Keep This", engine: "dataview-dql" }),
			"gone": makeRecord({ commandName: "Gone View", engine: "dataview-dql" }),
		});
		const removeCommand = vi.fn();
		const tab = makeTab(
			app,
			store as unknown as ViewStore,
			makeRegistryWith("dataview-dql"),
			makeConsentGate(),
			makeImporter(),
			noop,
			removeCommand,
		);
		await tab.displayAsync();

		// Find "Gone View" row and click its Remove button
		const allSettings = tab.containerEl.querySelectorAll("[data-setting-name]");
		let removeBtnForGone: HTMLButtonElement | null = null;
		for (const s of allSettings) {
			if (s.getAttribute("data-setting-name") === "Gone View") {
				const btns = s.querySelectorAll("button");
				for (const btn of btns) {
					if (btn.textContent?.trim() === "Remove") {
						removeBtnForGone = btn as HTMLButtonElement;
						break;
					}
				}
				break;
			}
		}
		expect(removeBtnForGone).not.toBeNull();
		removeBtnForGone!.click();

		await vi.waitFor(() => {
			expect(tab.containerEl.textContent).not.toContain("Gone View");
		});
		expect(tab.containerEl.textContent).toContain("Keep This");
		expect(countViewRows(tab.containerEl, ["Keep This"])).toBe(1);
	});

	// -------------------------------------------------------------------------
	// Disable — observer-driven: disabled view shows Enable button afterward
	// -------------------------------------------------------------------------

	it("clicking Disable updates the row to show Enable button (observer-driven re-render)", async () => {
		const store = makeFakeStoreForTab({
			"v1": makeRecord({ enabled: true, commandName: "Toggle View", engine: "dataview-dql" }),
		});
		const tab = makeTab(
			app,
			store as unknown as ViewStore,
			makeRegistryWith("dataview-dql"),
			makeConsentGate(),
			makeImporter(),
		);
		await tab.displayAsync();

		expect(findButton(tab.containerEl, "Disable")).not.toBeNull();
		expect(findButton(tab.containerEl, "Enable")).toBeNull();

		findButton(tab.containerEl, "Disable")!.click();

		await vi.waitFor(() => {
			expect(findButton(tab.containerEl, "Enable")).not.toBeNull();
		});
		expect(findButton(tab.containerEl, "Disable")).toBeNull();
		// Still exactly one row
		expect(countViewRows(tab.containerEl, ["Toggle View"])).toBe(1);
	});

	// -------------------------------------------------------------------------
	// Enable (consent granted) — observer-driven: ConsentGate.requestConsent
	// calls store.setRecord on grant which fires the observer → re-render.
	// -------------------------------------------------------------------------

	it("clicking Enable with consent granted updates the row to Disable (observer-driven re-render)", async () => {
		// ConsentGate stub that calls store.setRecord to simulate a grant
		const store = makeFakeStoreForTab({
			"v1": makeRecord({ enabled: false, commandName: "Enable Me", engine: "dataview-dql" }),
		});

		const gate: ConsentGate = {
			evaluate: vi.fn(async () => ({ status: "not-consented" as const })),
			requestConsent: vi.fn(async (id: string, record: ViewRecord) => {
				// On grant the real ConsentGate calls store.setRecord — simulate that
				await (store as unknown as ViewStore).setRecord(id, { ...record, enabled: true, okayed: { version: 1, checksum: "sha256:abc" } });
				return true;
			}),
			requestReConsent: vi.fn(async () => true),
		} as unknown as ConsentGate;

		const tab = makeTab(
			app,
			store as unknown as ViewStore,
			makeRegistryWith("dataview-dql"),
			gate,
			makeImporter(),
		);
		await tab.displayAsync();

		expect(findButton(tab.containerEl, "Enable")).not.toBeNull();

		findButton(tab.containerEl, "Enable")!.click();

		await vi.waitFor(() => {
			expect(findButton(tab.containerEl, "Disable")).not.toBeNull();
		});
		expect(findButton(tab.containerEl, "Enable")).toBeNull();
		expect(countViewRows(tab.containerEl, ["Enable Me"])).toBe(1);
	});
});
