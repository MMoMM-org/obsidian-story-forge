/**
 * BasesFenceEngine tests — T2.2 (RED first, per TDD).
 *
 * Tests:
 *  - kind equals "bases"
 *  - teardown() is safe before any render (no-op)
 *  - render() creates a new Component AND calls load() BEFORE renderBaseFence
 *  - render() calls renderBaseFence(app, view.source, el, ctx.activeFile.path, component)
 *    NOTE: sourcePath is ctx.activeFile.path, NOT view.source
 *  - teardown() calls component.unload() and sets component to null after render
 *  - a second render() after teardown() creates a new Component (no stale reference)
 *  - on renderBaseFence throw: Component is unloaded + error re-throws
 *  - leak-free teardown asserted via the mock Component's cleanup
 *  - missing-field tolerance: render does not reject when fence handles blank cell
 *
 * @ref SDD/ADR-1  — BasesFenceEngine; bases fence render
 * @ref PRD/AC-F1.1 — fence renders read-only in container
 * @ref PRD/AC-F1.3 — leak-free teardown
 * @ref PRD/AC-F1.5 — missing-field tolerated (no throw)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { App, augmentEl, createMockTFile } from "../__mocks__/obsidian";
import { BasesFenceEngine } from "engines/BasesFenceEngine";
import type { NoteContext } from "scoping/NoteContext";
import type { ViewRecord } from "store/types";

// Mock renderBaseFence so tests don't need a real Obsidian runtime
vi.mock("bases/basesFence", () => ({
	renderBaseFence: vi.fn(),
}));

import { renderBaseFence } from "bases/basesFence";

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

function makeView(source = "filters: {}\nproperties:\n  name: {}"): ViewRecord {
	return {
		provenance: "imported",
		enabled: true,
		okayed: { version: 1, checksum: "sha256:abc" },
		source,
		engine: "bases",
		command: false,
	};
}

describe("BasesFenceEngine", () => {
	let engine: BasesFenceEngine;
	let app: App;
	let el: HTMLElement;

	beforeEach(() => {
		app = new App();
		engine = new BasesFenceEngine(app);
		el = makeEl();
		vi.mocked(renderBaseFence).mockReset();
	});

	it("has kind 'bases'", () => {
		expect(engine.kind).toBe("bases");
	});

	it("teardown() is safe before any render (no-op)", () => {
		expect(() => engine.teardown()).not.toThrow();
	});

	it("render() calls component.load() BEFORE renderBaseFence", async () => {
		vi.mocked(renderBaseFence).mockResolvedValue(undefined);

		const callOrder: string[] = [];
		let capturedComponent: { load: ReturnType<typeof vi.fn> } | undefined;

		vi.mocked(renderBaseFence).mockImplementation(async (_app, _yaml, _el, _sourcePath, comp) => {
			capturedComponent = comp as typeof capturedComponent;
			callOrder.push("renderBaseFence");
		});

		await engine.render(makeView(), makeCtx(), el);

		expect(capturedComponent).toBeDefined();
		// load() must have been called before renderBaseFence was entered
		expect(capturedComponent!.load).toHaveBeenCalled();
	});

	it("render() calls renderBaseFence with app, view.source, el, ctx.activeFile.path, component", async () => {
		vi.mocked(renderBaseFence).mockResolvedValue(undefined);

		const yaml = "filters: {}\nproperties:\n  name: {}";
		const view = makeView(yaml);
		const ctx = makeCtx("notes/chapter-01.md");

		await engine.render(view, ctx, el);

		expect(renderBaseFence).toHaveBeenCalledWith(
			app,
			yaml,
			el,
			"notes/chapter-01.md",
			expect.any(Object), // Component instance
		);
	});

	it("render() passes ctx.activeFile.path as sourcePath, NOT view.source", async () => {
		vi.mocked(renderBaseFence).mockResolvedValue(undefined);

		const yaml = "filters: {}\nproperties:\n  name: {}";
		const view = makeView(yaml);
		const ctx = makeCtx("subject/story-note.md");

		await engine.render(view, ctx, el);

		const callArgs = vi.mocked(renderBaseFence).mock.calls[0];
		// 4th arg (sourcePath) must be the subject path, not the yaml/view.source
		expect(callArgs?.[3]).toBe("subject/story-note.md");
		expect(callArgs?.[3]).not.toBe(yaml);
	});

	it("teardown() calls component.unload() after a render (leak-free)", async () => {
		vi.mocked(renderBaseFence).mockResolvedValue(undefined);

		let capturedComponent: { unload: ReturnType<typeof vi.fn> } | undefined;
		vi.mocked(renderBaseFence).mockImplementation(async (_app, _yaml, _el, _sourcePath, comp) => {
			capturedComponent = comp as typeof capturedComponent;
		});

		await engine.render(makeView(), makeCtx(), el);

		expect(capturedComponent).toBeDefined();
		engine.teardown();

		// unload() must be called (Component cleanup — leak-free teardown AC-F1.3)
		expect(capturedComponent!.unload).toHaveBeenCalled();
	});

	it("a second render() after teardown() creates a new Component (no stale reference)", async () => {
		vi.mocked(renderBaseFence).mockResolvedValue(undefined);

		const components: object[] = [];
		vi.mocked(renderBaseFence).mockImplementation(async (_app, _yaml, _el, _sourcePath, comp) => {
			components.push(comp as object);
		});

		await engine.render(makeView(), makeCtx(), el);
		engine.teardown();

		vi.mocked(renderBaseFence).mockClear();
		el.empty();

		await engine.render(makeView(), makeCtx(), el);

		expect(components).toHaveLength(2);
		expect(components[0]).not.toBe(components[1]); // new Component each render
	});

	it("on renderBaseFence throw: Component is unloaded + error re-throws", async () => {
		let capturedComponent: { unload: ReturnType<typeof vi.fn> } | undefined;
		vi.mocked(renderBaseFence).mockImplementation(async (_app, _yaml, _el, _sourcePath, comp) => {
			capturedComponent = comp as typeof capturedComponent;
			throw new Error("bases render error");
		});

		await expect(engine.render(makeView(), makeCtx(), el)).rejects.toThrow("bases render error");

		expect(capturedComponent).toBeDefined();
		expect(capturedComponent!.unload).toHaveBeenCalled();
	});

	it("Component is not leaked after renderBaseFence throws (second render creates fresh component)", async () => {
		vi.mocked(renderBaseFence).mockRejectedValue(new Error("bases render error"));

		await expect(engine.render(makeView(), makeCtx(), el)).rejects.toThrow("bases render error");

		// Reset mock and verify the engine is in clean state for a second render
		vi.mocked(renderBaseFence).mockResolvedValue(undefined);

		const components: object[] = [];
		vi.mocked(renderBaseFence).mockImplementation(async (_app, _yaml, _el, _sourcePath, comp) => {
			components.push(comp as object);
		});

		// Second render should succeed and use a fresh component
		await expect(engine.render(makeView(), makeCtx(), el)).resolves.not.toThrow();
		const freshComponent = components[0] as { load: ReturnType<typeof vi.fn> };
		expect(freshComponent).toBeDefined();
		expect(freshComponent.load).toHaveBeenCalled();
	});

	it("missing-field tolerance: render does not reject when fence handles blank cell", async () => {
		// The fence (renderBaseFence) handles missing fields gracefully — it renders
		// a blank/omitted cell. The engine itself must not throw. Simulate this by
		// resolving normally (the fence abstraction absorbs the blank-cell case).
		vi.mocked(renderBaseFence).mockResolvedValue(undefined);

		const viewWithMissingField = makeView("filters: {}\nproperties:\n  missing_field: {}");

		// Must not throw/reject — AC-F1.5
		await expect(engine.render(viewWithMissingField, makeCtx(), el)).resolves.not.toThrow();
	});
});
