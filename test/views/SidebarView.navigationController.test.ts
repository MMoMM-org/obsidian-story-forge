/**
 * SidebarView.navigationController.test.ts — T2.5 (spec 008-codex-surface, Phase 2).
 *
 * Wires SidebarView's body click routing (`_onBodyActivate`) to the shared
 * `NavigationController` (ADR-28). The Workbench's own meaning of "inspect"
 * — drill in place, suspending follow-the-active-note until Back or
 * open-note resumes it — already existed via `_drillInto`; this file proves
 * that meaning survives being reached through the controller, and that
 * open-note never silently changes the panel's selected tab (unlike drill,
 * which deliberately switches out of the Navigator tab — see
 * `_inspectInWorkbench`).
 *
 * The existing regression suite (`SidebarView.navigation.test.ts` and
 * friends) already exercises drill/open/back/keyboard-parity/Navigator
 * exhaustively through the real DOM; none of those assertions changed by
 * this wiring. This file adds the specific ACs T2.5 calls out plus the
 * repo invariant (bare click ⇒ no action, no write).
 *
 * @ref docs/XDD/specs/008-codex-surface/requirements.md — Feature F2
 * @ref docs/XDD/specs/008-codex-surface/solution.md — ADR-28
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { App, WorkspaceLeaf, TFile } from "obsidian";
import { SidebarView } from "views/SidebarView";
import { NativeScopingEngine } from "engines/NativeScopingEngine";
import { SIDEBAR_VIEW_TYPE, NAVIGATOR_TAB_ID } from "pluginConstants";
import type { NoteContext } from "scoping/NoteContext";
import type { EngineRegistry } from "engines/QueryEngine";
import type { ConsentGate } from "consent/ConsentGate";
import type { ViewRecord } from "store/types";
import { makeDummyViewRecord } from "../helpers/viewFixtures";
import {
	createMockCachedMetadata,
	createMockFrontmatterLink,
	createMockTFile,
	type CachedMetadata,
} from "../__mocks__/obsidian";

function makeRegistry(): EngineRegistry {
	return { get: vi.fn(() => undefined) } as unknown as EngineRegistry;
}
function makeGate(): ConsentGate {
	return {
		evaluate: vi.fn(async () => ({ status: "consented" })),
		requestConsent: vi.fn(async () => false),
		requestReConsent: vi.fn(async () => false),
	} as unknown as ConsentGate;
}

function makeOwnLeaf(app: App): WorkspaceLeaf {
	const leaf = new WorkspaceLeaf();
	leaf.app = app;
	leaf.view.getViewType = vi.fn(() => SIDEBAR_VIEW_TYPE);
	return leaf;
}

function makeMdLeaf(file: TFile | null = null): WorkspaceLeaf {
	const leaf = new WorkspaceLeaf();
	leaf.view.getViewType = vi.fn(() => "markdown");
	leaf.view.file = file;
	return leaf;
}

function makeMdFile(basename: string): TFile {
	const f = new TFile();
	f.path = `${basename}.md`;
	f.name = `${basename}.md`;
	f.basename = basename;
	f.extension = "md";
	return f;
}

function getBody(view: SidebarView): HTMLElement {
	return view.contentEl.querySelector(".sf-body") as HTMLElement;
}

function registerCharacter(app: App, file: TFile): void {
	app.vault.getAbstractFileByPath = vi.fn((p: string) =>
		p === file.path ? file : null,
	) as unknown as App["vault"]["getAbstractFileByPath"];
	app.metadataCache.getFileCache = vi.fn(() => ({
		tags: [{ tag: "#canon/character" }],
		frontmatter: {},
	}));
}

function clickLink(view: SidebarView, path: string, opts: { meta?: boolean } = {}): void {
	const el = getBody(view).querySelector(`[data-sf-link="${path}"]`) as HTMLElement | null;
	if (!el) throw new Error(`no link element for path ${path}`);
	el.dispatchEvent(new MouseEvent("click", { bubbles: true, metaKey: opts.meta ?? false }));
}

describe("SidebarView: inspect suspends follow until Back or open-note resumes it [PRD/F2 AC]", () => {
	let app: App;
	let view: SidebarView;

	beforeEach(async () => {
		vi.useFakeTimers();
		app = new App();
		const leaf = makeOwnLeaf(app);
		const native = new NativeScopingEngine(app);
		view = new SidebarView(leaf, makeRegistry(), makeGate(), native, undefined, () => "drill");
		await view.onOpen();
	});

	afterEach(async () => {
		await view.onClose();
		vi.useRealTimers();
	});

	function seedResolved(from: TFile, to: TFile): void {
		registerCharacter(app, to);
		const ctx: NoteContext = {
			activeFile: from,
			activeKind: "character",
			entities: [{ file: to, kind: "character", relation: "outgoing", field: "enemies" }],
			backlinks: [],
			frontmatter: {},
			resolvedAt: Date.now(),
		};
		const pv = view as unknown as {
			subject: { file: TFile | null; source: string };
			currentCtx: NoteContext;
			currentRecord: ViewRecord | null;
			_renderState(s: { kind: string; ctx: NoteContext }): void;
		};
		pv.subject = { file: from, source: "follow" };
		pv.currentCtx = ctx;
		pv.currentRecord = makeDummyViewRecord();
		pv._renderState({ kind: "resolved", ctx });
	}

	it("after inspecting (drilling), the active-leaf-change follow pipeline no longer re-subjects", () => {
		const from = makeMdFile("Mara Stoneway");
		const to = makeMdFile("Silvan Nightweaver");
		seedResolved(from, to);

		clickLink(view, to.path);
		const pv = view as unknown as { subject: { file: TFile | null; source: string } };
		expect(pv.subject.source).toBe("drilled");

		// Some unrelated note becomes active in the editor — follow must stay suspended.
		const elsewhere = makeMdFile("Elsewhere");
		app.workspace.getActiveViewOfType = vi.fn(() => null);
		app.workspace._trigger("active-leaf-change", makeMdLeaf(elsewhere));
		vi.advanceTimersByTime(300);

		expect(pv.subject.file?.path).toBe(to.path);
		expect(pv.subject.source).toBe("drilled");
	});

	it("Back resumes follow: a subsequent active-leaf-change re-subjects again", () => {
		const from = makeMdFile("Mara Stoneway");
		const to = makeMdFile("Silvan Nightweaver");
		seedResolved(from, to);
		clickLink(view, to.path);

		const back = view.contentEl.querySelector('.sf-chead [data-sf-nav="back"]') as HTMLElement;
		back.dispatchEvent(new MouseEvent("click", { bubbles: true }));

		const pv = view as unknown as { subject: { file: TFile | null; source: string } };
		expect(pv.subject.source).toBe("follow");

		const elsewhere = makeMdFile("Elsewhere");
		app.workspace.getActiveViewOfType = vi.fn(() => null);
		app.metadataCache.getFileCache = vi.fn(() => ({ frontmatter: {} }));
		app.workspace._trigger("active-leaf-change", makeMdLeaf(elsewhere));
		vi.advanceTimersByTime(300);

		expect(pv.subject.file?.path).toBe(elsewhere.path);
	});

	it("open-note resumes follow: a subsequent active-leaf-change re-subjects again", () => {
		const from = makeMdFile("Mara Stoneway");
		const to = makeMdFile("Silvan Nightweaver");
		seedResolved(from, to);
		clickLink(view, to.path);

		const openBtn = getBody(view).querySelector('[data-sf-nav="open"]') as HTMLElement;
		openBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));

		const pv = view as unknown as { subject: { file: TFile | null; source: string } };
		expect(pv.subject.source).toBe("follow");

		const elsewhere = makeMdFile("Elsewhere");
		app.workspace.getActiveViewOfType = vi.fn(() => null);
		app.metadataCache.getFileCache = vi.fn(() => ({ frontmatter: {} }));
		app.workspace._trigger("active-leaf-change", makeMdLeaf(elsewhere));
		vi.advanceTimersByTime(300);

		expect(pv.subject.file?.path).toBe(elsewhere.path);
	});
});

describe("SidebarView: open-note changes no panel's selected tab [PRD/F2 AC]", () => {
	// A minimal book/scene vault, mirroring SidebarView.navigator.test.ts, so the
	// Navigator tab has a real scene link to click — this is the one place drill
	// and open genuinely diverge (drill switches out of the Navigator tab; open
	// must not).
	const book = createMockTFile({ basename: "Wardens of Moonharbor", path: "20 Planning/Wardens of Moonharbor.md" });
	const s1 = createMockTFile({ basename: "Scene 1", path: "10 Manuscript/WoM/Scene 1.md" });

	function tag(t: string): CachedMetadata {
		return createMockCachedMetadata({ tags: [{ tag: t }] });
	}
	function sceneCache(): CachedMetadata {
		return createMockCachedMetadata({
			tags: [{ tag: "#manuscript/scene" }],
			frontmatter: { type: "scene", act: 1, order: 1, status: "draft", when: "Night 1" },
			frontmatterLinks: [createMockFrontmatterLink("book", "Wardens of Moonharbor")],
		});
	}

	let app: App;
	let view: SidebarView;

	beforeEach(async () => {
		app = new App();
		const caches = new Map<TFile, CachedMetadata>([
			[book, tag("#planning/book")],
			[s1, sceneCache()],
		]);
		const byPath = new Map<string, TFile>([book, s1].map((f) => [f.path, f]));
		const byLink = new Map<string, TFile>([["Wardens of Moonharbor", book]]);
		vi.mocked(app.metadataCache.getFileCache).mockImplementation((f) => caches.get(f) ?? null);
		vi.mocked(app.metadataCache.getFirstLinkpathDest).mockImplementation((l) => byLink.get(l) ?? null);
		vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((p) => byPath.get(p) ?? null);
		vi.mocked(app.vault.getMarkdownFiles).mockReturnValue([book, s1]);
		app.metadataCache.resolvedLinks = {
			"10 Manuscript/WoM/Scene 1.md": { "20 Planning/Wardens of Moonharbor.md": 1 },
		};
		app.workspace.getActiveFile = vi.fn(() => book);

		const leaf = makeOwnLeaf(app);
		const native = new NativeScopingEngine(app);
		view = new SidebarView(leaf, makeRegistry(), makeGate(), native, undefined, () => "drill");
		await view.onOpen();
	});

	afterEach(async () => {
		await view.onClose();
	});

	it("modifier-click (open) from the Navigator tab does NOT switch to the Context tab — unlike drill", () => {
		const pv = view as unknown as { selectedViewId: string | null };

		const navTab = view.contentEl.querySelector(`[data-view-id="${NAVIGATOR_TAB_ID}"]`) as HTMLElement;
		navTab.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		expect(pv.selectedViewId).toBe(NAVIGATOR_TAB_ID);

		const link = getBody(view).querySelector(`[data-sf-link="${s1.path}"]`) as HTMLElement;
		link.dispatchEvent(new MouseEvent("click", { bubbles: true, metaKey: true }));

		expect(app.workspace.openLinkText).toHaveBeenCalledWith(s1.path, expect.any(String), false);
		// Unlike a plain (drill) click, opening leaves the Navigator tab selected.
		expect(pv.selectedViewId).toBe(NAVIGATOR_TAB_ID);
	});

	it("a plain (drill) click from the same Navigator link DOES switch to the Context tab — for contrast", () => {
		const pv = view as unknown as { selectedViewId: string | null };

		const navTab = view.contentEl.querySelector(`[data-view-id="${NAVIGATOR_TAB_ID}"]`) as HTMLElement;
		navTab.dispatchEvent(new MouseEvent("click", { bubbles: true }));

		const link = getBody(view).querySelector(`[data-sf-link="${s1.path}"]`) as HTMLElement;
		link.dispatchEvent(new MouseEvent("click", { bubbles: true }));

		expect(pv.selectedViewId).toBeNull();
	});

	it("open-note footer click leaves selectedViewId untouched", () => {
		const from = makeMdFile("Mara Stoneway");
		const to = makeMdFile("Silvan Nightweaver");
		registerCharacter(app, to);
		const ctx: NoteContext = {
			activeFile: from,
			activeKind: "character",
			entities: [{ file: to, kind: "character", relation: "outgoing", field: "enemies" }],
			backlinks: [],
			frontmatter: {},
			resolvedAt: Date.now(),
		};
		const pv = view as unknown as {
			subject: { file: TFile | null; source: string };
			currentCtx: NoteContext;
			currentRecord: ViewRecord | null;
			selectedViewId: string | null;
			_renderState(s: { kind: string; ctx: NoteContext }): void;
		};
		pv.subject = { file: from, source: "follow" };
		pv.currentCtx = ctx;
		pv.currentRecord = makeDummyViewRecord();
		pv._renderState({ kind: "resolved", ctx });

		const before = pv.selectedViewId;
		clickLink(view, to.path);

		const openBtn = getBody(view).querySelector('[data-sf-nav="open"]') as HTMLElement;
		openBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));

		expect(pv.selectedViewId).toBe(before);
	});
});

describe("SidebarView: a click with no known target kind takes no action (repo invariant)", () => {
	let app: App;
	let view: SidebarView;

	beforeEach(async () => {
		app = new App();
		const leaf = makeOwnLeaf(app);
		const native = new NativeScopingEngine(app);
		view = new SidebarView(leaf, makeRegistry(), makeGate(), native, undefined, () => "drill");
		await view.onOpen();
	});

	afterEach(async () => {
		await view.onClose();
	});

	it("clicking an unmarked element in the body does not mutate the subject or open anything", () => {
		const from = makeMdFile("Mara Stoneway");
		const pv = view as unknown as { subject: { file: TFile | null; source: string } };
		pv.subject = { file: from, source: "follow" };

		const plain = document.createElement("div");
		plain.textContent = "just some prose, no markers";
		getBody(view).appendChild(plain);

		plain.dispatchEvent(new MouseEvent("click", { bubbles: true }));

		expect(pv.subject.file?.path).toBe(from.path);
		expect(pv.subject.source).toBe("follow");
		expect(app.workspace.openLinkText).not.toHaveBeenCalled();
	});
});
