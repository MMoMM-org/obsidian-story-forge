/**
 * NativeScopingEngine tests — T3.1 (RED first, per TDD).
 *
 * Tests:
 *  - kind sentinel is "native"
 *  - render(null, ctx, el): renders entity info (field, basename, kind) XSS-safe
 *  - render(view, ctx, el): view provided but engine missing — renders entity context without crashing
 *  - teardown(): empties the last rendered container
 *  - teardown(): safe to call before any render (no-op)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { augmentEl, createMockTFile } from "../__mocks__/obsidian";
import { NativeScopingEngine } from "engines/NativeScopingEngine";
import type { NoteContext, ResolvedEntity } from "scoping/NoteContext";
import type { ViewRecord } from "store/types";

function makeEl(): HTMLElement {
	return augmentEl(document.createElement("div"));
}

function makeCtx(entities: ResolvedEntity[] = []): NoteContext {
	const activeFile = createMockTFile({ path: "notes/chapter-01.md", basename: "chapter-01" });
	return {
		activeFile,
		activeKind: "scene",
		entities,
		backlinks: [],
		resolvedAt: Date.now(),
	};
}

function makeEntity(field: string, basename: string, kind: ResolvedEntity["kind"] = "character"): ResolvedEntity {
	const file = createMockTFile({ basename, path: `entities/${basename}.md` });
	return { file, kind, relation: "outgoing", field };
}

function makeView(): ViewRecord {
	return {
		provenance: "imported",
		enabled: true,
		okayed: { version: 1, checksum: "sha256:abc" },
		source: "views/my-view.md",
		engine: "dataview-dql",
		command: false,
	};
}

describe("NativeScopingEngine", () => {
	let engine: NativeScopingEngine;
	let el: HTMLElement;

	beforeEach(() => {
		engine = new NativeScopingEngine();
		el = makeEl();
	});

	it("has kind 'native'", () => {
		expect(engine.kind).toBe("native");
	});

	it("teardown() is safe before any render (no-op)", () => {
		expect(() => engine.teardown()).not.toThrow();
	});

	it("render(null, ctx, el) renders each entity's field, basename, and kind", async () => {
		const entities = [
			makeEntity("pov", "Mara-Stoneway", "character"),
			makeEntity("location", "The-Forge", "location"),
		];
		const ctx = makeCtx(entities);

		await engine.render(null, ctx, el);

		const text = el.textContent ?? "";
		expect(text).toContain("pov");
		expect(text).toContain("Mara-Stoneway");
		expect(text).toContain("character");
		expect(text).toContain("location");
		expect(text).toContain("The-Forge");
	});

	it("render(null, ctx, el) creates DOM nodes XSS-safely (no innerHTML with content)", async () => {
		const entities = [makeEntity("name", "<script>alert(1)</script>", "character")];
		const ctx = makeCtx(entities);

		await engine.render(null, ctx, el);

		// textContent is set safely; the script tag should appear as escaped text, not as a real node
		const scripts = el.querySelectorAll("script");
		expect(scripts.length).toBe(0);
	});

	it("render(view, ctx, el) renders entity context without crashing when view is provided", async () => {
		const entities = [makeEntity("characters", "Aria", "character")];
		const ctx = makeCtx(entities);
		const view = makeView();

		await expect(engine.render(view, ctx, el)).resolves.not.toThrow();
		expect(el.textContent).toContain("Aria");
	});

	it("render(null, ctx, el) with empty entities renders without crashing", async () => {
		const ctx = makeCtx([]);

		await expect(engine.render(null, ctx, el)).resolves.not.toThrow();
	});

	it("teardown() empties the rendered container after a render", async () => {
		const ctx = makeCtx([makeEntity("pov", "Hero", "character")]);
		await engine.render(null, ctx, el);

		expect(el.childNodes.length).toBeGreaterThan(0);

		engine.teardown();

		expect(el.childNodes.length).toBe(0);
	});

	it("teardown() is safe to call multiple times", () => {
		expect(() => {
			engine.teardown();
			engine.teardown();
		}).not.toThrow();
	});

	it("a second render() after teardown() works correctly (no stale state)", async () => {
		const ctx1 = makeCtx([makeEntity("pov", "Hero", "character")]);
		const ctx2 = makeCtx([makeEntity("location", "Castle", "location")]);

		await engine.render(null, ctx1, el);
		engine.teardown();
		await engine.render(null, ctx2, el);

		expect(el.textContent).toContain("Castle");
		expect(el.textContent).not.toContain("Hero");
	});
});
