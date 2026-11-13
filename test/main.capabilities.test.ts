/**
 * main.capabilities.test.ts — T7.4 (spec 008, PRD F8, ADR-36; mockups-capabilities.html S1)
 *
 * The production wiring of the capability screen, through the plugin's own `registerView`
 * factories and a fake `data.json` port:
 * - the first time the Anvil or the Workbench opens after layout is ready, the screen opens once;
 * - any close dismisses it for good (`dismissedHints`, persisted), so a reload never shows it;
 * - not at plugin load (layout still being restored);
 * - the Library link ("What optional plugins add…") opens the same screen with only Close, and
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
		expect(screen()?.querySelector("h2")?.textContent).toBe("What optional plugins add");
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
		expect(screen()?.querySelector("h2")?.textContent).toBe("What optional plugins add");
		expect(Array.from(screen()!.querySelectorAll(".sf-picker-foot button")).map((b) => b.textContent)).toEqual(["Close"]);
		footButton("Close").click();
		expect(screen()).toBeNull();
		expect(plugin.settings.dismissedHints).not.toContain(CAPABILITIES_HINT_ID);
		await unload(plugin);
	});
});
