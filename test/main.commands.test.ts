/**
 * main.commands.test.ts — command-palette lifecycle tests (F1).
 *
 * Regression coverage for the command-id lifecycle bug (bug c / uncheck-doesn't-remove):
 *   - Obsidian internally prefixes command ids with `${manifest.id}:`.
 *   - BOTH addCommand AND removeCommand auto-prefix, so removeCommand needs the
 *     LOCAL id (`view-<id>`) — passing the already-prefixed id double-prefixes
 *     and silently removes nothing (confirmed live against app.commands.commands).
 *   - Commands must be rebuilt on load (Obsidian drops dynamic commands on reload).
 *   - The palette name is the PLAIN view name (Obsidian adds "Story Forge: ").
 *
 * These tests instantiate StoryForgePlugin with the mock App and drive the
 * command methods directly. The mock's addCommand/removeCommand model the real
 * auto-prefixing on BOTH sides, so a double-prefix regression fails end-to-end
 * (the command stays in the registry).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { App, Notice } from "obsidian";
import type { ViewRecord } from "store/types";

const FULL_PREFIX = "story-forge:";

async function makePlugin(): Promise<{
	plugin: InstanceType<typeof import("main").default>;
	app: App;
}> {
	const { default: StoryForgePlugin } = await import("main");
	const app = new App();
	const plugin = new StoryForgePlugin(app) as InstanceType<typeof StoryForgePlugin>;
	return { plugin, app };
}

function record(overrides?: Partial<ViewRecord>): ViewRecord {
	return {
		provenance: "imported",
		enabled: true,
		okayed: null,
		source: "_forge/views/example.md",
		engine: "dataview-dql",
		command: false,
		...overrides,
	};
}

type CommandPlugin = InstanceType<typeof import("main").default> & {
	_registerViewCommand: (viewId: string, name: string) => void;
	_removeViewCommand: (viewId: string) => void;
	_restoreViewCommands: () => Promise<void>;
	_commandIds: Set<string>;
	/** Mock Plugin's internal command registry, keyed by the FULL prefixed id. */
	_commands: Map<string, { id: string; name: string }>;
};

beforeEach(() => {
	Notice._reset();
});

describe("StoryForgePlugin — _registerViewCommand", () => {
	it("registers with the PLAIN name (no 'Story Forge:' prefix) and stable id", async () => {
		const { plugin } = await makePlugin();
		await plugin.onload();
		const p = plugin as CommandPlugin;

		p._registerViewCommand("v1", "My View");

		expect(plugin.addCommand).toHaveBeenCalledWith(
			expect.objectContaining({ id: "view-v1", name: "My View" }),
		);
	});

	it("tracks the viewId's presence in _commandIds (removeCommand reconstructs the full id)", async () => {
		const { plugin } = await makePlugin();
		await plugin.onload();
		const p = plugin as CommandPlugin;

		p._registerViewCommand("v1", "My View");

		expect(p._commandIds.has("v1")).toBe(true);
	});
});

describe("StoryForgePlugin — _removeViewCommand (bug-c regression)", () => {
	it("removes via the LOCAL id view-v1 and the command actually leaves the registry", async () => {
		const { plugin } = await makePlugin();
		await plugin.onload();
		const p = plugin as CommandPlugin;

		p._registerViewCommand("v1", "My View");
		// addCommand stored it under the FULL prefixed id.
		expect(p._commands.has("story-forge:view-v1")).toBe(true);

		p._removeViewCommand("v1");

		// removeCommand auto-prefixes, so the LOCAL id is correct. Passing the
		// already-prefixed id would double-prefix and leave the command dangling.
		expect(plugin.removeCommand).toHaveBeenCalledWith("view-v1");
		// End-to-end: the command is genuinely gone from the registry. This is the
		// assertion the double-prefix bug fails (the full id would remove nothing).
		expect(p._commands.has("story-forge:view-v1")).toBe(false);
		expect(p._commandIds.has("v1")).toBe(false);
	});

	it("is a no-op when the viewId has no registered command", async () => {
		const { plugin } = await makePlugin();
		await plugin.onload();
		const p = plugin as CommandPlugin;

		p._removeViewCommand("unknown");

		expect(plugin.removeCommand).not.toHaveBeenCalled();
	});
});

describe("StoryForgePlugin — _restoreViewCommands", () => {
	it("registers ONLY records with command:true", async () => {
		const { plugin } = await makePlugin();
		plugin.loadData.mockResolvedValue({
			views: {
				on: record({ command: true, commandName: "On View" }),
				off: record({ command: false, commandName: "Off View" }),
			},
		});
		await plugin.onload();
		const p = plugin as CommandPlugin;

		// onload fires _restoreViewCommands fire-and-forget; wait for it to have
		// registered the on-view command before clearing, so the drain does not
		// silently depend on the exact async-chain depth of the store load.
		await vi.waitFor(() =>
			expect(plugin.addCommand).toHaveBeenCalledWith(
				expect.objectContaining({ id: "view-on" }),
			),
		);
		vi.mocked(plugin.addCommand).mockClear();
		await p._restoreViewCommands();

		expect(plugin.addCommand).toHaveBeenCalledTimes(1);
		expect(plugin.addCommand).toHaveBeenCalledWith(
			expect.objectContaining({ id: "view-on", name: "On View" }),
		);
	});

	it("registers using commandLabel when present (prefers it over commandName and basename)", async () => {
		const { plugin } = await makePlugin();
		plugin.loadData.mockResolvedValue({
			views: {
				custom: record({
					command: true,
					commandName: "Tab",
					commandLabel: "Custom Cmd",
					source: "_forge/views/Ignored.md",
				}),
			},
		});
		await plugin.onload();
		const p = plugin as CommandPlugin;

		await vi.waitFor(() =>
			expect(plugin.addCommand).toHaveBeenCalledWith(
				expect.objectContaining({ id: "view-custom" }),
			),
		);
		vi.mocked(plugin.addCommand).mockClear();
		await p._restoreViewCommands();

		expect(plugin.addCommand).toHaveBeenCalledWith(
			expect.objectContaining({ id: "view-custom", name: "Custom Cmd" }),
		);
	});

	it("falls back to commandName when commandLabel is absent", async () => {
		const { plugin } = await makePlugin();
		plugin.loadData.mockResolvedValue({
			views: {
				tabonly: record({
					command: true,
					commandName: "Tab Only",
					source: "_forge/views/Ignored.md",
				}),
			},
		});
		await plugin.onload();
		const p = plugin as CommandPlugin;

		await vi.waitFor(() =>
			expect(plugin.addCommand).toHaveBeenCalledWith(
				expect.objectContaining({ id: "view-tabonly" }),
			),
		);
		vi.mocked(plugin.addCommand).mockClear();
		await p._restoreViewCommands();

		expect(plugin.addCommand).toHaveBeenCalledWith(
			expect.objectContaining({ id: "view-tabonly", name: "Tab Only" }),
		);
	});

	it("falls back to the source basename (no .md) when commandName is absent", async () => {
		const { plugin } = await makePlugin();
		plugin.loadData.mockResolvedValue({
			views: {
				nameless: record({
					command: true,
					source: "_forge/views/Cast List.md",
					commandName: undefined,
				}),
			},
		});
		await plugin.onload();
		const p = plugin as CommandPlugin;

		// Wait for the onload-triggered _restoreViewCommands to register the
		// view command before clearing, rather than depending on a fixed
		// microtask-tick count.
		await vi.waitFor(() =>
			expect(plugin.addCommand).toHaveBeenCalledWith(
				expect.objectContaining({ id: "view-nameless" }),
			),
		);
		vi.mocked(plugin.addCommand).mockClear();
		await p._restoreViewCommands();

		expect(plugin.addCommand).toHaveBeenCalledWith(
			expect.objectContaining({ id: "view-nameless", name: "Cast List" }),
		);
	});
});

describe("StoryForgePlugin — stale-command fail-safe", () => {
	it("shows a Notice and does not activate the view when the view no longer exists", async () => {
		const { plugin } = await makePlugin();
		// Store has NO views.
		plugin.loadData.mockResolvedValue({ views: {} });
		await plugin.onload();
		const p = plugin as CommandPlugin;

		// Capture the callback addCommand receives for the view command.
		let captured: (() => void) | undefined;
		vi.mocked(plugin.addCommand).mockImplementation((cmd) => {
			if (cmd.id === "view-gone") captured = cmd.callback;
			return { ...cmd, id: `${FULL_PREFIX}${cmd.id}` };
		});

		p._registerViewCommand("gone", "Gone View");
		expect(captured).toBeDefined();

		// Invoke the palette command for a view that no longer exists.
		captured!();
		await vi.waitFor(() => {
			expect(Notice._instances.length).toBe(1);
		});

		// selectView is never reached because there is no leaf activation path taken.
		expect(plugin.app.workspace.getLeavesOfType).not.toHaveBeenCalled();
	});
});
