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

import { describe, it, expect, beforeEach, vi } from "vitest";
import { augmentEl, createMockTFile, App } from "../__mocks__/obsidian";
import { NativeScopingEngine } from "engines/NativeScopingEngine";
import type { NoteContext, ResolvedEntity, EntityKind } from "scoping/NoteContext";
import type { ViewRecord } from "store/types";
import type { TFile } from "obsidian";

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
		kind: "view",
		surfaces: { anvil: false, workbench: false },
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

	// ---------------------------------------------------------------------------
	// resolveAsset — vault-path resolution
	// ---------------------------------------------------------------------------

	describe("resolveAsset", () => {
		async function buildDeps(): Promise<{ resolveAsset: (src: string) => string }> {
			const ctx = makeCtx("scene");
			await engine.render(null, ctx, el);
			const deps = engine._lastDeps!;
			return deps as unknown as { resolveAsset: (src: string) => string };
		}

		it("returns empty string when src is empty", async () => {
			const deps = await buildDeps();
			expect(deps.resolveAsset("")).toBe("");
		});

		it("returns empty string when src is whitespace-only", async () => {
			const deps = await buildDeps();
			expect(deps.resolveAsset("  ")).toBe("");
		});

		it("passes through https:// URLs unchanged", async () => {
			const deps = await buildDeps();
			expect(deps.resolveAsset("https://example.com/img.png")).toBe("https://example.com/img.png");
		});

		it("passes through http:// URLs unchanged", async () => {
			const deps = await buildDeps();
			expect(deps.resolveAsset("http://example.com/img.png")).toBe("http://example.com/img.png");
		});

		it("passes through data: URLs unchanged", async () => {
			const deps = await buildDeps();
			const dataUrl = "data:image/png;base64,abc123";
			expect(deps.resolveAsset(dataUrl)).toBe(dataUrl);
		});

		it("passes through app: URLs unchanged", async () => {
			const deps = await buildDeps();
			expect(deps.resolveAsset("app://vault/some/path.png")).toBe("app://vault/some/path.png");
		});

		it("passes through blob: URLs unchanged", async () => {
			const deps = await buildDeps();
			expect(deps.resolveAsset("blob:http://localhost/uuid")).toBe("blob:http://localhost/uuid");
		});

		it("returns getResourcePath result for a vault path resolved via getAbstractFileByPath", async () => {
			const fakeFile = createMockTFile({ path: "95 Assets/portrait.svg", basename: "portrait" });
			vi.mocked(app.vault.getAbstractFileByPath).mockReturnValueOnce(fakeFile as unknown as ReturnType<typeof app.vault.getAbstractFileByPath>);
			vi.mocked(app.vault.getResourcePath).mockReturnValueOnce("app://vault/95 Assets/portrait.svg");

			const deps = await buildDeps();
			const result = deps.resolveAsset("95 Assets/portrait.svg");
			expect(result).toBe("app://vault/95 Assets/portrait.svg");

			// Prove the FIRST branch (getAbstractFileByPath → TFile) was taken and
			// the wikilink fallback was never reached (guards the early return).
			expect(vi.mocked(app.vault.getAbstractFileByPath)).toHaveBeenCalledWith("95 Assets/portrait.svg");
			expect(vi.mocked(app.metadataCache.getFirstLinkpathDest)).not.toHaveBeenCalled();
		});

		it("returns getResourcePath result for a path resolved via getFirstLinkpathDest", async () => {
			vi.mocked(app.vault.getAbstractFileByPath).mockReturnValueOnce(null);
			const fakeFile = createMockTFile({ path: "95 Assets/portrait.svg", basename: "portrait" });
			vi.mocked(app.metadataCache.getFirstLinkpathDest).mockReturnValueOnce(fakeFile as unknown as TFile);
			vi.mocked(app.vault.getResourcePath).mockReturnValueOnce("app://vault/95 Assets/portrait.svg");

			const deps = await buildDeps();
			const result = deps.resolveAsset("95 Assets/portrait.svg");
			expect(result).toBe("app://vault/95 Assets/portrait.svg");
		});

		it("resolves a [[wikilink]] value (a Media field) by its link target", async () => {
			vi.mocked(app.vault.getAbstractFileByPath).mockReturnValue(null);
			const fakeFile = createMockTFile({ path: "95 Assets/portrait.svg", basename: "portrait" });
			vi.mocked(app.metadataCache.getFirstLinkpathDest).mockReturnValueOnce(fakeFile as unknown as TFile);
			vi.mocked(app.vault.getResourcePath).mockReturnValueOnce("app://vault/95 Assets/portrait.svg");

			const deps = await buildDeps();
			expect(deps.resolveAsset("[[portrait.svg]]")).toBe("app://vault/95 Assets/portrait.svg");
			expect(vi.mocked(app.metadataCache.getFirstLinkpathDest)).toHaveBeenCalledWith(
				"portrait.svg",
				expect.any(String),
			);
		});

		it("resolves an aliased or embedded wikilink by its target alone", async () => {
			vi.mocked(app.vault.getAbstractFileByPath).mockReturnValue(null);
			const fakeFile = createMockTFile({ path: "95 Assets/portrait.svg", basename: "portrait" });
			vi.mocked(app.metadataCache.getFirstLinkpathDest).mockReturnValue(fakeFile as unknown as TFile);

			const deps = await buildDeps();
			deps.resolveAsset("![[95 Assets/portrait.svg|Mara]]");
			expect(vi.mocked(app.metadataCache.getFirstLinkpathDest)).toHaveBeenCalledWith(
				"95 Assets/portrait.svg",
				expect.any(String),
			);
		});

		it("returns a wikilink with an empty target as empty, not as brackets", async () => {
			const deps = await buildDeps();
			expect(deps.resolveAsset("[[]]")).toBe("");
		});

		it("returns src unchanged when vault path cannot be resolved", async () => {
			vi.mocked(app.vault.getAbstractFileByPath).mockReturnValueOnce(null);
			vi.mocked(app.metadataCache.getFirstLinkpathDest).mockReturnValueOnce(null);

			const deps = await buildDeps();
			const result = deps.resolveAsset("95 Assets/missing.svg");
			expect(result).toBe("95 Assets/missing.svg");
		});
	});
});
