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

import { afterEach, describe, it, expect, vi } from "vitest";
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
import { DEBOUNCE_MS } from "pluginConstants";
import { AnvilView } from "anvil/AnvilView";
import { CardBasesView } from "bases/CardBasesView";
import { CODEX_CARD_REGISTRY } from "codex/builtinCards";
import { NativeScopingEngine } from "engines/NativeScopingEngine";
import { createFileClassCache, type FileClassCache } from "fileclass/fileClassVault";
import type { NoteContext } from "scoping/NoteContext";

const FOLDER = "00 Meta/FileClasses";

function cacheOver(app: App): FileClassCache {
	return createFileClassCache(app as unknown as ObsidianApp, () => FOLDER, () => {});
}
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

const FC_MINE_FILE = createMockTFile({ path: `${FOLDER}/fc-mine.md`, basename: "fc-mine" });

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
	const view = new AnvilView(leaf as never, { editor: { fileClasses: cacheOver(app) } });
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

	it("scans the folder once per cache generation, not once per card or per render", async () => {
		// No `fileClass` key: every card must be claimed by tag, which scans. The
		// FileClass's own read is the count: the note index scans the vault too.
		const notes = Array.from({ length: 25 }, (_, i) =>
			note(`30 Canon/31 Characters/C${i}.md`, { tags: ["canon/character"] }));
		const app = vaultOf(notes, { "fc-mine": fileClass([["avatar", "Media"]], ["canon/character"]) });
		const leaf = new WorkspaceLeaf();
		(leaf as unknown as { app: unknown }).app = app;
		const view = new AnvilView(leaf as never, { editor: { fileClasses: cacheOver(app) } });
		await view.onOpen();
		view.setLayout("codex");
		const scans = vi.mocked(app.vault.getMarkdownFiles);
		const scansFor = (act: () => void): number => {
			scans.mockClear();
			act();
			view.setLayout("codex");
			return scans.mock.calls.length;
		};

		// The Anvil and its note index scan for their own reasons, so the cache's
		// share is the difference: a note's change costs it nothing, however many
		// cards there are, and a FileClass's change costs it one scan.
		const afterNote = scansFor(() => { app.metadataCache._trigger("changed", notes[0]!.file); });
		const afterClass = scansFor(() => { app.metadataCache._trigger("changed", FC_MINE_FILE); });
		expect(afterClass - afterNote).toBe(1);
		await view.onClose();
	});
});

// ---------------------------------------------------------------------------
// Standalone .base
// ---------------------------------------------------------------------------

afterEach(() => { document.body.replaceChildren(); });

type ValueOf = (n: Note, id: string) => { toString(): string } | null;

const displayValue: ValueOf = (n, id) => ({ toString: () => String(n.fm[id] ?? "") });

function renderBase(
	app: App,
	notes: readonly Note[],
	fileClasses: FileClassCache | undefined = cacheOver(app),
	valueOf: ValueOf = displayValue,
): HTMLElement {
	return baseView(app, notes, fileClasses, valueOf).container;
}

function baseView(
	app: App,
	notes: readonly Note[],
	fileClasses: FileClassCache | undefined,
	valueOf: ValueOf = displayValue,
	draw = true,
): { view: CardBasesView; container: HTMLElement } {
	const container = document.createElement("div");
	// Bases hands a view an attached container; a detached one reads as dropped.
	document.body.appendChild(container);
	const view = new CardBasesView("story-forge-hero", new QueryController(), container, {
		app: app as unknown as ObsidianApp,
		registry: CODEX_CARD_REGISTRY,
		cardId: "hero",
		onEntryClick: vi.fn(),
		...(fileClasses ? { fileClasses } : {}),
	});
	const entries = notes.map((n) => {
		const e = new BasesEntry();
		e.file = n.file;
		e.getValue.mockImplementation((id: string) => valueOf(n, id));
		return e;
	});
	const result = new BasesQueryResult();
	result.data = entries;
	if (draw) {
		(view as unknown as { data: BasesQueryResult }).data = result;
		view.onDataUpdated();
	}
	return { view, container };
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

	it("draws the monogram for a list-style display string, which names no single asset", () => {
		const n = character("Mara", { avatar: "[[Media/a.png]]" });
		const list: ValueOf = (_n, id) => ({ toString: () => (id === "avatar" ? "a.png, b.png" : "") });
		const app = vaultOf([n], MINE);
		const el = renderBase(app, [n], cacheOver(app), list);
		expect(el.querySelector(".sf-portrait img")).toBeNull();
		expect(el.querySelector(".sf-portrait-mono")).not.toBeNull();
	});

	it("draws the monogram when the Media field's value is null", () => {
		const n = character("Mara", { avatar: "[[Media/a.png]]" });
		const app = vaultOf([n], MINE);
		const el = renderBase(app, [n], cacheOver(app), () => null);
		expect(el.querySelector(".sf-portrait img")).toBeNull();
		expect(el.querySelector(".sf-portrait-mono")).not.toBeNull();
	});

	it("scans the vault once per cache generation, not once per card or per repaint", () => {
		const notes = Array.from({ length: 25 }, (_, i) =>
			note(`30 Canon/31 Characters/C${i}.md`, { tags: ["canon/character"] }));
		const app = vaultOf(notes, { "fc-mine": fileClass([["avatar", "Media"]], ["canon/character"]) });
		const scans = vi.mocked(app.vault.getMarkdownFiles);
		scans.mockClear();

		const { view } = baseView(app, notes, cacheOver(app));
		expect(scans).toHaveBeenCalledTimes(1);

		view.onDataUpdated();
		expect(scans).toHaveBeenCalledTimes(1);

		app.metadataCache._trigger("changed", FC_MINE_FILE);
		view.onDataUpdated();
		expect(scans).toHaveBeenCalledTimes(2);
	});

	const FACE = "https://x.test/f.png";

	function retyped(): { app: App; mara: Note; declare: () => void } {
		const mara = character("Mara", { avatar: "[[Media/a.png]]", face: FACE });
		const app = vaultOf([mara], MINE);
		const cached = vi.mocked(app.metadataCache.getFileCache);
		const before = cached.getMockImplementation();
		const after = createMockCachedMetadata({ frontmatter: fileClass([["face", "Media"]]) });
		return {
			app,
			mara,
			declare: (): void => {
				cached.mockImplementation((file) => (file.path === FC_MINE_FILE.path ? after : before?.(file) ?? null));
				app.metadataCache._trigger("changed", FC_MINE_FILE);
			},
		};
	}

	describe("when a FileClass changes", () => {
		it("repaints a drawn grid with the field the FileClass now types", () => {
			vi.useFakeTimers();
			try {
				const { app, mara, declare } = retyped();
				const el = renderBase(app, [mara]);
				expect(el.querySelector(".sf-portrait img")?.getAttribute("src")).toBe(ASSET);

				declare();
				vi.advanceTimersByTime(DEBOUNCE_MS);

				expect(el.querySelector(".sf-portrait img")?.getAttribute("src")).toBe(FACE);
			} finally {
				vi.useRealTimers();
			}
		});

		it("does not draw a grid Bases has not handed any data yet", () => {
			vi.useFakeTimers();
			try {
				const { app, declare } = retyped();
				const { view, container } = baseView(app, [], cacheOver(app), displayValue, false);
				(view as unknown as { data: unknown }).data = undefined;

				declare();
				vi.advanceTimersByTime(DEBOUNCE_MS);

				expect(container.children).toHaveLength(0);
			} finally {
				vi.useRealTimers();
			}
		});

		it("forgets the grid once it is unloaded", () => {
			vi.useFakeTimers();
			try {
				const { app, mara, declare } = retyped();
				const { view, container } = baseView(app, [mara], cacheOver(app));
				const drawn = container.querySelector(".sf-cx-grid");
				const spy = vi.spyOn(view, "onDataUpdated");

				view.unload();
				declare();
				vi.advanceTimersByTime(DEBOUNCE_MS);

				expect(spy).not.toHaveBeenCalled();
				expect(container.querySelector(".sf-cx-grid")).toBe(drawn);
			} finally {
				vi.useRealTimers();
			}
		});
	});

	describe("the FileClass subscription", () => {
		/** A cache that counts how many of its subscribers are still listening. */
		function counted(app: App): { cache: FileClassCache; live: () => number } {
			const inner = cacheOver(app);
			let live = 0;
			const cache: FileClassCache = {
				lookup: inner.lookup,
				nameFor: (file) => inner.nameFor(file),
				subscribe: (listener) => {
					live += 1;
					const leave = inner.subscribe(listener);
					let left = false;
					return () => { if (!left) { left = true; live -= 1; } leave(); };
				},
			};
			return { cache, live: () => live };
		}

		it("does not repaint before Bases has called onDataUpdated", () => {
			vi.useFakeTimers();
			try {
				const { app, declare } = retyped();
				const { view } = baseView(app, [], cacheOver(app), displayValue, false);
				const spy = vi.spyOn(view, "onDataUpdated");

				declare();
				vi.advanceTimersByTime(DEBOUNCE_MS);

				expect(spy).not.toHaveBeenCalled();
			} finally {
				vi.useRealTimers();
			}
		});

		it("leaves the cache when the view unloads", () => {
			const { app, mara } = retyped();
			const { cache, live } = counted(app);
			const { view } = baseView(app, [mara], cache);
			expect(live()).toBe(1);

			view.unload();

			expect(live()).toBe(0);
		});

		it("does nothing, and leaves the cache, once its container is disconnected", () => {
			vi.useFakeTimers();
			try {
				const { app, mara, declare } = retyped();
				const { cache, live } = counted(app);
				const { view, container } = baseView(app, [mara], cache);
				const spy = vi.spyOn(view, "onDataUpdated");

				container.remove();
				declare();
				vi.advanceTimersByTime(DEBOUNCE_MS);

				expect(spy).not.toHaveBeenCalled();
				expect(live()).toBe(0);
			} finally {
				vi.useRealTimers();
			}
		});
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
		await new NativeScopingEngine(app as unknown as ObsidianApp, cacheOver(app)).render(null, ctx, panel);
		const card = renderBase(app, [n]);

		const has = (el: HTMLElement): boolean => el.querySelector(".sf-portrait img") !== null;
		expect(has(panel)).toBe(drawn);
		expect(has(card)).toBe(drawn);
	});
});
