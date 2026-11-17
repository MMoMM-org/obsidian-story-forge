/**
 * AnvilView.plotgridMatrix.test.ts — spec 008 T8.4: the Plotgrid coverage matrix
 * on the moved surface behaves as before.
 *
 * renderPlotgrid's own matrix semantics are covered on fixed models
 * (test/workspace/renderPlotgrid.test.ts). This pins the Anvil's wiring into it,
 * which the move touched (ADR-27) and T3.5 re-plumbed (excluded folders):
 * columns are ALL scope plotlines — a plotline with no scene keeps its column,
 * a template under the default-excluded `00 Meta` gets none — and each
 * scene × plotline cell is filled exactly when the scene is on that plotline.
 *
 * @ref docs/XDD/specs/008-codex-surface/plan/phase-8.md — T8.4
 * @ref docs/XDD/specs/007-interactive-views/solution.md — Plotgrid (read-only matrix)
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { App, WorkspaceLeaf, type TFile } from "obsidian";
import { createMockCachedMetadata, createMockFrontmatterLink, createMockTFile, type CachedMetadata } from "../__mocks__/obsidian";
import { AnvilView } from "anvil/AnvilView";

function makeFixture(): { app: App } {
	const app = new App();
	const caches = new Map<TFile, CachedMetadata>();
	const byLink = new Map<string, TFile>();
	const byPath = new Map<string, TFile>();
	const resolvedLinks: Record<string, Record<string, number>> = {};
	const all: TFile[] = [];
	const reg = (basename: string, path: string, cache: CachedMetadata): TFile => {
		const file = createMockTFile({ basename, path });
		caches.set(file, cache);
		byLink.set(basename, file);
		byPath.set(path, file);
		all.push(file);
		return file;
	};
	const plotline = (name: string, folder = "20 Planning"): TFile =>
		reg(name, `${folder}/${name}.md`, createMockCachedMetadata({
			tags: [{ tag: "#planning/plotline" }],
			frontmatter: { type: "plotline", name },
		}));

	const book = reg("Wardens of Moonharbor", "20 Planning/Wardens of Moonharbor.md",
		createMockCachedMetadata({ tags: [{ tag: "#planning/book" }] }));
	plotline("The Dying Light");
	plotline("The Warden's Oath");
	plotline("The Drowned Bell"); // no scene is on it
	plotline("Plotline Template", "00 Meta"); // excluded by the default excluded folders

	const scene = (n: number, plotlines: string[]): void => {
		const path = `10 Manuscript/WoM/Scene ${n}.md`;
		reg(`Scene ${n}`, path, createMockCachedMetadata({
			tags: [{ tag: "#manuscript/scene" }],
			frontmatter: { type: "scene", title: `Scene ${n}`, act: 1, order: n * 10, storyDay: n, status: "draft", when: `Night ${n}` },
			frontmatterLinks: [
				createMockFrontmatterLink("book", "Wardens of Moonharbor"),
				...plotlines.map((p, i) => createMockFrontmatterLink(`plotlines.${i}`, p)),
			],
		}));
		const edges: Record<string, number> = { [book.path]: 1 };
		for (const p of plotlines) edges[byLink.get(p)!.path] = 1;
		resolvedLinks[path] = edges;
	};
	scene(1, ["The Dying Light"]);
	scene(2, ["The Dying Light", "The Warden's Oath"]);
	scene(3, []); // on no plotline: still a row, every cell empty

	vi.mocked(app.metadataCache.getFileCache).mockImplementation((f) => caches.get(f) ?? null);
	vi.mocked(app.metadataCache.getFirstLinkpathDest).mockImplementation((l) => byLink.get(l) ?? null);
	vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((p) => byPath.get(p) ?? null);
	vi.mocked(app.vault.getMarkdownFiles).mockReturnValue(all);
	app.metadataCache.resolvedLinks = resolvedLinks;
	app.workspace.getActiveFile = vi.fn(() => book);
	return { app };
}

describe("AnvilView — Plotgrid coverage matrix (T8.4)", () => {
	let view: AnvilView;

	beforeEach(async () => {
		const { app } = makeFixture();
		const leaf = new WorkspaceLeaf();
		leaf.app = app;
		view = new AnvilView(leaf, { settings: { getLinkClickAction: () => "drill" }, drill: vi.fn() });
		await view.onOpen();
		view.setLayout("plotgrid");
	});

	it("columns are every scope plotline (a scene-less one included, the 00 Meta template not)", () => {
		const cols = [...view.contentEl.querySelectorAll("[data-sf-plotline-col]")].map((c) => c.getAttribute("data-sf-plotline-col"));
		expect(cols).toEqual(["The Drowned Bell", "The Dying Light", "The Warden's Oath"]);
	});

	it("each scene × plotline cell is filled exactly when the scene is on that plotline", () => {
		const matrix: Record<string, string[]> = {};
		for (const cell of view.contentEl.querySelectorAll<HTMLElement>(".sf-pg-cell[data-sf-scene]")) {
			const scene = cell.getAttribute("data-sf-scene")!.replace(/^.*\/|\.md$/g, "");
			(matrix[scene] ??= []).push(`${cell.getAttribute("data-sf-plotline")}:${cell.classList.contains("sf-pg-cell--filled") ? "x" : "-"}`);
		}
		expect(matrix).toEqual({
			"Scene 1": ["The Drowned Bell:-", "The Dying Light:x", "The Warden's Oath:-"],
			"Scene 2": ["The Drowned Bell:-", "The Dying Light:x", "The Warden's Oath:x"],
			"Scene 3": ["The Drowned Bell:-", "The Dying Light:-", "The Warden's Oath:-"],
		});
	});
});
