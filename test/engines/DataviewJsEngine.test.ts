/**
 * DataviewJsEngine tests — T3.4 (RED first, per TDD).
 *
 * Tests:
 *  - kind equals "dataviewjs"
 *  - render() on Platform.isMobile renders platform-restriction message, no executeJs
 *  - render() when enableDataviewJs is false renders dvjs-off prompt, no executeJs
 *  - render() when readFencedBlock returns null renders source-missing message, no executeJs
 *  - render() happy path: calls dvApi.executeJs with correct filePath (ctx.activeFile.path)
 *  - teardown() calls component.unload() and nulls reference
 *  - teardown() is safe before render (no-op)
 *  - re-reads getDataviewApi on every render (not cached)
 *  - isDvJsEnabled returns false when enableDataviewJs is off
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { App, augmentEl, createMockTFile, createMockDataviewApi, wireDataviewApi, Platform } from "../__mocks__/obsidian";
import { DataviewJsEngine, isDvJsEnabled } from "engines/DataviewJsEngine";
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
		engine: "dataviewjs",
		command: false,
	};
}

describe("DataviewJsEngine", () => {
	let engine: DataviewJsEngine;
	let app: App;
	let el: HTMLElement;

	beforeEach(() => {
		app = new App();
		engine = new DataviewJsEngine(app);
		el = makeEl();
		vi.mocked(readFencedBlock).mockReset();
		// Default: desktop (not mobile)
		(Platform as { isMobile: boolean }).isMobile = false;
	});

	afterEach(() => {
		// Restore platform defaults
		(Platform as { isMobile: boolean }).isMobile = false;
	});

	it("has kind 'dataviewjs'", () => {
		expect(engine.kind).toBe("dataviewjs");
	});

	it("teardown() is safe before any render (no-op)", () => {
		expect(() => engine.teardown()).not.toThrow();
	});

	describe("mobile guard", () => {
		it("renders platform-restriction message when Platform.isMobile is true", async () => {
			(Platform as { isMobile: boolean }).isMobile = true;
			const dvApi = createMockDataviewApi({ satisfies: true });
			wireDataviewApi(app, dvApi);
			vi.mocked(readFencedBlock).mockResolvedValue({ lang: "dataviewjs", body: "dv.list()" });

			await engine.render(makeView(), makeCtx(), el);

			expect(el.textContent).toContain("not available on mobile");
			expect(dvApi.executeJs).not.toHaveBeenCalled();
		});

		it("does not call readFencedBlock when Platform.isMobile is true", async () => {
			(Platform as { isMobile: boolean }).isMobile = true;
			const dvApi = createMockDataviewApi({ satisfies: true });
			wireDataviewApi(app, dvApi);

			await engine.render(makeView(), makeCtx(), el);

			expect(readFencedBlock).not.toHaveBeenCalled();
		});
	});

	describe("dvjs-off guard", () => {
		it("renders dvjs-off message when enableDataviewJs is false", async () => {
			const dvApi = createMockDataviewApi({ satisfies: true, enableDataviewJs: false });
			wireDataviewApi(app, dvApi);
			vi.mocked(readFencedBlock).mockResolvedValue({ lang: "dataviewjs", body: "dv.list()" });

			await engine.render(makeView(), makeCtx(), el);

			expect(el.textContent).toContain("JavaScript queries are disabled");
			expect(dvApi.executeJs).not.toHaveBeenCalled();
		});
	});

	describe("source-missing guard", () => {
		it("renders source-missing message when readFencedBlock returns null", async () => {
			const dvApi = createMockDataviewApi({ satisfies: true, enableDataviewJs: true });
			wireDataviewApi(app, dvApi);
			vi.mocked(readFencedBlock).mockResolvedValue(null);

			await engine.render(makeView(), makeCtx(), el);

			expect(el.textContent).toContain("source missing");
			expect(dvApi.executeJs).not.toHaveBeenCalled();
		});
	});

	describe("happy path", () => {
		it("calls dvApi.executeJs with queryText, el, component, ctx.activeFile.path", async () => {
			const dvApi = createMockDataviewApi({ satisfies: true, enableDataviewJs: true });
			wireDataviewApi(app, dvApi);
			const queryText = "dv.table(['Name'], dv.pages())";
			vi.mocked(readFencedBlock).mockResolvedValue({ lang: "dataviewjs", body: queryText });

			const ctx = makeCtx("notes/chapter-01.md");
			await engine.render(makeView(), ctx, el);

			expect(dvApi.executeJs).toHaveBeenCalledWith(
				queryText,
				el,
				expect.any(Object),
				"notes/chapter-01.md", // ctx.activeFile.path, NOT view.source
			);
		});

		it("passes ctx.activeFile.path as filePath, NOT view.source (ADR-3)", async () => {
			const dvApi = createMockDataviewApi({ satisfies: true, enableDataviewJs: true });
			wireDataviewApi(app, dvApi);
			vi.mocked(readFencedBlock).mockResolvedValue({ lang: "dataviewjs", body: "dv.list()" });

			const ctx = makeCtx("subject/note.md");
			const view = makeView("views/some-view.md"); // different from ctx path

			await engine.render(view, ctx, el);

			const callArgs = vi.mocked(dvApi.executeJs).mock.calls[0];
			expect(callArgs?.[3]).toBe("subject/note.md");
			expect(callArgs?.[3]).not.toBe("views/some-view.md");
		});

		it("calls component.load() before dvApi.executeJs", async () => {
			const dvApi = createMockDataviewApi({ satisfies: true, enableDataviewJs: true });
			wireDataviewApi(app, dvApi);
			vi.mocked(readFencedBlock).mockResolvedValue({ lang: "dataviewjs", body: "dv.list()" });

			await engine.render(makeView(), makeCtx(), el);

			const passedComponent = vi.mocked(dvApi.executeJs).mock.calls[0]?.[2];
			expect(passedComponent).toBeDefined();
			expect((passedComponent as { load: ReturnType<typeof vi.fn> }).load).toHaveBeenCalled();
		});
	});

	describe("teardown", () => {
		it("calls component.unload() after a render", async () => {
			const dvApi = createMockDataviewApi({ satisfies: true, enableDataviewJs: true });
			wireDataviewApi(app, dvApi);
			vi.mocked(readFencedBlock).mockResolvedValue({ lang: "dataviewjs", body: "dv.list()" });

			await engine.render(makeView(), makeCtx(), el);

			const passedComponent = vi.mocked(dvApi.executeJs).mock.calls[0]?.[2] as { unload: ReturnType<typeof vi.fn> };
			engine.teardown();

			expect(passedComponent.unload).toHaveBeenCalled();
		});

		it("a second render() after teardown() creates a new Component (no stale reference)", async () => {
			const dvApi = createMockDataviewApi({ satisfies: true, enableDataviewJs: true });
			wireDataviewApi(app, dvApi);
			vi.mocked(readFencedBlock).mockResolvedValue({ lang: "dataviewjs", body: "dv.list()" });

			await engine.render(makeView(), makeCtx(), el);
			const firstComponent = vi.mocked(dvApi.executeJs).mock.calls[0]?.[2];

			engine.teardown();
			vi.mocked(dvApi.executeJs).mockClear();
			el.empty();

			await engine.render(makeView(), makeCtx(), el);
			const secondComponent = vi.mocked(dvApi.executeJs).mock.calls[0]?.[2];

			expect(secondComponent).toBeDefined();
			expect(secondComponent).not.toBe(firstComponent);
		});
	});

	describe("error self-cleanup (W1)", () => {
		it("unloads Component when dvApi.executeJs throws (no leak)", async () => {
			const dvApi = createMockDataviewApi({ satisfies: true, enableDataviewJs: true });
			wireDataviewApi(app, dvApi);
			vi.mocked(readFencedBlock).mockResolvedValue({ lang: "dataviewjs", body: "dv.list()" });

			let capturedComponent: { load: ReturnType<typeof vi.fn>; unload: ReturnType<typeof vi.fn> } | undefined;
			vi.mocked(dvApi.executeJs).mockImplementation(async (_body, _el, comp) => {
				capturedComponent = comp as typeof capturedComponent;
				throw new Error("dv error");
			});

			await expect(engine.render(makeView(), makeCtx(), el)).rejects.toThrow("dv error");

			expect(capturedComponent).toBeDefined();
			expect(capturedComponent!.unload).toHaveBeenCalled();
		});

		it("creates a fresh Component on subsequent render after executeJs error", async () => {
			const dvApi = createMockDataviewApi({ satisfies: true, enableDataviewJs: true });
			wireDataviewApi(app, dvApi);
			vi.mocked(readFencedBlock).mockResolvedValue({ lang: "dataviewjs", body: "dv.list()" });
			vi.mocked(dvApi.executeJs).mockRejectedValue(new Error("dv error"));

			await expect(engine.render(makeView(), makeCtx(), el)).rejects.toThrow("dv error");

			// Second render should succeed and create a fresh Component
			vi.mocked(dvApi.executeJs).mockResolvedValue(undefined);
			el.empty();

			await engine.render(makeView(), makeCtx(), el);
			const freshComponent = vi.mocked(dvApi.executeJs).mock.calls[0]?.[2] as { load: ReturnType<typeof vi.fn> };
			expect(freshComponent).toBeDefined();
			expect(freshComponent.load).toHaveBeenCalled();
		});
	});

	describe("re-read dvApi on every render", () => {
		it("re-reads getDataviewApi on every render (not cached)", async () => {
			vi.mocked(readFencedBlock).mockResolvedValue({ lang: "dataviewjs", body: "dv.list()" });

			// First render: Dataview absent → engine-missing
			await engine.render(makeView(), makeCtx(), el);
			expect(el.textContent).toBeTruthy();

			// Wire Dataview
			const dvApi = createMockDataviewApi({ satisfies: true, enableDataviewJs: true });
			wireDataviewApi(app, dvApi);
			el.empty();

			// Second render: now should call executeJs
			await engine.render(makeView(), makeCtx(), el);
			expect(dvApi.executeJs).toHaveBeenCalled();
		});
	});
});

describe("isDvJsEnabled", () => {
	it("returns false when Dataview is absent", () => {
		const app = new App();
		expect(isDvJsEnabled(app)).toBe(false);
	});

	it("returns false when enableDataviewJs is false", () => {
		const app = new App();
		const dvApi = createMockDataviewApi({ enableDataviewJs: false });
		wireDataviewApi(app, dvApi);
		expect(isDvJsEnabled(app)).toBe(false);
	});

	it("returns true when enableDataviewJs is true", () => {
		const app = new App();
		const dvApi = createMockDataviewApi({ enableDataviewJs: true });
		wireDataviewApi(app, dvApi);
		expect(isDvJsEnabled(app)).toBe(true);
	});
});
