/**
 * Tests for planSetup (src/artifacts/planSetup.ts) — the pure per-file
 * decision table for setup and update of shipped vault artifacts.
 *
 * @ref SDD/Application Data Models — planSetup decision table
 * @ref PRD/F4 (F4.1, F4.3, F4.4, F4.5, F4.6), PRD/F3.4
 */

import { describe, it, expect } from "vitest";
import { planSetup } from "../../src/artifacts/planSetup";
import { computeChecksum } from "../../src/consent/checksum";
import type {
	ArtifactEntry,
	ArtifactFileRead,
	ArtifactFolders,
	ArtifactIndex,
	ArtifactRecord,
	ArtifactRecords,
	ArtifactSet,
	PlanAction,
} from "../../src/artifacts/artifactTypes";

const folders: ArtifactFolders = {
	fileClassesFolder: "Story/Classes",
	templatesFolder: "Story/Templates",
	schemaFolder: "Story/Schema",
};

const ALL_SETS: ArtifactSet[] = ["fileclasses", "templates", "schema"];

const SOURCE = "---\nfileClass: x\n---\nsee {{sf:schemaFolder}}\n";
const RESOLVED = "---\nfileClass: x\n---\nsee Story/Schema\n";
const OLD_SOURCE = "---\nfileClass: x\n---\nold {{sf:schemaFolder}}\n";
const OLD_RESOLVED = "---\nfileClass: x\n---\nold Story/Schema\n";
const EDITED = "---\nfileClass: x\n---\nmy own edit\n";

async function entry(over: Partial<ArtifactEntry> = {}): Promise<ArtifactEntry> {
	const source = over.source ?? SOURCE;
	return {
		id: "fileclasses/fc-character.md",
		set: "fileclasses",
		relPath: "fc-character.md",
		source,
		checksum: await computeChecksum(source),
		placeholders: ["schemaFolder"],
		...over,
	};
}

async function record(
	e: ArtifactEntry,
	installedSource: string,
	writtenBytes: string,
	path = "Story/Classes/fc-character.md",
): Promise<ArtifactRecord> {
	return {
		path,
		sourceChecksum: await computeChecksum(installedSource),
		instanceChecksum: await computeChecksum(writtenBytes),
		params: folders,
		pluginVersion: "0.1.0",
	};
}

/** In-memory vault: path → read result; unknown paths are absent. */
function fakeVault(files: Record<string, ArtifactFileRead>) {
	const reads: string[] = [];
	const readFile = (path: string): Promise<ArtifactFileRead> => {
		reads.push(path);
		return Promise.resolve(files[path] ?? { kind: "absent" });
	};
	return { readFile, reads };
}

const index = (...entries: ArtifactEntry[]): ArtifactIndex => ({ version: "1", entries });
const content = (text: string): ArtifactFileRead => ({ kind: "content", text });

const TARGET = "Story/Classes/fc-character.md";

interface Row {
	name: string;
	/** Source installed + bytes written for the record; null = no record. */
	recorded: [string, string] | null;
	file: ArtifactFileRead | null;
	action: PlanAction;
}

const rows: Row[] = [
	{ name: "no record, target free → create", recorded: null, file: null, action: "create" },
	{
		name: "no record, target occupied → skip-exists",
		recorded: null,
		file: content(EDITED),
		action: "skip-exists",
	},
	{
		name: "record, file missing → missing",
		recorded: [SOURCE, RESOLVED],
		file: null,
		action: "missing",
	},
	{
		name: "record, shipped equals record source → up-to-date",
		recorded: [SOURCE, RESOLVED],
		file: content(RESOLVED),
		action: "up-to-date",
	},
	{
		name: "record, shipped differs, file unedited → update",
		recorded: [OLD_SOURCE, OLD_RESOLVED],
		file: content(OLD_RESOLVED),
		action: "update",
	},
	{
		name: "record, shipped differs, file edited → skip-edited",
		recorded: [OLD_SOURCE, OLD_RESOLVED],
		file: content(EDITED),
		action: "skip-edited",
	},
	{
		name: "record, read fails → unreadable",
		recorded: [SOURCE, RESOLVED],
		file: { kind: "unreadable", reason: "EACCES" },
		action: "unreadable",
	},
	{
		name: "no record, read fails → unreadable",
		recorded: null,
		file: { kind: "unreadable", reason: "EACCES" },
		action: "unreadable",
	},
];

describe("planSetup decision table", () => {
	it.each(rows)("$name", async ({ recorded, file, action }) => {
		const e = await entry();
		const records: ArtifactRecords = recorded
			? { [e.id]: await record(e, recorded[0], recorded[1]) }
			: {};
		const { readFile } = fakeVault(file ? { [TARGET]: file } : {});

		const plan = await planSetup(index(e), records, readFile, folders, ALL_SETS);

		expect(plan).toHaveLength(1);
		expect(plan[0]?.action).toBe(action);
		expect(plan[0]?.path).toBe(TARGET);
		expect(plan[0]?.entry).toBe(e);
	});

	it("reports the read failure reason on an unreadable item", async () => {
		const e = await entry();
		const { readFile } = fakeVault({ [TARGET]: { kind: "unreadable", reason: "EACCES" } });
		const [item] = await planSetup(index(e), {}, readFile, folders, ALL_SETS);
		expect(item?.note).toContain("EACCES");
	});
});

describe("planSetup edge cases", () => {
	it("never claims a file it did not write, even with identical bytes (PRD Rule 2)", async () => {
		const e = await entry();
		const { readFile } = fakeVault({ [TARGET]: content(RESOLVED) });
		const [item] = await planSetup(index(e), {}, readFile, folders, ALL_SETS);
		expect(item?.action).toBe("skip-exists");
	});

	it("marks a skip-exists file whose bytes equal the resolved shipped copy as sameContent (R1)", async () => {
		const e = await entry();
		const { readFile } = fakeVault({ [TARGET]: content(RESOLVED) });
		const [item] = await planSetup(index(e), {}, readFile, folders, ALL_SETS);
		expect(item).toMatchObject({ action: "skip-exists", sameContent: true });
	});

	it("marks a skip-exists file with other bytes as not sameContent (R1)", async () => {
		const e = await entry();
		const { readFile } = fakeVault({ [TARGET]: content(EDITED) });
		const [item] = await planSetup(index(e), {}, readFile, folders, ALL_SETS);
		expect(item).toMatchObject({ action: "skip-exists", sameContent: false });
	});

	it("compares with the resolved copy, not the raw source with its placeholders (R1)", async () => {
		const e = await entry();
		const { readFile } = fakeVault({ [TARGET]: content(SOURCE) });
		const [item] = await planSetup(index(e), {}, readFile, folders, ALL_SETS);
		expect(item).toMatchObject({ action: "skip-exists", sameContent: false });
	});

	it("sets sameContent only on skip-exists items", async () => {
		const e = await entry();
		const records = { [e.id]: await record(e, SOURCE, RESOLVED) };
		const { readFile } = fakeVault({ [TARGET]: content(RESOLVED) });
		const [upToDate] = await planSetup(index(e), records, readFile, folders, ALL_SETS);
		const [created] = await planSetup(index(e), {}, fakeVault({}).readFile, folders, ALL_SETS);
		expect(upToDate).not.toHaveProperty("sameContent");
		expect(created).not.toHaveProperty("sameContent");
	});

	it("targets the record path, not the current setting, and notes the new setting", async () => {
		const e = await entry();
		const oldPath = "Old/Classes/fc-character.md";
		const records = { [e.id]: await record(e, SOURCE, RESOLVED, oldPath) };
		const { readFile, reads } = fakeVault({ [oldPath]: content(RESOLVED) });

		const [item] = await planSetup(index(e), records, readFile, folders, ALL_SETS);

		expect(item?.path).toBe(oldPath);
		expect(item?.action).toBe("up-to-date");
		expect(item?.note).toBe("setting now points to Story/Classes");
		expect(reads).toEqual([oldPath]);
	});

	it("reports a moved file as missing at the record path, not created at the new setting", async () => {
		const e = await entry();
		const oldPath = "Old/Classes/fc-character.md";
		const records = { [e.id]: await record(e, SOURCE, RESOLVED, oldPath) };
		const { readFile } = fakeVault({});

		const [item] = await planSetup(index(e), records, readFile, folders, ALL_SETS);

		expect(item?.action).toBe("missing");
		expect(item?.path).toBe(oldPath);
	});

	it("carries no note when the record path equals the current target", async () => {
		const e = await entry();
		const records = { [e.id]: await record(e, SOURCE, RESOLVED) };
		const { readFile } = fakeVault({ [TARGET]: content(RESOLVED) });
		const [item] = await planSetup(index(e), records, readFile, folders, ALL_SETS);
		expect(item?.note).toBeUndefined();
	});

	it("produces no items for deselected sets and does not read their files", async () => {
		const fc = await entry();
		const tpl = await entry({ id: "templates/character.md", set: "templates", relPath: "character.md" });
		const sch = await entry({ id: "schema/character.md", set: "schema", relPath: "character.md" });
		const { readFile, reads } = fakeVault({});

		const plan = await planSetup(index(fc, tpl, sch), {}, readFile, folders, ["templates"]);

		expect(plan.map((i) => i.entry.id)).toEqual(["templates/character.md"]);
		expect(plan[0]?.path).toBe("Story/Templates/character.md");
		expect(reads).toEqual(["Story/Templates/character.md"]);
	});

	it("maps each set to its own folder and normalises the joined path", async () => {
		const sch = await entry({ id: "schema/sub/a.md", set: "schema", relPath: "sub/a.md" });
		const { readFile } = fakeVault({});
		const messy: ArtifactFolders = { ...folders, schemaFolder: " /Story//Schema/ " };
		const [item] = await planSetup(index(sch), {}, readFile, messy, ALL_SETS);
		expect(item?.path).toBe("Story/Schema/sub/a.md");
	});

	it("refuses an index entry whose checksum does not match its source, without reading", async () => {
		const e = await entry({ checksum: await computeChecksum("something else") });
		const { readFile, reads } = fakeVault({});

		const [item] = await planSetup(index(e), {}, readFile, folders, ALL_SETS);

		expect(item?.action).toBe("refused");
		expect(item?.note).toBe("checksum mismatch");
		expect(reads).toEqual([]);
	});
});
