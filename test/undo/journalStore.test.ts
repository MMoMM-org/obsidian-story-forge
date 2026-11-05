/**
 * JournalStore — the undo-journal.json file (spec 009 T2.6).
 *
 * Round trip, strict validation, the 1 MiB cap, the 1 s debounce, flush and
 * remove, all through an in-memory adapter and fake timers.
 *
 * @ref SDD/Data Storage Changes, ADR-40, ADR-48 — AC-F7.2, AC-F7.5, AC-F7.6, AC-F7.7
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createJournalStore, MAX_FILE_CHARS, undoJournalPath } from "undo/journalStore";
import type { FileChanges, JournalSnapshot, Step } from "undo/journalTypes";
import { ABSENT, EMPTY, present } from "./journalHarness";

const PATH = ".obsidian/plugins/story-forge/undo-journal.json";

function memAdapter(initial?: string) {
	const files = new Map<string, string>(initial === undefined ? [] : [[PATH, initial]]);
	return {
		files,
		exists: vi.fn((p: string) => Promise.resolve(files.has(p))),
		read: vi.fn((p: string) => (files.has(p) ? Promise.resolve(files.get(p)!) : Promise.reject(new Error("ENOENT")))),
		write: vi.fn((p: string, data: string) => { files.set(p, data); return Promise.resolve(); }),
		remove: vi.fn((p: string) => { files.delete(p); return Promise.resolve(); }),
	};
}

function storeOn(adapter: ReturnType<typeof memAdapter>, now = () => 5_000) {
	return createJournalStore({ adapter, path: PATH, now });
}

function change(key: string, before: unknown, after: unknown): FileChanges["changes"][number] {
	return { key, before: before === undefined ? ABSENT : present(before), after: present(after) };
}

function step(id: string, over: Partial<Step> = {}): Step {
	return { id, at: 1, persist: true, files: [{ path: "a.md", changes: [change("status", "alive", "dead")] }], ...over };
}

function bigStep(id: string, chars: number): Step {
	return step(id, { files: [{ path: "a.md", changes: [change("k", "x", "y".repeat(chars))] }] });
}

const written = (a: ReturnType<typeof memAdapter>): Record<string, unknown> => JSON.parse(a.files.get(PATH)!) as Record<string, unknown>;

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("JournalStore — round trip", () => {
	it("restores both stacks in order, with absent and empty slots told apart", async () => {
		const a = memAdapter();
		const snap: JournalSnapshot = {
			undo: [step("u-1-1"), step("u-2-2", { files: [{ path: "b.md", changes: [{ key: "k", before: ABSENT, after: present("") }, change("n", null, []) ] }] })],
			redo: [step("u-3-3"), step("u-4-4")],
		};
		const s = storeOn(a);
		s.save(snap);
		await s.flushNow();
		expect(await storeOn(a).load()).toEqual(snap);
	});

	it("writes the SDD file shape: version 1, savedAt, {} for absent and {v} for present", async () => {
		const a = memAdapter();
		const s = storeOn(a, () => 7_777);
		s.save({ undo: [step("u-1-1", { files: [{ path: "a.md", changes: [{ key: "k", before: ABSENT, after: present(null) }] }] })], redo: [] });
		await s.flushNow();
		expect(written(a)).toEqual({
			version: 1, savedAt: 7_777, redo: [],
			undo: [{ id: "u-1-1", at: 1, files: [{ path: "a.md", changes: [{ key: "k", before: {}, after: { v: null } }] }] }],
		});
	});

	it("does not write the persist flag; loaded steps are persistable", async () => {
		const a = memAdapter();
		const s = storeOn(a);
		s.save({ undo: [step("u-1-1")], redo: [] });
		await s.flushNow();
		expect(JSON.stringify(written(a))).not.toContain("persist");
		expect((await storeOn(a).load()).undo[0]!.persist).toBe(true);
	});
});

describe("JournalStore — a bad file gives an empty snapshot and one warning", () => {
	const good = { id: "u-1-1", at: 1, files: [{ path: "a.md", changes: [{ key: "k", before: {}, after: { v: 1 } }] }] };
	const file = (over: Record<string, unknown>): string => JSON.stringify({ version: 1, savedAt: 1, undo: [good], redo: [], ...over });
	const withStep = (s: unknown): string => file({ undo: [s] });

	const bad: Record<string, string> = {
		"invalid JSON": "{not json",
		"a JSON array": "[]",
		"a wrong version": file({ version: 2 }),
		"a missing version": JSON.stringify({ undo: [], redo: [] }),
		"undo not an array": file({ undo: {} }),
		"redo missing": JSON.stringify({ version: 1, undo: [] }),
		"a step id that is not a string": withStep({ ...good, id: 5 }),
		"a step at that is not a number": withStep({ ...good, at: "1" }),
		"a step without files": withStep({ ...good, files: [] }),
		"a path that is not a string": withStep({ ...good, files: [{ path: 3, changes: good.files[0]!.changes }] }),
		"an empty path": withStep({ ...good, files: [{ path: "", changes: good.files[0]!.changes }] }),
		"a step at that overflows to Infinity": file({}).replace('"at":1', '"at":1e999'),
		"a file without changes": withStep({ ...good, files: [{ path: "a.md", changes: [] }] }),
		"a key that is not a string": withStep({ ...good, files: [{ path: "a.md", changes: [{ key: 1, before: {}, after: {} }] }] }),
		"a slot that is not an object": withStep({ ...good, files: [{ path: "a.md", changes: [{ key: "k", before: "x", after: {} }] }] }),
		"a slot with a stray field": withStep({ ...good, files: [{ path: "a.md", changes: [{ key: "k", before: { v: 1, x: 2 }, after: {} }] }] }),
		"a slot with neither shape": withStep({ ...good, files: [{ path: "a.md", changes: [{ key: "k", before: { w: 1 }, after: {} }] }] }),
		"a duplicate step id": file({ undo: [good], redo: [good] }),
	};

	it.each(Object.entries(bad))("%s", async (_name, content) => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		expect(await storeOn(memAdapter(content)).load()).toEqual(EMPTY);
		expect(warn).toHaveBeenCalledTimes(1);
		expect(String(warn.mock.calls[0]![0])).toContain("[StoryForge]");
	});

	it("a good file passes the same checks", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		expect((await storeOn(memAdapter(file({}))).load()).undo).toHaveLength(1);
		expect(warn).not.toHaveBeenCalled();
	});

	it("a missing file is empty and silent", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		expect(await storeOn(memAdapter()).load()).toEqual(EMPTY);
		expect(warn).not.toHaveBeenCalled();
	});

	it("an unreadable file is empty with a warning, not a throw", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const a = memAdapter(file({}));
		a.read.mockRejectedValueOnce(new Error("EIO"));
		expect(await storeOn(a).load()).toEqual(EMPTY);
		expect(warn).toHaveBeenCalledTimes(1);
	});
});

describe("JournalStore — what is persisted", () => {
	it("leaves out steps with persist: false and keeps the rest in order", async () => {
		const a = memAdapter();
		const s = storeOn(a);
		s.save({ undo: [step("u-1-1"), step("u-2-2", { persist: false }), step("u-3-3")], redo: [step("u-4-4", { persist: false })] });
		await s.flushNow();
		const loaded = await storeOn(a).load();
		expect(loaded.undo.map((x) => x.id)).toEqual(["u-1-1", "u-3-3"]);
		expect(loaded.redo).toEqual([]);
	});

	it("over 1 MiB, the oldest steps are omitted: undo is kept before redo, newest first", async () => {
		const a = memAdapter();
		const s = storeOn(a);
		const chunk = 300_000;
		s.save({
			undo: [bigStep("u-1-1", chunk), bigStep("u-2-2", chunk)],
			redo: [bigStep("u-3-3", chunk), bigStep("u-4-4", chunk)],
		});
		await s.flushNow();
		const text = a.files.get(PATH)!;
		expect(text.length).toBeLessThanOrEqual(MAX_FILE_CHARS);
		const loaded = await storeOn(a).load();
		expect(loaded.undo.map((x) => x.id)).toEqual(["u-1-1", "u-2-2"]);
		expect(loaded.redo.map((x) => x.id)).toEqual(["u-4-4"]);
	});

	it("stops at the first step that does not fit, even if an older one would", async () => {
		const a = memAdapter();
		const s = storeOn(a);
		s.save({ undo: [step("u-1-1"), bigStep("u-2-2", MAX_FILE_CHARS), step("u-3-3")], redo: [] });
		await s.flushNow();
		expect((await storeOn(a).load()).undo.map((x) => x.id)).toEqual(["u-3-3"]);
	});

	it("once an undo step is left out, redo is left out too", async () => {
		const a = memAdapter();
		const s = storeOn(a);
		s.save({ undo: [bigStep("u-1-1", MAX_FILE_CHARS), step("u-2-2")], redo: [step("u-3-3")] });
		await s.flushNow();
		const loaded = await storeOn(a).load();
		expect(loaded.undo.map((x) => x.id)).toEqual(["u-2-2"]);
		expect(loaded.redo).toEqual([]);
	});

	it("keeps a file of exactly the cap", async () => {
		const a = memAdapter();
		const s = storeOn(a);
		s.save({ undo: [bigStep("u-1-1", 1000)], redo: [] });
		await s.flushNow();
		const base = a.files.get(PATH)!.length;
		const fill = 1000 + (MAX_FILE_CHARS - base);
		s.save({ undo: [bigStep("u-1-1", fill)], redo: [] });
		await s.flushNow();
		expect(a.files.get(PATH)!.length).toBe(MAX_FILE_CHARS);
		expect((await storeOn(a).load()).undo).toHaveLength(1);
		s.save({ undo: [bigStep("u-1-1", fill + 1)], redo: [] });
		await s.flushNow();
		expect((await storeOn(a).load()).undo).toHaveLength(0);
	});
});

describe("JournalStore — saving", () => {
	it("debounces: nothing before 1 s, one write after, reset by each save", async () => {
		const a = memAdapter();
		const s = storeOn(a);
		s.save({ undo: [step("u-1-1")], redo: [] });
		await vi.advanceTimersByTimeAsync(900);
		s.save({ undo: [step("u-1-1"), step("u-2-2")], redo: [] });
		await vi.advanceTimersByTimeAsync(900);
		expect(a.write).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(100);
		expect(a.write).toHaveBeenCalledTimes(1);
		expect((await storeOn(a).load()).undo).toHaveLength(2);
	});

	it("flushNow writes the pending snapshot at once, and the timer does not write again", async () => {
		const a = memAdapter();
		const s = storeOn(a);
		s.save({ undo: [step("u-1-1")], redo: [] });
		await s.flushNow();
		expect(a.write).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(5_000);
		expect(a.write).toHaveBeenCalledTimes(1);
	});

	it("flushNow with nothing pending writes nothing", async () => {
		const a = memAdapter();
		await storeOn(a).flushNow();
		expect(a.write).not.toHaveBeenCalled();
	});

	it("flushNow waits for a write already in flight", async () => {
		const a = memAdapter();
		let release: () => void = () => undefined;
		a.write.mockImplementationOnce((p: string, d: string) => new Promise<void>((r) => { release = () => { a.files.set(p, d); r(); }; }));
		const s = storeOn(a);
		s.save({ undo: [step("u-1-1")], redo: [] });
		await vi.advanceTimersByTimeAsync(1_000);
		let done = false;
		void s.flushNow().then(() => { done = true; });
		await vi.advanceTimersByTimeAsync(0);
		expect(done).toBe(false);
		release();
		await vi.advanceTimersByTimeAsync(0);
		expect(done).toBe(true);
	});

	it("a failing write warns and does not throw; the next save still writes", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const a = memAdapter();
		a.write.mockRejectedValueOnce(new Error("EACCES"));
		const s = storeOn(a);
		s.save({ undo: [step("u-1-1")], redo: [] });
		await expect(s.flushNow()).resolves.toBeUndefined();
		expect(warn).toHaveBeenCalledTimes(1);
		s.save({ undo: [step("u-2-2")], redo: [] });
		await s.flushNow();
		expect((await storeOn(a).load()).undo[0]!.id).toBe("u-2-2");
	});
});

describe("JournalStore — a save that cannot be serialised", () => {
	const unserialisable = (): Step => step("u-1-1", { files: [{ path: "a.md", changes: [change("k", "x", BigInt(1))] }] });

	it("warns once and does not throw; later saves, flushes and removes still work", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const a = memAdapter();
		const s = storeOn(a);
		s.save({ undo: [unserialisable()], redo: [] });
		await expect(s.flushNow()).resolves.toBeUndefined();
		expect(warn).toHaveBeenCalledTimes(1);
		expect(String(warn.mock.calls[0]![0])).toContain("[StoryForge]");
		expect(a.write).not.toHaveBeenCalled();
		s.save({ undo: [step("u-2-2")], redo: [] });
		await s.flushNow();
		expect((await storeOn(a).load()).undo[0]!.id).toBe("u-2-2");
		await s.remove();
		expect(a.files.has(PATH)).toBe(false);
	});
});

describe("JournalStore — remove", () => {
	it("deletes the file", async () => {
		const a = memAdapter("{}");
		await storeOn(a).remove();
		expect(a.files.has(PATH)).toBe(false);
	});

	it("does nothing when there is no file", async () => {
		const a = memAdapter();
		await storeOn(a).remove();
		expect(a.remove).not.toHaveBeenCalled();
	});

	it("cancels a scheduled save, so the file does not come back", async () => {
		const a = memAdapter();
		const s = storeOn(a);
		s.save({ undo: [step("u-1-1")], redo: [] });
		await s.remove();
		await vi.advanceTimersByTimeAsync(5_000);
		await s.flushNow();
		expect(a.files.has(PATH)).toBe(false);
	});

	it("waits for a write in flight, then deletes", async () => {
		const a = memAdapter();
		let release: () => void = () => undefined;
		a.write.mockImplementationOnce((p: string, d: string) => new Promise<void>((r) => { release = () => { a.files.set(p, d); r(); }; }));
		const s = storeOn(a);
		s.save({ undo: [step("u-1-1")], redo: [] });
		await vi.advanceTimersByTimeAsync(1_000);
		const removed = s.remove();
		release();
		await removed;
		expect(a.files.has(PATH)).toBe(false);
	});

	it("a failing remove warns and does not throw", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const a = memAdapter("{}");
		a.remove.mockRejectedValueOnce(new Error("EBUSY"));
		await expect(storeOn(a).remove()).resolves.toBeUndefined();
		expect(warn).toHaveBeenCalledTimes(1);
	});
});

describe("undoJournalPath", () => {
	it("is manifest.dir/undo-journal.json", () => {
		expect(undoJournalPath({ id: "story-forge", dir: ".obsidian/plugins/story-forge" }, ".obsidian"))
			.toBe(".obsidian/plugins/story-forge/undo-journal.json");
	});

	it("falls back to configDir/plugins/id when dir is undefined", () => {
		expect(undoJournalPath({ id: "story-forge" }, ".config")).toBe(".config/plugins/story-forge/undo-journal.json");
	});

	it("normalises the path", () => {
		expect(undoJournalPath({ id: "x", dir: ".obsidian\\plugins//x" }, ".obsidian")).toBe(".obsidian/plugins/x/undo-journal.json");
	});
});
