/**
 * degradationMatrix.test.ts — T8.2, independence proven by test (spec 008, PRD/Success Metrics,
 * SDD/CON-3, CON-9, PRD/F8).
 *
 * The matrix is {Bases on / off / absent} × {Dataview present / absent} ×
 * {metadata-menu present / absent} × {desktop / mobile}: 24 cells. Every cell loads the REAL
 * plugin (`main.ts` onload; no module of ours mocked), and sets each flag through the seam the
 * plugin actually reads:
 *
 *   - Bases: on = `registerBasesView` accepts; off = it declines (Bases shipped, turned off);
 *     absent = an Obsidian older than Bases (`apiVersion` below 1.10.0) with no `registerBasesView`
 *     at all, which is how `basesCapability` tells "absent" from "off".
 *   - Dataview: its API on `app.plugins.plugins.dataview` (with JavaScript queries on), or nothing.
 *   - metadata-menu: Story Forge never detects the plugin; it reads FileClass files. "Present" is the
 *     seed vault's own `fc-character.md` in the FileClasses folder; "absent" is no FileClass at all,
 *     so the editor falls back to tier 2 (the note's own keys, "Properties").
 *   - Mobile: `Platform.isMobile`.
 *
 * Every cell holds the two built-in-free collections a user may have beside the four built-ins: an
 * imported `.base` (Anvil and Workbench) and a Dataview (DQL) note (Workbench). They are what makes
 * the Bases, Dataview and mobile axes observable; the built-ins never touch an engine.
 *
 * Asserted in every cell:
 *   1. the Anvil's Codex draws the built-in collection's entries with the native card renderer;
 *   2. an entry opens the editor (FileClass section or the tier-2 fallback) and a commit writes a
 *      plain value through `processFrontMatter`;
 *   3. nothing in the Anvil, the Workbench, the Library tab or a Notice nags for a community plugin
 *      (one shared detector, `communityNags`, with its forbidden patterns spelled out);
 *   4. exactly one dismissible Bases hint when Bases is off, none when it is on or absent;
 *   5. the `.base` collection is handed to Bases only where Bases can draw it: desktop with Bases on.
 *      On mobile it is never embedded (CON-9); with Bases off or absent it says it needs Bases.
 *
 * THE JSDOM BOUNDARY is the same as T8.1's: Bases and Dataview do not run here. Handing a `.base` to
 * Bases is observed as the `base` fence passed to `MarkdownRenderer.render`; Dataview is the mock
 * API `createMockDataviewApi` builds.
 *
 * @ref docs/XDD/specs/008-codex-surface/plan/phase-8.md — T8.2
 * @ref docs/XDD/specs/008-codex-surface/solution.md — CON-3, CON-9
 * @ref docs/XDD/specs/008-codex-surface/requirements.md — Feature F8
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	App,
	MarkdownRenderer,
	Notice,
	Platform,
	WorkspaceLeaf,
	_resetApiVersion,
	_setApiVersion,
	createMockCachedMetadata,
	createMockDataviewApi,
	createMockTFile,
	parseYaml,
	wireDataviewApi,
	type BasesViewRegistration,
	type TFile,
} from "obsidian";
import type { AnvilView } from "anvil/AnvilView";
import { BASES_DISABLED_HINT_ID } from "codex/basesHint";
import type { SettingsTab } from "settings/SettingsTab";
import type { ViewRecord } from "store/types";
import type { SidebarView } from "views/SidebarView";
import { SIDEBAR_VIEW_TYPE, WORKSPACE_VIEW_TYPE } from "pluginConstants";

type Plugin = InstanceType<typeof import("main").default>;
type Fm = Record<string, unknown>;

// ---------------------------------------------------------------------------
// The matrix
// ---------------------------------------------------------------------------

type BasesState = "on" | "off" | "absent";

interface Cell {
	readonly bases: BasesState;
	readonly dataview: boolean;
	readonly metadataMenu: boolean;
	readonly mobile: boolean;
}

const CELLS: Cell[] = (["on", "off", "absent"] as const).flatMap((bases) =>
	[true, false].flatMap((dataview) =>
		[true, false].flatMap((metadataMenu) =>
			[false, true].map((mobile) => ({ bases, dataview, metadataMenu, mobile })))));

const label = (c: Cell): string =>
	`Bases ${c.bases} · Dataview ${c.dataview ? "present" : "absent"} · metadata-menu ${c.metadataMenu ? "present" : "absent"} · ${c.mobile ? "mobile" : "desktop"}`;

// ---------------------------------------------------------------------------
// The vault: two seed-vault characters, optionally their FileClass, and two user collections
// ---------------------------------------------------------------------------

const SEED = path.resolve(__dirname, "../StoryForge");
const FILECLASS_PATH = "00 Meta/FileClasses/fc-character.md";
const ELKE_PATH = "30 Canon/31 Characters/Elke Stoneway.md";
const MARA_PATH = "30 Canon/31 Characters/Mara Stoneway.md";
const BASE_PATH = "90 Collections/Organizations.base";
const BASE_YAML = 'filters: file.hasTag("canon/organization")\nviews:\n  - type: cards\n    name: Organizations\n';
const DQL_PATH = "90 Collections/Allies.md";
const DQL_NOTE = "---\nsf-view: true\nsf-name: Allies\n---\n\n```dataview\nLIST FROM #canon/character\n```\n";

interface VaultFile {
	readonly file: TFile;
	readonly content: string;
	readonly frontmatter: Fm | null;
}

function vaultFile(vaultPath: string, content: string): VaultFile {
	const name = vaultPath.split("/").pop()!;
	const extension = name.slice(name.lastIndexOf(".") + 1);
	const file = createMockTFile({ path: vaultPath, name, basename: name.slice(0, -(extension.length + 1)), extension });
	const match = /^---\n([\s\S]*?)\n---/.exec(content);
	return { file, content, frontmatter: extension === "md" && match ? (parseYaml(match[1]!) as Fm) : null };
}

const fromSeed = (p: string): VaultFile => vaultFile(p, readFileSync(path.join(SEED, p), "utf8"));

function buildVault(cell: Cell): Map<string, VaultFile> {
	const files = [fromSeed(ELKE_PATH), fromSeed(MARA_PATH), vaultFile(BASE_PATH, BASE_YAML), vaultFile(DQL_PATH, DQL_NOTE)];
	if (cell.metadataMenu) files.push(fromSeed(FILECLASS_PATH));
	return new Map(files.map((f) => [f.file.path, f]));
}

function wireVault(app: App, vault: Map<string, VaultFile>): void {
	const all = [...vault.values()];
	const byPath = (p: string): TFile | null => vault.get(p)?.file ?? null;
	vi.mocked(app.vault.getFiles).mockImplementation(() => all.map((v) => v.file));
	vi.mocked(app.vault.getMarkdownFiles).mockImplementation(() => all.filter((v) => v.file.extension === "md").map((v) => v.file));
	vi.mocked(app.vault.getAbstractFileByPath).mockImplementation(byPath);
	vi.mocked(app.vault.getFileByPath).mockImplementation(byPath);
	vi.mocked(app.vault.read).mockImplementation(async (f: TFile) => vault.get(f.path)?.content ?? "");
	vi.mocked(app.vault.cachedRead).mockImplementation(async (f: TFile) => vault.get(f.path)?.content ?? "");
	vi.mocked(app.metadataCache.getFirstLinkpathDest).mockImplementation((link: string) => all.find((v) => v.file.basename === link)?.file ?? null);
	for (const v of all) if (v.frontmatter) app.fileManager._setFrontmatter(v.file.path, v.frontmatter);
	vi.mocked(app.metadataCache.getFileCache).mockImplementation((f: TFile) =>
		vault.get(f.path)?.frontmatter ? createMockCachedMetadata({ frontmatter: app.fileManager._getFrontmatter(f.path) }) : null,
	);
}

// ---------------------------------------------------------------------------
// The world: the real plugin, the flags set through the seams it reads
// ---------------------------------------------------------------------------

interface World {
	readonly app: App;
	readonly plugin: Plugin;
	readonly anvil: AnvilView;
	readonly workbench: SidebarView;
	readonly vault: Map<string, VaultFile>;
}

function setBases(plugin: Plugin, state: BasesState): void {
	if (state === "absent") {
		_setApiVersion("1.9.0"); // an Obsidian older than Bases: no registerBasesView to call
		return;
	}
	plugin.registerBasesView = vi.fn((_id: string, _r: BasesViewRegistration) => state === "on");
}

function setPlatform(mobile: boolean): void {
	Platform.isMobile = mobile;
	Platform.isDesktop = !mobile;
}

const USER_COLLECTIONS: Record<string, ViewRecord> = {
	orgs: {
		provenance: "imported", enabled: true, okayed: { version: 0, checksum: "sha256:" + "0".repeat(64) },
		source: BASE_PATH, engine: "bases", command: false, commandName: "Organizations", kind: "collection",
		surfaces: { anvil: true, workbench: true },
	},
	allies: {
		provenance: "imported", enabled: true, okayed: { version: 0, checksum: "sha256:" + "1".repeat(64) },
		source: DQL_PATH, engine: "dataview-dql", command: false, commandName: "Allies", kind: "collection",
		surfaces: { anvil: false, workbench: true },
	},
};

function factory<V>(plugin: Plugin, type: string): (leaf: WorkspaceLeaf) => V {
	const call = plugin.registerView.mock.calls.find((c: unknown[]) => c[0] === type);
	if (!call) throw new Error(`${type} was never registered`);
	return call[1] as (leaf: WorkspaceLeaf) => V;
}

/** What each cell leaves behind, registered as it is made so a failing setup is cleaned up in its own cell. */
const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
	for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
	document.body.querySelectorAll(".modal").forEach((m) => m.remove());
	_resetApiVersion();
	setPlatform(false);
	Notice._reset();
	vi.mocked(MarkdownRenderer.render).mockClear();
});

async function openView<V extends { onOpen(): Promise<void>; onClose(): Promise<void>; contentEl: HTMLElement }>(
	plugin: Plugin, app: App, type: string,
): Promise<V> {
	const leaf = new WorkspaceLeaf();
	leaf.app = app;
	const view = factory<V>(plugin, type)(leaf);
	cleanups.push(async () => { await view.onClose(); view.contentEl.remove(); });
	await view.onOpen();
	document.body.appendChild(view.contentEl);
	return view;
}

async function world(cell: Cell, settings: Fm = {}): Promise<World> {
	const { default: StoryForgePlugin } = await import("main");
	const app = new App();
	const vault = buildVault(cell);
	wireVault(app, vault);
	if (cell.dataview) wireDataviewApi(app, createMockDataviewApi({ enableDataviewJs: true }));
	setPlatform(cell.mobile);
	app.workspace.getActiveFile = vi.fn(() => vault.get(MARA_PATH)!.file);
	app.workspace.openLinkText = vi.fn(async () => {});

	const plugin = new StoryForgePlugin(app) as Plugin;
	cleanups.push(async () => { plugin._runCleanup(); });
	let saved: Fm = { settings };
	plugin.loadData.mockImplementation(async () => structuredClone(saved));
	plugin.saveData.mockImplementation(async (d?: unknown) => { saved = structuredClone(d ?? {}) as Fm; });
	setBases(plugin, cell.bases);
	await plugin.onload();
	for (const [id, record] of Object.entries(USER_COLLECTIONS)) await plugin.store.setRecord(id, record);

	const anvil = await openView<AnvilView>(plugin, app, WORKSPACE_VIEW_TYPE);
	anvil.setLayout("codex");
	const workbench = await openView<SidebarView>(plugin, app, SIDEBAR_VIEW_TYPE);
	await vi.waitFor(() => { expect(pillLabels(anvil)).toContain("Organizations"); });
	return { app, plugin, anvil, workbench, vault };
}

// ---------------------------------------------------------------------------
// Reading the surfaces
// ---------------------------------------------------------------------------

function click(el: Element | null | undefined): void {
	if (!el) throw new Error("nothing to click");
	el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

const pillLabels = (a: AnvilView): string[] => [...a.contentEl.querySelectorAll("[data-sf-collection]")].map((p) => p.textContent ?? "");
const pill = (a: AnvilView, text: string): HTMLElement | undefined =>
	[...a.contentEl.querySelectorAll<HTMLElement>("[data-sf-collection]")].find((p) => p.textContent === text);

/** The `base` fences handed to Bases for a container inside `root`. */
function basesFencesIn(root: HTMLElement): string[] {
	return vi.mocked(MarkdownRenderer.render).mock.calls
		.filter((c) => root.contains(c[2]) && String(c[1]).startsWith("```base"))
		.map((c) => String(c[1]));
}

async function openLibrary(w: World): Promise<HTMLElement> {
	const tab = w.plugin.addSettingTab.mock.calls.at(-1)?.[0] as SettingsTab;
	await tab.openTab("library");
	await vi.waitFor(() => { expect(tab.containerEl.textContent).toContain("Organizations"); });
	return tab.containerEl;
}

/**
 * The one nag detector (PRD F8 AC 5: "no prompt, banner or nag" for a community plugin; the
 * capability list is the only mention). It reports, for `root`:
 *   - any wording that pushes toward getting a community plugin: install / download / get / enable /
 *     activate / turn on / requires … followed by Dataview, metadata-menu or "community plugin";
 *   - any link or button that targets a community plugin: an `href` to the plugin browser
 *     (`obsidian://show-plugin`, `community-plugins`) or to a community plugin's repository (Story
 *     Forge's own repository link in the Library header is not one), or a control whose own text or
 *     label names Dataview, metadata-menu or a community plugin.
 * Allowed, because they state a cause and offer no action: "Needs Dataview", "This collection needs
 * Dataview, which is not active.", "Needs Dataview, which is not active.", the Bases causes
 * "○ Needs Bases" and "Needs the core Bases plugin, which is off.", and the neutral
 * "What Story Forge can use…" link to the capability screen.
 */
const COMMUNITY = String.raw`(dataview|metadata[- ]?menu|community plugins?)`;
const NAG_WORDING: readonly RegExp[] = [
	new RegExp(String.raw`\b(install|download|get|enable|activate|turn on|requires?)\b[^.]{0,40}\b${COMMUNITY}`, "i"),
	new RegExp(String.raw`\b${COMMUNITY}\b[^.]{0,40}\b(to install|is required|must be installed|recommended)`, "i"),
	/\binstall(ed|ing)?\b/i,
];
const COMMUNITY_HREF = /obsidian:\/\/show-plugin|community-plugins|obsidian-dataview|blacksmithgu|metadata-?menu|mdelobelle/i;
const COMMUNITY_NAME = new RegExp(COMMUNITY, "i");

function communityNags(root: HTMLElement): string[] {
	const found: string[] = [];
	const text = root.textContent ?? "";
	for (const pattern of NAG_WORDING) {
		const m = pattern.exec(text);
		if (m) found.push(`wording: "${m[0]}"`);
	}
	for (const el of root.querySelectorAll<HTMLElement>("a, button, [role='button'], [href]")) {
		const href = el.getAttribute("href") ?? "";
		if (COMMUNITY_HREF.test(href)) found.push(`link: ${href}`);
		const own = `${el.textContent ?? ""} ${el.getAttribute("aria-label") ?? ""} ${el.getAttribute("title") ?? ""}`;
		if (COMMUNITY_NAME.test(own)) found.push(`control: "${own.trim()}"`);
	}
	return found;
}

function hintsIn(...roots: HTMLElement[]): HTMLElement[] {
	return roots.flatMap((r) => [...r.querySelectorAll<HTMLElement>(".sf-cx-hint")]);
}

// ---------------------------------------------------------------------------
// The 24 cells
// ---------------------------------------------------------------------------

describe.each(CELLS.map((c) => [label(c), c] as const))("%s", (_label, cell) => {
	it("draws the built-ins natively, and hands the .base to Bases only where Bases can draw it", async () => {
		const w = await world(cell);
		const elke = w.vault.get(ELKE_PATH)!.file;
		const mara = w.vault.get(MARA_PATH)!.file;

		// 1 · the built-in collection's entries, drawn by the native renderer (no Bases embed).
		await vi.waitFor(() => {
			const cards = [...w.anvil.contentEl.querySelectorAll<HTMLElement>(".sf-cx-card[data-sf-card-body]")];
			expect(cards.map((c) => c.getAttribute("data-sf-card-body")).sort()).toEqual([elke.path, mara.path]);
		});
		expect(w.anvil.contentEl.querySelector(".sf-cx-embed")).toBeNull();
		expect(basesFencesIn(w.anvil.contentEl)).toEqual([]);

		// 5 · the `.base`: embedded on desktop with Bases on; never on mobile (CON-9); a cause otherwise.
		click(pill(w.anvil, "Organizations"));
		if (cell.bases === "on" && !cell.mobile) {
			await vi.waitFor(() => { expect(basesFencesIn(w.anvil.contentEl).join("\n")).toContain("type: story-forge-hero"); });
		} else if (cell.bases === "on") {
			await vi.waitFor(() => { expect(w.anvil.contentEl.textContent).toContain("This collection is not available on mobile."); });
			expect(basesFencesIn(w.anvil.contentEl)).toEqual([]);
		} else {
			await vi.waitFor(() => { expect(w.anvil.contentEl.textContent).toContain("Organizations needs Bases"); });
			expect(basesFencesIn(w.anvil.contentEl)).toEqual([]);
		}
	});

	it("opens the editor from an entry, and a commit writes a plain value", async () => {
		const w = await world(cell);
		const elke = w.vault.get(ELKE_PATH)!.file;
		const before = structuredClone(w.app.fileManager._getFrontmatter(elke.path));

		await vi.waitFor(() => { expect(w.anvil.contentEl.querySelector(`[data-sf-card-body="${elke.path}"]`)).not.toBeNull(); });
		click(w.anvil.contentEl.querySelector(`[data-sf-card-body="${elke.path}"]`));
		await vi.waitFor(() => { expect(w.anvil.contentEl.querySelector(`[data-sf-ed-path="${elke.path}"]`)).not.toBeNull(); });
		// metadata-menu's files give the FileClass section; without them, the note's own keys (tier 2).
		const labels = [...w.anvil.contentEl.querySelectorAll(".sf-ed-sec-label")].map((l) => l.textContent);
		expect(labels[0]).toBe(cell.metadataMenu ? "Character" : "Properties");

		const input = w.anvil.contentEl.querySelector<HTMLInputElement>('[data-sf-ed-field="occupation"] input');
		if (!input) throw new Error("occupation has no text control");
		input.value = "harbourmaster";
		input.dispatchEvent(new Event("input", { bubbles: true }));
		input.dispatchEvent(new Event("change", { bubbles: true }));
		await vi.waitFor(() => { expect(w.app.fileManager.processFrontMatter).toHaveBeenCalledWith(elke, expect.any(Function)); });
		expect(w.app.fileManager._getFrontmatter(elke.path)).toEqual({ ...before, occupation: "harbourmaster" });
	});

	it("never prompts for a community plugin, in the Anvil, the Workbench, the Library or a Notice", async () => {
		const w = await world(cell);
		click(pill(w.anvil, "Organizations"));
		await vi.waitFor(() => { expect(w.anvil.contentEl.querySelector(".sf-cx-grid--embed")).not.toBeNull(); });
		const library = await openLibrary(w);

		expect(communityNags(w.anvil.contentEl)).toEqual([]);
		expect(communityNags(w.workbench.contentEl)).toEqual([]);
		expect(communityNags(library)).toEqual([]);
		expect(Notice._instances.map((n) => n.message).filter((m) => NAG_WORDING.some((p) => p.test(m)))).toEqual([]);
		// The allowed cause, where it applies: present, and not an action.
		if (!cell.dataview) expect(library.textContent).toContain("Needs Dataview, which is not active.");
		// A cause names the plugin the collection actually needs: a `.base` row never blames Dataview,
		// and where Bases cannot draw it on desktop, it says Bases (mobile is "not available" instead).
		const baseRow = [...library.querySelectorAll<HTMLElement>(".sf-lb-item")].find((r) => r.textContent?.startsWith("Organizations"));
		expect(baseRow?.textContent ?? "").not.toMatch(/Dataview/);
		if (cell.bases !== "on" && !cell.mobile) {
			expect(baseRow?.querySelector(".sf-lb-stat")?.textContent).toBe("○ Needs Bases");
			expect(baseRow?.querySelector(".sf-lb-hint")?.textContent).toBe("Needs the core Bases plugin, which is off. What Story Forge can use…");
		}
	});

	it(cell.bases === "off" ? "shows exactly one dismissible Bases hint" : "shows no Bases hint", async () => {
		const w = await world(cell);
		const library = await openLibrary(w);
		const hints = hintsIn(w.anvil.contentEl, w.workbench.contentEl, library);
		if (cell.bases === "off") {
			expect(hints).toHaveLength(1);
			expect(hints[0]!.querySelector(`[data-sf-cx-hint-dismiss="${BASES_DISABLED_HINT_ID}"]`)).not.toBeNull();
		} else {
			expect(hints).toEqual([]);
		}
	});
});

// ---------------------------------------------------------------------------
// Around the matrix
// ---------------------------------------------------------------------------

describe("the Bases hint once dismissed", () => {
	it("stays away with Bases off", async () => {
		const cell: Cell = { bases: "off", dataview: false, metadataMenu: false, mobile: false };
		const w = await world(cell, { dismissedHints: [BASES_DISABLED_HINT_ID] });
		expect(hintsIn(w.anvil.contentEl, w.workbench.contentEl)).toEqual([]);
	});
});

describe.each(["on", "off", "absent"] as const)("the capability screen with Bases %s", (bases) => {
	it("lists every optional plugin and offers no action for a community one", async () => {
		await world({ bases, dataview: false, metadataMenu: false, mobile: false });
		const modal = await vi.waitFor(() => {
			const el = document.body.querySelector<HTMLElement>(".sf-cap-modal");
			expect(el).not.toBeNull();
			return el!;
		});
		const rows = [...modal.querySelectorAll<HTMLElement>(".sf-cap-row")];
		const kindOf = (r: HTMLElement): string | null | undefined => r.querySelector(".sf-cap-kind")?.textContent;
		expect(rows.map((r) => r.querySelector(".sf-cap-name")?.textContent)).toEqual(["Story files", "Bases", "Dataview", "metadata-menu"]);
		const community = rows.filter((r) => kindOf(r) === "community");
		expect(community).toHaveLength(2);
		// No plugin row has a control, community or core: the core row names where Bases is turned on as text (S4).
		// Story Forge's own Story files row has the one button (spec 010 S6).
		for (const row of rows.filter((r) => kindOf(r) !== "Story Forge")) expect(row.querySelectorAll("a, button, [role='button'], [href]")).toHaveLength(0);
	});
});
