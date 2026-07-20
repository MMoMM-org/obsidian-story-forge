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
import { SidebarView } from "views/SidebarView";
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

		// Back control present (S41)
		const back = getBody(view).querySelector('[data-sf-nav="back"]') as HTMLElement | null;
		expect(back).not.toBeNull();

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
