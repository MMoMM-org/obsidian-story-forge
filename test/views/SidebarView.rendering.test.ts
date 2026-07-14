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
import { App, WorkspaceLeaf, TFile, augmentEl } from "obsidian";
import { SidebarView } from "views/SidebarView";
import { StubContextTab } from "views/StubContextTab";
import { SIDEBAR_VIEW_TYPE } from "constants";
import type { NoteContext, ResolvedEntity } from "scoping/NoteContext";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeApp(): App {
	return new App();
}

function makeOwnLeaf(): WorkspaceLeaf {
	const leaf = new WorkspaceLeaf();
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
		leaf = makeOwnLeaf();
		view = new SidebarView(leaf, app);
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
			"This note isn't a tracked character, location, scene, object, lore, or plotline.",
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
			resolvedAt: Date.now(),
		};

		const container = augmentEl(document.createElement("div"));
		tab.render(ctx, container);

		expect(container.querySelector(".sf-appears")).not.toBeNull();
	});
});
