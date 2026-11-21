/**
 * AnvilView.undo.test.ts — the Anvil's part in undo (spec 009 T3.4).
 *
 * The REAL journal, writer and recorder run (journalHarness); the Anvil is a real view on
 * the harness's mock vault. It covers:
 *   - the Kanban writes (the dragged card through `onWrite`, its siblings through `renumber`)
 *     joining the drag's group, so a gesture is one step;
 *   - the probe: `draft` while the editor pane holds unsaved text for the note, `write` while a
 *     pane write for it is in flight, and the Kanban handler's `isBusy`;
 *   - the handler's `flushPending` as a flusher, so undo never waits out the debounce;
 *   - everything unregistered on close, after the close has finished the pending writes;
 *   - a flush landing after close does no DOM work and throws nothing;
 *   - (T5.2) the ↶ ↷ controls at the right of the tab strip: activation, live state from
 *     `subscribe`, the live region from `onOutcome`, the key policy, focus, the P1 notice.
 *
 * @ref docs/XDD/specs/009-undo-journal/solution.md — ADR-38, ADR-39, ADR-43, ADR-50, ADR-52, Traced walkthrough 1
 * @ref docs/XDD/specs/009-undo-journal/mockups.html — U1, U2, U3, U9 (P1)
 */

import { implOf } from "../mockImpl";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
	Notice,
	WorkspaceLeaf,
	createMockCachedMetadata,
	createMockFrontmatterLink,
	type App,
	type TFile,
} from "../__mocks__/obsidian";
import { AnvilView } from "anvil/AnvilView";
import { ANVIL_TABS } from "anvil/anvilTabs";
import { InteractionHandler } from "workspace/interactionHandler";
import type { PendingProbe, UndoDirection, UndoOutcome } from "undo/journalTypes";
import { unexpectedErrorNotice } from "undo/stepLabel";
import type { OwnedUndoJournal } from "undo/undoJournal";
import { MARA, setup, teardownAndCheckUntouched, type Harness } from "../undo/journalHarness";

// ---------------------------------------------------------------------------
// jsdom shims (as in the Kanban suites)
// ---------------------------------------------------------------------------

if (typeof globalThis.PointerEvent === "undefined") {
	(globalThis as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = class PointerEvent extends MouseEvent {};
}
let dropTarget: Element | null = null;
Object.defineProperty(document, "elementFromPoint", {
	value: (): Element | null => dropTarget,
	writable: true,
	configurable: true,
});

// ---------------------------------------------------------------------------
// Fixture: a book, its scenes on a Kanban board, and Mara (no scene)
// ---------------------------------------------------------------------------

const BOOK = "20 Planning/Book.md";
const scenePath = (n: number): string => `30 Scenes/Scene ${n}.md`;
const S2 = scenePath(2);
const S5 = scenePath(5);
const S7 = scenePath(7);
const S9 = scenePath(9);

const scene = (n: number, status: string, order: number): Record<string, unknown> =>
	({ type: "scene", title: `Scene ${n}`, act: 1, status, order });

/** Walkthrough 1: revised holds Scene 2 (10), Scene 5 (11), Scene 9 (20); Scene 7 is draft, order 30. */
const WALKTHROUGH_1 = {
	[BOOK]: {},
	[S2]: scene(2, "revised", 10),
	[S5]: scene(5, "revised", 11),
	[S9]: scene(9, "revised", 20),
	[S7]: scene(7, "draft", 30),
	[MARA]: { status: "alive" },
};

/** Point the metadata cache at the writer's own store, so a write reads back as in Obsidian. */
function wireMetadata(app: App, paths: readonly string[]): TFile[] {
	const files = paths.map((p) => app.vault.getFileByPath(p)!);
	const book = files.find((f) => f.path === BOOK)!;
	vi.mocked(app.metadataCache.getFileCache).mockImplementation((f: TFile) => {
		const frontmatter = app.fileManager._getFrontmatter(f.path);
		if (f.path === BOOK) return createMockCachedMetadata({ tags: [{ tag: "#planning/book" }], frontmatter });
		if (!f.path.startsWith("30 Scenes/")) return createMockCachedMetadata({ frontmatter });
		return createMockCachedMetadata({
			tags: [{ tag: "#manuscript/scene" }],
			frontmatter,
			frontmatterLinks: [createMockFrontmatterLink("book", "Book")],
		});
	});
	vi.mocked(app.metadataCache.getFirstLinkpathDest).mockImplementation((l: string) => (l === "Book" ? book : null));
	vi.mocked(app.vault.getMarkdownFiles).mockReturnValue(files);
	app.metadataCache.resolvedLinks = Object.fromEntries(
		paths.filter((p) => p.startsWith("30 Scenes/")).map((p) => [p, { [BOOK]: 1 }]),
	);
	app.workspace.getActiveFile = vi.fn(() => book);
	return files;
}

interface Anvil {
	readonly h: Harness;
	readonly view: AnvilView;
	file(path: string): TFile;
	card(path: string): HTMLElement;
}

const opened: AnvilView[] = [];

async function openAnvil(
	notes: Record<string, Record<string, unknown>> = WALKTHROUGH_1,
	journal?: (h: Harness) => OwnedUndoJournal,
	prime?: (h: Harness) => Promise<void>,
): Promise<Anvil> {
	const h = setup(notes);
	wireMetadata(h.app, Object.keys(notes));
	await prime?.(h);
	const leaf = new WorkspaceLeaf();
	(leaf as unknown as { app: App }).app = h.app;
	const view: AnvilView = new AnvilView(leaf, {
		drill: (f) => { view.inspect(f); },
		editor: { getDock: () => "bottom" },
		undo: journal ? journal(h) : h.journal,
	});
	opened.push(view);
	await view.onOpen();
	document.body.appendChild(view.contentEl);
	view.setLayout("kanban");
	return {
		h,
		view,
		file: (path) => h.app.vault.getFileByPath(path)!,
		card: (path) => {
			const el = [...view.contentEl.querySelectorAll<HTMLElement>(".sf-kb-card")].find((c) => c.getAttribute("data-sf-card-path") === path);
			if (!el) throw new Error(`no card for ${path}`);
			return el;
		},
	};
}

function drag(card: HTMLElement, onto: Element): void {
	const ev = (type: string, x: number): PointerEvent =>
		new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: 100, button: 0, buttons: 1, pointerId: 1 });
	card.dispatchEvent(ev("pointerdown", 100));
	window.dispatchEvent(ev("pointermove", 110));
	dropTarget = onto;
	window.dispatchEvent(ev("pointerup", 110));
}

const keyRight = (card: HTMLElement): void => {
	card.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" }));
};

/** Type into a pane field without committing (no `change`), so it holds a draft. */
function draftInto(view: AnvilView, key: string, value: string): HTMLInputElement {
	const el = view.contentEl.querySelector<HTMLInputElement>(`[data-sf-ed-field="${key}"] input`);
	if (!el) throw new Error(`no pane input for ${key}`);
	el.focus();
	el.value = value;
	el.dispatchEvent(new Event("input", { bubbles: true }));
	return el;
}

/** Type and commit (`change`): the pane's write starts. */
function commitInto(view: AnvilView, key: string, value: string): void {
	const el = draftInto(view, key, value);
	el.dispatchEvent(new Event("change", { bubbles: true }));
}

/** Hold the next `processFrontMatter` for `path` until `release()`; other files pass through. */
function holdNextWrite(app: App, path: string, fail = false): { release: () => void } {
	const fm = vi.mocked(app.fileManager.processFrontMatter);
	const real = implOf(fm)!;
	let release: () => void = () => {};
	fm.mockImplementation((file: TFile, fn: (fm: Record<string, unknown>) => void, options?: unknown) => {
		if (file.path !== path) return real(file, fn, options);
		fm.mockImplementation(real);
		return new Promise<void>((resolve, reject) => {
			release = () => (fail ? reject(new Error("disk full")) : resolve(real(file, fn, options)));
		});
	});
	return { release: () => release() };
}

const stepPaths = (o: UndoOutcome): string[] => (o.kind === "applied" ? o.step.files.map((f) => f.path) : []);

beforeEach(() => {
	vi.useFakeTimers();
	dropTarget = null;
	Notice._reset();
});

afterEach(async () => {
	for (const view of opened.splice(0)) {
		view.contentEl.remove();
		await view.onClose();
	}
	vi.useRealTimers();
	teardownAndCheckUntouched();
});

// ---------------------------------------------------------------------------
// Gestures are one step (ADR-38)
// ---------------------------------------------------------------------------

describe("Traced walkthrough 1 — a RENUMBER drag, then undo inside the debounce window", () => {
	it("gives one step of 4 changes in 3 notes without Scene 2, and restores every note", async () => {
		const a = await openAnvil();
		drag(a.card(S7), a.card(S5)); // between Scene 2 (10) and Scene 5 (11): no integer between
		await vi.advanceTimersByTimeAsync(150);
		expect(a.h.fm(S5).order).toBe(30);
		expect(a.h.fm(S9).order).toBe(40);
		expect(a.h.fm(S7).status).toBe("draft"); // the dragged card is still in the debounce window
		expect(a.h.journal.peek().undo).toBeNull(); // the group is still open

		let outcome: UndoOutcome | null = null;
		void a.h.journal.undo().then((o) => (outcome = o));
		// The flusher runs the debounced write now: undo does not wait out the 200 ms.
		await vi.advanceTimersByTimeAsync(1);
		expect(outcome).not.toBeNull();
		const o = outcome!;
		expect(o.kind).toBe("applied");
		expect(new Set(stepPaths(o))).toEqual(new Set([S5, S9, S7]));
		expect(stepPaths(o)).not.toContain(S2);
		// Provisional wording; T5.1 updates it.
		expect(a.h.notices).toEqual(["Undo: 4 changes in 3 notes"]);
		expect(a.h.journal.peek()).toEqual({ undo: null, redo: { label: "4 changes in 3 notes", fieldCount: 4, noteCount: 3 } });
		expect([a.h.fm(S2).order, a.h.fm(S5).order, a.h.fm(S9).order]).toEqual([10, 11, 20]);
		expect([a.h.fm(S7).status, a.h.fm(S7).order]).toEqual(["draft", 30]);
	});

	it("a RENUMBER within one column (only the order changes: the single-entry commit) is one step", async () => {
		const a = await openAnvil({ ...WALKTHROUGH_1, [S9]: scene(9, "revised", 25) });
		drag(a.card(S9), a.card(S5)); // Scene 2, Scene 9, Scene 5 → 10, 20, 30
		await vi.advanceTimersByTimeAsync(300);
		expect(a.h.journal.peek().undo?.label).toBe("2 changes in 2 notes");
		const o = await a.h.journal.undo();
		expect(new Set(stepPaths(o))).toEqual(new Set([S5, S9]));
		expect([a.h.fm(S5).order, a.h.fm(S9).order]).toEqual([11, 25]);
	});
});

// ---------------------------------------------------------------------------
// The probe (ADR-39)
// ---------------------------------------------------------------------------

describe("the Anvil's probe", () => {
	/** Mara's status changed once; the pane then opens on `paneOn`. */
	async function primed(paneOn: string): Promise<Anvil> {
		const a = await openAnvil();
		await a.h.write(MARA, "status", "dead");
		await vi.runAllTimersAsync();
		a.view.inspect(a.file(paneOn));
		a.h.notices.length = 0;
		return a;
	}

	it("refuses with draft while the pane holds unsaved text for the step's note, and leaves the draft", async () => {
		const a = await primed(MARA);
		const box = draftInto(a.view, "status", "wounded");
		const o = await a.h.journal.undo();
		expect(o).toEqual({ kind: "refused", direction: "undo", path: MARA, reason: "draft" });
		expect(a.h.fm(MARA).status).toBe("dead");
		expect(box.isConnected).toBe(true);
		expect(box.value).toBe("wounded");
	});

	it("does not refuse when the pane shows the note but holds no unsaved text", async () => {
		const a = await primed(MARA);
		const o = await a.h.journal.undo();
		expect(o.kind).toBe("applied");
		expect(a.h.fm(MARA).status).toBe("alive");
	});

	it("does not refuse for a draft in another note", async () => {
		const a = await primed(S2);
		draftInto(a.view, "title", "Scene Two");
		const o = await a.h.journal.undo();
		expect(o.kind).toBe("applied");
		expect(a.h.fm(MARA).status).toBe("alive");
	});

	it("refuses with write while a pane write for the step's note is in flight, and applies once it landed", async () => {
		const a = await primed(MARA);
		const held = holdNextWrite(a.h.app, MARA);
		commitInto(a.view, "status", "wounded");
		const o = await a.h.journal.undo();
		expect(o).toEqual({ kind: "refused", direction: "undo", path: MARA, reason: "write" });
		expect(a.h.fm(MARA).status).toBe("dead");
		held.release();
		await vi.runAllTimersAsync();
		// Landed: the pane still shows Mara, but nothing is in flight, so the next undo applies.
		expect(a.h.fm(MARA).status).toBe("wounded");
		const next = await a.h.journal.undo();
		expect(next.kind).toBe("applied");
		expect(a.h.fm(MARA).status).toBe("dead");
	});

	it("does not refuse once the control holding the draft is gone", async () => {
		const a = await primed(MARA);
		draftInto(a.view, "status", "wounded").remove();
		const o = await a.h.journal.undo();
		expect(o.kind).toBe("applied");
		expect(a.h.fm(MARA).status).toBe("alive");
	});

	it("does not refuse for a pane write in flight to another note", async () => {
		const a = await primed(S2);
		const held = holdNextWrite(a.h.app, S2);
		commitInto(a.view, "title", "Scene Two");
		const o = await a.h.journal.undo();
		expect(o.kind).toBe("applied");
		expect(a.h.fm(MARA).status).toBe("alive");
		held.release();
		await vi.runAllTimersAsync();
	});
});

// ---------------------------------------------------------------------------
// Registration and its release on close
// ---------------------------------------------------------------------------

interface Registry {
	readonly probes: PendingProbe[];
	readonly unregistered: string[];
}

/** Wrap the real journal so its registrations, and their release, are observable. */
function observed(registry: Registry): (h: Harness) => OwnedUndoJournal {
	return (h) => {
		const j = h.journal;
		const realProbe = j.registerProbe.bind(j);
		const realFlusher = j.registerFlusher.bind(j);
		vi.spyOn(j, "registerProbe").mockImplementation((p) => {
			registry.probes.push(p);
			const off = realProbe(p);
			return () => { registry.unregistered.push("probe"); off(); };
		});
		vi.spyOn(j, "registerFlusher").mockImplementation((f) => {
			const off = realFlusher(f);
			return () => { registry.unregistered.push("flusher"); off(); };
		});
		return j;
	};
}

describe("registration", () => {
	it("a probe reports write for a card whose Kanban move is still pending", async () => {
		const reg: Registry = { probes: [], unregistered: [] };
		const a = await openAnvil(WALKTHROUGH_1, observed(reg));
		keyRight(a.card(S7)); // draft → revised, debounced
		expect(reg.probes.map((p) => p(S7))).toContain("write");
		expect(reg.probes.map((p) => p(S2))).not.toContain("write");
		await vi.runAllTimersAsync();
		expect(reg.probes.map((p) => p(S7))).not.toContain("write");
	});

	it("registers the handler's flushPending: undo writes a pending move now and undoes it", async () => {
		const a = await openAnvil();
		keyRight(a.card(S7));
		let outcome: UndoOutcome | null = null;
		void a.h.journal.undo().then((o) => (outcome = o));
		await vi.advanceTimersByTimeAsync(1);
		expect(outcome).not.toBeNull();
		expect(stepPaths(outcome!)).toEqual([S7]);
		expect(a.h.fm(S7).status).toBe("draft");
	});

	it("unregisters every probe and the flusher on close, and none before the pending writes landed", async () => {
		const reg: Registry = { probes: [], unregistered: [] };
		const a = await openAnvil(WALKTHROUGH_1, observed(reg));
		keyRight(a.card(S7));
		const held = holdNextWrite(a.h.app, S7);
		const closing = a.view.onClose();
		await vi.advanceTimersByTimeAsync(1);
		expect(reg.unregistered).toEqual([]); // close is still finishing the Kanban write
		held.release();
		await closing;
		opened.splice(opened.indexOf(a.view), 1);
		expect(a.h.journal.peek().undo?.label).toBe("status in Scene 7");
		expect(reg.unregistered.sort()).toEqual(["flusher", ...reg.probes.map(() => "probe")].sort());
		expect(reg.probes.length).toBeGreaterThan(0);
	});

	it("unregisters the probes and the flusher even when closing the handler throws", async () => {
		const reg: Registry = { probes: [], unregistered: [] };
		const a = await openAnvil(WALKTHROUGH_1, observed(reg));
		vi.spyOn(InteractionHandler.prototype, "destroy").mockImplementation(() => {
			throw new Error("destroy failed");
		});
		await expect(a.view.onClose()).rejects.toThrow("destroy failed");
		opened.splice(opened.indexOf(a.view), 1);
		expect(reg.unregistered.sort()).toEqual(["flusher", ...reg.probes.map(() => "probe")].sort());
		expect(reg.probes.length).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// A flush that lands after close
// ---------------------------------------------------------------------------

describe("a Kanban flush landing after close", () => {
	async function closingWithHeldMove(fail: boolean): Promise<{ a: Anvil; body: Element; board: Element; live: Element; closing: Promise<void>; release: () => void }> {
		const a = await openAnvil();
		const body = a.view.contentEl.querySelector(".sf-ws-body")!;
		const board = body.querySelector(".sf-kb-board")!;
		const live = a.view.contentEl.querySelector(".sf-ws-live")!;
		keyRight(a.card(S7)); // the keyboard path announces on success
		const held = holdNextWrite(a.h.app, S7, fail);
		const closing = a.view.onClose();
		opened.splice(opened.indexOf(a.view), 1);
		return { a, body, board, live, closing, release: held.release };
	}

	it("re-renders nothing, announces nothing and throws nothing", async () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const { a, body, board, live, closing, release } = await closingWithHeldMove(false);
		release();
		await closing;
		await vi.runAllTimersAsync();
		expect(a.h.fm(S7).status).toBe("revised");
		// The view's body still holds the board it had at close: no render ran.
		expect(body.querySelector(".sf-kb-board")).toBe(board);
		expect(live.textContent).toBe("");
		expect(error).not.toHaveBeenCalled();
	});

	it("still reports a failed write, with a Notice only", async () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const { board, closing, release } = await closingWithHeldMove(true);
		release();
		await closing;
		await vi.runAllTimersAsync();
		expect(board.querySelector(".sf-card--error")).toBeNull(); // no DOM work on the closed view
		expect(Notice._instances.map((n) => n.message)).toEqual(["Couldn't write frontmatter."]);
		expect(error).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// The controls (T5.2, ADR-50, mockups U1–U3)
// ---------------------------------------------------------------------------

beforeAll(() => {
	// Obsidian's cross-window Node.instanceOf, which the mock does not install
	// (the same stand-in as test/undo/undoKeys.test.ts).
	const proto = Node.prototype as unknown as Record<string, unknown>;
	proto["instanceOf"] = function (this: Node, type: { name: string }): boolean {
		const win = (this.ownerDocument?.defaultView ?? window) as unknown as Record<string, new () => unknown>;
		const ctor = win[type.name];
		return ctor !== undefined && this instanceof ctor;
	};
});

function control(view: AnvilView, direction: UndoDirection): HTMLElement {
	const el = view.contentEl.querySelector<HTMLElement>(`.sf-ws-head [data-sf-undo="${direction}"]`);
	if (!el) throw new Error(`no ${direction} control`);
	return el;
}

const press = (el: HTMLElement, key: string): void => {
	el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key }));
};

const liveText = (view: AnvilView): string | null => view.contentEl.querySelector(".sf-ws-live")?.textContent ?? null;

/** Mara's status changed once before the Anvil opened. */
const maraChanged = async (h: Harness): Promise<void> => {
	await h.write(MARA, "status", "dead");
	await vi.runAllTimersAsync();
};

describe("the undo controls in the header", () => {
	it.each(ANVIL_TABS)("sit last in the header, right of the tab strip and the zoom slot, on the %s tab", async (tab) => {
		const a = await openAnvil();
		a.view.setLayout(tab);
		const head = a.view.contentEl.querySelector<HTMLElement>(".sf-ws-head")!;
		const group = head.querySelector<HTMLElement>(".sf-undo-group")!;
		const strip = head.querySelector(".sf-ws-toggle")!;
		const zoom = head.querySelector(".sf-ws-zoomslot")!;
		expect([...group.children].map((c) => c.getAttribute("data-sf-undo"))).toEqual(["undo", "redo"]);
		expect(head.lastElementChild?.contains(group)).toBe(true);
		expect(group.parentElement?.lastElementChild).toBe(group);
		expect(strip.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect(zoom.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		// U3: the zoom slot and the group are one cluster, so they wrap to a new row together.
		expect(zoom.parentElement).toBe(group.parentElement);
		expect(group.parentElement).not.toBe(head);
	});

	it("show the journal's state when the Anvil opens", async () => {
		const a = await openAnvil(WALKTHROUGH_1, undefined, maraChanged);
		expect(control(a.view, "undo").title).toBe("Undo: status in Mara Stoneway");
		expect(control(a.view, "undo").hasAttribute("aria-disabled")).toBe(false);
		expect(control(a.view, "redo").getAttribute("aria-disabled")).toBe("true");
	});

	it("re-sync on every subscribe notification, without a re-render", async () => {
		const a = await openAnvil();
		const board = a.view.contentEl.querySelector(".sf-kb-board");
		expect(control(a.view, "undo").getAttribute("aria-label")).toBe("Nothing to undo");
		await a.h.write(MARA, "status", "dead");
		expect(control(a.view, "undo").getAttribute("aria-label")).toBe("Undo: status in Mara Stoneway");
		await a.h.journal.undo();
		expect(control(a.view, "undo").getAttribute("aria-disabled")).toBe("true");
		expect(control(a.view, "redo").getAttribute("aria-label")).toBe("Redo: status in Mara Stoneway");
		expect(a.view.contentEl.querySelector(".sf-kb-board")).toBe(board);
	});

	it.each([
		["a click", (el: HTMLElement): void => { el.click(); }],
		["Enter", (el: HTMLElement): void => { press(el, "Enter"); }],
		["Space", (el: HTMLElement): void => { press(el, " "); }],
	])("%s on ↶ undoes and on ↷ redoes", async (_how, activate) => {
		const a = await openAnvil(WALKTHROUGH_1, undefined, maraChanged);
		const undo = vi.spyOn(a.h.journal, "undo");
		const redo = vi.spyOn(a.h.journal, "redo");
		activate(control(a.view, "undo"));
		await vi.runAllTimersAsync();
		expect(a.h.fm(MARA).status).toBe("alive");
		activate(control(a.view, "redo"));
		await vi.runAllTimersAsync();
		expect(a.h.fm(MARA).status).toBe("dead");
		expect([undo.mock.calls.length, redo.mock.calls.length]).toEqual([1, 1]);
	});

	it("a click whose target comes from a popout window's realm still undoes", async () => {
		const a = await openAnvil(WALKTHROUGH_1, undefined, maraChanged);
		const frame = document.body.appendChild(document.createElement("iframe"));
		const win = frame.contentWindow as unknown as { Node: { prototype: Record<string, unknown> } };
		win.Node.prototype["instanceOf"] = Node.prototype["instanceOf" as keyof Node];
		const foreign = frame.contentDocument!.createElement("span");
		foreign.setAttribute("data-sf-undo", "undo");
		expect(foreign instanceof HTMLElement).toBe(false);
		const undo = vi.spyOn(a.h.journal, "undo");
		(a.view as unknown as { _onClick(t: EventTarget, m: boolean): void })._onClick(foreign, false);
		await vi.runAllTimersAsync();
		frame.remove();
		expect(undo).toHaveBeenCalledTimes(1);
		expect(a.h.fm(MARA).status).toBe("alive");
	});

	it("a disabled control calls nothing and shows nothing", async () => {
		const a = await openAnvil();
		const undo = vi.spyOn(a.h.journal, "undo");
		control(a.view, "undo").click();
		press(control(a.view, "undo"), "Enter");
		await vi.runAllTimersAsync();
		expect(undo).not.toHaveBeenCalled();
		expect(a.h.notices).toEqual([]);
	});

	it("activating a control moves no focus", async () => {
		const a = await openAnvil(WALKTHROUGH_1, undefined, maraChanged);
		const undo = control(a.view, "undo");
		undo.focus();
		press(undo, "Enter");
		await vi.runAllTimersAsync();
		expect(a.h.fm(MARA).status).toBe("alive");
		expect(document.activeElement).toBe(undo);
	});

	it("an undo leaves the focus in the pane field where it was", async () => {
		const a = await openAnvil(WALKTHROUGH_1, undefined, maraChanged);
		a.view.inspect(a.file(MARA));
		const box = a.view.contentEl.querySelector<HTMLInputElement>('[data-sf-ed-field="status"] input')!;
		box.focus();
		await a.h.journal.undo();
		await vi.runAllTimersAsync();
		// The pane may be rebuilt around the new value; the caret stays in the same field.
		const focused = document.activeElement as HTMLElement | null;
		expect(focused?.tagName).toBe("INPUT");
		expect(focused?.closest("[data-sf-ed-field]")?.getAttribute("data-sf-ed-field")).toBe("status");
		expect(a.view.contentEl.contains(focused)).toBe(true);
	});
});

describe("the live region", () => {
	it("carries each outcome's notice text", async () => {
		const a = await openAnvil(WALKTHROUGH_1, undefined, maraChanged);
		await a.h.journal.undo();
		expect(liveText(a.view)).toBe("Undo: status in Mara Stoneway");
		await a.h.journal.undo();
		expect(liveText(a.view)).toBe(a.h.notices.at(-1));
		expect(liveText(a.view)).toBe("Nothing to undo");
	});

	it("carries the refusal when the pane holds a draft", async () => {
		const a = await openAnvil(WALKTHROUGH_1, undefined, maraChanged);
		a.view.inspect(a.file(MARA));
		draftInto(a.view, "status", "wounded");
		await a.h.journal.undo();
		expect(liveText(a.view)).toBe("Save your edit first (Mara Stoneway)");
	});
});

describe("the live region repeats a repeated message (AC-F4.3)", () => {
	/**
	 * Blink updates the data of a lone text child in place when `textContent` is assigned, which
	 * a screen reader does not announce when the data is unchanged. jsdom replaces the node, so
	 * the region is made to behave like that.
	 */
	function updateLoneTextNodeInPlace(region: Element): void {
		const proto = Object.getOwnPropertyDescriptor(Node.prototype, "textContent")!;
		Object.defineProperty(region, "textContent", {
			configurable: true,
			get: () => proto.get!.call(region) as string | null,
			set: (value: string) => {
				const only = region.childNodes.length === 1 ? region.firstChild : null;
				if (only instanceof Text && value !== "") only.data = value;
				else proto.set!.call(region, value);
			},
		});
	}

	/** Text nodes added since the last take: what a screen reader announces. A changed `data` says nothing. */
	function watchAnnouncements(view: AnvilView): { takeAdded: () => string[]; stop: () => void } {
		const region = view.contentEl.querySelector(".sf-ws-live")!;
		let added: string[] = [];
		const observer = new MutationObserver((records) => {
			added.push(...records.flatMap((r) => [...r.addedNodes].map((n) => n.textContent ?? "")));
		});
		observer.observe(region, { childList: true, characterData: true, subtree: true });
		const takeAdded = (): string[] => {
			added.push(...observer.takeRecords().flatMap((r) => [...r.addedNodes].map((n) => n.textContent ?? "")));
			const out = added;
			added = [];
			return out;
		};
		return { takeAdded, stop: () => { observer.disconnect(); } };
	}

	it("adds the text to the region anew for each outcome, even when it equals the last", async () => {
		const a = await openAnvil();
		updateLoneTextNodeInPlace(a.view.contentEl.querySelector(".sf-ws-live")!);
		const watch = watchAnnouncements(a.view);
		await a.h.journal.undo();
		expect(watch.takeAdded()).toContain("Nothing to undo");
		await a.h.journal.undo();
		expect(watch.takeAdded()).toContain("Nothing to undo");
		expect(liveText(a.view)).toBe("Nothing to undo");
		watch.stop();
	});

	it("does the same for a repeated refusal", async () => {
		const a = await openAnvil(WALKTHROUGH_1, undefined, maraChanged);
		a.view.inspect(a.file(MARA));
		draftInto(a.view, "status", "wounded");
		updateLoneTextNodeInPlace(a.view.contentEl.querySelector(".sf-ws-live")!);
		const watch = watchAnnouncements(a.view);
		await a.h.journal.undo();
		await a.h.journal.undo();
		const added = watch.takeAdded();
		expect(added.filter((t) => t === "Save your edit first (Mara Stoneway)")).toHaveLength(2);
		watch.stop();
	});
});

describe("undoKeyPolicy", () => {
	async function paneOnMara(): Promise<Anvil> {
		const a = await openAnvil();
		a.view.inspect(a.file(MARA));
		return a;
	}

	it("is text for a pane field holding unsaved text", async () => {
		const a = await paneOnMara();
		expect(a.view.undoKeyPolicy(draftInto(a.view, "status", "wounded"))).toBe("text");
	});

	it("is journal for a focused pane field whose text is saved", async () => {
		const a = await paneOnMara();
		const box = draftInto(a.view, "status", "wounded");
		box.dispatchEvent(new Event("change", { bubbles: true }));
		expect(document.activeElement).toBe(box);
		expect(a.view.undoKeyPolicy(box)).toBe("journal");
	});

	it("is journal for a card, a control and no target", async () => {
		const a = await paneOnMara();
		a.view.setLayout("kanban");
		expect(a.view.undoKeyPolicy(a.card(S7))).toBe("journal");
		expect(a.view.undoKeyPolicy(control(a.view, "undo"))).toBe("journal");
		expect(a.view.undoKeyPolicy(null)).toBe("journal");
	});

	it("is text for a text box that is not a pane field", async () => {
		const a = await paneOnMara();
		const search = a.view.contentEl.createEl("input", { attr: { type: "search" } });
		expect(a.view.undoKeyPolicy(search)).toBe("text");
	});
});

describe("a rejected undo or redo from a control (P1)", () => {
	it.each(["undo", "redo"] as const)("%s: shows the unexpected-error notice and still warns", async (direction) => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const a = await openAnvil(WALKTHROUGH_1, undefined, async (h) => {
			await maraChanged(h);
			await h.write(MARA, "status", "missing");
			await vi.runAllTimersAsync();
			await h.journal.undo();
		});
		// Both stacks hold a step, so both controls are enabled.
		expect([control(a.view, "undo"), control(a.view, "redo")].map((c) => c.hasAttribute("aria-disabled"))).toEqual([false, false]);
		Notice._reset();
		const boom = new Error("boom");
		vi.spyOn(a.h.journal, direction).mockRejectedValueOnce(boom);
		control(a.view, direction).click();
		await vi.runAllTimersAsync();
		expect(Notice._instances.map((n) => n.message)).toEqual([unexpectedErrorNotice(direction)]);
		expect(warn).toHaveBeenCalledWith(expect.stringContaining("[StoryForge]"), boom);
	});
});

describe("close releases the controls' listeners", () => {
	it("a journal notification after close changes nothing and does not throw", async () => {
		const a = await openAnvil(WALKTHROUGH_1, undefined, maraChanged);
		const undoControl = control(a.view, "undo");
		const live = a.view.contentEl.querySelector(".sf-ws-live")!;
		await a.view.onClose();
		opened.splice(opened.indexOf(a.view), 1);
		const title = undoControl.title;

		const outcome = await a.h.journal.undo(); // notifies subscribers and outcome listeners
		await vi.runAllTimersAsync();

		expect(outcome.kind).toBe("applied");
		expect(undoControl.title).toBe(title);
		expect(undoControl.hasAttribute("aria-disabled")).toBe(false);
		expect(live.textContent).toBe("");
	});

	it("releases the subscribe and onOutcome listeners on close", async () => {
		const offs: string[] = [];
		const a = await openAnvil(WALKTHROUGH_1, (h) => {
			const j = h.journal;
			const realSubscribe = j.subscribe.bind(j);
			const realOnOutcome = j.onOutcome.bind(j);
			vi.spyOn(j, "subscribe").mockImplementation((l) => {
				const off = realSubscribe(l);
				return () => { offs.push("subscribe"); off(); };
			});
			vi.spyOn(j, "onOutcome").mockImplementation((l) => {
				const off = realOnOutcome(l);
				return () => { offs.push("onOutcome"); off(); };
			});
			return j;
		});
		await a.view.onClose();
		opened.splice(opened.indexOf(a.view), 1);
		expect(offs.sort()).toEqual(["onOutcome", "subscribe"]);
	});
});
