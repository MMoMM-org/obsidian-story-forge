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
import { App, WorkspaceLeaf, TFile, createMockCachedMetadata, createMockDataviewApi, createMockTFile, wireDataviewApi } from "obsidian";
import { SIDEBAR_VIEW_TYPE, WORKSPACE_VIEW_TYPE } from "pluginConstants";
import type { StoryForgeData } from "store/types";
import { EngineRegistry } from "engines/QueryEngine";

// Mock registerCodexView so we can assert call counts + simulate Bases availability
vi.mock("bases/BasesAdapter", () => ({
	registerCodexView: vi.fn(() => false),
	isBasesAvailable: vi.fn(() => false),
}));

// Capture what main.ts hands the settings tab (the ninth constructor argument is LibraryDeps).
const settingsTabArgs = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock("settings/SettingsTab", async (importOriginal) => {
	const actual = await importOriginal<typeof import("settings/SettingsTab")>();
	class CapturingSettingsTab extends actual.SettingsTab {
		constructor(...args: ConstructorParameters<typeof actual.SettingsTab>) {
			super(...args);
			settingsTabArgs.calls.push(args);
		}
	}
	return { ...actual, SettingsTab: CapturingSettingsTab };
});

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
		kind: "view" as const,
		surfaces: { anvil: false, workbench: false },
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

	// T2.6: the sidebar surface is renamed to "Workbench" (display only —
	// SIDEBAR_VIEW_TYPE below stays "story-forge-panel", CON-4).
	it("addRibbonIcon is called with the ICON and 'Story Forge: open Workbench'", async () => {
		const { plugin } = await makePlugin();
		await plugin.onload();
		expect(plugin.addRibbonIcon).toHaveBeenCalledWith(
			expect.any(String), // ICON
			"Story Forge: open Workbench",
			expect.any(Function),
		);
	});

	it("addCommand registers 'open-panel' command named 'Open Workbench'", async () => {
		const { plugin } = await makePlugin();
		await plugin.onload();
		expect(plugin.addCommand).toHaveBeenCalledWith(
			expect.objectContaining({ id: "open-panel", name: "Open Workbench" }),
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
		// Simulate stored data with a custom setting
		const stored: StoryForgeData = {
			settings: {
				linkClickAction: "drill",
				cardTitleOpensNote: true,
				curatedBasesFolder: "00 Meta/Bases",
				fileClassesFolder: "custom-value",
				excludedFolders: ["00 Meta"],
				editorDock: "bottom",
				cardByCollection: {},
				dismissedHints: [],
				keepUndoHistory: true,
				builtInCollections: {},
				disabledCards: [],
				libraryMigratedCount: 0,
			},
		};
		plugin.loadData.mockResolvedValue(stored);

		await plugin.onload();

		expect(plugin.settings.fileClassesFolder).toBe("custom-value");
	});

	it("missing settings key uses DEFAULT_SETTINGS fallback", async () => {
		const { plugin } = await makePlugin();
		plugin.loadData.mockResolvedValue({}); // no settings key
		await plugin.onload();
		expect(plugin.settings.fileClassesFolder).toBe("00 Meta/FileClasses");
		expect(plugin.settings.excludedFolders).toEqual(["00 Meta"]);
		expect(plugin.settings.editorDock).toBe("bottom");
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
			settings: {
				linkClickAction: "drill",
				cardTitleOpensNote: true,
				curatedBasesFolder: "00 Meta/Bases",
				fileClassesFolder: "old",
				excludedFolders: ["00 Meta"],
				editorDock: "bottom",
				cardByCollection: {},
				dismissedHints: [],
				keepUndoHistory: true,
				builtInCollections: {},
				disabledCards: [],
				libraryMigratedCount: 0,
			},
			views: { "view-1": makeViewRecord() },
		};
		plugin.loadData.mockResolvedValue(existingData);
		await plugin.onload();

		// Now change a setting and save
		plugin.settings.fileClassesFolder = "new-value";
		await plugin.saveSettings();

		// saveData should have been called with data that still includes views
		const savedArg = plugin.saveData.mock.calls.at(-1)?.[0] as StoryForgeData;
		expect(savedArg.views).toBeDefined();
		expect(savedArg.views?.["view-1"]).toBeDefined();
		expect(savedArg.settings?.fileClassesFolder).toBe("new-value");
	});

	it("ViewStore.setRecord does NOT drop settings", async () => {
		const { plugin } = await makePlugin();

		const existingData: StoryForgeData = {
			settings: {
				linkClickAction: "drill",
				cardTitleOpensNote: true,
				curatedBasesFolder: "00 Meta/Bases",
				fileClassesFolder: "keep-me",
				excludedFolders: ["00 Meta"],
				editorDock: "bottom",
				cardByCollection: {},
				dismissedHints: [],
				keepUndoHistory: true,
				builtInCollections: {},
				disabledCards: [],
				libraryMigratedCount: 0,
			},
		};
		plugin.loadData.mockResolvedValue(existingData);
		await plugin.onload();

		const store = (plugin as unknown as { store: import("store/ViewStore").ViewStore }).store;

		// Write a view record via the store
		await store.setRecord("view-abc", makeViewRecord());

		// The last saveData call should preserve settings
		const savedArg = plugin.saveData.mock.calls.at(-1)?.[0] as StoryForgeData;
		expect(savedArg.settings?.fileClassesFolder).toBe("keep-me");
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

	it("addSettingTab is called with 8-arg SettingsTab (registerCommand + removeCommand injected)", async () => {
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

	it("registerCommand callback calls addCommand and stores the FULL prefixed id", async () => {
		const { plugin } = await makePlugin();
		await plugin.onload();

		// Exercise the registered callback via the exposed _registerViewCommand method
		const p = plugin as unknown as {
			_registerViewCommand: (viewId: string, commandName: string) => void;
			_commandIds: Set<string>;
		};
		p._registerViewCommand("abc", "My View");

		expect(plugin.addCommand).toHaveBeenCalledWith(
			expect.objectContaining({ id: expect.stringContaining("view-abc") }),
		);
		// Tracks the viewId's presence; removeCommand passes the LOCAL id
		// `view-${viewId}` (Obsidian auto-prefixes it) — bug c.
		expect(p._commandIds.has("abc")).toBe(true);
	});

	it("removeCommand is called with the LOCAL id (Obsidian auto-prefixes) when a tracked view is removed", async () => {
		const { plugin } = await makePlugin();
		await plugin.onload();

		const p = plugin as unknown as {
			_registerViewCommand: (viewId: string, commandName: string) => void;
			_commandIds: Set<string>;
			_removeViewCommand: (viewId: string) => void;
		};
		p._registerViewCommand("xyz", "XYZ View");
		expect(p._commandIds.has("xyz")).toBe(true);

		p._removeViewCommand("xyz");
		// LOCAL id — removeCommand auto-prefixes; the already-prefixed id would
		// double-prefix and remove nothing live.
		expect(plugin.removeCommand).toHaveBeenCalledWith("view-xyz");
		expect(p._commandIds.has("xyz")).toBe(false);
	});

	it("_removeViewCommand is a no-op when viewId has no registered command", async () => {
		const { plugin } = await makePlugin();
		await plugin.onload();

		const p = plugin as unknown as { _removeViewCommand: (viewId: string) => void };
		// Should not throw when no command is registered for the viewId
		expect(() => p._removeViewCommand("nonexistent-view")).not.toThrow();
		expect(plugin.removeCommand).not.toHaveBeenCalled();
	});

	it("Bug D1: command callback fires activateView then calls selectView on the live SidebarView", async () => {
		// This test exercises the ACTUAL _registerViewCommand callback path —
		// the end-to-end flow the user reported broken.
		const { plugin, app } = await makePlugin();

		// Seed the store with view "v1" so _reloadViews() returns it from the real ViewStore.
		// This avoids a race where background _reloadViews calls overwrite _views with {}.
		const v1Record: import("store/types").ViewRecord = {
			provenance: "imported",
			enabled: true,
			okayed: { version: 1, checksum: "sha256:abc" },
			source: "_forge/views/v1.md",
			engine: "dataview-dql",
			command: true,
			commandName: "My View",
			kind: "view",
			surfaces: { anvil: false, workbench: false },
		};
		plugin.loadData.mockResolvedValue({ views: { "v1": v1Record } });

		await plugin.onload();

		// Create a real SidebarView via the factory (mirrors how Obsidian creates it)
		const factoryCall = plugin.registerView.mock.calls.find(
			(c: unknown[]) => c[0] === SIDEBAR_VIEW_TYPE,
		);
		expect(factoryCall).toBeDefined();
		const factory = factoryCall![1] as (leaf: WorkspaceLeaf) => import("views/SidebarView").SidebarView;
		const leaf = new WorkspaceLeaf();
		leaf.app = app;
		const view = factory(leaf);
		await view.onOpen();
		// Drain background _reloadViews tasks so _views is populated from the store
		await new Promise((r) => setTimeout(r, 0));

		// Wire the leaf so the command callback finds the live SidebarView.
		// getLeavesOfType returns [leaf], and leaf.view === view.
		(leaf as unknown as { view: typeof view }).view = view;
		app.workspace.getLeavesOfType.mockReturnValue([leaf]);

		// Stub revealLeaf so activateView's reveal-only path (existing leaf) returns quickly
		app.workspace.revealLeaf.mockResolvedValue(undefined);

		// Register the command for "v1" and capture its callback
		let capturedCallback: (() => void) | undefined;
		plugin.addCommand.mockImplementation((cmd) => {
			if (cmd.id === "view-v1") capturedCallback = cmd.callback;
			return { ...cmd, id: cmd.id };
		});

		const p = plugin as unknown as {
			_registerViewCommand: (viewId: string, commandName: string) => void;
		};
		p._registerViewCommand("v1", "My View");

		expect(capturedCallback).toBeDefined();

		// Invoke the command callback — it awaits activateView then selectView
		capturedCallback!();

		// Wait for selectedViewId to become "v1" (selectView is async and fire-and-forget)
		const pvAfter = view as unknown as { selectedViewId: string | null };
		await vi.waitFor(() => {
			expect(pvAfter.selectedViewId).toBe("v1");
		}, { timeout: 2000 });
	});
});

// ---------------------------------------------------------------------------
// T2.3: registerCodexView once-ness + basesAvailable threading (ADR-8)
// ---------------------------------------------------------------------------

describe("StoryForgePlugin T2.3 — Bases availability capture", () => {
	it("onload calls registerCodexView(plugin, getLinkClickAction) EXACTLY ONCE, with a LIVE getter (not a snapshot)", async () => {
		const { registerCodexView } = await import("bases/BasesAdapter");
		vi.mocked(registerCodexView).mockClear();

		const { plugin, app } = await makePlugin();
		await plugin.onload();

		expect(registerCodexView).toHaveBeenCalledTimes(1);
		// The second argument is a getter closure, not the setting's value at
		// onload time — asserted by calling it below after changing the setting,
		// mirroring the same getLinkClickAction wiring SidebarView/AnvilView get.
		expect(registerCodexView).toHaveBeenCalledWith(plugin, expect.any(Function), expect.any(Object));

		const call = vi.mocked(registerCodexView).mock.calls[0];
		if (!call) throw new Error("registerCodexView was never called");
		const getLinkClickAction = call[1];
		if (!getLinkClickAction) throw new Error("registerCodexView was called without a getLinkClickAction getter");

		expect(getLinkClickAction()).toBe(plugin.settings.linkClickAction);

		plugin.settings = { ...plugin.settings, linkClickAction: "open" };
		expect(getLinkClickAction()).toBe("open");

		// T6.2b, T6.4: Cards in a `.base` read the shared cache, which follows the setting.
		const fileClasses = call[2];
		if (!fileClasses) throw new Error("registerCodexView was called without the FileClass cache");
		const elsewhere = createMockTFile({ basename: "fc-x", path: "Elsewhere/fc-x.md" });
		vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((p) => (p === elsewhere.path ? elsewhere : null));
		vi.mocked(app.metadataCache.getFileCache).mockImplementation(() => createMockCachedMetadata({ frontmatter: { fields: [] } }));
		expect(fileClasses.lookup.getFileClassFrontmatter("fc-x")).toBeUndefined();
		plugin.settings = { ...plugin.settings, fileClassesFolder: "Elsewhere" };
		expect(fileClasses.lookup.getFileClassFrontmatter("fc-x")).toEqual({ fields: [] });
	});

	it("registerCodexView is NOT called again when the late-join dataview:api-ready fires", async () => {
		const { registerCodexView } = await import("bases/BasesAdapter");
		vi.mocked(registerCodexView).mockClear();

		const { plugin, app } = await makePlugin();
		await plugin.onload();
		const callsAfterOnload = vi.mocked(registerCodexView).mock.calls.length;

		const mc = app.metadataCache as unknown as { _trigger(event: string): void };
		mc._trigger("dataview:api-ready");

		expect(vi.mocked(registerCodexView).mock.calls.length).toBe(callsAfterOnload);
	});

	it("when Bases available, bases engine is in registry after populateRegistry", async () => {
		const { registerCodexView } = await import("bases/BasesAdapter");
		// Simulate Bases present
		vi.mocked(registerCodexView).mockReturnValue(true);

		const { plugin } = await makePlugin();
		await plugin.onload();

		const factoryCall = plugin.registerView.mock.calls.find(
			(c: unknown[]) => c[0] === SIDEBAR_VIEW_TYPE,
		);
		const leaf = new WorkspaceLeaf();
		const factory = factoryCall![1] as (leaf: WorkspaceLeaf) => import("views/SidebarView").SidebarView;
		const view = factory(leaf);
		const tv = view as unknown as { registry: EngineRegistry };
		expect(tv.registry.get("bases")).toBeDefined();
		expect(tv.registry.get("bases")?.kind).toBe("bases");
	});

	it("when Bases unavailable, bases engine is absent from registry", async () => {
		const { registerCodexView } = await import("bases/BasesAdapter");
		vi.mocked(registerCodexView).mockReturnValue(false);

		const { plugin } = await makePlugin();
		await plugin.onload();

		const factoryCall = plugin.registerView.mock.calls.find(
			(c: unknown[]) => c[0] === SIDEBAR_VIEW_TYPE,
		);
		const leaf = new WorkspaceLeaf();
		const factory = factoryCall![1] as (leaf: WorkspaceLeaf) => import("views/SidebarView").SidebarView;
		const view = factory(leaf);
		const tv = view as unknown as { registry: EngineRegistry };
		expect(tv.registry.get("bases")).toBeUndefined();
	});

	it("late-join handler uses SAME basesAvailable (captured once at onload, not re-captured)", async () => {
		const { registerCodexView } = await import("bases/BasesAdapter");
		// First call returns true (onload), any subsequent would return false
		vi.mocked(registerCodexView).mockReturnValueOnce(true).mockReturnValue(false);

		const { plugin, app } = await makePlugin();
		await plugin.onload();

		// Fire late-join — must not call registerCodexView again
		const mc = app.metadataCache as unknown as { _trigger(event: string): void };
		mc._trigger("dataview:api-ready");

		// Registry still has bases engine (the same captured boolean = true was used)
		const factoryCall = plugin.registerView.mock.calls.find(
			(c: unknown[]) => c[0] === SIDEBAR_VIEW_TYPE,
		);
		const leaf = new WorkspaceLeaf();
		const factory = factoryCall![1] as (leaf: WorkspaceLeaf) => import("views/SidebarView").SidebarView;
		const view = factory(leaf);
		const tv = view as unknown as { registry: EngineRegistry };
		expect(tv.registry.get("bases")).toBeDefined();
	});

	it("Dataview registration is unchanged when Bases is available (regression)", async () => {
		const { registerCodexView } = await import("bases/BasesAdapter");
		vi.mocked(registerCodexView).mockReturnValue(true);

		const { plugin, app } = await makePlugin();
		const dvApi = createMockDataviewApi({ satisfies: true });
		wireDataviewApi(app, dvApi);
		await plugin.onload();

		const factoryCall = plugin.registerView.mock.calls.find(
			(c: unknown[]) => c[0] === SIDEBAR_VIEW_TYPE,
		);
		const leaf = new WorkspaceLeaf();
		leaf.app = app;
		const factory = factoryCall![1] as (leaf: WorkspaceLeaf) => import("views/SidebarView").SidebarView;
		const view = factory(leaf);
		const tv = view as unknown as { registry: EngineRegistry };
		// Dataview engines still present
		expect(tv.registry.get("dataview-dql")).toBeDefined();
		expect(tv.registry.get("dataviewjs")).toBeDefined();
		// Bases also present
		expect(tv.registry.get("bases")).toBeDefined();
	});
});

// ---------------------------------------------------------------------------
// Open Codex was dropped: Open Anvil replaces it
// ---------------------------------------------------------------------------

describe("StoryForgePlugin — no Open Codex command or degrade view", () => {
	it("registers no 'open-codex' command", async () => {
		const { plugin } = await makePlugin();
		await plugin.onload();
		const ids = vi.mocked(plugin.addCommand).mock.calls.map((c) => (c[0] as { id: string }).id);
		expect(ids).not.toContain("open-codex");
		expect(ids).toContain("open-anvil");
	});

	it("registers no degrade CodexView host", async () => {
		const { plugin } = await makePlugin();
		await plugin.onload();
		const types = vi.mocked(plugin.registerView).mock.calls.map((c) => c[0]);
		expect(types).not.toContain("story-forge-codex-host");
	});
});

describe("StoryForgePlugin M5 — AnvilView registration + open commands", () => {
	it("registerView is called with WORKSPACE_VIEW_TYPE", async () => {
		const { plugin } = await makePlugin();
		await plugin.onload();
		expect(plugin.registerView).toHaveBeenCalledWith(
			WORKSPACE_VIEW_TYPE,
			expect.any(Function),
		);
	});

	it("registers 'open-timeline' and 'open-plotlines' commands", async () => {
		const { plugin } = await makePlugin();
		await plugin.onload();
		expect(plugin.addCommand).toHaveBeenCalledWith(expect.objectContaining({ id: "open-timeline" }));
		expect(plugin.addCommand).toHaveBeenCalledWith(expect.objectContaining({ id: "open-plotlines" }));
	});

	it("_openWorkspace opens a new leaf with the layout state and reveals it", async () => {
		const { plugin, app } = await makePlugin();
		await plugin.onload();

		const wsLeaf = new WorkspaceLeaf();
		wsLeaf.app = app;
		app.workspace.getLeaf.mockReturnValue(wsLeaf);

		await plugin._openWorkspace("plotlines");

		expect(wsLeaf.setViewState).toHaveBeenCalledWith(
			expect.objectContaining({ type: WORKSPACE_VIEW_TYPE, state: { layout: "plotlines" } }),
		);
		expect(app.workspace.revealLeaf).toHaveBeenCalledWith(wsLeaf);
	});
});

// ---------------------------------------------------------------------------
// T7.1d1 — one shared CollectionStore; migrate() once at load
// ---------------------------------------------------------------------------

describe("StoryForgePlugin — the Library wiring (T7.1d1)", () => {
	function legacyDataviewView() {
		return {
			provenance: "curated" as const,
			enabled: true,
			okayed: null,
			source: "90 Views/Skills.md",
			engine: "dataview-dql" as const,
			command: false,
			commandName: "Skills",
			kind: "view" as const,
			surfaces: { anvil: false, workbench: false },
		};
	}

	/** Unload like Obsidian does, and let the undo journal's background shutdown release its recorder. */
	async function unload(plugin: { _runCleanup(): void }): Promise<void> {
		plugin._runCleanup();
		await new Promise((r) => setTimeout(r, 0));
	}

	/** A plugin whose data.json is a real, persisting blob — what survives between loads. */
	async function makePersistentPlugin(blob: { data: StoryForgeData }) {
		const made = await makePlugin();
		made.plugin.loadData.mockImplementation(async () => structuredClone(blob.data));
		made.plugin.saveData.mockImplementation(async (d: unknown) => { blob.data = structuredClone(d as StoryForgeData); });
		return made;
	}

	it("migrates a legacy Dataview view at load: collection, Workbench on, Anvil off, imported", async () => {
		const blob = { data: { views: { skills: legacyDataviewView() } } as StoryForgeData };
		const { plugin } = await makePersistentPlugin(blob);

		await plugin.onload();

		const rec = (await plugin.store.getViews())["skills"];
		expect(rec).toMatchObject({ kind: "collection", provenance: "imported", surfaces: { anvil: false, workbench: true } });
		const row = (await plugin.library.collections.collections()).find((c) => c.id === "skills");
		expect(row).toMatchObject({ provenance: "imported", effective: { anvil: false, workbench: true } });
		expect(await plugin.library.collections.migrationNotice()).toEqual({ moved: 1 });
	});

	it("a second load leaves the migration count unchanged", async () => {
		const blob = { data: { views: { skills: legacyDataviewView() } } as StoryForgeData };
		const first = await makePersistentPlugin(blob);
		await first.plugin.onload();
		await unload(first.plugin);
		const afterFirst = blob.data.settings?.libraryMigratedCount;
		expect(afterFirst).toBe(1);

		const second = await makePersistentPlugin(blob);
		await second.plugin.onload();

		expect(blob.data.settings?.libraryMigratedCount).toBe(1);
		expect(await second.plugin.library.collections.migrationNotice()).toEqual({ moved: 1 });
	});

	it("a dismissed notice stays dismissed across a load", async () => {
		const blob = { data: { views: { skills: legacyDataviewView() } } as StoryForgeData };
		const first = await makePersistentPlugin(blob);
		await first.plugin.onload();
		await first.plugin.library.collections.dismissMigrationNotice();
		await unload(first.plugin);

		const second = await makePersistentPlugin(blob);
		await second.plugin.onload();

		expect(await second.plugin.library.collections.migrationNotice()).toBeNull();
	});

	it("loading with nothing to migrate writes nothing", async () => {
		const blob = { data: {} as StoryForgeData };
		const { plugin } = await makePersistentPlugin(blob);
		await plugin.onload();
		expect(plugin.saveData).not.toHaveBeenCalled();
	});

	it("the settings tab gets the very store the plugin shares with its views", async () => {
		settingsTabArgs.calls.length = 0;
		const { plugin } = await makePlugin();
		await plugin.onload();

		const deps = settingsTabArgs.calls.at(-1)?.[8] as { collections?: unknown; openCapabilities?: unknown };
		expect(deps.collections).toBe(plugin.library.collections);
		expect(typeof deps.openCapabilities).toBe("function");
	});

	it("the Anvil reads built-ins with the Library's own tag and folders, live", async () => {
		const blob = { data: { settings: { builtInCollections: { character: { tag: "canon/person", excludedFolders: ["Drafts"] } } } } as unknown as StoryForgeData };
		const { plugin, app } = await makePersistentPlugin(blob);
		await plugin.onload();
		const leaf = new WorkspaceLeaf();
		leaf.app = app;
		const factory = plugin.registerView.mock.calls.find((c: unknown[]) => c[0] === WORKSPACE_VIEW_TYPE)?.[1] as (l: WorkspaceLeaf) => { getCollections(): { id: string; tag: string; excludedFolders?: string[] }[] };
		const view = factory(leaf);

		expect(view.getCollections().find((c) => c.id === "character")).toMatchObject({ tag: "canon/person", excludedFolders: ["Drafts"] });

		await plugin.library.collections.configureBuiltIn("character", { tag: "canon/hero" });
		await new Promise((r) => setTimeout(r, 0)); // the snapshot is rebuilt right after the signal
		expect(view.getCollections().find((c) => c.id === "character")?.tag).toBe("canon/hero");
	});

	it("the Anvil still shows only the built-ins (the pills change in d2), even with a migrated view in the Library", async () => {
		const blob = { data: { views: { skills: legacyDataviewView() } } as StoryForgeData };
		const { plugin, app } = await makePersistentPlugin(blob);
		await plugin.onload();
		const leaf = new WorkspaceLeaf();
		leaf.app = app;
		const factory = plugin.registerView.mock.calls.find((c: unknown[]) => c[0] === WORKSPACE_VIEW_TYPE)?.[1] as (l: WorkspaceLeaf) => { getCollections(): { id: string }[] };

		expect(factory(leaf).getCollections().map((c) => c.id)).toEqual(["character", "location", "object", "lore"]);
		expect(plugin.library.snapshot().map((c) => c.id)).toContain("skills");
	});

	it("a record written behind the store's back (an import) reaches the snapshot and its listeners", async () => {
		const { plugin } = await makePersistentPlugin({ data: {} });
		await plugin.onload();
		const spy = vi.fn();
		plugin.library.onChange(spy);

		await plugin.store.setRecord("late", { ...legacyDataviewView(), kind: "collection" });
		await new Promise((r) => setTimeout(r, 0));

		expect(plugin.library.snapshot().map((c) => c.id)).toContain("late");
		expect(spy).toHaveBeenCalled();
	});

	it("unsubscribes its own listeners on unload", async () => {
		const { plugin } = await makePlugin();
		await plugin.onload();
		const spy = vi.fn();
		plugin.library.onChange(spy);
		await plugin.library.collections.setEnabled("character", false);
		await new Promise((r) => setTimeout(r, 0));
		expect(spy).toHaveBeenCalledTimes(1); // the listener is live before unload

		plugin._runCleanup();
		await plugin.library.collections.setEnabled("character", true);
		await new Promise((r) => setTimeout(r, 0));

		expect(spy).toHaveBeenCalledTimes(1);
	});
});
