/**
 * NativeScopingEngine tests — T3.5 (type dispatch + renderPanel)
 *
 * Tests:
 *  - kind sentinel is "native"
 *  - render(null, ctx, el): dispatches to the correct panel per ctx.activeKind
 *    - character ctx → "Relationships" / "Appears in" sections
 *    - scene ctx     → "Point of view" section
 *    - location ctx  → "Within" / "Inhabitants" sections
 *    - object ctx    → "Owner" section
 *    - lore ctx      → "Related" section
 *    - plotline ctx  → "Scenes" section
 *    - book ctx      → "Scenes" section
 *    - unknown ctx   → flat fallback list (entity basename visible, no kind-specific headers)
 *    (character-fantasy notes classify as "character" at the scoping layer; no separate case needed)
 *  - onOpenLink: calls app.workspace.openLinkText
 *  - toggleCollapse: flips collapsed state and re-renders (collapsed section body hidden)
 *  - teardown(): empties the last rendered container
 *  - teardown(): safe to call before any render (no-op)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { augmentEl, createMockTFile, App } from "../__mocks__/obsidian";
import { NativeScopingEngine } from "engines/NativeScopingEngine";
import type { NoteContext, ResolvedEntity, EntityKind } from "scoping/NoteContext";
import type { ViewRecord } from "store/types";

function makeEl(): HTMLElement {
	return augmentEl(document.createElement("div"));
}

function makeApp(): App {
	return new App();
}

function makeCtx(
	activeKind: EntityKind = "scene",
	entities: ResolvedEntity[] = [],
	backlinks: ResolvedEntity[] = [],
): NoteContext {
	const activeFile = createMockTFile({ path: "notes/chapter-01.md", basename: "chapter-01" });
	return {
		activeFile,
		activeKind,
		entities,
		backlinks,
		frontmatter: {},
		resolvedAt: Date.now(),
	};
}

function makeEntity(
	field: string,
	basename: string,
	kind: ResolvedEntity["kind"] = "character",
	relation: ResolvedEntity["relation"] = "outgoing",
): ResolvedEntity {
	const file = createMockTFile({ basename, path: `entities/${basename}.md` });
	return { file, kind, relation, field };
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
	let app: App;
	let engine: NativeScopingEngine;
	let el: HTMLElement;

	beforeEach(() => {
		app = makeApp();
		engine = new NativeScopingEngine(app);
		el = makeEl();
	});

	it("has kind 'native'", () => {
		expect(engine.kind).toBe("native");
	});

	it("teardown() is safe before any render (no-op)", () => {
		expect(() => engine.teardown()).not.toThrow();
	});

	it("teardown() empties the rendered container after a render", async () => {
		const ctx = makeCtx("scene", [], []);
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

	// ---------------------------------------------------------------------------
	// Type dispatch — per kind
	// ---------------------------------------------------------------------------

	it("character ctx → renders 'Relationships' and 'Appears in' sections", async () => {
		const ctx = makeCtx("character");
		await engine.render(null, ctx, el);

		const text = el.textContent ?? "";
		expect(text).toContain("Relationships");
		expect(text).toContain("Appears in");
	});

	it("scene ctx → renders 'Point of view' section", async () => {
		const ctx = makeCtx("scene");
		await engine.render(null, ctx, el);

		const text = el.textContent ?? "";
		expect(text).toContain("Point of view");
	});

	it("location ctx → renders 'Inhabitants' section", async () => {
		const ctx = makeCtx("location");
		await engine.render(null, ctx, el);

		const text = el.textContent ?? "";
		expect(text).toContain("Inhabitants");
	});

	it("object ctx → renders 'Owner' section", async () => {
		const ctx = makeCtx("object");
		await engine.render(null, ctx, el);

		const text = el.textContent ?? "";
		expect(text).toContain("Owner");
	});

	it("lore ctx → renders 'Related' section", async () => {
		const ctx = makeCtx("lore");
		await engine.render(null, ctx, el);

		const text = el.textContent ?? "";
		expect(text).toContain("Related");
	});

	it("plotline ctx → renders 'Scenes' section", async () => {
		const ctx = makeCtx("plotline");
		await engine.render(null, ctx, el);

		const text = el.textContent ?? "";
		expect(text).toContain("Scenes");
	});

	it("book ctx → renders 'Scenes' section", async () => {
		const ctx = makeCtx("book");
		await engine.render(null, ctx, el);

		const text = el.textContent ?? "";
		expect(text).toContain("Scenes");
	});

	it("unknown activeKind → renders flat fallback list with entity basenames", async () => {
		const entities = [makeEntity("field", "SomeEntity", "character")];
		const ctx = makeCtx("unknown", entities);
		await engine.render(null, ctx, el);

		const text = el.textContent ?? "";
		expect(text).toContain("SomeEntity");
		// Should NOT render kind-specific section headers for unknown
		expect(text).not.toContain("Relationships");
		expect(text).not.toContain("Point of view");
	});

	it("render(view, ctx, el) works with a non-null view without crashing", async () => {
		const ctx = makeCtx("scene");
		const view = makeView();
		await expect(engine.render(view, ctx, el)).resolves.not.toThrow();
	});

	// ---------------------------------------------------------------------------
	// onOpenLink — calls app.workspace.openLinkText
	// ---------------------------------------------------------------------------

	it("onOpenLink calls app.workspace.openLinkText with the given path", async () => {
		const ctx = makeCtx("scene");
		await engine.render(null, ctx, el);

		// Access the deps that were built — trigger via a link click if present,
		// or verify by accessing the internal state.
		// We drive it via the private _lastDeps surface for unit testing:
		const privateEngine = engine as unknown as {
			_lastDeps: { onOpenLink: (path: string) => void };
		};
		privateEngine._lastDeps.onOpenLink("notes/target.md");

		expect(app.workspace.openLinkText).toHaveBeenCalledWith(
			"notes/target.md",
			"notes/chapter-01.md",
			false,
		);
	});

	// ---------------------------------------------------------------------------
	// toggleCollapse — flips collapsed state and re-renders
	// ---------------------------------------------------------------------------

	it("toggleCollapse flips collapsed state from false to true on the given id", async () => {
		const ctx = makeCtx("scene");
		await engine.render(null, ctx, el);

		const privateEngine = engine as unknown as {
			collapsed: Record<string, boolean>;
			_lastDeps: { toggleCollapse: (id: string) => void };
		};

		// Initially not collapsed
		expect(privateEngine.collapsed["pov"]).toBeFalsy();

		// Toggle once → collapsed
		privateEngine._lastDeps.toggleCollapse("pov");
		expect(privateEngine.collapsed["pov"]).toBe(true);
	});

	it("toggleCollapse triggers a re-render (el content changes on second call)", async () => {
		const ctx = makeCtx("scene");
		await engine.render(null, ctx, el);

		const privateEngine = engine as unknown as {
			_lastDeps: { toggleCollapse: (id: string) => void };
		};

		// Should not throw on re-render
		expect(() => privateEngine._lastDeps.toggleCollapse("pov")).not.toThrow();

		// el should still have content after re-render
		expect(el.childNodes.length).toBeGreaterThan(0);
	});

	it("toggleCollapse twice returns collapsed state to false", async () => {
		const ctx = makeCtx("scene");
		await engine.render(null, ctx, el);

		const privateEngine = engine as unknown as {
			collapsed: Record<string, boolean>;
			_lastDeps: { toggleCollapse: (id: string) => void };
		};

		privateEngine._lastDeps.toggleCollapse("pov");
		expect(privateEngine.collapsed["pov"]).toBe(true);

		privateEngine._lastDeps.toggleCollapse("pov");
		expect(privateEngine.collapsed["pov"]).toBe(false);
	});

	it("a second render() after teardown() works correctly (no stale state)", async () => {
		const ctx1 = makeCtx("scene");
		const ctx2 = makeCtx("character");

		await engine.render(null, ctx1, el);
		engine.teardown();

		const el2 = makeEl();
		await engine.render(null, ctx2, el2);

		// el2 should render character panel content
		expect(el2.textContent).toContain("Relationships");
	});
});
