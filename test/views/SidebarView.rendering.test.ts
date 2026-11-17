/**
 * T3.3 — State rendering & stub context tab (RED tests)
 *
 * Tests for each render state asserting DOM structure:
 * - S2: no note → "No note open" empty state
 * - S3: non-markdown file → "Story Forge follows markdown notes."
 * - S4: markdown non-entity (kind unknown) → "not an entity" badge
 * - S5: resolving → "resolving…" + skeleton bars
 * - S6/S7: resolved → stub rows with field + kind
 * - S9: error → errbox with "⚠ Couldn't read this note's properties." + "Retry" button
 * - header (chead): shows note title + entity-type badge
 * - StubContextTab.render() dumps entities as field+kind rows
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { App, WorkspaceLeaf, TFile, augmentEl, Platform } from "obsidian";
import { SidebarView } from "views/SidebarView";
import { StubContextTab } from "views/StubContextTab";
import { SIDEBAR_VIEW_TYPE } from "pluginConstants";
import type { NoteContext, ResolvedEntity } from "scoping/NoteContext";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeApp(): App {
	return new App();
}

function makeOwnLeaf(app: App): WorkspaceLeaf {
	const leaf = new WorkspaceLeaf();
	leaf.app = app;
	leaf.view.getViewType = vi.fn(() => SIDEBAR_VIEW_TYPE);
	leaf.setViewState = vi.fn(async (s: { type: string }) => {
		leaf.view.getViewType = vi.fn(() => s.type);
	});
	return leaf;
}

function makeMdFile(basename = "Scene 1", ext = "md"): TFile {
	const f = new TFile();
	f.path = `${basename}.${ext}`;
	f.name = `${basename}.${ext}`;
	f.basename = basename;
	f.extension = ext;
	return f;
}

function makeNoteContext(
	file: TFile,
	kind: NoteContext["activeKind"],
	entities: ResolvedEntity[] = [],
): NoteContext {
	return {
		activeFile: file,
		activeKind: kind,
		entities,
		backlinks: [],
		frontmatter: {},
		resolvedAt: Date.now(),
	};
}

function makeEntity(
	field: string,
	kind: ResolvedEntity["kind"],
	basename = "Target",
): ResolvedEntity {
	const f = makeMdFile(basename);
	return { file: f, kind, relation: "outgoing", field };
}

// Query helpers for the DOM
function getBody(view: SidebarView): HTMLElement {
	return view.contentEl.querySelector(".sf-body") as HTMLElement;
}

function getText(el: HTMLElement, sel: string): string {
	return (el.querySelector(sel) as HTMLElement | null)?.textContent ?? "";
}

function getAll(el: HTMLElement, sel: string): NodeListOf<Element> {
	return el.querySelectorAll(sel);
}

// ---------------------------------------------------------------------------
// SidebarView state rendering tests
// ---------------------------------------------------------------------------

describe("SidebarView: state rendering", () => {
	let app: App;
	let leaf: WorkspaceLeaf;
	let view: SidebarView;

	beforeEach(async () => {
		app = makeApp();
		leaf = makeOwnLeaf(app);
		view = new SidebarView(leaf);
		await view.onOpen();
	});

	afterEach(async () => {
		await view.onClose();
	});

	// -----------------------------------------------------------------------
	// S2: no note
	// -----------------------------------------------------------------------

	it("S2 no-note: body shows 'No note open'", () => {
		const body = getBody(view);
		expect(getText(body, ".sf-empty-lead")).toBe("No note open");
	});

	it("S2 no-note: body contains hint about opening a note", () => {
		const body = getBody(view);
		expect(body.textContent).toContain("Open a note to see its story context.");
	});

	it("S2 no-note: header title is '—'", () => {
		const title = view.contentEl.querySelector(".sf-title");
		expect(title?.textContent).toBe("—");
	});

	it("S2 no-note: header badge is '—'", () => {
		const badge = view.contentEl.querySelector(".sf-badge");
		expect(badge?.textContent).toBe("—");
	});

	// -----------------------------------------------------------------------
	// S3: non-markdown file
	// -----------------------------------------------------------------------

	it("S3 non-md: body shows 'Story Forge follows markdown notes.'", () => {
		// Manually drive the private renderState
		const privateView = view as unknown as {
			_renderState(s: { kind: string; file: TFile }): void;
		};
		const file = makeMdFile("diagram", "canvas");
		privateView._renderState({ kind: "non-md", file });

		const body = getBody(view);
		expect(body.textContent).toContain("Story Forge follows markdown notes.");
	});

	it("S3 non-md: header title is the file name", () => {
		const privateView = view as unknown as {
			_renderState(s: { kind: string; file: TFile }): void;
		};
		const file = makeMdFile("diagram", "canvas");
		privateView._renderState({ kind: "non-md", file });

		const title = view.contentEl.querySelector(".sf-title");
		expect(title?.textContent).toBe("diagram.canvas");
	});

	// -----------------------------------------------------------------------
	// S4: non-entity markdown note
	// -----------------------------------------------------------------------

	it("S4 non-entity: badge is 'not an entity'", () => {
		const privateView = view as unknown as {
			_renderState(s: { kind: string; file: TFile; activeKind: string }): void;
		};
		const file = makeMdFile("Ideas scratchpad");
		privateView._renderState({ kind: "non-entity", file, activeKind: "unknown" });

		const badge = view.contentEl.querySelector(".sf-badge");
		expect(badge?.textContent).toBe("not an entity");
	});

	it("S4 non-entity: body contains expected text", () => {
		const privateView = view as unknown as {
			_renderState(s: { kind: string; file: TFile; activeKind: string }): void;
		};
		const file = makeMdFile("Ideas scratchpad");
		privateView._renderState({ kind: "non-entity", file, activeKind: "unknown" });

		const body = getBody(view);
		expect(body.textContent).toContain(
			"This note isn't a tracked character, location, object, lore, scene, plotline, or book.",
		);
	});

	// -----------------------------------------------------------------------
	// S5: resolving (skeleton)
	// -----------------------------------------------------------------------

	it("S5 resolving: body shows 'resolving…'", () => {
		const privateView = view as unknown as {
			_renderState(s: { kind: string; file: TFile; activeKind: string }): void;
		};
		const file = makeMdFile("Mara Stoneway");
		privateView._renderState({ kind: "resolving", file, activeKind: "character" });

		const body = getBody(view);
		expect(getText(body, ".sf-resolving")).toBe("resolving…");
	});

	it("S5 resolving: body has skeleton bars", () => {
		const privateView = view as unknown as {
			_renderState(s: { kind: string; file: TFile; activeKind: string }): void;
		};
		const file = makeMdFile("Mara Stoneway");
		privateView._renderState({ kind: "resolving", file, activeKind: "character" });

		const body = getBody(view);
		const skels = getAll(body, ".sf-skel");
		expect(skels.length).toBeGreaterThanOrEqual(1);
	});

	it("S5 resolving: header shows character badge", () => {
		const privateView = view as unknown as {
			_renderState(s: { kind: string; file: TFile; activeKind: string }): void;
		};
		const file = makeMdFile("Mara Stoneway");
		privateView._renderState({ kind: "resolving", file, activeKind: "character" });

		const badge = view.contentEl.querySelector(".sf-badge");
		expect(badge?.textContent).toBe("character");
	});

	// -----------------------------------------------------------------------
	// S6: resolved scene note
	// -----------------------------------------------------------------------

	it("S6 resolved-scene: body shows 'resolved context (stub)' label", () => {
		const privateView = view as unknown as {
			_renderState(s: { kind: string; ctx: NoteContext }): void;
		};
		const file = makeMdFile("Scene 1 - The Extinguished Fire");
		const ctx = makeNoteContext(file, "scene", [
			makeEntity("pov", "character", "Mara Stoneway"),
			makeEntity("location", "location", "Moonharbor Lighthouse"),
		]);
		privateView._renderState({ kind: "resolved", ctx });

		const body = getBody(view);
		expect(getText(body, ".sf-stublabel")).toBe("resolved context (stub)");
	});

	it("S6 resolved-scene: rows list each entity with field and kind", () => {
		const privateView = view as unknown as {
			_renderState(s: { kind: string; ctx: NoteContext }): void;
		};
		const file = makeMdFile("Scene 1 - The Extinguished Fire");
		const ctx = makeNoteContext(file, "scene", [
			makeEntity("pov", "character", "Mara Stoneway"),
			makeEntity("location", "location", "Moonharbor Lighthouse"),
		]);
		privateView._renderState({ kind: "resolved", ctx });

		const body = getBody(view);
		const rows = getAll(body, ".sf-row");
		expect(rows.length).toBe(2);

		const row0 = rows[0] as HTMLElement;
		expect(row0.querySelector(".sf-f")?.textContent).toBe("pov");
		expect(row0.querySelector(".sf-k")?.textContent).toBe("character");

		const row1 = rows[1] as HTMLElement;
		expect(row1.querySelector(".sf-f")?.textContent).toBe("location");
		expect(row1.querySelector(".sf-k")?.textContent).toBe("location");
	});

	it("S6 resolved-scene: header shows scene badge", () => {
		const privateView = view as unknown as {
			_renderState(s: { kind: string; ctx: NoteContext }): void;
		};
		const file = makeMdFile("Scene 1");
		const ctx = makeNoteContext(file, "scene");
		privateView._renderState({ kind: "resolved", ctx });

		const badge = view.contentEl.querySelector(".sf-badge");
		expect(badge?.textContent).toBe("scene");
	});

	it("S6 resolved-scene: footer shows backlink seam text", () => {
		const privateView = view as unknown as {
			_renderState(s: { kind: string; ctx: NoteContext }): void;
		};
		const file = makeMdFile("Scene 1");
		const ctx = makeNoteContext(file, "scene");
		privateView._renderState({ kind: "resolved", ctx });

		const body = getBody(view);
		expect(body.querySelector(".sf-appears")).not.toBeNull();
	});

	// -----------------------------------------------------------------------
	// S7: resolved character note
	// -----------------------------------------------------------------------

	it("S7 resolved-character: rows list each entity with field label + kind", () => {
		const privateView = view as unknown as {
			_renderState(s: { kind: string; ctx: NoteContext }): void;
		};
		const file = makeMdFile("Mara Stoneway");
		const ctx = makeNoteContext(file, "character", [
			makeEntity("significant_other", "character", "Jonas Kell"),
			makeEntity("family", "character", "Elke Stoneway"),
		]);
		privateView._renderState({ kind: "resolved", ctx });

		const body = getBody(view);
		const rows = getAll(body, ".sf-row");
		expect(rows.length).toBe(2);

		const row0 = rows[0] as HTMLElement;
		expect(row0.querySelector(".sf-f")?.textContent).toBe("significant_other");
		expect(row0.querySelector(".sf-k")?.textContent).toBe("character");
	});

	it("S7 resolved-character: header shows note title", () => {
		const privateView = view as unknown as {
			_renderState(s: { kind: string; ctx: NoteContext }): void;
		};
		const file = makeMdFile("Mara Stoneway");
		const ctx = makeNoteContext(file, "character");
		privateView._renderState({ kind: "resolved", ctx });

		const title = view.contentEl.querySelector(".sf-title");
		expect(title?.textContent).toBe("Mara Stoneway");
	});

	// -----------------------------------------------------------------------
	// S9: error state
	// -----------------------------------------------------------------------

	it("S9 error: body shows error message", () => {
		const privateView = view as unknown as {
			_renderState(s: { kind: string; file: TFile; retry: () => void }): void;
		};
		const file = makeMdFile("Broken note");
		privateView._renderState({ kind: "error", file, retry: vi.fn() });

		const body = getBody(view);
		expect(body.querySelector(".sf-errbox")).not.toBeNull();
		expect(body.textContent).toContain("⚠ Couldn't read this note's properties.");
	});

	it("S9 error: body has a 'Retry' button", () => {
		const privateView = view as unknown as {
			_renderState(s: { kind: string; file: TFile; retry: () => void }): void;
		};
		const file = makeMdFile("Broken note");
		const retryFn = vi.fn();
		privateView._renderState({ kind: "error", file, retry: retryFn });

		const body = getBody(view);
		const btn = body.querySelector(".sf-btn") as HTMLButtonElement | null;
		expect(btn).not.toBeNull();
		expect(btn?.textContent).toBe("Retry");
	});

	it("S9 error: clicking 'Retry' calls the retry function", () => {
		const privateView = view as unknown as {
			_renderState(s: { kind: string; file: TFile; retry: () => void }): void;
		};
		const file = makeMdFile("Broken note");
		const retryFn = vi.fn();
		privateView._renderState({ kind: "error", file, retry: retryFn });

		const body = getBody(view);
		const btn = body.querySelector(".sf-btn") as HTMLButtonElement;
		btn.click();

		expect(retryFn).toHaveBeenCalledTimes(1);
	});

	it("S9 error: header shows file basename", () => {
		const privateView = view as unknown as {
			_renderState(s: { kind: string; file: TFile; retry: () => void }): void;
		};
		const file = makeMdFile("Broken note");
		privateView._renderState({ kind: "error", file, retry: vi.fn() });

		const title = view.contentEl.querySelector(".sf-title");
		expect(title?.textContent).toBe("Broken note");
	});
});

// ---------------------------------------------------------------------------
// S9 via the follow pipeline: null metadata cache → error state (not S6-empty)
// ---------------------------------------------------------------------------

describe("SidebarView: null metadata cache routes to S9 (not S6)", () => {
	let app: App;
	let ownLeaf: WorkspaceLeaf;
	let view: SidebarView;

	beforeEach(async () => {
		vi.useFakeTimers();
		app = makeApp();
		ownLeaf = new WorkspaceLeaf();
		ownLeaf.app = app;
		ownLeaf.view.getViewType = vi.fn(() => SIDEBAR_VIEW_TYPE);
		ownLeaf.setViewState = vi.fn(async (s: { type: string }) => {
			ownLeaf.view.getViewType = vi.fn(() => s.type);
		});
		view = new SidebarView(ownLeaf);
		await view.onOpen();
	});

	afterEach(async () => {
		await view.onClose();
		vi.useRealTimers();
	});

	function makeMdLeaf(file: TFile): WorkspaceLeaf {
		const leaf = new WorkspaceLeaf();
		leaf.view.getViewType = vi.fn(() => "markdown");
		leaf.view.file = file;
		return leaf;
	}

	it("null getFileCache on a markdown note → S9 error box + Retry (not S6)", () => {
		const file = makeMdFile("Broken note");
		// Metadata cache is null (pre-index / unreadable).
		app.metadataCache.getFileCache = vi.fn(() => null);

		app.workspace._trigger("active-leaf-change", makeMdLeaf(file));
		vi.advanceTimersByTime(300);

		const body = getBody(view);
		// S9, not S6: error box present, no "resolved context (stub)" label.
		expect(body.querySelector(".sf-errbox")).not.toBeNull();
		expect(body.textContent).toContain("⚠ Couldn't read this note's properties.");
		expect(body.querySelector(".sf-stublabel")).toBeNull();

		const btn = body.querySelector(".sf-btn") as HTMLButtonElement | null;
		expect(btn).not.toBeNull();
		expect(btn?.textContent).toBe("Retry");
	});

	it("Retry re-runs the pipeline: once the cache is readable, resolves to S6/S7", () => {
		const file = makeMdFile("Recovering note");
		app.metadataCache.getFileCache = vi.fn(() => null);

		app.workspace._trigger("active-leaf-change", makeMdLeaf(file));
		vi.advanceTimersByTime(300);

		// Now the cache becomes readable (a character note).
		app.metadataCache.getFileCache = vi.fn(() => ({
			tags: [{ tag: "#canon/character" }],
			frontmatter: {},
		}));

		const resolveSpy = vi.spyOn(
			(view as unknown as { scoping: { resolve: (f: TFile) => unknown } }).scoping,
			"resolve",
		);

		const btn = getBody(view).querySelector(".sf-btn") as HTMLButtonElement;
		btn.click();

		// Retry re-runs resolve for the same file and reaches the resolved (S6/S7) state.
		expect(resolveSpy).toHaveBeenCalledWith(file);
		const body = getBody(view);
		expect(body.querySelector(".sf-stublabel")).not.toBeNull();
		expect(body.querySelector(".sf-errbox")).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// StubContextTab tests
// ---------------------------------------------------------------------------

describe("StubContextTab", () => {
	it("id is 'context'", () => {
		const tab = new StubContextTab();
		expect(tab.id).toBe("context");
	});

	it("render() dumps entities as rows with field + kind", () => {
		const tab = new StubContextTab();

		const file = new TFile();
		file.path = "Mara Stoneway.md";
		file.basename = "Mara Stoneway";
		file.extension = "md";

		const targetFile = new TFile();
		targetFile.basename = "Jonas Kell";

		const ctx: NoteContext = {
			activeFile: file,
			activeKind: "character",
			entities: [
				{
					file: targetFile,
					kind: "character",
					relation: "outgoing",
					field: "significant_other",
				},
			],
			backlinks: [],
			frontmatter: {},
			resolvedAt: Date.now(),
		};

		// Build a container with Obsidian helpers attached
		const container = augmentEl(document.createElement("div"));
		tab.render(ctx, container);

		const rows = container.querySelectorAll(".sf-row");
		expect(rows.length).toBe(1);

		const row = rows[0] as HTMLElement;
		expect(row.querySelector(".sf-f")?.textContent).toBe("significant_other");
		expect(row.querySelector(".sf-k")?.textContent).toBe("character");
	});

	it("render() shows 'appears in: — (M3)' footer", () => {
		const tab = new StubContextTab();

		const file = new TFile();
		file.basename = "Scene 1";

		const ctx: NoteContext = {
			activeFile: file,
			activeKind: "scene",
			entities: [],
			backlinks: [],
			frontmatter: {},
			resolvedAt: Date.now(),
		};

		const container = augmentEl(document.createElement("div"));
		tab.render(ctx, container);

		expect(container.querySelector(".sf-appears")).not.toBeNull();
	});
});

// ---------------------------------------------------------------------------
// T2.4 — S46 Bases-off degrade: _renderEngineMissing bases branch
// ---------------------------------------------------------------------------

describe("SidebarView: _renderEngineMissing bases branch (S46 degrade)", () => {
	let app: App;
	let leaf: WorkspaceLeaf;
	let view: SidebarView;

	beforeEach(async () => {
		app = makeApp();
		leaf = makeOwnLeaf(app);
		view = new SidebarView(leaf);
		await view.onOpen();
		(Platform as { isMobile: boolean }).isMobile = false;
	});

	afterEach(async () => {
		await view.onClose();
		(Platform as { isMobile: boolean }).isMobile = false;
	});

	function renderBasesMissing(): HTMLElement {
		const body = getBody(view);
		const privateView = view as unknown as {
			_renderEngineMissing(body: HTMLElement, kind: string): void;
		};
		body.innerHTML = "";
		privateView._renderEngineMissing(body as HTMLElement, "bases");
		return body;
	}

	// -----------------------------------------------------------------------
	// Structure: outer wrapper classes are preserved
	// -----------------------------------------------------------------------

	it("S46 bases-off: wrapper has sf-engine-missing and sf-empty classes", () => {
		const body = renderBasesMissing();
		const wrapper = body.querySelector(".sf-engine-missing.sf-empty");
		expect(wrapper).not.toBeNull();
	});

	// -----------------------------------------------------------------------
	// Old copy is GONE
	// -----------------------------------------------------------------------

	it("S46 bases-off: does NOT contain 'Engine coming in M4'", () => {
		const body = renderBasesMissing();
		expect(body.textContent).not.toContain("Engine coming in M4");
	});

	it("S46 bases-off: does NOT contain 'The Bases engine is not yet available.'", () => {
		const body = renderBasesMissing();
		expect(body.textContent).not.toContain("The Bases engine is not yet available.");
	});

	// -----------------------------------------------------------------------
	// Desktop copy: warn lead + why text
	// -----------------------------------------------------------------------

	it("S46 bases-off desktop: lead reads '⚙ Bases is off — showing a simple list'", () => {
		const body = renderBasesMissing();
		const lead = body.querySelector(".sf-empty-lead");
		expect(lead).not.toBeNull();
		expect(lead?.textContent).toBe("⚙ Bases is off — showing a simple list");
	});

	it("S46 bases-off desktop: body contains explanation about core Bases plugin", () => {
		const body = renderBasesMissing();
		expect(body.textContent).toContain("Bases plugin");
	});

	it("S46 bases-off desktop: body mentions sorting/filtering unavailability", () => {
		const body = renderBasesMissing();
		const bodyText = body.textContent ?? "";
		expect(
			bodyText.includes("Sorting") ||
			bodyText.includes("sorting") ||
			bodyText.includes("Filtering") ||
			bodyText.includes("filtering") ||
			bodyText.includes("unavailable") ||
			bodyText.includes("not available"),
		).toBe(true);
	});

	// -----------------------------------------------------------------------
	// T7.4 S2: the Enable Bases button is gone (a second suggestion, and it used the
	// non-public app.setting); the cause text stays.
	// -----------------------------------------------------------------------

	it("S2 bases-off desktop: no 'Enable Bases' button, and no button at all", () => {
		const body = renderBasesMissing();
		expect(body.querySelector("button")).toBeNull();
		expect(body.textContent).not.toContain("Enable Bases");
	});

	// -----------------------------------------------------------------------
	// Mobile: different lead, no Enable Bases button
	// -----------------------------------------------------------------------

	it("S46 bases-off mobile: lead reads '⚙ Bases isn't available on this device'", () => {
		(Platform as { isMobile: boolean }).isMobile = true;
		const body = renderBasesMissing();
		const lead = body.querySelector(".sf-empty-lead");
		expect(lead?.textContent).toBe("⚙ Bases isn't available on this device");
	});

	it("S46 bases-off mobile: Enable Bases button is omitted", () => {
		(Platform as { isMobile: boolean }).isMobile = true;
		const body = renderBasesMissing();
		const btn = body.querySelector("button");
		expect(btn).toBeNull();
	});

	// -----------------------------------------------------------------------
	// Regression: dataview branches are unchanged
	// -----------------------------------------------------------------------

	// T7.4 S5: the Dataview state states the cause, never an install (PRD F8 AC 5).
	it.each(["dataview-dql", "dataviewjs"])("S5 %s branch: 'Needs Dataview' and the signed-off sentence, no prompt", (kind) => {
		const body = getBody(view);
		body.innerHTML = "";
		const privateView = view as unknown as {
			_renderEngineMissing(body: HTMLElement, kind: string): void;
		};
		privateView._renderEngineMissing(body as HTMLElement, kind);
		expect(body.querySelector(".sf-empty-lead")?.textContent).toBe("Needs Dataview");
		expect(body.textContent).toContain("This collection needs Dataview, which is not active.");
		expect(body.textContent).not.toMatch(/install|requires the Dataview community plugin/i);
		expect(body.querySelectorAll("a, button")).toHaveLength(0);
	});

	it("S46 regression: dataview branch does NOT show 'Bases is off'", () => {
		const body = getBody(view);
		body.innerHTML = "";
		const privateView = view as unknown as {
			_renderEngineMissing(body: HTMLElement, kind: string): void;
		};
		privateView._renderEngineMissing(body as HTMLElement, "dataview-dql");
		expect(body.textContent).not.toContain("Bases is off");
	});

	// T7.4 S1: the Workbench tells the host it opened (the capability screen's first-run trigger).
	it("calls onOpened once when the panel opens", async () => {
		const onOpened = vi.fn();
		const withHook = new SidebarView(makeOwnLeaf(app), undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, onOpened);
		expect(onOpened).not.toHaveBeenCalled();
		await withHook.onOpen();
		expect(onOpened).toHaveBeenCalledTimes(1);
		await withHook.onClose();
	});
});
