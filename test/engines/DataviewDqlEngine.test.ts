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
});
