/**
 * managedFileWriter — the one writer for every user-requested vault write (spec 010 T2.4).
 *
 * Every write goes through the Vault API (CON-3, PRD F6.4): `getAbstractFileByPath`, `read`,
 * `create`, `process`, `createFolder`, and `fileManager.trashFile` for undo. `vault.adapter`
 * is never touched. The refusal wording is the catalog's, unchanged (describeRefusal passes it
 * through word for word).
 *
 * @ref SDD/ADR-41
 * @ref SDD/Internal API Changes
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { App, TFile, wireMemoryVault, type MemoryVault } from "obsidian";
import {
	checkOccupied,
	editedRefusal,
	ensureFolder,
	occupiedRefusal,
	readExisting,
	undo,
	write,
} from "vault/managedFileWriter";

const PATH = "00 Meta/Bases/x.base";

let app: App;
let mem: MemoryVault;

beforeEach(() => {
	app = new App();
	mem = wireMemoryVault(app);
});

/** No `vault.adapter` method ran: every file op went through the Vault API. */
function expectNoAdapterUse(): void {
	for (const fn of Object.values(app.vault.adapter)) {
		expect(vi.mocked(fn)).not.toHaveBeenCalled();
	}
}

describe("readExisting", () => {
	it("returns the content of an existing file", async () => {
		mem.folders.add("00 Meta").add("00 Meta/Bases");
		mem.files.set(PATH, "views: []\n");
		expect(await readExisting(app, PATH, "Not installed")).toEqual({ content: "views: []\n" });
		expectNoAdapterUse();
	});

	it("reports an absent file", async () => {
		expect(await readExisting(app, PATH, "Not installed")).toEqual({ absent: true });
	});

	it("refuses, with the prefix, a file that cannot be read", async () => {
		mem.files.set(PATH, "x");
		vi.mocked(app.vault.read).mockRejectedValueOnce(new Error("EACCES"));
		expect(await readExisting(app, PATH, "Not updated")).toEqual({ refusal: `Not updated: could not read ${PATH}: EACCES` });
	});

	it("refuses a folder at the path", async () => {
		mem.folders.add(PATH);
		expect(await readExisting(app, PATH, "Not installed")).toEqual({ refusal: `Not installed: could not read ${PATH}: it is a folder` });
	});

	it("looks the path up normalized", async () => {
		mem.files.set(PATH, "a");
		expect(await readExisting(app, "00 Meta//Bases/x.base", "Not installed")).toEqual({ content: "a" });
	});
});

describe("ensureFolder", () => {
	it("creates every missing level, outermost first", async () => {
		await ensureFolder(app, "a/b/c");
		expect(vi.mocked(app.vault.createFolder).mock.calls.map((c) => c[0])).toEqual(["a", "a/b", "a/b/c"]);
		expect([...mem.folders]).toEqual(["a", "a/b", "a/b/c"]);
	});

	it("creates only the missing levels of a partly existing path", async () => {
		mem.folders.add("a");
		await ensureFolder(app, "a/b");
		expect(vi.mocked(app.vault.createFolder).mock.calls.map((c) => c[0])).toEqual(["a/b"]);
	});

	it("creates nothing when the folder exists", async () => {
		mem.folders.add("a").add("a/b");
		await ensureFolder(app, "a/b");
		expect(vi.mocked(app.vault.createFolder)).not.toHaveBeenCalled();
	});

	it("tolerates a level created concurrently (createFolder fails, the folder is there)", async () => {
		vi.mocked(app.vault.createFolder).mockImplementationOnce(async (p: string) => {
			mem.folders.add(p);
			throw new Error("Folder already exists.");
		});
		await expect(ensureFolder(app, "a/b")).resolves.toBeUndefined();
		expect([...mem.folders]).toEqual(["a", "a/b"]);
	});

	it("fails when a file occupies a level", async () => {
		mem.files.set("a", "x");
		await expect(ensureFolder(app, "a/b")).rejects.toThrow(/a is a file/);
	});

	it("does nothing for the vault root", async () => {
		await ensureFolder(app, "/");
		await ensureFolder(app, "");
		expect(vi.mocked(app.vault.createFolder)).not.toHaveBeenCalled();
	});
});

describe("write", () => {
	it("creates a new file, its parent folders first, and remembers there was none", async () => {
		expect(await write(app, PATH, "new")).toEqual({ path: PATH, previous: null });
		expect(mem.files.get(PATH)).toBe("new");
		expect(mem.folders.has("00 Meta/Bases")).toBe(true);
		expect(vi.mocked(app.vault.create)).toHaveBeenCalledWith(PATH, "new");
		expectNoAdapterUse();
	});

	it("replaces an existing file through process, remembering its previous content", async () => {
		mem.folders.add("00 Meta").add("00 Meta/Bases");
		mem.files.set(PATH, "old");
		expect(await write(app, PATH, "new")).toEqual({ path: PATH, previous: "old" });
		expect(mem.files.get(PATH)).toBe("new");
		expect(vi.mocked(app.vault.process)).toHaveBeenCalledTimes(1);
		expect(vi.mocked(app.vault.create)).not.toHaveBeenCalled();
		expect(vi.mocked(app.vault.modify)).not.toHaveBeenCalled();
		expectNoAdapterUse();
	});

	it("refuses to write over a folder", async () => {
		mem.folders.add(PATH);
		await expect(write(app, PATH, "x")).rejects.toThrow(/is a folder/);
	});
});

describe("undo", () => {
	it("trashes a file the write created", async () => {
		const written = await write(app, PATH, "new");
		await undo(app, written);
		expect(mem.files.has(PATH)).toBe(false);
		const [trashed] = vi.mocked(app.fileManager.trashFile).mock.calls[0]!;
		expect(trashed).toBeInstanceOf(TFile);
		expect((trashed as TFile).path).toBe(PATH);
		expect(vi.mocked(app.vault.delete)).not.toHaveBeenCalled();
		expectNoAdapterUse();
	});

	it("restores the previous content of a file the write replaced", async () => {
		mem.folders.add("00 Meta").add("00 Meta/Bases");
		mem.files.set(PATH, "old");
		await undo(app, await write(app, PATH, "new"));
		expect(mem.files.get(PATH)).toBe("old");
		expect(vi.mocked(app.fileManager.trashFile)).not.toHaveBeenCalled();
	});

	it("recreates a replaced file that is gone since", async () => {
		mem.folders.add("00 Meta").add("00 Meta/Bases");
		mem.files.set(PATH, "old");
		const written = await write(app, PATH, "new");
		mem.files.delete(PATH);
		await undo(app, written);
		expect(mem.files.get(PATH)).toBe("old");
	});

	it("does nothing when a created file is already gone", async () => {
		await undo(app, { path: PATH, previous: null });
		expect(vi.mocked(app.fileManager.trashFile)).not.toHaveBeenCalled();
	});
});

describe("refusals", () => {
	it("words an edited file as the catalog always has", () => {
		expect(editedRefusal(PATH, "Not updated")).toBe(
			`Not updated: ${PATH} was edited after it was installed, and updating would overwrite those edits.`,
		);
	});

	it("words an occupied path as the catalog always has", () => {
		expect(occupiedRefusal(PATH, "Not installed")).toBe(
			`Not installed: ${PATH} already exists. Move, rename or remove it, then install again.`,
		);
	});
});

describe("checkOccupied", () => {
	it("lets a write onto an absent path proceed", async () => {
		expect(await checkOccupied(app, PATH, "x", "Not installed", { adoptIdentical: false })).toBeNull();
	});

	it("refuses an identical file when adoption is off (artifacts never adopt)", async () => {
		mem.files.set(PATH, "x");
		expect(await checkOccupied(app, PATH, "x", "Not installed", { adoptIdentical: false })).toBe(occupiedRefusal(PATH, "Not installed"));
	});

	it("adopts an identical file when adoption is on (the catalog's rule)", async () => {
		mem.files.set(PATH, "x");
		expect(await checkOccupied(app, PATH, "x", "Not installed", { adoptIdentical: true })).toBeNull();
	});

	it("refuses a different file even when adoption is on", async () => {
		mem.files.set(PATH, "y");
		expect(await checkOccupied(app, PATH, "x", "Not installed", { adoptIdentical: true })).toBe(occupiedRefusal(PATH, "Not installed"));
	});

	it("passes an unreadable file's refusal through", async () => {
		mem.files.set(PATH, "x");
		vi.mocked(app.vault.read).mockRejectedValueOnce(new Error("EACCES"));
		expect(await checkOccupied(app, PATH, "x", "Not installed", { adoptIdentical: true })).toBe(`Not installed: could not read ${PATH}: EACCES`);
	});
});
