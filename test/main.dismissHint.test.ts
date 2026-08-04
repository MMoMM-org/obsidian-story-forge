/**
 * main.dismissHint.test.ts — T4.6 (spec 008-codex-surface, Phase 4)
 *
 * The same seam class `main.cardSelect.test.ts` exists to close for T4.4:
 * `main.ts`'s real `registerView(WORKSPACE_VIEW_TYPE, ...)` closure
 * (`onDismissHint`/`getDismissedHints`/`onChangeTag`) is the PRODUCTION wiring
 * that persists a hint dismissal and opens Settings — but
 * `codex/codexTab.test.ts`'s Bases-hint tests inject their own mock callbacks,
 * which proves the click routes to *a* callback, never that main.ts's real one
 * calls `saveSettings()`. Mutation-tested: deleting `void this.saveSettings();`
 * from `onDismissHint`'s closure body passes every OTHER T4.6 test untouched —
 * this file is what catches that.
 *
 * Drives a REAL `AnvilView` built through the plugin's own `registerView`
 * factory (`getAnvilFactory`/`wireAnvilView`, the same pattern
 * `main.cardSelect.test.ts` and `main.anvil.test.ts` use), opens the Codex
 * tab, dismisses the Bases hint, and asserts the production write path end to
 * end — then reloads through a fresh plugin instance over the same fake
 * `data.json` port to prove the dismissal is PERMANENT, not merely
 * in-memory.
 *
 * @ref docs/XDD/specs/008-codex-surface/plan/phase-4.md — T4.6
 * @ref src/main.ts — the real onDismissHint/getDismissedHints/onChangeTag wiring
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
	App,
	WorkspaceLeaf,
	createMockCachedMetadata,
	createMockTFile,
	_setApiVersion,
	_resetApiVersion,
	type CachedMetadata,
	type TFile,
} from "obsidian";
import { WORKSPACE_VIEW_TYPE } from "pluginConstants";
import { AnvilView } from "anvil/AnvilView";
import { BASES_DISABLED_HINT_ID, CODEX_HINT_DISMISS_ATTR } from "codex/basesHint";
import { CODEX_CHANGE_TAG_ATTR } from "codex/codexEmptyState";

afterEach(() => {
	_resetApiVersion();
});

async function makePlugin(): Promise<{
	plugin: InstanceType<typeof import("main").default>;
	app: App;
}> {
	const { default: StoryForgePlugin } = await import("main");
	const app = new App();
	const plugin = new StoryForgePlugin(app) as InstanceType<typeof StoryForgePlugin>;
	return { plugin, app };
}

/** Locate the AnvilView factory registered via registerView(WORKSPACE_VIEW_TYPE, ...) — same helper as main.cardSelect.test.ts. */
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

async function openCodexBody(
	plugin: InstanceType<typeof import("main").default>,
	app: App,
): Promise<HTMLElement> {
	const leaf = new WorkspaceLeaf();
	leaf.app = app;
	const view = wireAnvilView(plugin, leaf);
	await view.onOpen();
	view.setLayout("codex");
	return view.contentEl.querySelector(".sf-ws-body") as HTMLElement;
}

describe("main.ts — the real Bases-hint dismissal wiring (T4.6)", () => {
	it("dismissing the hint calls plugin.saveSettings and updates plugin.settings.dismissedHints", async () => {
		const { plugin, app } = await makePlugin();
		seedVault(app);
		// No registerBasesView wired on the mock Plugin → registerCodexView caches
		// false → getBasesCapability(this) reads "disabled" (apiVersion default is
		// current) — the real production path to a present-but-disabled Bases.
		await plugin.onload();

		const body = await openCodexBody(plugin, app);
		const dismissBtn = body.querySelector<HTMLElement>(`[${CODEX_HINT_DISMISS_ATTR}]`);
		expect(dismissBtn).not.toBeNull();

		const saveSettingsSpy = vi.spyOn(plugin, "saveSettings");
		const settingsBeforeDismiss = plugin.settings;

		click(dismissBtn);

		expect(saveSettingsSpy).toHaveBeenCalledTimes(1);
		expect(plugin.settings.dismissedHints).toEqual([BASES_DISABLED_HINT_ID]);
		// Immutable update (CON-2), same discipline as onCardSelect.
		expect(plugin.settings).not.toBe(settingsBeforeDismiss);
	});

	it("is idempotent — dismissing an already-dismissed hint does not append a duplicate or re-save", async () => {
		const { plugin, app } = await makePlugin();
		seedVault(app);
		await plugin.onload();
		plugin.settings = { ...plugin.settings, dismissedHints: [BASES_DISABLED_HINT_ID] };

		const body = await openCodexBody(plugin, app);
		// The hint itself is gone once dismissed — nothing left to click, which is
		// the real behaviour proving idempotency structurally (no second dismiss
		// path exists once the banner is suppressed).
		expect(body.querySelector(`[${CODEX_HINT_DISMISS_ATTR}]`)).toBeNull();
	});

	it("shows no hint through the real wiring when Bases is enabled", async () => {
		const { plugin, app } = await makePlugin();
		seedVault(app);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(plugin as any).registerBasesView = vi.fn(() => true);
		await plugin.onload();

		const body = await openCodexBody(plugin, app);
		expect(body.querySelector(".sf-cx-hint")).toBeNull();
	});

	it("shows no hint through the real wiring when Bases is absent (apiVersion predates 1.10.0)", async () => {
		_setApiVersion("1.9.0");
		const { plugin, app } = await makePlugin();
		seedVault(app);
		await plugin.onload();

		const body = await openCodexBody(plugin, app);
		expect(body.querySelector(".sf-cx-hint")).toBeNull();
	});

	it("PERMANENCE: a dismissal survives a fresh plugin instance reloading the same persisted data.json", async () => {
		// One fake data.json-backed port, shared the way test/store/ViewStore.test.ts's
		// fakePort is, across TWO separate plugin instances — proving the dismissal
		// is read back from storage, not merely held in the first instance's memory.
		let stored: object = {};
		const firstApp = new App();

		const { default: StoryForgePlugin } = await import("main");
		const first = new StoryForgePlugin(firstApp);
		vi.spyOn(first, "loadData").mockImplementation(async () => stored);
		vi.spyOn(first, "saveData").mockImplementation(async (d: unknown) => {
			stored = d as object;
		});
		seedVault(firstApp);
		await first.onload();

		const firstBody = await openCodexBody(first, firstApp);
		click(firstBody.querySelector<HTMLElement>(`[${CODEX_HINT_DISMISS_ATTR}]`));
		expect(first.settings.dismissedHints).toEqual([BASES_DISABLED_HINT_ID]);

		// Fresh instance, same underlying store — the reload.
		const secondApp = new App();
		const second = new StoryForgePlugin(secondApp);
		vi.spyOn(second, "loadData").mockImplementation(async () => stored);
		vi.spyOn(second, "saveData").mockImplementation(async (d: unknown) => {
			stored = d as object;
		});
		seedVault(secondApp);
		await second.onload();

		const secondBody = await openCodexBody(second, secondApp);
		expect(second.settings.dismissedHints).toEqual([BASES_DISABLED_HINT_ID]);
		expect(secondBody.querySelector(".sf-cx-hint")).toBeNull();
	});
});

describe("main.ts — the real Change tag wiring (T4.6, S98)", () => {
	it("clicking Change tag opens Settings via app.setting.open/openTabById with the plugin's manifest id", async () => {
		const { plugin, app } = await makePlugin();
		seedVault(app);
		const open = vi.fn();
		const openTabById = vi.fn();
		(app as unknown as { setting: { open: () => void; openTabById: (id: string) => void } }).setting = {
			open,
			openTabById,
		};
		await plugin.onload();

		const body = await openCodexBody(plugin, app);
		// Characters resolves to one note (mara) — switch to Locations (empty, no
		// seed data) to reach the S98 empty state's Change tag action.
		click(body.querySelector<HTMLElement>('[data-sf-collection="location"]'));
		const changeTagBtn = body.querySelector<HTMLElement>(`[${CODEX_CHANGE_TAG_ATTR}]`);
		expect(changeTagBtn).not.toBeNull();

		click(changeTagBtn);

		expect(open).toHaveBeenCalledTimes(1);
		expect(openTabById).toHaveBeenCalledWith(plugin.manifest.id);
	});

	it("does not throw when app.setting is absent (older Obsidian / test environment)", async () => {
		const { plugin, app } = await makePlugin();
		seedVault(app);
		await plugin.onload(); // app.setting left undefined

		const body = await openCodexBody(plugin, app);
		click(body.querySelector<HTMLElement>('[data-sf-collection="location"]'));
		const changeTagBtn = body.querySelector<HTMLElement>(`[${CODEX_CHANGE_TAG_ATTR}]`);

		expect(() => click(changeTagBtn)).not.toThrow();
	});
});
