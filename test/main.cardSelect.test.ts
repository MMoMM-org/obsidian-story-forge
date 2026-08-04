/**
 * main.cardSelect.test.ts — T4.4 code-quality follow-up (spec 008-codex-surface, Phase 4)
 *
 * The seam T4.4's own suite missed. `main.ts`'s `registerView(WORKSPACE_VIEW_TYPE, ...)`
 * closure (`onCardSelect`/`getCardByCollection`, main.ts ~134-147) is the REAL production
 * wiring that persists a Card choice — but `codex/codexTab.test.ts`'s
 * `statefulCardSelection()` helper reimplements the same shape (a local `Record` plus a
 * closure) instead of driving `main.ts`'s actual callback. It tests a replica, so it could
 * not catch a regression in the thing that ships: deleting `void this.saveSettings();`
 * from that closure passed the entire suite (0 failures / 2095) before this file existed.
 *
 * Drives a REAL `AnvilView` built through the plugin's own `registerView` factory — the
 * `getAnvilFactory`/`wireAnvilView` pattern `main.anvil.test.ts` already uses for exactly
 * this reason (a hand-built `AnvilView` would not prove main.ts's wiring is correct) — opens
 * the Codex tab, picks a Card, and asserts the production write path end to end.
 *
 * @ref docs/XDD/specs/008-codex-surface/plan/phase-4.md — T4.4 code-quality follow-up
 * @ref src/main.ts — the real onCardSelect/getCardByCollection wiring
 */

import { describe, it, expect, vi } from "vitest";
import {
	App,
	WorkspaceLeaf,
	createMockCachedMetadata,
	createMockTFile,
	type CachedMetadata,
	type TFile,
} from "obsidian";
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

/** Locate the AnvilView factory registered via registerView(WORKSPACE_VIEW_TYPE, ...) — same helper as main.anvil.test.ts. */
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

const mara = createMockTFile({ basename: "Mara Stoneway", path: "30 Canon/31 Characters/Mara Stoneway.md" });

/** Minimal vault: one character note, enough for the Characters pill to have an entry. */
function seedVault(app: App): void {
	const cache: CachedMetadata = createMockCachedMetadata({ frontmatter: { tags: ["canon/character"] } });
	const files: TFile[] = [mara];
	vi.mocked(app.metadataCache.getFileCache).mockImplementation((f) => (f === mara ? cache : null));
	vi.mocked(app.vault.getMarkdownFiles).mockReturnValue(files);
	vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((p) => (p === mara.path ? mara : null));
	app.workspace.getActiveFile = vi.fn(() => null);
}

function click(el: Element | null): void {
	if (!el) throw new Error("no element to click");
	el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

describe("main.ts — the real Card selector persistence wiring (T4.4)", () => {
	it("picking a Card calls plugin.saveSettings and updates plugin.settings.cardByCollection", async () => {
		const { plugin, app } = await makePlugin();
		seedVault(app);
		await plugin.onload();

		const leaf = new WorkspaceLeaf();
		leaf.app = app;
		const view = wireAnvilView(plugin, leaf);
		await view.onOpen();
		view.setLayout("codex");

		// Real instance method (main.ts's saveSettings), not a stand-in — spyOn keeps the
		// real implementation running so the persisted shape is genuinely exercised.
		const saveSettingsSpy = vi.spyOn(plugin, "saveSettings");
		const settingsBeforePick = plugin.settings;

		const body = view.contentEl.querySelector(".sf-ws-body") as HTMLElement;
		const tableOption = body.querySelector<HTMLElement>('[data-sf-card="table"]');
		expect(tableOption).not.toBeNull();
		click(tableOption);

		expect(saveSettingsSpy).toHaveBeenCalledTimes(1);
		expect(plugin.settings.cardByCollection).toEqual({ character: "table" });
		// main.ts writes via `this.settings = { ...this.settings, ... }` (immutable update,
		// CON-2) rather than mutating the existing object in place.
		expect(plugin.settings).not.toBe(settingsBeforePick);
	});
});
