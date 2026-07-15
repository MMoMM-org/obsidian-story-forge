/**
 * Tests for readFencedBlock — the shared fenced-block extractor.
 *
 * Contract (SDD/T1.1):
 * - Returns {lang, body} when note exists with exactly one dataview/dataviewjs block.
 * - Returns null when note does not exist (vault.getAbstractFileByPath → null).
 * - Returns null when note has zero matching blocks.
 * - Returns null when note has more than one matching block.
 * - Returns body bytes byte-exact (no CRLF normalisation).
 * - Does NOT throw — always returns {lang, body} | null.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { App, TFile } from "obsidian";
import { readFencedBlock } from "import/fencedBlock";

function makeApp(fileContent: string | null): App {
	const app = new App();
	if (fileContent === null) {
		vi.mocked(app.vault.getAbstractFileByPath).mockReturnValue(null);
	} else {
		const file = new TFile();
		vi.mocked(app.vault.getAbstractFileByPath).mockReturnValue(file);
		vi.mocked(app.vault.read).mockResolvedValue(fileContent);
	}
	return app;
}

describe("readFencedBlock", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns {lang, body} for a note with exactly one dataview block", async () => {
		const content = "# My View\n\n```dataview\nLIST FROM #canon\n```\n";
		const app = makeApp(content);
		const result = await readFencedBlock(app, "views/my-view.md");
		expect(result).toEqual({ lang: "dataview", body: "LIST FROM #canon\n" });
	});

	it("returns {lang, body} for a note with exactly one dataviewjs block", async () => {
		const content = "# My View\n\n```dataviewjs\ndv.list(dv.pages())\n```\n";
		const app = makeApp(content);
		const result = await readFencedBlock(app, "views/my-view.md");
		expect(result).toEqual({ lang: "dataviewjs", body: "dv.list(dv.pages())\n" });
	});

	it("returns null when note does not exist (vault.getAbstractFileByPath returns null)", async () => {
		const app = makeApp(null);
		const result = await readFencedBlock(app, "views/missing.md");
		expect(result).toBeNull();
	});

	it("returns null when note has zero matching blocks", async () => {
		const content = "# My View\n\nJust some text, no fenced block.\n";
		const app = makeApp(content);
		const result = await readFencedBlock(app, "views/no-block.md");
		expect(result).toBeNull();
	});

	it("returns null when note has more than one matching block", async () => {
		const content =
			"# My View\n\n```dataview\nLIST\n```\n\n```dataviewjs\ndv.list()\n```\n";
		const app = makeApp(content);
		const result = await readFencedBlock(app, "views/two-blocks.md");
		expect(result).toBeNull();
	});

	it("returns null when note has two blocks of the same type", async () => {
		const content =
			"# My View\n\n```dataview\nLIST\n```\n\n```dataview\nTABLE\n```\n";
		const app = makeApp(content);
		const result = await readFencedBlock(app, "views/two-same.md");
		expect(result).toBeNull();
	});

	it("does not normalise CRLF in the body (byte-exact)", async () => {
		const crlfBody = "LIST FROM #canon\r\n";
		const content = "# View\n\n```dataview\r\n" + crlfBody + "```\n";
		const app = makeApp(content);
		const result = await readFencedBlock(app, "views/crlf.md");
		expect(result).not.toBeNull();
		// Body must contain CRLF unchanged
		expect(result!.body).toBe(crlfBody);
	});

	it("does not throw — returns null for missing note without throwing", async () => {
		const app = makeApp(null);
		await expect(readFencedBlock(app, "missing.md")).resolves.toBeNull();
	});

	it("ignores non-dataview/dataviewjs fenced blocks", async () => {
		const content =
			"# View\n\n```javascript\nconsole.log('hi')\n```\n\n```dataview\nLIST\n```\n";
		const app = makeApp(content);
		const result = await readFencedBlock(app, "views/mixed.md");
		expect(result).toEqual({ lang: "dataview", body: "LIST\n" });
	});

	it("returns body with empty content when block body is empty", async () => {
		const content = "# View\n\n```dataview\n```\n";
		const app = makeApp(content);
		const result = await readFencedBlock(app, "views/empty-block.md");
		expect(result).toEqual({ lang: "dataview", body: "" });
	});

	it("ignores a query-lang fence line INSIDE a non-query block body (W-1)", async () => {
		// A ```text block whose body contains a line-start "```dataview" (e.g.
		// documentation of a query) must NOT be counted as a query block. The
		// parser must skip the body of any non-query fence. Only the real,
		// top-level dataview block below it counts → exactly one → real block.
		const content =
			"# View\n\n" +
			"```text\n" +
			"```dataview\n" +
			"LIST\n" +
			"```\n" +
			"\n" +
			"```dataview\n" +
			"REAL QUERY\n" +
			"```\n";
		const app = makeApp(content);
		const result = await readFencedBlock(app, "views/nested.md");
		expect(result).toEqual({ lang: "dataview", body: "REAL QUERY\n" });
	});
});
