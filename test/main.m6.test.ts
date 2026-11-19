/**
 * main.m6.test.ts — M6 / T6.2.
 *
 * The two new palette commands (Open Kanban / Open Plotgrid) open the main-area
 * AnvilView at the corresponding layout, mirroring the M5 open-timeline /
 * open-plotlines pattern. No duplicate view types are registered.
 *
 * Open Locations removed from M6 (→ Codex, tracked in GH #6).
 *
 * @ref docs/XDD/specs/007-interactive-views/plan/phase-6.md — T6.2
 */

import { describe, it, expect } from "vitest";
import { App, WorkspaceLeaf } from "obsidian";
import { WORKSPACE_VIEW_TYPE } from "pluginConstants";

async function makePlugin(): Promise<{
	plugin: InstanceType<typeof import("main").default>;
	app: App;
}> {
	const { default: StoryForgePlugin } = await import("main");
	const app = new App();
	const plugin = new StoryForgePlugin(app) as InstanceType<typeof StoryForgePlugin>;
	return { plugin, app };
}

describe("StoryForgePlugin M6 — Open Kanban/Plotgrid commands", () => {
	it("registers open-kanban and open-plotgrid commands", async () => {
		const { plugin } = await makePlugin();
		await plugin.onload();
		expect(plugin.addCommand).toHaveBeenCalledWith(expect.objectContaining({ id: "open-kanban" }));
		expect(plugin.addCommand).toHaveBeenCalledWith(expect.objectContaining({ id: "open-plotgrid" }));
	});

	it("names the Kanban command after the tab it opens, keeping the id", async () => {
		const { plugin } = await makePlugin();
		await plugin.onload();
		expect(plugin.addCommand).toHaveBeenCalledWith(expect.objectContaining({ id: "open-kanban", name: "Open board" }));
	});

	it("registers the workspace view type exactly once (no duplicate view types)", async () => {
		const { plugin } = await makePlugin();
		await plugin.onload();
		const wsRegs = plugin.registerView.mock.calls.filter((c) => c[0] === WORKSPACE_VIEW_TYPE);
		expect(wsRegs).toHaveLength(1);
	});

	it.each([
		["open-kanban", "kanban"],
		["open-plotgrid", "plotgrid"],
	])("%s opens the workspace view at the %s layout", async (id, layout) => {
		const { plugin, app } = await makePlugin();
		await plugin.onload();

		const wsLeaf = new WorkspaceLeaf();
		wsLeaf.app = app;
		app.workspace.getLeaf.mockReturnValue(wsLeaf);

		const cmd = plugin._commands.get(`story-forge:${id}`);
		expect(cmd?.callback).toBeDefined();
		cmd!.callback!();
		// Let the async _openWorkspace settle.
		await Promise.resolve();
		await Promise.resolve();

		expect(wsLeaf.setViewState).toHaveBeenCalledWith(
			expect.objectContaining({ type: WORKSPACE_VIEW_TYPE, state: { layout } }),
		);
		expect(app.workspace.revealLeaf).toHaveBeenCalledWith(wsLeaf);
	});
});
