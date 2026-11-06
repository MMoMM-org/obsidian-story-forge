/**
 * renderKanban.test.ts — T5.1 (RED → GREEN)
 *
 * Tests for renderKanban: drag→status+order, renumber batch, keyboard parity,
 * neutral column, empty-state, drill span, sibling-field untouched.
 *
 * Design clarification 1: renumber is cross-file, handled inside renderKanban
 * itself via a deps.renumber? callback injected in deps.
 *
 * jsdom: PointerEvent polyfill from interactionHandler tests reused.
 * elementFromPoint is stubbed per-test.
 *
 * @ref docs/XDD/specs/007-interactive-views/plan/phase-5.md — T5.1
 * @ref docs/XDD/specs/007-interactive-views/solution.md — AC-1/AC-2/AC-F1.*
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, TFile, createMockTFile, augmentEl } from "../__mocks__/obsidian";
import { renderKanban, type KanbanDeps } from "workspace/renderKanban";
import { InteractionHandler, type InteractionHandlerOpts } from "workspace/interactionHandler";
import type { SceneRow, Group } from "workspace/workspaceModel";
import type { CommitEntry, CommitResult } from "inspector/frontmatterWriter";
import { kanbanModel } from "workspace/workspaceModel";
import type { JournalGroup } from "undo/journalTypes";

// ---------------------------------------------------------------------------
// jsdom shims
// ---------------------------------------------------------------------------

if (typeof globalThis.PointerEvent === "undefined") {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(globalThis as any).PointerEvent = class PointerEvent extends MouseEvent {
		pointerId: number;
		isPrimary: boolean;
		constructor(type: string, init?: MouseEventInit & { pointerId?: number; isPrimary?: boolean }) {
			super(type, init);
			this.pointerId = init?.pointerId ?? 1;
			this.isPrimary = init?.isPrimary ?? true;
		}
	};
}

let _efpResult: Element | null = null;
function stubElementFromPoint(result: Element | null): void {
	_efpResult = result;
}

Object.defineProperty(document, "elementFromPoint", {
	value: (_x: number, _y: number): Element | null => _efpResult,
	writable: true,
	configurable: true,
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const STATUS_VOCAB = ["idea", "outline", "draft", "revised", "done", "final"];

const STATUS_FIELD = { name: "status", type: "select" as const, values: STATUS_VOCAB };
const ORDER_FIELD  = { name: "order",  type: "number" as const };

function makeSceneRow(
	o: Partial<SceneRow> & { title: string; status: string },
): SceneRow {
	const file = createMockTFile({ path: `scenes/${o.title}.md`, basename: o.title });
	return {
		file,
		title: o.title,
		act: null,
		order: o.order ?? null,
		storyDay: o.storyDay ?? null,
		when: o.when ?? "",
		status: o.status,
		pov: o.pov ?? null,
		location: o.location ?? null,
		characters: o.characters ?? [],
		plotline: o.plotline ?? null,
		plotlines: o.plotlines ?? [],
		beat: "",
		beatName: "",
		beatPath: "",
		wordcount: o.wordcount ?? null,
	};
}

function makeHost(): HTMLElement {
	const host = augmentEl(document.createElement("div"));
	document.body.appendChild(host);
	return host;
}

function makeApp(): App {
	return new App();
}

function makeHandler(
	app: App,
	host: HTMLElement,
	onWrite: (file: TFile, entries: CommitEntry[]) => Promise<CommitResult>,
	onAfter: () => void,
): InteractionHandler {
	const opts: InteractionHandlerOpts = {
		onWrite,
		onAfter,
		debounceMs: 0,
		dragThreshold: 5,
	};
	return new InteractionHandler(app, host, opts);
}

// Pointer helpers
function pointerDown(target: Element, x = 100, y = 100): void {
	target.dispatchEvent(new PointerEvent("pointerdown", {
		bubbles: true, cancelable: true, clientX: x, clientY: y,
		button: 0, buttons: 1, pointerId: 1, isPrimary: true,
	}));
}
function pointerMove(x: number, y: number): void {
	window.dispatchEvent(new PointerEvent("pointermove", {
		bubbles: true, cancelable: true, clientX: x, clientY: y,
		button: 0, buttons: 1, pointerId: 1, isPrimary: true,
	}));
}
function pointerUp(x = 120, y = 120): void {
	window.dispatchEvent(new PointerEvent("pointerup", {
		bubbles: true, cancelable: true, clientX: x, clientY: y,
		button: 0, buttons: 0, pointerId: 1, isPrimary: true,
	}));
}

function armedDrag(card: HTMLElement, dropTarget: Element): void {
	pointerDown(card, 100, 100);
	pointerMove(110, 100);
	stubElementFromPoint(dropTarget);
	pointerUp(110, 100);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("renderKanban", () => {
	let app: App;
	let host: HTMLElement;
	let onWrite: ReturnType<typeof vi.fn>;
	let onAfter: ReturnType<typeof vi.fn>;
	let renumber: ReturnType<typeof vi.fn>;
	let handler: InteractionHandler;

	beforeEach(() => {
		app = makeApp();
		host = makeHost();
		onWrite = vi.fn(async (): Promise<CommitResult> => ({ ok: true }));
		onAfter = vi.fn();
		renumber = vi.fn(async (): Promise<void> => {});
		handler = makeHandler(app, host, onWrite, onAfter);
		_efpResult = null;
	});

	afterEach(() => {
		handler.destroy();
		if (host.parentNode) host.parentNode.removeChild(host);
	});

	// -------------------------------------------------------------------------
	// T5.1-1: Columns rendered per STATUS_VOCAB
	// -------------------------------------------------------------------------
	it("renders one column per status in STATUS_VOCAB order", () => {
		const rows = [
			makeSceneRow({ title: "A", status: "draft", order: 10 }),
			makeSceneRow({ title: "B", status: "idea", order: 10 }),
		];
		const groups = kanbanModel(rows, STATUS_VOCAB);
		const deps: KanbanDeps = { app, renumber };
		renderKanban(host, groups, deps, handler);

		const cols = host.querySelectorAll("[data-sf-status]");
		const statuses = Array.from(cols).map((c) => c.getAttribute("data-sf-status"));
		expect(statuses).toEqual(expect.arrayContaining(STATUS_VOCAB));
		// idea must appear before draft
		const ideaIdx = statuses.indexOf("idea");
		const draftIdx = statuses.indexOf("draft");
		expect(ideaIdx).toBeLessThan(draftIdx);
	});

	// -------------------------------------------------------------------------
	// T5.1-2: Card title has [data-sf-link] drill span
	// -------------------------------------------------------------------------
	it("card title is a [data-sf-link] drill span", () => {
		const row = makeSceneRow({ title: "MyScene", status: "draft", order: 10 });
		const groups = kanbanModel([row], STATUS_VOCAB);
		const deps: KanbanDeps = { app, renumber };
		renderKanban(host, groups, deps, handler);

		const drillSpan = host.querySelector("[data-sf-link]");
		expect(drillSpan).not.toBeNull();
		expect(drillSpan!.getAttribute("data-sf-link")).toBe("scenes/MyScene.md");
	});

	// -------------------------------------------------------------------------
	// T5.1-3: Normal drop → one commitMany with status + order
	// -------------------------------------------------------------------------
	it("normal drop writes status+order via onWrite (single commitMany)", async () => {
		vi.useFakeTimers();

		// Scene in "idea" column, order 10; drop target = "draft" column
		const row = makeSceneRow({ title: "S1", status: "idea", order: 10 });
		const groups = kanbanModel([row], STATUS_VOCAB);
		const deps: KanbanDeps = { app, renumber };
		renderKanban(host, groups, deps, handler);

		// Find the draft column element to drop onto
		const draftCol = host.querySelector("[data-sf-status='draft']") as HTMLElement;
		expect(draftCol).not.toBeNull();

		// Find the card
		const card = host.querySelector(".sf-kb-card") as HTMLElement;
		expect(card).not.toBeNull();

		armedDrag(card, draftCol);
		await vi.runAllTimersAsync();

		expect(onWrite).toHaveBeenCalledOnce();
		const [calledFile, calledEntries] = onWrite.mock.calls[0] as [TFile, CommitEntry[]];
		expect(calledFile.path).toBe("scenes/S1.md");

		// Must write status and order
		const statusEntry = calledEntries.find((e) => e.key === "status");
		const orderEntry  = calledEntries.find((e) => e.key === "order");
		expect(statusEntry).toBeDefined();
		expect(statusEntry!.value).toBe("draft");
		expect(orderEntry).toBeDefined();
		expect(typeof orderEntry!.value).toBe("number");

		vi.useRealTimers();
	});

	// -------------------------------------------------------------------------
	// T5.1-4: Same-slot drop (card dropped onto itself) → no write (no-op)
	// -------------------------------------------------------------------------
	it("same-slot drop (card dropped onto itself) → no write (no-op)", async () => {
		vi.useFakeTimers();

		const row = makeSceneRow({ title: "S1", status: "draft", order: 10 });
		const groups = kanbanModel([row], STATUS_VOCAB);
		const deps: KanbanDeps = { app, renumber };
		renderKanban(host, groups, deps, handler);

		const card = host.querySelector(".sf-kb-card") as HTMLElement;
		// Drop the card onto itself — classic no-op (AC-F1.6)
		armedDrag(card, card);
		await vi.runAllTimersAsync();

		// No write should happen since card is dropped on itself
		expect(onWrite).not.toHaveBeenCalled();

		vi.useRealTimers();
	});

	// -------------------------------------------------------------------------
	// T5.1-5: Renumber drop → batch writes clean 10,20,30; position + atomicity
	// -------------------------------------------------------------------------
	it("renumber drop: correct position, atomic dragged-card write, renumber excludes dragged file", async () => {
		vi.useFakeTimers();

		// Two scenes in "draft" with adjacent order values (no gap)
		const s1 = makeSceneRow({ title: "S1", status: "draft", order: 10 });
		const s2 = makeSceneRow({ title: "S2", status: "draft", order: 11 });
		// scene to drag from "idea" to before s2 in draft → needs renumber
		const dragged = makeSceneRow({ title: "Drag", status: "idea", order: 5 });

		app.fileManager._setFrontmatter("scenes/S1.md", { status: "draft", order: 10, storyDay: 5 });
		app.fileManager._setFrontmatter("scenes/S2.md", { status: "draft", order: 11, storyDay: 6 });
		app.fileManager._setFrontmatter("scenes/Drag.md", { status: "idea", order: 5, storyDay: 1 });

		const allRows = [s1, s2, dragged];
		const groups = kanbanModel(allRows, STATUS_VOCAB);
		const deps: KanbanDeps = { app, renumber };
		renderKanban(host, groups, deps, handler);

		// S2 comes after S1 in the draft column. Dropping onto S2 means
		// "insert before S2" → before=10 (S1's order), after=11 (S2's order) → RENUMBER
		const s2Card = host.querySelector(".sf-kb-card[data-sf-card-path='scenes/S2.md']") as HTMLElement;
		const dragCard = host.querySelector(".sf-kb-card[data-sf-card-path='scenes/Drag.md']") as HTMLElement;
		expect(s2Card).not.toBeNull();
		expect(dragCard).not.toBeNull();

		// Drop dragged onto s2Card (before=10, after=11 → RENUMBER)
		armedDrag(dragCard, s2Card);
		await vi.runAllTimersAsync();

		// --- Assert renumber was called for OTHER cards only (dragged file excluded) ---
		expect(renumber).toHaveBeenCalledOnce();
		const renumberArg = renumber.mock.calls[0]![0] as { file: TFile; order: number }[];

		// Dragged file must NOT be in the renumber batch (it is written via onWrite)
		const draggedInBatch = renumberArg.find((w) => w.file.path === "scenes/Drag.md");
		expect(draggedInBatch).toBeUndefined();

		// Renumber batch orders must be multiples of 10
		const batchOrders = renumberArg.map((w) => w.order);
		for (const o of batchOrders) {
			expect(o % 10).toBe(0);
		}

		// --- Assert dragged card's status+order written atomically via onWrite ---
		expect(onWrite).toHaveBeenCalledOnce();
		const [writtenFile, writtenEntries] = onWrite.mock.calls[0] as [TFile, CommitEntry[]];
		expect(writtenFile.path).toBe("scenes/Drag.md");

		const writtenStatus = writtenEntries.find((e) => e.key === "status");
		const writtenOrder  = writtenEntries.find((e) => e.key === "order");
		// Both status AND order must be in the single atomic onWrite call
		expect(writtenStatus).toBeDefined();
		expect(writtenStatus!.value).toBe("draft");
		expect(writtenStatus!.field).toEqual(STATUS_FIELD);
		expect(writtenOrder).toBeDefined();
		expect(typeof writtenOrder!.value).toBe("number");
		expect(writtenOrder!.field).toEqual(ORDER_FIELD);

		// --- Assert correct drop position: dragged card before S2 ---
		// Sequence after drop: [S1, Drag, S2] → orders 10, 20, 30
		// Drag's order must be < S2's order (positional, not just "multiple of 10")
		const draggedOrder = writtenOrder!.value as number;
		const s2Write = renumberArg.find((w) => w.file.path === "scenes/S2.md");
		expect(s2Write).toBeDefined();
		expect(draggedOrder).toBeLessThan(s2Write!.order);

		vi.useRealTimers();
	});

	// -------------------------------------------------------------------------
	// T5.1-6: Empty scope → empty-state
	// -------------------------------------------------------------------------
	it("empty groups → renders empty-state message", () => {
		const groups: Group[] = [];
		const deps: KanbanDeps = { app, renumber };
		renderKanban(host, groups, deps, handler);

		const emptyLine = host.querySelector(".sf-emptyline");
		expect(emptyLine).not.toBeNull();
	});

	// -------------------------------------------------------------------------
	// T5.1-7: Neutral column rendered for out-of-vocab status
	// -------------------------------------------------------------------------
	it("neutral column rendered for out-of-vocab status", () => {
		const row = makeSceneRow({ title: "Orphan", status: "published", order: 10 });
		const groups = kanbanModel([row], STATUS_VOCAB);
		const deps: KanbanDeps = { app, renumber };
		renderKanban(host, groups, deps, handler);

		// There should be a neutral column (no-status key)
		const neutralCol = host.querySelector("[data-sf-status='']") ??
			host.querySelector(".sf-kb-col--neutral");
		expect(neutralCol).not.toBeNull();

		// The orphan card should be in it
		const cards = Array.from(host.querySelectorAll(".sf-kb-card"));
		const orphanCard = cards.find((c) =>
			c.querySelector("[data-sf-link='scenes/Orphan.md']") !== null
		);
		expect(orphanCard).toBeDefined();
	});

	// -------------------------------------------------------------------------
	// T5.1-8: Keyboard ArrowRight → moves card to next status column
	// -------------------------------------------------------------------------
	it("ArrowRight keyboard on a card triggers a write to the next status", async () => {
		vi.useFakeTimers();

		const row = makeSceneRow({ title: "KbScene", status: "draft", order: 10 });
		app.fileManager._setFrontmatter("scenes/KbScene.md", { status: "draft", order: 10 });
		const groups = kanbanModel([row], STATUS_VOCAB);
		const deps: KanbanDeps = { app, renumber };
		renderKanban(host, groups, deps, handler);

		const card = host.querySelector(".sf-kb-card") as HTMLElement;
		card.focus();
		card.dispatchEvent(new KeyboardEvent("keydown", {
			key: "ArrowRight",
			bubbles: true,
			cancelable: true,
		}));

		await vi.runAllTimersAsync();

		// Should write to the next status after "draft" → "revised"
		expect(onWrite).toHaveBeenCalledOnce();
		const [, entries] = onWrite.mock.calls[0] as [TFile, CommitEntry[]];
		const statusEntry = entries.find((e) => e.key === "status");
		expect(statusEntry).toBeDefined();
		// draft is index 2, next is "revised" at index 3
		expect(statusEntry!.value).toBe("revised");

		vi.useRealTimers();
	});

	// -------------------------------------------------------------------------
	// T5.1-9: Keyboard ArrowLeft → moves card to previous status column
	// -------------------------------------------------------------------------
	it("ArrowLeft keyboard on a card triggers a write to the previous status", async () => {
		vi.useFakeTimers();

		const row = makeSceneRow({ title: "KbScene2", status: "draft", order: 10 });
		app.fileManager._setFrontmatter("scenes/KbScene2.md", { status: "draft", order: 10 });
		const groups = kanbanModel([row], STATUS_VOCAB);
		const deps: KanbanDeps = { app, renumber };
		renderKanban(host, groups, deps, handler);

		const card = host.querySelector(".sf-kb-card") as HTMLElement;
		card.focus();
		card.dispatchEvent(new KeyboardEvent("keydown", {
			key: "ArrowLeft",
			bubbles: true,
			cancelable: true,
		}));

		await vi.runAllTimersAsync();

		expect(onWrite).toHaveBeenCalledOnce();
		const [, entries] = onWrite.mock.calls[0] as [TFile, CommitEntry[]];
		const statusEntry = entries.find((e) => e.key === "status");
		expect(statusEntry).toBeDefined();
		// draft is index 2, prev is "outline" at index 1
		expect(statusEntry!.value).toBe("outline");

		vi.useRealTimers();
	});

	// -------------------------------------------------------------------------
	// T5.1-10: Sibling fields untouched (storyDay, pov not overwritten)
	// -------------------------------------------------------------------------
	it("sibling fields (storyDay, pov) are not modified by a drag drop", async () => {
		vi.useFakeTimers();

		const row = makeSceneRow({ title: "Sib", status: "idea", order: 10, storyDay: 3 });
		// Pre-seed frontmatter with sibling fields
		app.fileManager._setFrontmatter("scenes/Sib.md", {
			status: "idea",
			order: 10,
			storyDay: 3,
			pov: "[[Hero]]",
		});

		const groups = kanbanModel([row], STATUS_VOCAB);
		const deps: KanbanDeps = { app, renumber };
		renderKanban(host, groups, deps, handler);

		const card = host.querySelector(".sf-kb-card") as HTMLElement;
		const draftCol = host.querySelector("[data-sf-status='draft']") as HTMLElement;
		armedDrag(card, draftCol);
		await vi.runAllTimersAsync();

		// After the write, storyDay and pov should be unchanged
		const fm = app.fileManager._getFrontmatter("scenes/Sib.md");
		expect(fm["storyDay"]).toBe(3);
		expect(fm["pov"]).toBe("[[Hero]]");

		vi.useRealTimers();
	});

	// -------------------------------------------------------------------------
	// T5.1-11: Drag does NOT start from [data-sf-link] surface
	// -------------------------------------------------------------------------
	it("drag does not start when pointerdown is on [data-sf-link] (drill wins)", async () => {
		vi.useFakeTimers();

		const row = makeSceneRow({ title: "DrillTest", status: "idea", order: 10 });
		const groups = kanbanModel([row], STATUS_VOCAB);
		const deps: KanbanDeps = { app, renumber };
		renderKanban(host, groups, deps, handler);

		// Find the drill span (title link)
		const drillSpan = host.querySelector("[data-sf-link='scenes/DrillTest.md']") as HTMLElement;
		expect(drillSpan).not.toBeNull();

		const draftCol = host.querySelector("[data-sf-status='draft']") as HTMLElement;
		// Attempt drag from the drill span
		pointerDown(drillSpan, 100, 100);
		pointerMove(110, 100);
		stubElementFromPoint(draftCol);
		pointerUp(110, 100);
		await vi.runAllTimersAsync();

		// No write because drill wins
		expect(onWrite).not.toHaveBeenCalled();

		vi.useRealTimers();
	});

	// -------------------------------------------------------------------------
	// T5.1-12: statusColumnColor is used — columns have data-sf-status set
	// -------------------------------------------------------------------------
	it("columns carry data-sf-status attribute matching the status value", () => {
		const rows = [makeSceneRow({ title: "A", status: "done", order: 10 })];
		const groups = kanbanModel(rows, STATUS_VOCAB);
		const deps: KanbanDeps = { app, renumber };
		renderKanban(host, groups, deps, handler);

		const doneCol = host.querySelector("[data-sf-status='done']");
		expect(doneCol).not.toBeNull();
	});
});

// ---------------------------------------------------------------------------
// spec 009 T3.4: the RENUMBER writes join the drag's undo group (ADR-38)
// ---------------------------------------------------------------------------

describe("renderKanban — RENUMBER joins the drag's undo group (spec 009 T3.4)", () => {
	interface TrackingGroup extends JournalGroup {
		readonly tracked: Promise<unknown>[];
	}

	function trackingGroup(): TrackingGroup {
		const tracked: Promise<unknown>[] = [];
		const g: TrackingGroup = {
			id: "g-test",
			tracked,
			join: () => g,
			track: <T,>(p: Promise<T>): Promise<T> => {
				tracked.push(p);
				// The real group marks the promise handled; do the same here.
				p.catch(() => undefined);
				return p;
			},
			close: () => {},
			settled: Promise.resolve(),
		};
		return g;
	}

	function renumberBoard(
		renumber: KanbanDeps["renumber"],
		openGroup?: () => JournalGroup,
	): { host: HTMLElement; handler: InteractionHandler } {
		const app = makeApp();
		const host = makeHost();
		const handler = new InteractionHandler(app, host, {
			onWrite: async (): Promise<CommitResult> => ({ ok: true }),
			onAfter: () => {},
			debounceMs: 0,
			dragThreshold: 5,
			...(openGroup ? { openGroup } : {}),
		});
		const rows = [
			makeSceneRow({ title: "S1", status: "draft", order: 10 }),
			makeSceneRow({ title: "S2", status: "draft", order: 11 }),
			makeSceneRow({ title: "Drag", status: "idea", order: 5 }),
		];
		renderKanban(host, kanbanModel(rows, STATUS_VOCAB), { app, ...(renumber ? { renumber } : {}) }, handler);
		const s2 = host.querySelector(".sf-kb-card[data-sf-card-path='scenes/S2.md']")!;
		const dragged = host.querySelector(".sf-kb-card[data-sf-card-path='scenes/Drag.md']") as HTMLElement;
		armedDrag(dragged, s2); // before=10, after=11 → RENUMBER
		return { host, handler };
	}

	afterEach(() => {
		document.body.replaceChildren();
		vi.restoreAllMocks();
	});

	it("hands the drag's group to renumber and tracks the renumber: the group waits for it to settle", async () => {
		const group = trackingGroup();
		const seen: (JournalGroup | null)[] = [];
		let release!: () => void;
		const renumber = vi.fn((_w: unknown, g: JournalGroup | null): Promise<void> => {
			seen.push(g);
			return new Promise<void>((resolve) => { release = resolve; });
		});
		const { handler } = renumberBoard(renumber, () => group);
		expect(renumber).toHaveBeenCalledOnce();
		expect(seen).toEqual([group]);
		expect(group.tracked).toHaveLength(1);
		let settled = false;
		void group.tracked[0]!.then(() => { settled = true; });
		await Promise.resolve();
		expect(settled).toBe(false);
		release();
		await group.tracked[0];
		expect(settled).toBe(true);
		handler.destroy();
	});

	it("with a group, a rejected renumber is still warned about", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const group = trackingGroup();
		const renumber = vi.fn((): Promise<void> => Promise.reject(new Error("disk full")));
		const { handler } = renumberBoard(renumber, () => group);
		await new Promise((r) => setTimeout(r, 0));
		expect(group.tracked).toHaveLength(1);
		expect(warn).toHaveBeenCalledOnce();
		expect(String(warn.mock.calls[0]?.[0])).toContain("[StoryForge]");
		handler.destroy();
	});

	it("without a group, a rejected renumber is caught and warned about, not dropped", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const seen: (JournalGroup | null)[] = [];
		const renumber = vi.fn((_w: unknown, g: JournalGroup | null): Promise<void> => {
			seen.push(g);
			return Promise.reject(new Error("disk full"));
		});
		const { handler } = renumberBoard(renumber);
		await new Promise((r) => setTimeout(r, 0));
		expect(seen).toEqual([null]);
		expect(warn).toHaveBeenCalledOnce();
		expect(String(warn.mock.calls[0]?.[0])).toContain("[StoryForge]");
		handler.destroy();
	});
});
