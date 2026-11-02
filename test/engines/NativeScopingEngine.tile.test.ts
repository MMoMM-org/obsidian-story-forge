/**
 * NativeScopingEngine: the profile tile follows the field TYPE (T6.2, spec 008).
 *
 * The panel used to draw a tile from a field NAME (`portrait` on a character,
 * `image` on a location/object). A note whose FileClass types a field `Media`
 * now gets its tile from that field whatever it is called; a note with no
 * FileClass keeps the native names (`kindFields`, CON-3).
 *
 * @ref docs/XDD/specs/008-codex-surface/plan/phase-6.md — T6.2
 * @ref docs/XDD/adr/0002-fileclass-driven-editor.md
 */

import { describe, it, expect, vi } from "vitest";
import type { TFile } from "obsidian";
import { App, augmentEl, createMockCachedMetadata, createMockTFile } from "../__mocks__/obsidian";
import { NativeScopingEngine } from "engines/NativeScopingEngine";
import type { EntityKind, NoteContext } from "scoping/NoteContext";

const FOLDER = "00 Meta/FileClasses";

type Fm = Record<string, unknown>;
interface World {
	readonly app: App;
	readonly engine: NativeScopingEngine;
	/** The metadata cache's view of the notes under test (FileClass resolution reads it). */
	readonly notes: Map<TFile, Fm>;
}

/** A FileClass file: `fields` is `[name, type]` pairs, `extendsName` optional. */
function fileClass(fields: ReadonlyArray<readonly [string, string]>, extendsName?: string): Fm {
	return {
		...(extendsName ? { extends: extendsName } : {}),
		fieldsOrder: fields.map(([n]) => `f-${n}`),
		fields: fields.map(([name, type]) => ({ name, type, options: {}, path: "", id: `f-${name}` })),
	};
}

/** An App whose metadata cache knows the given FileClasses, plus an asset at `Media/a.png`. */
function world(fileClasses: Record<string, Fm>): World {
	const app = new App();
	const files = new Map<string, { file: TFile; fm: Fm }>();
	for (const [name, fm] of Object.entries(fileClasses)) {
		const path = `${FOLDER}/${name}.md`;
		files.set(path, { file: createMockTFile({ basename: name, path }), fm });
	}
	const byFile = new Map([...files.values()].map((e) => [e.file, e.fm] as const));
	const notes = new Map<TFile, Fm>();
	vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((p) => files.get(p)?.file ?? null);
	vi.mocked(app.vault.getMarkdownFiles).mockReturnValue([...files.values()].map((e) => e.file));
	vi.mocked(app.metadataCache.getFileCache).mockImplementation((f) => {
		const fm = byFile.get(f as TFile) ?? notes.get(f as TFile);
		return fm ? createMockCachedMetadata({ frontmatter: fm }) : null;
	});
	const asset = createMockTFile({ basename: "a", path: "Media/a.png" });
	vi.mocked(app.metadataCache.getFirstLinkpathDest).mockImplementation((link) =>
		link === "Media/a.png" || link === "a.png" ? asset : null,
	);
	return { app, notes, engine: new NativeScopingEngine(app, () => FOLDER) };
}

async function render(w: World, kind: EntityKind, frontmatter: Fm): Promise<HTMLElement> {
	const activeFile = createMockTFile({ basename: "Subject", path: "canon/Subject.md" });
	w.notes.set(activeFile, frontmatter);
	const ctx: NoteContext = {
		activeFile,
		activeKind: kind,
		entities: [],
		backlinks: [],
		frontmatter,
		resolvedAt: 0,
	};
	const el = augmentEl(document.createElement("div"));
	await w.engine.render(null, ctx, el);
	return el;
}

/** The key of every fact row — text-content matching cannot tell a label from its value. */
function factLabels(el: HTMLElement): string[] {
	return [...el.querySelectorAll(".sf-frow-k")].map((k) => k.textContent ?? "");
}

const IMG_ASSET = "app://vault/Media/a.png";

describe("character tile from a Media-typed field", () => {
	const classes = { "fc-mine": fileClass([["avatar", "Media"], ["role", "Input"]]) };

	it("renders a tile for an image field not named portrait", async () => {
		const el = await render(world(classes), "character", { fileClass: "fc-mine", avatar: "[[Media/a.png]]" });
		expect(el.querySelector(".sf-portrait img")?.getAttribute("src")).toBe(IMG_ASSET);
	});

	it("does not render a tile for the same name typed Input", async () => {
		const w = world({ "fc-mine": fileClass([["avatar", "Input"]]) });
		const el = await render(w, "character", { fileClass: "fc-mine", avatar: "[[Media/a.png]]" });
		expect(el.querySelector(".sf-portrait img")).toBeNull();
		expect(el.querySelector(".sf-portrait-mono")).not.toBeNull();
	});

	it("ignores a field named portrait when the FileClass types another field Media", async () => {
		const el = await render(world(classes), "character", {
			fileClass: "fc-mine", portrait: "[[Media/a.png]]", avatar: "[[Media/a.png]]",
		});
		expect(el.querySelectorAll(".sf-portrait img")).toHaveLength(1);
	});

	it("uses the first Media field in FileClass order", async () => {
		const w = world({ "fc-mine": fileClass([["second", "Media"], ["first", "Media"]]) });
		const el = await render(w, "character", { fileClass: "fc-mine", first: "https://x.test/1.png", second: "https://x.test/2.png" });
		expect(el.querySelector(".sf-portrait img")?.getAttribute("src")).toBe("https://x.test/2.png");
	});

	it("finds a Media field declared by an extended FileClass", async () => {
		const w = world({ "fc-base": fileClass([["avatar", "Media"]]), "fc-leaf": fileClass([["x", "Input"]], "fc-base") });
		const el = await render(w, "character", { fileClass: "fc-leaf", avatar: "[[Media/a.png]]" });
		expect(el.querySelector(".sf-portrait img")?.getAttribute("src")).toBe(IMG_ASSET);
	});

	it("shows the monogram when the link target is missing", async () => {
		const el = await render(world(classes), "character", { fileClass: "fc-mine", avatar: "[[Media/gone.png]]" });
		expect(el.querySelector(".sf-portrait img")).toBeNull();
		expect(el.querySelector(".sf-portrait-mono")).not.toBeNull();
	});

	it("keeps a legacy URL working in a Media field", async () => {
		const el = await render(world(classes), "character", { fileClass: "fc-mine", avatar: "https://x.test/p.png" });
		expect(el.querySelector(".sf-portrait img")?.getAttribute("src")).toBe("https://x.test/p.png");
	});

	it("first declaration wins: a base's Input avatar is not retyped Media by the leaf", async () => {
		const w = world({ "fc-base": fileClass([["avatar", "Input"]]), "fc-leaf": fileClass([["avatar", "Media"]], "fc-base") });
		const el = await render(w, "character", { fileClass: "fc-leaf", avatar: "[[Media/a.png]]" });
		expect(el.querySelector(".sf-portrait img")).toBeNull();
		expect(el.querySelector(".sf-portrait-mono")).not.toBeNull();
	});

	it("a MultiMedia field draws no tile", async () => {
		const w = world({ "fc-mine": fileClass([["gallery", "MultiMedia"]]) });
		const el = await render(w, "character", { fileClass: "fc-mine", gallery: "[[Media/a.png]]" });
		expect(el.querySelector(".sf-portrait img")).toBeNull();
		expect(el.querySelector(".sf-portrait-mono")).not.toBeNull();
	});

	it("a blank first Media field does not fall through to a valued second one", async () => {
		const w = world({ "fc-mine": fileClass([["first", "Media"], ["second", "Media"]]) });
		const el = await render(w, "character", { fileClass: "fc-mine", first: "", second: "[[Media/a.png]]" });
		expect(el.querySelector(".sf-portrait img")).toBeNull();
		expect(el.querySelector(".sf-portrait-mono")).not.toBeNull();
	});

	it("a list value in a Media field shows the monogram and does not throw", async () => {
		const el = await render(world(classes), "character", { fileClass: "fc-mine", avatar: ["[[Media/a.png]]"] });
		expect(el.querySelector(".sf-portrait img")).toBeNull();
		expect(el.querySelector(".sf-portrait-mono")).not.toBeNull();
	});

	it("shows the monogram when the FileClass has no Media field", async () => {
		const w = world({ "fc-mine": fileClass([["role", "Input"]]) });
		const el = await render(w, "character", { fileClass: "fc-mine", portrait: "[[Media/a.png]]" });
		expect(el.querySelector(".sf-portrait img")).toBeNull();
	});
});

describe("location and object tile from a Media-typed field", () => {
	it("location: a Media field not named image draws the tile", async () => {
		const w = world({ "fc-loc": fileClass([["photo", "Media"]]) });
		const el = await render(w, "location", { fileClass: "fc-loc", photo: "[[Media/a.png]]" });
		expect(el.querySelector(".sf-imgtile--loc img")?.getAttribute("src")).toBe(IMG_ASSET);
	});

	it("location: the same name typed Input leaves the glyph", async () => {
		const w = world({ "fc-loc": fileClass([["photo", "Input"]]) });
		const el = await render(w, "location", { fileClass: "fc-loc", photo: "[[Media/a.png]]", image: "[[Media/a.png]]" });
		expect(el.querySelector(".sf-imgtile img")).toBeNull();
		expect(el.querySelector(".sf-imgtile-glyph")).not.toBeNull();
	});

	it("object: a Media field draws the tile; a missing target shows the glyph", async () => {
		const w = world({ "fc-obj": fileClass([["picture", "Media"]]) });
		const ok = await render(w, "object", { fileClass: "fc-obj", picture: "[[Media/a.png]]" });
		expect(ok.querySelector(".sf-imgtile--obj img")?.getAttribute("src")).toBe(IMG_ASSET);
		const gone = await render(w, "object", { fileClass: "fc-obj", picture: "[[Media/gone.png]]" });
		expect(gone.querySelector(".sf-imgtile img")).toBeNull();
		expect(gone.querySelector(".sf-imgtile-glyph")).not.toBeNull();
	});
});

describe("the tile field is not also a fact row", () => {
	it("location: a Media-typed region draws the tile and no Region fact", async () => {
		const w = world({ "fc-loc": fileClass([["region", "Media"]]) });
		const el = await render(w, "location", { fileClass: "fc-loc", region: "[[Media/a.png]]", aliases: ["A"] });
		expect(el.querySelector(".sf-imgtile--loc img")).not.toBeNull();
		expect(factLabels(el)).not.toContain("region");
	});

	it("character: a Media-typed first_appearance draws the tile and no fact row", async () => {
		const w = world({ "fc-mine": fileClass([["first_appearance", "Media"]]) });
		const el = await render(w, "character", { fileClass: "fc-mine", first_appearance: "[[Media/a.png]]", aliases: ["A"] });
		expect(el.querySelector(".sf-portrait img")).not.toBeNull();
		expect(factLabels(el)).not.toContain("first seen");
	});
});

describe("the tile field is not a fact row: object and fantasy block", () => {
	it("object: a Media-typed kind draws the tile and no Kind fact", async () => {
		const w = world({ "fc-obj": fileClass([["kind", "Media"]]) });
		const el = await render(w, "object", { fileClass: "fc-obj", kind: "[[Media/a.png]]", aliases: ["L"] });
		expect(el.querySelector(".sf-imgtile--obj img")).not.toBeNull();
		expect(el.querySelector(".sf-frow")).not.toBeNull(); // aliases still a fact
		expect(factLabels(el)).toEqual(["aliases"]);
	});

	it("character: a Media-typed species draws the tile and no Fantasy row", async () => {
		const w = world({ "fc-mine": fileClass([["species", "Media"]]) });
		const el = await render(w, "character", { fileClass: "fc-mine", species: "[[Media/a.png]]" });
		expect(el.querySelector(".sf-portrait img")).not.toBeNull();
		expect(el.textContent).not.toContain("Fantasy");
	});
});

describe("no FileClass applies: the native fallback", () => {
	it("character: portrait still draws the tile", async () => {
		const el = await render(world({}), "character", { portrait: "[[Media/a.png]]" });
		expect(el.querySelector(".sf-portrait img")?.getAttribute("src")).toBe(IMG_ASSET);
	});

	it("location and object: image still draws the tile", async () => {
		const w = world({});
		const loc = await render(w, "location", { image: "[[Media/a.png]]" });
		const obj = await render(w, "object", { image: "[[Media/a.png]]" });
		expect(loc.querySelector(".sf-imgtile--loc img")?.getAttribute("src")).toBe(IMG_ASSET);
		expect(obj.querySelector(".sf-imgtile--obj img")?.getAttribute("src")).toBe(IMG_ASSET);
	});

	it("a FileClass name that points at no file also falls back", async () => {
		const el = await render(world({}), "character", { fileClass: "fc-missing", portrait: "[[Media/a.png]]" });
		expect(el.querySelector(".sf-portrait img")).not.toBeNull();
	});

	it("a missing link target shows the monogram", async () => {
		const el = await render(world({}), "character", { portrait: "[[Media/gone.png]]" });
		expect(el.querySelector(".sf-portrait img")).toBeNull();
		expect(el.querySelector(".sf-portrait-mono")).not.toBeNull();
	});

	it("an engine built without a FileClasses folder falls back", async () => {
		const app = new App();
		const engine = new NativeScopingEngine(app);
		const ctx: NoteContext = {
			activeFile: createMockTFile({ basename: "S", path: "S.md" }),
			activeKind: "character", entities: [], backlinks: [], frontmatter: { portrait: "https://x.test/p.png" }, resolvedAt: 0,
		};
		const el = augmentEl(document.createElement("div"));
		await engine.render(null, ctx, el);
		expect(el.querySelector(".sf-portrait img")?.getAttribute("src")).toBe("https://x.test/p.png");
	});
});

describe("collapsing a section keeps the tile", () => {
	it("a Media-field tile survives toggleCollapse", async () => {
		const w = world({ "fc-mine": fileClass([["avatar", "Media"]]) });
		const el = await render(w, "character", { fileClass: "fc-mine", avatar: "[[Media/a.png]]" });
		const engine = w.engine as unknown as { _lastDeps: { toggleCollapse: (id: string) => void } };
		engine._lastDeps.toggleCollapse("facts");
		expect(el.querySelector(".sf-portrait img")?.getAttribute("src")).toBe(IMG_ASSET);
	});
});
