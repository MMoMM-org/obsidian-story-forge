/**
 * AnvilView — a Card title click, gated by `cardTitleOpensNote`.
 *
 * Setting on: plain click opens the note in a NEW tab
 * (`openLinkText(path, "", true)`); off: the pane (inspect). A modifier
 * inverts. A pill and the card body keep their own behaviour. Nothing writes.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { App, WorkspaceLeaf } from "obsidian";
import { createMockTFile } from "../__mocks__/obsidian";
import { AnvilView } from "anvil/AnvilView";
import { nativeCardEntry, type CardEntry, type CardRenderer } from "codex/cardRegistry";
import { nativeTileField } from "codex/cardTileField";
import { buildCardWrapper } from "codex/cardWrapper";
import { entryPills } from "codex/cards/shared";

const note = createMockTFile({ basename: "Mara", path: "30 Canon/Mara.md" });
const ally = createMockTFile({ basename: "Tobias Ferro", path: "30 Canon/Tobias Ferro.md" });

const card: CardRenderer = {
	id: "t",
	label: "T",
	render(entry: CardEntry, el, deps): void {
		el.appendChild(deps.nameEl(entry));
		for (const p of entryPills(entry, "allies")) el.appendChild(p);
	},
};

function click(el: Element | null, ctrl = false): void {
	if (!el) throw new Error("no element");
	el.dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: ctrl }));
}

async function setup(opts: { opensNote: () => boolean; linkClick?: "drill" | "open" }) {
	const app = new App();
	vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((p) => (p === note.path ? note : null));
	vi.mocked(app.metadataCache.getFirstLinkpathDest).mockImplementation((l) => (l === "Tobias Ferro" ? ally : null));
	vi.mocked(app.vault.getMarkdownFiles).mockReturnValue([note, ally]);
	app.workspace.getActiveFile = vi.fn(() => note);
	app.workspace.openLinkText = vi.fn(async () => {});
	const leaf = new WorkspaceLeaf();
	(leaf as unknown as { app: App }).app = app;
	const drill = vi.fn();
	const view = new AnvilView(leaf, {
		drill,
		settings: {
			getLinkClickAction: () => opts.linkClick ?? "drill",
			getCardTitleOpensNote: opts.opensNote,
		},
	});
	await view.onOpen();
	const w = buildCardWrapper(nativeCardEntry(note.path, { allies: ["[[Tobias Ferro]]"] }), card, {
		compact: false,
		resolveAsset: (r) => r,
		tileField: nativeTileField,
	});
	view.contentEl.appendChild(w);
	return { app, drill, w };
}

describe("AnvilView card title click", () => {
	let on = true;
	beforeEach(() => { on = true; });

	it("setting on: opens the note in a new tab and does not inspect", async () => {
		const { app, drill, w } = await setup({ opensNote: () => on });
		click(w.querySelector(".sf-cx-name"));
		expect(app.workspace.openLinkText).toHaveBeenCalledWith(note.path, "", true);
		expect(drill).not.toHaveBeenCalled();
	});

	it("setting off: shows the pane, opens nothing", async () => {
		on = false;
		const { app, drill, w } = await setup({ opensNote: () => on });
		click(w.querySelector(".sf-cx-name"));
		expect(drill).toHaveBeenCalledTimes(1);
		expect(app.workspace.openLinkText).not.toHaveBeenCalled();
	});

	it("modifier inverts both ways", async () => {
		const { app, drill, w } = await setup({ opensNote: () => on });
		click(w.querySelector(".sf-cx-name"), true);
		expect(drill).toHaveBeenCalledTimes(1);
		expect(app.workspace.openLinkText).not.toHaveBeenCalled();
		on = false;
		click(w.querySelector(".sf-cx-name"), true);
		expect(app.workspace.openLinkText).toHaveBeenCalledWith(note.path, "", true);
	});

	it("reads the setting per click: a flip needs no reload", async () => {
		const { app, drill, w } = await setup({ opensNote: () => on });
		click(w.querySelector(".sf-cx-name"));
		on = false;
		click(w.querySelector(".sf-cx-name"));
		expect(app.workspace.openLinkText).toHaveBeenCalledTimes(1);
		expect(drill).toHaveBeenCalledTimes(1);
	});

	it("card body click still opens the pane whatever the setting", async () => {
		const { app, drill, w } = await setup({ opensNote: () => on });
		click(w);
		expect(drill).toHaveBeenCalledTimes(1);
		expect(app.workspace.openLinkText).not.toHaveBeenCalled();
	});

	it("a relation pill keeps following linkClickAction (open => same tab, not new tab)", async () => {
		const { app, w } = await setup({ opensNote: () => on, linkClick: "open" });
		click(w.querySelector(".sf-cx-relpill"));
		expect(app.workspace.openLinkText).toHaveBeenCalledWith(ally.path, "", false);
	});

	it("a relation pill under drill inspects and never opens a tab, even with the title setting on", async () => {
		const { app, drill, w } = await setup({ opensNote: () => on, linkClick: "drill" });
		click(w.querySelector(".sf-cx-relpill"));
		expect(drill).toHaveBeenCalledTimes(1);
		expect(app.workspace.openLinkText).not.toHaveBeenCalled();
	});
});
