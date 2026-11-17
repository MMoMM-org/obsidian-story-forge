/**
 * T3.2 — Follow lifecycle & subject (RED tests)
 *
 * Tests:
 * - active-leaf-change on a non-own MarkdownView triggers ScopingService.resolve
 * - focusing the panel's OWN leaf is IGNORED (no resolve, subject unchanged)
 * - focusing a non-MarkdownView leaf is IGNORED
 * - rapid switches within debounce window coalesce to only the LAST note
 * - when subject.source === "pinned", active-note changes are ignored
 * - FIRST resolve is deferred until workspace.onLayoutReady
 * - metadataCache 'changed' event re-resolves the current subject file
 * - ALL listeners registered via registerEvent (not raw addEventListener)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { App, WorkspaceLeaf, TFile } from "obsidian";
import { SidebarView } from "views/SidebarView";
import { SIDEBAR_VIEW_TYPE } from "pluginConstants";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeApp(): App {
	return new App();
}

function makeOwnLeaf(app: App): WorkspaceLeaf {
	const leaf = new WorkspaceLeaf();
	leaf.app = app;
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

function makeNonMdLeaf(): WorkspaceLeaf {
	const leaf = new WorkspaceLeaf();
	leaf.view.getViewType = vi.fn(() => "canvas");
	return leaf;
}

function makeMdFile(basename = "Scene 1"): TFile {
	const f = new TFile();
	f.path = `${basename}.md`;
	f.name = `${basename}.md`;
	f.basename = basename;
	f.extension = "md";
	return f;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SidebarView: follow lifecycle", () => {
	let app: App;
	let ownLeaf: WorkspaceLeaf;
	let view: SidebarView;

	beforeEach(async () => {
		vi.useFakeTimers();
		app = makeApp();
		ownLeaf = makeOwnLeaf(app);
		// Make ownLeaf report as story-forge-panel
		ownLeaf.view.getViewType = vi.fn(() => SIDEBAR_VIEW_TYPE);
		view = new SidebarView(ownLeaf);
		await view.onOpen();
	});

	afterEach(async () => {
		await view.onClose();
		vi.useRealTimers();
	});

	it("active-leaf-change on a markdown leaf triggers resolve", async () => {
		const file = makeMdFile("Mara Stoneway");
		// Set up scoping to classify as 'character' so we get a resolve call
		app.metadataCache.getFileCache = vi.fn(() => ({
			tags: [{ tag: "#canon/character" }],
			frontmatter: {},
		}));

		const resolveSpy = vi.spyOn(
			// Access the private scoping service via any-cast
			(view as unknown as { scoping: { resolve: (f: TFile) => unknown } }).scoping,
			"resolve",
		);

		const mdLeaf = makeMdLeaf(file);

		// Trigger active-leaf-change
		app.workspace._trigger("active-leaf-change", mdLeaf);

		// Advance past debounce
		vi.advanceTimersByTime(250);

		expect(resolveSpy).toHaveBeenCalledWith(file);
	});

	it("focusing the panel's OWN leaf is ignored — no resolve", async () => {
		const resolveSpy = vi.spyOn(
			(view as unknown as { scoping: { resolve: (f: TFile) => unknown } }).scoping,
			"resolve",
		);

		// Trigger with the OWN leaf (the panel's leaf)
		app.workspace._trigger("active-leaf-change", ownLeaf);
		vi.advanceTimersByTime(250);

		expect(resolveSpy).not.toHaveBeenCalled();
	});

	it("focusing a non-MarkdownView leaf is ignored — no resolve", async () => {
		const resolveSpy = vi.spyOn(
			(view as unknown as { scoping: { resolve: (f: TFile) => unknown } }).scoping,
			"resolve",
		);

		const canvasLeaf = makeNonMdLeaf();
		app.workspace._trigger("active-leaf-change", canvasLeaf);
		vi.advanceTimersByTime(250);

		expect(resolveSpy).not.toHaveBeenCalled();
	});

	it("rapid switches coalesce — only the LAST note is resolved", async () => {
		const file1 = makeMdFile("Scene 1");
		const file2 = makeMdFile("Scene 2");
		const file3 = makeMdFile("Mara Stoneway");

		app.metadataCache.getFileCache = vi.fn(() => ({
			tags: [{ tag: "#canon/character" }],
			frontmatter: {},
		}));

		const resolveSpy = vi.spyOn(
			(view as unknown as { scoping: { resolve: (f: TFile) => unknown } }).scoping,
			"resolve",
		);

		// Rapid switches within the debounce window
		app.workspace._trigger("active-leaf-change", makeMdLeaf(file1));
		vi.advanceTimersByTime(50);
		app.workspace._trigger("active-leaf-change", makeMdLeaf(file2));
		vi.advanceTimersByTime(50);
		app.workspace._trigger("active-leaf-change", makeMdLeaf(file3));

		// Advance past debounce
		vi.advanceTimersByTime(300);

		// Only the last file should have been resolved
		expect(resolveSpy).toHaveBeenCalledTimes(1);
		expect(resolveSpy).toHaveBeenCalledWith(file3);
	});

	it("when subject.source === 'pinned', active-note changes are ignored", async () => {
		const file = makeMdFile("Pinned Note");
		app.metadataCache.getFileCache = vi.fn(() => ({
			tags: [{ tag: "#canon/character" }],
			frontmatter: {},
		}));

		// Pin the subject
		(view as unknown as { subject: { file: unknown; source: string } }).subject = {
			file,
			source: "pinned",
		};

		const resolveSpy = vi.spyOn(
			(view as unknown as { scoping: { resolve: (f: TFile) => unknown } }).scoping,
			"resolve",
		);

		const anotherFile = makeMdFile("Another Note");
		const mdLeaf = makeMdLeaf(anotherFile);
		app.workspace._trigger("active-leaf-change", mdLeaf);
		vi.advanceTimersByTime(300);

		expect(resolveSpy).not.toHaveBeenCalled();
	});

	it("first resolve is deferred until workspace.onLayoutReady", async () => {
		// onLayoutReady is called synchronously in the mock, so verify it was called.
		// The real gating (listeners registered only AFTER layout-ready fires) is
		// asserted in the "layout-ready gating" describe block below, which defers
		// the onLayoutReady callback.
		expect(app.workspace.onLayoutReady).toHaveBeenCalled();
	});

	it("cache present + classify 'unknown' → S4 non-entity, resolve NOT called", async () => {
		const file = makeMdFile("Ideas scratchpad");
		// Cache is present (not null) so this is NOT the S9 error path...
		app.metadataCache.getFileCache = vi.fn(() => ({ frontmatter: {} }));
		// ...but classify says it's not a tracked entity → S4.
		vi.spyOn(
			(view as unknown as { scoping: { classify: (f: TFile) => string } }).scoping,
			"classify",
		).mockReturnValue("unknown");

		const resolveSpy = vi.spyOn(
			(view as unknown as { scoping: { resolve: (f: TFile) => unknown } }).scoping,
			"resolve",
		);

		app.workspace._trigger("active-leaf-change", makeMdLeaf(file));
		vi.advanceTimersByTime(300);

		// (a) resolve is never called for a non-entity note
		expect(resolveSpy).not.toHaveBeenCalled();

		// (b) the body shows S4 non-entity content (not S9 error, not S6 stub)
		const body = view.contentEl.querySelector(".sf-body") as HTMLElement;
		const badge = view.contentEl.querySelector(".sf-badge");
		expect(badge?.textContent).toBe("not an entity");
		expect(body.querySelector(".sf-empty")).not.toBeNull();
		expect(body.textContent).toContain(
			"This note isn't a tracked character, location, object, lore, scene, plotline, or book.",
		);
		expect(body.querySelector(".sf-errbox")).toBeNull();
		expect(body.querySelector(".sf-stublabel")).toBeNull();
	});

	it("onClose cancels the pending debounce — no dangling resolve fires", async () => {
		const file = makeMdFile("Mara Stoneway");
		app.metadataCache.getFileCache = vi.fn(() => ({
			tags: [{ tag: "#canon/character" }],
			frontmatter: {},
		}));

		const resolveSpy = vi.spyOn(
			(view as unknown as { scoping: { resolve: (f: TFile) => unknown } }).scoping,
			"resolve",
		);

		// Enqueue a debounced follow, then close BEFORE the debounce window elapses.
		app.workspace._trigger("active-leaf-change", makeMdLeaf(file));
		await view.onClose();

		// Advancing past the debounce window must NOT trigger the cancelled follow.
		vi.advanceTimersByTime(300);

		expect(resolveSpy).not.toHaveBeenCalled();
	});

	it("metadataCache 'changed' event re-resolves the current subject file", async () => {
		const file = makeMdFile("Mara Stoneway");
		app.metadataCache.getFileCache = vi.fn(() => ({
			tags: [{ tag: "#canon/character" }],
			frontmatter: {},
		}));

		// Set subject to follow with this file
		(view as unknown as { subject: { file: TFile | null; source: string } }).subject = {
			file,
			source: "follow",
		};

		const resolveSpy = vi.spyOn(
			(view as unknown as { scoping: { resolve: (f: TFile) => unknown } }).scoping,
			"resolve",
		);

		// Fire metadataCache 'changed' for this file
		app.metadataCache._trigger("changed", file);

		expect(resolveSpy).toHaveBeenCalledWith(file);
	});

	it("metadataCache 'changed' for a DIFFERENT file does NOT re-resolve", async () => {
		const subjectFile = makeMdFile("Mara Stoneway");
		const otherFile = makeMdFile("Jonas Kell");

		(view as unknown as { subject: { file: TFile | null; source: string } }).subject = {
			file: subjectFile,
			source: "follow",
		};

		const resolveSpy = vi.spyOn(
			(view as unknown as { scoping: { resolve: (f: TFile) => unknown } }).scoping,
			"resolve",
		);

		app.metadataCache._trigger("changed", otherFile);

		expect(resolveSpy).not.toHaveBeenCalled();
	});

	it("metadataCache 'changed' is ignored when subject is pinned", async () => {
		const file = makeMdFile("Pinned Note");
		(view as unknown as { subject: { file: TFile | null; source: string } }).subject = {
			file,
			source: "pinned",
		};

		const resolveSpy = vi.spyOn(
			(view as unknown as { scoping: { resolve: (f: TFile) => unknown } }).scoping,
			"resolve",
		);

		app.metadataCache._trigger("changed", file);

		expect(resolveSpy).not.toHaveBeenCalled();
	});

	it("ALL listeners registered via registerEvent (not raw addEventListener)", async () => {
		// registerEvent is tracked on the Component mock
		// It should have been called for active-leaf-change and metadataCache.changed
		const registerEventCalls = (view.registerEvent as ReturnType<typeof vi.fn>).mock.calls;
		expect(registerEventCalls.length).toBeGreaterThanOrEqual(2);
	});
});

// ---------------------------------------------------------------------------
// Layout-ready gating: follow listeners are wired ONLY after onLayoutReady fires
// ---------------------------------------------------------------------------

describe("SidebarView: layout-ready gating", () => {
	let app: App;
	let ownLeaf: WorkspaceLeaf;
	let view: SidebarView;

	afterEach(async () => {
		if (view) await view.onClose();
	});

	it("registerEvent is NOT called until the onLayoutReady callback fires", async () => {
		app = makeApp();
		// Opt in to deferral: onLayoutReady stores the cb instead of running it.
		app.workspace._deferLayoutReady = true;

		ownLeaf = makeOwnLeaf(app);
		ownLeaf.view.getViewType = vi.fn(() => SIDEBAR_VIEW_TYPE);
		view = new SidebarView(ownLeaf);

		await view.onOpen();

		// Before layout-ready: the callback is captured but not run, so the follow
		// listeners must NOT have been registered yet.
		expect(app.workspace._layoutReadyCbs.length).toBe(1);
		const registerEvent = view.registerEvent as ReturnType<typeof vi.fn>;
		expect(registerEvent).not.toHaveBeenCalled();

		// Fire the stored layout-ready callback.
		app.workspace._flushLayoutReady();

		// After layout-ready: the follow listeners are now registered via
		// registerEvent (active-leaf-change + metadataCache 'changed').
		expect(registerEvent).toHaveBeenCalled();
		expect(registerEvent.mock.calls.length).toBeGreaterThanOrEqual(2);
	});
});
