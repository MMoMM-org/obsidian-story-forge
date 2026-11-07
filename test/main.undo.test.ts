/**
 * main.undo.test.ts — the undo journal's wiring into StoryForgePlugin (spec 009 T2.7).
 *
 * The REAL journal runs; only a fake store (so no file I/O) and spies on the
 * journal's methods (so order and calls are observable) stand in. The recorder
 * is module state, so every plugin is unloaded in afterEach.
 *
 * @ref docs/XDD/specs/009-undo-journal/plan/phase-2.md — T2.7
 * @ref docs/XDD/specs/009-undo-journal/solution.md — ADR-43, Integration Points
 */

import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { App, Notice, Tasks, WorkspaceLeaf, createMockTFile } from "obsidian";
import { SIDEBAR_VIEW_TYPE, WORKSPACE_VIEW_TYPE } from "pluginConstants";
import type { AnvilView } from "anvil/AnvilView";
import type { SidebarView } from "views/SidebarView";
import type { OwnedUndoJournal, UndoJournalDeps } from "undo/undoJournal";
import type { JournalStoreDeps } from "undo/journalStore";
import type { JournalStore } from "undo/journalTypes";
import { commit, installWriteRecorder } from "inspector/frontmatterWriter";
import type { JournalSnapshot } from "undo/journalTypes";
import { unexpectedErrorNotice } from "undo/stepLabel";

vi.mock("bases/BasesAdapter", () => ({
	registerCodexView: vi.fn(() => false),
	isBasesAvailable: vi.fn(() => false),
}));

interface Captured {
	deps: UndoJournalDeps | null;
	journal: OwnedUndoJournal | null;
	storeDeps: JournalStoreDeps | null;
	store: JournalStore & { load: ReturnType<typeof vi.fn> };
	events: string[];
}
const captured: Captured = {
	deps: null,
	journal: null,
	storeDeps: null,
	store: {
		load: vi.fn(async () => ({ undo: [], redo: [] })),
		save: vi.fn(),
		flushNow: vi.fn(async () => {}),
		remove: vi.fn(async () => {}),
	},
	events: [],
};

vi.mock("undo/journalStore", async (importActual) => ({
	...(await importActual<typeof import("undo/journalStore")>()),
	createJournalStore: vi.fn((deps: JournalStoreDeps) => {
		captured.storeDeps = deps;
		return captured.store;
	}),
}));

vi.mock("undo/undoJournal", async (importActual) => {
	const actual = await importActual<typeof import("undo/undoJournal")>();
	return {
		...actual,
		createUndoJournal: vi.fn((deps: UndoJournalDeps) => {
			const journal = actual.createUndoJournal(deps);
			captured.deps = deps;
			captured.journal = journal;
			for (const name of ["load", "flushNow", "dispose", "undo", "redo", "onRename", "onDelete", "pruneUnresolvable"] as const) {
				vi.spyOn(journal, name);
			}
			return journal;
		}),
	};
});

type Plugin = InstanceType<typeof import("main").default>;
const live: Plugin[] = [];

async function makePlugin(settings?: Record<string, unknown>): Promise<{ plugin: Plugin; app: App }> {
	const { default: StoryForgePlugin } = await import("main");
	const app = new App();
	const plugin = new StoryForgePlugin(app) as Plugin;
	if (settings) plugin.loadData.mockResolvedValue({ settings });
	live.push(plugin);
	return { plugin, app };
}

const journal = (): OwnedUndoJournal => {
	if (!captured.journal) throw new Error("no journal was created");
	return captured.journal;
};

// The first import of `main` pulls in the whole plugin; pay for it once, not inside a test.
beforeAll(async () => { await import("main"); }, 30_000);

afterEach(() => {
	for (const p of live.splice(0)) p._runCleanup();
	Notice._reset();
	captured.events.length = 0;
	captured.store.load.mockClear();
	vi.clearAllMocks();
});

describe("onload — journal and recorder", () => {
	it("creates the journal and installs it as the write recorder", async () => {
		const { plugin, app } = await makePlugin();
		await plugin.onload();
		expect(captured.journal).not.toBeNull();
		// A second install throws only while the plugin's recorder is active.
		expect(() => installWriteRecorder(app, journal())).toThrow(/already installed/);
	});

	it("uses the history file path under the plugin's directory", async () => {
		const { plugin } = await makePlugin();
		await plugin.onload();
		expect(captured.storeDeps?.path).toBe(".obsidian/plugins/story-forge/undo-journal.json");
	});

	it("loads the stored history before onload resolves", async () => {
		const { plugin } = await makePlugin();
		await plugin.onload();
		expect(journal().load).toHaveBeenCalledTimes(1);
		expect(captured.store.load).toHaveBeenCalledTimes(1);
	});

	it("persist follows settings.keepUndoHistory", async () => {
		const { plugin } = await makePlugin({ keepUndoHistory: false });
		await plugin.onload();
		expect(captured.deps?.persist()).toBe(false);
	});

	it("with persistence off nothing is loaded from the store", async () => {
		const { plugin } = await makePlugin({ keepUndoHistory: false });
		await plugin.onload();
		expect(captured.store.load).not.toHaveBeenCalled();
	});

	it("shows each outcome notice as a Notice", async () => {
		const { plugin } = await makePlugin();
		await plugin.onload();
		captured.deps?.notify("Undone: Mara");
		expect(Notice._instances.map((n) => n.message)).toContain("Undone: Mara");
	});

	it("load completes before onload returns, so a persistence toggle cannot overtake it", async () => {
		let release: () => void = () => {};
		captured.store.load.mockImplementationOnce(() => new Promise((r) => { release = () => r({ undo: [], redo: [] }); }));
		const { plugin } = await makePlugin();
		let done = false;
		const loading = plugin.onload().then(() => { done = true; });
		await new Promise((r) => setTimeout(r, 0));
		expect(done).toBe(false);
		release();
		await loading;
		expect(done).toBe(true);
	});
});

describe("vault events and layout-ready prune", () => {
	it("a vault rename reaches onRename with the file and its old path", async () => {
		const { plugin, app } = await makePlugin();
		await plugin.onload();
		const file = createMockTFile({ path: "b.md" });
		(app.vault as unknown as { _trigger: (e: string, ...a: unknown[]) => void })._trigger("rename", file, "a.md");
		expect(journal().onRename).toHaveBeenCalledWith(file, "a.md");
	});

	it("a vault delete reaches onDelete with the file", async () => {
		const { plugin, app } = await makePlugin();
		await plugin.onload();
		const file = createMockTFile({ path: "a.md" });
		(app.vault as unknown as { _trigger: (e: string, ...a: unknown[]) => void })._trigger("delete", file);
		expect(journal().onDelete).toHaveBeenCalledWith(file);
	});

	it("a failing onRename is absorbed with a warning", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const { plugin, app } = await makePlugin();
		await plugin.onload();
		vi.mocked(journal().onRename).mockRejectedValueOnce(new Error("boom"));
		(app.vault as unknown as { _trigger: (e: string, ...a: unknown[]) => void })._trigger("rename", createMockTFile({ path: "b.md" }), "a.md");
		await new Promise((r) => setTimeout(r, 0));
		expect(warn).toHaveBeenCalled();
		warn.mockRestore();
	});

	it("the vault listeners are released on unload", async () => {
		const { plugin, app } = await makePlugin();
		await plugin.onload();
		plugin._runCleanup();
		const reg = (app.vault as unknown as { _eventRegistrations: Map<string, unknown[]> })._eventRegistrations;
		expect(reg.get("rename") ?? []).toHaveLength(0);
		expect(reg.get("delete") ?? []).toHaveLength(0);
	});

	it("prunes unresolvable records only once the layout is ready", async () => {
		const { plugin, app } = await makePlugin();
		app.workspace._deferLayoutReady = true;
		await plugin.onload();
		expect(journal().pruneUnresolvable).not.toHaveBeenCalled();
		app.workspace._flushLayoutReady();
		expect(journal().pruneUnresolvable).toHaveBeenCalledTimes(1);
	});
});

describe("commands", () => {
	it("registers undo and redo with the exact names and no hotkeys", async () => {
		const { plugin } = await makePlugin();
		await plugin.onload();
		const undo = plugin._commands.get("story-forge:undo-last-change");
		const redo = plugin._commands.get("story-forge:redo-last-change");
		expect(undo?.name).toBe("Undo last change");
		expect(redo?.name).toBe("Redo last change");
		expect(undo).not.toHaveProperty("hotkeys");
		expect(redo).not.toHaveProperty("hotkeys");
	});

	it("the undo command calls journal.undo and the redo command journal.redo", async () => {
		const { plugin } = await makePlugin();
		await plugin.onload();
		const empty = (direction: "undo" | "redo") => ({ kind: "empty" as const, direction });
		vi.mocked(journal().undo).mockResolvedValue(empty("undo"));
		vi.mocked(journal().redo).mockResolvedValue(empty("redo"));
		plugin._commands.get("story-forge:undo-last-change")?.callback?.();
		plugin._commands.get("story-forge:redo-last-change")?.callback?.();
		await new Promise((r) => setTimeout(r, 0));
		expect(journal().undo).toHaveBeenCalledTimes(1);
		expect(journal().redo).toHaveBeenCalledTimes(1);
	});

	it.each([["undo-last-change", "undo"], ["redo-last-change", "redo"]] as const)(
		"%s warns and shows the unexpected-error notice (P1) instead of throwing when the journal rejects",
		async (id, method) => {
			const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
			const { plugin } = await makePlugin();
			await plugin.onload();
			vi.mocked(journal()[method]).mockRejectedValueOnce(new Error("boom"));
			plugin._commands.get(`story-forge:${id}`)?.callback?.();
			await new Promise((r) => setTimeout(r, 0));
			expect(warn).toHaveBeenCalled();
			expect(warn.mock.calls[0]?.[0]).toContain("[StoryForge]");
			expect(Notice._instances.map((n) => n.message)).toEqual([unexpectedErrorNotice(method)]);
			warn.mockRestore();
		},
	);
});

describe("views", () => {
	it("the Anvil view factory hands the view the journal: an open Anvil registers its flusher, closing releases it", async () => {
		const { plugin, app } = await makePlugin();
		await plugin.onload();
		const releases: string[] = [];
		const real = journal().registerFlusher.bind(journal());
		vi.spyOn(journal(), "registerFlusher").mockImplementation((f) => {
			const off = real(f);
			return () => { releases.push("flusher"); off(); };
		});
		const call = plugin.registerView.mock.calls.find((c: unknown[]) => c[0] === WORKSPACE_VIEW_TYPE);
		const leaf = new WorkspaceLeaf();
		(leaf as unknown as { app: App }).app = app;
		const view = (call![1] as (l: WorkspaceLeaf) => AnvilView)(leaf);
		await view.onOpen();
		expect(journal().registerFlusher).toHaveBeenCalledTimes(1);
		await view.onClose();
		expect(releases).toEqual(["flusher"]);
	});

	it("the Workbench view factory hands the view the journal: an open Workbench registers its probe, closing releases it", async () => {
		const { plugin, app } = await makePlugin();
		await plugin.onload();
		const releases: string[] = [];
		const real = journal().registerProbe.bind(journal());
		vi.spyOn(journal(), "registerProbe").mockImplementation((p) => {
			const off = real(p);
			return () => { releases.push("probe"); off(); };
		});
		const call = plugin.registerView.mock.calls.find((c: unknown[]) => c[0] === SIDEBAR_VIEW_TYPE);
		const leaf = new WorkspaceLeaf();
		leaf.app = app;
		const view = (call![1] as (l: WorkspaceLeaf) => SidebarView)(leaf);
		await view.onOpen();
		expect(journal().registerProbe).toHaveBeenCalledTimes(1);
		await view.onClose();
		expect(releases).toEqual(["probe"]);
	});
});

describe("shutdown", () => {
	function deferFlush(): { settle: () => void; order: string[] } {
		const order: string[] = [];
		let settle: () => void = () => {};
		vi.mocked(journal().flushNow).mockImplementation(() => new Promise<void>((r) => {
			order.push("flush:start");
			settle = () => { order.push("flush:end"); r(); };
		}));
		vi.mocked(journal().dispose).mockImplementation(() => { order.push("dispose"); });
		return { order, settle: () => settle() };
	}

	it("unload flushes first and disposes only after the flush settles", async () => {
		const { plugin } = await makePlugin();
		await plugin.onload();
		const f = deferFlush();
		plugin._runCleanup();
		// The flush starts once `settle` has resolved (T3.4), a few microtasks later.
		await new Promise((r) => setTimeout(r, 0));
		expect(f.order).toEqual(["flush:start"]);
		f.settle();
		await new Promise((r) => setTimeout(r, 0));
		expect(f.order).toEqual(["flush:start", "flush:end", "dispose"]);
	});

	it("unload still disposes when the flush rejects", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const { plugin } = await makePlugin();
		await plugin.onload();
		vi.mocked(journal().flushNow).mockRejectedValueOnce(new Error("disk"));
		plugin._runCleanup();
		await new Promise((r) => setTimeout(r, 0));
		expect(journal().dispose).toHaveBeenCalledTimes(1);
		warn.mockRestore();
	});

	it("unload uninstalls the recorder, so a second plugin can install its own", async () => {
		const first = await makePlugin();
		await first.plugin.onload();
		first.plugin._runCleanup();
		// The recorder stays installed until pending gestures have settled (T3.4).
		await new Promise((r) => setTimeout(r, 0));
		const second = await makePlugin();
		await expect(second.plugin.onload()).resolves.toBeUndefined();
	});

	it("registers a quit listener that adds the flush to the quit tasks", async () => {
		const { plugin, app } = await makePlugin();
		await plugin.onload();
		const f = deferFlush();
		const handlers = app.workspace._eventRegistrations.get("quit") ?? [];
		expect(handlers).toHaveLength(1);
		const tasks = new Tasks();
		handlers[0]!(tasks);
		expect(tasks.isEmpty()).toBe(false);
		await new Promise((r) => setTimeout(r, 0));
		expect(f.order).toEqual(["flush:start"]);
		let settled = false;
		void tasks.promise().then(() => { settled = true; });
		await new Promise((r) => setTimeout(r, 0));
		expect(settled).toBe(false);
		f.settle();
		await tasks.promise();
		expect(f.order).toEqual(["flush:start", "flush:end", "dispose"]);
	});

	it("quit followed by unload flushes once", async () => {
		const { plugin, app } = await makePlugin();
		await plugin.onload();
		const tasks = new Tasks();
		app.workspace._eventRegistrations.get("quit")![0]!(tasks);
		await tasks.promise();
		plugin._runCleanup();
		await new Promise((r) => setTimeout(r, 0));
		expect(journal().flushNow).toHaveBeenCalledTimes(1);
		expect(journal().dispose).toHaveBeenCalledTimes(1);
	});
});

describe("shutdown settles pending gestures before the save (spec 009 T3.4)", () => {
	const STATUS = { name: "status", type: "text" as const };
	const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

	/** Every call to the fake store, in order, with the snapshot each save handed over. */
	function storeLog(): { calls: string[]; persisted: () => JournalSnapshot | null } {
		const calls: string[] = [];
		let lastBeforeFlush: JournalSnapshot | null = null;
		let pending: JournalSnapshot | null = null;
		captured.store.save = vi.fn((s: JournalSnapshot) => { calls.push("save"); pending = structuredClone(s); });
		captured.store.flushNow = vi.fn(async () => { calls.push("flushNow"); lastBeforeFlush = pending; });
		return { calls, persisted: () => lastBeforeFlush };
	}

	async function pluginWithNote(): Promise<{ plugin: Plugin; app: App; file: ReturnType<typeof createMockTFile> }> {
		const { plugin, app } = await makePlugin();
		await plugin.onload();
		const file = createMockTFile({ path: "30 Scenes/Scene 7.md", basename: "Scene 7" });
		app.fileManager._setFrontmatter(file.path, { status: "draft" });
		vi.mocked(app.vault.getFileByPath).mockImplementation((p: string) => (p === file.path ? file : null));
		return { plugin, app, file };
	}

	const original = { save: captured.store.save, flushNow: captured.store.flushNow };
	afterEach(() => {
		captured.store.save = original.save;
		captured.store.flushNow = original.flushNow;
	});

	const persistedPaths = (s: JournalSnapshot | null): string[] =>
		(s?.undo ?? []).flatMap((step) => step.files.map((f) => f.path));

	it("a pending Kanban write at unload is flushed into the group and reaches the persisted journal", async () => {
		const log = storeLog();
		const { plugin, app, file } = await pluginWithNote();
		// A view's debounced Kanban write, still pending in an open gesture group.
		const group = journal().openGroup();
		journal().registerFlusher(async () => {
			await commit(app, file, "status", "revised", STATUS, { group });
			group.close();
		});
		plugin._runCleanup();
		for (let i = 0; i < 5; i++) await tick();
		expect(app.fileManager._getFrontmatter(file.path).status).toBe("revised");
		expect(log.calls.at(-1)).toBe("flushNow");
		expect(persistedPaths(log.persisted())).toEqual([file.path]);
		expect(journal().dispose).toHaveBeenCalledTimes(1);
	});

	it("a group a closed view still holds is waited for, so its late write is persisted too", async () => {
		vi.useFakeTimers();
		try {
			const log = storeLog();
			const { plugin, app, file } = await pluginWithNote();
			// No flusher: the view already closed and unregistered it; its flush is still in flight.
			const group = journal().openGroup();
			setTimeout(() => {
				void commit(app, file, "status", "revised", STATUS, { group }).finally(() => group.close());
			}, 5);
			plugin._runCleanup();
			await vi.advanceTimersByTimeAsync(30);
			expect(log.calls.at(-1)).toBe("flushNow");
			expect(persistedPaths(log.persisted())).toEqual([file.path]);
		} finally {
			vi.useRealTimers();
		}
	});

	it("quit settles too: the quit task covers the pending write", async () => {
		const log = storeLog();
		const { plugin, app, file } = await pluginWithNote();
		const group = journal().openGroup();
		journal().registerFlusher(async () => {
			await commit(app, file, "status", "revised", STATUS, { group });
			group.close();
		});
		const tasks = new Tasks();
		app.workspace._eventRegistrations.get("quit")![0]!(tasks);
		await tasks.promise();
		expect(persistedPaths(log.persisted())).toEqual([file.path]);
		plugin._runCleanup();
	});
});
