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

import { describe, it, expect, vi, afterEach } from "vitest";
import { App, Notice, Tasks, createMockTFile } from "obsidian";
import type { OwnedUndoJournal, UndoJournalDeps } from "undo/undoJournal";
import type { JournalStoreDeps } from "undo/journalStore";
import type { JournalStore } from "undo/journalTypes";
import { installWriteRecorder } from "inspector/frontmatterWriter";

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
		expect(undo?.name).toBe("Undo last Story Forge change");
		expect(redo?.name).toBe("Redo last Story Forge change");
		expect(undo).not.toHaveProperty("hotkeys");
		expect(redo).not.toHaveProperty("hotkeys");
	});

	it("the undo command calls journal.undo and the redo command journal.redo", async () => {
		const { plugin } = await makePlugin();
		await plugin.onload();
		plugin._commands.get("story-forge:undo-last-change")?.callback?.();
		plugin._commands.get("story-forge:redo-last-change")?.callback?.();
		expect(journal().undo).toHaveBeenCalledTimes(1);
		expect(journal().redo).toHaveBeenCalledTimes(1);
	});

	it.each([["undo-last-change", "undo"], ["redo-last-change", "redo"]] as const)(
		"%s warns instead of throwing when the journal rejects",
		async (id, method) => {
			const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
			const { plugin } = await makePlugin();
			await plugin.onload();
			vi.mocked(journal()[method]).mockRejectedValueOnce(new Error("boom"));
			plugin._commands.get(`story-forge:${id}`)?.callback?.();
			await new Promise((r) => setTimeout(r, 0));
			expect(warn).toHaveBeenCalled();
			expect(Notice._instances.length).toBeGreaterThan(0);
			warn.mockRestore();
		},
	);
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
		await Promise.resolve();
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
		expect(f.order).toEqual(["flush:start"]);
		let settled = false;
		void tasks.promise().then(() => { settled = true; });
		await Promise.resolve();
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
