/**
 * frontmatterWriter journal hook — spec 009 T2.3.
 *
 * The recorder sees one report per successful write that changed a value,
 * `restore` is the unrecorded write path, and a second install throws.
 *
 * @ref SDD/ADR-44, ADR-45 — AC-F1.1, AC-F1.3, AC-F1.4, AC-F1.6, AC-F1.8
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { App, TFile } from "../__mocks__/obsidian";
import {
	commit,
	commitMany,
	installWriteRecorder,
	type CommitEntry,
	type WriteRecorder,
} from "inspector/frontmatterWriter";
import type { FieldChange, JournalGroup, Slot } from "../../src/undo/journalTypes";

const PATH = "20 Characters/Mara.md";
const present = (value: unknown): Slot => ({ present: true, value });
const ABSENT: Slot = { present: false };

type Call = { path: string; changes: readonly FieldChange[]; group: JournalGroup | undefined };

function setup(fm: Record<string, unknown> = {}) {
	const app = new App();
	const file = new TFile();
	file.path = PATH;
	app.fileManager._setFrontmatter(PATH, fm);
	const calls: Call[] = [];
	const recorder: WriteRecorder = { record: (path, changes, group) => void calls.push({ path, changes, group }) };
	const handle = installWriteRecorder(app, recorder);
	active.push(handle);
	return { app, file, calls, handle };
}

const active: { uninstall(): void }[] = [];
afterEach(() => {
	active.splice(0).forEach((h) => h.uninstall());
	vi.restoreAllMocks();
});

const entry = (key: string, value: unknown): CommitEntry => ({
	key,
	value,
	field: typeof value === "number" ? { name: key, type: "number" } : { name: key, type: "text" },
});

describe("recording a successful write", () => {
	it("records one report with before, after and presence", async () => {
		const { app, file, calls } = setup({ status: "draft" });
		await commit(app, file, "status", "final", { name: "status", type: "text" });
		expect(calls).toHaveLength(1);
		expect(calls[0]!.path).toBe(PATH);
		expect(calls[0]!.changes).toEqual([{ key: "status", before: present("draft"), after: present("final") }]);
	});

	it("marks a newly added key as absent before", async () => {
		const { app, file, calls } = setup({});
		await commit(app, file, "mood", "calm", { name: "mood", type: "text" });
		expect(calls[0]!.changes[0]!.before).toEqual(ABSENT);
	});

	it("after is the value the frontmatter holds after assignment, not the input", async () => {
		// The stand-in frontmatter rewrites what is assigned; after must follow it.
		// This is not a model of YAML reshaping (yamlValue tests cover that).
		const { app, file, calls } = setup({ k: "a" });
		vi.mocked(app.fileManager.processFrontMatter).mockImplementationOnce(
			async (_f: TFile, fn: (fm: Record<string, unknown>) => void) => {
				const stored: Record<string, unknown> = { k: "a" };
				const fm = new Proxy(stored, {
					set: (t, key: string, v: unknown) => ((t[key] = String(v).toUpperCase()), true),
				});
				fn(fm);
			},
		);
		await commit(app, file, "k", "b", { name: "k", type: "text" });
		expect(calls[0]!.changes[0]!.after).toEqual(present("B"));
	});

	it("does not duplicate changes when the callback runs twice", async () => {
		const { app, file, calls } = setup({ k: "a" });
		vi.mocked(app.fileManager.processFrontMatter).mockImplementationOnce(
			async (_f: TFile, fn: (fm: Record<string, unknown>) => void) => {
				fn({ k: "a" });
				fn({ k: "a" });
			},
		);
		await commit(app, file, "k", "b", { name: "k", type: "text" });
		expect(calls[0]!.changes).toHaveLength(1);
	});

	it("keeps a date-looking string a string in after", async () => {
		const { app, file, calls } = setup({});
		await commit(app, file, "when", "2024-01-05", { name: "when", type: "text" });
		expect(calls[0]!.changes[0]!.after).toEqual(present("2024-01-05"));
	});

	it("records nothing for undefined over an absent key", async () => {
		const { app, file, calls } = setup({});
		await commit(app, file, "k", undefined, { name: "k", type: "text" });
		expect(calls).toHaveLength(0);
	});

	it("records an undefined assignment over a present key as a removal", async () => {
		const { app, file, calls } = setup({ k: "a" });
		await commit(app, file, "k", undefined, { name: "k", type: "text" });
		expect(calls[0]!.changes).toEqual([{ key: "k", before: present("a"), after: ABSENT }]);
	});

	it("passes the group through", async () => {
		const { app, file, calls } = setup({ k: "a" });
		const group = { id: "g1" } as unknown as JournalGroup;
		await commit(app, file, "k", "b", { name: "k", type: "text" }, { group });
		await commitMany(app, file, [entry("k", "c")], { group });
		expect(calls.map((c) => c.group)).toEqual([group, group]);
	});

	it("passes undefined when no group is given", async () => {
		const { app, file, calls } = setup({ k: "a" });
		await commit(app, file, "k", "b", { name: "k", type: "text" });
		expect(calls[0]!.group).toBeUndefined();
	});

	it("is called after the write has landed", async () => {
		let seen: unknown;
		const { app, file, handle } = setup({ k: "a" });
		handle.uninstall();
		active.push(installWriteRecorder(app, { record: (p) => (seen = app.fileManager._getFrontmatter(p).k) }));
		await commit(app, file, "k", "b", { name: "k", type: "text" });
		expect(seen).toBe("b");
	});

	it("records an empty value as present, not absent", async () => {
		const listField = { name: "k", type: "list" } as const;
		const cases: [unknown, typeof listField | { name: string; type: "text" }][] = [
			["", { name: "k", type: "text" }],
			[null, { name: "k", type: "text" }],
			[[], listField],
		];
		for (const [value, field] of cases) {
			const { app, file, calls, handle } = setup({ k: "a" });
			await commit(app, file, "k", value, field);
			expect(calls[0]!.changes[0]!.after).toStrictEqual(present(value));
			handle.uninstall();
		}
	});

	it("records an empty string before as present", async () => {
		const { app, file, calls } = setup({ k: "" });
		await commit(app, file, "k", "x", { name: "k", type: "text" });
		expect(calls[0]!.changes[0]!.before).toStrictEqual(present(""));
	});
});

describe("writes that record nothing", () => {
	it("a validation rejection", async () => {
		const { app, file, calls } = setup({ n: 1 });
		const r = await commit(app, file, "n", "nope", { name: "n", type: "number" });
		expect(r.ok).toBe(false);
		expect(calls).toHaveLength(0);
	});

	it("a rejected processFrontMatter", async () => {
		const { app, file, calls } = setup({ k: "a" });
		// The callback runs (so changes are captured), then the save fails.
		vi.mocked(app.fileManager.processFrontMatter).mockImplementationOnce(
			async (_f: TFile, fn: (fm: Record<string, unknown>) => void) => {
				fn({ k: "a" });
				throw new Error("disk");
			},
		);
		const r = await commit(app, file, "k", "b", { name: "k", type: "text" });
		expect(r).toMatchObject({ ok: false, reason: "write" });
		expect(calls).toHaveLength(0);
	});

	it("an empty commitMany", async () => {
		const { app, file, calls } = setup();
		await commitMany(app, file, []);
		expect(calls).toHaveLength(0);
	});

	it("a no-op write", async () => {
		const { app, file, calls } = setup({ k: "a" });
		await commit(app, file, "k", "a", { name: "k", type: "text" });
		expect(calls).toHaveLength(0);
	});

	it("drops no-op keys from a mixed call", async () => {
		const { app, file, calls } = setup({ order: 10, status: "draft" });
		await commitMany(app, file, [entry("order", 10), entry("status", "final")]);
		expect(calls[0]!.changes.map((c) => c.key)).toEqual(["status"]);
	});

	it("a formatting-only difference", async () => {
		const { app, file, calls } = setup({ n: 1 });
		await commit(app, file, "n", 1.0, { name: "n", type: "number" });
		expect(calls).toHaveLength(0);
	});
});

describe("a failing recorder", () => {
	it("leaves the result ok and warns", async () => {
		const { app, file, handle } = setup({ k: "a" });
		handle.uninstall();
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		active.push(
			installWriteRecorder(app, {
				record: () => {
					throw new Error("boom");
				},
			}),
		);
		const r = await commit(app, file, "k", "b", { name: "k", type: "text" });
		expect(r).toEqual({ ok: true });
		expect(app.fileManager._getFrontmatter(PATH).k).toBe("b");
		expect(warn).toHaveBeenCalledWith(expect.stringContaining("[StoryForge]"), expect.anything());
	});
});

describe("without a recorder", () => {
	it("writes as before", async () => {
		const app = new App();
		const file = new TFile();
		file.path = PATH;
		const r = await commit(app, file, "k", "b", { name: "k", type: "text" });
		expect(r).toEqual({ ok: true });
		expect(app.fileManager._getFrontmatter(PATH).k).toBe("b");
	});
});

describe("restore", () => {
	it("writes targets, deletes a key whose target is absent, and returns the found slots", async () => {
		const { app, file, handle } = setup({ a: "1", b: "2" });
		const found = await handle.restore(file, [
			{ key: "a", target: present("9") },
			{ key: "b", target: ABSENT },
			{ key: "c", target: present("new") },
		]);
		expect(found).toEqual([present("1"), present("2"), ABSENT]);
		const fm = app.fileManager._getFrontmatter(PATH);
		expect(fm).toEqual({ a: "9", c: "new" });
		expect("b" in fm).toBe(false);
	});

	it("keeps a key whose target is an empty value", async () => {
		for (const value of ["", null, []]) {
			const { app, file, handle } = setup({ k: "a" });
			await handle.restore(file, [{ key: "k", target: present(value) }]);
			const fm = app.fileManager._getFrontmatter(PATH);
			expect("k" in fm).toBe(true);
			expect(fm.k).toStrictEqual(value);
			handle.uninstall();
		}
	});

	it("uses one processFrontMatter call per file", async () => {
		const { app, file, handle } = setup({ a: "1" });
		await handle.restore(file, [{ key: "a", target: present("2") }, { key: "b", target: present("3") }]);
		expect(app.fileManager.processFrontMatter).toHaveBeenCalledTimes(1);
	});

	it("records nothing", async () => {
		const { file, handle, calls } = setup({ a: "1" });
		await handle.restore(file, [{ key: "a", target: present("2") }]);
		expect(calls).toHaveLength(0);
	});

	it("writes the stored value as-is", async () => {
		const { app, file, handle } = setup({});
		const value = { x: [1, 2] };
		await handle.restore(file, [{ key: "o", target: present(value) }]);
		expect(app.fileManager._getFrontmatter(PATH).o).toBe(value);
	});

	it("returns one found slot per op when the callback reruns", async () => {
		const { app, file, handle } = setup({ a: "1", b: "2" });
		vi.mocked(app.fileManager.processFrontMatter).mockImplementationOnce(
			async (_file: TFile, fn: (fm: Record<string, unknown>) => void) => {
				const fm = app.fileManager._getFrontmatter(PATH);
				fn(fm);
				fn(fm);
			},
		);
		const found = await handle.restore(file, [
			{ key: "a", target: present("9") },
			{ key: "b", target: ABSENT },
		]);
		expect(found).toHaveLength(2);
	});

	it("lets a rejection through to the caller", async () => {
		const { app, file, handle } = setup({ a: "1" });
		vi.mocked(app.fileManager.processFrontMatter).mockRejectedValueOnce(new Error("disk"));
		await expect(handle.restore(file, [{ key: "a", target: ABSENT }])).rejects.toThrow("disk");
	});
});

describe("installWriteRecorder", () => {
	it("throws on a second install", () => {
		const { app } = setup();
		expect(() => installWriteRecorder(app, { record: () => {} })).toThrow(/already installed/);
	});

	it("uninstall restores the plain path and allows a new install", async () => {
		const { app, file, calls, handle } = setup({ k: "a" });
		handle.uninstall();
		await commit(app, file, "k", "b", { name: "k", type: "text" });
		expect(calls).toHaveLength(0);
		active.push(installWriteRecorder(app, { record: () => {} }));
	});

	it("a stale uninstall does not remove a newer recorder", async () => {
		const { app, file, handle } = setup({ k: "a" });
		handle.uninstall();
		const calls2: string[] = [];
		active.push(installWriteRecorder(app, { record: (p) => void calls2.push(p) }));
		handle.uninstall();
		await commit(app, file, "k", "b", { name: "k", type: "text" });
		expect(calls2).toEqual([PATH]);
	});
});

describe("a journal failure never fails the write", () => {
	// A value the journal cannot normalise: stringifyYaml reads toJSON and it throws.
	const unnormalisable = [{ toJSON: () => { throw new Error("cannot serialise"); } }];

	it("still writes and returns ok, warns, and records nothing when capture throws", async () => {
		const { app, file, calls } = setup({ status: "draft" });
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const result = await commitMany(app, file, [
			entry("status", "final"),
			{ key: "odd", value: unnormalisable, field: { name: "odd", type: "list" } },
		]);
		expect(result).toEqual({ ok: true });
		expect(app.fileManager._getFrontmatter(PATH).status).toBe("final");
		expect(app.fileManager._getFrontmatter(PATH).odd).toBe(unnormalisable);
		expect(calls).toHaveLength(0);
		expect(warn).toHaveBeenCalledWith(expect.stringContaining("[StoryForge]"), expect.anything());
	});
});
