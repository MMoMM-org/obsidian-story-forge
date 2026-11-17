/**
 * anvilKanbanDrag.test.ts — spec 008 T8.4: Kanban drag on the moved surface still
 * writes `status` + `order` atomically.
 *
 * The layers below are covered on their own: renderKanban hands ONE onWrite call
 * both entries (test/workspace/renderKanban.test.ts), and commitMany turns entries
 * into ONE processFrontMatter call (test/inspector/frontmatterWriter.commitMany.test.ts).
 * What only an end-to-end drag on the Anvil proves is the wiring between them after
 * the move (ADR-27): a pointer drag on the Anvil's Kanban tab reaches the vault as a
 * single processFrontMatter call that sets both keys, and nothing else is written.
 *
 * @ref docs/XDD/specs/008-codex-surface/plan/phase-8.md — T8.4
 * @ref docs/XDD/specs/007-interactive-views/solution.md — ADR-14 (atomic status+order)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, WorkspaceLeaf, type TFile } from "obsidian";
import { createMockCachedMetadata, createMockFrontmatterLink, createMockTFile, type CachedMetadata } from "../__mocks__/obsidian";

// --- jsdom shims (PointerEvent + a steerable elementFromPoint) ---------------

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
let dropUnderPointer: Element | null = null;
Object.defineProperty(document, "elementFromPoint", {
	value: (): Element | null => dropUnderPointer,
	writable: true,
	configurable: true,
});

// Import AFTER the shims so the handler's activeWindow/activeDocument resolve.
import { AnvilView } from "anvil/AnvilView";

function pointer(type: string, target: EventTarget, x: number, buttons: number): void {
	target.dispatchEvent(new PointerEvent(type, {
		bubbles: true, cancelable: true, clientX: x, clientY: 100,
		button: 0, buttons, pointerId: 1, isPrimary: true,
	}));
}

function makeFixture(): { app: App; scenes: TFile[] } {
	const app = new App();
	const caches = new Map<TFile, CachedMetadata>();
	const byPath = new Map<string, TFile>();
	const all: TFile[] = [];
	const reg = (file: TFile, cache: CachedMetadata): TFile => {
		caches.set(file, cache);
		byPath.set(file.path, file);
		all.push(file);
		return file;
	};

	const book = reg(
		createMockTFile({ basename: "Wardens of Moonharbor", path: "20 Planning/Wardens of Moonharbor.md" }),
		createMockCachedMetadata({ tags: [{ tag: "#planning/book" }] }),
	);
	const resolvedLinks: Record<string, Record<string, number>> = {};
	const scenes = [
		{ n: 1, status: "draft", order: 10 },
		{ n: 2, status: "draft", order: 20 },
		{ n: 3, status: "outline", order: 5 }, // differs from the expected 30, so a status-only write fails
	].map(({ n, status, order }) => {
		const path = `10 Manuscript/WoM/Scene ${n}.md`;
		const fm = { type: "scene", title: `Scene ${n}`, act: 1, order, storyDay: n, status, pov: "Mara Stoneway" };
		app.fileManager._setFrontmatter(path, { ...fm });
		resolvedLinks[path] = { [book.path]: 1 };
		return reg(
			createMockTFile({ basename: `Scene ${n}`, path }),
			createMockCachedMetadata({
				tags: [{ tag: "#manuscript/scene" }],
				frontmatter: fm,
				frontmatterLinks: [createMockFrontmatterLink("book", "Wardens of Moonharbor")],
			}),
		);
	});

	vi.mocked(app.metadataCache.getFileCache).mockImplementation((f) => caches.get(f) ?? null);
	vi.mocked(app.metadataCache.getFirstLinkpathDest).mockImplementation((l) => (l === "Wardens of Moonharbor" ? book : null));
	vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((p) => byPath.get(p) ?? null);
	vi.mocked(app.vault.getMarkdownFiles).mockReturnValue(all);
	app.metadataCache.resolvedLinks = resolvedLinks;
	app.workspace.getActiveFile = vi.fn(() => book);
	return { app, scenes };
}

describe("Anvil Kanban drag — status + order in one processFrontMatter call (T8.4)", () => {
	let fx: ReturnType<typeof makeFixture>;
	let view: AnvilView;

	beforeEach(async () => {
		vi.useFakeTimers();
		fx = makeFixture();
		const leaf = new WorkspaceLeaf();
		leaf.app = fx.app;
		view = new AnvilView(leaf, { settings: { getLinkClickAction: () => "drill" }, drill: vi.fn() });
		await view.onOpen();
		view.setLayout("kanban");
	});
	afterEach(async () => {
		await view.onClose();
		dropUnderPointer = null;
		vi.useRealTimers();
	});

	it("dragging an 'outline' card onto the 'draft' column writes both keys in a single call", async () => {
		const s3 = fx.scenes[2]!;
		const body = view.contentEl.querySelector(".sf-ws-body") as HTMLElement;
		const card = body.querySelector<HTMLElement>(`.sf-kb-card[data-sf-card-path="${s3.path}"]`);
		const draftCol = body.querySelector<HTMLElement>(".sf-kb-col[data-sf-status='draft']");
		expect(card).not.toBeNull();
		expect(draftCol).not.toBeNull();

		pointer("pointerdown", card!, 100, 1);
		pointer("pointermove", window, 140, 1);
		dropUnderPointer = draftCol;
		pointer("pointerup", window, 140, 0);
		await vi.runAllTimersAsync();

		const pfm = vi.mocked(fx.app.fileManager.processFrontMatter);
		await vi.waitFor(() => {
			// Exactly one write in the whole vault: the dragged card, both keys at once.
			expect(pfm).toHaveBeenCalledOnce();
			expect((pfm.mock.calls[0]![0] as TFile).path).toBe(s3.path);
			const fm = fx.app.fileManager._getFrontmatter(s3.path);
			expect(fm["status"]).toBe("draft");
			expect(fm["order"]).toBe(30); // was 5; appended after order 20 → before + 10
			// Sibling facts survive the write.
			expect(fm["pov"]).toBe("Mara Stoneway");
			expect(fm["storyDay"]).toBe(3);
		});
	});
});
