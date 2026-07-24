/**
 * workspace-views.test.ts — M5 Phase 6 integration/E2E.
 *
 * Drives BOTH declarative surfaces end-to-end over one rich in-code scene fixture
 * (mirrors the extended seed): the sidebar Navigator (SidebarView tab) and the
 * main-area WorkspaceView (Timeline rail + Plotlines list). Verifies scope →
 * mapSceneRow → models → render → drill, beat-derived act labels, the plotline
 * filter, Unassigned + unresolved buckets, collapse, and the read-only guarantee.
 *
 * @ref docs/XDD/specs/006-declarative-views/plan/phase-6.md (T6.3)
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { App, WorkspaceLeaf, type TFile } from "obsidian";
import {
	createMockCachedMetadata,
	createMockFrontmatterLink,
	createMockTFile,
	type CachedMetadata,
} from "../__mocks__/obsidian";
import { SidebarView } from "views/SidebarView";
import { NativeScopingEngine } from "engines/NativeScopingEngine";
import { NAVIGATOR_TAB_ID, SIDEBAR_VIEW_TYPE } from "pluginConstants";
import { WorkspaceView } from "workspace/WorkspaceView";

const CTX_TAB_ID = "__context__";

interface SceneOpts {
	act: number;
	order: number;
	storyDay: number | null;
	status: string;
	when: string;
	plotlines: string[];
	beat: string;
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
	const plCache = (name: string, status: string): CachedMetadata =>
		createMockCachedMetadata({ tags: [{ tag: "#planning/plotline" }], frontmatter: { type: "plotline", name, status } });
	const beatCache = (name: string): CachedMetadata =>
		createMockCachedMetadata({ frontmatter: { type: "beat", title: name, aliases: [name] } });

	const book = reg(mk("Wardens of Moonharbor", "20 Planning/Wardens of Moonharbor.md"), tag("#planning/book"), "Wardens of Moonharbor");
	reg(mk("The Dying Light", "20 Planning/The Dying Light.md"), plCache("The Dying Light", "active"), "The Dying Light");
	reg(mk("The Warden's Oath", "20 Planning/The Warden's Oath.md"), plCache("The Warden's Oath", "active"), "The Warden's Oath");
	reg(mk("Shadow Trade", "20 Planning/Shadow Trade.md"), plCache("Shadow Trade", "seed"), "Shadow Trade");
	reg(mk("The Failing Light", "20 Planning/The Failing Light.md"), beatCache("The Failing Light"), "The Failing Light");
	reg(mk("The Gathering Dark", "20 Planning/The Gathering Dark.md"), beatCache("The Gathering Dark"), "The Gathering Dark");

	const scene = (n: number, o: SceneOpts): TFile => {
		const path = `10 Manuscript/WoM/Scene ${n}.md`;
		const file = mk(`Scene ${n}`, path);
		const links = [
			createMockFrontmatterLink("book", "Wardens of Moonharbor"),
			createMockFrontmatterLink("pov", "Mara Stoneway"),
			...o.plotlines.map((p, i) => createMockFrontmatterLink(`plotlines.${i}`, p)),
			createMockFrontmatterLink("beat", o.beat),
		];
		reg(file, createMockCachedMetadata({
			tags: [{ tag: "#manuscript/scene" }],
			frontmatter: { type: "scene", act: o.act, order: o.order, storyDay: o.storyDay, status: o.status, when: o.when },
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

	const s1 = scene(1, { act: 1, order: 1, storyDay: 1, status: "draft", when: "Night 1", plotlines: ["The Dying Light"], beat: "The Failing Light" });
	scene(2, { act: 1, order: 2, storyDay: 1, status: "draft", when: "Night 1", plotlines: ["The Dying Light"], beat: "The Failing Light" });
	scene(3, { act: 1, order: 3, storyDay: 2, status: "outline", when: "Night 2", plotlines: ["The Dying Light"], beat: "The Failing Light" });
	scene(4, { act: 2, order: 4, storyDay: 3, status: "outline", when: "Night 3", plotlines: ["The Dying Light", "The Warden's Oath"], beat: "The Gathering Dark" });
	scene(5, { act: 2, order: 5, storyDay: null, status: "outline", when: "", plotlines: ["The Warden's Oath", "The Broken Lens"], beat: "The Gathering Dark" });
	scene(6, { act: 2, order: 6, storyDay: 4, status: "draft", when: "Night 4", plotlines: [], beat: "The Gathering Dark" });

	vi.mocked(app.metadataCache.getFileCache).mockImplementation((f) => caches.get(f) ?? null);
	vi.mocked(app.metadataCache.getFirstLinkpathDest).mockImplementation((l) => byLink.get(l) ?? null);
	vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((p) => byPath.get(p) ?? null);
	vi.mocked(app.vault.getMarkdownFiles).mockReturnValue(all);
	app.metadataCache.resolvedLinks = resolvedLinks;
	app.workspace.getActiveFile = vi.fn(() => book);

	return { app, book, s1 };
}

function makeLeaf(app: App): WorkspaceLeaf {
	const leaf = new WorkspaceLeaf();
	(leaf as unknown as { app: App }).app = app;
	leaf.view.getViewType = vi.fn(() => SIDEBAR_VIEW_TYPE);
	return leaf;
}
function click(el: Element | null, opts: { ctrl?: boolean } = {}): void {
	if (!el) throw new Error("no element to click");
	el.dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: opts.ctrl ?? false }));
}
function texts(host: HTMLElement, sel: string): string[] {
	return [...host.querySelectorAll(sel)].map((e) => e.textContent ?? "");
}

describe("M5 integration — Navigator + WorkspaceView over the extended seed", () => {
	let fx: ReturnType<typeof makeFixture>;

	beforeEach(() => {
		fx = makeFixture();
	});

	it("Navigator: plotline filter, beat-derived act labels, filtering, and scene drill", async () => {
		const view = new SidebarView(makeLeaf(fx.app), undefined, undefined, new NativeScopingEngine(fx.app), undefined, () => "drill");
		await view.onOpen();
		click(view.contentEl.querySelector(`[data-view-id="${NAVIGATOR_TAB_ID}"]`));

		const body = view.contentEl.querySelector(".sf-body") as HTMLElement;
		// Plotline filter list — the two plotlines that have scenes (+ unresolved + Unassigned).
		const plotlines = [...body.querySelectorAll(".sf-nav-pl-row")].map((r) => r.getAttribute("data-sf-plotline"));
		expect(plotlines).toContain("The Dying Light");
		expect(plotlines).toContain("The Warden's Oath");
		// Beat-derived act labels.
		const secLabels = texts(body, ".sf-sec-label");
		expect(secLabels).toContain("Act 1 · The Failing Light");
		expect(secLabels).toContain("Act 2 · The Gathering Dark");
		// Book scope → all six scenes.
		expect(body.querySelectorAll(".sf-nav-sc-row")).toHaveLength(6);

		// Filter to The Warden's Oath → only its two scenes.
		click(body.querySelector(`[data-sf-plotline="The Warden's Oath"]`));
		const body2 = view.contentEl.querySelector(".sf-body") as HTMLElement;
		expect(body2.querySelectorAll(".sf-nav-sc-row")).toHaveLength(2);

		// Clear the filter, then drill a scene → Context tab + drilled subject.
		click(body2.querySelector(`[data-sf-plotline=""]`));
		const body3 = view.contentEl.querySelector(".sf-body") as HTMLElement;
		click(body3.querySelector(`[data-sf-link="${fx.s1.path}"]`));
		const pv = view as unknown as { subject: { file: TFile | null; source: string }; selectedViewId: string | null };
		expect(pv.subject.file?.path).toBe(fx.s1.path);
		expect(pv.subject.source).toBe("drilled");
		expect(view.contentEl.querySelector(`[data-view-id="${CTX_TAB_ID}"]`)?.getAttribute("aria-selected")).toBe("true");

		// Read-only guarantee (F6).
		expect(vi.mocked(fx.app.fileManager.processFrontMatter)).not.toHaveBeenCalled();
		expect(vi.mocked(fx.app.vault.modify)).not.toHaveBeenCalled();
	});

	it("WorkspaceView: Timeline rail (beat act pills) → Plotlines list (Unassigned + unresolved) with collapse", async () => {
		const drill = vi.fn();
		const leaf = new WorkspaceLeaf();
		(leaf as unknown as { app: App }).app = fx.app;
		const view = new WorkspaceView(leaf, { getLinkClickAction: () => "drill", drill });
		await view.onOpen();

		const body = view.contentEl.querySelector(".sf-ws-body") as HTMLElement;
		// Timeline rail: collapsible act sections carry beat-derived labels; one card per scene.
		expect(texts(body, ".sf-sec-label")).toEqual(["Act 1 · The Failing Light", "Act 2 · The Gathering Dark"]);
		expect(body.querySelectorAll(".sf-tl-card")).toHaveLength(6);

		// Switch to Plotlines list.
		view.setLayout("plotlines");
		const labels = texts(body, ".sf-sec-label");
		expect(labels).toEqual(["The Dying Light", "The Warden's Oath", "The Broken Lens", "Unassigned"]);
		// Unresolved group flagged; Unassigned is last.
		const heads = [...body.querySelectorAll(".sf-sec-head")];
		expect(heads.find((h) => h.querySelector(".sf-sec-label")?.textContent === "The Broken Lens")?.classList.contains("sf-pl-unresolved")).toBe(true);

		// Collapse a group → persisted + rendered collapsed.
		click(body.querySelector(`[data-sf-group-key="plotline:The Dying Light"]`));
		const sec = body.querySelector(`[data-sf-group-key="plotline:The Dying Light"]`)?.closest(".sf-section");
		expect(sec?.querySelector(".sf-sec-body")?.classList.contains("sf-sec-body--collapsed")).toBe(true);

		// Read-only guarantee (F6).
		expect(vi.mocked(fx.app.fileManager.processFrontMatter)).not.toHaveBeenCalled();
		expect(vi.mocked(fx.app.vault.modify)).not.toHaveBeenCalled();
	});
});
