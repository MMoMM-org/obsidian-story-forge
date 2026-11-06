/**
 * The Workbench and the undo journal (spec 009 T4.3): a real `SidebarView` over the
 * journal harness, so writes go through the real writer and recorder, and undo goes
 * through the real restore. The mock's `processFrontMatter` fires `metadataCache`
 * 'changed' as Obsidian does, and `getFileCache` reads the stored frontmatter.
 *
 * @ref docs/XDD/specs/009-undo-journal/solution.md — ADR-39 (probe), ADR-42 (owed redraw), ADR-51 (pinned refresh)
 * @ref docs/XDD/specs/009-undo-journal/plan/phase-4.md — T4.3
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { Notice, WorkspaceLeaf, createMockCachedMetadata, type TFile } from "obsidian";
import type { ConsentGate } from "consent/ConsentGate";
import { NativeScopingEngine } from "engines/NativeScopingEngine";
import { EngineRegistry } from "engines/QueryEngine";
import { DEBOUNCE_MS, NAVIGATOR_TAB_ID, SIDEBAR_VIEW_TYPE } from "pluginConstants";
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
	await view.onOpen();
	click(view, ".sf-edit-btn");
	await settle();
	return { h, view, mara, scene };
}

const opened: SidebarView[] = [];

afterEach(async () => {
	for (const view of opened.splice(0)) await view.onClose();
	vi.useRealTimers();
	Notice._reset();
	teardownAndCheckUntouched();
});

async function settle(): Promise<void> {
	for (let i = 0; i < 5; i++) await Promise.resolve();
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
		const inspector = (w.view as unknown as { _inspector: { onGuardCleared?: () => void } })._inspector;
		await w.view.onClose();
		opened.splice(0);
		expect(inspector.onGuardCleared).toBeUndefined();

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
