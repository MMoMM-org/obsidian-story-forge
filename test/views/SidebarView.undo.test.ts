/**
 * The Workbench and the undo journal (spec 009 T4.3): a real `SidebarView` over the
 * journal harness, so writes go through the real writer and recorder, and undo goes
 * through the real restore. The mock's `processFrontMatter` fires `metadataCache`
 * 'changed' as Obsidian does, and `getFileCache` reads the stored frontmatter.
 *
 * @ref docs/XDD/specs/009-undo-journal/solution.md — ADR-39 (probe), ADR-42 (owed redraw), ADR-51 (pinned refresh)
 * @ref docs/XDD/specs/009-undo-journal/plan/phase-4.md — T4.3
 */

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Notice, WorkspaceLeaf, createMockCachedMetadata, type TFile } from "obsidian";
import type { ConsentGate } from "consent/ConsentGate";
import { NativeScopingEngine } from "engines/NativeScopingEngine";
import { EngineRegistry } from "engines/QueryEngine";
import { DEBOUNCE_MS, NAVIGATOR_TAB_ID, SIDEBAR_VIEW_TYPE } from "pluginConstants";
import { unexpectedErrorNotice } from "undo/stepLabel";
import { SidebarView } from "views/SidebarView";
import { MARA, SCENE_4, setup, teardownAndCheckUntouched, type Harness } from "../undo/journalHarness";

const MARA_FM = { tags: ["canon/character"], type: "character", name: "Mara", nickname: "Stone", origin: "Harbour" };
const SCENE_FM = { tags: ["canon/scene"], type: "scene", title: "Scene 4" };

interface World {
	readonly h: Harness;
	readonly view: SidebarView;
	readonly mara: TFile;
	readonly scene: TFile;
}

/** The harness vault, with a metadata cache that reads each note's stored frontmatter. */
function vault(): Harness {
	const h = setup({ [MARA]: MARA_FM, [SCENE_4]: SCENE_FM });
	vi.mocked(h.app.metadataCache.getFileCache).mockImplementation((file: TFile) =>
		h.app.vault.getFileByPath(file.path) ? createMockCachedMetadata({ frontmatter: h.fm(file.path) }) : null,
	);
	return h;
}

/** Open the Workbench on Mara (the active note), in edit mode, wired to the journal. */
async function open(): Promise<World> {
	const h = vault();
	const mara = h.app.vault.getFileByPath(MARA)!;
	const scene = h.app.vault.getFileByPath(SCENE_4)!;
	vi.mocked(h.app.workspace.getActiveFile).mockReturnValue(mara);
	const leaf = new WorkspaceLeaf();
	leaf.app = h.app;
	leaf.view.getViewType = vi.fn(() => SIDEBAR_VIEW_TYPE);
	const gate = { evaluate: vi.fn() } as unknown as ConsentGate;
	const view = new SidebarView(
		leaf, new EngineRegistry([]), gate, new NativeScopingEngine(h.app),
		undefined, undefined, undefined, undefined, h.journal,
	);
	opened.push(view);
	document.body.appendChild(view.containerEl); // in the workspace, so a field can hold focus
	await view.onOpen();
	click(view, ".sf-edit-btn");
	await settle();
	return { h, view, mara, scene };
}

const opened: SidebarView[] = [];

// Obsidian's cross-window Node.instanceOf, which the mock does not install
// (the same stand-in as test/undo/undoKeys.test.ts).
beforeAll(() => {
	const proto = Node.prototype as unknown as Record<string, unknown>;
	proto["instanceOf"] = function (this: Node, type: { name: string }): boolean {
		const win = (this.ownerDocument?.defaultView ?? window) as unknown as Record<string, new () => unknown>;
		const ctor = win[type.name];
		return ctor !== undefined && this instanceof ctor;
	};
});

afterEach(async () => {
	for (const view of opened.splice(0)) await view.onClose();
	document.body.replaceChildren();
	vi.useRealTimers();
	Notice._reset();
	teardownAndCheckUntouched();
});

async function settle(): Promise<void> {
	for (let i = 0; i < 5; i++) await Promise.resolve();
}

async function settleLong(): Promise<void> {
	for (let i = 0; i < 50; i++) await Promise.resolve();
}

function click(view: SidebarView, selector: string): void {
	(view.contentEl.querySelector(selector) as HTMLElement).click();
}

function input(view: SidebarView, name: string): HTMLInputElement {
	const el = view.contentEl.querySelector<HTMLInputElement>(`[data-sf-inspector-input="${name}"]`);
	if (!el) throw new Error(`no input for ${name}`);
	return el;
}

function type(view: SidebarView, name: string, value: string): void {
	const el = input(view, name);
	el.value = value;
	el.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Type a value and save it through the field's Save button. */
async function save(view: SidebarView, name: string, value: string): Promise<void> {
	type(view, name, value);
	click(view, `[data-sf-inspector-commit="${name}"]`);
	await settle();
}

/** The editor moves to `file`; a pinned Workbench stays put. */
async function activate(w: World, file: TFile): Promise<void> {
	const leaf = new WorkspaceLeaf();
	leaf.view.getViewType = vi.fn(() => "markdown");
	leaf.view.file = file;
	w.h.app.workspace._trigger("active-leaf-change", leaf);
	await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 1);
}

async function pinAndLookAway(w: World): Promise<void> {
	click(w.view, ".sf-pin-btn");
	await activate(w, w.scene);
}

/** A change made outside Story Forge, followed by the cache update Obsidian would send. */
function outsideChange(w: World, path: string, patch: Record<string, unknown>): void {
	w.h.outsideEdit(path, patch);
	w.h.app.metadataCache._trigger("changed", w.h.app.vault.getFileByPath(path));
}

describe("a pinned Workbench (ADR-51)", () => {
	it("refreshes when its subject changes, and ignores changes to other files", async () => {
		vi.useFakeTimers();
		const w = await open();
		await pinAndLookAway(w);
		const before = input(w.view, "origin");

		outsideChange(w, SCENE_4, { title: "Scene 4b" });
		expect(input(w.view, "origin")).toBe(before);

		outsideChange(w, MARA, { origin: "Highlands" });
		await settle();
		expect(input(w.view, "origin").value).toBe("Highlands");
	});
});

describe("the Workbench probe (ADR-39)", () => {
	it("refuses an undo of the subject while a field holds a draft, and lets it through once saved", async () => {
		const w = await open();
		await save(w.view, "nickname", "Flint");
		type(w.view, "origin", "Coast");

		const refused = await w.h.journal.undo();
		expect(refused).toMatchObject({ kind: "refused", path: MARA, reason: "draft" });
		expect(w.h.notices).toHaveLength(1); // its wording is aligned to the sign-off in T5.1
		expect(w.h.fm(MARA).nickname).toBe("Flint");
		expect(input(w.view, "origin").value).toBe("Coast");

		type(w.view, "origin", "Harbour");
		await w.h.journal.undo();
		expect(w.h.fm(MARA).nickname).toBe("Stone");
	});

	it("is registered while the view is open and released when it closes", async () => {
		const h = vault();
		const releases: string[] = [];
		const real = h.journal.registerProbe.bind(h.journal);
		const register = vi.spyOn(h.journal, "registerProbe").mockImplementation((probe) => {
			const off = real(probe);
			return () => { releases.push("probe"); off(); };
		});
		const leaf = new WorkspaceLeaf();
		leaf.app = h.app;
		const view = new SidebarView(leaf, undefined, undefined, undefined, undefined, undefined, undefined, undefined, h.journal);
		await view.onOpen();
		expect(register).toHaveBeenCalledTimes(1);
		await view.onClose();
		expect(releases).toEqual(["probe"]);
	});

	it("blocks nothing once the view is closed, and leaves no owed redraw behind", async () => {
		const w = await open();
		await save(w.view, "nickname", "Flint");
		type(w.view, "origin", "Coast");
		await w.view.onClose();
		opened.splice(0);

		expect(await w.h.journal.undo()).toMatchObject({ kind: "applied" });
		expect(w.h.fm(MARA).nickname).toBe("Stone");
	});
});

describe("the owed redraw (ADR-42)", () => {
	it("runs once the last protected field clears", async () => {
		const w = await open();
		type(w.view, "nickname", "Flint");
		outsideChange(w, MARA, { faction: "Wardens" });
		expect(w.view.contentEl.querySelector('[data-sf-inspector-input="faction"]')).toBeNull();

		type(w.view, "nickname", "Stone");
		expect(input(w.view, "faction").value).toBe("Wardens");
	});

	it("keeps focus and the caret in the field being typed into (U10)", async () => {
		const w = await open();
		const typedInto = input(w.view, "nickname");
		typedInto.focus();
		type(w.view, "nickname", "Flint");
		outsideChange(w, MARA, { faction: "Wardens" });

		typedInto.value = "Stone";
		typedInto.setSelectionRange(3, 3);
		typedInto.dispatchEvent(new Event("input", { bubbles: true }));

		const now = input(w.view, "nickname");
		expect(input(w.view, "faction").value).toBe("Wardens"); // the redraw ran
		expect(now).not.toBe(typedInto);
		expect(activeDocument.activeElement).toBe(now);
		expect([now.selectionStart, now.selectionEnd]).toEqual([3, 3]);
	});

	it("runs after a save that clears the guard, without focusing a field", async () => {
		const w = await open();
		type(w.view, "nickname", "Flint");
		outsideChange(w, MARA, { faction: "Wardens" });

		click(w.view, '[data-sf-inspector-commit="nickname"]');
		await settle();

		expect(input(w.view, "faction").value).toBe("Wardens");
		expect(input(w.view, "nickname").value).toBe("Flint");
		expect(w.h.fm(MARA).nickname).toBe("Flint");
		expect(activeDocument.activeElement?.hasAttribute("data-sf-inspector-input")).toBe(false);
	});

});

/** One macrotask: a redraw held for a composition runs one tick after it ends. */
const tick = (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, 0); });

const hasFaction = (view: SidebarView): boolean =>
	view.contentEl.querySelector('[data-sf-inspector-input="faction"]') !== null;

function compose(el: HTMLElement, phase: "compositionstart" | "compositionend"): void {
	el.dispatchEvent(new CompositionEvent(phase, { bubbles: true }));
}

/** An IME composition in `nickname` during which the owed redraw comes due and is held. */
function composeWithHeldRedraw(w: World): HTMLInputElement {
	const typedInto = input(w.view, "nickname");
	typedInto.focus();
	compose(typedInto, "compositionstart");
	type(w.view, "nickname", "Flint");
	outsideChange(w, MARA, { faction: "Wardens" });
	type(w.view, "nickname", "Stone"); // the guard clears mid-composition
	return typedInto;
}

const cacheReads = (w: World): number => vi.mocked(w.h.app.metadataCache.getFileCache).mock.calls.length;

describe("the redraw during an IME composition", () => {
	it("waits for the composition to end, then runs one tick later and keeps focus", async () => {
		const w = await open();
		const typedInto = composeWithHeldRedraw(w);
		expect(input(w.view, "nickname")).toBe(typedInto);
		expect(hasFaction(w.view)).toBe(false);

		compose(typedInto, "compositionend");
		await tick();
		expect(input(w.view, "faction").value).toBe("Wardens");
		expect(activeDocument.activeElement).toBe(input(w.view, "nickname"));
	});

	it("lets a last composition input after compositionend reach the editor first (Firefox, Safari)", async () => {
		const w = await open();
		const typedInto = composeWithHeldRedraw(w);

		compose(typedInto, "compositionend");
		expect(input(w.view, "nickname")).toBe(typedInto);
		type(w.view, "nickname", "Stones");
		await tick();

		expect(hasFaction(w.view)).toBe(true);
		expect(input(w.view, "nickname").value).toBe("Stones");
	});

	it("treats focus leaving the field as the end of the composition", async () => {
		const w = await open();
		const typedInto = composeWithHeldRedraw(w);

		typedInto.blur();
		await tick();
		expect(hasFaction(w.view)).toBe(true);
	});

	it("does not freeze when the composing field is destroyed by leaving edit mode", async () => {
		const w = await open();
		compose(input(w.view, "nickname"), "compositionstart");
		click(w.view, ".sf-edit-btn");
		await settle();
		click(w.view, ".sf-edit-btn");
		await settle();

		outsideChange(w, MARA, { faction: "Wardens" });
		expect(hasFaction(w.view)).toBe(true);
	});

	it("does not freeze when the composing field is destroyed by a tab switch", async () => {
		const w = await open();
		compose(input(w.view, "nickname"), "compositionstart");
		click(w.view, `.sf-tab[data-view-id="${NAVIGATOR_TAB_ID}"]`);
		await settle();
		click(w.view, '.sf-tab[data-view-id="__context__"]');
		await settle();

		outsideChange(w, MARA, { faction: "Wardens" });
		expect(hasFaction(w.view)).toBe(true);
	});

	it("does nothing at compositionend when no redraw is held", async () => {
		const w = await open();
		const typedInto = input(w.view, "nickname");
		compose(typedInto, "compositionstart");
		const reads = cacheReads(w);
		compose(typedInto, "compositionend");
		await tick();
		expect(input(w.view, "nickname")).toBe(typedInto);
		expect(cacheReads(w)).toBe(reads);
	});

	it("runs no held redraw for a view that closed before the tick", async () => {
		const w = await open();
		const typedInto = composeWithHeldRedraw(w);
		compose(typedInto, "compositionend");
		await w.view.onClose();
		await w.view.onOpen(); // even a reopened view gets no redraw held from before the close
		await settle();
		const reads = cacheReads(w);
		await tick();
		expect(cacheReads(w)).toBe(reads);
	});

	it("forgets a composition when the view closes, so a reopened view redraws", async () => {
		const w = await open();
		composeWithHeldRedraw(w);
		await w.view.onClose();
		const reads = cacheReads(w);
		await tick();
		expect(cacheReads(w)).toBe(reads); // nothing ran for the closed view

		await w.view.onOpen(); // edit mode is kept across a close
		await settle();
		outsideChange(w, MARA, { origin: "Highlands" });
		expect(input(w.view, "origin").value).toBe("Highlands");
	});
});

describe("a refresh of the subject (U10: focus is never moved by a refresh)", () => {
	it("keeps the caret in a clean field when an outside change redraws the editor", async () => {
		const w = await open();
		const focused = input(w.view, "origin");
		focused.focus();
		focused.setSelectionRange(2, 4);

		outsideChange(w, MARA, { faction: "Wardens" });

		const now = input(w.view, "origin");
		expect(input(w.view, "faction").value).toBe("Wardens");
		expect(now).not.toBe(focused);
		expect(activeDocument.activeElement).toBe(now);
		expect([now.selectionStart, now.selectionEnd]).toEqual([2, 4]);
	});
});

describe("the context the Workbench keeps while a field is protected (T4.2 carry-over)", () => {
	it("after a discard, the fields show the file's current values", async () => {
		const w = await open();
		type(w.view, "nickname", "Flint");
		outsideChange(w, MARA, { nickname: "Pebble", origin: "Highlands" });

		click(w.view, ".sf-edit-btn"); // leave edit mode: the draft is discarded
		await settle();
		click(w.view, ".sf-edit-btn");
		await settle();

		expect(input(w.view, "nickname").value).toBe("Pebble");
		expect(input(w.view, "origin").value).toBe("Highlands");
	});

	it("after a tab switch, a clean field still shows the outside value", async () => {
		const w = await open();
		type(w.view, "nickname", "Flint");
		outsideChange(w, MARA, { origin: "Highlands" });
		expect(input(w.view, "origin").value).toBe("Highlands");

		click(w.view, `.sf-tab[data-view-id="${NAVIGATOR_TAB_ID}"]`);
		await settle();
		click(w.view, '.sf-tab[data-view-id="__context__"]');
		await settle();

		expect(input(w.view, "origin").value).toBe("Highlands");
		expect(input(w.view, "nickname").value).toBe("Flint");
	});
});

describe("an undo of the subject's field (AC-F9.2)", () => {
	it("shows the restored value for a followed subject", async () => {
		const w = await open();
		await save(w.view, "nickname", "Flint");
		expect(input(w.view, "nickname").value).toBe("Flint");

		await w.h.journal.undo();
		await settle();
		expect(w.h.fm(MARA).nickname).toBe("Stone");
		expect(input(w.view, "nickname").value).toBe("Stone");
	});

	it("shows the restored value for a pinned subject", async () => {
		vi.useFakeTimers();
		const w = await open();
		await save(w.view, "nickname", "Flint");
		await pinAndLookAway(w);
		expect(input(w.view, "nickname").value).toBe("Flint");

		await w.h.journal.undo();
		await settle();
		expect(w.h.fm(MARA).nickname).toBe("Stone");
		expect(input(w.view, "nickname").value).toBe("Stone");
	});
});

function undoBtn(view: SidebarView, direction: "undo" | "redo"): HTMLButtonElement {
	return view.contentEl.querySelector<HTMLButtonElement>(`.sf-icons [data-sf-undo="${direction}"]`)!;
}

describe("the header controls (T5.3, ADR-50)", () => {
	it("sit at the start of .sf-icons, undo then redo, before pin and edit", async () => {
		const w = await open();
		const kids = Array.from(w.view.contentEl.querySelector(".sf-icons")!.children).map((c) => c.classList[0]);
		expect(kids).toEqual(["sf-undo-btn", "sf-undo-btn", "sf-pin-btn", "sf-edit-btn"]);
		expect(undoBtn(w.view, "undo").dataset.sfUndo).toBe("undo");
		expect(undoBtn(w.view, "redo").dataset.sfUndo).toBe("redo");
	});

	it("are disabled at open when the journal is empty", async () => {
		const w = await open();
		expect(undoBtn(w.view, "undo").getAttribute("aria-disabled")).toBe("true");
		expect(undoBtn(w.view, "undo").title).toBe("Nothing to undo");
		expect(undoBtn(w.view, "redo").title).toBe("Nothing to redo");
	});

	it("are synced at open from a journal that already holds a step", async () => {
		const h = vault();
		const mara = h.app.vault.getFileByPath(MARA)!;
		vi.mocked(h.app.workspace.getActiveFile).mockReturnValue(mara);
		const leaf = new WorkspaceLeaf();
		leaf.app = h.app;
		const gate = { evaluate: vi.fn() } as unknown as ConsentGate;
		const view = new SidebarView(leaf, new EngineRegistry([]), gate, new NativeScopingEngine(h.app),
			undefined, undefined, undefined, undefined, h.journal);
		opened.push(view);
		await h.write(MARA, "nickname", "Flint");
		await view.onOpen();
		expect(undoBtn(view, "undo").hasAttribute("aria-disabled")).toBe(false);
		expect(undoBtn(view, "undo").title).toBe("Undo: nickname in Mara Stoneway");
		expect(undoBtn(view, "redo").getAttribute("aria-disabled")).toBe("true");
	});

	it("follow the journal on every notification without being rebuilt", async () => {
		const w = await open();
		const before = undoBtn(w.view, "undo");
		await save(w.view, "nickname", "Flint");
		expect(undoBtn(w.view, "undo")).toBe(before);
		expect(before.hasAttribute("aria-disabled")).toBe(false);
		expect(before.title).toMatch(/^Undo: /);
		await w.h.journal.undo();
		await settle();
		expect(before.getAttribute("aria-disabled")).toBe("true");
		expect(undoBtn(w.view, "redo").hasAttribute("aria-disabled")).toBe(false);
	});

	it("call the same undo and redo as the journal", async () => {
		const w = await open();
		await save(w.view, "nickname", "Flint");
		undoBtn(w.view, "undo").click();
		await settleLong();
		expect(w.h.fm(MARA).nickname).toBe("Stone");
		undoBtn(w.view, "redo").click();
		await settleLong();
		expect(w.h.fm(MARA).nickname).toBe("Flint");
	});

	it("do nothing, and show no notice, when clicked while disabled", async () => {
		const w = await open();
		const undo = vi.spyOn(w.h.journal, "undo");
		const redo = vi.spyOn(w.h.journal, "redo");
		undoBtn(w.view, "undo").click();
		undoBtn(w.view, "redo").click();
		await settle();
		expect(undo).not.toHaveBeenCalled();
		expect(redo).not.toHaveBeenCalled();
		expect(w.h.notices).toEqual([]);
	});

	// jsdom's click() never moves focus, as a mouse press would; this guards only that an
	// activation leaves focus in the field (the redraw restores it, U10), not on the control.
	it("leave the focus in the field where it was when activated", async () => {
		const w = await open();
		await save(w.view, "nickname", "Flint");
		const field = input(w.view, "origin");
		field.focus();
		undoBtn(w.view, "undo").click();
		await settleLong();
		expect(w.h.fm(MARA).nickname).toBe("Stone"); // the undo really ran
		expect(document.activeElement?.getAttribute("data-sf-inspector-input")).toBe("origin");
	});

	it.each(["undo", "redo"] as const)("%s: a rejection shows the unexpected-error notice and warns (P1)", async (direction) => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const w = await open();
		await save(w.view, "nickname", "Flint");
		await save(w.view, "origin", "Coast");
		await w.h.journal.undo();
		await settle(); // both stacks hold a step: both buttons are enabled
		Notice._reset();
		const boom = new Error("boom");
		vi.spyOn(w.h.journal, direction).mockRejectedValueOnce(boom);
		undoBtn(w.view, direction).click();
		await settleLong();
		expect(Notice._instances.map((n) => n.message)).toEqual([unexpectedErrorNotice(direction)]);
		expect(warn).toHaveBeenCalledWith(expect.stringContaining("[StoryForge]"), boom);
	});

	it("stop following the journal once the view is closed", async () => {
		const w = await open();
		await save(w.view, "nickname", "Flint");
		await w.view.onClose();
		const peek = vi.spyOn(w.h.journal, "peek");
		await w.h.journal.undo();
		await settle();
		expect(peek).not.toHaveBeenCalled();
	});
});

describe("the key policy (ADR-37)", () => {
	it("delegates to the controller: a saved field journals, a field with unsaved text keeps the browser's undo", async () => {
		const w = await open();
		expect(w.view.undoKeyPolicy(input(w.view, "nickname"))).toBe("journal");
		type(w.view, "nickname", "Fl");
		expect(w.view.undoKeyPolicy(input(w.view, "nickname"))).toBe("text");
		expect(w.view.undoKeyPolicy(null)).toBe("journal");
	});
});

describe("a Workbench without a journal", () => {
	it("has no undo buttons", async () => {
		const h = vault();
		const leaf = new WorkspaceLeaf();
		leaf.app = h.app;
		const gate = { evaluate: vi.fn() } as unknown as ConsentGate;
		const view = new SidebarView(leaf, new EngineRegistry([]), gate, new NativeScopingEngine(h.app));
		opened.push(view);
		await view.onOpen();
		expect(view.contentEl.querySelector("[data-sf-undo]")).toBeNull();
	});
});
