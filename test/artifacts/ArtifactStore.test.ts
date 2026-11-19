/**
 * T2.3 – ArtifactStore: install records kept in data.json "artifacts".
 */

import { describe, expect, it, vi } from "vitest";
import { ArtifactStore } from "../../src/artifacts/ArtifactStore";
import type { ArtifactRecord } from "../../src/artifacts/artifactTypes";
import { createDataFile } from "../../src/store/dataFileQueue";
import type { PluginDataPort } from "../../src/store/types";
import { ViewStore } from "../../src/store/ViewStore";

vi.mock("bases/BasesAdapter", () => ({
	registerCodexView: vi.fn(() => false),
	isBasesAvailable: vi.fn(() => false),
	getBasesCapability: vi.fn(() => "disabled"),
}));

const tick = (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, 0); });
const HASH_A = `sha256:${"a".repeat(64)}`;
const HASH_B = `sha256:${"b".repeat(64)}`;

function fakePort(initial: unknown = {}): PluginDataPort & { data: unknown; saveCount: number } {
	let data: unknown = structuredClone(initial);
	let saveCount = 0;
	return {
		get data() { return data; },
		set data(v: unknown) { data = structuredClone(v); },
		get saveCount() { return saveCount; },
		async load() { await tick(); return structuredClone(data); },
		async save(d: unknown) { await tick(); saveCount++; data = structuredClone(d); },
	};
}

function record(over: Record<string, unknown> = {}): ArtifactRecord {
	return {
		path: "00 Meta/FileClasses/fc-scene.md",
		sourceChecksum: HASH_A,
		instanceChecksum: HASH_B,
		params: { fileClassesFolder: "fc", templatesFolder: "tpl", schemaFolder: "sch" },
		pluginVersion: "0.1.0",
		...over,
	} as ArtifactRecord;
}

async function loadWith(artifacts: unknown) {
	const port = fakePort({ artifacts });
	const store = new ArtifactStore(createDataFile(port));
	return store.load();
}

describe("ArtifactStore.load", () => {
	it("populates get and all, and a second load picks up external changes", async () => {
		const port = fakePort({ artifacts: { a: record() } });
		const store = new ArtifactStore(createDataFile(port));
		expect(store.all()).toEqual({});
		await store.load();
		expect(store.get("a")).toEqual(record());
		expect(store.all()).toEqual({ a: record() });
		port.data = { artifacts: { b: record({ path: "p" }) } };
		await store.load();
		expect(store.get("a")).toBeUndefined();
		expect(store.get("b")).toEqual(record({ path: "p" }));
		expect(Object.keys(store.all())).toEqual(["b"]);
	});

	it("reads a missing artifacts key as {}", async () => {
		expect(await loadWith(undefined)).toEqual({});
	});

	it("reads a non-object artifacts value as {}", async () => {
		expect(await loadWith([record()])).toEqual({});
		expect(await loadWith("x")).toEqual({});
	});

	it("keeps a valid record", async () => {
		expect(await loadWith({ "fileclass/fc-scene": record() })).toEqual({ "fileclass/fc-scene": record() });
	});

	const bad: Array<[string, Record<string, unknown>]> = [
		["missing path", { path: undefined }],
		["non-string path", { path: 5 }],
		["missing sourceChecksum", { sourceChecksum: undefined }],
		["non-sha256 sourceChecksum", { sourceChecksum: "md5:abc" }],
		["short sourceChecksum", { sourceChecksum: "sha256:abc" }],
		["uppercase sourceChecksum", { sourceChecksum: `sha256:${"A".repeat(64)}` }],
		["missing instanceChecksum", { instanceChecksum: undefined }],
		["non-string instanceChecksum", { instanceChecksum: 7 }],
		["non-sha256 instanceChecksum", { instanceChecksum: "md5:abc" }],
		["params missing a folder key", { params: { fileClassesFolder: "a", templatesFolder: "b" } }],
		["params with an extra key", { params: { fileClassesFolder: "a", templatesFolder: "b", schemaFolder: "c", extra: "d" } }],
		["non-string params value", { params: { fileClassesFolder: "a", templatesFolder: 3, schemaFolder: "c" } }],
		["params not an object", { params: "x" }],
		["missing pluginVersion", { pluginVersion: undefined }],
		["non-string pluginVersion", { pluginVersion: 1 }],
	];

	it.each(bad)("drops an entry with %s and keeps a valid sibling", async (_name, over) => {
		const loaded = await loadWith({ bad: record(over), good: record() });
		expect(Object.keys(loaded)).toEqual(["good"]);
	});

	it("drops a non-object entry", async () => {
		const loaded = await loadWith({ a: null, b: "x", c: [record()], good: record() });
		expect(Object.keys(loaded)).toEqual(["good"]);
	});

	it("does not keep unknown top-level fields on a record", async () => {
		const loaded = await loadWith({ a: record({ junk: 1 }) });
		expect(loaded["a"]).toEqual(record());
	});
});

describe("ArtifactStore writes", () => {
	it("setRecord persists and leaves settings and views untouched", async () => {
		const port = fakePort({ settings: { s: 1 }, views: { v: { source: "x" } }, other: true });
		const store = new ArtifactStore(createDataFile(port));
		await store.setRecord("template/scene", record());
		const data = port.data as Record<string, unknown>;
		expect(data["artifacts"]).toEqual({ "template/scene": record() });
		expect(data["settings"]).toEqual({ s: 1 });
		expect(data["views"]).toEqual({ v: { source: "x" } });
		expect(data["other"]).toBe(true);
	});

	it("never writes records under views", async () => {
		const port = fakePort({});
		const store = new ArtifactStore(createDataFile(port));
		await store.setRecord("template/scene", record());
		expect((port.data as Record<string, unknown>)["views"]).toBeUndefined();
	});

	it("deleteRecord removes only that record and persists", async () => {
		const port = fakePort({ artifacts: { a: record(), b: record({ path: "p" }) } });
		const store = new ArtifactStore(createDataFile(port));
		await store.deleteRecord("a");
		expect(Object.keys((port.data as { artifacts: object }).artifacts)).toEqual(["b"]);
		expect(Object.keys(store.all())).toEqual(["b"]);
	});

	it("deleteRecord of an absent id is a safe no-op", async () => {
		const port = fakePort({});
		const store = new ArtifactStore(createDataFile(port));
		await expect(store.deleteRecord("nope")).resolves.toBeUndefined();
		expect(port.saveCount).toBe(1);
	});

	it("get and all reflect the latest load or write", async () => {
		const port = fakePort({});
		const store = new ArtifactStore(createDataFile(port));
		expect(store.get("a")).toBeUndefined();
		await store.setRecord("a", record());
		expect(store.get("a")).toEqual(record());
		expect(store.all()).toEqual({ a: record() });
	});

	it("drops malformed siblings when it rewrites the map", async () => {
		const port = fakePort({ artifacts: { bad: { path: 1 } } });
		const store = new ArtifactStore(createDataFile(port));
		await store.setRecord("a", record());
		expect(Object.keys((port.data as { artifacts: object }).artifacts)).toEqual(["a"]);
	});

	it("keeps both changes when a record and a view are written concurrently", async () => {
		const port = fakePort({});
		const file = createDataFile(port);
		const store = new ArtifactStore(file);
		const views = new ViewStore(file);
		await Promise.all([
			store.setRecord("a", record()),
			views.setRecord("v", { source: "x" } as never),
		]);
		const data = port.data as { artifacts: object; views: object };
		expect(Object.keys(data.artifacts)).toEqual(["a"]);
		expect(Object.keys(data.views)).toEqual(["v"]);
	});
});

describe("ArtifactStore.onChange", () => {
	it("notifies after setRecord and deleteRecord, and stops after unsubscribe", async () => {
		const store = new ArtifactStore(createDataFile(fakePort({})));
		const listener = vi.fn();
		const off = store.onChange(listener);
		await store.setRecord("a", record());
		expect(listener).toHaveBeenCalledTimes(1);
		await store.deleteRecord("a");
		expect(listener).toHaveBeenCalledTimes(2);
		off();
		await store.setRecord("b", record());
		expect(listener).toHaveBeenCalledTimes(2);
	});

	it("does not notify when the write fails", async () => {
		const port = fakePort({});
		const store = new ArtifactStore(createDataFile(port));
		await store.setRecord("a", record());
		port.save = () => Promise.reject(new Error("disk full"));
		const listener = vi.fn();
		store.onChange(listener);
		await expect(store.setRecord("b", record({ path: "p" }))).rejects.toThrow("disk full");
		expect(listener).not.toHaveBeenCalled();
		expect(store.get("b")).toBeUndefined();
		expect(store.all()).toEqual({ a: record() });
	});

	it("a throwing listener does not reject the write or starve later listeners", async () => {
		const port = fakePort({});
		const store = new ArtifactStore(createDataFile(port));
		const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
		const next = vi.fn();
		store.onChange(() => { throw new Error("boom"); });
		store.onChange(next);
		await expect(store.setRecord("a", record())).resolves.toBeUndefined();
		expect(next).toHaveBeenCalledTimes(1);
		expect(spy).toHaveBeenCalledWith(expect.stringContaining("[StoryForge]"), expect.any(Error));
		expect((port.data as { artifacts: object }).artifacts).toEqual({ a: record() });
		spy.mockRestore();
	});
});
