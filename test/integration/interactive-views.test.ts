/**
 * interactive-views.test.ts — M6 / T6.3 integration round-trip.
 *
 * Drives the write → re-render round-trip end-to-end over an in-code scene fixture
 * using the spy-able Obsidian mock (fileManager.processFrontMatter backed by a
 * per-path store + metadataCache._trigger("changed")):
 *
 *   (a) Kanban move writes status + order; the view re-renders and a SECOND
 *       WorkspaceView on the same scope reflects it after "changed" (AC-F7.3).
 *   (b) Plotgrid toggle writes plotlines.
 *   (c) Timeline placement writes an integer storyDay and leaves order untouched
 *       (AC-F3.2).
 *   (d) A simulated external frontmatter change re-renders (last-write-wins,
 *       ADR-25).
 *   (e) A Cmd+Z-style revert (frontmatter restored → "changed") updates the view
 *       (AC-F7.4).
 *
 * Kanban/Timeline moves are driven via the InteractionHandler KEYBOARD path
 * (ArrowRight / Alt+ArrowDown) — it shares the exact same commit seam as a
 * pointer drop (F8, AC-11) and is deterministic in jsdom (elementFromPoint is
 * null there). The plotgrid uses its click toggle.
 *
 * @ref docs/XDD/specs/007-interactive-views/plan/phase-6.md — T6.3
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, WorkspaceLeaf, type TFile } from "obsidian";
import {
	createMockCachedMetadata,
	createMockFrontmatterLink,
	createMockTFile,
	type CachedMetadata,
} from "../__mocks__/obsidian";

// --- jsdom shims (PointerEvent + elementFromPoint) ---------------------------

if (typeof globalThis.PointerEvent === "undefined") {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(globalThis as any).PointerEvent = class PointerEvent extends MouseEvent {
		constructor(type: string, init?: MouseEventInit) {
			super(type, init);
		}
	};
}
Object.defineProperty(document, "elementFromPoint", {
	value: () => null as Element | null,
	writable: true,
	configurable: true,
});

// Import AFTER the shims so the handler's activeWindow/activeDocument resolve.
import { WorkspaceView } from "workspace/WorkspaceView";

interface SceneOpts {
	act: number;
	order: number;
	storyDay: number;
	status: string;
	plotlines: string[];
}

function makeFixture() {
	const app = new App();
	const caches = new Map<TFile, CachedMetadata>();
	const byPath = new Map<string, TFile>();
	const byLink = new Map<string, TFile>();
	const resolvedLinks: Record<string, Record<string, number>> = {};
	const all: TFile[] = [];

	const mk = (basename: string, path: string): TFile => createMockTFile({ basename, path });
	const reg = (file: TFile, cache: CachedMetadata, linkName?: string): TFile => {
		caches.set(file, cache);
		byPath.set(file.path, file);
		all.push(file);
		if (linkName !== undefined) byLink.set(linkName, file);
		return file;
	};
	const tag = (t: string): CachedMetadata => createMockCachedMetadata({ tags: [{ tag: t }] });
	const plCache = (name: string): CachedMetadata =>
		createMockCachedMetadata({ tags: [{ tag: "#planning/plotline" }], frontmatter: { type: "plotline", name } });

	const book = reg(mk("Wardens of Moonharbor", "20 Planning/Wardens of Moonharbor.md"), tag("#planning/book"), "Wardens of Moonharbor");
	reg(mk("The Dying Light", "20 Planning/The Dying Light.md"), plCache("The Dying Light"), "The Dying Light");
	reg(mk("The Warden's Oath", "20 Planning/The Warden's Oath.md"), plCache("The Warden's Oath"), "The Warden's Oath");

	const scenes = new Map<number, TFile>();
	const scene = (n: number, o: SceneOpts): TFile => {
		const path = `10 Manuscript/WoM/Scene ${n}.md`;
		const file = mk(`Scene ${n}`, path);
		const fm: Record<string, unknown> = {
			type: "scene", title: `Scene ${n}`, act: o.act, order: o.order,
			storyDay: o.storyDay, status: o.status, when: `Night ${n}`,
		};
		const links = [
			createMockFrontmatterLink("book", "Wardens of Moonharbor"),
			...o.plotlines.map((p, i) => createMockFrontmatterLink(`plotlines.${i}`, p)),
		];
		reg(file, createMockCachedMetadata({ tags: [{ tag: "#manuscript/scene" }], frontmatter: fm, frontmatterLinks: links }));
		// Seed the writable store so processFrontMatter mutations round-trip.
		app.fileManager._setFrontmatter(path, { ...fm, plotlines: o.plotlines.map((p) => `[[${p}]]`) });
		const edges: Record<string, number> = { [book.path]: 1 };
		for (const p of o.plotlines) {
			const dest = byLink.get(p);
			if (dest) edges[dest.path] = 1;
		}
		resolvedLinks[path] = edges;
		scenes.set(n, file);
		return file;
	};

	scene(1, { act: 1, order: 10, storyDay: 1, status: "draft", plotlines: ["The Dying Light"] });
	scene(2, { act: 1, order: 20, storyDay: 2, status: "draft", plotlines: ["The Dying Light"] });
	scene(3, { act: 1, order: 30, storyDay: 3, status: "outline", plotlines: ["The Warden's Oath"] });

	vi.mocked(app.metadataCache.getFileCache).mockImplementation((f) => caches.get(f) ?? null);
	vi.mocked(app.metadataCache.getFirstLinkpathDest).mockImplementation((l) => byLink.get(l) ?? null);
	vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((p) => byPath.get(p) ?? null);
	vi.mocked(app.vault.getMarkdownFiles).mockReturnValue(all);
	app.metadataCache.resolvedLinks = resolvedLinks;
	app.workspace.getActiveFile = vi.fn(() => book);

	return { app, book, scenes, caches };
}

function makeView(app: App): WorkspaceView {
	const leaf = new WorkspaceLeaf();
	(leaf as unknown as { app: App }).app = app;
	return new WorkspaceView(leaf, { getLinkClickAction: () => "drill", drill: vi.fn() });
}
function body(view: WorkspaceView): HTMLElement {
	return view.contentEl.querySelector(".sf-ws-body") as HTMLElement;
}
function keyDown(el: Element, key: string, altKey = false): void {
	el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key, altKey }));
}
function kbCard(view: WorkspaceView, path: string): HTMLElement {
	const card = [...body(view).querySelectorAll<HTMLElement>(".sf-kb-card")].find(
		(c) => c.getAttribute("data-sf-card-path") === path,
	);
	if (!card) throw new Error(`no kanban card for ${path}`);
	return card;
}
function tlItem(view: WorkspaceView, path: string): HTMLElement {
	const item = [...body(view).querySelectorAll<HTMLElement>(".sf-tl-item")].find(
		(i) => i.getAttribute("data-sf-item-path") === path,
	);
	if (!item) throw new Error(`no rail item for ${path}`);
	return item;
}

describe("M6 integration — interactive write → re-render round-trip", () => {
	let fx: ReturnType<typeof makeFixture>;

	beforeEach(() => {
		vi.useFakeTimers();
		fx = makeFixture();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("(a) Kanban move writes status+order; the view + a second view both reflect it after changed", async () => {
		const viewA = makeView(fx.app);
		await viewA.onOpen();
		viewA.setLayout("kanban");

		const viewB = makeView(fx.app);
		await viewB.onOpen();
		viewB.setLayout("kanban");

		const s3 = fx.scenes.get(3)!; // status "outline"
		// ArrowRight → next status column ("outline" → "draft").
		keyDown(kbCard(viewA, s3.path), "ArrowRight");
		await vi.runAllTimersAsync();

		const fmAfter = fx.app.fileManager._getFrontmatter(s3.path);
		expect(fmAfter["status"]).toBe("draft");
		expect(typeof fmAfter["order"]).toBe("number");

		// The metadata cache catches up asynchronously after the vault write; reflect
		// the new status, then emit "changed" so the hybrid reconcile refreshes both
		// open views (AC-F7.3).
		vi.mocked(fx.app.metadataCache.getFileCache).mockImplementation((f) => {
			const c = fx.caches.get(f);
			if (f.path === s3.path && c) {
				return { ...c, frontmatter: { ...c.frontmatter, status: "draft", order: fmAfter["order"] } };
			}
			return c ?? null;
		});
		fx.app.metadataCache._trigger("changed", s3);
		await vi.runAllTimersAsync();

		// Both views now show s3 under the "draft" column.
		for (const view of [viewA, viewB]) {
			const card = kbCard(view, s3.path);
			const col = card.closest("[data-sf-status]");
			expect(col?.getAttribute("data-sf-status")).toBe("draft");
		}

		await viewA.onClose();
		await viewB.onClose();
	});

	it("(b) Plotgrid toggle writes the plotlines list", async () => {
		const view = makeView(fx.app);
		await view.onOpen();
		view.setLayout("plotgrid");

		const s1 = fx.scenes.get(1)!;
		// s1 is NOT on "The Warden's Oath" — toggling that cell adds it.
		const cell = [...body(view).querySelectorAll<HTMLElement>(".sf-pg-cell")].find(
			(c) => c.getAttribute("data-sf-scene") === s1.path && c.getAttribute("data-sf-plotline") === "The Warden's Oath",
		);
		expect(cell).toBeDefined();
		cell!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		await vi.runAllTimersAsync();

		const plotlines = fx.app.fileManager._getFrontmatter(s1.path)["plotlines"];
		expect(Array.isArray(plotlines)).toBe(true);
		expect((plotlines as string[]).some((p) => p.includes("The Warden's Oath"))).toBe(true);

		await view.onClose();
	});

	it("(c) Timeline placement writes an integer storyDay and leaves order untouched (AC-F3.2)", async () => {
		const view = makeView(fx.app);
		await view.onOpen(); // defaults to timeline rail

		const s2 = fx.scenes.get(2)!;
		const before = fx.app.fileManager._getFrontmatter(s2.path);
		const orderBefore = before["order"];

		// Alt+ArrowDown → move the scene one story day later (storyDay only).
		keyDown(tlItem(view, s2.path), "ArrowDown", true);
		await vi.runAllTimersAsync();

		const after = fx.app.fileManager._getFrontmatter(s2.path);
		expect(typeof after["storyDay"]).toBe("number");
		expect(Number.isInteger(after["storyDay"])).toBe(true);
		expect(after["storyDay"]).toBe(3); // 2 + 1
		// order MUST be untouched.
		expect(after["order"]).toBe(orderBefore);

		// The write is announced end-to-end via the aria-live region (F8 / AC-11):
		// if the handler's announce→_announce wiring were severed this stays empty.
		expect(view.contentEl.querySelector(".sf-ws-live")?.textContent).toBeTruthy();

		await view.onClose();
	});

	it("(d) a simulated external frontmatter change re-renders (last-write-wins, ADR-25)", async () => {
		const view = makeView(fx.app);
		await view.onOpen();
		view.setLayout("kanban");

		const s1 = fx.scenes.get(1)!; // status "draft"
		expect(kbCard(view, s1.path).closest("[data-sf-status]")?.getAttribute("data-sf-status")).toBe("draft");

		// External edit: another process sets status → "final".
		fx.app.fileManager._setFrontmatter(s1.path, {
			...fx.app.fileManager._getFrontmatter(s1.path), status: "final",
		});
		vi.mocked(fx.app.metadataCache.getFileCache).mockImplementation((f) => {
			const c = fx.caches.get(f);
			if (f.path === s1.path && c) return { ...c, frontmatter: { ...c.frontmatter, status: "final" } };
			return c ?? null;
		});
		fx.app.metadataCache._trigger("changed", s1);
		await vi.runAllTimersAsync();

		expect(kbCard(view, s1.path).closest("[data-sf-status]")?.getAttribute("data-sf-status")).toBe("final");

		await view.onClose();
	});

	it("(e) a Cmd+Z-style revert (frontmatter restored → changed) updates the view (AC-F7.4)", async () => {
		const view = makeView(fx.app);
		await view.onOpen();
		view.setLayout("kanban");

		const s1 = fx.scenes.get(1)!;
		const original = fx.caches.get(s1)!;

		// First: an edit moves it to "final".
		vi.mocked(fx.app.metadataCache.getFileCache).mockImplementation((f) => {
			const c = fx.caches.get(f);
			if (f.path === s1.path && c) return { ...c, frontmatter: { ...c.frontmatter, status: "final" } };
			return c ?? null;
		});
		fx.app.metadataCache._trigger("changed", s1);
		await vi.runAllTimersAsync();
		expect(kbCard(view, s1.path).closest("[data-sf-status]")?.getAttribute("data-sf-status")).toBe("final");

		// Revert (undo): frontmatter restored to the original "draft", then changed.
		vi.mocked(fx.app.metadataCache.getFileCache).mockImplementation((f) => {
			if (f.path === s1.path) return original;
			return fx.caches.get(f) ?? null;
		});
		fx.app.metadataCache._trigger("changed", s1);
		await vi.runAllTimersAsync();

		expect(kbCard(view, s1.path).closest("[data-sf-status]")?.getAttribute("data-sf-status")).toBe("draft");

		await view.onClose();
	});
});
