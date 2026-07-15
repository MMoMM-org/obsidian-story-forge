/**
 * main.test.ts — integration tests for StoryForgePlugin (T4.1 + T4.2).
 *
 * Covers:
 * (a) onload instantiates ViewStore, registers SIDEBAR_VIEW_TYPE
 * (b) settings fold into StoryForgeData and persist across a reload
 * (c) CLOBBER GUARDS: saveSettings preserves views; setRecord preserves settings
 * (d) onunload runs cleanly WITHOUT detaching leaves (preserves user layout; obsidianmd guidance)
 * (e) no view activation runs before workspace.onLayoutReady (gated via activateView call)
 * T4.2: registered handler count returns to baseline after cleanup; view state cleared on close
 */

import { describe, it, expect, vi } from "vitest";
import { App, WorkspaceLeaf, TFile, createMockDataviewApi, wireDataviewApi } from "obsidian";
import { SIDEBAR_VIEW_TYPE } from "pluginConstants";
import type { StoryForgeData } from "store/types";
import { EngineRegistry } from "engines/QueryEngine";

// Dynamically import main after test setup so the mock is in place
async function makePlugin(): Promise<{
	plugin: InstanceType<typeof import("main").default>;
	app: App;
}> {
	const { default: StoryForgePlugin } = await import("main");
	const app = new App();
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
// (d) onunload — clean unload WITHOUT detaching leaves
// ---------------------------------------------------------------------------

describe("StoryForgePlugin.onunload — clean unload", () => {
	it("runs the plugin unload without error", async () => {
		const { plugin } = await makePlugin();
		await plugin.onload();
		// Simulate Obsidian unloading the plugin (Component cleanup). Must not throw.
		expect(() => { plugin._runCleanup(); }).not.toThrow();
	});

	it("does NOT detach leaves on unload (obsidianmd guidance — preserve layout)", async () => {
		const { plugin } = await makePlugin();
		await plugin.onload();
		plugin._runCleanup();
		// The plugin must not reset the user's panel layout by detaching leaves;
		// Obsidian releases registered views natively.
		expect(plugin.app.workspace.detachLeavesOfType).not.toHaveBeenCalled();
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
	// Total live workspace + metadataCache event registrations for an App.
	function liveHandlerCount(app: App): number {
		let n = 0;
		for (const cbs of app.workspace._eventRegistrations.values()) n += cbs.length;
		const mc = app.metadataCache as unknown as {
			_eventRegistrations: Map<string, unknown[]>;
		};
		for (const cbs of mc._eventRegistrations.values()) n += cbs.length;
		return n;
	}

	function makeViewViaFactory(
		plugin: InstanceType<typeof import("main").default>,
		leaf: WorkspaceLeaf,
	): import("views/SidebarView").SidebarView {
		const factoryCall = plugin.registerView.mock.calls.find(
			(c: unknown[]) => c[0] === SIDEBAR_VIEW_TYPE,
		);
		expect(factoryCall).toBeDefined();
		const factory = factoryCall?.[1] as (
			leaf: WorkspaceLeaf,
		) => import("views/SidebarView").SidebarView;
		return factory(leaf);
	}

	it("SidebarView listeners are registered via registerEvent (tracked)", async () => {
		const { plugin, app } = await makePlugin();
		const leaf = new WorkspaceLeaf();
		leaf.app = app;
		plugin.app.workspace.getRightLeaf.mockReturnValue(leaf);
		await plugin.onload();

		const view = makeViewViaFactory(plugin, leaf);
		await view.onOpen();

		// registerEvent should have been called (active-leaf-change + metadataCache).
		expect(view.registerEvent).toHaveBeenCalled();
	});

	it("open→close→unload releases every listener (handler count returns to baseline)", async () => {
		const { plugin, app } = await makePlugin();
		const leaf = new WorkspaceLeaf();
		leaf.app = app;
		plugin.app.workspace.getRightLeaf.mockReturnValue(leaf);
		await plugin.onload();

		const baseline = liveHandlerCount(app);

		const view = makeViewViaFactory(plugin, leaf);
		await view.onOpen();

		// Opening the view must actually register handlers (else the test can't prove release).
		expect(liveHandlerCount(app)).toBeGreaterThan(baseline);

		// Close the view (SidebarView teardown) then unload the component
		// (Obsidian releases registered listeners). After both, no listener leaks.
		await view.onClose();
		(view as unknown as { _unload(): void })._unload();

		expect(liveHandlerCount(app)).toBe(baseline);
	});

	it("repeated open→close→unload cycles do not grow the handler count", async () => {
		const { plugin, app } = await makePlugin();
		const leaf = new WorkspaceLeaf();
		leaf.app = app;
		plugin.app.workspace.getRightLeaf.mockReturnValue(leaf);
		await plugin.onload();

		const baseline = liveHandlerCount(app);

		for (let i = 0; i < 3; i++) {
			const view = makeViewViaFactory(plugin, leaf);
			await view.onOpen();
			await view.onClose();
			(view as unknown as { _unload(): void })._unload();
		}

		// No accumulation across cycles — a leaked listener would grow this.
		expect(liveHandlerCount(app)).toBe(baseline);
	});

	it("a metadataCache 'changed' handler is not fired after unload (proves release)", async () => {
		const { plugin, app } = await makePlugin();
		const leaf = new WorkspaceLeaf();
		leaf.app = app;
		plugin.app.workspace.getRightLeaf.mockReturnValue(leaf);
		await plugin.onload();

		const view = makeViewViaFactory(plugin, leaf);
		await view.onOpen();

		// Spy on the view's re-resolve path via _renderState so we can detect a
		// stale handler firing. After unload, triggering the event must be a no-op.
		const renderSpy = vi.spyOn(
			view as unknown as { _renderState: (s: unknown) => void },
			"_renderState",
		);

		await view.onClose();
		(view as unknown as { _unload(): void })._unload();
		renderSpy.mockClear();

		// Fire the metadataCache event after unload — no live handler should run.
		const mc = app.metadataCache as unknown as {
			_trigger(event: string, ...args: unknown[]): void;
		};
		const f = new TFile();
		mc._trigger("changed", f);

		expect(renderSpy).not.toHaveBeenCalled();
	});

	it("SidebarView.onClose clears DOM and resolved-context state", async () => {
		const { plugin, app } = await makePlugin();
		const leaf = new WorkspaceLeaf();
		leaf.app = app;
		plugin.app.workspace.getRightLeaf.mockReturnValue(leaf);
		await plugin.onload();

		const view = makeViewViaFactory(plugin, leaf);
		await view.onOpen();

		// Seed internal state so we can prove onClose clears it.
		const tv = view as unknown as {
			currentCtx: unknown;
			lastError: unknown;
			subject: { file: TFile | null; source: string };
		};
		tv.currentCtx = { activeFile: new TFile(), activeKind: "scene", entities: [], backlinks: [], resolvedAt: 1 };
		tv.lastError = new Error("stale");
		tv.subject = { file: new TFile(), source: "pinned" };

		await view.onClose();

		// DOM cleared…
		expect(view.contentEl.children.length).toBe(0);
		// …and internal state reset so a re-opened view starts clean.
		expect(tv.currentCtx).toBeNull();
		expect(tv.lastError).toBeNull();
		expect(tv.subject).toEqual({ file: null, source: "follow" });
	});
});

// ---------------------------------------------------------------------------
// T4.4: main.ts wiring — EngineRegistry, ConsentGate, NativeScopingEngine,
//        SidebarView factory injection, late-join listener, registerCommand
// ---------------------------------------------------------------------------

describe("StoryForgePlugin T4.4 — full dep wiring", () => {
	it("onload injects an EngineRegistry into the SidebarView factory", async () => {
		const { plugin, app } = await makePlugin();
		const leaf = new WorkspaceLeaf();
		leaf.app = app;
		await plugin.onload();

		const factoryCall = plugin.registerView.mock.calls.find(
			(c: unknown[]) => c[0] === SIDEBAR_VIEW_TYPE,
		);
		expect(factoryCall).toBeDefined();
		const factory = factoryCall![1] as (leaf: WorkspaceLeaf) => import("views/SidebarView").SidebarView;
		const view = factory(leaf);
		// The factory closure injected deps: registry/consentGate/nativeEngine are
		// present (not null) — visible via the private fields.
		const tv = view as unknown as { registry: unknown; consentGate: unknown; nativeEngine: unknown };
		expect(tv.registry).toBeInstanceOf(EngineRegistry);
		expect(tv.consentGate).not.toBeNull();
		expect(tv.nativeEngine).not.toBeNull();
	});

	it("addSettingTab is called with 7-arg SettingsTab (typecheck no longer throws)", async () => {
		const { plugin } = await makePlugin();
		// If SettingsTab construction fails (wrong arg count) onload would throw —
		// so simply proving onload completes without error proves the fix.
		await expect(plugin.onload()).resolves.not.toThrow();
		expect(plugin.addSettingTab).toHaveBeenCalledTimes(1);
	});

	it("registers late-join dataview:api-ready listener via registerEvent", async () => {
		const { plugin, app } = await makePlugin();
		await plugin.onload();

		const mc = app.metadataCache as unknown as {
			_eventRegistrations: Map<string, unknown[]>;
		};
		const handlers = mc._eventRegistrations.get("dataview:api-ready") ?? [];
		expect(handlers.length).toBeGreaterThan(0);
	});

	it("late-join listener is cleaned up after _runCleanup (no dangling listener)", async () => {
		const { plugin, app } = await makePlugin();
		await plugin.onload();

		const mc = app.metadataCache as unknown as {
			_eventRegistrations: Map<string, unknown[]>;
		};
		// Listener should exist before cleanup
		expect(mc._eventRegistrations.has("dataview:api-ready")).toBe(true);

		plugin._runCleanup();

		// After cleanup: listener is gone
		const remaining = mc._eventRegistrations.get("dataview:api-ready") ?? [];
		expect(remaining.length).toBe(0);
	});

	it("when Dataview is present at layout-ready, registry is populated", async () => {
		const { plugin, app } = await makePlugin();
		const dvApi = createMockDataviewApi({ satisfies: true });
		wireDataviewApi(app, dvApi);

		await plugin.onload();

		// Access the shared registry from the SidebarView factory closure
		const factoryCall = plugin.registerView.mock.calls.find(
			(c: unknown[]) => c[0] === SIDEBAR_VIEW_TYPE,
		);
		const leaf = new WorkspaceLeaf();
		leaf.app = app;
		const factory = factoryCall![1] as (leaf: WorkspaceLeaf) => import("views/SidebarView").SidebarView;
		const view = factory(leaf);
		const tv = view as unknown as { registry: EngineRegistry };
		expect(tv.registry.get("dataview-dql")).toBeDefined();
		expect(tv.registry.get("dataviewjs")).toBeDefined();
	});

	it("when Dataview is absent at layout-ready, registry stays empty", async () => {
		const { plugin, app } = await makePlugin();
		// No Dataview wired — app has no plugins
		await plugin.onload();

		const factoryCall = plugin.registerView.mock.calls.find(
			(c: unknown[]) => c[0] === SIDEBAR_VIEW_TYPE,
		);
		const leaf = new WorkspaceLeaf();
		leaf.app = app;
		const factory = factoryCall![1] as (leaf: WorkspaceLeaf) => import("views/SidebarView").SidebarView;
		const view = factory(leaf);
		const tv = view as unknown as { registry: EngineRegistry };
		expect(tv.registry.get("dataview-dql")).toBeUndefined();
		expect(tv.registry.get("dataviewjs")).toBeUndefined();
	});

	it("late-join dataview:api-ready handler populates the registry without plugin reload", async () => {
		const { plugin, app } = await makePlugin();
		// Start with Dataview absent
		await plugin.onload();

		// Now wire Dataview and fire the late-join event
		const dvApi = createMockDataviewApi({ satisfies: true });
		wireDataviewApi(app, dvApi);

		const mc = app.metadataCache as unknown as {
			_trigger(event: string, ...args: unknown[]): void;
		};
		mc._trigger("dataview:api-ready");

		// Registry should now be populated (same shared instance in the factory closure)
		const factoryCall = plugin.registerView.mock.calls.find(
			(c: unknown[]) => c[0] === SIDEBAR_VIEW_TYPE,
		);
		const leaf = new WorkspaceLeaf();
		leaf.app = app;
		const factory = factoryCall![1] as (leaf: WorkspaceLeaf) => import("views/SidebarView").SidebarView;
		const view = factory(leaf);
		const tv = view as unknown as { registry: EngineRegistry };
		expect(tv.registry.get("dataview-dql")).toBeDefined();
	});

	it("registerCommand callback calls addCommand and stores the command id", async () => {
		const { plugin } = await makePlugin();
		const cmdId = "story-forge-view-cmd-abc";
		plugin.addCommand.mockReturnValue({ id: cmdId });
		await plugin.onload();

		// Exercise the registered callback via the exposed _registerViewCommand method
		const p = plugin as unknown as {
			_registerViewCommand: (viewId: string, commandName: string) => void;
			_commandIds: Map<string, string>;
		};
		p._registerViewCommand("view-123", "My View");

		expect(plugin.addCommand).toHaveBeenCalledWith(
			expect.objectContaining({ id: expect.stringContaining("view-123") }),
		);
		expect(p._commandIds.get("view-123")).toBe(cmdId);
	});

	it("removeCommand is called when a view with a tracked command is removed", async () => {
		const { plugin } = await makePlugin();
		const cmdId = "story-forge-view-cmd-xyz";
		plugin.addCommand.mockReturnValue({ id: cmdId });
		await plugin.onload();

		const p = plugin as unknown as {
			_registerViewCommand: (viewId: string, commandName: string) => void;
			_commandIds: Map<string, string>;
			_removeViewCommand: (viewId: string) => void;
		};
		p._registerViewCommand("view-xyz", "XYZ View");
		expect(p._commandIds.get("view-xyz")).toBe(cmdId);

		p._removeViewCommand("view-xyz");
		expect(plugin.removeCommand).toHaveBeenCalledWith(cmdId);
		expect(p._commandIds.has("view-xyz")).toBe(false);
	});

	it("_removeViewCommand is a no-op when viewId has no registered command", async () => {
		const { plugin } = await makePlugin();
		await plugin.onload();

		const p = plugin as unknown as { _removeViewCommand: (viewId: string) => void };
		// Should not throw when no command is registered for the viewId
		expect(() => p._removeViewCommand("nonexistent-view")).not.toThrow();
		expect(plugin.removeCommand).not.toHaveBeenCalled();
	});
});
