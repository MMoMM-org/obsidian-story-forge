/**
 * main.anvil.test.ts — spec 008 T2.3: one command in, legacy commands redirected.
 *
 * `Open Anvil` (id "open-anvil") is the new single entry point (PRD F1): it opens the
 * Anvil with the Codex tab selected, and running it twice reveals the existing leaf
 * rather than creating a second one.
 *
 * The four legacy ids (`open-timeline`, `open-plotlines`, `open-kanban`, `open-plotgrid`)
 * MUST stay registered — a user may have bound a hotkey to one of them (SDD Risks —
 * hotkeys) — and each still opens the Anvil with its own tab selected.
 *
 * @ref docs/XDD/specs/008-codex-surface/requirements.md — Feature F1
 * @ref docs/XDD/specs/008-codex-surface/solution.md — Acceptance Criteria, PRD F1; Risks (hotkeys)
 */

import { describe, it, expect, vi } from "vitest";
import { App, WorkspaceLeaf } from "obsidian";
import { WORKSPACE_VIEW_TYPE } from "pluginConstants";
import { AnvilView } from "anvil/AnvilView";

async function makePlugin(): Promise<{
	plugin: InstanceType<typeof import("main").default>;
	app: App;
}> {
	const { default: StoryForgePlugin } = await import("main");
	const app = new App();
	const plugin = new StoryForgePlugin(app) as InstanceType<typeof StoryForgePlugin>;
	return { plugin, app };
}

/** Locate the AnvilView factory registered via registerView(WORKSPACE_VIEW_TYPE, ...). */
function getAnvilFactory(
	plugin: InstanceType<typeof import("main").default>,
): (leaf: WorkspaceLeaf) => AnvilView {
	const call = plugin.registerView.mock.calls.find((c: unknown[]) => c[0] === WORKSPACE_VIEW_TYPE);
	if (!call) throw new Error("WORKSPACE_VIEW_TYPE was never registered");
	return call[1] as (leaf: WorkspaceLeaf) => AnvilView;
}

/** Wire a real AnvilView (created via the plugin's own factory) onto a mock leaf. */
function wireAnvilView(
	plugin: InstanceType<typeof import("main").default>,
	leaf: WorkspaceLeaf,
): AnvilView {
	const view = getAnvilFactory(plugin)(leaf);
	(leaf as unknown as { view: AnvilView }).view = view;
	return view;
}

describe("StoryForgePlugin — 'open-anvil' command (T2.3)", () => {
	it("registers the 'open-anvil' command", async () => {
		const { plugin } = await makePlugin();
		await plugin.onload();
		expect(plugin.addCommand).toHaveBeenCalledWith(expect.objectContaining({ id: "open-anvil" }));
	});

	it("opens a new leaf with the Codex tab selected when no Anvil is open", async () => {
		const { plugin, app } = await makePlugin();
		await plugin.onload();

		app.workspace.getLeavesOfType.mockReturnValue([]);
		const wsLeaf = new WorkspaceLeaf();
		wsLeaf.app = app;
		app.workspace.getLeaf.mockReturnValue(wsLeaf);
		const view = wireAnvilView(plugin, wsLeaf);
		const setLayoutSpy = vi.spyOn(view, "setLayout");

		const cmd = plugin._commands.get("story-forge:open-anvil");
		expect(cmd?.callback).toBeDefined();
		cmd!.callback!();
		await Promise.resolve();
		await Promise.resolve();

		expect(wsLeaf.setViewState).toHaveBeenCalledWith(
			expect.objectContaining({ type: WORKSPACE_VIEW_TYPE, state: { layout: "codex" } }),
		);
		expect(setLayoutSpy).toHaveBeenCalledWith("codex");
		expect(app.workspace.revealLeaf).toHaveBeenCalledWith(wsLeaf);
	});

	it("reveals the existing leaf instead of creating a second when 'Open Anvil' runs twice", async () => {
		const { plugin, app } = await makePlugin();
		await plugin.onload();

		const existingLeaf = new WorkspaceLeaf();
		existingLeaf.app = app;
		const view = wireAnvilView(plugin, existingLeaf);
		const setLayoutSpy = vi.spyOn(view, "setLayout");
		app.workspace.getLeavesOfType.mockReturnValue([existingLeaf]);

		const cmd = plugin._commands.get("story-forge:open-anvil");
		cmd!.callback!();
		await Promise.resolve();
		await Promise.resolve();

		// No second leaf created: getLeaf(true) is not the discovery path taken.
		expect(app.workspace.getLeaf).not.toHaveBeenCalled();
		expect(existingLeaf.setViewState).not.toHaveBeenCalled();
		expect(app.workspace.revealLeaf).toHaveBeenCalledWith(existingLeaf);
		expect(setLayoutSpy).toHaveBeenCalledWith("codex");
	});

	it("reveals an existing leaf whose view is not yet a live AnvilView without switching tabs or throwing", async () => {
		const { plugin, app } = await makePlugin();
		await plugin.onload();

		// Simulate a leaf mid-restore during workspace deserialization: it is of the
		// right view type (WORKSPACE_VIEW_TYPE) but `.view` is still the mock's default
		// placeholder object, not a live AnvilView instance yet.
		const existingLeaf = new WorkspaceLeaf();
		existingLeaf.app = app;
		app.workspace.getLeavesOfType.mockReturnValue([existingLeaf]);
		const setLayoutSpy = vi.spyOn(AnvilView.prototype, "setLayout");

		// Await _openWorkspace directly so a thrown/rejected call surfaces here rather
		// than as an unhandled rejection behind the command's `void` wrapping.
		await expect(plugin._openWorkspace("codex")).resolves.toBeUndefined();

		// The leaf is still surfaced (reveal-but-don't-retarget)...
		expect(app.workspace.revealLeaf).toHaveBeenCalledWith(existingLeaf);
		// ...but no tab switch is attempted against a view that isn't live yet, and no
		// second leaf is created either.
		expect(setLayoutSpy).not.toHaveBeenCalled();
		expect(app.workspace.getLeaf).not.toHaveBeenCalled();
	});
});

describe("StoryForgePlugin — legacy open-* commands stay registered as redirects (T2.3)", () => {
	it.each([
		["open-timeline", "timeline"],
		["open-plotlines", "plotlines"],
		["open-kanban", "kanban"],
		["open-plotgrid", "plotgrid"],
	])("%s still exists and opens the Anvil with the %s tab selected", async (id, layout) => {
		const { plugin, app } = await makePlugin();
		await plugin.onload();

		// Guard: the legacy id must still be a registered command (regression that would
		// silently break a user's hotkey binding).
		expect(plugin.addCommand).toHaveBeenCalledWith(expect.objectContaining({ id }));

		app.workspace.getLeavesOfType.mockReturnValue([]);
		const wsLeaf = new WorkspaceLeaf();
		wsLeaf.app = app;
		app.workspace.getLeaf.mockReturnValue(wsLeaf);
		const view = wireAnvilView(plugin, wsLeaf);
		const setLayoutSpy = vi.spyOn(view, "setLayout");

		const cmd = plugin._commands.get(`story-forge:${id}`);
		expect(cmd?.callback).toBeDefined();
		cmd!.callback!();
		await Promise.resolve();
		await Promise.resolve();

		expect(wsLeaf.setViewState).toHaveBeenCalledWith(
			expect.objectContaining({ type: WORKSPACE_VIEW_TYPE, state: { layout } }),
		);
		expect(setLayoutSpy).toHaveBeenCalledWith(layout);
		expect(app.workspace.revealLeaf).toHaveBeenCalledWith(wsLeaf);
	});

	it("all four legacy command ids are registered after onload (hotkeys survive)", async () => {
		const { plugin } = await makePlugin();
		await plugin.onload();

		const registeredIds = plugin.addCommand.mock.calls.map((c) => (c[0] as { id: string }).id);
		expect(registeredIds).toEqual(
			expect.arrayContaining(["open-timeline", "open-plotlines", "open-kanban", "open-plotgrid"]),
		);
	});
});
