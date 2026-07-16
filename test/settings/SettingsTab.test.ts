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
import type { ViewRecord } from "../../src/store/types";
import type { ConsentGate } from "../../src/consent/ConsentGate";
import type { ViewImporter } from "../../src/import/ViewImporter";
import type { RegisterCommandCallback } from "../../src/import/types";
import { BindModal } from "../../src/import/BindModal";

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

/**
 * A ConsentGate whose evaluate() resolves a fixed decision status. Used by the
 * drift-aware row tests: the row-state decision is made via the enabled
 * projection `gate.evaluate({ ...record, enabled: true })`.
 */
function makeGateWithDecision(
	status:
		| "consented"
		| "not-consented"
		| "drift"
		| "platform-restricted"
		| "engine-missing"
		| "dvjs-off",
): ConsentGate {
	return {
		evaluate: vi.fn(async () =>
			status === "drift"
				? ({ status: "drift" as const, reason: "checksum" as const })
				: ({ status } as { status: typeof status }),
		),
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
	return new SettingsTab(app, plugin as never, store, gate, importer, registerCommand, removeCommand);
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
		const tab = makeTab(app, store, makeConsentGate(), makeImporter());
		const container = await renderTab(tab);

		const text = container.textContent ?? "";
		expect(text).toContain("Views");
	});

	it("renders empty-state message when no views are imported", async () => {
		const store = makeStore();
		const tab = makeTab(app, store, makeConsentGate(), makeImporter());
		const container = await renderTab(tab);

		const text = container.textContent ?? "";
		expect(text).toContain("No views imported yet. Use 'Import view' to add a view.");
	});

	it("does not show empty-state when at least one view exists", async () => {
		const store = makeStore({ "v1": makeRecord({ enabled: true }) });
		const tab = makeTab(app, store, makeConsentGate(), makeImporter());
		const container = await renderTab(tab);

		const text = container.textContent ?? "";
		expect(text).not.toContain("No views imported yet");
	});

	// -------------------------------------------------------------------------
	// S24 — Enabled row
	// -------------------------------------------------------------------------

	it("renders S24 row with Disable action for an enabled view", async () => {
		const store = makeStore({ "v1": makeRecord({ enabled: true, commandName: "My DQL View" }) });
		const tab = makeTab(app, store, makeConsentGate(), makeImporter());
		const container = await renderTab(tab);

		// Should show name and have a Disable button
		expect(container.textContent).toContain("My DQL View");
		expect(findButton(container, "Disable")).not.toBeNull();
	});

	it("S24 row shows engine type in description", async () => {
		const store = makeStore({ "v1": makeRecord({ enabled: true, engine: "dataview-dql", commandName: "DQL View" }) });
		const tab = makeTab(app, store, makeConsentGate(), makeImporter());
		const container = await renderTab(tab);

		const text = container.textContent ?? "";
		expect(text).toContain("dataview-dql");
	});

	// -------------------------------------------------------------------------
	// S25 — Disabled / Consent required row
	// -------------------------------------------------------------------------

	it("renders S25 row with Enable action for disabled view with okayed:null", async () => {
		const store = makeStore({ "v1": makeRecord({ enabled: false, okayed: null, commandName: "DQL View" }) });
		const tab = makeTab(app, store, makeConsentGate(), makeImporter());
		const container = await renderTab(tab);

		expect(findButton(container, "Enable")).not.toBeNull();
	});

	it("clicking Enable for DataviewJS view calls consentGate.requestConsent", async () => {
		const store = makeStore({ "v1": makeRecord({ enabled: false, okayed: null, engine: "dataviewjs", commandName: "JS View" }) });
		const gate = makeConsentGate();
		const tab = makeTab(app, store, gate, makeImporter());
		const container = await renderTab(tab);

		const enableBtn = findButton(container, "Enable");
		expect(enableBtn).not.toBeNull();
		enableBtn!.click();
		await vi.waitFor(() => expect(gate.requestConsent).toHaveBeenCalledWith("v1", expect.objectContaining({ engine: "dataviewjs" })));
	});

	it("clicking Enable for DQL view calls consentGate.requestConsent", async () => {
		const store = makeStore({ "v1": makeRecord({ enabled: false, okayed: null, engine: "dataview-dql", commandName: "DQL View" }) });
		const gate = makeConsentGate();
		const tab = makeTab(app, store, gate, makeImporter());
		const container = await renderTab(tab);

		const enableBtn = findButton(container, "Enable");
		expect(enableBtn).not.toBeNull();
		enableBtn!.click();
		await vi.waitFor(() => expect(gate.requestConsent).toHaveBeenCalledWith("v1", expect.objectContaining({ engine: "dataview-dql" })));
	});

	it("dismissed consent (requestConsent returns false) does not call store.setRecord and row stays S25", async () => {
		const store = makeStore({ "v1": makeRecord({ enabled: false, okayed: null, engine: "dataviewjs", commandName: "JS View" }) });
		const gate = makeConsentGate();
		// Stub requestConsent to return false (user cancelled)
		vi.mocked(gate.requestConsent).mockResolvedValue(false);
		const setRecordSpy = vi.spyOn(store, "setRecord");
		const tab = makeTab(app, store, gate, makeImporter());
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
		// The gate reports engine-missing (the real gate checks the registry).
		const store = makeStore({ "v1": makeRecord({ enabled: true, engine: "dataview-dql", commandName: "Missing Engine View" }) });
		const tab = makeTab(app, store, makeGateWithDecision("engine-missing"), makeImporter());
		const container = await renderTab(tab);

		const text = container.textContent ?? "";
		expect(text).toContain("Missing Engine View");
		// S26 state: engine missing indicator shown — no Enable/Disable buttons
		expect(findButton(container, "Disable")).toBeNull();
		expect(findButton(container, "Enable")).toBeNull();
	});

	it("S26 row description mentions engine missing", async () => {
		const store = makeStore({ "v1": makeRecord({ enabled: true, engine: "dataview-dql", commandName: "No Engine View" }) });
		const tab = makeTab(app, store, makeGateWithDecision("engine-missing"), makeImporter());
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
		const setRecordSpy = vi.spyOn(store, "setRecord");
		const tab = makeTab(app, store, makeConsentGate(), makeImporter());
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
		const tab = makeTab(app, store, makeConsentGate(), makeImporter());
		const container = await renderTab(tab);

		const removeBtn = findButton(container, "Remove");
		expect(removeBtn).not.toBeNull();
		removeBtn!.click();

		await vi.waitFor(() => expect(deleteRecordSpy).toHaveBeenCalledWith("v1"));
	});

	it("Remove does not call any vault write API", async () => {
		const store = makeStore({ "v1": makeRecord({ enabled: false, commandName: "Remove Me" }) });
		const tab = makeTab(app, store, makeConsentGate(), makeImporter());
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
		const tab = makeTab(app, store, makeConsentGate(), makeImporter());
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

		// Re-render (the observer already re-rendered; this asserts convergence).
		await renderTab(tab);
		await vi.waitFor(() => {
			// Wait for the stable painted state — observer + manual render both fire
			// displayAsync(); the gen guard coalesces them to one final paint.
			expect(tab.containerEl.textContent).toContain("Keep Me");
		});
		expect(tab.containerEl.textContent).not.toContain("Remove Me");
	});

	it("clicking Remove calls the injected removeCommand callback with the view id", async () => {
		const store = makeStore({ "v-cmd": makeRecord({ enabled: false, commandName: "Cmd View" }) });
		const removeCommand = vi.fn();
		const tab = makeTab(app, store, makeConsentGate(), makeImporter(), noop, removeCommand);
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
		const tab = makeTab(app, store, makeConsentGate(), makeImporter(), noop, removeCommand);
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
		const tab = makeTab(app, store, makeConsentGate(), makeImporter());
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
		const tab = makeTab(app, store as unknown as ViewStore, makeConsentGate(), makeImporter());
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
		const tab = makeTab(app, store as unknown as ViewStore, makeConsentGate(), makeImporter());

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
		const tab = makeTab(app, store as unknown as ViewStore, makeConsentGate(), makeImporter());

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
		const tab = makeTab(app, store as unknown as ViewStore, makeConsentGate(), makeImporter());

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

describe("SettingsTab — Bug B: _displayGen guard coalesces concurrent displayAsync() calls", () => {
	let app: App;

	beforeEach(() => {
		app = makeApp();
	});

	// -------------------------------------------------------------------------
	// No-doubling test — faithfully reproduces the pre-fix race:
	//   render A starts (enters displayAsync, increments gen, clears container)
	//   render B starts concurrently (increments gen again, clears container)
	//   both await getViews(); render A's gen is now stale → it bails
	//   render B paints the single correct set of rows
	//
	// Without the `if (gen !== this._displayGen) return;` guard both renders
	// append rows → 2 rows per view. This test FAILS if the guard is removed.
	// -------------------------------------------------------------------------

	it("two concurrent renders produce exactly one row per view (no duplication)", async () => {
		const store = makeFakeStoreForTab({
			"v1": makeRecord({ enabled: true, commandName: "Alpha View", engine: "dataview-dql" }),
			"v2": makeRecord({ enabled: true, commandName: "Beta View", engine: "dataview-dql" }),
		});
		const tab = makeTab(
			app,
			store as unknown as ViewStore,
			makeConsentGate(),
			makeImporter(),
		);

		// Start render A without awaiting — it is suspended at getViews().
		// Start render B immediately — this is the pre-fix double-trigger:
		// the old code's manual displayAsync() call + the store observer both
		// fired displayAsync() after a mutation. Both renders are in flight at once.
		const p1 = tab.displayAsync();
		const p2 = tab.displayAsync();
		await Promise.all([p1, p2]);

		// Each view must appear exactly once — the guard suppressed the stale render.
		expect(countViewRows(tab.containerEl, ["Alpha View", "Beta View"])).toBe(2);
	});

	// -------------------------------------------------------------------------
	// Disable action — manually reproduce the pre-fix double-trigger:
	//   render A starts (fired manually to simulate the old manual call)
	//   click Disable → store.setRecord fires observer → render B starts
	//   both in flight; guard must discard render A
	// -------------------------------------------------------------------------

	it("Disable action race (manual render + observer render) produces exactly one row per view", async () => {
		const store = makeFakeStoreForTab({
			"v1": makeRecord({ enabled: true, commandName: "Alpha View", engine: "dataview-dql" }),
			"v2": makeRecord({ enabled: true, commandName: "Beta View", engine: "dataview-dql" }),
		});
		const tab = makeTab(
			app,
			store as unknown as ViewStore,
			makeConsentGate(),
			makeImporter(),
		);
		await tab.displayAsync();

		// Grab the Disable button reference BEFORE starting render A (render A's
		// synchronous containerEl.empty() would detach it from the DOM immediately).
		const disableBtn = findButton(tab.containerEl, "Disable");
		expect(disableBtn).not.toBeNull();

		// Simulate the pre-fix double-trigger:
		//   render A starts (old manual call equivalent) — suspended at getViews()
		//   then click Disable → store.setRecord → observer fires render B
		// Both renders are in flight concurrently.
		const p1 = tab.displayAsync(); // render A
		disableBtn!.click();           // render B via store.setRecord → observer

		// Wait for both renders to settle
		await p1;
		await vi.waitFor(() => {
			// v1 disabled → Enable button appears
			expect(findButton(tab.containerEl, "Enable")).not.toBeNull();
		});

		// Each view must appear exactly once — not four rows
		expect(countViewRows(tab.containerEl, ["Alpha View", "Beta View"])).toBe(2);
	});
});

// ---------------------------------------------------------------------------
// Observer-driven refresh — single render per action (no concurrent renders).
// These tests verify the observer path produces correct UI state changes.
// They do NOT catch the _displayGen guard regression — see Bug B above for that.
// ---------------------------------------------------------------------------

describe("SettingsTab — observer-driven refresh via store subscriber", () => {
	let app: App;

	beforeEach(() => {
		app = makeApp();
	});

	// Observer path: Remove → deleteRecord fires subscriber → view disappears

	it("clicking Remove removes the view from the list", async () => {
		const store = makeFakeStoreForTab({
			"keep": makeRecord({ commandName: "Keep This", engine: "dataview-dql" }),
			"gone": makeRecord({ commandName: "Gone View", engine: "dataview-dql" }),
		});
		const removeCommand = vi.fn();
		const tab = makeTab(
			app,
			store as unknown as ViewStore,
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
			// Wait for the repaint (positive stable state) so we don't sample the
			// transient empty window between containerEl.empty() and the async paint.
			expect(tab.containerEl.textContent).toContain("Keep This");
		});
		expect(tab.containerEl.textContent).not.toContain("Gone View");
		expect(countViewRows(tab.containerEl, ["Keep This"])).toBe(1);
	});

	// Observer path: Disable → setRecord fires subscriber → row shows Enable

	it("clicking Disable updates the row to show Enable button", async () => {
		const store = makeFakeStoreForTab({
			"v1": makeRecord({ enabled: true, commandName: "Toggle View", engine: "dataview-dql" }),
		});
		const tab = makeTab(
			app,
			store as unknown as ViewStore,
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
		expect(countViewRows(tab.containerEl, ["Toggle View"])).toBe(1);
	});

	// Observer path: Enable (consent granted) → ConsentGate calls setRecord →
	// subscriber fires → row shows Disable

	it("clicking Enable with consent granted updates the row to Disable", async () => {
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

// ---------------------------------------------------------------------------
// T-S2.5 — drift-aware rows + Edit + Review
// ---------------------------------------------------------------------------

describe("SettingsTab — T-S2.5 drift-aware row states", () => {
	let app: App;

	beforeEach(() => {
		app = makeApp();
	});

	it("enabled+consented → Disable + Edit + Remove (no Review/Enable)", async () => {
		const store = makeStore({ "v1": makeRecord({ enabled: true, commandName: "Enabled View" }) });
		const gate = makeGateWithDecision("consented");
		const tab = makeTab(app, store, gate, makeImporter());
		const container = await renderTab(tab);

		expect(findButton(container, "Disable")).not.toBeNull();
		expect(findButton(container, "Edit")).not.toBeNull();
		expect(findButton(container, "Remove")).not.toBeNull();
		expect(findButton(container, "Review")).toBeNull();
		expect(findButton(container, "Enable")).toBeNull();
	});

	it("disabled+consented → Re-enable + Edit + Remove; Re-enable is immediate (no modal, no requestConsent)", async () => {
		const okayed = { version: 1, checksum: "sha256:abc" };
		const store = makeStore({ "v1": makeRecord({ enabled: false, okayed, commandName: "Disabled View" }) });
		const gate = makeGateWithDecision("consented");
		const setRecordSpy = vi.spyOn(store, "setRecord");
		const tab = makeTab(app, store, gate, makeImporter());
		const container = await renderTab(tab);

		const reEnableBtn = findButton(container, "Re-enable");
		expect(reEnableBtn).not.toBeNull();
		expect(findButton(container, "Edit")).not.toBeNull();
		expect(findButton(container, "Remove")).not.toBeNull();

		reEnableBtn!.click();

		await vi.waitFor(() =>
			expect(setRecordSpy).toHaveBeenCalledWith("v1", expect.objectContaining({ enabled: true })),
		);
		// S25a: Re-enable must NOT open the consent modal (source unchanged)
		expect(gate.requestConsent).not.toHaveBeenCalled();
		expect(gate.requestReConsent).not.toHaveBeenCalled();
	});

	it("disabled+drift → Review + Edit + Remove; Review calls requestReConsent", async () => {
		const store = makeStore({ "v1": makeRecord({ enabled: false, okayed: { version: 1, checksum: "x" }, commandName: "Drifted View" }) });
		const gate = makeGateWithDecision("drift");
		const tab = makeTab(app, store, gate, makeImporter());
		const container = await renderTab(tab);

		const reviewBtn = findButton(container, "Review");
		expect(reviewBtn).not.toBeNull();
		expect(findButton(container, "Edit")).not.toBeNull();
		expect(findButton(container, "Remove")).not.toBeNull();

		reviewBtn!.click();
		await vi.waitFor(() =>
			expect(gate.requestReConsent).toHaveBeenCalledWith("v1", expect.objectContaining({ commandName: "Drifted View" })),
		);
	});

	it("disabled+not-consented → Enable + Edit + Remove; Enable calls requestConsent", async () => {
		const store = makeStore({ "v1": makeRecord({ enabled: false, okayed: null, commandName: "Never Consented" }) });
		const gate = makeGateWithDecision("not-consented");
		const tab = makeTab(app, store, gate, makeImporter());
		const container = await renderTab(tab);

		const enableBtn = findButton(container, "Enable");
		expect(enableBtn).not.toBeNull();
		expect(findButton(container, "Edit")).not.toBeNull();
		expect(findButton(container, "Remove")).not.toBeNull();

		enableBtn!.click();
		await vi.waitFor(() =>
			expect(gate.requestConsent).toHaveBeenCalledWith("v1", expect.objectContaining({ commandName: "Never Consented" })),
		);
	});

	it("enabled+drift → Review + Edit + Remove; Review calls requestReConsent", async () => {
		const store = makeStore({ "v1": makeRecord({ enabled: true, okayed: { version: 1, checksum: "x" }, commandName: "Enabled Drift" }) });
		const gate = makeGateWithDecision("drift");
		const tab = makeTab(app, store, gate, makeImporter());
		const container = await renderTab(tab);

		const reviewBtn = findButton(container, "Review");
		expect(reviewBtn).not.toBeNull();
		expect(findButton(container, "Edit")).not.toBeNull();
		expect(findButton(container, "Remove")).not.toBeNull();

		reviewBtn!.click();
		await vi.waitFor(() =>
			expect(gate.requestReConsent).toHaveBeenCalledWith("v1", expect.objectContaining({ commandName: "Enabled Drift" })),
		);
	});

	it("enabled+not-consented → Review + Disable + Edit + Remove; Review calls requestConsent", async () => {
		const store = makeStore({ "v1": makeRecord({ enabled: true, okayed: null, commandName: "Enabled No Consent" }) });
		const gate = makeGateWithDecision("not-consented");
		const tab = makeTab(app, store, gate, makeImporter());
		const container = await renderTab(tab);

		const reviewBtn = findButton(container, "Review");
		expect(reviewBtn).not.toBeNull();
		expect(findButton(container, "Disable")).not.toBeNull();
		expect(findButton(container, "Edit")).not.toBeNull();
		expect(findButton(container, "Remove")).not.toBeNull();

		reviewBtn!.click();
		await vi.waitFor(() =>
			expect(gate.requestConsent).toHaveBeenCalledWith("v1", expect.objectContaining({ commandName: "Enabled No Consent" })),
		);
	});

	it("dvjs-off → Edit + Remove (no toggle)", async () => {
		const store = makeStore({ "v1": makeRecord({ enabled: true, engine: "dataviewjs", commandName: "DvJs Off View" }) });
		const gate = makeGateWithDecision("dvjs-off");
		const tab = makeTab(app, store, gate, makeImporter());
		const container = await renderTab(tab);

		expect(findButton(container, "Edit")).not.toBeNull();
		expect(findButton(container, "Remove")).not.toBeNull();
		expect(findButton(container, "Disable")).toBeNull();
		expect(findButton(container, "Enable")).toBeNull();
		expect((container.textContent ?? "").toLowerCase()).toContain("disabled in dataview settings");
	});

	it("platform-restricted → Edit + Remove (no toggle)", async () => {
		const store = makeStore({ "v1": makeRecord({ enabled: true, engine: "dataviewjs", commandName: "Mobile Restricted View" }) });
		const gate = makeGateWithDecision("platform-restricted");
		const tab = makeTab(app, store, gate, makeImporter());
		const container = await renderTab(tab);

		expect(findButton(container, "Edit")).not.toBeNull();
		expect(findButton(container, "Remove")).not.toBeNull();
		expect(findButton(container, "Disable")).toBeNull();
		expect(findButton(container, "Enable")).toBeNull();
	});

	it("engine-missing → Remove only (no Edit — non-vacuous assert)", async () => {
		const store = makeStore({ "v1": makeRecord({ enabled: true, engine: "dataview-dql", commandName: "Missing Engine" }) });
		const gate = makeGateWithDecision("engine-missing");
		const tab = makeTab(app, store, gate, makeImporter());
		const container = await renderTab(tab);

		expect(findButton(container, "Remove")).not.toBeNull();
		expect(findButton(container, "Edit")).toBeNull();
		expect(findButton(container, "Disable")).toBeNull();
		expect(findButton(container, "Enable")).toBeNull();
		expect(findButton(container, "Review")).toBeNull();
	});
});

describe("SettingsTab — T-S2.5 Edit action", () => {
	let app: App;

	beforeEach(() => {
		app = makeApp();
		vi.restoreAllMocks();
	});

	it("clicking Edit opens BindModal and, on Done with registerCommand:true, writes label+command and registers the command", async () => {
		const store = makeStore({ "v1": makeRecord({ enabled: true, command: false, commandName: "Old Label" }) });
		const gate = makeGateWithDecision("consented");
		const registerCommand = vi.fn();
		const removeCommand = vi.fn();
		const setRecordSpy = vi.spyOn(store, "setRecord");
		const presentSpy = vi
			.spyOn(BindModal.prototype, "present")
			.mockResolvedValue({ label: "New Label", registerCommand: true, commandName: "Story Forge: New Label" });

		const tab = makeTab(app, store, gate, makeImporter(), registerCommand, removeCommand);
		const container = await renderTab(tab);

		const editBtn = findButton(container, "Edit");
		expect(editBtn).not.toBeNull();
		editBtn!.click();

		await vi.waitFor(() => expect(presentSpy).toHaveBeenCalled());
		await vi.waitFor(() =>
			expect(setRecordSpy).toHaveBeenCalledWith("v1", expect.objectContaining({ commandName: "New Label", command: true })),
		);
		await vi.waitFor(() =>
			expect(registerCommand).toHaveBeenCalledWith("v1", "Story Forge: New Label"),
		);
	});

	it("Edit with registerCommand:false on a previously-command record calls removeCommand and NOT registerCommand", async () => {
		const store = makeStore({ "v1": makeRecord({ enabled: true, command: true, commandName: "Had Command" }) });
		const gate = makeGateWithDecision("consented");
		const registerCommand = vi.fn();
		const removeCommand = vi.fn();
		vi.spyOn(BindModal.prototype, "present").mockResolvedValue({ label: "Renamed", registerCommand: false, commandName: "Story Forge: Renamed" });

		const tab = makeTab(app, store, gate, makeImporter(), registerCommand, removeCommand);
		const container = await renderTab(tab);

		findButton(container, "Edit")!.click();

		await vi.waitFor(() => expect(removeCommand).toHaveBeenCalledWith("v1"));
		expect(registerCommand).not.toHaveBeenCalled();
	});

	it("Edit cancelled (present resolves null) does not write the store", async () => {
		const store = makeStore({ "v1": makeRecord({ enabled: true, command: false, commandName: "Unchanged" }) });
		const gate = makeGateWithDecision("consented");
		const setRecordSpy = vi.spyOn(store, "setRecord");
		const presentSpy = vi.spyOn(BindModal.prototype, "present").mockResolvedValue(null);

		const tab = makeTab(app, store, gate, makeImporter());
		const container = await renderTab(tab);

		findButton(container, "Edit")!.click();

		await vi.waitFor(() => expect(presentSpy).toHaveBeenCalled());
		// allow any (non-existent) follow-up microtasks to flush
		await Promise.resolve();
		await Promise.resolve();
		expect(setRecordSpy).not.toHaveBeenCalled();
	});
});

describe("SettingsTab — T-S2.5 re-entrancy holds across the evaluate await", () => {
	let app: App;

	beforeEach(() => {
		app = makeApp();
	});

	it("two concurrent renders produce exactly one row per view even with an async evaluate", async () => {
		const store = makeFakeStoreForTab({
			"v1": makeRecord({ enabled: true, commandName: "Alpha View", engine: "dataview-dql" }),
			"v2": makeRecord({ enabled: true, commandName: "Beta View", engine: "dataview-dql" }),
		});
		// evaluate resolves after a microtask so a superseded render is in flight
		// while decisions are being gathered — the gen guard must still bail it.
		const gate = {
			evaluate: vi.fn(async () => {
				await Promise.resolve();
				return { status: "consented" as const };
			}),
			requestConsent: vi.fn(async () => true),
			requestReConsent: vi.fn(async () => true),
		} as unknown as ConsentGate;

		const tab = makeTab(app, store as unknown as ViewStore, gate, makeImporter());

		const p1 = tab.displayAsync();
		const p2 = tab.displayAsync();
		await Promise.all([p1, p2]);

		expect(countViewRows(tab.containerEl, ["Alpha View", "Beta View"])).toBe(2);
	});
});
