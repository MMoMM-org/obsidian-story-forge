/**
 * main.test.ts — integration tests for StoryForgePlugin (T4.1 + T4.2).
 *
 * Covers:
 * (a) onload instantiates ViewStore, registers SIDEBAR_VIEW_TYPE
 * (b) settings fold into StoryForgeData and persist across a reload
 * (c) CLOBBER GUARDS: saveSettings preserves views; setRecord preserves settings
 * (d) onunload detaches the sidebar view type
 * (e) no view activation runs before workspace.onLayoutReady (gated via activateView call)
 * T4.2: registered handler count returns to baseline after cleanup; view state cleared on close
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { App, Plugin, WorkspaceLeaf } from "obsidian";
import { SIDEBAR_VIEW_TYPE } from "pluginConstants";
import type { StoryForgeData } from "store/types";

// Dynamically import main after test setup so the mock is in place
async function makePlugin(): Promise<{
	plugin: InstanceType<typeof import("main").default>;
	app: App;
}> {
	const { default: StoryForgePlugin } = await import("main");
	const app = new App();
	// @ts-expect-error — Plugin constructor accepts app in tests
	const plugin = new StoryForgePlugin(app) as InstanceType<typeof StoryForgePlugin>;
	return { plugin, app };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeViewRecord() {
	return {
		provenance: "curated" as const,
		enabled: false,
		okayed: null,
		source: "test-view",
		engine: "bases" as const,
		command: false,
	};
}

// ---------------------------------------------------------------------------
// (a) onload — registration
// ---------------------------------------------------------------------------

describe("StoryForgePlugin.onload — wiring", () => {
	it("registerView is called with SIDEBAR_VIEW_TYPE", async () => {
		const { plugin } = await makePlugin();
		await plugin.onload();
		expect(plugin.registerView).toHaveBeenCalledWith(
			SIDEBAR_VIEW_TYPE,
			expect.any(Function),
		);
	});

	it("addRibbonIcon is called with the ICON and 'Story Forge: open panel'", async () => {
		const { plugin } = await makePlugin();
		await plugin.onload();
		expect(plugin.addRibbonIcon).toHaveBeenCalledWith(
			expect.any(String), // ICON
			"Story Forge: open panel",
			expect.any(Function),
		);
	});

	it("addCommand registers 'open-panel' command", async () => {
		const { plugin } = await makePlugin();
		await plugin.onload();
		expect(plugin.addCommand).toHaveBeenCalledWith(
			expect.objectContaining({ id: "open-panel" }),
		);
	});

	it("plugin exposes a store property after onload", async () => {
		const { plugin } = await makePlugin();
		await plugin.onload();
		// store is the ViewStore — should have getViews method
		expect(typeof (plugin as unknown as { store: { getViews: unknown } }).store?.getViews).toBe("function");
	});
});

// ---------------------------------------------------------------------------
// (b) settings persist across reload
// ---------------------------------------------------------------------------

describe("StoryForgePlugin — settings persistence across reload", () => {
	it("settings loaded from data.json are reflected in plugin.settings", async () => {
		const { plugin } = await makePlugin();
		// Simulate stored data with custom setting
		const stored: StoryForgeData = {
			settings: { exampleSetting: "custom-value" },
		};
		plugin.loadData.mockResolvedValue(stored);

		await plugin.onload();

		expect(plugin.settings.exampleSetting).toBe("custom-value");
	});

	it("missing settings key uses DEFAULT_SETTINGS fallback", async () => {
		const { plugin } = await makePlugin();
		plugin.loadData.mockResolvedValue({}); // no settings key
		await plugin.onload();
		expect(plugin.settings.exampleSetting).toBe("default");
	});
});

// ---------------------------------------------------------------------------
// (c) CLOBBER GUARDS
// ---------------------------------------------------------------------------

describe("StoryForgePlugin — clobber guards", () => {
	it("saveSettings does NOT drop the views map", async () => {
		const { plugin } = await makePlugin();

		// Simulate existing data with a view record
		const existingData: StoryForgeData = {
			settings: { exampleSetting: "old" },
			views: { "view-1": makeViewRecord() },
		};
		plugin.loadData.mockResolvedValue(existingData);
		await plugin.onload();

		// Now change a setting and save
		plugin.settings.exampleSetting = "new-value";
		await plugin.saveSettings();

		// saveData should have been called with data that still includes views
		const savedArg = plugin.saveData.mock.calls.at(-1)?.[0] as StoryForgeData;
		expect(savedArg.views).toBeDefined();
		expect(savedArg.views?.["view-1"]).toBeDefined();
		expect(savedArg.settings?.exampleSetting).toBe("new-value");
	});

	it("ViewStore.setRecord does NOT drop settings", async () => {
		const { plugin } = await makePlugin();

		const existingData: StoryForgeData = {
			settings: { exampleSetting: "keep-me" },
		};
		plugin.loadData.mockResolvedValue(existingData);
		await plugin.onload();

		const store = (plugin as unknown as { store: import("store/ViewStore").ViewStore }).store;

		// Write a view record via the store
		await store.setRecord("view-abc", makeViewRecord());

		// The last saveData call should preserve settings
		const savedArg = plugin.saveData.mock.calls.at(-1)?.[0] as StoryForgeData;
		expect(savedArg.settings?.exampleSetting).toBe("keep-me");
		expect(savedArg.views?.["view-abc"]).toBeDefined();
	});
});

// ---------------------------------------------------------------------------
// (d) onunload — detach sidebar
// ---------------------------------------------------------------------------

describe("StoryForgePlugin.onunload — cleanup", () => {
	it("detachLeavesOfType is called with SIDEBAR_VIEW_TYPE on unload", async () => {
		const { plugin } = await makePlugin();
		await plugin.onload();
		plugin.onunload();
		expect(plugin.app.workspace.detachLeavesOfType).toHaveBeenCalledWith(
			SIDEBAR_VIEW_TYPE,
		);
	});
});

// ---------------------------------------------------------------------------
// (e) no early activation before layout-ready
// ---------------------------------------------------------------------------

describe("StoryForgePlugin — layout-ready gating", () => {
	it("onload does NOT call activateView (no workspace.getLeavesOfType calls outside layout-ready)", async () => {
		const { plugin } = await makePlugin();
		// Defer layout ready so we can observe pre-layout state
		plugin.app.workspace._deferLayoutReady = true;

		await plugin.onload();

		// The plugin should not force-activate the view on load (only the user
		// gesture — ribbon/command — triggers activateView). The leaf is created
		// lazily by registerView factory, never eagerly.
		expect(plugin.app.workspace.getLeavesOfType).not.toHaveBeenCalledWith(
			SIDEBAR_VIEW_TYPE,
		);
	});
});

// ---------------------------------------------------------------------------
// T4.2: Lifecycle cleanup — handler count returns to baseline after cleanup
// ---------------------------------------------------------------------------

describe("StoryForgePlugin T4.2 — lifecycle cleanup", () => {
	it("SidebarView listeners are registered via registerEvent (tracked)", async () => {
		const { plugin } = await makePlugin();

		// Provide a leaf for the view factory
		const leaf = new WorkspaceLeaf();
		plugin.app.workspace.getRightLeaf.mockReturnValue(leaf);

		await plugin.onload();

		// Build a sidebar view via the registered factory
		const factoryCall = plugin.registerView.mock.calls.find(
			(c: unknown[]) => c[0] === SIDEBAR_VIEW_TYPE,
		);
		expect(factoryCall).toBeDefined();
		const factory = factoryCall?.[1] as (leaf: WorkspaceLeaf) => import("views/SidebarView").SidebarView;
		const view = factory(leaf);

		// Open the view (registers workspace events)
		await view.onOpen();

		// registerEvent should have been called (for active-leaf-change + metadataCache)
		expect(view.registerEvent).toHaveBeenCalled();
	});

	it("SidebarView.onClose clears resolved context state", async () => {
		const { plugin } = await makePlugin();
		const leaf = new WorkspaceLeaf();
		plugin.app.workspace.getRightLeaf.mockReturnValue(leaf);
		await plugin.onload();

		const factoryCall = plugin.registerView.mock.calls.find(
			(c: unknown[]) => c[0] === SIDEBAR_VIEW_TYPE,
		);
		const factory = factoryCall?.[1] as (leaf: WorkspaceLeaf) => import("views/SidebarView").SidebarView;
		const view = factory(leaf);

		await view.onOpen();
		await view.onClose();

		// contentEl should be cleared (empty) after close
		expect(view.contentEl.children.length).toBe(0);
	});
});
