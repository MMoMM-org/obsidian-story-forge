/**
 * storyFilesStatus — the read-only status of the shipped story files (spec 010 T3.4, S1b/S6).
 * Wording is the signed-off S1b line; `short` is the capability screen's shortened form.
 */

import { describe, it, expect, vi } from "vitest";
import { App } from "../__mocks__/obsidian";
import { artifactIndex } from "artifacts/artifactIndex";
import { readStoryFilesStatus, summarizeStoryFiles } from "artifacts/storyFilesStatus";
import type { ArtifactEntry, ArtifactRecords, PlanAction, PlanItem } from "artifacts/artifactTypes";
import { DEFAULT_ARTIFACT_FOLDERS } from "artifacts/artifactTypes";

function item(id: string, set: ArtifactEntry["set"], action: PlanAction): PlanItem {
	return { entry: { id, set, relPath: `${id}.md`, source: "", checksum: "", placeholders: [] }, path: `${id}.md`, action };
}
const rec = (ids: string[]): ArtifactRecords =>
	Object.fromEntries(ids.map((id) => [id, { path: `${id}.md`, sourceChecksum: "sha256:" + "0".repeat(64), instanceChecksum: "sha256:" + "0".repeat(64), params: DEFAULT_ARTIFACT_FOLDERS, pluginVersion: "0" }]));

describe("summarizeStoryFiles", () => {
	it("nothing set up", () => {
		const s = summarizeStoryFiles([item("a", "fileclasses", "create"), item("b", "templates", "create")], {});
		expect(s).toMatchObject({ kind: "none", short: "Not set up", tone: "off" });
		expect(s.line).toBe("Not set up. Writes FileClasses, templates and a schema reference into the folders above, after you confirm.");
	});

	it("everything up to date, with an edited aside", () => {
		const plan = [item("a", "fileclasses", "up-to-date"), item("b", "templates", "up-to-date"), item("c", "schema", "skip-edited")];
		const s = summarizeStoryFiles(plan, rec(["a", "b", "c"]));
		expect(s).toMatchObject({ kind: "up-to-date", short: "3 set up", tone: "on" });
		expect(s.line).toBe("3 story files set up and up to date. (1 edited file left as it is)");
	});

	it("partly set up names the sets and keeps the count as an aside", () => {
		const plan = [item("a", "fileclasses", "up-to-date"), item("s", "schema", "up-to-date"), item("t", "templates", "create")];
		const s = summarizeStoryFiles(plan, rec(["a", "s"]));
		expect(s.kind).toBe("partial");
		expect(s.short).toBe("FileClasses and Schema reference set up · Templates not set up");
		expect(s.line).toBe("FileClasses and Schema reference set up · Templates not set up. 2 of 3 story files up to date.");
	});

	it("updates and missing, singular and both", () => {
		const base = [item("a", "fileclasses", "up-to-date"), item("b", "fileclasses", "up-to-date")];
		const r = rec(["a", "b", "c", "d"]);
		const u = summarizeStoryFiles([...base, item("c", "templates", "update")], r);
		expect(u).toMatchObject({ kind: "actions", short: "1 update available", tone: "neutral", updates: 1 });
		const m = summarizeStoryFiles([...base, item("c", "templates", "missing")], r);
		expect(m.short).toBe("1 missing");
		expect(m.line).toBe("1 missing. A set-up file was moved or deleted; it is not recreated unless you ask.");
		const both = summarizeStoryFiles([item("c", "templates", "update"), item("d", "templates", "update"), item("e", "schema", "missing")], r);
		expect(both.short).toBe("2 updates available · 1 missing");
		expect(both.line).toBe("2 updates available · 1 missing.");
	});

	it("skip-exists (a file you own) does not count as set up", () => {
		const s = summarizeStoryFiles([item("a", "fileclasses", "skip-exists")], {});
		expect(s.kind).toBe("none");
	});
});

describe("readStoryFilesStatus", () => {
	it("reads the vault through the real index: an empty vault is not set up, and nothing is written", async () => {
		const app = new App();
		vi.mocked(app.vault.getAbstractFileByPath).mockReturnValue(null);
		const s = await readStoryFilesStatus(app, artifactIndex, {}, DEFAULT_ARTIFACT_FOLDERS);
		expect(s).toMatchObject({ kind: "none", total: artifactIndex.entries.length });
		expect(app.vault.getAbstractFileByPath).toHaveBeenCalled();
		for (const fn of [app.vault.create, app.vault.modify, app.vault.process, app.vault.createFolder]) {
			expect(fn).not.toHaveBeenCalled();
		}
	});

	it("an unreadable path is not counted as set up and does not throw", async () => {
		const app = new App();
		vi.mocked(app.vault.getAbstractFileByPath).mockImplementation(() => { throw new Error("boom"); });
		const s = await readStoryFilesStatus(app, artifactIndex, {}, DEFAULT_ARTIFACT_FOLDERS);
		expect(s.kind).toBe("none");
	});
});
