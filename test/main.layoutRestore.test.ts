/**
 * main.layoutRestore.test.ts — spec 008 T8.4: a persisted workspace layout from
 * before the move still restores (CON-4).
 *
 * Obsidian restores `.obsidian/workspace.json` by reading each leaf's persisted
 * `state.type` string and calling the view factory the plugin registered under
 * exactly that string. It knows nothing about source files, class names or the
 * display names "Anvil" / "Workbench". So the proof is: take a layout saved by
 * the pre-move plugin (the type strings are literals here, deliberately NOT
 * imported from pluginConstants — that would be circular), resolve each leaf
 * through the plugin's own registerView factories, and check the right view
 * opens and renders its management tabs.
 *
 * Known limitation, unchanged from main: the Anvil does not restore its persisted
 * view state (`state.layout`) on reopen — a restored leaf opens on its default tab.
 * The persisted leaves therefore carry an empty `state` here; asserting a restored
 * tab would claim behaviour that does not exist.
 *
 * @ref docs/XDD/specs/008-codex-surface/solution.md — CON-4
 * @ref docs/XDD/specs/008-codex-surface/plan/phase-8.md — T8.4
 */

import { describe, it, expect } from "vitest";
import { App, WorkspaceLeaf } from "obsidian";
import { AnvilView } from "anvil/AnvilView";
import { SidebarView } from "views/SidebarView";

type Plugin = InstanceType<typeof import("main").default>;

/** A leaf as it sits in a workspace.json written by the 0.2.0 (pre-move) plugin. */
interface PersistedLeaf {
	id: string;
	type: "leaf";
	state: { type: string; state: Record<string, unknown> };
}

/** The relevant slice of a pre-move `.obsidian/workspace.json`. */
const PRE_MOVE_LAYOUT: { main: PersistedLeaf; right: PersistedLeaf } = {
	main: { id: "a1", type: "leaf", state: { type: "story-forge-workspace", state: {} } },
	right: { id: "b2", type: "leaf", state: { type: "story-forge-panel", state: {} } },
};

async function loadPlugin(): Promise<{ plugin: Plugin; app: App }> {
	const { default: StoryForgePlugin } = await import("main");
	const app = new App();
	const plugin: Plugin = new StoryForgePlugin(app);
	await plugin.onload();
	return { plugin, app };
}

/**
 * Deserialize one persisted leaf the way Obsidian does: look the factory up by
 * the persisted type string, build the view on a fresh leaf, open it.
 */
async function restoreLeaf(
	plugin: Plugin,
	app: App,
	persisted: PersistedLeaf,
): Promise<unknown> {
	const reg = plugin.registerView.mock.calls.find((c: unknown[]) => c[0] === persisted.state.type);
	if (!reg) throw new Error(`no view registered for persisted type "${persisted.state.type}" — the leaf is orphaned`);
	const leaf = new WorkspaceLeaf();
	leaf.app = app;
	const view = (reg[1] as (l: WorkspaceLeaf) => AnvilView | SidebarView)(leaf);
	await view.onOpen();
	return view;
}

describe("CON-4 — a pre-move persisted workspace layout restores (T8.4)", () => {
	it("the main-area leaf saved as 'story-forge-workspace' restores as the Anvil with its management tabs", async () => {
		const { plugin, app } = await loadPlugin();
		const view = await restoreLeaf(plugin, app, PRE_MOVE_LAYOUT.main);

		expect(view).toBeInstanceOf(AnvilView);
		const anvil = view as AnvilView;
		expect(anvil.getViewType()).toBe("story-forge-workspace");
		const tabs = [...anvil.contentEl.querySelectorAll("[data-ws-layout]")].map((t) => t.getAttribute("data-ws-layout"));
		for (const tab of ["timeline", "plotlines", "kanban", "plotgrid"]) expect(tabs).toContain(tab);
		expect(anvil.contentEl.querySelector(".sf-ws-body")).not.toBeNull();
	});

	it("the sidebar leaf saved as 'story-forge-panel' restores as the Workbench", async () => {
		const { plugin, app } = await loadPlugin();
		const view = await restoreLeaf(plugin, app, PRE_MOVE_LAYOUT.right);

		expect(view).toBeInstanceOf(SidebarView);
		const workbench = view as SidebarView;
		expect(workbench.getViewType()).toBe("story-forge-panel");
		expect(workbench.contentEl.querySelector(".sf-tabs")).not.toBeNull();
	});
});
