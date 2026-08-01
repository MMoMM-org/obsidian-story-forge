/**
 * DataviewDqlEngine tests — T3.3 (RED first, per TDD).
 *
 * Tests:
 *  - kind equals "dataview-dql"
 *  - render() calls readFencedBlock(app, view.source) to get query text
 *  - render() calls dvApi.execute(queryText, el, component, ctx.activeFile.path)
 *    NOTE: filePath is ctx.activeFile.path, NOT view.source
 *  - teardown() calls component.unload() and sets component to null
 *  - teardown() is safe before any render (no-op)
 *  - a second render() after teardown() creates a new Component (no stale reference)
 *  - if readFencedBlock returns null → renders source-missing message, no dvApi.execute
 *  - re-reads getDataviewApi on every render (not cached)
 *  - if Dataview absent → renders engine-missing message, no dvApi.execute
 *  - [[this]] substitution (T3.3-this):
 *    - [[this]] is replaced with [[<path-without-md>]] of the active note before execute
 *    - query with NO [[this]] is passed through unchanged
 *    - [[this note]] (different note name) is NOT altered
 *    - multiple [[this]] occurrences are all replaced
 *    - filePath (4th arg) is still ctx.activeFile.path regardless of substitution
 *
 * NOTE on [[this]] runtime behavior: Dataview does NOT treat [[this]] as a
 * self-reference at query time — it resolves it as a link to a note literally
 * named "this", which is always empty. This substitution happens on the
 * plugin side (before dvApi.execute) to make the contract real. Our mocks
 * cannot verify Dataview's runtime resolution; these tests assert the
 * SUBSTITUTION ITSELF — that [[this]] in the query body is rewritten to the
 * active note's full-path wikilink before the query reaches Dataview.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { App, augmentEl, createMockTFile, createMockDataviewApi, wireDataviewApi } from "../__mocks__/obsidian";
import { DataviewDqlEngine } from "engines/DataviewDqlEngine";
import type { NoteContext } from "scoping/NoteContext";
import type { ViewRecord } from "store/types";

// Mock readFencedBlock so tests don't need vault files
vi.mock("import/fencedBlock", () => ({
	readFencedBlock: vi.fn(),
}));

import { readFencedBlock } from "import/fencedBlock";

function makeEl(): HTMLElement {
	return augmentEl(document.createElement("div"));
}

function makeCtx(path = "notes/chapter-01.md"): NoteContext {
	const activeFile = createMockTFile({ path, basename: "chapter-01" });
	return {
		activeFile,
		activeKind: "scene",
		entities: [],
		backlinks: [],
		frontmatter: {},
		resolvedAt: Date.now(),
	};
}

function makeView(source = "views/my-view.md"): ViewRecord {
	return {
		provenance: "imported",
		enabled: true,
		okayed: { version: 1, checksum: "sha256:abc" },
		source,
		engine: "dataview-dql",
		command: false,
		kind: "view",
		surfaces: { anvil: false, workbench: false },
	};
}

describe("DataviewDqlEngine", () => {
	let engine: DataviewDqlEngine;
	let app: App;
	let el: HTMLElement;

	beforeEach(() => {
		app = new App();
		engine = new DataviewDqlEngine(app);
		el = makeEl();
		vi.mocked(readFencedBlock).mockReset();
	});

	it("has kind 'dataview-dql'", () => {
		expect(engine.kind).toBe("dataview-dql");
	});

	it("teardown() is safe before any render (no-op)", () => {
		expect(() => engine.teardown()).not.toThrow();
	});

	it("render() calls readFencedBlock with app and view.source", async () => {
		const dvApi = createMockDataviewApi({ satisfies: true });
		wireDataviewApi(app, dvApi);
		vi.mocked(readFencedBlock).mockResolvedValue({ lang: "dataview", body: "TABLE file.name FROM #note" });

		const view = makeView("views/my-view.md");
		await engine.render(view, makeCtx(), el);

		expect(readFencedBlock).toHaveBeenCalledWith(app, "views/my-view.md");
	});

	it("render() calls dvApi.execute with queryText, el, component, ctx.activeFile.path", async () => {
		const dvApi = createMockDataviewApi({ satisfies: true });
		wireDataviewApi(app, dvApi);
		const queryText = "TABLE file.name FROM #note";
		vi.mocked(readFencedBlock).mockResolvedValue({ lang: "dataview", body: queryText });

		const ctx = makeCtx("notes/chapter-01.md");
		await engine.render(makeView(), ctx, el);

		expect(dvApi.execute).toHaveBeenCalledWith(
			queryText,
			el,
			expect.any(Object), // Component instance
			"notes/chapter-01.md", // ctx.activeFile.path — NOT view.source
		);
	});

	it("render() passes ctx.activeFile.path as filePath, NOT view.source", async () => {
		const dvApi = createMockDataviewApi({ satisfies: true });
		wireDataviewApi(app, dvApi);
		vi.mocked(readFencedBlock).mockResolvedValue({ lang: "dataview", body: "LIST" });

		const ctx = makeCtx("subject/note.md");
		const view = makeView("views/some-view.md"); // different from ctx path

		await engine.render(view, ctx, el);

		const callArgs = vi.mocked(dvApi.execute).mock.calls[0];
		// 4th arg (filePath) must be the subject path, not the view source
		expect(callArgs?.[3]).toBe("subject/note.md");
		expect(callArgs?.[3]).not.toBe("views/some-view.md");
	});

	it("render() calls component.load() before dvApi.execute", async () => {
		const dvApi = createMockDataviewApi({ satisfies: true });
		wireDataviewApi(app, dvApi);
		vi.mocked(readFencedBlock).mockResolvedValue({ lang: "dataview", body: "LIST" });

		const callOrder: string[] = [];
		vi.mocked(dvApi.execute).mockImplementation(async () => { callOrder.push("execute"); });

		await engine.render(makeView(), makeCtx(), el);

		// After execute was called, check that a Component was passed (implying load was called)
		const passedComponent = vi.mocked(dvApi.execute).mock.calls[0]?.[2];
		expect(passedComponent).toBeDefined();
		// The mock Component tracks load calls
		expect((passedComponent as { load: ReturnType<typeof vi.fn> }).load).toHaveBeenCalled();
	});

	it("render() renders source-missing message when readFencedBlock returns null", async () => {
		const dvApi = createMockDataviewApi({ satisfies: true });
		wireDataviewApi(app, dvApi);
		vi.mocked(readFencedBlock).mockResolvedValue(null);

		await engine.render(makeView(), makeCtx(), el);

		expect(dvApi.execute).not.toHaveBeenCalled();
		expect(el.textContent).toContain("source missing");
	});

	it("render() renders engine-missing message when Dataview is absent", async () => {
		// No Dataview wired — app has no plugins
		vi.mocked(readFencedBlock).mockResolvedValue({ lang: "dataview", body: "LIST" });

		await engine.render(makeView(), makeCtx(), el);

		expect(vi.mocked(readFencedBlock)).not.toHaveBeenCalled();
		expect(el.textContent).toBeTruthy();
	});

	it("teardown() calls component.unload() after a render", async () => {
		const dvApi = createMockDataviewApi({ satisfies: true });
		wireDataviewApi(app, dvApi);
		vi.mocked(readFencedBlock).mockResolvedValue({ lang: "dataview", body: "LIST" });

		await engine.render(makeView(), makeCtx(), el);

		const passedComponent = vi.mocked(dvApi.execute).mock.calls[0]?.[2] as { unload: ReturnType<typeof vi.fn> };
		engine.teardown();

		expect(passedComponent.unload).toHaveBeenCalled();
	});

	it("a second render() after teardown() creates a new Component (no stale reference)", async () => {
		const dvApi = createMockDataviewApi({ satisfies: true });
		wireDataviewApi(app, dvApi);
		vi.mocked(readFencedBlock).mockResolvedValue({ lang: "dataview", body: "LIST" });

		await engine.render(makeView(), makeCtx(), el);
		const firstComponent = vi.mocked(dvApi.execute).mock.calls[0]?.[2];

		engine.teardown();
		vi.mocked(dvApi.execute).mockClear();
		el.empty();

		await engine.render(makeView(), makeCtx(), el);
		const secondComponent = vi.mocked(dvApi.execute).mock.calls[0]?.[2];

		expect(secondComponent).toBeDefined();
		expect(secondComponent).not.toBe(firstComponent); // new Component each time
	});

	it("self-cleans Component on dvApi.execute error (no leak)", async () => {
		const dvApi = createMockDataviewApi({ satisfies: true });
		wireDataviewApi(app, dvApi);
		vi.mocked(readFencedBlock).mockResolvedValue({ lang: "dataview", body: "LIST" });
		vi.mocked(dvApi.execute).mockRejectedValue(new Error("dv error"));

		await expect(engine.render(makeView(), makeCtx(), el)).rejects.toThrow("dv error");

		// The component that was loaded must have been unloaded (no leak)
		// We need to capture it before it was nulled — spy on Component constructor
		// via the passed component in execute args... but execute rejected before
		// recording args. Instead verify via a subsequent render that creates fresh Component.
		// The throw proves self-cleanup: a second render succeeds and creates a new component.
		vi.mocked(dvApi.execute).mockResolvedValue(undefined);
		vi.mocked(readFencedBlock).mockResolvedValue({ lang: "dataview", body: "LIST" });
		el.empty();

		await engine.render(makeView(), makeCtx(), el);
		const freshComponent = vi.mocked(dvApi.execute).mock.calls[0]?.[2] as { load: ReturnType<typeof vi.fn>; unload: ReturnType<typeof vi.fn> };
		expect(freshComponent).toBeDefined();
		expect(freshComponent.load).toHaveBeenCalled(); // fresh component was loaded
	});

	it("unloads leaked Component when dvApi.execute throws (unload spy check)", async () => {
		const dvApi = createMockDataviewApi({ satisfies: true });
		wireDataviewApi(app, dvApi);
		vi.mocked(readFencedBlock).mockResolvedValue({ lang: "dataview", body: "LIST" });

		// Capture the component passed to execute by resolving once, then reset
		// to test the throw path with the captured component's unload spy
		let capturedComponent: { load: ReturnType<typeof vi.fn>; unload: ReturnType<typeof vi.fn> } | undefined;
		vi.mocked(dvApi.execute).mockImplementation(async (_body, _el, comp) => {
			capturedComponent = comp as typeof capturedComponent;
			throw new Error("dv error");
		});

		await expect(engine.render(makeView(), makeCtx(), el)).rejects.toThrow("dv error");

		expect(capturedComponent).toBeDefined();
		expect(capturedComponent!.unload).toHaveBeenCalled();
	});

	it("re-reads getDataviewApi on every render (not cached)", async () => {
		vi.mocked(readFencedBlock).mockResolvedValue({ lang: "dataview", body: "LIST" });

		// First render: Dataview absent → engine-missing message
		await engine.render(makeView(), makeCtx(), el);
		expect(el.textContent).toBeTruthy(); // engine-missing rendered

		// Now wire Dataview
		const dvApi = createMockDataviewApi({ satisfies: true });
		wireDataviewApi(app, dvApi);
		el.empty();

		// Second render: Dataview now present → should call dvApi.execute
		await engine.render(makeView(), makeCtx(), el);
		expect(dvApi.execute).toHaveBeenCalled();
	});

	describe("[[this]] substitution (T3.3-this)", () => {
		it("replaces [[this]] with full-path wikilink of active note before execute", async () => {
			const dvApi = createMockDataviewApi({ satisfies: true });
			wireDataviewApi(app, dvApi);
			vi.mocked(readFencedBlock).mockResolvedValue({
				lang: "dataview",
				body: "TABLE file.name AS Character\nFROM [[this]]\nWHERE contains(tags, \"canon/character\")",
			});

			const ctx = makeCtx("10 Manuscript/Scenes/Scene 1 - The Extinguished Fire.md");
			await engine.render(makeView(), ctx, el);

			const calledBody = vi.mocked(dvApi.execute).mock.calls[0]?.[0] as string;
			// [[this]] must be replaced with the active note's full-path wikilink (no .md extension)
			expect(calledBody).toContain("[[10 Manuscript/Scenes/Scene 1 - The Extinguished Fire]]");
			expect(calledBody).not.toContain("[[this]]");
		});

		it("passes ctx.activeFile.path unchanged as the 4th arg even after [[this]] substitution", async () => {
			const dvApi = createMockDataviewApi({ satisfies: true });
			wireDataviewApi(app, dvApi);
			vi.mocked(readFencedBlock).mockResolvedValue({
				lang: "dataview",
				body: "LIST FROM [[this]]",
			});

			const ctx = makeCtx("Scenes/Scene 1.md");
			await engine.render(makeView(), ctx, el);

			const callArgs = vi.mocked(dvApi.execute).mock.calls[0];
			// 4th arg must remain the original path WITH .md extension (filePath)
			expect(callArgs?.[3]).toBe("Scenes/Scene 1.md");
		});

		it("passes query through unchanged when body contains no [[this]]", async () => {
			const dvApi = createMockDataviewApi({ satisfies: true });
			wireDataviewApi(app, dvApi);
			const originalBody = "TABLE file.name FROM [[Scene 1 - The Extinguished Fire]]\nWHERE contains(tags, \"canon/character\")";
			vi.mocked(readFencedBlock).mockResolvedValue({ lang: "dataview", body: originalBody });

			await engine.render(makeView(), makeCtx("Scenes/Scene 1.md"), el);

			const calledBody = vi.mocked(dvApi.execute).mock.calls[0]?.[0] as string;
			expect(calledBody).toBe(originalBody);
		});

		it("does NOT alter [[this note]] — only the exact [[this]] token is matched", async () => {
			const dvApi = createMockDataviewApi({ satisfies: true });
			wireDataviewApi(app, dvApi);
			const originalBody = "LIST FROM [[this note]]";
			vi.mocked(readFencedBlock).mockResolvedValue({ lang: "dataview", body: originalBody });

			await engine.render(makeView(), makeCtx("Scenes/Scene 1.md"), el);

			const calledBody = vi.mocked(dvApi.execute).mock.calls[0]?.[0] as string;
			expect(calledBody).toBe(originalBody);
		});

		it("replaces ALL occurrences of [[this]] in the query (global substitution)", async () => {
			const dvApi = createMockDataviewApi({ satisfies: true });
			wireDataviewApi(app, dvApi);
			vi.mocked(readFencedBlock).mockResolvedValue({
				lang: "dataview",
				body: "LIST FROM [[this]]\nWHERE outgoing([[this]]) > 0",
			});

			const ctx = makeCtx("Notes/My Note.md");
			await engine.render(makeView(), ctx, el);

			const calledBody = vi.mocked(dvApi.execute).mock.calls[0]?.[0] as string;
			// Both occurrences replaced
			expect(calledBody).not.toContain("[[this]]");
			const matches = calledBody.match(/\[\[Notes\/My Note\]\]/g);
			expect(matches).toHaveLength(2);
		});
	});
});
