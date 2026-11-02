/**
 * main.editorPane.test.ts — T5.1 (spec 008-codex-surface, Phase 5).
 *
 * The **construction site**. `editor/editorPane.test.ts` drives a hand-built
 * `AnvilView`; this file drives the one the plugin's own `registerView` factory
 * builds, because two of T5.1's success criteria are claims about `main.ts`
 * specifically:
 *
 *  - the `drill` seam is fed there, so an inspect click is no longer inert
 *    (the 2026-07-31 decision this task discharges), and no other leaf is
 *    opened, revealed or re-targeted while doing it (PRD/F2). `AnvilView`
 *    deliberately keeps its no-op default, so **deleting `drill:` from the
 *    construction site fails the first test below** — that is the only reason
 *    the criterion "a name click is no longer a no-op" is falsifiable at all;
 *  - the dock is **persisted settings** (ADR-33), not view-local state — a
 *    replica of the getter/callback pair in a unit test cannot prove that,
 *    exactly as `main.cardSelect.test.ts` records for the Card choice.
 *
 * @ref docs/XDD/specs/008-codex-surface/plan/phase-5.md — T5.1
 * @ref src/main.ts — the real drill / editor-dock wiring
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

/** Locate the AnvilView factory registered via registerView(WORKSPACE_VIEW_TYPE, ...). */
function getAnvilFactory(
	plugin: InstanceType<typeof import("main").default>,
): (leaf: WorkspaceLeaf) => AnvilView {
	const call = plugin.registerView.mock.calls.find((c: unknown[]) => c[0] === WORKSPACE_VIEW_TYPE);
	if (!call) throw new Error("WORKSPACE_VIEW_TYPE was never registered");
	return call[1] as (leaf: WorkspaceLeaf) => AnvilView;
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
	app.workspace.openLinkText = vi.fn(async () => {});
}

/** Open the Codex tab on a view built by the plugin's own factory. */
async function openAnvil(
	plugin: InstanceType<typeof import("main").default>,
	app: App,
): Promise<AnvilView> {
	const leaf = new WorkspaceLeaf();
	leaf.app = app;
	// Most tests here open the pane by clicking a title, which is the setting's "off" branch.
	plugin.settings = { ...plugin.settings, cardTitleOpensNote: false };
	const view = getAnvilFactory(plugin)(leaf);
	(leaf as unknown as { view: AnvilView }).view = view;
	await view.onOpen();
	view.setLayout("codex");
	return view;
}

function bodyOf(view: AnvilView): HTMLElement {
	return view.contentEl.querySelector(".sf-ws-body") as HTMLElement;
}

function click(el: Element | null): void {
	if (!el) throw new Error("no element to click");
	el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

describe("main.ts — the FileClasses folder wiring (T5.3)", () => {
	it("renders the fields declared in the folder the SETTING names", async () => {
		const { plugin, app } = await makePlugin();
		const fcInCustomFolder = createMockTFile({
			basename: "fc-character",
			path: "90 Elsewhere/fc-character.md",
		});
		const fcCache: CachedMetadata = createMockCachedMetadata({
			frontmatter: {
				fieldsOrder: ["f-role"],
				fields: [{ id: "f-role", name: "role", type: "Input" }],
			},
		});
		const noteCache: CachedMetadata = createMockCachedMetadata({
			frontmatter: { tags: ["canon/character"], fileClass: "fc-character", role: "protagonist" },
		});
		vi.mocked(app.metadataCache.getFileCache).mockImplementation((f) =>
			f === mara ? noteCache : f === fcInCustomFolder ? fcCache : null,
		);
		vi.mocked(app.vault.getMarkdownFiles).mockReturnValue([mara, fcInCustomFolder]);
		vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((p) =>
			p === mara.path ? mara : p === fcInCustomFolder.path ? fcInCustomFolder : null,
		);
		app.workspace.getActiveFile = vi.fn(() => null);
		app.workspace.openLinkText = vi.fn(async () => {});
		await plugin.onload();
		plugin.settings = { ...plugin.settings, fileClassesFolder: "90 Elsewhere" };

		const view = await openAnvil(plugin, app);
		click(bodyOf(view).querySelector(`[data-sf-link="${mara.path}"]`));

		// The FileClass lives nowhere near the default folder, so a hardcoded
		// default finds no declaration and the pane falls back to the note's own
		// keys — which would NOT include a control seeded from `role`'s
		// declaration. Reading `.value` (not the attribute — assigning `.value`
		// never reflects to it) is what proves the chain resolved.
		const role = bodyOf(view).querySelector<HTMLInputElement>('[data-sf-ed-field="role"] input');
		expect(role?.value).toBe("protagonist");
		expect(bodyOf(view).querySelector(".sf-ed-sec-label")?.textContent).toBe("Character");
	});
});

describe("main.ts — the real editor pane wiring (T5.1)", () => {
	it("inspects within the Anvil on a plain click, opening no other leaf", async () => {
		const { plugin, app } = await makePlugin();
		seedVault(app);
		await plugin.onload();
		const view = await openAnvil(plugin, app);

		click(bodyOf(view).querySelector(`[data-sf-link="${mara.path}"]`));

		expect(bodyOf(view).querySelector(".sf-ed")?.getAttribute("data-sf-ed-path")).toBe(mara.path);
		expect(app.workspace.openLinkText).not.toHaveBeenCalled();
		expect(app.workspace.revealLeaf).not.toHaveBeenCalled();
		expect(app.workspace.getLeaf).not.toHaveBeenCalled();
	});

	it("persists a dock switch through plugin.saveSettings (ADR-33)", async () => {
		const { plugin, app } = await makePlugin();
		seedVault(app);
		await plugin.onload();
		const view = await openAnvil(plugin, app);
		click(bodyOf(view).querySelector(`[data-sf-link="${mara.path}"]`));

		expect(plugin.settings.editorDock).toBe("bottom");
		// Real instance method, spied so the real implementation still runs.
		const saveSettingsSpy = vi.spyOn(plugin, "saveSettings");
		const settingsBefore = plugin.settings;

		click(bodyOf(view).querySelector('[data-sf-ed-tool="dock"]'));

		expect(saveSettingsSpy).toHaveBeenCalledTimes(1);
		expect(plugin.settings.editorDock).toBe("right");
		// Immutable update (CON-2), same convention as the Card choice.
		expect(plugin.settings).not.toBe(settingsBefore);
		// And the pane actually moved beside the grid (S99).
		expect(bodyOf(view).querySelector(".sf-cx-split-right .sf-ed")).not.toBeNull();
	});
});

describe("main.ts wires cardTitleOpensNote into the Anvil, read live", () => {
	it("a title click opens a new tab while the setting is on, and the pane once it is flipped off", async () => {
		const { plugin, app } = await makePlugin();
		seedVault(app);
		await plugin.onload();
		const view = await openAnvil(plugin, app);
		plugin.settings = { ...plugin.settings, cardTitleOpensNote: true };
		const title = () => view.contentEl.querySelector<HTMLElement>(`.sf-cx-name[data-sf-link="${mara.path}"]`);

		title()?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		expect(app.workspace.openLinkText).toHaveBeenCalledWith(mara.path, "", true);

		plugin.settings = { ...plugin.settings, cardTitleOpensNote: false };
		title()?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		expect(app.workspace.openLinkText).toHaveBeenCalledTimes(1);
	});
});
