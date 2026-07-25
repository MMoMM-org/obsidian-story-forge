/**
 * Self-tests for the spy-able processFrontMatter mock — T2.2.
 *
 * Tests:
 *  - processFrontMatter is a vi.fn() spy (toHaveBeenCalledWith / call-count work)
 *  - mutator fn runs against the per-file frontmatter store
 *  - the store reflects the mutation after the call (readable via _getFrontmatter)
 *  - _setFrontmatter pre-seeds a file's frontmatter before a write
 *  - a registered metadataCache.on("changed") handler fires after mutation
 *  - multiple files have isolated stores (writes to one don't affect another)
 *  - missing path starts as empty {} (harmless default)
 *
 * @ref SDD/ADR-26 — spy-able processFrontMatter mock for write assertions
 * @ref SDD/ADR-22 — metadataCache "changed" round-trip for re-render tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { App, TFile } from "./obsidian";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeApp(): App {
	return new App();
}

function makeFile(path: string): TFile {
	const f = new TFile();
	f.path = path;
	return f;
}

// ---------------------------------------------------------------------------
// processFrontMatter mock self-tests
// ---------------------------------------------------------------------------

describe("processFrontMatter mock", () => {
	let app: App;

	beforeEach(() => {
		app = makeApp();
	});

	// --- Spy-able: vi.fn() wrapper still works ---

	it("is a vi.fn() spy (toHaveBeenCalledWith and call-count work)", async () => {
		const file = makeFile("scenes/S01.md");
		const mutator = vi.fn((_fm: Record<string, unknown>) => {});

		await app.fileManager.processFrontMatter(file, mutator);

		expect(app.fileManager.processFrontMatter).toHaveBeenCalledTimes(1);
		expect(app.fileManager.processFrontMatter).toHaveBeenCalledWith(file, mutator);
	});

	// --- Per-file store: mutator runs against the store ---

	it("mutator fn runs against the file's frontmatter store", async () => {
		const file = makeFile("scenes/S01.md");

		await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			fm["status"] = "done";
		});

		const stored = app.fileManager._getFrontmatter(file.path);
		expect(stored["status"]).toBe("done");
	});

	it("_setFrontmatter pre-seeds a file's frontmatter before a write", async () => {
		const file = makeFile("scenes/S01.md");
		app.fileManager._setFrontmatter(file.path, { status: "draft", order: 10 });

		await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			fm["status"] = "done";
		});

		const stored = app.fileManager._getFrontmatter(file.path);
		expect(stored["status"]).toBe("done");
		// sibling key preserved
		expect(stored["order"]).toBe(10);
	});

	it("missing path starts as empty {} (no seed needed for harmless default)", async () => {
		const file = makeFile("scenes/new.md");

		await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			fm["title"] = "New Scene";
		});

		const stored = app.fileManager._getFrontmatter(file.path);
		expect(stored["title"]).toBe("New Scene");
	});

	// --- Multiple files have isolated stores ---

	it("writes to one file do not affect another file's store", async () => {
		const fileA = makeFile("scenes/A.md");
		const fileB = makeFile("scenes/B.md");
		app.fileManager._setFrontmatter(fileA.path, { status: "draft" });
		app.fileManager._setFrontmatter(fileB.path, { status: "draft" });

		await app.fileManager.processFrontMatter(fileA, (fm: Record<string, unknown>) => {
			fm["status"] = "done";
		});

		expect(app.fileManager._getFrontmatter(fileA.path)["status"]).toBe("done");
		expect(app.fileManager._getFrontmatter(fileB.path)["status"]).toBe("draft");
	});

	// --- metadataCache "changed" fires after mutation ---

	it("fires a metadataCache 'changed' event after a successful mutation", async () => {
		const file = makeFile("scenes/S01.md");
		const handler = vi.fn();
		app.metadataCache.on("changed", handler);

		await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			fm["status"] = "done";
		});

		expect(handler).toHaveBeenCalledTimes(1);
		// The handler receives the TFile as the first argument (mirrors real Obsidian)
		expect(handler).toHaveBeenCalledWith(file);
	});

	it("'changed' event fires only for the mutated file (not for other registrations)", async () => {
		const fileA = makeFile("scenes/A.md");
		const fileB = makeFile("scenes/B.md");
		const handlerA = vi.fn();
		// One handler registered — should fire once (for fileA's write)
		app.metadataCache.on("changed", handlerA);

		await app.fileManager.processFrontMatter(fileA, (fm: Record<string, unknown>) => {
			fm["status"] = "done";
		});
		await app.fileManager.processFrontMatter(fileB, (fm: Record<string, unknown>) => {
			fm["status"] = "draft";
		});

		// Handler fires once per write (both fileA and fileB trigger it — it's a global "changed")
		expect(handlerA).toHaveBeenCalledTimes(2);
		expect(handlerA).toHaveBeenNthCalledWith(1, fileA);
		expect(handlerA).toHaveBeenNthCalledWith(2, fileB);
	});

	// --- Store isolation between App instances ---

	it("two App instances have independent stores", async () => {
		const appA = makeApp();
		const appB = makeApp();
		const file = makeFile("scenes/S01.md");

		await appA.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			fm["x"] = 1;
		});
		await appB.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			fm["x"] = 2;
		});

		expect(appA.fileManager._getFrontmatter(file.path)["x"]).toBe(1);
		expect(appB.fileManager._getFrontmatter(file.path)["x"]).toBe(2);
	});
});
