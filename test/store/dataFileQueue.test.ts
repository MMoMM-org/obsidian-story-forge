/**
 * T2.2 – one save queue for every read-modify-write of data.json.
 *
 * The fake port defers each load/save by a macrotask so two updates started back to back would
 * interleave (both load the old blob, the second save drops the first change) unless the queue
 * chains them.
 */

import { describe, expect, it } from "vitest";
import { createDataFile } from "../../src/store/dataFileQueue";
import type { PluginDataPort } from "../../src/store/types";

const tick = (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, 0); });

function deferredPort(initial: unknown = {}): PluginDataPort & { data: unknown; failNextSave: boolean } {
	let data: unknown = structuredClone(initial);
	let failNextSave = false;
	return {
		get data() { return data; },
		get failNextSave() { return failNextSave; },
		set failNextSave(v: boolean) { failNextSave = v; },
		async load() {
			await tick();
			return structuredClone(data);
		},
		async save(d: unknown) {
			await tick();
			if (failNextSave) {
				failNextSave = false;
				throw new Error("disk full");
			}
			data = structuredClone(d);
		},
	};
}

describe("createDataFile", () => {
	it("keeps both changes when settings and views are saved concurrently", async () => {
		const port = deferredPort({});
		const file = createDataFile(port);

		await Promise.all([
			file.update((d) => { d.settings = { fileClassesFolder: "fc" } as never; }),
			file.update((d) => { d.views = { a: { source: "x" } as never }; }),
		]);

		expect(port.data).toEqual({ settings: { fileClassesFolder: "fc" }, views: { a: { source: "x" } } });
	});

	it("keeps both changes when views and artifacts are saved concurrently", async () => {
		const port = deferredPort({ views: {} });
		const file = createDataFile(port);

		await Promise.all([
			file.update((d) => { d.views = { b: { source: "y" } as never }; }),
			file.update((d) => { (d as Record<string, unknown>)["artifacts"] = { "t.md": { checksum: "c" } }; }),
		]);

		expect(port.data).toEqual({ views: { b: { source: "y" } }, artifacts: { "t.md": { checksum: "c" } } });
	});

	it("rejects only the caller whose save failed; the next update still runs", async () => {
		const port = deferredPort({});
		const file = createDataFile(port);
		port.failNextSave = true;

		const first = file.update((d) => { d.views = { lost: {} as never }; });
		const second = file.update((d) => { d.settings = { fileClassesFolder: "kept" } as never; });

		await expect(first).rejects.toThrow("disk full");
		await expect(second).resolves.toBeUndefined();
		expect(port.data).toEqual({ settings: { fileClassesFolder: "kept" } });
	});

	it("rejects the caller whose mutator throws without saving, and keeps the queue moving", async () => {
		const port = deferredPort({ views: {} });
		const file = createDataFile(port);

		const bad = file.update(() => { throw new Error("bad mutator"); });
		const good = file.update((d) => { d.views = { ok: {} as never }; });

		await expect(bad).rejects.toThrow("bad mutator");
		await good;
		expect(port.data).toEqual({ views: { ok: {} } });
	});

	it("keeps unknown top-level keys through an update", async () => {
		const port = deferredPort({ future: { x: 1 }, views: {} });
		const file = createDataFile(port);

		await file.update((d) => { d.views = {}; d.settings = {} as never; });

		expect(port.data).toEqual({ future: { x: 1 }, views: {}, settings: {} });
	});

	it("treats a missing or non-object blob as empty", async () => {
		for (const initial of [null, undefined, [], "x"]) {
			const port = deferredPort(initial);
			const file = createDataFile(port);
			expect(await file.read()).toEqual({});
		}
	});

	it("read() returns the contents after pending updates", async () => {
		const port = deferredPort({ settings: { fileClassesFolder: "old" } });
		const file = createDataFile(port);

		const pending = file.update((d) => { d.views = { v: {} as never }; });
		const seen = await file.read();
		await pending;

		expect(seen).toEqual({ settings: { fileClassesFolder: "old" }, views: { v: {} } });
	});
});

describe("StoryForgePlugin data.json writers", () => {
	it("a settings save and a view save started together both persist", async () => {
		const { App } = await import("obsidian");
		const { default: StoryForgePlugin } = await import("../../src/main");
		const { ViewStore } = await import("../../src/store/ViewStore");
		const port = deferredPort({ settings: {}, future: 1 });
		const plugin = new StoryForgePlugin(new App());
		plugin.loadData.mockImplementation(async () => (await port.load()) ?? {});
		plugin.saveData.mockImplementation((d: unknown) => port.save(d));
		const views = new ViewStore(plugin.dataFile);
		plugin.settings = { ...plugin.settings, fileClassesFolder: "Mine" };

		await Promise.all([
			plugin.saveSettings(),
			views.setRecord("v1", { source: "s" } as never),
			plugin.dataFile.update((d) => { (d as Record<string, unknown>)["artifacts"] = { a: 1 }; }),
		]);

		const saved = port.data as Record<string, unknown> & { settings: { fileClassesFolder: string } };
		expect(saved.settings.fileClassesFolder).toBe("Mine");
		expect(saved["views"]).toEqual({ v1: { source: "s" } });
		expect(saved["artifacts"]).toEqual({ a: 1 });
		expect(saved["future"]).toBe(1);
	});
});
