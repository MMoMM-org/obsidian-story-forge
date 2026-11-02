/**
 * AnvilView.titleAndLinkSource.test.ts — the tab title stays true on every Anvil
 * tab, and a link resolves relative to the note it sits in.
 */

import { describe, expect, it, vi } from "vitest";
import { App, WorkspaceLeaf, type TFile } from "obsidian";
import { createMockCachedMetadata, createMockTFile } from "../__mocks__/obsidian";
import { AnvilView } from "anvil/AnvilView";
import { ICON } from "pluginConstants";

const mara = createMockTFile({ basename: "Mara Stoneway", path: "30 Canon/31 Characters/Mara Stoneway.md" });
const tobias = createMockTFile({ basename: "Tobias Ferro", path: "30 Canon/31 Characters/Tobias Ferro.md" });

async function openCodex(): Promise<{ app: App; view: AnvilView }> {
	const app = new App();
	const cache = createMockCachedMetadata({
		frontmatter: { tags: ["canon/character"], allies: ["[[Tobias Ferro]]"] },
	});
	vi.mocked(app.metadataCache.getFileCache).mockImplementation((f) => (f === mara ? cache : null));
	vi.mocked(app.metadataCache.getFirstLinkpathDest).mockImplementation((l) => (l === "Tobias Ferro" ? tobias : null));
	vi.mocked(app.vault.getMarkdownFiles).mockReturnValue([mara] as TFile[]);
	vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((p) => (p === mara.path ? mara : null));
	app.workspace.getActiveFile = vi.fn(() => null);
	const leaf = new WorkspaceLeaf();
	(leaf as unknown as { app: App }).app = app;
	const view: AnvilView = new AnvilView(leaf, {
		settings: { getLinkClickAction: () => "drill" },
		drill: (f) => view.inspect(f),
	});
	await view.onOpen();
	view.setLayout("codex");
	document.body.appendChild(view.contentEl);
	return { app, view };
}

describe("AnvilView tab title", () => {
	it.each(["codex", "timeline", "plotgrid", "plotlines", "kanban"] as const)(
		"reads 'Anvil' with the stable icon on %s, because Obsidian never re-reads it on a tab switch",
		async (layout) => {
			const { view } = await openCodex();
			view.setLayout(layout);
			expect(view.getDisplayText()).toBe("Anvil");
			expect(view.getIcon()).toBe(ICON);
		},
	);
});

describe("AnvilView link resolution source", () => {
	it("resolves a card pill relative to the card's note", async () => {
		const { app, view } = await openCodex();
		const pill = view.contentEl.querySelector<HTMLElement>('.sf-cx-relpill[data-sf-link="Tobias Ferro"]');
		pill!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		expect(app.metadataCache.getFirstLinkpathDest).toHaveBeenCalledWith("Tobias Ferro", mara.path);
	});

	it("resolves an editor chip relative to the note in the pane", async () => {
		const { app, view } = await openCodex();
		view.inspect(mara);
		vi.mocked(app.metadataCache.getFirstLinkpathDest).mockClear();
		// The fixture has no FileClass, so the pane renders no real chips.
		const chip = document.createElement("span");
		chip.setAttribute("data-sf-link", "Tobias Ferro");
		view.contentEl.querySelector(".sf-ed")!.appendChild(chip);
		chip.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		expect(app.metadataCache.getFirstLinkpathDest).toHaveBeenCalledWith("Tobias Ferro", mara.path);
	});
});
