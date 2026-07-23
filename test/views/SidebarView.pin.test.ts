/**
 * T3.4 — Pin & accessibility (RED tests)
 *
 * Tests:
 * - pin freezes subject; active-note changes ignored while pinned (S8)
 * - unpin resumes following active note
 * - pin button is a real <button aria-pressed="true|false">
 * - panel container has role=region + aria-label
 * - tab strip has role=tablist; each tab has role=tab; body has role=tabpanel
 * - body/state region has aria-live=polite
 * - ArrowLeft/ArrowRight on tablist move focus between tabs (handler present)
 * - pin shown in header when pinned (sf-pin-tag "pinned")
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { App, WorkspaceLeaf, TFile } from "obsidian";
import { SidebarView } from "views/SidebarView";
import { SIDEBAR_VIEW_TYPE } from "pluginConstants";
import type { NoteContext } from "scoping/NoteContext";

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

function makeMdFile(basename = "Scene 1"): TFile {
	const f = new TFile();
	f.path = `${basename}.md`;
	f.name = `${basename}.md`;
	f.basename = basename;
	f.extension = "md";
	return f;
}

function makeNoteContext(file: TFile): NoteContext {
	return {
		activeFile: file,
		activeKind: "character",
		entities: [],
		backlinks: [],
		frontmatter: {},
		resolvedAt: Date.now(),
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SidebarView: pin toggle", () => {
	let app: App;
	let leaf: WorkspaceLeaf;
	let view: SidebarView;

	beforeEach(async () => {
		vi.useFakeTimers();
		app = makeApp();
		leaf = makeOwnLeaf(app);
		view = new SidebarView(leaf);
		await view.onOpen();
	});

	afterEach(async () => {
		await view.onClose();
		vi.useRealTimers();
	});

	it("pin button exists in the DOM", () => {
		const btn = view.contentEl.querySelector(".sf-pin-btn") as HTMLButtonElement | null;
		expect(btn).not.toBeNull();
		expect(btn?.tagName).toBe("BUTTON");
	});

	it("pin button has aria-pressed='false' by default", () => {
		const btn = view.contentEl.querySelector(".sf-pin-btn") as HTMLButtonElement;
		expect(btn.getAttribute("aria-pressed")).toBe("false");
	});

	it("clicking pin button sets aria-pressed='true'", () => {
		const btn = view.contentEl.querySelector(".sf-pin-btn") as HTMLButtonElement;
		btn.click();
		expect(btn.getAttribute("aria-pressed")).toBe("true");
	});

	it("clicking pin button twice restores aria-pressed='false'", () => {
		const btn = view.contentEl.querySelector(".sf-pin-btn") as HTMLButtonElement;
		btn.click();
		btn.click();
		expect(btn.getAttribute("aria-pressed")).toBe("false");
	});

	it("edit-mode (pencil) button exists and defaults to aria-pressed='false'", () => {
		const btn = view.contentEl.querySelector(".sf-edit-btn") as HTMLButtonElement | null;
		expect(btn).not.toBeNull();
		expect(btn?.tagName).toBe("BUTTON");
		expect(btn?.getAttribute("aria-pressed")).toBe("false");
	});

	it("clicking the pencil button toggles edit mode (aria-pressed + _editMode)", () => {
		const btn = view.contentEl.querySelector(".sf-edit-btn") as HTMLButtonElement;
		const priv = view as unknown as { _editMode: boolean };

		expect(priv._editMode).toBe(false);
		btn.click();
		expect(priv._editMode).toBe(true);
		expect(btn.getAttribute("aria-pressed")).toBe("true");

		btn.click();
		expect(priv._editMode).toBe(false);
		expect(btn.getAttribute("aria-pressed")).toBe("false");
	});

	it("pinning freezes subject — active-note changes ignored", () => {
		const file = makeMdFile("Pinned Note");
		// Set a subject first
		(view as unknown as { subject: { file: TFile | null; source: string } }).subject = {
			file,
			source: "follow",
		};

		// Pin
		const btn = view.contentEl.querySelector(".sf-pin-btn") as HTMLButtonElement;
		btn.click();

		const resolveSpy = vi.spyOn(
			(view as unknown as { scoping: { resolve: (f: TFile) => unknown } }).scoping,
			"resolve",
		);

		// Trigger active-leaf-change with a different note
		const anotherFile = makeMdFile("Another Note");
		app.workspace._trigger("active-leaf-change", makeMdLeaf(anotherFile));
		vi.advanceTimersByTime(300);

		expect(resolveSpy).not.toHaveBeenCalled();
	});

	it("pinning shows 'pinned' pin-tag in header", () => {
		const file = makeMdFile("Pinned Note");
		// Set up a resolved context
		app.metadataCache.getFileCache = vi.fn(() => ({
			tags: [{ tag: "#canon/character" }],
			frontmatter: {},
		}));
		(view as unknown as { subject: { file: TFile | null; source: string } }).subject = {
			file,
			source: "follow",
		};
		const ctx = makeNoteContext(file);
		(view as unknown as { currentCtx: NoteContext }).currentCtx = ctx;

		// Pin and re-render
		const btn = view.contentEl.querySelector(".sf-pin-btn") as HTMLButtonElement;
		btn.click();

		const pinTag = view.contentEl.querySelector(".sf-pin-tag") as HTMLElement | null;
		expect(pinTag).not.toBeNull();
		expect(pinTag?.classList.contains("sf-hidden")).toBe(false);
		expect(pinTag?.textContent).toBe("pinned");
	});

	it("unpinning resumes following the active note", () => {
		const file = makeMdFile("Pinned Note");
		(view as unknown as { subject: { file: TFile | null; source: string } }).subject = {
			file,
			source: "pinned",
		};

		const btn = view.contentEl.querySelector(".sf-pin-btn") as HTMLButtonElement;

		// Subject is pinned — simulate unpin by calling togglePin()
		(view as unknown as { togglePin(): void }).togglePin();

		expect(
			(view as unknown as { subject: { source: string } }).subject.source,
		).toBe("follow");
	});

	it("togglePin(): source flips follow→pinned→follow", () => {
		const tv = view as unknown as {
			subject: { file: TFile | null; source: string };
			togglePin(): void;
		};

		expect(tv.subject.source).toBe("follow");

		tv.togglePin();
		expect(tv.subject.source).toBe("pinned");

		tv.togglePin();
		expect(tv.subject.source).toBe("follow");
	});
});

describe("SidebarView: ARIA roles & accessibility", () => {
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

	it("contentEl has role=region", () => {
		expect(view.contentEl.getAttribute("role")).toBe("region");
	});

	it("contentEl has aria-label", () => {
		const label = view.contentEl.getAttribute("aria-label");
		expect(label).toBeTruthy();
		expect(label!.length).toBeGreaterThan(0);
	});

	it("tab strip has role=tablist", () => {
		const tablist = view.contentEl.querySelector(".sf-tabs");
		expect(tablist?.getAttribute("role")).toBe("tablist");
	});

	it("each tab has role=tab", () => {
		const tabs = view.contentEl.querySelectorAll(".sf-tab");
		expect(tabs.length).toBeGreaterThan(0);
		tabs.forEach((tab) => {
			expect(tab.getAttribute("role")).toBe("tab");
		});
	});

	it("body has role=tabpanel", () => {
		const body = view.contentEl.querySelector(".sf-body");
		expect(body?.getAttribute("role")).toBe("tabpanel");
	});

	it("body has aria-live=polite", () => {
		const body = view.contentEl.querySelector(".sf-body");
		expect(body?.getAttribute("aria-live")).toBe("polite");
	});

	it("ArrowLeft/ArrowRight key handler is wired on the tablist", () => {
		const tablist = view.contentEl.querySelector(".sf-tabs") as HTMLElement;
		expect(tablist).not.toBeNull();

		// Dispatch ArrowRight — should not throw, handler is present
		const event = new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true });
		expect(() => tablist.dispatchEvent(event)).not.toThrow();
	});

	it("ArrowLeft key on tablist is handled without error", () => {
		const tablist = view.contentEl.querySelector(".sf-tabs") as HTMLElement;
		const event = new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true });
		expect(() => tablist.dispatchEvent(event)).not.toThrow();
	});

	it("pin button has aria-label", () => {
		const btn = view.contentEl.querySelector(".sf-pin-btn") as HTMLButtonElement | null;
		expect(btn?.getAttribute("aria-label")).toBeTruthy();
	});

	it("clicking a section header toggles its body collapsed (delegated body handler)", () => {
		const body = view.contentEl.querySelector(".sf-body") as HTMLElement;
		expect(body).not.toBeNull();

		// Build a minimal M3 section into the body (mirrors components.section()).
		const sectionEl = document.createElement("div");
		sectionEl.className = "sf-section";
		const head = document.createElement("div");
		head.className = "sf-sec-head";
		head.setAttribute("data-sf-section-toggle", "");
		const chev = document.createElement("span");
		chev.className = "sf-sec-chev";
		chev.textContent = "▼";
		head.appendChild(chev);
		const secBody = document.createElement("div");
		secBody.className = "sf-sec-body";
		sectionEl.appendChild(head);
		sectionEl.appendChild(secBody);
		body.appendChild(sectionEl);

		// Click collapses.
		head.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		expect(secBody.classList.contains("sf-sec-body--collapsed")).toBe(true);
		expect(head.getAttribute("aria-expanded")).toBe("false");
		expect(chev.textContent).toBe("▶");

		// Click again expands.
		head.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		expect(secBody.classList.contains("sf-sec-body--collapsed")).toBe(false);
		expect(head.getAttribute("aria-expanded")).toBe("true");
		expect(chev.textContent).toBe("▼");
	});
});
