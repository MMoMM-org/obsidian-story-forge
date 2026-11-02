/**
 * CardBasesView.links.test.ts — relation pills inside a standalone `.base` card.
 *
 * Pills sit inside the same card-body wrapper here, where "inspect" is a
 * recorded no-op. A modifier click on a link pill must open THAT pill's note
 * (resolved from its link target, not handed over as if it were a path), a
 * plain click must do nothing, and an unresolved pill must neither open the
 * card's note nor throw. Right-click shows Obsidian's file menu.
 */

import { describe, expect, it, vi } from "vitest";
import { QueryController, BasesEntry, BasesQueryResult, App, TFile } from "../__mocks__/obsidian";
import { CardBasesView } from "bases/CardBasesView";
import { createCardRegistry, type CardEntry, type CardRenderer } from "codex/cardRegistry";
import { entryPills } from "codex/cards/shared";

const MARA = "Characters/Mara.md";
const TOBIAS = "Characters/Tobias Ferro.md";

function pillCard(): CardRenderer {
	return {
		id: "hero",
		label: "Hero",
		render(entry: CardEntry, el: HTMLElement): void {
			for (const pill of entryPills(entry, "allies")) el.appendChild(pill);
		},
	};
}

function file(path: string): TFile {
	const f = new TFile();
	f.path = path;
	return f;
}

function setup(allies: string[]): {
	view: CardBasesView;
	container: HTMLElement;
	app: App;
	onEntryClick: ReturnType<typeof vi.fn>;
	tobias: TFile;
} {
	const app = new App();
	const tobias = file(TOBIAS);
	vi.mocked(app.metadataCache.getFileCache).mockReturnValue(
		{ frontmatter: { allies } } as ReturnType<typeof app.metadataCache.getFileCache>,
	);
	vi.mocked(app.metadataCache.getFirstLinkpathDest).mockImplementation((l) =>
		l === "Tobias Ferro" ? tobias : null,
	);
	const onEntryClick = vi.fn();
	const container = document.createElement("div");
	document.body.appendChild(container);
	const view = new CardBasesView("story-forge-hero", new QueryController(), container, {
		app,
		registry: createCardRegistry(pillCard()),
		cardId: "hero",
		onEntryClick,
	});
	const entry = new BasesEntry();
	entry.file = file(MARA);
	entry.getValue.mockImplementation(() => ({ toString: (): string => allies.join(", ") }));
	const result = new BasesQueryResult();
	result.data = [entry];
	view.data = result;
	view.onDataUpdated();
	return { view, container, app, onEntryClick, tobias };
}

function pill(container: HTMLElement, n = 0): HTMLElement {
	return container.querySelectorAll<HTMLElement>(".sf-cx-relpill")[n]!;
}

function click(el: HTMLElement, meta = false): void {
	el.dispatchEvent(new MouseEvent("click", { bubbles: true, metaKey: meta }));
}

describe("CardBasesView — link pills", () => {
	it("a modifier click opens the pill's note, not the card's", () => {
		const { container, onEntryClick } = setup(["[[Tobias Ferro]]"]);
		click(pill(container), true);
		expect(onEntryClick).toHaveBeenCalledTimes(1);
		expect(onEntryClick).toHaveBeenCalledWith(TOBIAS);
		container.remove();
	});

	it("a plain click does nothing (inspect stays a recorded no-op)", () => {
		const { container, onEntryClick } = setup(["[[Tobias Ferro]]"]);
		click(pill(container));
		expect(onEntryClick).not.toHaveBeenCalled();
		container.remove();
	});

	it("a modifier click on an unresolved pill opens nothing — not the card's note either", () => {
		const { container, onEntryClick } = setup(["[[Nobody]]"]);
		click(pill(container), true);
		expect(onEntryClick).not.toHaveBeenCalled();
		container.remove();
	});

	it("a modifier click on a plain-text pill still reaches the card body", () => {
		const { container, onEntryClick } = setup(["shortblade"]);
		click(pill(container), true);
		expect(onEntryClick).toHaveBeenCalledWith(MARA);
		container.remove();
	});
});

describe("CardBasesView — right-click on a pill", () => {
	it("shows the file menu for the pill's file", () => {
		const { container, app, tobias } = setup(["[[Tobias Ferro]]"]);
		const evt = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
		pill(container).dispatchEvent(evt);

		const call = vi.mocked(app.workspace.trigger).mock.calls[0]!;
		expect(call[0]).toBe("file-menu");
		expect(call[2]).toBe(tobias);
		expect(evt.defaultPrevented).toBe(true);
		container.remove();
	});

	it("does nothing for an unresolved pill", () => {
		const { container, app } = setup(["[[Nobody]]"]);
		const evt = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
		pill(container).dispatchEvent(evt);

		expect(app.workspace.trigger).not.toHaveBeenCalled();
		expect(evt.defaultPrevented).toBe(false);
		container.remove();
	});

	it("survives a repaint and is released on unload", () => {
		const { view, container, app } = setup(["[[Tobias Ferro]]"]);
		view.onDataUpdated();
		pill(container).dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
		expect(app.workspace.trigger).toHaveBeenCalledTimes(1);

		view.unload();
		pill(container).dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
		expect(app.workspace.trigger).toHaveBeenCalledTimes(1);
		container.remove();
	});
});
