/**
 * Cards read the same tile field the panel does (T6.2b, spec 008).
 *
 * Driven through the two real hosts: the Anvil's Codex tab (`AnvilView` ->
 * `renderCodexTab`) and the standalone `.base` view (`CardBasesView`). The tile
 * follows the FileClass's `Media`-typed field, not a field name, and an
 * unresolved link draws the monogram exactly as the panel does.
 *
 * @ref docs/XDD/specs/008-codex-surface/plan/phase-6.md — T6.2b
 */

import { describe, it, expect, vi } from "vitest";
import { App as ObsidianApp, WorkspaceLeaf, type TFile } from "obsidian";
import {
	App,
	BasesEntry,
	BasesQueryResult,
	QueryController,
	augmentEl,
	createMockCachedMetadata,
	createMockTFile,
} from "../__mocks__/obsidian";
import { AnvilView } from "anvil/AnvilView";
import { CardBasesView } from "bases/CardBasesView";
import { CODEX_CARD_REGISTRY } from "codex/builtinCards";
import { NativeScopingEngine } from "engines/NativeScopingEngine";
import type { NoteContext } from "scoping/NoteContext";

const FOLDER = "00 Meta/FileClasses";
const ASSET = "app://vault/Media/a.png";

type Fm = Record<string, unknown>;

/** A FileClass claiming `tagNames`, declaring the given `[name, type]` fields. */
function fileClass(fields: ReadonlyArray<readonly [string, string]>, tagNames: string[] = []): Fm {
	return {
		tagNames,
		fieldsOrder: fields.map(([n]) => `f-${n}`),
		fields: fields.map(([name, type]) => ({ name, type, options: {}, path: "", id: `f-${name}` })),
	};
}

interface Note { readonly file: TFile; readonly fm: Fm }

function note(path: string, fm: Fm): Note {
	return { file: createMockTFile({ path, basename: path.split("/").pop()!.replace(/\.md$/, "") }), fm };
}

/** A vault of `notes` plus FileClasses and one asset at `Media/a.png`. */
function vaultOf(notes: readonly Note[], classes: Record<string, Fm>): App {
	const app = new App();
	const all: Note[] = [...notes, ...Object.entries(classes).map(([n, fm]) => note(`${FOLDER}/${n}.md`, fm))];
	const byPath = new Map(all.map((n) => [n.file.path, n.file] as const));
	const asset = createMockTFile({ basename: "a", path: "Media/a.png" });
	vi.mocked(app.vault.getMarkdownFiles).mockReturnValue(all.map((n) => n.file));
	vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((p) => byPath.get(p) ?? null);
	vi.mocked(app.metadataCache.getFileCache).mockImplementation((f) => {
		const found = all.find((n) => n.file === f);
		return found ? createMockCachedMetadata({ frontmatter: found.fm }) : null;
	});
	vi.mocked(app.metadataCache.getFirstLinkpathDest).mockImplementation((link) =>
		link === "Media/a.png" || link === "a.png" ? asset : null,
	);
	app.workspace.getActiveFile = vi.fn(() => null);
	return app;
}

const MINE = { "fc-mine": fileClass([["avatar", "Media"], ["role", "Input"]]) };

function character(name: string, fm: Fm = {}): Note {
	return note(`30 Canon/31 Characters/${name}.md`, { tags: ["canon/character"], fileClass: "fc-mine", ...fm });
}

// ---------------------------------------------------------------------------
// Anvil Codex
// ---------------------------------------------------------------------------

async function renderAnvil(app: App): Promise<HTMLElement> {
	const leaf = new WorkspaceLeaf();
	(leaf as unknown as { app: unknown }).app = app;
	const view = new AnvilView(leaf as never, { editor: { getFileClassesFolder: () => FOLDER } });
	await view.onOpen();
	view.setLayout("codex");
	return view.contentEl.querySelector(".sf-ws-body") as HTMLElement;
}

describe("Hero Card on the Anvil's Codex", () => {
	it("draws a Media-typed field not named portrait as the tile", async () => {
		const app = vaultOf([character("Mara", { avatar: "[[Media/a.png]]" })], MINE);
		const body = await renderAnvil(app);
		expect(body.querySelector(".sf-cx-card .sf-portrait img")?.getAttribute("src")).toBe(ASSET);
	});

	it("draws the monogram when the link target is missing", async () => {
		const app = vaultOf([character("Mara", { avatar: "[[Media/gone.png]]" })], MINE);
		const body = await renderAnvil(app);
		expect(body.querySelector(".sf-cx-card .sf-portrait img")).toBeNull();
		expect(body.querySelector(".sf-cx-card .sf-portrait-mono")).not.toBeNull();
	});

	it("draws the monogram, not a broken image, for a missing portrait target", async () => {
		const mara = note("30 Canon/31 Characters/Mara.md", { tags: ["canon/character"], portrait: "[[Media/gone.png]]" });
		const body = await renderAnvil(vaultOf([mara], {}));
		expect(body.querySelector(".sf-cx-card .sf-portrait img")).toBeNull();
		expect(body.querySelector(".sf-cx-card .sf-portrait-mono")).not.toBeNull();
	});

	it("keeps a protocol URL working", async () => {
		const app = vaultOf([character("Mara", { avatar: "https://x.test/p.png" })], MINE);
		const body = await renderAnvil(app);
		expect(body.querySelector(".sf-cx-card .sf-portrait img")?.getAttribute("src")).toBe("https://x.test/p.png");
	});

	it("shipped kind without a FileClass still draws portrait", async () => {
		const mara = note("30 Canon/31 Characters/Mara.md", { tags: ["canon/character"], portrait: "[[Media/a.png]]" });
		const body = await renderAnvil(vaultOf([mara], {}));
		expect(body.querySelector(".sf-cx-card .sf-portrait img")?.getAttribute("src")).toBe(ASSET);
	});

	it("scans the vault for FileClasses once per render, not once per card", async () => {
		const callsFor = async (count: number): Promise<number> => {
			// No `fileClass` key: every card must be claimed by tag, which scans.
			const notes = Array.from({ length: count }, (_, i) =>
				note(`30 Canon/31 Characters/C${i}.md`, { tags: ["canon/character"] }));
			const app = vaultOf(notes, { "fc-mine": fileClass([["avatar", "Media"]], ["canon/character"]) });
			await renderAnvil(app);
			const spy = vi.mocked(app.vault.getMarkdownFiles);
			spy.mockClear();
			const leaf = new WorkspaceLeaf();
			(leaf as unknown as { app: unknown }).app = app;
			const view = new AnvilView(leaf as never, { editor: { getFileClassesFolder: () => FOLDER } });
			await view.onOpen();
			spy.mockClear();
			view.setLayout("codex");
			return spy.mock.calls.length;
		};
		const few = await callsFor(2);
		const many = await callsFor(25);
		expect(many).toBe(few);
	});
});

// ---------------------------------------------------------------------------
// Standalone .base
// ---------------------------------------------------------------------------

function renderBase(app: App, notes: readonly Note[], folder: (() => string) | undefined = () => FOLDER): HTMLElement {
	const container = document.createElement("div");
	const view = new CardBasesView("story-forge-hero", new QueryController(), container, {
		app: app as unknown as ObsidianApp,
		registry: CODEX_CARD_REGISTRY,
		cardId: "hero",
		onEntryClick: vi.fn(),
		...(folder ? { getFileClassesFolder: folder } : {}),
	});
	const entries = notes.map((n) => {
		const e = new BasesEntry();
		e.file = n.file;
		e.getValue.mockImplementation((id: string) => ({ toString: () => String(n.fm[id] ?? "") }));
		return e;
	});
	const result = new BasesQueryResult();
	result.data = entries;
	(view as unknown as { data: BasesQueryResult }).data = result;
	view.onDataUpdated();
	return container;
}

describe("Hero Card in a standalone .base", () => {
	it("draws a Media-typed field not named portrait as the tile", () => {
		const n = character("Mara", { avatar: "[[Media/a.png]]" });
		const el = renderBase(vaultOf([n], MINE), [n]);
		expect(el.querySelector(".sf-portrait img")?.getAttribute("src")).toBe(ASSET);
	});

	it("draws the monogram when the link target is missing", () => {
		const n = character("Mara", { avatar: "[[Media/gone.png]]" });
		const el = renderBase(vaultOf([n], MINE), [n]);
		expect(el.querySelector(".sf-portrait img")).toBeNull();
		expect(el.querySelector(".sf-portrait-mono")).not.toBeNull();
	});

	it("draws the monogram, not a broken image, for a missing portrait target", () => {
		const n = note("30 Canon/31 Characters/Mara.md", { tags: ["canon/character"], portrait: "[[Media/gone.png]]" });
		const el = renderBase(vaultOf([n], {}), [n], undefined);
		expect(el.querySelector(".sf-portrait img")).toBeNull();
		expect(el.querySelector(".sf-portrait-mono")).not.toBeNull();
	});

	it("shipped kind without a FileClasses folder still draws portrait", () => {
		const n = note("30 Canon/31 Characters/Mara.md", { tags: ["canon/character"], portrait: "[[Media/a.png]]" });
		const el = renderBase(vaultOf([n], {}), [n], undefined);
		expect(el.querySelector(".sf-portrait img")?.getAttribute("src")).toBe(ASSET);
	});

	it("scans the vault for FileClasses once per render, not once per card", () => {
		const countFor = (count: number): number => {
			const notes = Array.from({ length: count }, (_, i) =>
				note(`30 Canon/31 Characters/C${i}.md`, { tags: ["canon/character"] }));
			const app = vaultOf(notes, { "fc-mine": fileClass([["avatar", "Media"]], ["canon/character"]) });
			vi.mocked(app.vault.getMarkdownFiles).mockClear();
			renderBase(app, notes);
			return vi.mocked(app.vault.getMarkdownFiles).mock.calls.length;
		};
		expect(countFor(25)).toBe(1);
		expect(countFor(2)).toBe(1);
	});

	it("does not draw the tile field again as a fact", () => {
		// `role` is a shipped character fact; here the FileClass types it Media, so it is the tile.
		const cls = { "fc-role": fileClass([["role", "Media"]]) };
		const n = note("30 Canon/31 Characters/Mara.md", { tags: ["canon/character"], fileClass: "fc-role", role: "[[Media/a.png]]", status: "alive" });
		const el = renderBase(vaultOf([n], cls), [n]);
		expect(el.querySelector(".sf-portrait img")?.getAttribute("src")).toBe(ASSET);
		const facts = el.querySelector(".sf-cx-hero-facts")?.textContent ?? "";
		expect(facts).toContain("alive");
		expect(facts).not.toContain("a.png");
		expect(el.querySelector(".sf-cx-miss")?.textContent ?? "").not.toMatch(/role/i);
	});
});

describe("a location tile from a Media field not named image", () => {
	it("draws the location tile from that field", () => {
		const cls = { "fc-loc": fileClass([["sketch", "Media"]]) };
		const n = note("30 Canon/32 Locations/Harbor.md", { tags: ["canon/location"], fileClass: "fc-loc", sketch: "[[Media/a.png]]" });
		const el = renderBase(vaultOf([n], cls), [n]);
		expect(el.querySelector(".sf-imgtile-img")?.getAttribute("src")).toBe(ASSET);
	});
});

// ---------------------------------------------------------------------------
// Panel and Card agree
// ---------------------------------------------------------------------------

describe("panel and Card agree on an unresolved link", () => {
	it.each([
		["[[Media/gone.png]]", false],
		["gone.png", false],
		["[[Media/a.png]]", true],
	])("%s -> image drawn: %s", async (value, drawn) => {
		const n = character("Mara", { avatar: value });
		const app = vaultOf([n], MINE);
		const ctx: NoteContext = {
			activeFile: n.file, activeKind: "character", entities: [], backlinks: [], frontmatter: n.fm, resolvedAt: 0,
		};
		const panel = augmentEl(document.createElement("div"));
		await new NativeScopingEngine(app as unknown as ObsidianApp, () => FOLDER).render(null, ctx, panel);
		const card = renderBase(app, [n]);

		const has = (el: HTMLElement): boolean => el.querySelector(".sf-portrait img") !== null;
		expect(has(panel)).toBe(drawn);
		expect(has(card)).toBe(drawn);
	});
});
