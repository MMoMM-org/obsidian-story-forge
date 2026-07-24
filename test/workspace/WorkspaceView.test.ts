/**
 * WorkspaceView.test.ts — M5 Phase 5 (RED).
 *
 * The main-area Timeline/Plotlines ItemView: renders the rail/list, toggles layout,
 * drills scene clicks, persists Plotlines collapse, and shows the no-scope hint.
 *
 * @ref docs/XDD/specs/006-declarative-views/plan/phase-5.md
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { App, WorkspaceLeaf, type TFile } from "obsidian";
import {
	createMockCachedMetadata,
	createMockFrontmatterLink,
	createMockTFile,
	type CachedMetadata,
} from "../__mocks__/obsidian";
import { WorkspaceView, WORKSPACE_VIEW_TYPE } from "workspace/WorkspaceView";

// ---- mini scene-vault ------------------------------------------------------
const book = createMockTFile({ basename: "Wardens of Moonharbor", path: "20 Planning/Wardens of Moonharbor.md" });
const dying = createMockTFile({ basename: "The Dying Light", path: "20 Planning/The Dying Light.md" });
const oath = createMockTFile({ basename: "The Warden's Oath", path: "20 Planning/The Warden's Oath.md" });
const character = createMockTFile({ basename: "Mara Stoneway", path: "30 Canon/Mara Stoneway.md" });
const s1 = createMockTFile({ basename: "Scene 1", path: "10 Manuscript/WoM/Scene 1.md" });
const s2 = createMockTFile({ basename: "Scene 2", path: "10 Manuscript/WoM/Scene 2.md" });
const s3 = createMockTFile({ basename: "Scene 3", path: "10 Manuscript/WoM/Scene 3.md" });

function tag(t: string): CachedMetadata {
	return createMockCachedMetadata({ tags: [{ tag: t }] });
}
function sceneCache(act: number, order: number, status: string, plotline: string): CachedMetadata {
	return createMockCachedMetadata({
		tags: [{ tag: "#manuscript/scene" }],
		frontmatter: { type: "scene", act, order, status, when: "Night 1" },
		frontmatterLinks: [
			createMockFrontmatterLink("book", "Wardens of Moonharbor"),
			createMockFrontmatterLink("plotlines.0", plotline),
		],
	});
}

function content(view: WorkspaceView): HTMLElement {
	return view.contentEl;
}
function bodyOf(view: WorkspaceView): HTMLElement {
	return view.contentEl.querySelector(".sf-ws-body") as HTMLElement;
}
function click(el: Element | null, opts: { ctrl?: boolean } = {}): void {
	if (!el) throw new Error("no element to click");
	el.dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: opts.ctrl ?? false }));
}

describe("WorkspaceView", () => {
	let app: App;
	let view: WorkspaceView;
	let activeFile: TFile | null;
	let drill: ReturnType<typeof vi.fn>;
	let clickAction: "drill" | "open";

	beforeEach(async () => {
		app = new App();
		activeFile = book;
		clickAction = "drill";
		drill = vi.fn();

		const caches = new Map<TFile, CachedMetadata>([
			[book, tag("#planning/book")],
			[dying, tag("#planning/plotline")],
			[oath, tag("#planning/plotline")],
			[character, tag("#canon/character")],
			[s1, sceneCache(1, 1, "draft", "The Dying Light")],
			[s2, sceneCache(1, 2, "draft", "The Dying Light")],
			[s3, sceneCache(2, 3, "outline", "The Warden's Oath")],
		]);
		const byPath = new Map<string, TFile>([book, dying, oath, character, s1, s2, s3].map((f) => [f.path, f]));
		const byLink = new Map<string, TFile>([
			["Wardens of Moonharbor", book],
			["The Dying Light", dying],
			["The Warden's Oath", oath],
		]);

		vi.mocked(app.metadataCache.getFileCache).mockImplementation((f) => caches.get(f) ?? null);
		vi.mocked(app.metadataCache.getFirstLinkpathDest).mockImplementation((l) => byLink.get(l) ?? null);
		vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((p) => byPath.get(p) ?? null);
		vi.mocked(app.vault.getMarkdownFiles).mockReturnValue([book, dying, oath, character, s1, s2, s3]);
		app.metadataCache.resolvedLinks = {
			"10 Manuscript/WoM/Scene 1.md": { "20 Planning/Wardens of Moonharbor.md": 1, "20 Planning/The Dying Light.md": 1 },
			"10 Manuscript/WoM/Scene 2.md": { "20 Planning/Wardens of Moonharbor.md": 1, "20 Planning/The Dying Light.md": 1 },
			"10 Manuscript/WoM/Scene 3.md": { "20 Planning/Wardens of Moonharbor.md": 1, "20 Planning/The Warden's Oath.md": 1 },
		};
		app.workspace.getActiveFile = vi.fn(() => activeFile);
		app.workspace.openLinkText = vi.fn(async () => {});

		const leaf = new WorkspaceLeaf();
		(leaf as unknown as { app: App }).app = app;
		view = new WorkspaceView(leaf, { getLinkClickAction: () => clickAction, drill });
		await view.onOpen();
	});

	it("has the workspace view type and renders the Timeline rail with a header toggle", () => {
		expect(view.getViewType()).toBe(WORKSPACE_VIEW_TYPE);
		expect(content(view).querySelector(".sf-ws-toggle")).not.toBeNull();
		// Acts are collapsible sections; one card per scene.
		expect(bodyOf(view).querySelectorAll(".sf-section").length).toBe(2);
		expect(bodyOf(view).querySelectorAll(".sf-tl-card")).toHaveLength(3);
	});

	it("drills when the card body (not just the title) is clicked", () => {
		// Click the plain-text title inside the card — closest([data-sf-link]) is the card.
		click(bodyOf(view).querySelector(".sf-tl-card .sf-tl-ct"));
		expect(drill).toHaveBeenCalledTimes(1);
		expect((drill.mock.calls[0]![0] as TFile).path).toBe(s1.path);
	});

	it("switches to the Plotlines list via setLayout and via the header toggle", () => {
		view.setLayout("plotlines");
		expect(bodyOf(view).querySelectorAll(".sf-section").length).toBe(2); // Dying Light + Oath
		expect(bodyOf(view).querySelector(".sf-tl-card")).toBeNull();

		// Toggle back to Timeline via a header click.
		click(content(view).querySelector(`[data-ws-layout="timeline"]`));
		expect(bodyOf(view).querySelector(".sf-tl-card")).not.toBeNull();
	});

	it("drills a scene click (and opens on modifier-click)", () => {
		click(bodyOf(view).querySelector(`[data-sf-link="${s1.path}"]`));
		expect(drill).toHaveBeenCalledTimes(1);
		expect((drill.mock.calls[0]![0] as TFile).path).toBe(s1.path);

		click(bodyOf(view).querySelector(`[data-sf-link="${s2.path}"]`), { ctrl: true });
		expect(app.workspace.openLinkText).toHaveBeenCalledWith(s2.path, "", false);
	});

	it("persists Plotlines collapse across a re-render", () => {
		view.setLayout("plotlines");
		click(bodyOf(view).querySelector(`[data-sf-group-key="plotline:The Dying Light"]`));

		const pv = view as unknown as {
			_collapse: { isCollapsed: (s: string, sc: string, g: string) => boolean };
			_scopeKey: string;
		};
		expect(pv._collapse.isCollapsed("main", pv._scopeKey, "plotline:The Dying Light")).toBe(true);
		const sec = bodyOf(view).querySelector(`[data-sf-group-key="plotline:The Dying Light"]`)?.closest(".sf-section");
		expect(sec?.querySelector(".sf-sec-body")?.classList.contains("sf-sec-body--collapsed")).toBe(true);
	});

	it("shows the no-scope hint when the active note is not a book/plotline/scene", async () => {
		activeFile = character;
		const leaf = new WorkspaceLeaf();
		(leaf as unknown as { app: App }).app = app;
		const v = new WorkspaceView(leaf, { getLinkClickAction: () => clickAction, drill });
		await v.onOpen();
		expect(bodyOf(v).querySelector(".sf-ws-hint")).not.toBeNull();
		// still whole-vault scenes
		expect(bodyOf(v).querySelectorAll(".sf-tl-card")).toHaveLength(3);
	});
});
