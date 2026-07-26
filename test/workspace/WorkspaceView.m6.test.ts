/**
 * WorkspaceView.m6.test.ts — M6 / T6.1.
 *
 * The workspace host gains two interactive layouts (kanban, plotgrid)
 * plus a Timeline Rail|Swimlane toggle + By-key selector + zoom (read-only rail),
 * and OWNS one InteractionHandler + an aria-live region. This suite proves:
 *   - each layout routes to the right renderer,
 *   - the toolbar switches mode / swimlane key / zoom,
 *   - the swimlane key persists per-scope (ADR-20),
 *   - the handler is constructed once and destroyed on close (CON-4),
 *   - a write failure marks the card + fires a Notice (ADR-24),
 *   - the aria-live region is created and announced into (F8),
 *   - a metadataCache.changed subscription is registered (ADR-22),
 *   - the M5 rail/list still render (no regression).
 *
 * Locations layout removed from M6 (→ Codex, tracked in GH #6).
 * Timeline-placement drag deferred (→ GH #7; rail is now read-only).
 *
 * @ref docs/XDD/specs/007-interactive-views/plan/phase-6.md — T6.1
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { App, Notice, WorkspaceLeaf, type TFile } from "obsidian";
import {
	createMockCachedMetadata,
	createMockFrontmatterLink,
	createMockTFile,
	type CachedMetadata,
} from "../__mocks__/obsidian";
import { WorkspaceView } from "workspace/WorkspaceView";

interface SceneOpts {
	act: number;
	order: number;
	storyDay: number | null;
	status: string;
	pov: string;
	location: string;
	plotlines: string[];
}

function makeFixture() {
	const app = new App();
	const caches = new Map<TFile, CachedMetadata>();
	const byPath = new Map<string, TFile>();
	const byLink = new Map<string, TFile>();
	const resolvedLinks: Record<string, Record<string, number>> = {};
	const all: TFile[] = [];

	const mk = (basename: string, path: string): TFile => createMockTFile({ basename, path });
	const reg = (file: TFile, cache: CachedMetadata, linkName?: string): TFile => {
		caches.set(file, cache);
		byPath.set(file.path, file);
		all.push(file);
		if (linkName !== undefined) byLink.set(linkName, file);
		return file;
	};
	const tag = (t: string): CachedMetadata => createMockCachedMetadata({ tags: [{ tag: t }] });
	const plCache = (name: string): CachedMetadata =>
		createMockCachedMetadata({ tags: [{ tag: "#planning/plotline" }], frontmatter: { type: "plotline", name } });

	const book = reg(mk("Wardens of Moonharbor", "20 Planning/Wardens of Moonharbor.md"), tag("#planning/book"), "Wardens of Moonharbor");
	reg(mk("The Dying Light", "20 Planning/The Dying Light.md"), plCache("The Dying Light"), "The Dying Light");
	reg(mk("The Warden's Oath", "20 Planning/The Warden's Oath.md"), plCache("The Warden's Oath"), "The Warden's Oath");
	reg(mk("Mara Stoneway", "30 Canon/Mara Stoneway.md"), tag("#canon/character"), "Mara Stoneway");
	reg(mk("Jonas Kell", "30 Canon/Jonas Kell.md"), tag("#canon/character"), "Jonas Kell");

	const scene = (n: number, o: SceneOpts): TFile => {
		const path = `10 Manuscript/WoM/Scene ${n}.md`;
		const file = mk(`Scene ${n}`, path);
		const links = [
			createMockFrontmatterLink("book", "Wardens of Moonharbor"),
			createMockFrontmatterLink("pov", o.pov),
			createMockFrontmatterLink("location", o.location),
			...o.plotlines.map((p, i) => createMockFrontmatterLink(`plotlines.${i}`, p)),
		];
		reg(file, createMockCachedMetadata({
			tags: [{ tag: "#manuscript/scene" }],
			frontmatter: { type: "scene", title: `Scene ${n}`, act: o.act, order: o.order, storyDay: o.storyDay, status: o.status, when: `Night ${n}` },
			frontmatterLinks: links,
		}));
		const edges: Record<string, number> = { [book.path]: 1 };
		for (const p of o.plotlines) {
			const dest = byLink.get(p);
			if (dest) edges[dest.path] = 1;
		}
		resolvedLinks[path] = edges;
		return file;
	};

	const s1 = scene(1, { act: 1, order: 10, storyDay: 1, status: "draft", pov: "Mara Stoneway", location: "Moonharbor", plotlines: ["The Dying Light"] });
	scene(2, { act: 1, order: 20, storyDay: 2, status: "outline", pov: "Jonas Kell", location: "The Salty Gull", plotlines: ["The Dying Light", "The Warden's Oath"] });
	scene(3, { act: 2, order: 30, storyDay: 3, status: "draft", pov: "Mara Stoneway", location: "Moonharbor", plotlines: ["The Warden's Oath"] });

	vi.mocked(app.metadataCache.getFileCache).mockImplementation((f) => caches.get(f) ?? null);
	vi.mocked(app.metadataCache.getFirstLinkpathDest).mockImplementation((l) => byLink.get(l) ?? null);
	vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((p) => byPath.get(p) ?? null);
	vi.mocked(app.vault.getMarkdownFiles).mockReturnValue(all);
	app.metadataCache.resolvedLinks = resolvedLinks;
	app.workspace.getActiveFile = vi.fn(() => book);

	return { app, book, s1 };
}

function makeView(app: App): WorkspaceView {
	const leaf = new WorkspaceLeaf();
	(leaf as unknown as { app: App }).app = app;
	return new WorkspaceView(leaf, { getLinkClickAction: () => "drill", drill: vi.fn() });
}
function body(view: WorkspaceView): HTMLElement {
	return view.contentEl.querySelector(".sf-ws-body") as HTMLElement;
}
function click(el: Element | null): void {
	if (!el) throw new Error("no element to click");
	el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

describe("WorkspaceView M6 — layout routing", () => {
	let fx: ReturnType<typeof makeFixture>;
	let view: WorkspaceView;

	beforeEach(async () => {
		Notice._reset();
		fx = makeFixture();
		view = makeView(fx.app);
		await view.onOpen();
	});

	it("M5 regression: Timeline rail renders act sections + one card per scene", () => {
		expect(body(view).querySelectorAll(".sf-tl-card")).toHaveLength(3);
		expect(body(view).querySelectorAll(".sf-section").length).toBe(2);
	});

	it("M5 regression: Plotlines list still renders plotline sections", () => {
		view.setLayout("plotlines");
		expect(body(view).querySelector(".sf-tl-card")).toBeNull();
		expect(body(view).querySelectorAll(".sf-section").length).toBeGreaterThan(0);
	});

	it("routes the kanban layout to the Kanban board", () => {
		view.setLayout("kanban");
		expect(body(view).querySelector(".sf-kb-board")).not.toBeNull();
		// Six status columns from the vocab.
		expect(body(view).querySelectorAll(".sf-kb-col").length).toBeGreaterThanOrEqual(6);
		expect(body(view).querySelectorAll(".sf-kb-card")).toHaveLength(3);
	});

	it("routes the plotgrid layout to the Plotgrid matrix", () => {
		view.setLayout("plotgrid");
		expect(body(view).querySelector(".sf-pg-table")).not.toBeNull();
		expect(body(view).querySelectorAll(".sf-pg-cell").length).toBeGreaterThan(0);
	});
});

describe("WorkspaceView M6 — Timeline toolbar", () => {
	let fx: ReturnType<typeof makeFixture>;
	let view: WorkspaceView;

	beforeEach(async () => {
		fx = makeFixture();
		view = makeView(fx.app);
		await view.onOpen();
	});

	it("switches Rail → Swimlane and renders lanes", () => {
		click(view.contentEl.querySelector(`[data-ws-tlmode="swimlane"]`));
		expect(body(view).querySelector(".sf-sw-lanes")).not.toBeNull();
		expect(body(view).querySelector(".sf-zoom-bar")).toBeNull();
	});

	it("rail mode wraps the timeline in a zoom control bar", () => {
		expect(body(view).querySelector(".sf-zoom-bar")).not.toBeNull();
		expect(body(view).querySelector(".sf-zoom-scaled .sf-tl-rail")).not.toBeNull();
	});

	it("changes the swimlane grouping key (By POV → lanes named for POV characters)", () => {
		click(view.contentEl.querySelector(`[data-ws-tlmode="swimlane"]`));
		click(view.contentEl.querySelector(`[data-ws-swimkey="pov"]`));
		const labels = [...body(view).querySelectorAll(".sf-sec-label")].map((e) => e.textContent);
		expect(labels).toContain("Mara Stoneway");
		expect(labels).toContain("Jonas Kell");
	});

	it("persists the swimlane key per-scope (selected key wins after a re-render)", () => {
		click(view.contentEl.querySelector(`[data-ws-tlmode="swimlane"]`));
		click(view.contentEl.querySelector(`[data-ws-swimkey="location"]`));
		// A fresh render (re-selecting the layout) keeps the chosen swimlane key.
		view.setLayout("timeline");
		const sel = view.contentEl.querySelector(`[data-ws-swimkey="location"]`);
		expect(sel?.classList.contains("sf-ws-tlkey-opt--sel")).toBe(true);
	});

	it("zoom-in changes the scale custom property", () => {
		const scaled = body(view).querySelector(".sf-zoom-scaled") as HTMLElement;
		expect(scaled.style.getPropertyValue("--sf-zoom") || "1").toBe("1");
		click(body(view).querySelector(`[aria-label="Zoom in"]`));
		expect(scaled.style.getPropertyValue("--sf-zoom")).not.toBe("1");
	});
});

describe("WorkspaceView M6 — handler lifecycle + aria-live", () => {
	it("creates an aria-live=polite region", async () => {
		const fx = makeFixture();
		const view = makeView(fx.app);
		await view.onOpen();
		const live = view.contentEl.querySelector(".sf-ws-live");
		expect(live).not.toBeNull();
		expect(live?.getAttribute("aria-live")).toBe("polite");
	});

	it("constructs exactly one InteractionHandler and destroys it on close", async () => {
		const fx = makeFixture();
		const view = makeView(fx.app);
		await view.onOpen();
		const pv = view as unknown as { _handler: { destroy: () => void } | null };
		expect(pv._handler).not.toBeNull();
		const destroySpy = vi.spyOn(pv._handler!, "destroy");
		await view.onClose();
		expect(destroySpy).toHaveBeenCalledTimes(1);
		expect(pv._handler).toBeNull();
	});

	it("registers a metadataCache 'changed' subscription (ADR-22)", async () => {
		const fx = makeFixture();
		const view = makeView(fx.app);
		await view.onOpen();
		expect(vi.mocked(fx.app.metadataCache.on)).toHaveBeenCalledWith("changed", expect.any(Function));
	});

	it("announces a committed keyboard write into the aria-live region", async () => {
		const fx = makeFixture();
		const view = makeView(fx.app);
		await view.onOpen();
		const pv = view as unknown as { _announce: (m: string) => void };
		pv._announce("Updated Scene 1: storyDay=2");
		expect(view.contentEl.querySelector(".sf-ws-live")?.textContent).toBe("Updated Scene 1: storyDay=2");
	});
});

describe("WorkspaceView M6 — write-error surface (ADR-24)", () => {
	it("marks the card with an error class and fires a Notice on write failure", async () => {
		Notice._reset();
		const fx = makeFixture();
		const view = makeView(fx.app);
		await view.onOpen();
		view.setLayout("kanban");

		const pv = view as unknown as {
			_surfaceWriteError: (file: TFile, result: { ok: false; reason: string; message: string; keepDirty: true }) => void;
		};
		pv._surfaceWriteError(fx.s1, { ok: false, reason: "write", message: "Couldn't write frontmatter. Your edits are kept.", keepDirty: true });

		const card = [...body(view).querySelectorAll(".sf-kb-card")].find(
			(c) => c.getAttribute("data-sf-card-path") === fx.s1.path,
		);
		expect(card?.classList.contains("sf-card--error")).toBe(true);
		expect(Notice._instances.length).toBe(1);
		expect(Notice._instances[0]!.message).toContain("Couldn't write");
	});
});
