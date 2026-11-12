/**
 * anvilLibrary.endToEnd.test.ts — T7.5's walk, through the whole plugin (spec 008 T7.1d2).
 *
 * The REAL plugin loads on a mock vault with the data it saved in memory: a `.base` is imported
 * with the Anvil switch only, shows in the Anvil's Codex, is removed, and nothing dangles.
 * The Workbench half of T7.5 (T7.1d3) is asserted on the real `SidebarView` the plugin registers:
 * the collection is not one of its tabs, and a Workbench-on collection is. Deep links are checked
 * on the real `SettingsTab`.
 *
 * @ref docs/XDD/specs/008-codex-surface/mockups-library.html — L2a, L6a, L8a, L8b
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { App, MarkdownRenderer, Menu, WorkspaceLeaf, createMockTFile, type TFile } from "obsidian";
import type { AnvilView } from "anvil/AnvilView";
import { computeChecksum } from "consent/checksum";
import { SettingsTab } from "settings/SettingsTab";
import type { ViewRecord } from "store/types";
import type { SidebarView } from "views/SidebarView";
import { SIDEBAR_VIEW_TYPE, WORKSPACE_VIEW_TYPE } from "pluginConstants";

vi.mock("bases/BasesAdapter", () => ({
	registerCodexView: vi.fn(() => true),
	isBasesAvailable: vi.fn(() => true),
	getBasesCapability: vi.fn(() => "enabled"),
}));

beforeAll(async () => {
	await import("main");
}, 30_000);

const BASE_PATH = "30 Canon/Organizations/Organizations.base";
const BASE_YAML = 'filters: file.hasTag("canon/organization")\nviews:\n  - type: table\n    name: Mine\n';
const MARA = createMockTFile({ basename: "Mara Stoneway", path: "30 Canon/31 Characters/Mara Stoneway.md" });

type Plugin = InstanceType<typeof import("main").default>;

const settle = async (): Promise<void> => { for (let i = 0; i < 20; i++) await new Promise<void>((r) => setTimeout(r, 0)); };
const click = (el: Element | null): void => {
	if (!el) throw new Error("nothing to click");
	el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
};

interface Session {
	readonly plugin: Plugin;
	readonly anvil: AnvilView;
	readonly workbench: SidebarView;
	readonly saved: { current: { views?: Record<string, ViewRecord>; settings?: { cardByCollection?: Record<string, string> } } };
}

const live: Session[] = [];
afterEach(async () => {
	for (const s of live.splice(0)) {
		await s.workbench.onClose();
		await s.anvil.onClose();
		s.anvil.unload();
		s.anvil.contentEl.remove();
	}
	vi.restoreAllMocks();
	vi.mocked(MarkdownRenderer.render).mockClear();
});

async function load(): Promise<Session> {
	const { default: StoryForgePlugin } = await import("main");
	const app = new App();
	const files = new Map<string, TFile>([[BASE_PATH, createMockTFile({ path: BASE_PATH, basename: "Organizations" })]]);
	vi.mocked(app.vault.getFileByPath).mockImplementation((p: string) => files.get(p) ?? null);
	vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((p: string) => files.get(p) ?? null);
	vi.mocked(app.vault.cachedRead).mockResolvedValue(BASE_YAML);
	app.workspace.getActiveFile = vi.fn(() => MARA);

	const saved: Session["saved"] = { current: {} };
	const plugin = new StoryForgePlugin(app) as Plugin;
	plugin.loadData.mockImplementation(async () => structuredClone(saved.current));
	plugin.saveData.mockImplementation(async (d?: unknown) => { saved.current = structuredClone(d) as Session["saved"]["current"]; });
	await plugin.onload();

	const leaf = new WorkspaceLeaf();
	leaf.app = app;
	const call = plugin.registerView.mock.calls.find((c: unknown[]) => c[0] === WORKSPACE_VIEW_TYPE);
	const anvil = (call![1] as (l: WorkspaceLeaf) => AnvilView)(leaf);
	await anvil.onOpen();
	document.body.appendChild(anvil.contentEl);
	anvil.setLayout("codex");
	const sidebar = plugin.registerView.mock.calls.find((c: unknown[]) => c[0] === SIDEBAR_VIEW_TYPE);
	const workbench = (sidebar![1] as (l: WorkspaceLeaf) => SidebarView)(leaf);
	await workbench.onOpen();
	const session = { plugin, anvil, workbench, saved };
	live.push(session);
	return session;
}

const tabLabels = (w: SidebarView): string[] => [...w.contentEl.querySelectorAll(".sf-tab")].map((t) => t.textContent ?? "");
const labels = (a: AnvilView): string[] => [...a.contentEl.querySelectorAll("[data-sf-collection]")].map((p) => p.textContent ?? "");
const pill = (a: AnvilView, label: string): HTMLElement =>
	[...a.contentEl.querySelectorAll<HTMLElement>("[data-sf-collection]")].find((p) => p.textContent === label)!;

describe("a .base imported for the Anvil only", () => {
	it("appears in the Anvil's Codex, draws through Bases, and leaves nothing behind once removed", async () => {
		const { plugin, anvil, workbench, saved } = await load();
		expect(labels(anvil)).toEqual(["Characters", "Locations", "Objects", "Lore"]);
		expect(tabLabels(workbench)).toEqual(["Codex", "Navigator"]);

		// The import: a collection record with the Anvil switch on and the Workbench off (D1, P2).
		await plugin.store.setRecord("orgs", {
			provenance: "imported", enabled: true, okayed: { version: 0, checksum: await computeChecksum(BASE_YAML) },
			source: BASE_PATH, engine: "bases", command: false, commandName: "Organizations", kind: "collection",
			surfaces: { anvil: true, workbench: false },
		});
		await settle();
		expect(labels(anvil)).toEqual(["Characters", "Locations", "Objects", "Lore", "Organizations"]);
		// T7.5: in the Anvil, and NOT in the Workbench.
		expect(tabLabels(workbench)).toEqual(["Codex", "Navigator"]);

		click(pill(anvil, "Organizations"));
		await settle();
		expect(String(vi.mocked(MarkdownRenderer.render).mock.calls.at(-1)?.[1])).toContain("type: story-forge-hero");
		click(anvil.contentEl.querySelector('[data-sf-card="compact"]'));
		await settle();
		expect(plugin.settings.cardByCollection).toEqual({ orgs: "compact" });

		await plugin.library.collections.remove("orgs");
		await settle();

		expect(labels(anvil)).toEqual(["Characters", "Locations", "Objects", "Lore"]);
		expect(tabLabels(workbench)).toEqual(["Codex", "Navigator"]);
		expect(pill(anvil, "Characters").getAttribute("aria-pressed")).toBe("true");
		expect(anvil.contentEl.querySelector(".sf-cx-embed")).toBeNull();
		expect(plugin.settings.cardByCollection).toEqual({});
		expect(Object.keys(saved.current.views ?? {})).toEqual([]);
		expect(saved.current.settings?.cardByCollection ?? {}).toEqual({});
		expect(plugin.library.snapshot().map((c) => c.id)).not.toContain("orgs");
	});
});

describe("a .base imported for the Workbench", () => {
	it("is a Workbench tab beside Codex and Navigator, and leaves with its collection", async () => {
		const { plugin, workbench } = await load();
		await plugin.store.setRecord("orgs", {
			provenance: "imported", enabled: true, okayed: { version: 0, checksum: await computeChecksum(BASE_YAML) },
			source: BASE_PATH, engine: "bases", command: false, commandName: "Organizations", kind: "collection",
			surfaces: { anvil: false, workbench: true },
		});
		await settle();
		expect(tabLabels(workbench)).toEqual(["Codex", "Navigator", "Organizations"]);

		await plugin.library.collections.remove("orgs");
		await settle();
		expect(tabLabels(workbench)).toEqual(["Codex", "Navigator"]);
	});
});

describe("the deep links into the Library tab", () => {
	it("'Manage in settings…' opens the Library tab", async () => {
		const open = vi.spyOn(SettingsTab.prototype, "openTab").mockResolvedValue(undefined);
		const { anvil } = await load();
		const show = vi.spyOn(Menu.prototype, "showAtPosition");
		click(anvil.contentEl.querySelector("[data-sf-cx-add]"));
		const menu = show.mock.instances[0] as Menu;
		menu._items.at(-1)!.onClickFn!(new MouseEvent("click"));
		expect(open).toHaveBeenCalledWith("library", {});
	});

	it("S98's 'Change tag' opens the Library tab on that collection's configure panel", async () => {
		const open = vi.spyOn(SettingsTab.prototype, "openTab").mockResolvedValue(undefined);
		const { anvil } = await load();
		click(anvil.contentEl.querySelector("[data-sf-cx-change-tag]"));
		expect(open).toHaveBeenCalledWith("library", { configure: "character" });
	});
});
