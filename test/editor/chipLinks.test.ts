/**
 * chipLinks.test.ts — link chips in the editor pane behave like links.
 *
 * The chip NAME carries `data-sf-link` nested inside the `editableField` cell,
 * so nearest-marker precedence (not ranking code) makes the name win; the ×
 * keeps removing and never navigates; plain value chips are unchanged.
 * Precedence is asserted through the REAL `walkTargetMarkers`, and the click
 * behaviour through a live `AnvilView`.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { App, WorkspaceLeaf, type TFile } from "obsidian";
import { createMockCachedMetadata, createMockTFile, type CachedMetadata } from "../__mocks__/obsidian";
import { AnvilView } from "anvil/AnvilView";
import { CHIP_REMOVE_ATTR, renderFieldControl, type FieldControlHandle } from "editor/fieldControls";
import type { FieldDef } from "editor/fieldModel";
import { walkTargetMarkers } from "navigation/domTargetWalk";
import { ANVIL_MARKERS, createMarkerKindOf } from "navigation/markerVocabulary";

const mounted: HTMLElement[] = [];
afterEach(() => {
	while (mounted.length > 0) mounted.pop()?.remove();
});

function field(name: string, type: FieldDef["type"]): FieldDef {
	return { name, type, width: "full" };
}

function mount(def: FieldDef, value: unknown): FieldControlHandle {
	const host = document.createElement("div");
	document.body.appendChild(host);
	mounted.push(host);
	return renderFieldControl(host, def, value, {});
}

function markers(cell: HTMLElement, from: HTMLElement): string[] {
	return [...walkTargetMarkers(from, cell, createMarkerKindOf(ANVIL_MARKERS)).markers];
}

function labels(cell: HTMLElement): HTMLElement[] {
	return Array.from(cell.querySelectorAll<HTMLElement>(".sf-ed-chip-label"));
}

describe("link chips — markup", () => {
	it("MultiFile: each name carries its link target, nested inside the field cell", () => {
		const c = mount(field("allies", "MultiFile"), ["[[Tobias Ferro]]", "[[Elke Stoneway|Elke]]"]);
		expect(labels(c.el).map((l) => l.getAttribute("data-sf-link"))).toEqual(["Tobias Ferro", "Elke Stoneway"]);
		expect(c.el.hasAttribute("data-sf-link")).toBe(false);
	});

	it("File (single link control): the name carries the target", () => {
		const c = mount(field("book", "File"), "[[Wardens of Moonharbor]]");
		expect(labels(c.el)[0]?.getAttribute("data-sf-link")).toBe("Wardens of Moonharbor");
	});

	it("a link field holding a non-wikilink string marks nothing", () => {
		const c = mount(field("allies", "MultiFile"), ["just text"]);
		expect(labels(c.el)[0]?.hasAttribute("data-sf-link")).toBe(false);
	});

	it("plain value chips (Multi) are unchanged", () => {
		const c = mount(field("skills", "Multi"), ["shortblade"]);
		expect(labels(c.el)[0]?.hasAttribute("data-sf-link")).toBe(false);
		expect(c.el.querySelector("[data-sf-link]")).toBeNull();
	});

	it("keeps the × free of the link marker", () => {
		const c = mount(field("allies", "MultiFile"), ["[[Tobias Ferro]]"]);
		expect(c.el.querySelector(`[${CHIP_REMOVE_ATTR}]`)?.hasAttribute("data-sf-link")).toBe(false);
	});

	it("link names are keyboard-reachable links; the × stays a separate button", () => {
		const c = mount(field("allies", "MultiFile"), ["[[Tobias Ferro]]"]);
		const name = labels(c.el)[0]!;
		expect(name.getAttribute("role")).toBe("link");
		expect(name.getAttribute("tabindex")).toBe("0");
		expect(name.querySelector("[role=button]")).toBeNull();
	});
});

describe("link chips — precedence through the real walk", () => {
	it("the name resolves to name before editableField", () => {
		const c = mount(field("allies", "MultiFile"), ["[[Tobias Ferro]]"]);
		expect(markers(c.el, labels(c.el)[0]!)).toEqual(["name", "editableField"]);
	});

	it("the chip body and the × resolve to the field only", () => {
		const c = mount(field("allies", "MultiFile"), ["[[Tobias Ferro]]"]);
		const chip = c.el.querySelector<HTMLElement>(".sf-ed-chip")!;
		expect(markers(c.el, chip)).toEqual(["editableField"]);
		expect(markers(c.el, c.el.querySelector<HTMLElement>(`[${CHIP_REMOVE_ATTR}]`)!)).toEqual(["editableField"]);
	});

	it("a plain chip name resolves to the field only", () => {
		const c = mount(field("skills", "Multi"), ["shortblade"]);
		expect(markers(c.el, labels(c.el)[0]!)).toEqual(["editableField"]);
	});
});

// ---------------------------------------------------------------------------
// Live Anvil
// ---------------------------------------------------------------------------

const mara = createMockTFile({ basename: "Mara Stoneway", path: "30 Canon/31 Characters/Mara Stoneway.md" });
const tobias = createMockTFile({ basename: "Tobias Ferro", path: "30 Canon/31 Characters/Tobias Ferro.md" });

function seed(app: App): void {
	const cache: CachedMetadata = createMockCachedMetadata({ frontmatter: { tags: ["canon/character"] } });
	vi.mocked(app.metadataCache.getFileCache).mockImplementation((f) => (f === mara || f === tobias ? cache : null));
	vi.mocked(app.metadataCache.getFirstLinkpathDest).mockImplementation((l) => (l === "Tobias Ferro" ? tobias : null));
	vi.mocked(app.vault.getMarkdownFiles).mockReturnValue([mara, tobias] as TFile[]);
	vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((p) =>
		p === mara.path ? mara : p === tobias.path ? tobias : null,
	);
	app.workspace.getActiveFile = vi.fn(() => null);
	app.workspace.openLinkText = vi.fn(async () => {});
}

async function openAnvil(
	modifier: "drill" | "open" = "drill",
): Promise<{ app: App; view: AnvilView; drilled: TFile[]; cell: HTMLElement }> {
	const app = new App();
	seed(app);
	const leaf = new WorkspaceLeaf();
	(leaf as unknown as { app: App }).app = app;
	const drilled: TFile[] = [];
	const view: AnvilView = new AnvilView(leaf, {
		settings: { getLinkClickAction: () => modifier, getCardTitleOpensNote: () => false },
		drill: (f) => { drilled.push(f); view.inspect(f); },
	});
	await view.onOpen();
	view.setLayout("codex");
	document.body.appendChild(view.contentEl);
	mounted.push(view.contentEl);
	view.contentEl.querySelector(`[data-sf-link="${mara.path}"]`)?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	drilled.length = 0;
	const grid = view.contentEl.querySelector<HTMLElement>(".sf-ed-grid")!;
	const cell = renderFieldControl(grid, field("allies", "MultiFile"), ["[[Tobias Ferro]]"], {}).el;
	return { app, view, drilled, cell };
}

describe("link chips — clicks in a live Anvil", () => {
	it("a plain click on the name inspects that note while another note's pane is open", async () => {
		const { view, drilled, cell } = await openAnvil();
		expect(view.contentEl.querySelector(".sf-ed")).not.toBeNull();

		labels(cell)[0]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));

		expect(drilled.map((f) => f.path)).toEqual([tobias.path]);
	});

	it("a modifier click inverts: opens the chip's note instead", async () => {
		const { app, drilled, cell } = await openAnvil();
		labels(cell)[0]!.dispatchEvent(new MouseEvent("click", { bubbles: true, metaKey: true }));

		expect(drilled).toEqual([]);
		expect(app.workspace.openLinkText).toHaveBeenCalledWith(tobias.path, "", false);
	});

	it("the × removes without navigating", async () => {
		const { app, drilled, cell } = await openAnvil();
		cell.querySelector(`[${CHIP_REMOVE_ATTR}]`)!.dispatchEvent(new MouseEvent("click", { bubbles: true }));

		expect(labels(cell)).toHaveLength(0);
		expect(drilled).toEqual([]);
		expect(app.workspace.openLinkText).not.toHaveBeenCalled();
	});

	it("a click on a chip name writes nothing", async () => {
		const { app, cell } = await openAnvil();
		labels(cell)[0]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));

		expect(app.fileManager.processFrontMatter).not.toHaveBeenCalled();
		expect(app.vault.modify).not.toHaveBeenCalled();
	});

	it("Enter on a focused chip name follows the link", async () => {
		const { drilled, cell } = await openAnvil();
		labels(cell)[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
		expect(drilled.map((f) => f.path)).toEqual([tobias.path]);
	});
});
