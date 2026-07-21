/**
 * T4.2 — Drill-in nav stack + delegated link handler (RED tests)
 *
 * Behaviours (SDD/ADR-4, PRD/F6; mockup S41/S43):
 * 1. Default click on a link row → panel re-subjects to that entity, pushes the
 *    previous subject onto the nav stack, follow is suspended
 *    (subject.source === "drilled"); a Back affordance pops the stack.
 * 2. Modifier click (Cmd/Ctrl) → opens the note via
 *    workspace.openLinkText(target.path, sourcePath, false), clears the nav
 *    stack, resumes follow (source → "follow").
 * 3. linkClickAction === "open" → default and modifier behaviours SWAP.
 * 4. Drilling into a non-entity link → the S4 "not an entity" state renders.
 * 5. Pinned + diverged → the S43 pinned-divergence hint shows; unpin resumes follow.
 * 6. No listener leak: the link handler is delegated on the persistent body
 *    element — one handler survives body.empty() + re-render; _runCleanup tears
 *    it down.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { App, WorkspaceLeaf, TFile } from "obsidian";
import { SidebarView, activateView, revealAndShowFile } from "views/SidebarView";
import { NativeScopingEngine } from "engines/NativeScopingEngine";
import { SIDEBAR_VIEW_TYPE } from "pluginConstants";
import type { NoteContext } from "scoping/NoteContext";
import type { EngineRegistry } from "engines/QueryEngine";
import type { ConsentGate } from "consent/ConsentGate";

/**
 * Minimal registry + gate so _renderResolved takes the native-fallback path
 * (currentRecord is null → nativeEngine.render), NOT the pre-T4.4 legacy stub.
 */
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

function makeMdLeaf(file: TFile | null = null): WorkspaceLeaf {
	const leaf = new WorkspaceLeaf();
	leaf.view.getViewType = vi.fn(() => "markdown");
	leaf.view.file = file;
	return leaf;
}

function makeMdFile(basename = "Mara Stoneway"): TFile {
	const f = new TFile();
	f.path = `${basename}.md`;
	f.name = `${basename}.md`;
	f.basename = basename;
	f.extension = "md";
	return f;
}

function makeNoteContext(
	file: TFile,
	kind: NoteContext["activeKind"] = "character",
): NoteContext {
	return {
		activeFile: file,
		activeKind: kind,
		entities: [],
		backlinks: [],
		frontmatter: {},
		resolvedAt: Date.now(),
	};
}

function getBody(view: SidebarView): HTMLElement {
	return view.contentEl.querySelector(".sf-body") as HTMLElement;
}

/** Register a target file in the vault + a character cache so classify → character. */
function registerCharacter(app: App, file: TFile): void {
	app.vault.getAbstractFileByPath = vi.fn((p: string) =>
		p === file.path ? file : null,
	) as unknown as App["vault"]["getAbstractFileByPath"];
	app.metadataCache.getFileCache = vi.fn(() => ({
		tags: [{ tag: "#canon/character" }],
		frontmatter: {},
	}));
}

/** Dispatch a click on the body targeting a link element carrying data-sf-link. */
function clickLink(
	view: SidebarView,
	path: string,
	opts: { meta?: boolean; ctrl?: boolean } = {},
): HTMLElement {
	const body = getBody(view);
	const el = body.querySelector(`[data-sf-link="${path}"]`) as HTMLElement | null;
	if (!el) throw new Error(`no link element for path ${path}`);
	const evt = new MouseEvent("click", {
		bubbles: true,
		metaKey: opts.meta ?? false,
		ctrlKey: opts.ctrl ?? false,
	});
	el.dispatchEvent(evt);
	return el;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SidebarView: drill-in navigation", () => {
	let app: App;
	let leaf: WorkspaceLeaf;
	let native: NativeScopingEngine;
	let view: SidebarView;
	let clickAction: "drill" | "open";

	beforeEach(async () => {
		app = makeApp();
		leaf = makeOwnLeaf(app);
		native = new NativeScopingEngine(app);
		clickAction = "drill";
		view = new SidebarView(
			leaf,
			makeRegistry(),
			makeGate(),
			native,
			undefined,
			() => clickAction,
		);
		await view.onOpen();
	});

	afterEach(async () => {
		await view.onClose();
	});

	/** Seed a resolved subject `from` with one drill-target link `to` in its context. */
	function seedResolved(from: TFile, to: TFile): void {
		registerCharacter(app, to);
		const ctx: NoteContext = {
			activeFile: from,
			activeKind: "character",
			entities: [
				{ file: to, kind: "character", relation: "outgoing", field: "enemies" },
			],
			backlinks: [],
			frontmatter: {},
			resolvedAt: Date.now(),
		};
		const pv = view as unknown as {
			subject: { file: TFile | null; source: string };
			currentCtx: NoteContext;
			_renderState(s: { kind: string; ctx: NoteContext }): void;
		};
		pv.subject = { file: from, source: "follow" };
		pv.currentCtx = ctx;
		pv._renderState({ kind: "resolved", ctx });
	}

	// -----------------------------------------------------------------------
	// Behaviour 1: default click drills
	// -----------------------------------------------------------------------

	it("default click drills: re-subjects, pushes nav stack, source becomes 'drilled'", () => {
		const from = makeMdFile("Mara Stoneway");
		const to = makeMdFile("Silvan Nightweaver");
		seedResolved(from, to);

		clickLink(view, to.path);

		const pv = view as unknown as {
			subject: { file: TFile | null; source: string };
			navStack: TFile[];
		};
		expect(pv.subject.file?.path).toBe(to.path);
		expect(pv.subject.source).toBe("drilled");
		expect(pv.navStack.map((f) => f.path)).toEqual([from.path]);
	});

	it("default click does NOT open the note in the editor", () => {
		const from = makeMdFile("Mara Stoneway");
		const to = makeMdFile("Silvan Nightweaver");
		seedResolved(from, to);

		clickLink(view, to.path);

		expect(app.workspace.openLinkText).not.toHaveBeenCalled();
	});

	it("Back affordance renders while drilled and pops the stack to the prior subject", () => {
		const from = makeMdFile("Mara Stoneway");
		const to = makeMdFile("Silvan Nightweaver");
		seedResolved(from, to);
		clickLink(view, to.path);

		// Back control present in the header (S41 — moved out of the body).
		const back = view.contentEl.querySelector('.sf-chead [data-sf-nav="back"]') as HTMLElement | null;
		expect(back).not.toBeNull();
		expect(back!.classList.contains("sf-hidden")).toBe(false);

		// Pop
		const evt = new MouseEvent("click", { bubbles: true });
		back!.dispatchEvent(evt);

		const pv = view as unknown as {
			subject: { file: TFile | null; source: string };
			navStack: TFile[];
		};
		expect(pv.subject.file?.path).toBe(from.path);
		expect(pv.navStack.length).toBe(0);
		// Popped back to the empty stack → follow resumes.
		expect(pv.subject.source).toBe("follow");
	});

	// -----------------------------------------------------------------------
	// Behaviour 2: modifier click opens
	// -----------------------------------------------------------------------

	it("modifier (meta) click opens the note, clears the stack, resumes follow", () => {
		const from = makeMdFile("Mara Stoneway");
		const to = makeMdFile("Silvan Nightweaver");
		seedResolved(from, to);

		clickLink(view, to.path, { meta: true });

		expect(app.workspace.openLinkText).toHaveBeenCalledWith(to.path, from.path, false);
		const pv = view as unknown as {
			subject: { source: string };
			navStack: TFile[];
		};
		expect(pv.navStack.length).toBe(0);
		expect(pv.subject.source).toBe("follow");
	});

	it("modifier (ctrl) click also opens the note", () => {
		const from = makeMdFile("Mara Stoneway");
		const to = makeMdFile("Silvan Nightweaver");
		seedResolved(from, to);

		clickLink(view, to.path, { ctrl: true });

		expect(app.workspace.openLinkText).toHaveBeenCalledWith(to.path, from.path, false);
	});

	// -----------------------------------------------------------------------
	// Behaviour 3: linkClickAction "open" swaps
	// -----------------------------------------------------------------------

	it("linkClickAction 'open': plain click OPENS the note (swap)", () => {
		clickAction = "open";
		const from = makeMdFile("Mara Stoneway");
		const to = makeMdFile("Silvan Nightweaver");
		seedResolved(from, to);

		clickLink(view, to.path);

		expect(app.workspace.openLinkText).toHaveBeenCalledWith(to.path, from.path, false);
		const pv = view as unknown as { subject: { source: string } };
		expect(pv.subject.source).toBe("follow");
	});

	it("linkClickAction 'open': modifier click DRILLS (swap)", () => {
		clickAction = "open";
		const from = makeMdFile("Mara Stoneway");
		const to = makeMdFile("Silvan Nightweaver");
		seedResolved(from, to);

		clickLink(view, to.path, { meta: true });

		expect(app.workspace.openLinkText).not.toHaveBeenCalled();
		const pv = view as unknown as {
			subject: { file: TFile | null; source: string };
			navStack: TFile[];
		};
		expect(pv.subject.source).toBe("drilled");
		expect(pv.navStack.map((f) => f.path)).toEqual([from.path]);
	});

	// -----------------------------------------------------------------------
	// Behaviour 4: drilling into a non-entity → S4
	// -----------------------------------------------------------------------

	it("drilling into a non-entity link renders the S4 'not an entity' state", () => {
		const from = makeMdFile("Mara Stoneway");
		const to = makeMdFile("Ideas scratchpad");
		// Target resolves in the vault but classifies as unknown (no canon tag).
		app.vault.getAbstractFileByPath = vi.fn((p: string) =>
			p === to.path ? to : null,
		) as unknown as App["vault"]["getAbstractFileByPath"];

		// Seed a resolved subject whose ctx carries a link to the non-entity.
		const ctx: NoteContext = {
			activeFile: from,
			activeKind: "character",
			// "enemies" is a rendered character relation field, so the link stamps a
			// path even though the target itself classifies as unknown on drill.
			entities: [
				{ file: to, kind: "unknown", relation: "outgoing", field: "enemies" },
			],
			backlinks: [],
			frontmatter: {},
			resolvedAt: Date.now(),
		};
		const pv = view as unknown as {
			subject: { file: TFile | null; source: string };
			currentCtx: NoteContext;
			_renderState(s: { kind: string; ctx: NoteContext }): void;
		};
		pv.subject = { file: from, source: "follow" };
		pv.currentCtx = ctx;
		pv._renderState({ kind: "resolved", ctx });

		// Now the target's cache classifies as unknown.
		app.metadataCache.getFileCache = vi.fn(() => ({ frontmatter: {} }));

		clickLink(view, to.path);

		// Drill still happened...
		expect(pv.subject.file?.path).toBe(to.path);
		expect(pv.subject.source).toBe("drilled");
		// ...and the S4 state renders.
		const body = getBody(view);
		const badge = view.contentEl.querySelector(".sf-badge");
		expect(badge?.textContent).toBe("not an entity");
		expect(body.textContent).toContain(
			"This note isn't a tracked character, location, scene, object, lore, or plotline.",
		);
	});

	// -----------------------------------------------------------------------
	// Behaviour 6: delegated handler — no leak
	// -----------------------------------------------------------------------

	it("link handler is delegated on the persistent body (registered once, not per link)", () => {
		const from = makeMdFile("Mara Stoneway");
		const to = makeMdFile("Silvan Nightweaver");
		seedResolved(from, to);

		// Count registerDomEvent calls that target the body element for "click".
		const bodyEl = getBody(view);
		const calls = (view.registerDomEvent as ReturnType<typeof vi.fn>).mock.calls;
		const bodyClicks = calls.filter(
			(c) => c[0] === bodyEl && c[1] === "click",
		);
		expect(bodyClicks.length).toBe(1);
	});

	it("no leak: after re-render there is still exactly one body click handler", () => {
		const from = makeMdFile("Mara Stoneway");
		const to = makeMdFile("Silvan Nightweaver");
		seedResolved(from, to);

		// Re-render several times (each empties + repaints the body).
		const pv = view as unknown as {
			currentCtx: NoteContext;
			_renderState(s: { kind: string; ctx: NoteContext }): void;
		};
		for (let i = 0; i < 3; i++) {
			pv._renderState({ kind: "resolved", ctx: pv.currentCtx });
		}

		const bodyEl = getBody(view);
		const calls = (view.registerDomEvent as ReturnType<typeof vi.fn>).mock.calls;
		const bodyClicks = calls.filter(
			(c) => c[0] === bodyEl && c[1] === "click",
		);
		expect(bodyClicks.length).toBe(1);
	});

	it("keyboard (Enter) on a link row drills too", () => {
		const from = makeMdFile("Mara Stoneway");
		const to = makeMdFile("Silvan Nightweaver");
		seedResolved(from, to);

		const el = getBody(view).querySelector(
			`[data-sf-link="${to.path}"]`,
		) as HTMLElement;
		const evt = new KeyboardEvent("keydown", { key: "Enter", bubbles: true });
		el.dispatchEvent(evt);

		const pv = view as unknown as { subject: { file: TFile | null; source: string } };
		expect(pv.subject.file?.path).toBe(to.path);
		expect(pv.subject.source).toBe("drilled");
	});

	// FIX 3a: Space key also drills (keyboard parity with Enter)
	it("keyboard (Space) on a link row drills too", () => {
		const from = makeMdFile("Mara Stoneway");
		const to = makeMdFile("Silvan Nightweaver");
		seedResolved(from, to);

		const el = getBody(view).querySelector(
			`[data-sf-link="${to.path}"]`,
		) as HTMLElement;
		const evt = new KeyboardEvent("keydown", { key: " ", bubbles: true });
		el.dispatchEvent(evt);

		const pv = view as unknown as { subject: { file: TFile | null; source: string } };
		expect(pv.subject.file?.path).toBe(to.path);
		expect(pv.subject.source).toBe("drilled");
	});

	// FIX 3b: multi-level back — intermediate drilled state, then full pop
	it("multi-level back: A→B→C then back once is still drilled; back twice returns to follow", () => {
		const fileA = makeMdFile("A");
		const fileB = makeMdFile("B");
		const fileC = makeMdFile("C");

		// Drill A → B
		seedResolved(fileA, fileB);
		clickLink(view, fileB.path);

		// Now seed B → C so we can drill again
		registerCharacter(app, fileC);
		const pv = view as unknown as {
			subject: { file: TFile | null; source: string };
			currentCtx: NoteContext;
			navStack: TFile[];
			_renderState(s: { kind: string; ctx: NoteContext }): void;
		};
		const ctxB: NoteContext = {
			activeFile: fileB,
			activeKind: "character",
			entities: [{ file: fileC, kind: "character", relation: "outgoing", field: "allies" }],
			backlinks: [],
			frontmatter: {},
			resolvedAt: Date.now(),
		};
		pv.currentCtx = ctxB;
		pv._renderState({ kind: "resolved", ctx: ctxB });

		// Drill B → C (now stack = [A, B])
		clickLink(view, fileC.path);

		expect(pv.navStack.map((f) => f.path)).toEqual([fileA.path, fileB.path]);
		expect(pv.subject.file?.path).toBe(fileC.path);

		// Back once: pops C → B, stack = [A], still drilled (Back lives in header now).
		const backBtn1 = view.contentEl.querySelector('.sf-chead [data-sf-nav="back"]') as HTMLElement;
		backBtn1.dispatchEvent(new MouseEvent("click", { bubbles: true }));

		expect(pv.navStack.length).toBe(1);
		expect(pv.subject.file?.path).toBe(fileB.path);
		expect(pv.subject.source).toBe("drilled");

		// Back twice: pops B → A, stack = [], follow resumes
		const backBtn2 = view.contentEl.querySelector('.sf-chead [data-sf-nav="back"]') as HTMLElement;
		backBtn2.dispatchEvent(new MouseEvent("click", { bubbles: true }));

		expect(pv.navStack.length).toBe(0);
		expect(pv.subject.file?.path).toBe(fileA.path);
		expect(pv.subject.source).toBe("follow");
	});

	// FIX 2: Open-note footer (data-sf-nav="open") calls openLinkText, clears stack, resumes follow
	it("Open-note footer click opens the subject note, clears the nav stack, resumes follow", () => {
		const from = makeMdFile("Mara Stoneway");
		const to = makeMdFile("Silvan Nightweaver");
		seedResolved(from, to);

		// Drill into `to` so there is a nav stack entry and we are "drilled"
		clickLink(view, to.path);

		// The Open-note footer should open `to` (the current drilled subject)
		const openBtn = getBody(view).querySelector('[data-sf-nav="open"]') as HTMLElement | null;
		expect(openBtn).not.toBeNull();
		openBtn!.dispatchEvent(new MouseEvent("click", { bubbles: true }));

		expect(app.workspace.openLinkText).toHaveBeenCalledWith(to.path, to.path, false);
		const pv = view as unknown as {
			subject: { file: TFile | null; source: string };
			navStack: TFile[];
		};
		expect(pv.navStack.length).toBe(0);
		expect(pv.subject.source).toBe("follow");
	});

	// FIX 1 test: modifier-open on a link row must track the OPENED target, not the prior subject
	it("modifier-open on a link row sets subject.file to the opened target (not the prior subject)", () => {
		const from = makeMdFile("Mara Stoneway");
		const to = makeMdFile("Silvan Nightweaver");
		seedResolved(from, to);

		// Modifier-click opens `to` in the editor
		clickLink(view, to.path, { meta: true });

		const pv = view as unknown as {
			subject: { file: TFile | null; source: string };
		};
		// After opening, subject.file must be `to`, not `from`
		expect(pv.subject.file?.path).toBe(to.path);
		expect(pv.subject.source).toBe("follow");
	});

	// -----------------------------------------------------------------------
	// FIX W2: bare-basename fallback via getFirstLinkpathDest
	// -----------------------------------------------------------------------

	it("bare-basename link resolves via getFirstLinkpathDest when getAbstractFileByPath returns null", () => {
		const from = makeMdFile("Mara Stoneway");
		// Target is stored with a bare basename (no folder path) — the kind that
		// wikilinks stamp in data-sf-link when the file has no known vault path.
		const to = makeMdFile("Silvan Nightweaver");
		const bareBasename = "Silvan Nightweaver"; // NOT a full vault path

		// getAbstractFileByPath returns null for the bare name (not a path).
		app.vault.getAbstractFileByPath = vi.fn(
			(_p: string): ReturnType<App["vault"]["getAbstractFileByPath"]> => null,
		);
		// getFirstLinkpathDest resolves the bare basename to the target TFile.
		app.metadataCache.getFirstLinkpathDest = vi.fn(
			(linkpath: string, _sourcePath: string): TFile | null =>
				linkpath === bareBasename ? to : null,
		);
		// metadataCache.getFileCache classifies target as character so drill succeeds.
		app.metadataCache.getFileCache = vi.fn(() => ({
			tags: [{ tag: "#canon/character" }],
			frontmatter: {},
		}));

		// Render a body element with data-sf-link set to the BARE BASENAME.
		const body = getBody(view);
		const linkEl = document.createElement("span");
		linkEl.setAttribute("data-sf-link", bareBasename);
		body.appendChild(linkEl);

		const pv = view as unknown as {
			subject: { file: TFile | null; source: string };
			navStack: TFile[];
		};
		pv.subject = { file: from, source: "follow" };

		linkEl.dispatchEvent(new MouseEvent("click", { bubbles: true }));

		// Navigation must have resolved to `to` via the fallback path.
		expect(pv.subject.file?.path).toBe(to.path);
		expect(pv.subject.source).toBe("drilled");
	});

	it("path-based relation links resolve via getAbstractFileByPath (fallback not needed)", () => {
		const from = makeMdFile("Mara Stoneway");
		const to = makeMdFile("Silvan Nightweaver");
		// This is the normal path: seedResolved stamps the full vault path.
		seedResolved(from, to);

		// Confirm getAbstractFileByPath is the one that resolves it.
		const getAbstract = vi.spyOn(app.vault, "getAbstractFileByPath");

		clickLink(view, to.path);

		expect(getAbstract).toHaveBeenCalledWith(to.path);
		const pv = view as unknown as { subject: { file: TFile | null; source: string } };
		expect(pv.subject.file?.path).toBe(to.path);
		expect(pv.subject.source).toBe("drilled");
	});
});

// ---------------------------------------------------------------------------
// Nav-stack lifecycle: cleared on open-note and onClose
// ---------------------------------------------------------------------------

describe("SidebarView: nav-stack lifecycle & leak teardown", () => {
	let app: App;
	let leaf: WorkspaceLeaf;
	let native: NativeScopingEngine;
	let view: SidebarView;

	beforeEach(async () => {
		app = makeApp();
		leaf = makeOwnLeaf(app);
		native = new NativeScopingEngine(app);
		view = new SidebarView(leaf, undefined, undefined, native);
		await view.onOpen();
	});

	afterEach(async () => {
		if (view) await view.onClose();
	});

	it("onClose clears the nav stack and resets subject to follow", async () => {
		const pv = view as unknown as {
			navStack: TFile[];
			subject: { file: TFile | null; source: string };
		};
		pv.navStack = [makeMdFile("A"), makeMdFile("B")];
		pv.subject = { file: makeMdFile("B"), source: "drilled" };

		await view.onClose();

		expect(pv.navStack.length).toBe(0);
		expect(pv.subject.source).toBe("follow");
	});

	it("_runCleanup (unload) tears down the delegated body handler", () => {
		// After unload, the body's delegated click handler is removed: a click on a
		// stale link element must not mutate the subject.
		const bodyEl = getBody(view);
		// Simulate Obsidian unloading the component (runs registered cleanups).
		(view as unknown as { _unload(): void })._unload();

		// After teardown, dispatch a click carrying a data-sf-link — nothing routes.
		const stale = document.createElement("span");
		stale.setAttribute("data-sf-link", "Whatever.md");
		bodyEl.appendChild(stale);
		app.vault.getAbstractFileByPath = vi.fn(() => makeMdFile("Whatever"));

		const before = (view as unknown as { subject: { file: TFile | null } }).subject.file;
		stale.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		const after = (view as unknown as { subject: { file: TFile | null } }).subject.file;

		expect(after).toBe(before);
	});
});

// ---------------------------------------------------------------------------
// Fix #8/#9: header Back control + drill trail + pin preserves Back
// ---------------------------------------------------------------------------

describe("SidebarView: header Back + drill trail (S41)", () => {
	let app: App;
	let leaf: WorkspaceLeaf;
	let native: NativeScopingEngine;
	let view: SidebarView;

	beforeEach(async () => {
		app = makeApp();
		leaf = makeOwnLeaf(app);
		native = new NativeScopingEngine(app);
		view = new SidebarView(leaf, makeRegistry(), makeGate(), native, undefined, () => "drill");
		await view.onOpen();
	});
	afterEach(async () => {
		await view.onClose();
	});

	function head(): HTMLElement {
		return view.contentEl.querySelector(".sf-chead") as HTMLElement;
	}

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
			_renderState(s: { kind: string; ctx: NoteContext }): void;
		};
		pv.subject = { file: from, source: "follow" };
		pv.currentCtx = ctx;
		pv._renderState({ kind: "resolved", ctx });
	}

	it("Back lives in the header (.sf-chead), before the title, and is hidden initially", () => {
		const back = head().querySelector('[data-sf-nav="back"]') as HTMLElement | null;
		expect(back).not.toBeNull();
		// Header Back precedes the title node.
		const title = head().querySelector(".sf-title") as HTMLElement;
		expect(back!.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		// Hidden while not drilled.
		expect(back!.classList.contains("sf-hidden")).toBe(true);
	});

	it("header Back becomes visible after drilling and pops the stack", () => {
		const from = makeMdFile("Mara Stoneway");
		const to = makeMdFile("Silvan Nightweaver");
		seedResolved(from, to);
		clickLink(view, to.path);

		const back = head().querySelector('[data-sf-nav="back"]') as HTMLElement;
		expect(back.classList.contains("sf-hidden")).toBe(false);

		back.dispatchEvent(new MouseEvent("click", { bubbles: true }));

		const pv = view as unknown as { subject: { file: TFile | null; source: string } };
		expect(pv.subject.file?.path).toBe(from.path);
		expect(pv.subject.source).toBe("follow");
		// Hidden again once the stack is empty.
		expect(back.classList.contains("sf-hidden")).toBe(true);
	});

	it("renders a drill trail 'from <prev> › <current>' in the body when drilled", () => {
		const from = makeMdFile("Mara Stoneway");
		const to = makeMdFile("Silvan Nightweaver");
		seedResolved(from, to);
		clickLink(view, to.path);

		const trail = getBody(view).querySelector(".sf-trailrow") as HTMLElement | null;
		expect(trail).not.toBeNull();
		expect(trail?.textContent).toContain("from");
		expect(trail?.textContent).toContain("Mara Stoneway");
		expect(trail?.textContent).toContain("Silvan Nightweaver");
	});

	it("the body no longer renders a .sf-navbar Back bar (moved to header)", () => {
		const from = makeMdFile("Mara Stoneway");
		const to = makeMdFile("Silvan Nightweaver");
		seedResolved(from, to);
		clickLink(view, to.path);

		expect(getBody(view).querySelector(".sf-navbar")).toBeNull();
	});

	it("the header Back handler is registered once (leak-free)", () => {
		const back = head().querySelector('[data-sf-nav="back"]') as HTMLElement;
		const calls = (view.registerDomEvent as ReturnType<typeof vi.fn>).mock.calls;
		const backClicks = calls.filter((c) => c[0] === back && c[1] === "click");
		expect(backClicks.length).toBe(1);
	});
});

describe("SidebarView: pin preserves Back while drilled (fix #9)", () => {
	let app: App;
	let leaf: WorkspaceLeaf;
	let native: NativeScopingEngine;
	let view: SidebarView;

	beforeEach(async () => {
		app = makeApp();
		leaf = makeOwnLeaf(app);
		native = new NativeScopingEngine(app);
		view = new SidebarView(leaf, makeRegistry(), makeGate(), native, undefined, () => "drill");
		await view.onOpen();
	});
	afterEach(async () => {
		await view.onClose();
	});

	function head(): HTMLElement {
		return view.contentEl.querySelector(".sf-chead") as HTMLElement;
	}

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
			_renderState(s: { kind: string; ctx: NoteContext }): void;
		};
		pv.subject = { file: from, source: "follow" };
		pv.currentCtx = ctx;
		pv._renderState({ kind: "resolved", ctx });
	}

	it("pinning while drilled keeps the nav stack and the header Back visible", () => {
		const from = makeMdFile("Mara Stoneway");
		const to = makeMdFile("Silvan Nightweaver");
		seedResolved(from, to);
		clickLink(view, to.path);

		const pv = view as unknown as {
			navStack: TFile[];
			togglePin(): void;
		};
		expect(pv.navStack.length).toBe(1);

		pv.togglePin(); // pin while drilled

		// Nav stack is preserved…
		expect(pv.navStack.length).toBe(1);
		// …and Back stays visible (gated on navStack, not source).
		const back = head().querySelector('[data-sf-nav="back"]') as HTMLElement;
		expect(back.classList.contains("sf-hidden")).toBe(false);
	});

	it("Back still works after pinning while drilled", () => {
		const from = makeMdFile("Mara Stoneway");
		const to = makeMdFile("Silvan Nightweaver");
		seedResolved(from, to);
		clickLink(view, to.path);

		const pv = view as unknown as {
			navStack: TFile[];
			subject: { file: TFile | null; source: string };
			togglePin(): void;
		};
		pv.togglePin();

		const back = head().querySelector('[data-sf-nav="back"]') as HTMLElement;
		back.dispatchEvent(new MouseEvent("click", { bubbles: true }));

		expect(pv.navStack.length).toBe(0);
		expect(pv.subject.file?.path).toBe(from.path);
	});
});

// ---------------------------------------------------------------------------
// Behaviour 5: pinned + diverged → S43 hint; unpin resumes follow
// ---------------------------------------------------------------------------

describe("SidebarView: pinned divergence (S43)", () => {
	let app: App;
	let leaf: WorkspaceLeaf;
	let native: NativeScopingEngine;
	let view: SidebarView;

	beforeEach(async () => {
		vi.useFakeTimers();
		app = makeApp();
		leaf = makeOwnLeaf(app);
		native = new NativeScopingEngine(app);
		view = new SidebarView(leaf, undefined, undefined, native);
		await view.onOpen();
	});

	afterEach(async () => {
		await view.onClose();
		vi.useRealTimers();
	});

	it("shows the S43 pinned-divergence hint when the active note differs from the pinned subject", () => {
		const pinned = makeMdFile("Mara Stoneway");
		app.metadataCache.getFileCache = vi.fn(() => ({
			tags: [{ tag: "#canon/character" }],
			frontmatter: {},
		}));

		const pv = view as unknown as {
			subject: { file: TFile | null; source: string };
			currentCtx: NoteContext;
			_renderState(s: { kind: string; ctx: NoteContext }): void;
		};
		pv.subject = { file: pinned, source: "pinned" };
		pv.currentCtx = makeNoteContext(pinned);
		pv._renderState({ kind: "resolved", ctx: pv.currentCtx });

		// The editor moves to a DIFFERENT note while pinned.
		const other = makeMdFile("Scene 3");
		app.workspace._trigger("active-leaf-change", makeMdLeaf(other));
		vi.advanceTimersByTime(300);

		const hint = getBody(view).querySelector(".sf-pinhint") as HTMLElement | null;
		expect(hint).not.toBeNull();
		expect(hint?.textContent).toContain("Pinned");
	});

	it("no divergence hint when the active note equals the pinned subject", () => {
		const pinned = makeMdFile("Mara Stoneway");
		app.metadataCache.getFileCache = vi.fn(() => ({
			tags: [{ tag: "#canon/character" }],
			frontmatter: {},
		}));

		const pv = view as unknown as {
			subject: { file: TFile | null; source: string };
			currentCtx: NoteContext;
			_renderState(s: { kind: string; ctx: NoteContext }): void;
		};
		pv.subject = { file: pinned, source: "pinned" };
		pv.currentCtx = makeNoteContext(pinned);
		pv._renderState({ kind: "resolved", ctx: pv.currentCtx });

		// Active note is the SAME as the pinned subject.
		app.workspace._trigger("active-leaf-change", makeMdLeaf(pinned));
		vi.advanceTimersByTime(300);

		expect(getBody(view).querySelector(".sf-pinhint")).toBeNull();
	});

	it("unpin resumes follow (source → follow)", () => {
		const pinned = makeMdFile("Mara Stoneway");
		const pv = view as unknown as {
			subject: { file: TFile | null; source: string };
			togglePin(): void;
		};
		pv.subject = { file: pinned, source: "pinned" };

		pv.togglePin();

		expect(pv.subject.source).toBe("follow");
	});
});

// ---------------------------------------------------------------------------
// T3.1 — SidebarView.showFile(file) public seam (ADR-4, PRD/AC-F2.2, AC-F2.6)
// ---------------------------------------------------------------------------

describe("SidebarView: showFile public seam (T3.1)", () => {
	let app: App;
	let leaf: WorkspaceLeaf;
	let native: NativeScopingEngine;
	let view: SidebarView;

	function makeOwnLeafSF(a: App): WorkspaceLeaf {
		const l = new WorkspaceLeaf();
		l.app = a;
		l.view.getViewType = vi.fn(() => SIDEBAR_VIEW_TYPE);
		l.setViewState = vi.fn(async (s: { type: string }) => {
			l.view.getViewType = vi.fn(() => s.type);
		});
		return l;
	}

	function makeMdFileSF(basename = "Silvan Nightweaver"): TFile {
		const f = new TFile();
		f.path = `${basename}.md`;
		f.name = `${basename}.md`;
		f.basename = basename;
		f.extension = "md";
		return f;
	}

	function makeNonMdFileSF(): TFile {
		const f = new TFile();
		f.path = "cover.png";
		f.name = "cover.png";
		f.basename = "cover";
		f.extension = "png";
		return f;
	}

	function makeRegistrySF(): EngineRegistry {
		return { get: vi.fn(() => undefined) } as unknown as EngineRegistry;
	}
	function makeGateSF(): ConsentGate {
		return {
			evaluate: vi.fn(async () => ({ status: "consented" })),
			requestConsent: vi.fn(async () => false),
			requestReConsent: vi.fn(async () => false),
		} as unknown as ConsentGate;
	}

	beforeEach(async () => {
		app = makeApp();
		leaf = makeOwnLeafSF(app);
		native = new NativeScopingEngine(app);
		view = new SidebarView(leaf, makeRegistrySF(), makeGateSF(), native, undefined, () => "drill");
		await view.onOpen();
	});

	afterEach(async () => {
		await view.onClose();
	});

	// -----------------------------------------------------------------------
	// AC-F2.2: Panel re-subjects on showFile
	// -----------------------------------------------------------------------

	it("showFile(file) pushes the prior subject onto the nav stack", () => {
		const from = makeMdFileSF("Mara Stoneway");
		const to = makeMdFileSF("Silvan Nightweaver");

		const pv = view as unknown as {
			subject: { file: TFile | null; source: string };
			navStack: TFile[];
		};
		pv.subject = { file: from, source: "follow" };

		app.metadataCache.getFileCache = vi.fn(() => ({
			tags: [{ tag: "#canon/character" }],
			frontmatter: {},
		}));

		view.showFile(to);

		expect(pv.navStack.map((f) => f.path)).toEqual([from.path]);
	});

	it("showFile(file) sets subject.source to 'drilled' and subject.file to the new file", () => {
		const from = makeMdFileSF("Mara Stoneway");
		const to = makeMdFileSF("Silvan Nightweaver");

		const pv = view as unknown as {
			subject: { file: TFile | null; source: string };
		};
		pv.subject = { file: from, source: "follow" };

		app.metadataCache.getFileCache = vi.fn(() => ({
			tags: [{ tag: "#canon/character" }],
			frontmatter: {},
		}));

		view.showFile(to);

		expect(pv.subject.source).toBe("drilled");
		expect(pv.subject.file?.path).toBe(to.path);
	});

	it("showFile(file) suspends active-leaf follow (source is not follow after call)", () => {
		const from = makeMdFileSF("Mara Stoneway");
		const to = makeMdFileSF("Silvan Nightweaver");

		const pv = view as unknown as {
			subject: { file: TFile | null; source: string };
		};
		pv.subject = { file: from, source: "follow" };

		app.metadataCache.getFileCache = vi.fn(() => ({
			tags: [{ tag: "#canon/character" }],
			frontmatter: {},
		}));

		view.showFile(to);

		expect(pv.subject.source).not.toBe("follow");
	});

	it("showFile(file) re-renders the panel by calling _resolveOrClassify with the new file", () => {
		const from = makeMdFileSF("Mara Stoneway");
		const to = makeMdFileSF("Silvan Nightweaver");

		const pv = view as unknown as {
			subject: { file: TFile | null; source: string };
			_resolveOrClassify: (f: TFile) => void;
		};
		pv.subject = { file: from, source: "follow" };

		app.metadataCache.getFileCache = vi.fn(() => ({
			tags: [{ tag: "#canon/character" }],
			frontmatter: {},
		}));

		const resolveSpy = vi.spyOn(pv, "_resolveOrClassify");

		view.showFile(to);

		expect(resolveSpy).toHaveBeenCalledWith(to);
	});

	it("showFile delegates to _drillInto (does not re-implement drill logic)", () => {
		const from = makeMdFileSF("Mara Stoneway");
		const to = makeMdFileSF("Silvan Nightweaver");

		const pv = view as unknown as {
			subject: { file: TFile | null; source: string };
			_drillInto: (f: TFile) => void;
		};
		pv.subject = { file: from, source: "follow" };

		app.metadataCache.getFileCache = vi.fn(() => ({
			tags: [{ tag: "#canon/character" }],
			frontmatter: {},
		}));

		const drillSpy = vi.spyOn(pv, "_drillInto");

		view.showFile(to);

		expect(drillSpy).toHaveBeenCalledWith(to);
	});

	// -----------------------------------------------------------------------
	// AC-F2.6: Unresolved/non-md file -> M3 state, no throw
	// -----------------------------------------------------------------------

	it("showFile(nonMdFile) yields non-md M3 state and does not throw", () => {
		const nonMd = makeNonMdFileSF();
		const pv = view as unknown as {
			subject: { file: TFile | null; source: string };
		};
		pv.subject = { file: makeMdFileSF("Mara Stoneway"), source: "follow" };

		expect(() => { view.showFile(nonMd); }).not.toThrow();

		// Non-md state: body shows "Story Forge follows markdown notes." (S3)
		const body = view.contentEl.querySelector(".sf-body");
		expect(body?.textContent).toContain("Story Forge follows markdown notes.");
	});

	it("showFile(mdFile with null cache) yields error state and does not throw (AC-F2.6)", () => {
		const unresolved = makeMdFileSF("Mystery Note");
		const pv = view as unknown as {
			subject: { file: TFile | null; source: string };
		};
		pv.subject = { file: makeMdFileSF("Mara Stoneway"), source: "follow" };

		app.metadataCache.getFileCache = vi.fn(() => null);

		expect(() => { view.showFile(unresolved); }).not.toThrow();

		expect(pv.subject.file?.path).toBe(unresolved.path);
	});

	it("showFile(mdFile with no entity tag) yields non-entity state and does not throw (AC-F2.6)", () => {
		const nonEntity = makeMdFileSF("Random scratchpad");
		const pv = view as unknown as {
			subject: { file: TFile | null; source: string };
		};
		pv.subject = { file: makeMdFileSF("Mara Stoneway"), source: "follow" };

		app.metadataCache.getFileCache = vi.fn(() => ({ frontmatter: {} }));

		expect(() => { view.showFile(nonEntity); }).not.toThrow();

		const badge = view.contentEl.querySelector(".sf-badge");
		expect(badge?.textContent).toBe("not an entity");
	});
});

// ---------------------------------------------------------------------------
// T3.1 — revealAndShowFile helper (closed-panel case)
// ---------------------------------------------------------------------------

describe("revealAndShowFile helper (T3.1)", () => {
	function makeMdFileR(basename = "Silvan Nightweaver"): TFile {
		const f = new TFile();
		f.path = `${basename}.md`;
		f.name = `${basename}.md`;
		f.basename = basename;
		f.extension = "md";
		return f;
	}

	it("reveals an existing sidebar leaf without creating a duplicate leaf", async () => {
		const app = makeApp();
		const file = makeMdFileR("Mara Stoneway");
		const native = new NativeScopingEngine(app);

		const existingLeaf = new WorkspaceLeaf();
		existingLeaf.app = app;

		const sidebarView = new SidebarView(existingLeaf, undefined, undefined, native);
		await sidebarView.onOpen();

		// Simulate: getLeavesOfType returns the leaf carrying the live SidebarView
		const leafWithView = { ...existingLeaf, view: sidebarView } as unknown as WorkspaceLeaf;
		app.workspace.getLeavesOfType = vi.fn((_type: string) => [leafWithView]);

		app.metadataCache.getFileCache = vi.fn(() => ({
			tags: [{ tag: "#canon/character" }],
			frontmatter: {},
		}));

		await revealAndShowFile(app, file);

		// reveal was called on the existing leaf
		expect(app.workspace.revealLeaf).toHaveBeenCalled();
		// No new leaf was created
		expect(app.workspace.getRightLeaf).not.toHaveBeenCalled();
		// showFile was called — view re-subjected to the file
		const pv = sidebarView as unknown as {
			subject: { file: TFile | null; source: string };
		};
		expect(pv.subject.file?.path).toBe(file.path);
		expect(pv.subject.source).toBe("drilled");

		await sidebarView.onClose();
	});

	it("creates a new leaf when the panel is closed then calls showFile on the opened view", async () => {
		const app = makeApp();
		const file = makeMdFileR("Mara Stoneway");
		const native = new NativeScopingEngine(app);

		const newLeaf = new WorkspaceLeaf();
		newLeaf.app = app;
		newLeaf.setViewState = vi.fn(async (s: { type: string }) => {
			newLeaf.view.getViewType = vi.fn(() => s.type);
		});
		app.workspace.getRightLeaf = vi.fn(() => newLeaf);

		const sidebarView = new SidebarView(newLeaf, undefined, undefined, native);
		await sidebarView.onOpen();
		const leafWithView = { ...newLeaf, view: sidebarView } as unknown as WorkspaceLeaf;

		// First getLeavesOfType call (in activateView): no leaf
		// Second call (revealAndShowFile after activateView): leaf present
		let callCount = 0;
		app.workspace.getLeavesOfType = vi.fn((_type: string) => {
			callCount++;
			if (callCount <= 1) return [];
			return [leafWithView];
		});

		app.metadataCache.getFileCache = vi.fn(() => ({
			tags: [{ tag: "#canon/character" }],
			frontmatter: {},
		}));

		await revealAndShowFile(app, file);

		expect(newLeaf.setViewState).toHaveBeenCalledWith({ type: SIDEBAR_VIEW_TYPE, active: true });
		const pv = sidebarView as unknown as {
			subject: { file: TFile | null; source: string };
		};
		expect(pv.subject.file?.path).toBe(file.path);

		await sidebarView.onClose();
	});
});
