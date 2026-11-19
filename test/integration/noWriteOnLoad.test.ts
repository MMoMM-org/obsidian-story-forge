/**
 * noWriteOnLoad.test.ts — T2.7 (spec 010, CON-4, PRD Rule 1): loading, enabling and layout-ready
 * write no vault file. The store and the bundled index are wired, but nothing is set up unasked.
 *
 * @ref docs/XDD/specs/010-ship-vault-artifacts/solution.md — CON-4, ADR-38, ADR-40
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App, wireMemoryVault } from "obsidian";

type Plugin = InstanceType<typeof import("main").default>;

/** Every writer obsidian.d.ts declares on Vault, DataAdapter and FileManager. */
function vaultMutators(app: App): Record<string, ReturnType<typeof vi.fn>> {
	const v = app.vault;
	const a = app.vault.adapter;
	const fm = app.fileManager;
	return {
		"vault.create": vi.mocked(v.create), "vault.createBinary": vi.mocked(v.createBinary),
		"vault.createFolder": vi.mocked(v.createFolder), "vault.modify": vi.mocked(v.modify),
		"vault.modifyBinary": vi.mocked(v.modifyBinary), "vault.append": vi.mocked(v.append),
		"vault.appendBinary": vi.mocked(v.appendBinary), "vault.process": vi.mocked(v.process),
		"vault.rename": vi.mocked(v.rename), "vault.copy": vi.mocked(v.copy),
		"vault.delete": vi.mocked(v.delete), "vault.trash": vi.mocked(v.trash),
		"adapter.write": vi.mocked(a.write), "adapter.writeBinary": vi.mocked(a.writeBinary),
		"adapter.append": vi.mocked(a.append), "adapter.appendBinary": vi.mocked(a.appendBinary),
		"adapter.process": vi.mocked(a.process), "adapter.mkdir": vi.mocked(a.mkdir),
		"adapter.rename": vi.mocked(a.rename), "adapter.copy": vi.mocked(a.copy),
		"adapter.remove": vi.mocked(a.remove), "adapter.rmdir": vi.mocked(a.rmdir),
		"adapter.trashSystem": vi.mocked(a.trashSystem), "adapter.trashLocal": vi.mocked(a.trashLocal),
		"fileManager.processFrontMatter": vi.mocked(fm.processFrontMatter),
		"fileManager.renameFile": vi.mocked(fm.renameFile), "fileManager.trashFile": vi.mocked(fm.trashFile),
	};
}

const live: Plugin[] = [];
afterEach(() => {
	for (const p of live.splice(0)) p._runCleanup();
	vi.restoreAllMocks();
});

describe("loading the plugin into an empty vault (T2.7)", () => {
	it("writes no vault file, and exposes the artifact store and the bundled index", async () => {
		const { default: StoryForgePlugin } = await import("main");
		const app = new App();
		const vault = wireMemoryVault(app);
		const plugin = new StoryForgePlugin(app) as Plugin;
		plugin.loadData.mockImplementation(async () => ({}));
		plugin.saveData.mockImplementation(async () => {});

		await plugin.onload();
		live.push(plugin);
		// Layout-ready callbacks run at once in the mock; flush any that were deferred.
		app.workspace._flushLayoutReady();
		await plugin.artifactStore.load();

		const ran = Object.entries(vaultMutators(app))
			.filter(([, spy]) => spy.mock.calls.length > 0)
			.map(([name]) => name);
		expect(ran).toEqual([]);
		expect(vault.files.size).toBe(0);
		expect(vault.folders.size).toBe(0);
		expect(plugin.artifactStore.all()).toEqual({});
		expect(plugin.artifactIndex.entries.length).toBeGreaterThan(0);
	});
});

describe("the production bundle (PRD F1.1)", () => {
	const bundle = path.resolve(__dirname, "../../build/main.js");
	const present = existsSync(bundle);
	// CI builds before testing (.github/workflows/lint.yml: `npm run build`, then `npm test`),
	// so a missing bundle there is a failure; locally it is skipped.
	it.skipIf(!present && !process.env.CI)("build/main.js carries the artifact index entries", () => {
		expect(present, "build/main.js missing: run `npm run build` before `npm test`").toBe(true);
		const js = readFileSync(bundle, "utf8");
		expect(js.includes("fileclass/fc-scene"), "index entry fileclass/fc-scene").toBe(true);
		expect(js.includes("template/scene"), "index entry template/scene").toBe(true);
	});
});
