/**
 * main.capabilities.test.ts — T7.4 (spec 008, PRD F8, ADR-36; mockups-capabilities.html S1)
 *
 * The production wiring of the capability screen, through the plugin's own `registerView`
 * factories and a fake `data.json` port:
 * - the first time the Anvil or the Workbench opens after layout is ready, the screen opens once;
 * - any close dismisses it for good (`dismissedHints`, persisted), so a reload never shows it;
 * - not at plugin load (layout still being restored);
 * - the Library link ("What Story Forge can use…") opens the same screen with only Close, and
 *   closing that one records nothing.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { App, WorkspaceLeaf } from "obsidian";
import { SIDEBAR_VIEW_TYPE, WORKSPACE_VIEW_TYPE } from "pluginConstants";
import type { StoryForgeData } from "store/types";
import { CAPABILITIES_HINT_ID } from "library/capabilitiesTrigger";

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

type Plugin = InstanceType<typeof import("main").default>;

async function makePlugin(blob: { data: StoryForgeData }): Promise<{ plugin: Plugin; app: App }> {
	const { default: StoryForgePlugin } = await import("main");
	const app = new App();
	app.workspace.getActiveFile = vi.fn(() => null);
	const plugin = new StoryForgePlugin(app) as Plugin;
	plugin.loadData.mockImplementation(async () => structuredClone(blob.data));
	plugin.saveData.mockImplementation(async (d: unknown) => { blob.data = structuredClone(d as StoryForgeData); });
	return { plugin, app };
}

/** Build a view through the plugin's own factory for `type` and open it. */
async function openView(plugin: Plugin, app: App, type: string): Promise<void> {
	const call = plugin.registerView.mock.calls.find((c: unknown[]) => c[0] === type);
	if (!call) throw new Error(`${type} was never registered`);
	const leaf = new WorkspaceLeaf();
	leaf.app = app;
	const view = (call[1] as (l: WorkspaceLeaf) => { onOpen(): Promise<void> })(leaf);
	(leaf as unknown as { view: unknown }).view = view;
	await view.onOpen();
}

/** Unload a plugin the way Obsidian does (its register* cleanups run), before loading another. */
async function unload(plugin: Plugin): Promise<void> {
	plugin._runCleanup();
	await new Promise((r) => setTimeout(r, 0));
}

function screen(): HTMLElement | null {
	return Array.from(document.body.querySelectorAll<HTMLElement>(".sf-cap-modal"))
		.find((m) => m.isConnected) ?? null;
}

function footButton(label: string): HTMLButtonElement {
	const b = Array.from(screen()?.querySelectorAll<HTMLButtonElement>(".sf-picker-foot button") ?? [])
		.find((x) => x.textContent === label);
	if (!b) throw new Error(`no ${label}`);
	return b;
}

afterEach(() => {
	document.body.innerHTML = "";
});

describe("main.ts — the capability screen's first run (S1)", () => {
	it.each([
		["the Anvil", WORKSPACE_VIEW_TYPE],
		["the Workbench", SIDEBAR_VIEW_TYPE],
	])("opens the first time %s opens, and 'Got it' dismisses it for good", async (_name, type) => {
		const blob = { data: {} as StoryForgeData };
		const first = await makePlugin(blob);
		await first.plugin.onload();
		expect(screen()).toBeNull(); // not at plugin load

		await openView(first.plugin, first.app, type);
		expect(screen()?.querySelector(".modal-title")?.textContent).toBe("What Story Forge can use");
		footButton("Got it").click();
		expect(screen()).toBeNull();
		await vi.waitFor(() => expect(blob.data.settings?.dismissedHints).toContain(CAPABILITIES_HINT_ID));

		// Never again: neither view, nor after a reload.
		await openView(first.plugin, first.app, WORKSPACE_VIEW_TYPE);
		await openView(first.plugin, first.app, SIDEBAR_VIEW_TYPE);
		expect(screen()).toBeNull();
		await unload(first.plugin);
		const second = await makePlugin(blob);
		await second.plugin.onload();
		await openView(second.plugin, second.app, WORKSPACE_VIEW_TYPE);
		expect(screen()).toBeNull();
		await unload(second.plugin);
	});

	// Live-test bug (T7.4): Obsidian restores the Anvil and the Workbench before layoutReady, so
	// their onOpen is skipped by design, and clicking a restored tab never runs onOpen again. A view
	// restored at startup counts as opened: the screen opens once when the layout is ready.
	it("opens exactly once at layout ready when an Anvil and a Workbench were restored before it", async () => {
		const blob = { data: {} as StoryForgeData };
		const { plugin, app } = await makePlugin(blob);
		app.workspace.layoutReady = false;
		app.workspace._deferLayoutReady = true;
		await plugin.onload();
		await openView(plugin, app, WORKSPACE_VIEW_TYPE);
		await openView(plugin, app, SIDEBAR_VIEW_TYPE);
		expect(screen()).toBeNull();

		vi.mocked(app.workspace.getLeavesOfType).mockImplementation((type: string) =>
			type === WORKSPACE_VIEW_TYPE || type === SIDEBAR_VIEW_TYPE ? [new WorkspaceLeaf()] : []);
		app.workspace.layoutReady = true;
		app.workspace._flushLayoutReady();

		expect(document.body.querySelectorAll(".sf-cap-modal")).toHaveLength(1);
		// Once per session: opening a view afterwards does not open a second one.
		await openView(plugin, app, WORKSPACE_VIEW_TYPE);
		expect(document.body.querySelectorAll(".sf-cap-modal")).toHaveLength(1);
		footButton("Got it").click();
		await vi.waitFor(() => expect(blob.data.settings?.dismissedHints).toContain(CAPABILITIES_HINT_ID));
		await unload(plugin);
	});

	// Live-test bug 2 (T7.4): jsdom flipped layoutReady before running the layout-ready callbacks;
	// Obsidian need not. Inside its own onLayoutReady callback the plugin must not re-ask the flag:
	// being called there IS the evidence that the layout is ready.
	it("opens from the layout-ready callback even while workspace.layoutReady still reads false there", async () => {
		const { plugin, app } = await makePlugin({ data: {} as StoryForgeData });
		app.workspace.layoutReady = false;
		app.workspace._deferLayoutReady = true;
		await plugin.onload();
		await openView(plugin, app, WORKSPACE_VIEW_TYPE);
		vi.mocked(app.workspace.getLeavesOfType).mockImplementation((type: string) =>
			type === WORKSPACE_VIEW_TYPE ? [new WorkspaceLeaf()] : []);
		app.workspace._flushLayoutReady(); // layoutReady deliberately left false
		expect(document.body.querySelectorAll(".sf-cap-modal")).toHaveLength(1);
		await unload(plugin);
	});

	it.each([
		["the Anvil only", [WORKSPACE_VIEW_TYPE]],
		["the Workbench only", [SIDEBAR_VIEW_TYPE]],
	])("one restored view is enough: %s", async (_label, types) => {
		const { plugin, app } = await makePlugin({ data: {} as StoryForgeData });
		app.workspace.layoutReady = false;
		app.workspace._deferLayoutReady = true;
		await plugin.onload();
		vi.mocked(app.workspace.getLeavesOfType).mockImplementation((type: string) =>
			(types as string[]).includes(type) ? [new WorkspaceLeaf()] : []);
		app.workspace.layoutReady = true;
		app.workspace._flushLayoutReady();
		expect(screen()).not.toBeNull();
		await unload(plugin);
	});

	it("a vault with no Anvil or Workbench leaf at layout ready does not open it", async () => {
		const { plugin, app } = await makePlugin({ data: {} as StoryForgeData });
		app.workspace.layoutReady = false;
		app.workspace._deferLayoutReady = true;
		await plugin.onload();
		vi.mocked(app.workspace.getLeavesOfType).mockReturnValue([]);
		app.workspace.layoutReady = true;
		app.workspace._flushLayoutReady();
		expect(screen()).toBeNull();
		await unload(plugin);
	});

	it("a restored view does not reopen it once dismissed", async () => {
		const { plugin, app } = await makePlugin({ data: { settings: { dismissedHints: [CAPABILITIES_HINT_ID] } } as unknown as StoryForgeData });
		app.workspace.layoutReady = false;
		app.workspace._deferLayoutReady = true;
		await plugin.onload();
		vi.mocked(app.workspace.getLeavesOfType).mockReturnValue([new WorkspaceLeaf()]);
		app.workspace.layoutReady = true;
		app.workspace._flushLayoutReady();
		expect(screen()).toBeNull();
		await unload(plugin);
	});

	it("does not open for a view restored while the layout is still loading", async () => {
		const { plugin, app } = await makePlugin({ data: {} as StoryForgeData });
		await plugin.onload();
		app.workspace.layoutReady = false;
		await openView(plugin, app, WORKSPACE_VIEW_TYPE);
		expect(screen()).toBeNull();
		await unload(plugin);
	});

	it("reads live facts: Bases off and Dataview not active in a vault with neither", async () => {
		const { plugin, app } = await makePlugin({ data: {} as StoryForgeData });
		await plugin.onload();
		await openView(plugin, app, WORKSPACE_VIEW_TYPE);
		const status = (n: string): string | null | undefined => Array.from(screen()!.querySelectorAll(".sf-cap-row"))
			.find((r) => r.querySelector(".sf-cap-name")?.textContent === n)?.querySelector(".sf-cap-status")?.textContent;
		expect(status("Bases")).toBe("Off");
		expect(status("Dataview")).toBe("Not active");
		expect(status("metadata-menu")).toBe("No FileClasses in 00 Meta/FileClasses");
		await unload(plugin);
	});
});

describe("main.ts — the Library link (S1, P14)", () => {
	it("opens the same screen with only Close, and closing it records nothing", async () => {
		settingsTabArgs.calls.length = 0;
		const blob = { data: {} as StoryForgeData };
		const { plugin } = await makePlugin(blob);
		await plugin.onload();
		// The LibraryDeps argument, found by its shape rather than its position.
		const deps = settingsTabArgs.calls.at(-1)?.find(
			(arg): arg is { openCapabilities: () => void } =>
				typeof arg === "object" && arg !== null && "openCapabilities" in arg,
		);
		if (!deps) throw new Error("no LibraryDeps argument with openCapabilities");
		deps.openCapabilities();
		expect(screen()?.querySelector(".modal-title")?.textContent).toBe("What Story Forge can use");
		expect(Array.from(screen()!.querySelectorAll(".sf-picker-foot button")).map((b) => b.textContent)).toEqual(["Close"]);
		footButton("Close").click();
		expect(screen()).toBeNull();
		expect(plugin.settings.dismissedHints).not.toContain(CAPABILITIES_HINT_ID);
		await unload(plugin);
	});
});

// Why it did not open, in the user's console (live-test bug 2): one debug line per early return.
describe("main.ts — the capability screen says why it stayed closed (console.debug)", () => {
	async function deferredLoad(data: StoryForgeData) {
		const made = await makePlugin({ data });
		made.app.workspace.layoutReady = false;
		made.app.workspace._deferLayoutReady = true;
		await made.plugin.onload();
		return made;
	}

	function debugLines(spy: ReturnType<typeof vi.spyOn>): string[] {
		return spy.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith("[StoryForge] capability screen"));
	}

	it("a view opening before the layout is ready", async () => {
		const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
		const { plugin, app } = await deferredLoad({} as StoryForgeData);
		await openView(plugin, app, WORKSPACE_VIEW_TYPE);
		expect(debugLines(debug)).toContain("[StoryForge] capability screen: not yet — the layout is still loading; checked again when it is ready");
		debug.mockRestore();
		await unload(plugin);
	});

	it("no Anvil or Workbench leaf at layout ready", async () => {
		const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
		const { plugin, app } = await deferredLoad({} as StoryForgeData);
		vi.mocked(app.workspace.getLeavesOfType).mockReturnValue([]);
		app.workspace._flushLayoutReady();
		expect(debugLines(debug)).toContain("[StoryForge] capability screen: not yet — no Anvil or Workbench is open; it opens with the first one");
		debug.mockRestore();
		await unload(plugin);
	});

	it("already dismissed", async () => {
		const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
		const { plugin, app } = await deferredLoad({ settings: { dismissedHints: [CAPABILITIES_HINT_ID] } } as unknown as StoryForgeData);
		vi.mocked(app.workspace.getLeavesOfType).mockReturnValue([new WorkspaceLeaf()]);
		app.workspace._flushLayoutReady();
		expect(debugLines(debug)).toContain("[StoryForge] capability screen: not shown — dismissed before (dismissedHints has \"capabilities\")");
		debug.mockRestore();
		await unload(plugin);
	});

	it("already shown this session, and the opening itself", async () => {
		const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
		const { plugin, app } = await deferredLoad({} as StoryForgeData);
		vi.mocked(app.workspace.getLeavesOfType).mockReturnValue([new WorkspaceLeaf()]);
		app.workspace._flushLayoutReady();
		app.workspace.layoutReady = true;
		await openView(plugin, app, SIDEBAR_VIEW_TYPE);
		expect(debugLines(debug)).toEqual([
			"[StoryForge] capability screen: opening (first run)",
			"[StoryForge] capability screen: not shown — already shown this session",
		]);
		debug.mockRestore();
		await unload(plugin);
	});

	it("a failure while opening is logged, never swallowed", async () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const { plugin, app } = await deferredLoad({} as StoryForgeData);
		vi.mocked(app.workspace.getLeavesOfType).mockReturnValue([new WorkspaceLeaf()]);
		vi.mocked(app.vault.getMarkdownFiles).mockImplementation(() => { throw new Error("cache not ready"); });
		app.workspace._flushLayoutReady();
		expect(error).toHaveBeenCalledWith("[StoryForge] capability screen: could not open", expect.any(Error));
		error.mockRestore();
		await unload(plugin);
	});
});

