/**
 * legacyMigration.test.ts — T8.3, an existing user upgrades without losing anything (spec 008,
 * SDD/ADR-29, PRD/Risks "migration").
 *
 * The input is the `data.json` the current release (0.2.0) persists, captured in T3.6 from the live
 * test vault (`test/fixtures/legacy/dataJson.ts`): a Dataview (DQL) import and a DataviewJS import,
 * both consented, neither carrying `kind` or `surfaces`. The vault holds the two notes those records
 * point at, read off the seed vault, so the stored approvals are current. The REAL plugin loads
 * (`main.ts` onload; no module of ours mocked), exactly as T8.1 and T8.2 do.
 *
 * Asserted:
 *   1. every legacy record becomes a working collection where P2/D2 put it: a Workbench tab, not an
 *      Anvil pill, whose query reaches Dataview when the tab is opened;
 *   2. no consent prompt: no DisclosureModal, no S12 "Review and enable" box, no S17 re-review banner.
 *      The DataviewJS record keeps the approval it had before the upgrade;
 *   3. not one vault mutator runs — every Vault, DataAdapter and FileManager writer obsidian.d.ts
 *      declares is a spy and none is called;
 *   4. a second onload, and a further `migrate()`, leave `data.json` byte-identical with no save.
 *
 * THE ACCEPTED GAP (user decision 2026-11-17, re-confirming the ADR-29 descope of 2026-08-02): a
 * `.base` installed from 0.2.0's catalog (YAML in `source`, no `kind`) is not migrated. Its record
 * and its vault file are kept untouched, and no surface lists it. The last test pins that state so a
 * change to it is a decision, not an accident. It is not a guard for desired behaviour.
 *
 * @ref docs/XDD/specs/008-codex-surface/plan/phase-8.md — T8.3
 * @ref docs/XDD/specs/008-codex-surface/solution.md — ADR-29 (revised 2026-08-02)
 * @ref docs/XDD/specs/008-codex-surface/README.md — decision log, 2026-11-17 (T8.3 descope)
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import {
	App,
	WorkspaceLeaf,
	createMockCachedMetadata,
	createMockDataviewApi,
	createMockTFile,
	parseYaml,
	wireDataviewApi,
	type MockDataviewApi,
	type TFile,
} from "obsidian";
import type { AnvilView } from "anvil/AnvilView";
import { computeChecksum } from "consent/checksum";
import { DisclosureModal } from "consent/DisclosureModal";
import type { SettingsTab } from "settings/SettingsTab";
import type { SidebarView } from "views/SidebarView";
import { SIDEBAR_VIEW_TYPE, WORKSPACE_VIEW_TYPE } from "pluginConstants";
import {
	FIXTURE_NO_SETTINGS,
	LEGACY_CATALOG_BASE_ID,
	LEGACY_CATALOG_BASE_PATH,
	LEGACY_DQL_ID,
	LEGACY_DVJS_ID,
	LEGACY_VIEWS_RAW,
	legacyCatalogBaseRecord,
} from "../fixtures/legacy/dataJson";

type Plugin = InstanceType<typeof import("main").default>;
type Fm = Record<string, unknown>;

// ---------------------------------------------------------------------------
// The vault: the notes the legacy records point at, plus an entity note to be "active"
// ---------------------------------------------------------------------------

const SEED = path.resolve(__dirname, "../StoryForge");
const DQL_NOTE = LEGACY_VIEWS_RAW[LEGACY_DQL_ID].source;
const DVJS_NOTE = LEGACY_VIEWS_RAW[LEGACY_DVJS_ID].source;
const ACTIVE_NOTE = "30 Canon/31 Characters/Mara Stoneway.md";
/** The 0.2.0 catalog file as shipped; the seed vault keeps it byte-identical to main's catalog. */
const CATALOG_BASE_YAML = readFileSync(path.join(SEED, LEGACY_CATALOG_BASE_PATH), "utf8");
/** What the user did to the materialised file after installing it. */
const HAND_EDITED_BASE = `${CATALOG_BASE_YAML}  - type: cards\n    name: Character cards\n`;

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

function buildVault(extra: readonly VaultFile[] = []): Map<string, VaultFile> {
	const files = [fromSeed(DQL_NOTE), fromSeed(DVJS_NOTE), fromSeed(ACTIVE_NOTE), ...extra];
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
	for (const v of all) if (v.frontmatter) app.fileManager._setFrontmatter(v.file.path, v.frontmatter);
	vi.mocked(app.metadataCache.getFileCache).mockImplementation((f: TFile) =>
		vault.get(f.path)?.frontmatter ? createMockCachedMetadata({ frontmatter: app.fileManager._getFrontmatter(f.path) }) : null,
	);
}

/**
 * Every writer obsidian.d.ts declares on Vault, DataAdapter and FileManager, by name. Reading
 * them off the app (not a hand-picked few) is what makes "no file was touched" a real claim.
 * Keep it complete: whenever obsidian.d.ts gains a writer on any of the three, add it here (and to
 * the mock), or a write through it would pass unseen.
 */
function vaultMutators(app: App): Record<string, Mock> {
	const v = app.vault;
	const a = app.vault.adapter;
	const fm = app.fileManager;
	return {
		"vault.create": vi.mocked(v.create), "vault.createBinary": vi.mocked(v.createBinary),
		"vault.createFolder": vi.mocked(v.createFolder), "vault.modify": vi.mocked(v.modify),
		"vault.modifyBinary": vi.mocked(v.modifyBinary), "vault.append": vi.mocked(v.append),
		"vault.appendBinary": vi.mocked(v.appendBinary), "vault.process": vi.mocked(v.process),
		"vault.rename": vi.mocked(v.rename), "vault.copy": vi.mocked(v.copy),
		"vault.delete": vi.mocked(v.delete), "vault.trash": vi.mocked(v.trash),
		"adapter.write": vi.mocked(a.write), "adapter.writeBinary": vi.mocked(a.writeBinary),
		"adapter.append": vi.mocked(a.append), "adapter.appendBinary": vi.mocked(a.appendBinary),
		"adapter.process": vi.mocked(a.process), "adapter.mkdir": vi.mocked(a.mkdir),
		"adapter.rename": vi.mocked(a.rename), "adapter.copy": vi.mocked(a.copy),
		"adapter.remove": vi.mocked(a.remove), "adapter.rmdir": vi.mocked(a.rmdir),
		"adapter.trashSystem": vi.mocked(a.trashSystem), "adapter.trashLocal": vi.mocked(a.trashLocal),
		"fileManager.processFrontMatter": vi.mocked(fm.processFrontMatter),
		"fileManager.renameFile": vi.mocked(fm.renameFile), "fileManager.trashFile": vi.mocked(fm.trashFile),
	};
}

/** The names of the mutators that ran — `[]` is the claim. */
const vaultWrites = (app: App): string[] =>
	Object.entries(vaultMutators(app)).filter(([, spy]) => spy.mock.calls.length > 0).map(([name]) => name);

// ---------------------------------------------------------------------------
// The world: the real plugin over that vault and a persisted data.json
// ---------------------------------------------------------------------------

/** data.json as Obsidian keeps it: the string written last. `saves` counts `saveData` calls. */
interface DataJson {
	text: string;
	saves: number;
}

const dataJsonOf = (data: unknown): DataJson => ({ text: JSON.stringify(data, null, 2), saves: 0 });

interface World {
	readonly app: App;
	readonly plugin: Plugin;
	readonly dv: MockDataviewApi;
	readonly vault: Map<string, VaultFile>;
}

const live: Plugin[] = [];
const opened: Array<AnvilView | SidebarView> = [];

afterEach(async () => {
	for (const view of opened.splice(0)) {
		await view.onClose();
		view.contentEl.remove();
	}
	for (const plugin of live.splice(0)) plugin._runCleanup();
	document.body.querySelectorAll(".modal").forEach((m) => m.remove());
	vi.restoreAllMocks();
});

async function load(disk: DataJson, vault: Map<string, VaultFile>): Promise<World> {
	const { default: StoryForgePlugin } = await import("main");
	const app = new App();
	wireVault(app, vault);
	const dv = createMockDataviewApi({ enableDataviewJs: true });
	wireDataviewApi(app, dv);
	app.workspace.getActiveFile = vi.fn(() => vault.get(ACTIVE_NOTE)!.file);
	app.workspace.openLinkText = vi.fn(async () => {});

	const plugin = new StoryForgePlugin(app) as Plugin;
	plugin.loadData.mockImplementation(async () => JSON.parse(disk.text) as Fm);
	plugin.saveData.mockImplementation(async (d?: unknown) => {
		disk.text = JSON.stringify(d ?? {}, null, 2);
		disk.saves++;
	});
	await plugin.onload();
	live.push(plugin);
	return { app, plugin, dv, vault };
}

/** Unload, as Obsidian does before the next start. The undo journal allows one recorder at a time. */
function unload(w: World): void {
	live.splice(live.indexOf(w.plugin), 1);
	w.plugin._runCleanup();
}

function factory<V>(plugin: Plugin, type: string): (leaf: WorkspaceLeaf) => V {
	const call = plugin.registerView.mock.calls.find((c: unknown[]) => c[0] === type);
	if (!call) throw new Error(`${type} was never registered`);
	return call[1] as (leaf: WorkspaceLeaf) => V;
}

async function open<V extends AnvilView | SidebarView>(w: World, type: string): Promise<V> {
	const leaf = new WorkspaceLeaf();
	leaf.app = w.app;
	const view = factory<V>(w.plugin, type)(leaf);
	opened.push(view);
	await view.onOpen();
	document.body.appendChild(view.contentEl);
	return view;
}

async function openAnvil(w: World): Promise<AnvilView> {
	const anvil = await open<AnvilView>(w, WORKSPACE_VIEW_TYPE);
	anvil.setLayout("codex");
	await vi.waitFor(() => { expect(pillIds(anvil).length).toBeGreaterThan(0); });
	return anvil;
}

// ---------------------------------------------------------------------------
// Reading the surfaces
// ---------------------------------------------------------------------------

const pillIds = (a: AnvilView): string[] =>
	[...a.contentEl.querySelectorAll("[data-sf-collection]")].map((p) => p.getAttribute("data-sf-collection") ?? "");

const tabIds = (wb: SidebarView): string[] =>
	[...wb.contentEl.querySelectorAll(".sf-tab")].map((t) => t.getAttribute("data-view-id") ?? "");

function tab(wb: SidebarView, id: string): HTMLElement {
	const el = wb.contentEl.querySelector<HTMLElement>(`.sf-tab[data-view-id="${id}"]`);
	if (!el) throw new Error(`no Workbench tab for ${id}`);
	return el;
}

/** Every consent prompt the plugin can show: the S12 box, the S17 banner, the disclosure modal. */
const consentPrompts = (): string[] =>
	[...document.body.querySelectorAll(".sf-consent-required, .sf-reconsent-required, .sf-disclosure-modal")]
		.map((el) => el.className);

/** The fenced block of a seed note, as Dataview is handed it. */
function queryOf(note: string): string {
	const body = /```(?:dataviewjs|dataview)\n([\s\S]*?)```/.exec(readFileSync(path.join(SEED, note), "utf8"))?.[1];
	if (body === undefined) throw new Error(`${note} holds no query`);
	return body;
}

const persistedViews = (disk: DataJson): Record<string, Fm> =>
	(JSON.parse(disk.text) as { views: Record<string, Fm> }).views;

// ---------------------------------------------------------------------------
// T8.3
// ---------------------------------------------------------------------------

describe("upgrading from a 0.2.0 data.json (T8.3)", () => {
	it("turns every legacy view into a Workbench collection that runs, with no prompt and no vault write", async () => {
		const disk = dataJsonOf(FIXTURE_NO_SETTINGS);
		const present = vi.spyOn(DisclosureModal.prototype, "present");
		const w = await load(disk, buildVault());

		// 1 · D2/P2: imported, Workbench on, Anvil off — every field the user had is kept.
		const views = persistedViews(disk);
		for (const [id, raw] of Object.entries(LEGACY_VIEWS_RAW)) {
			expect(views[id]).toEqual({ ...raw, kind: "collection", provenance: "imported", surfaces: { anvil: false, workbench: true } });
		}
		const anvil = await openAnvil(w);
		expect(pillIds(anvil)).not.toContain(LEGACY_DQL_ID);
		expect(pillIds(anvil)).not.toContain(LEGACY_DVJS_ID);
		const workbench = await open<SidebarView>(w, SIDEBAR_VIEW_TYPE);
		await vi.waitFor(() => { expect(tabIds(workbench)).toEqual(expect.arrayContaining([LEGACY_DQL_ID, LEGACY_DVJS_ID])); });
		expect(tab(workbench, LEGACY_DQL_ID).textContent).toBe("Characters in scene");
		expect(tab(workbench, LEGACY_DVJS_ID).textContent).toBe("Scene debug (DataviewJS)");

		// …and each tab's query runs: DQL straight away, DataviewJS on the approval it already had.
		tab(workbench, LEGACY_DQL_ID).click();
		// The DQL engine binds `[[this]]` to the active note, so the query is matched by its WHERE line.
		const dqlWhere = queryOf(DQL_NOTE).split("\n").find((l) => l.startsWith("WHERE"))!;
		await vi.waitFor(() => { expect(w.dv.execute).toHaveBeenCalledWith(expect.stringContaining(dqlWhere), expect.anything(), expect.anything(), ACTIVE_NOTE); });
		tab(workbench, LEGACY_DVJS_ID).click();
		await vi.waitFor(() => { expect(w.dv.executeJs).toHaveBeenCalledWith(queryOf(DVJS_NOTE), expect.anything(), expect.anything(), ACTIVE_NOTE); });

		// 2 · no prompt, anywhere.
		expect(consentPrompts()).toEqual([]);
		expect(present).not.toHaveBeenCalled();
		// The DataviewJS approval survives the upgrade as it was.
		expect(persistedViews(disk)[LEGACY_DVJS_ID]?.["okayed"]).toEqual(LEGACY_VIEWS_RAW[LEGACY_DVJS_ID].okayed);

		// 3 · not one file in the vault was written, created, moved or removed.
		expect(vaultWrites(w.app)).toEqual([]);
	});

	it("is a no-op the second time: data.json stays byte-identical, nothing is saved or written", async () => {
		const disk = dataJsonOf(FIXTURE_NO_SETTINGS);
		unload(await load(disk, buildVault()));
		const afterFirst = disk.text;
		const savesAfterFirst = disk.saves;
		expect(savesAfterFirst).toBeGreaterThan(0); // the first load did migrate

		const second = await load(disk, buildVault());
		expect(await second.plugin.library.collections.migrate()).toBe(0);

		expect(disk.text).toBe(afterFirst);
		expect(disk.saves).toBe(savesAfterFirst);
		expect(vaultWrites(second.app)).toEqual([]);
		// Still the same two collections on the Workbench.
		expect(second.plugin.library.snapshot().filter((c) => c.effective.workbench && c.provenance === "imported").map((c) => c.id))
			.toEqual([LEGACY_DQL_ID, LEGACY_DVJS_ID]);
	});

	it(
		"ACCEPTED GAP by user decision 2026-11-17 (ADR-29 descope), not a bug guard: a 0.2.0 catalog .base " +
		"record stays in data.json unchanged, its hand-edited vault file is untouched, and no surface lists it",
		async () => {
			// The checksum 0.2.0 stored is the plugin's own, over the YAML it installed.
			const legacyBase = legacyCatalogBaseRecord(CATALOG_BASE_YAML, await computeChecksum(CATALOG_BASE_YAML));
			const disk = dataJsonOf({ views: { ...LEGACY_VIEWS_RAW, [LEGACY_CATALOG_BASE_ID]: legacyBase } });
			const vault = buildVault([vaultFile(LEGACY_CATALOG_BASE_PATH, HAND_EDITED_BASE)]);
			const w = await load(disk, vault);

			// Kept: the record byte for byte, and the file the user edited.
			expect(persistedViews(disk)[LEGACY_CATALOG_BASE_ID]).toEqual(legacyBase);
			expect(vault.get(LEGACY_CATALOG_BASE_PATH)?.content).toBe(HAND_EDITED_BASE);
			expect(vaultWrites(w.app)).toEqual([]);

			// Not listed: not in the Library's list, not a pill, not a Workbench tab, not in the Library tab.
			expect(w.plugin.library.snapshot().map((c) => c.id)).not.toContain(LEGACY_CATALOG_BASE_ID);
			const anvil = await openAnvil(w);
			expect(pillIds(anvil)).not.toContain(LEGACY_CATALOG_BASE_ID);
			const workbench = await open<SidebarView>(w, SIDEBAR_VIEW_TYPE);
			await vi.waitFor(() => { expect(tabIds(workbench)).toContain(LEGACY_DQL_ID); });
			expect(tabIds(workbench)).not.toContain(LEGACY_CATALOG_BASE_ID);
			const settings = w.plugin.addSettingTab.mock.calls.at(-1)?.[0] as SettingsTab;
			await settings.openTab("library");
			try {
				const row = (id: string): Element | null => settings.containerEl.querySelector(`[data-collection-id="${id}"]`);
				await vi.waitFor(() => { expect(row(LEGACY_DQL_ID)).not.toBeNull(); });
				expect(row(LEGACY_CATALOG_BASE_ID)).toBeNull();
				expect(consentPrompts()).toEqual([]);
			} finally {
				settings.hide();
			}
		},
	);
});
