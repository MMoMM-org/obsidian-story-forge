/**
 * endToEnd — every write path, through the whole plugin (spec 009 T6.1).
 *
 * The REAL plugin loads on a mock vault: the real journal, writer, recorder and history file
 * store, the real Anvil (editor pane + Kanban) and Workbench, built by the plugin's own view
 * factories. The only stand-ins are Obsidian's: a vault index, a metadata cache that reads the
 * stored frontmatter, and a `vault.adapter` that keeps `undo-journal.json` in memory.
 *
 * Each scenario runs the full path: load the plugin, write through one surface, undo through the
 * command, redo, unload and load a second plugin from the stored file, undo again. After every
 * step the value is read back from each surface that shows it.
 *
 * @ref docs/XDD/specs/009-undo-journal/plan/phase-6.md — T6.1
 * @ref docs/XDD/specs/009-undo-journal/solution.md — AC-F1.8, AC-F9.1, AC-F9.3
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
	App,
	Notice,
	WorkspaceLeaf,
	createMockCachedMetadata,
	createMockFrontmatterLink,
	createMockTFile,
	type TFile,
} from "obsidian";
import type { AnvilView } from "anvil/AnvilView";
import { DEBOUNCE_MS, SIDEBAR_VIEW_TYPE, WORKSPACE_VIEW_TYPE } from "pluginConstants";
import type { SidebarView } from "views/SidebarView";

vi.mock("bases/BasesAdapter", () => ({
	registerCodexView: vi.fn(() => false),
	isBasesAvailable: vi.fn(() => false),
}));

// ---------------------------------------------------------------------------
// jsdom shims (as in the Kanban suites)
// ---------------------------------------------------------------------------

if (typeof globalThis.PointerEvent === "undefined") {
	(globalThis as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = class PointerEvent extends MouseEvent {};
}
let dropTarget: Element | null = null;
Object.defineProperty(document, "elementFromPoint", {
	value: (): Element | null => dropTarget,
	writable: true,
	configurable: true,
});

beforeAll(async () => {
	// Obsidian's cross-window Node.instanceOf, which the mock does not install
	// (the same stand-in as test/undo/undoKeys.test.ts).
	const proto = Node.prototype as unknown as Record<string, unknown>;
	proto["instanceOf"] = function (this: Node, type: { name: string }): boolean {
		const win = (this.ownerDocument?.defaultView ?? window) as unknown as Record<string, new () => unknown>;
		const ctor = win[type.name];
		return ctor !== undefined && this instanceof ctor;
	};
	// The first import of `main` pulls in the whole plugin; pay for it once, not inside a test.
	await import("main");
}, 30_000);

// ---------------------------------------------------------------------------
// The vault: a book, its scenes on the Kanban, every note with a body
// ---------------------------------------------------------------------------

const BOOK = "20 Planning/Book.md";
const scenePath = (n: number): string => `30 Scenes/Scene ${n}.md`;
const S2 = scenePath(2);
const S5 = scenePath(5);
const S7 = scenePath(7);
const S9 = scenePath(9);
const JOURNAL_FILE = ".obsidian/plugins/story-forge/undo-journal.json";

const scene = (n: number, status: string, order: number): Record<string, unknown> =>
	({ type: "scene", title: `Scene ${n}`, status, order, characters: ["[[Mara]]"] });

/** Revised holds Scene 2 (10), Scene 5 (11), Scene 9 (20); Scene 7 is draft, order 30. */
const NOTES: Record<string, Record<string, unknown>> = {
	[BOOK]: {},
	[S2]: scene(2, "revised", 10),
	[S5]: scene(5, "revised", 11),
	[S9]: scene(9, "revised", 20),
	[S7]: scene(7, "draft", 30),
};

interface Vault {
	readonly app: App;
	/** `undo-journal.json` and anything else written through the adapter. */
	readonly disk: Map<string, string>;
	readonly bodies: Map<string, string>;
	file(path: string): TFile;
	fm(path: string): Record<string, unknown>;
}

function makeFile(path: string): TFile {
	const name = path.slice(path.lastIndexOf("/") + 1);
	return createMockTFile({ path, name, basename: name.replace(/\.md$/, "") });
}

/** Point the metadata cache at the writer's own store, so a write reads back as in Obsidian. */
function wireMetadata(app: App, files: Map<string, TFile>): void {
	const book = files.get(BOOK)!;
	vi.mocked(app.metadataCache.getFileCache).mockImplementation((f: TFile) => {
		if (!files.has(f.path)) return null;
		const frontmatter = app.fileManager._getFrontmatter(f.path);
		if (f.path === BOOK) return createMockCachedMetadata({ tags: [{ tag: "#planning/book" }], frontmatter });
		return createMockCachedMetadata({
			tags: [{ tag: "#manuscript/scene" }],
			frontmatter,
			frontmatterLinks: [createMockFrontmatterLink("book", "Book")],
		});
	});
	vi.mocked(app.metadataCache.getFirstLinkpathDest).mockImplementation((l: string) => (l === "Book" ? book : null));
	app.metadataCache.resolvedLinks = Object.fromEntries(
		[...files.keys()].filter((p) => p.startsWith("30 Scenes/")).map((p) => [p, { [BOOK]: 1 }]),
	);
	// The Anvil's scope: the book is the note in focus.
	app.workspace.getActiveFile = vi.fn(() => book);
}

/** obsidian.d.ts DataAdapter, kept in memory: the history file survives a plugin reload. */
function wireAdapter(app: App, disk: Map<string, string>): void {
	const { adapter } = app.vault;
	vi.mocked(adapter.exists).mockImplementation(async (p: string) => disk.has(p));
	vi.mocked(adapter.read).mockImplementation(async (p: string) => {
		const text = disk.get(p);
		if (text === undefined) throw new Error(`ENOENT: ${p}`);
		return text;
	});
	vi.mocked(adapter.write).mockImplementation(async (p: string, data: string) => void disk.set(p, data));
	vi.mocked(adapter.remove).mockImplementation(async (p: string) => void disk.delete(p));
}

function makeVault(): Vault {
	const app = new App();
	const files = new Map<string, TFile>();
	const bodies = new Map<string, string>();
	for (const [path, fm] of Object.entries(NOTES)) {
		files.set(path, makeFile(path));
		bodies.set(path, `# ${path}\n\nBody text that no undo may touch.\n`);
		app.fileManager._setFrontmatter(path, structuredClone(fm));
	}
	vi.mocked(app.vault.getFileByPath).mockImplementation((p: string) => files.get(p) ?? null);
	vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((p: string) => files.get(p) ?? null);
	vi.mocked(app.vault.read).mockImplementation(async (f: TFile) => bodies.get(f.path) ?? "");
	vi.mocked(app.vault.cachedRead).mockImplementation(async (f: TFile) => bodies.get(f.path) ?? "");
	// Body writers really write, so a stray body write during undo shows up in `bodies`.
	vi.mocked(app.vault.modify).mockImplementation(async (f: TFile, data: string) => void bodies.set(f.path, data));
	vi.mocked(app.vault.process).mockImplementation(async (f: TFile, fn: (data: string) => string) => {
		const next = fn(bodies.get(f.path) ?? "");
		bodies.set(f.path, next);
		return next;
	});
	vi.mocked(app.vault.create).mockImplementation(async (path: string, data: string) => {
		bodies.set(path, data);
		return makeFile(path);
	});
	vi.mocked(app.vault.getMarkdownFiles).mockReturnValue([...files.values()]);
	wireMetadata(app, files);
	const disk = new Map<string, string>();
	wireAdapter(app, disk);
	return {
		app, disk, bodies,
		file: (path) => files.get(path)!,
		fm: (path) => structuredClone(app.fileManager._getFrontmatter(path)),
	};
}

// ---------------------------------------------------------------------------
// The plugin and its two views
// ---------------------------------------------------------------------------

type Plugin = InstanceType<typeof import("main").default>;

interface Session {
	readonly plugin: Plugin;
	readonly anvil: AnvilView;
	readonly workbench: SidebarView;
}

const live: Session[] = [];

function factory<T>(plugin: Plugin, type: string): (leaf: WorkspaceLeaf) => T {
	const call = plugin.registerView.mock.calls.find((c: unknown[]) => c[0] === type);
	if (!call) throw new Error(`no view registered for ${type}`);
	return call[1] as (leaf: WorkspaceLeaf) => T;
}

async function settle(ms = 0): Promise<void> {
	await vi.advanceTimersByTimeAsync(ms);
	for (let i = 0; i < 10; i++) await Promise.resolve();
}

/** The editor moves to `file` (the Workbench follows it; the Anvil keeps the book's scope). */
async function activateNote(v: Vault, file: TFile): Promise<void> {
	const leaf = new WorkspaceLeaf();
	leaf.view.getViewType = vi.fn(() => "markdown");
	leaf.view.file = file;
	v.app.workspace._trigger("active-leaf-change", leaf);
	await settle(DEBOUNCE_MS + 1);
}

/** Load the plugin, open the Anvil on the Kanban with Scene 7 in its pane, and the Workbench on Scene 7. */
async function loadPlugin(v: Vault): Promise<Session> {
	const { default: StoryForgePlugin } = await import("main");
	const plugin = new StoryForgePlugin(v.app) as Plugin;
	await plugin.onload();

	const anvilLeaf = new WorkspaceLeaf();
	anvilLeaf.app = v.app;
	const anvil = factory<AnvilView>(plugin, WORKSPACE_VIEW_TYPE)(anvilLeaf);
	await anvil.onOpen();
	document.body.appendChild(anvil.contentEl);
	anvil.setLayout("kanban");
	anvil.inspect(v.file(S7));

	const wbLeaf = new WorkspaceLeaf();
	wbLeaf.app = v.app;
	wbLeaf.view.getViewType = vi.fn(() => SIDEBAR_VIEW_TYPE);
	const workbench = factory<SidebarView>(plugin, SIDEBAR_VIEW_TYPE)(wbLeaf);
	document.body.appendChild(workbench.containerEl);
	await workbench.onOpen();
	await activateNote(v, v.file(S7));
	workbench.contentEl.querySelector<HTMLElement>(".sf-edit-btn")!.click();
	await settle();

	const session = { plugin, anvil, workbench };
	live.push(session);
	return session;
}

/** What Obsidian does when a leaf closes: `onClose`, then the view's own listeners are released. */
async function closeViews(s: Session): Promise<void> {
	await s.anvil.onClose();
	s.anvil.unload();
	await s.workbench.onClose();
	s.workbench.unload();
	s.anvil.contentEl.remove();
	s.workbench.containerEl.remove();
}

/** Close the views, unload the plugin and let its shutdown save the history file. */
async function unload(s: Session): Promise<void> {
	try {
		await closeViews(s);
	} finally {
		live.splice(live.indexOf(s), 1);
	}
	s.plugin._runCleanup();
	await settle(10);
}

/** Where focus is, by what it is rather than by node: a redraw that keeps the caret replaces the node. */
function focusKey(): string {
	const el = document.activeElement;
	if (!(el instanceof HTMLElement) || el === document.body) return "body";
	const cell = el.closest("[data-sf-ed-field]")?.getAttribute("data-sf-ed-field");
	return cell ? `anvil:${cell}` : el.getAttribute("data-sf-inspector-input") ?? el.tagName;
}

/**
 * Run a palette command and let its writes and the views' re-renders land. Undo and redo open,
 * reveal and focus nothing (AC-F4.5).
 */
async function command(v: Vault, s: Session, direction: "undo" | "redo"): Promise<void> {
	const cmd = s.plugin._commands.get(`story-forge:${direction}-last-change`);
	if (!cmd?.callback) throw new Error(`no ${direction} command`);
	const { workspace } = v.app;
	const navigation = [workspace.getLeaf, workspace.openLinkText, workspace.revealLeaf];
	for (const fn of navigation) fn.mockClear();
	const focused = focusKey();
	cmd.callback();
	await settle(DEBOUNCE_MS + 1);
	for (const fn of navigation) expect(fn).not.toHaveBeenCalled();
	expect(focusKey()).toBe(focused);
}

// ---------------------------------------------------------------------------
// Reading each surface
// ---------------------------------------------------------------------------

/** The value the Anvil's editor pane shows for `key` (Scene 7 is in the pane). */
function anvilField(s: Session, key: string): string {
	const el = s.anvil.contentEl.querySelector<HTMLInputElement>(`[data-sf-ed-field="${key}"] input`);
	if (!el) throw new Error(`the Anvil pane shows no ${key}`);
	return el.value;
}

function anvilChips(s: Session, key: string): string[] {
	const cell = s.anvil.contentEl.querySelector(`[data-sf-ed-field="${key}"]`);
	if (!cell) throw new Error(`the Anvil pane shows no ${key}`);
	return [...cell.querySelectorAll(".sf-ed-chip-label")].map((c) => c.textContent ?? "");
}

function workbenchField(s: Session, key: string): string {
	const el = s.workbench.contentEl.querySelector<HTMLInputElement>(`[data-sf-inspector-input="${key}"]`);
	if (!el) throw new Error(`the Workbench shows no ${key}`);
	return el.value;
}

function card(s: Session, path: string): HTMLElement {
	const el = [...s.anvil.contentEl.querySelectorAll<HTMLElement>(".sf-kb-card")]
		.find((c) => c.getAttribute("data-sf-card-path") === path);
	if (!el) throw new Error(`no card for ${path}`);
	return el;
}

/** The column a card sits in, and the order it carries. */
function kanban(s: Session, path: string): { column: string | null; order: string | null } {
	const el = card(s, path);
	return { column: el.closest(".sf-kb-col")?.getAttribute("data-sf-status") ?? null, order: el.getAttribute("data-sf-order") };
}

afterEach(async () => {
	for (const s of live.splice(0)) {
		await closeViews(s);
		s.plugin._runCleanup();
	}
	await settle(10);
	document.body.replaceChildren();
	vi.useRealTimers();
	Notice._reset();
	vi.restoreAllMocks();
});

beforeEach(() => {
	vi.useFakeTimers();
	dropTarget = null;
});

function workbenchChips(s: Session, key: string): string[] {
	const label = s.workbench.contentEl.querySelector(`[data-sf-inspector-field-label="${key}"]`);
	const row = label?.closest(".sf-inspector-field");
	if (!row) throw new Error(`the Workbench shows no ${key}`);
	return [...row.querySelectorAll(".sf-inspector-chip, .sf-unres-text")].map((c) => c.textContent ?? "");
}

/** The ↶ ↷ controls of both views: they must agree, so one reading stands for both. */
function controls(s: Session): { undo: string | null; redo: string | null } {
	const read = (root: HTMLElement, d: string): string | null =>
		root.querySelector(`[data-sf-undo="${d}"]`)?.getAttribute("aria-label") ?? null;
	const anvil = { undo: read(s.anvil.contentEl, "undo"), redo: read(s.anvil.contentEl, "redo") };
	const workbench = { undo: read(s.workbench.contentEl, "undo"), redo: read(s.workbench.contentEl, "redo") };
	expect(workbench).toEqual(anvil);
	return anvil;
}

const lastNotice = (): string | undefined => Notice._instances.at(-1)?.message;

/** Every note's frontmatter, for comparing the whole vault against a snapshot. */
const allFrontmatter = (v: Vault): Record<string, Record<string, unknown>> =>
	Object.fromEntries(Object.keys(NOTES).map((p) => [p, v.fm(p)]));

// ---------------------------------------------------------------------------
// The six write paths
// ---------------------------------------------------------------------------

function drag(cardEl: HTMLElement, onto: Element): void {
	const ev = (type: string, x: number): PointerEvent =>
		new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: 100, button: 0, buttons: 1, pointerId: 1 });
	cardEl.dispatchEvent(ev("pointerdown", 100));
	window.dispatchEvent(ev("pointermove", 110));
	dropTarget = onto;
	window.dispatchEvent(ev("pointerup", 110));
}

/** What each surface shows; a path reads only the surfaces where its field appears. */
interface Shown {
	readonly anvil: Record<string, unknown>;
	readonly workbench: Record<string, unknown>;
	readonly kanban?: Record<string, { column: string | null; order: string | null }>;
}

interface WritePath {
	readonly name: string;
	/** Where the written field appears; the test name says so. */
	readonly surfaces: string;
	/** The step's label, as the controls and the notices name it. */
	readonly label: string;
	readonly write: (s: Session) => Promise<void>;
	readonly show: (s: Session) => Shown;
	readonly before: Shown;
	readonly after: Shown;
	/** Where focus is once the write landed; undo and redo must leave it there (AC-F4.5). */
	readonly focus: string;
}

const statusShown = (s: Session): Shown => ({
	anvil: { status: anvilField(s, "status") },
	workbench: { status: workbenchField(s, "status") },
	kanban: { [S7]: kanban(s, S7) },
});

const moveShown = (paths: readonly string[]) => (s: Session): Shown => ({
	anvil: { status: anvilField(s, "status"), order: anvilField(s, "order") },
	workbench: { status: workbenchField(s, "status"), order: workbenchField(s, "order") },
	kanban: Object.fromEntries(paths.map((p) => [p, kanban(s, p)])),
});

const S7_DRAFT: Shown = {
	anvil: { status: "draft" },
	workbench: { status: "draft" },
	kanban: { [S7]: { column: "draft", order: "30" } },
};
const S7_REVISED: Shown = {
	anvil: { status: "revised" },
	workbench: { status: "revised" },
	kanban: { [S7]: { column: "revised", order: "30" } },
};

const ALL_THREE = "Anvil editor, Workbench and Kanban";

const PATHS: readonly WritePath[] = [
	{
		name: "Anvil field",
		surfaces: ALL_THREE,
		label: "status in Scene 7",
		write: async (s) => {
			const el = s.anvil.contentEl.querySelector<HTMLInputElement>('[data-sf-ed-field="status"] input')!;
			el.focus();
			el.value = "revised";
			el.dispatchEvent(new Event("input", { bubbles: true }));
			el.dispatchEvent(new Event("change", { bubbles: true }));
		},
		show: statusShown,
		before: S7_DRAFT,
		after: S7_REVISED,
		// The caret stays in the field (walk item 2): the pane's own redraw keeps it.
		focus: "anvil:status",
	},
	{
		name: "Anvil chips",
		surfaces: "Anvil editor and Workbench (the Kanban card shows no characters)",
		label: "characters in Scene 7",
		write: async (s) => {
			s.anvil.contentEl.querySelector<HTMLElement>('[data-sf-ed-field="characters"] [data-sf-ed-chip-add]')!.click();
			const entry = s.anvil.contentEl.querySelector<HTMLInputElement>('[data-sf-ed-field="characters"] [data-sf-ed-chip-input]')!;
			entry.value = "Elke";
			entry.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
		},
		show: (s) => ({
			anvil: { characters: anvilChips(s, "characters") },
			workbench: { characters: workbenchChips(s, "characters") },
		}),
		before: { anvil: { characters: ["Mara"] }, workbench: { characters: ["Mara"] } },
		after: { anvil: { characters: ["Mara", "Elke"] }, workbench: { characters: ["Mara", "Elke"] } },
		focus: "body",
	},
	{
		name: "Workbench save",
		surfaces: ALL_THREE,
		label: "status in Scene 7",
		write: async (s) => {
			const el = s.workbench.contentEl.querySelector<HTMLInputElement>('[data-sf-inspector-input="status"]')!;
			el.value = "revised";
			el.dispatchEvent(new Event("input", { bubbles: true }));
			s.workbench.contentEl.querySelector<HTMLElement>('[data-sf-inspector-commit="status"]')!.click();
		},
		show: statusShown,
		before: S7_DRAFT,
		after: S7_REVISED,
		focus: "body",
	},
	{
		name: "Kanban drag",
		surfaces: ALL_THREE,
		label: "2 changes in Scene 7",
		// Onto Scene 9: between Scene 5 (11) and Scene 9 (20) there is room, so only Scene 7 is written.
		write: async (s) => { drag(card(s, S7), card(s, S9)); },
		show: moveShown([S7]),
		before: {
			anvil: { status: "draft", order: "30" },
			workbench: { status: "draft", order: "30" },
			kanban: { [S7]: { column: "draft", order: "30" } },
		},
		after: {
			anvil: { status: "revised", order: "15" },
			workbench: { status: "revised", order: "15" },
			kanban: { [S7]: { column: "revised", order: "15" } },
		},
		focus: "body",
	},
	{
		name: "Kanban keyboard move",
		surfaces: ALL_THREE,
		label: "status in Scene 7",
		write: async (s) => {
			card(s, S7).dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" }));
		},
		show: statusShown,
		before: S7_DRAFT,
		after: S7_REVISED,
		focus: "body",
	},
	{
		name: "RENUMBER",
		surfaces: ALL_THREE,
		label: "4 changes in 3 notes",
		// Onto Scene 5: no integer between Scene 2 (10) and Scene 5 (11), so the column is renumbered.
		write: async (s) => { drag(card(s, S7), card(s, S5)); },
		show: moveShown([S2, S5, S7, S9]),
		before: {
			anvil: { status: "draft", order: "30" },
			workbench: { status: "draft", order: "30" },
			kanban: {
				[S2]: { column: "revised", order: "10" },
				[S5]: { column: "revised", order: "11" },
				[S7]: { column: "draft", order: "30" },
				[S9]: { column: "revised", order: "20" },
			},
		},
		after: {
			anvil: { status: "revised", order: "20" },
			workbench: { status: "revised", order: "20" },
			kanban: {
				[S2]: { column: "revised", order: "10" },
				[S5]: { column: "revised", order: "30" },
				[S7]: { column: "revised", order: "20" },
				[S9]: { column: "revised", order: "40" },
			},
		},
		focus: "body",
	},
];

const NOTHING = { undo: "Nothing to undo", redo: "Nothing to redo" };

describe("every write path, end to end (spec 009 T6.1)", () => {
	it.each(PATHS.map((p) => [p.name, p.surfaces, p] as const))(
		"%s write: one step, undo via command, redo, reload from stored file, undo again; value shows in %s",
		async (_name, _surfaces, path) => {
			const v = makeVault();
			const first = await loadPlugin(v);
			expect(path.show(first)).toEqual(path.before);
			expect(controls(first)).toEqual(NOTHING);

			// Write: one step, shown everywhere.
			// Long enough for the Kanban's write debounce and a view render, well inside the 1 s save
			// debounce: the history reaches disk at unload only through the shutdown flush.
			await path.write(first);
			await settle(DEBOUNCE_MS * 2 + 1);
			const written = allFrontmatter(v);
			expect(written).not.toEqual(NOTES);
			expect(path.show(first)).toEqual(path.after);
			expect(controls(first)).toEqual({ undo: `Undo: ${path.label}`, redo: "Nothing to redo" });
			expect(focusKey()).toBe(path.focus);

			// Undo through the command: the stack held exactly this one step.
			await command(v, first, "undo");
			expect(allFrontmatter(v)).toEqual(NOTES);
			expect(path.show(first)).toEqual(path.before);
			expect(controls(first)).toEqual({ undo: "Nothing to undo", redo: `Redo: ${path.label}` });
			expect(lastNotice()).toBe(`Undo: ${path.label}`);

			await command(v, first, "redo");
			expect(allFrontmatter(v)).toEqual(written);
			expect(path.show(first)).toEqual(path.after);
			expect(controls(first)).toEqual({ undo: `Undo: ${path.label}`, redo: "Nothing to redo" });

			// Reload: a second plugin reads the step back from the stored file.
			expect(v.disk.has(JOURNAL_FILE)).toBe(false);
			await unload(first);
			expect(v.disk.has(JOURNAL_FILE)).toBe(true);
			const second = await loadPlugin(v);
			expect(path.show(second)).toEqual(path.after);
			expect(controls(second)).toEqual({ undo: `Undo: ${path.label}`, redo: "Nothing to redo" });

			await command(v, second, "undo");
			expect(allFrontmatter(v)).toEqual(NOTES);
			expect(path.show(second)).toEqual(path.before);
			expect(controls(second)).toEqual({ undo: "Nothing to undo", redo: `Redo: ${path.label}` });
			expect(lastNotice()).toBe(`Undo: ${path.label}`);

			// Nothing outside the step: every body is intact, no note was created, moved or deleted.
			expect([...v.bodies.values()].every((b) => b.endsWith("Body text that no undo may touch.\n"))).toBe(true);
			for (const fn of [v.app.vault.create, v.app.vault.modify, v.app.vault.process, v.app.vault.delete, v.app.vault.trash]) {
				expect(fn).not.toHaveBeenCalled();
			}
		},
	);
});
