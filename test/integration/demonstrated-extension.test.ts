/**
 * demonstrated-extension.test.ts — T8.1, the one metric that decides whether the extensibility
 * contract is real (spec 008, PRD/Success Metrics):
 *
 *   "a FileClass and a `.base` written by hand, without changing plugin code, produce a working
 *    new Codex collection with a typed, sectioned editor."
 *
 * The only inputs are the vault files under `test/fixtures/extension/` (a hand-written
 * `fc-organization.md`, an `Organizations.base` that selects by tag, two organization notes). They
 * are read off disk and laid into the mock vault at the same paths; nothing in this file describes
 * an organization. The REAL plugin loads (`main.ts` onload, no module of ours mocked) and the user's
 * walk is driven through what the plugin itself builds:
 *
 *   Settings › Library › "+ Import from vault…" → ImportPickerModal → Import
 *     → the Anvil (built by the plugin's own `registerView` factory) shows an "Organizations" pill
 *     → the pill draws the `.base` through Bases with the Hero Card view type
 *     → a card is clicked → the editor pane opens with a section labelled from the new FileClass
 *     → its Select offers the declared values → a change writes a plain Property.
 *
 * THE JSDOM BOUNDARY. Bases is Obsidian's own query engine and cannot run here. What crosses the
 * boundary, and what this test does at it:
 *   - Outbound: the plugin hands Bases a `base` fence through `MarkdownRenderer.render` (mocked by
 *     the obsidian mock). The test asserts that fence: the user's own tag filter, drawn as
 *     `story-forge-hero`.
 *   - Inbound: Bases would instantiate the view type the plugin registered for that id and feed it
 *     the query result. The test plays that part only: it calls the factory the plugin passed to
 *     `registerBasesView("story-forge-hero", …)` with the container the plugin rendered into, and
 *     hands it the notes carrying the tag the fence filters on. Evaluating `file.hasTag` is the one
 *     thing done by the test instead of by Bases; everything that draws the card, opens the pane,
 *     builds the sections and commits the value is production code.
 *
 * "No production source file may be modified for this test to pass" is checked in review, not
 * here (no git inside a test): `git diff --name-only <phase base> -- src styles.css infra`.
 *
 * @ref docs/XDD/specs/008-codex-surface/plan/phase-8.md — T8.1
 * @ref docs/XDD/specs/008-codex-surface/requirements.md — Success Metrics
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	App,
	BasesEntry,
	BasesQueryResult,
	MarkdownRenderer,
	QueryController,
	WorkspaceLeaf,
	createMockCachedMetadata,
	createMockTFile,
	parseYaml,
	type BasesViewRegistration,
	type TFile,
} from "obsidian";
import type { AnvilView } from "anvil/AnvilView";
import type { SettingsTab } from "settings/SettingsTab";
import { WORKSPACE_VIEW_TYPE } from "pluginConstants";

type Plugin = InstanceType<typeof import("main").default>;
type Fm = Record<string, unknown>;

const FIXTURE_ROOT = path.resolve(__dirname, "../fixtures/extension");
const BASE_NAME = "Organizations";
const HERO_VIEW_TYPE = "story-forge-hero";

// ---------------------------------------------------------------------------
// The fixture vault, read off disk
// ---------------------------------------------------------------------------

interface VaultFile {
	readonly file: TFile;
	readonly content: string;
	/** Parsed frontmatter of a `.md` file; `null` for a `.base`. */
	readonly frontmatter: Fm | null;
}

function walk(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const full = path.join(dir, name);
		return statSync(full).isDirectory() ? walk(full) : [full];
	});
}

function frontmatterOf(content: string): Fm | null {
	const match = /^---\n([\s\S]*?)\n---/.exec(content);
	return match ? (parseYaml(match[1]!) as Fm) : null;
}

function readFixtureVault(): Map<string, VaultFile> {
	const files = new Map<string, VaultFile>();
	for (const full of walk(FIXTURE_ROOT)) {
		const vaultPath = path.relative(FIXTURE_ROOT, full).split(path.sep).join("/");
		const name = vaultPath.split("/").pop()!;
		const extension = name.slice(name.lastIndexOf(".") + 1);
		const file = createMockTFile({ path: vaultPath, name, basename: name.slice(0, -(extension.length + 1)), extension });
		const content = readFileSync(full, "utf8");
		files.set(vaultPath, { file, content, frontmatter: extension === "md" ? frontmatterOf(content) : null });
	}
	return files;
}

// ---------------------------------------------------------------------------
// The world: the real plugin over that vault
// ---------------------------------------------------------------------------

interface World {
	readonly app: App;
	readonly plugin: Plugin;
	readonly vault: Map<string, VaultFile>;
	/** The organization notes, i.e. the fixture's markdown notes outside the FileClasses folder. */
	readonly notes: readonly VaultFile[];
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
	// A note's cache reads the frontmatter the file manager holds, so a commit is visible on re-read.
	for (const v of all) if (v.frontmatter) app.fileManager._setFrontmatter(v.file.path, v.frontmatter);
	vi.mocked(app.metadataCache.getFileCache).mockImplementation((f: TFile) =>
		vault.get(f.path)?.frontmatter ? createMockCachedMetadata({ frontmatter: app.fileManager._getFrontmatter(f.path) }) : null,
	);
}

async function world(): Promise<World> {
	const { default: StoryForgePlugin } = await import("main");
	const app = new App();
	const vault = readFixtureVault();
	wireVault(app, vault);
	const notes = [...vault.values()].filter((v) => v.file.extension === "md" && !v.file.path.startsWith("00 Meta/"));
	app.workspace.getActiveFile = vi.fn(() => notes[0]!.file);
	app.workspace.openLinkText = vi.fn(async () => {});

	const plugin = new StoryForgePlugin(app) as Plugin;
	// data.json, in memory: what the plugin saves is what it loads.
	let saved: Fm = {};
	plugin.loadData.mockImplementation(async () => structuredClone(saved));
	plugin.saveData.mockImplementation(async (d?: unknown) => { saved = structuredClone(d ?? {}) as Fm; });
	// Bases is enabled: the Bases runtime accepts every view type the plugin registers.
	plugin.registerBasesView = vi.fn((_id: string, _registration: BasesViewRegistration) => true);
	await plugin.onload();
	return { app, plugin, vault, notes };
}

// ---------------------------------------------------------------------------
// Driving the plugin's own surfaces
// ---------------------------------------------------------------------------

const settle = async (): Promise<void> => { for (let i = 0; i < 20; i++) await new Promise<void>((r) => setTimeout(r, 0)); };

function click(el: Element | null | undefined): void {
	if (!el) throw new Error("nothing to click");
	el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

function byText<E extends HTMLElement>(root: ParentNode, selector: string, text: string): E {
	const el = [...root.querySelectorAll<E>(selector)].find((e) => e.textContent === text);
	if (!el) throw new Error(`no ${selector} reading "${text}"`);
	return el;
}

const opened: AnvilView[] = [];
afterEach(async () => {
	for (const view of opened.splice(0)) {
		await view.onClose();
		view.contentEl.remove();
	}
	document.body.querySelectorAll(".modal").forEach((m) => m.remove());
	vi.mocked(MarkdownRenderer.render).mockClear();
});

async function openAnvil(w: World): Promise<AnvilView> {
	const call = w.plugin.registerView.mock.calls.find((c: unknown[]) => c[0] === WORKSPACE_VIEW_TYPE);
	const leaf = new WorkspaceLeaf();
	leaf.app = w.app;
	const view = (call![1] as (l: WorkspaceLeaf) => AnvilView)(leaf);
	opened.push(view);
	await view.onOpen();
	document.body.appendChild(view.contentEl);
	view.setLayout("codex");
	return view;
}

/** Settings › Library › "+ Import from vault…", pick the `.base`, Import — the user's import. */
async function importFromVault(w: World, name: string): Promise<void> {
	const tab = w.plugin.addSettingTab.mock.calls.at(-1)?.[0] as SettingsTab;
	await tab.openTab("library");
	click(byText(tab.containerEl, "button", "+ Import from vault…"));
	await vi.waitFor(() => { byText(document.body, ".sf-catalog-row .sf-catalog-name", name); });
	click(byText(document.body, ".sf-catalog-row .sf-catalog-name", name).closest(".sf-catalog-row"));
	click(byText(document.body, ".sf-catalog-act button", "Import"));
	await settle();
	tab.hide();
}

/** The section heading a field's control sits under: the pane lays headings and fields out as siblings. */
function sectionOf(a: AnvilView, field: string): { label: string | null; origin: string | undefined } {
	const cell = a.contentEl.querySelector(`[data-sf-ed-field="${field}"]`);
	if (!cell) throw new Error(`no control for ${field}`);
	const headings = [...a.contentEl.querySelectorAll<HTMLElement>(".sf-ed-sec")]
		.filter((h) => h.compareDocumentPosition(cell) & Node.DOCUMENT_POSITION_FOLLOWING);
	const heading = headings.at(-1);
	return {
		label: heading?.querySelector(".sf-ed-sec-label")?.textContent ?? null,
		origin: [...(heading?.classList ?? [])].find((c) => c.startsWith("sf-ed-sec--"))?.slice("sf-ed-sec--".length),
	};
}

const pillLabels = (a: AnvilView): string[] => [...a.contentEl.querySelectorAll("[data-sf-collection]")].map((p) => p.textContent ?? "");

/** The `base` fence the plugin last handed to Bases, and the element Bases was asked to draw into. */
function lastBasesRender(): { fence: string; container: HTMLElement } {
	const call = vi.mocked(MarkdownRenderer.render).mock.calls.at(-1);
	if (!call) throw new Error("nothing was handed to Bases");
	return { fence: String(call[1]), container: call[2] };
}

/**
 * The jsdom boundary, inbound: play Bases. Instantiate the view the plugin registered for the
 * fence's view type, in the container the plugin rendered into, and feed it the notes carrying
 * the tag the fence filters on. Only the `file.hasTag` evaluation is the test's.
 */
function playBases(w: World, rendered: { fence: string; container: HTMLElement }): void {
	const registration = vi.mocked(w.plugin.registerBasesView).mock.calls.find((c) => c[0] === HERO_VIEW_TYPE)?.[1];
	if (!registration) throw new Error(`the plugin registered no ${HERO_VIEW_TYPE} view`);
	const tag = /file\.hasTag\("([^"]+)"\)/.exec(rendered.fence)?.[1];
	const view = registration.factory(new QueryController(), rendered.container);
	const result = new BasesQueryResult();
	result.data = w.notes
		.filter((n) => (n.frontmatter?.["tags"] as unknown[] | undefined)?.includes(tag))
		.map((n) => {
			const entry = new BasesEntry();
			entry.file = n.file;
			return entry;
		});
	view.data = result;
	view.onDataUpdated();
}

// ---------------------------------------------------------------------------
// The demonstrated extension
// ---------------------------------------------------------------------------

describe("a FileClass and a .base written by hand (T8.1)", () => {
	it("become a Codex collection whose entries open a typed, sectioned editor that writes plain Properties", async () => {
		const w = await world();
		const ember = w.notes.find((n) => n.file.basename === "The Ember Guild")!;
		const before = structuredClone(w.app.fileManager._getFrontmatter(ember.file.path));
		const anvil = await openAnvil(w);
		expect(pillLabels(anvil)).not.toContain(BASE_NAME);

		// 1 · the collection appears as a pill — through the Library's own import.
		await importFromVault(w, BASE_NAME);
		expect(pillLabels(anvil)).toContain(BASE_NAME);

		// 2 · its entries render with the Hero Card: the user's tag filter is handed to Bases as the
		//     Hero view type, and the Hero view the plugin registered draws one hero card per note.
		click(byText(anvil.contentEl, "[data-sf-collection]", BASE_NAME));
		await settle();
		const rendered = lastBasesRender();
		expect(rendered.fence).toContain(`type: ${HERO_VIEW_TYPE}`);
		expect(rendered.fence).toContain('file.hasTag("canon/organization")');
		expect(anvil.contentEl.querySelector(".sf-cx-embed")?.contains(rendered.container)).toBe(true);
		playBases(w, rendered);
		const heroes = [...rendered.container.querySelectorAll<HTMLElement>(".sf-cx-hero")];
		expect(heroes.map((h) => h.getAttribute("data-sf-card-body")).sort()).toEqual(w.notes.map((n) => n.file.path).sort());

		// 3 · selecting one opens the editor, with a section labelled from the new FileClass.
		click(heroes.find((h) => h.getAttribute("data-sf-card-body") === ember.file.path));
		await settle();
		expect(anvil.contentEl.querySelector(`[data-sf-ed-path="${ember.file.path}"]`)).not.toBeNull();
		expect(sectionOf(anvil, "standing")).toEqual({ label: "Organization profile", origin: "user" });
		// Typed by the FileClass, not by the value: `founded` is declared a Number.
		expect(sectionOf(anvil, "founded").label).toBe("Organization profile");
		expect(anvil.contentEl.querySelector<HTMLInputElement>('[data-sf-ed-field="founded"] input')?.type).toBe("number");

		// 4 · its Select field offers the declared values, and only those, with the note's value chosen.
		const select = anvil.contentEl.querySelector<HTMLSelectElement>('[data-sf-ed-field="standing"] select');
		if (!select) throw new Error("standing has no select control");
		const offered = [...select.options].map((o) => o.value).filter((v) => v !== "");
		expect(offered).toEqual(["rising", "dominant", "waning", "outlawed"]);
		expect(select.value).toBe("rising");

		// 5 · a commit writes a plain Property, through processFrontMatter, and touches nothing else.
		select.value = "waning";
		select.dispatchEvent(new Event("change", { bubbles: true }));
		await settle();
		expect(w.app.fileManager.processFrontMatter).toHaveBeenCalledWith(ember.file, expect.any(Function));
		expect(w.app.fileManager._getFrontmatter(ember.file.path)).toEqual({ ...before, standing: "waning" });
		expect(w.app.vault.modify).not.toHaveBeenCalled();
	});
});
