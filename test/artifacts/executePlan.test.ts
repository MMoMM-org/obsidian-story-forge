/**
 * T2.6 – executePlan: run a setup plan through the managed writer, recording each write.
 *
 * Real managedFileWriter over the in-memory vault, real ArtifactStore over the shared data.json
 * queue with a fake port.
 *
 * @ref SDD/Primary Flow (step 5), SDD/Error Handling
 * @ref PRD/F2.8 (missing folders created), PRD/F4 Rule 5 (partial failure never claims a write),
 *      PRD/F5.8 (files name the folders configured at setup)
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { App, wireMemoryVault, type MemoryVault } from "obsidian";
import { executePlan } from "../../src/artifacts/executePlan";
import { ArtifactStore } from "../../src/artifacts/ArtifactStore";
import type {
	ArtifactEntry,
	ArtifactFolders,
	ArtifactRecord,
	ArtifactSet,
	PlanAction,
	PlanItem,
} from "../../src/artifacts/artifactTypes";
import { resolvePlaceholders } from "../../src/artifacts/resolvePlaceholders";
import { computeChecksum } from "../../src/consent/checksum";
import { createDataFile } from "../../src/store/dataFileQueue";
import type { PluginDataPort } from "../../src/store/types";
import { editedRefusal, occupiedRefusal } from "../../src/vault/managedFileWriter";

const folders: ArtifactFolders = {
	fileClassesFolder: "Story/Classes",
	templatesFolder: "Story/Templates",
	schemaFolder: "Story/Schema",
};
const VERSION = "1.2.3";

const SOURCE = "---\nfileClass: x\n---\nsee {{sf:schemaFolder}} and {{title}}\n";
const RESOLVED = "---\nfileClass: x\n---\nsee Story/Schema and {{title}}\n";
const OLD_RESOLVED = "---\nfileClass: x\n---\nold\n";

const FOLDER: Record<ArtifactSet, string> = {
	fileclasses: folders.fileClassesFolder,
	templates: folders.templatesFolder,
	schema: folders.schemaFolder,
};

async function entry(name: string, set: ArtifactSet = "fileclasses", source = SOURCE): Promise<ArtifactEntry> {
	return {
		id: `${set}/${name}`,
		set,
		relPath: name,
		source,
		checksum: await computeChecksum(source),
		placeholders: ["schemaFolder"],
	};
}

function item(e: ArtifactEntry, action: PlanAction, note?: string, path = `${FOLDER[e.set]}/${e.relPath}`): PlanItem {
	return note === undefined ? { entry: e, path, action } : { entry: e, path, action, note };
}

interface Port extends PluginDataPort {
	data: unknown;
	failNextSave: boolean;
}

function fakePort(initial: unknown = {}): Port {
	let data: unknown = structuredClone(initial);
	const port: Port = {
		get data() { return data; },
		failNextSave: false,
		async load() { return structuredClone(data); },
		async save(d: unknown) {
			if (port.failNextSave) {
				port.failNextSave = false;
				throw new Error("disk full");
			}
			data = structuredClone(d);
		},
	};
	return port;
}

let app: App;
let mem: MemoryVault;
let port: Port;
let store: ArtifactStore;

beforeEach(async () => {
	app = new App();
	mem = wireMemoryVault(app);
	port = fakePort();
	store = new ArtifactStore(createDataFile(port));
	await store.load();
});

const run = (plan: PlanItem[]) => executePlan(plan, folders, { app, store, pluginVersion: VERSION });

/** Records as persisted in data.json (not the in-memory cache). */
async function persisted(): Promise<Record<string, ArtifactRecord>> {
	const fresh = new ArtifactStore(createDataFile(port));
	return fresh.load();
}

function addFolders(...paths: string[]): void {
	for (const p of paths) {
		const parts = p.split("/");
		for (let i = 1; i <= parts.length; i++) mem.folders.add(parts.slice(0, i).join("/"));
	}
}

describe("executePlan — writes and records", () => {
	it("creates missing folders and writes a create item resolved with the plan's folders", async () => {
		const e = await entry("fc-a.md");
		const result = await run([item(e, "create")]);

		expect(result).toEqual({ written: ["Story/Classes/fc-a.md"], skipped: [], failed: [] });
		expect(mem.folders.has("Story")).toBe(true);
		expect(mem.folders.has("Story/Classes")).toBe(true);
		expect(mem.files.get("Story/Classes/fc-a.md")).toBe(resolvePlaceholders(SOURCE, folders));
		expect(mem.files.get("Story/Classes/fc-a.md")).toBe(RESOLVED);
	});

	it("records path, source and instance checksums, params and plugin version", async () => {
		const e = await entry("fc-a.md");
		await run([item(e, "create")]);

		expect((await persisted())[e.id]).toEqual({
			path: "Story/Classes/fc-a.md",
			sourceChecksum: e.checksum,
			instanceChecksum: await computeChecksum(RESOLVED),
			params: folders,
			pluginVersion: VERSION,
		});
	});

	it("writes create, update and missing items in plan order, each record saved right after its write", async () => {
		const a = await entry("fc-a.md");
		const b = await entry("fc-b.md");
		const c = await entry("fc-c.md");
		addFolders("Story/Classes");
		mem.files.set("Story/Classes/fc-b.md", OLD_RESOLVED);
		const old = { path: "", sourceChecksum: `sha256:${"0".repeat(64)}`, instanceChecksum: await computeChecksum(OLD_RESOLVED), params: folders, pluginVersion: "0.1.0" };
		await store.setRecord(b.id, { ...old, path: "Story/Classes/fc-b.md" });
		await store.setRecord(c.id, { ...old, path: "Story/Classes/fc-c.md" });

		const events: string[] = [];
		const create = vi.mocked(app.vault.create).getMockImplementation()!;
		const process = vi.mocked(app.vault.process).getMockImplementation()!;
		vi.mocked(app.vault.create).mockImplementation(async (p, d) => { events.push(`write ${p}`); return create(p, d); });
		vi.mocked(app.vault.process).mockImplementation(async (f, fn) => { events.push(`write ${f.path}`); return process(f, fn); });
		const save = port.save.bind(port);
		port.save = async (d: unknown) => {
			const recs = (d as { artifacts: Record<string, ArtifactRecord> }).artifacts;
			events.push(`record ${Object.keys(recs).filter((id) => recs[id]?.pluginVersion === VERSION).sort().join(",")}`);
			await save(d);
		};

		const result = await run([item(c, "missing"), item(a, "create"), item(b, "update")]);

		expect(result.written).toEqual(["Story/Classes/fc-c.md", "Story/Classes/fc-a.md", "Story/Classes/fc-b.md"]);
		expect(events).toEqual([
			"write Story/Classes/fc-c.md",
			`record ${c.id}`,
			"write Story/Classes/fc-a.md",
			`record ${[a.id, c.id].sort().join(",")}`,
			"write Story/Classes/fc-b.md",
			`record ${[a.id, b.id, c.id].sort().join(",")}`,
		]);
		expect(mem.files.get("Story/Classes/fc-b.md")).toBe(RESOLVED);
		expect(mem.files.get("Story/Classes/fc-c.md")).toBe(RESOLVED);
		expect((await persisted())[b.id]?.instanceChecksum).toBe(await computeChecksum(RESOLVED));
	});

	it("writes a missing item at its record path, not the current folder", async () => {
		const e = await entry("fc-a.md");
		await store.setRecord(e.id, { path: "Old/fc-a.md", sourceChecksum: e.checksum, instanceChecksum: e.checksum, params: folders, pluginVersion: "0.1.0" });
		const result = await run([item(e, "missing", "setting now points to Story/Classes", "Old/fc-a.md")]);

		expect(result.written).toEqual(["Old/fc-a.md"]);
		expect(mem.files.get("Old/fc-a.md")).toBe(RESOLVED);
		expect((await persisted())[e.id]?.path).toBe("Old/fc-a.md");
	});
});

describe("executePlan — skipped items", () => {
	it("skips every non-writing action with its reason and writes nothing", async () => {
		const up = await entry("up.md");
		const exists = await entry("exists.md");
		const edited = await entry("edited.md");
		const unreadable = await entry("unreadable.md");
		const refused = await entry("refused.md");
		const plan = [
			item(up, "up-to-date"),
			item(exists, "skip-exists"),
			item(edited, "skip-edited"),
			item(unreadable, "unreadable", "EACCES"),
			item(refused, "refused", "checksum mismatch"),
		];

		const result = await run(plan);

		expect(result).toEqual({
			written: [],
			failed: [],
			skipped: [
				{ path: "Story/Classes/up.md", reason: "up to date" },
				{ path: "Story/Classes/exists.md", reason: occupiedRefusal("Story/Classes/exists.md", "Not installed") },
				{ path: "Story/Classes/edited.md", reason: editedRefusal("Story/Classes/edited.md", "Not updated") },
				{ path: "Story/Classes/unreadable.md", reason: "EACCES" },
				{ path: "Story/Classes/refused.md", reason: "checksum mismatch" },
			],
		});
		expect(mem.files.size).toBe(0);
		expect(mem.folders.size).toBe(0);
		expect(await persisted()).toEqual({});
	});

	it("keeps an up-to-date item's note", async () => {
		const e = await entry("up.md");
		const result = await run([item(e, "up-to-date", "setting now points to X")]);
		expect(result.skipped).toEqual([{ path: "Story/Classes/up.md", reason: "up to date; setting now points to X" }]);
	});

	it("refuses (fails closed) an entry whose source no longer matches its checksum", async () => {
		const e = { ...(await entry("fc-a.md")), source: "tampered" };
		const result = await run([item(e, "create")]);
		expect(result.skipped).toEqual([{ path: "Story/Classes/fc-a.md", reason: "checksum mismatch" }]);
		expect(mem.files.size).toBe(0);
	});

	it("does not overwrite a file that appeared at a create path after planning", async () => {
		const e = await entry("fc-a.md");
		addFolders("Story/Classes");
		mem.files.set("Story/Classes/fc-a.md", "mine");

		const result = await run([item(e, "create")]);

		expect(result.skipped).toEqual([{ path: "Story/Classes/fc-a.md", reason: occupiedRefusal("Story/Classes/fc-a.md", "Not installed") }]);
		expect(result.written).toEqual([]);
		expect(mem.files.get("Story/Classes/fc-a.md")).toBe("mine");
		expect(await persisted()).toEqual({});
	});

	it("never adopts a file with identical bytes at a create path (PRD Rule 2)", async () => {
		const e = await entry("fc-a.md");
		addFolders("Story/Classes");
		mem.files.set("Story/Classes/fc-a.md", RESOLVED);

		const result = await run([item(e, "create")]);

		expect(result.skipped).toEqual([{ path: "Story/Classes/fc-a.md", reason: occupiedRefusal("Story/Classes/fc-a.md", "Not installed") }]);
		expect(await persisted()).toEqual({});
	});

	it("does not replace a file edited since planning (update re-verified)", async () => {
		const e = await entry("fc-a.md");
		addFolders("Story/Classes");
		mem.files.set("Story/Classes/fc-a.md", "edited after planning");
		await store.setRecord(e.id, { path: "Story/Classes/fc-a.md", sourceChecksum: `sha256:${"0".repeat(64)}`, instanceChecksum: await computeChecksum(OLD_RESOLVED), params: folders, pluginVersion: "0.1.0" });

		const result = await run([item(e, "update")]);

		expect(result.skipped).toEqual([{ path: "Story/Classes/fc-a.md", reason: editedRefusal("Story/Classes/fc-a.md", "Not updated") }]);
		expect(mem.files.get("Story/Classes/fc-a.md")).toBe("edited after planning");
		expect((await persisted())[e.id]?.pluginVersion).toBe("0.1.0");
	});
});

describe("executePlan — failures", () => {
	it("a write failure leaves earlier items written and recorded, reports the path, records nothing for it", async () => {
		const a = await entry("fc-a.md");
		const b = await entry("fc-b.md");
		const c = await entry("fc-c.md");
		const create = vi.mocked(app.vault.create).getMockImplementation()!;
		vi.mocked(app.vault.create).mockImplementation(async (p, d) => {
			if (p === "Story/Classes/fc-b.md") throw new Error("EIO");
			return create(p, d);
		});

		const result = await run([item(a, "create"), item(b, "create"), item(c, "create")]);

		expect(result.written).toEqual(["Story/Classes/fc-a.md", "Story/Classes/fc-c.md"]);
		expect(result.failed).toEqual([{ path: "Story/Classes/fc-b.md", reason: "Not installed: could not write Story/Classes/fc-b.md: EIO" }]);
		const recs = await persisted();
		expect(Object.keys(recs).sort()).toEqual([a.id, c.id].sort());
		expect(mem.files.has("Story/Classes/fc-b.md")).toBe(false);
	});

	it("a record failure trashes the file it created and reports the item failed", async () => {
		const a = await entry("fc-a.md");
		const b = await entry("fc-b.md");
		const result = await (async () => {
			const save = port.save.bind(port);
			let calls = 0;
			port.save = async (d: unknown) => {
				calls++;
				if (calls === 2) throw new Error("disk full");
				await save(d);
			};
			return run([item(a, "create"), item(b, "create")]);
		})();

		expect(result.written).toEqual(["Story/Classes/fc-a.md"]);
		expect(result.failed).toEqual([{ path: "Story/Classes/fc-b.md", reason: "Not installed: could not record Story/Classes/fc-b.md: disk full" }]);
		expect(mem.files.has("Story/Classes/fc-b.md")).toBe(false);
		expect(mem.files.get("Story/Classes/fc-a.md")).toBe(RESOLVED);
		expect(Object.keys(await persisted())).toEqual([a.id]);
	});

	it("a record failure restores the file an update replaced", async () => {
		const e = await entry("fc-a.md");
		addFolders("Story/Classes");
		mem.files.set("Story/Classes/fc-a.md", OLD_RESOLVED);
		await store.setRecord(e.id, { path: "Story/Classes/fc-a.md", sourceChecksum: `sha256:${"0".repeat(64)}`, instanceChecksum: await computeChecksum(OLD_RESOLVED), params: folders, pluginVersion: "0.1.0" });
		port.failNextSave = true;

		const result = await run([item(e, "update")]);

		expect(result.failed).toEqual([{ path: "Story/Classes/fc-a.md", reason: "Not updated: could not record Story/Classes/fc-a.md: disk full" }]);
		expect(result.written).toEqual([]);
		expect(mem.files.get("Story/Classes/fc-a.md")).toBe(OLD_RESOLVED);
		expect((await persisted())[e.id]?.pluginVersion).toBe("0.1.0");
	});

	it("a folder creation failure fails that set's items only; other sets proceed", async () => {
		const fc1 = await entry("fc-a.md", "fileclasses");
		const tpl = await entry("tpl.md", "templates");
		const fc2 = await entry("fc-b.md", "fileclasses");
		const up = await entry("fc-up.md", "fileclasses");
		addFolders("Story");
		mem.files.set("Story/Classes", "a file where the folder should be");

		const result = await run([item(fc1, "create"), item(tpl, "create"), item(fc2, "create"), item(up, "up-to-date")]);

		expect(result.written).toEqual(["Story/Templates/tpl.md"]);
		expect(result.failed).toEqual([
			{ path: "Story/Classes/fc-a.md", reason: "Not installed: could not create folder Story/Classes: Story/Classes is a file" },
			{ path: "Story/Classes/fc-b.md", reason: "Not installed: could not create folder Story/Classes: Story/Classes is a file" },
		]);
		expect(result.skipped).toEqual([{ path: "Story/Classes/fc-up.md", reason: "up to date" }]);
		expect(Object.keys(await persisted())).toEqual([tpl.id]);
	});

	it("a file created at the path between the occupancy check and create is not overwritten and fails", async () => {
		const e = await entry("fc-a.md");
		const create = vi.mocked(app.vault.create).getMockImplementation()!;
		vi.mocked(app.vault.create).mockImplementation(async (p, d) => {
			if (p === "Story/Classes/fc-a.md") mem.files.set(p, "raced in");
			return create(p, d);
		});

		const result = await run([item(e, "create")]);

		expect(result.written).toEqual([]);
		expect(result.failed).toEqual([{ path: "Story/Classes/fc-a.md", reason: "Not installed: could not write Story/Classes/fc-a.md: File already exists." }]);
		expect(mem.files.get("Story/Classes/fc-a.md")).toBe("raced in");
		expect(await persisted()).toEqual({});
	});

	it("a file that appears after the occupancy check is rejected by create, never overwritten, and fails", async () => {
		const e = await entry("fc-a.md");
		addFolders("Story/Classes");
		const lookup = vi.mocked(app.vault.getAbstractFileByPath).getMockImplementation()!;
		let seen = 0;
		vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((p) => {
			const found = lookup(p);
			if (p === "Story/Classes/fc-a.md" && ++seen === 1) mem.files.set(p, "raced in");
			return found;
		});

		const result = await run([item(e, "create")]);

		expect(result.written).toEqual([]);
		expect(result.failed).toEqual([{ path: "Story/Classes/fc-a.md", reason: "Not installed: could not write Story/Classes/fc-a.md: File already exists." }]);
		expect(mem.files.get("Story/Classes/fc-a.md")).toBe("raced in");
		expect(vi.mocked(app.vault.process)).not.toHaveBeenCalled();
		expect(vi.mocked(app.fileManager.trashFile)).not.toHaveBeenCalled();
		expect(await persisted()).toEqual({});
	});

	it("an update whose file changes inside the write is restored and reported so", async () => {
		const e = await entry("fc-a.md");
		addFolders("Story/Classes");
		mem.files.set("Story/Classes/fc-a.md", OLD_RESOLVED);
		await store.setRecord(e.id, { path: "Story/Classes/fc-a.md", sourceChecksum: `sha256:${"0".repeat(64)}`, instanceChecksum: await computeChecksum(OLD_RESOLVED), params: folders, pluginVersion: "0.1.0" });
		const process = vi.mocked(app.vault.process).getMockImplementation()!;
		vi.mocked(app.vault.process).mockImplementationOnce(async (f, fn) => {
			mem.files.set(f.path, "raced in");
			return process(f, fn);
		});

		const result = await run([item(e, "update")]);

		expect(result.written).toEqual([]);
		expect(result.failed).toEqual([{ path: "Story/Classes/fc-a.md", reason: "Not updated: Story/Classes/fc-a.md changed while updating; it was left as it was." }]);
		expect(mem.files.get("Story/Classes/fc-a.md")).toBe("raced in");
		expect((await persisted())[e.id]?.pluginVersion).toBe("0.1.0");
	});

	it("an update race whose undo fails reports the undo failure, not that the file was left as it was", async () => {
		const e = await entry("fc-a.md");
		addFolders("Story/Classes");
		mem.files.set("Story/Classes/fc-a.md", OLD_RESOLVED);
		await store.setRecord(e.id, { path: "Story/Classes/fc-a.md", sourceChecksum: `sha256:${"0".repeat(64)}`, instanceChecksum: await computeChecksum(OLD_RESOLVED), params: folders, pluginVersion: "0.1.0" });
		const process = vi.mocked(app.vault.process).getMockImplementation()!;
		vi.mocked(app.vault.process)
			.mockImplementationOnce(async (f, fn) => {
				mem.files.set(f.path, "raced in");
				return process(f, fn);
			})
			.mockImplementationOnce(async () => { throw new Error("EBUSY"); });

		const result = await run([item(e, "update")]);

		expect(result.written).toEqual([]);
		expect(result.failed).toEqual([{ path: "Story/Classes/fc-a.md", reason: "Not updated: Story/Classes/fc-a.md changed while updating; undoing the write failed: EBUSY" }]);
		expect(result.failed[0]?.reason).not.toMatch(/left as it was/);
		expect((await persisted())[e.id]?.pluginVersion).toBe("0.1.0");
	});

	it("a missing item whose own parent folder cannot be created fails with a folder reason; its set's other items proceed", async () => {
		const lost = await entry("fc-lost.md");
		const ok = await entry("fc-ok.md");
		await store.setRecord(lost.id, { path: "Old/Sub/fc-lost.md", sourceChecksum: lost.checksum, instanceChecksum: lost.checksum, params: folders, pluginVersion: "0.1.0" });
		mem.files.set("Old", "a file where the folder should be");

		const result = await run([item(lost, "missing", undefined, "Old/Sub/fc-lost.md"), item(ok, "create")]);

		expect(result.failed).toEqual([{ path: "Old/Sub/fc-lost.md", reason: "Not installed: could not create folder Old/Sub: Old is a file" }]);
		expect(result.written).toEqual(["Story/Classes/fc-ok.md"]);
		expect(mem.files.get("Old")).toBe("a file where the folder should be");
		expect(Object.keys(await persisted()).sort()).toEqual([lost.id, ok.id].sort());
		expect((await persisted())[lost.id]?.pluginVersion).toBe("0.1.0");
	});

	it("creates no configured folder when the only item is a missing one elsewhere", async () => {
		const e = await entry("fc-a.md");
		await store.setRecord(e.id, { path: "Old/fc-a.md", sourceChecksum: e.checksum, instanceChecksum: e.checksum, params: folders, pluginVersion: "0.1.0" });

		const result = await run([item(e, "missing", undefined, "Old/fc-a.md")]);

		expect(result.written).toEqual(["Old/fc-a.md"]);
		expect([...mem.folders].sort()).toEqual(["Old"]);
	});

	it("an update in a set whose configured folder cannot be created still updates", async () => {
		const fresh = await entry("fc-new.md");
		const upd = await entry("fc-upd.md");
		addFolders("Story", "Elsewhere");
		mem.files.set("Story/Classes", "a file where the folder should be");
		mem.files.set("Elsewhere/fc-upd.md", OLD_RESOLVED);
		await store.setRecord(upd.id, { path: "Elsewhere/fc-upd.md", sourceChecksum: `sha256:${"0".repeat(64)}`, instanceChecksum: await computeChecksum(OLD_RESOLVED), params: folders, pluginVersion: "0.1.0" });

		const result = await run([item(fresh, "create"), item(upd, "update", undefined, "Elsewhere/fc-upd.md")]);

		expect(result.failed).toEqual([{ path: "Story/Classes/fc-new.md", reason: "Not installed: could not create folder Story/Classes: Story/Classes is a file" }]);
		expect(result.written).toEqual(["Elsewhere/fc-upd.md"]);
		expect(mem.files.get("Elsewhere/fc-upd.md")).toBe(RESOLVED);
		expect((await persisted())[upd.id]?.pluginVersion).toBe(VERSION);
	});

	it("fails an update whose file vanished since planning, recording nothing", async () => {
		const e = await entry("fc-a.md");
		const rec = { path: "Story/Classes/fc-a.md", sourceChecksum: `sha256:${"0".repeat(64)}`, instanceChecksum: await computeChecksum(OLD_RESOLVED), params: folders, pluginVersion: "0.1.0" };
		await store.setRecord(e.id, rec);

		const result = await run([item(e, "update")]);

		expect(result.failed).toEqual([{ path: "Story/Classes/fc-a.md", reason: "Not updated: Story/Classes/fc-a.md no longer exists" }]);
		expect(mem.files.size).toBe(0);
		expect((await persisted())[e.id]).toEqual(rec);
	});

	it("never throws: an unresolvable placeholder fails that item only", async () => {
		const bad = await entry("bad.md", "fileclasses", "{{sf:nope}}");
		const ok = await entry("ok.md");
		const result = await run([item(bad, "create"), item(ok, "create")]);
		expect(result.failed).toEqual([{ path: "Story/Classes/bad.md", reason: "Not installed: Unknown artifact placeholder(s): nope" }]);
		expect(result.written).toEqual(["Story/Classes/ok.md"]);
	});
});
