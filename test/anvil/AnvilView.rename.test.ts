/**
 * AnvilView.rename.test.ts — renaming the note the editor pane shows (or a
 * folder above it) retargets the pane instead of leaving a dead one.
 *
 * obsidian.d.ts `Vault.on('rename')` delivers `(file, oldPath)` with the file
 * ALREADY carrying its new path. A folder rename is handled both ways Obsidian
 * may deliver it: the folder itself (prefix retarget) or each child's own event.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, TFolder, createMockCachedMetadata, createMockTFile, type TFile } from "obsidian";
import { EDITOR_PATH_ATTR } from "editor/editorPane";
import { closePanes, FC_CHARACTER, inputIn, mara, openPane, seedFrontmatter, seedVault } from "../helpers/paneFixture";

beforeEach(() => { vi.useFakeTimers(); });
afterEach(async () => {
	await closePanes();
	vi.useRealTimers();
});

/** Move `file` the way Obsidian does: the TFile gets its new path, the vault re-indexes it. */
function moveTo(app: App, file: TFile, newPath: string): string {
	const oldPath = file.path;
	app.fileManager._setFrontmatter(newPath, app.fileManager._getFrontmatter(oldPath));
	Object.assign(file, { path: newPath, name: newPath.split("/").pop() ?? newPath });
	file.basename = file.name.replace(/\.md$/, "");
	vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((p) => (p === newPath ? file : null));
	vi.mocked(app.metadataCache.getFileCache).mockImplementation((f) =>
		f.path === newPath
			? createMockCachedMetadata({ frontmatter: app.fileManager._getFrontmatter(newPath) })
			: createMockCachedMetadata({ frontmatter: FC_CHARACTER }),
	);
	return oldPath;
}

function shownPath(view: { contentEl: HTMLElement }): string | null {
	return view.contentEl.querySelector(".sf-ed")?.getAttribute(EDITOR_PATH_ATTR) ?? null;
}

describe("renaming the note the pane shows", () => {
	it("follows the note to its new path, with its title and fields", async () => {
		const app = new App();
		seedVault(app);
		const view = await openPane(app);
		const file = createMockTFile({ basename: mara.basename, path: mara.path });
		vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((p) => (p === mara.path ? file : null));

		const oldPath = moveTo(app, file, "30 Canon/31 Characters/Mara Ironwright.md");
		app.vault._trigger("rename", file, oldPath);

		expect(shownPath(view)).toBe("30 Canon/31 Characters/Mara Ironwright.md");
		expect(view.contentEl.querySelector(".sf-ed-title")?.textContent).toBe("Mara Ironwright");
		expect(inputIn(view.contentEl, "name").value).toBe("Mara Stoneway");
	});

	it("leaves the pane alone when some other note is renamed", async () => {
		const app = new App();
		seedVault(app);
		const view = await openPane(app);
		const other = createMockTFile({ basename: "Bram", path: "30 Canon/31 Characters/Bram.md" });

		app.vault._trigger("rename", other, "30 Canon/31 Characters/Old Bram.md");

		expect(shownPath(view)).toBe(mara.path);
	});

	it("follows a folder rename delivered as the folder's own event", async () => {
		const app = new App();
		seedVault(app);
		const view = await openPane(app);
		const folder = Object.assign(new TFolder(), { path: "30 Canon/Heroes", name: "Heroes" });
		const file = createMockTFile({ basename: mara.basename, path: "30 Canon/Heroes/Mara Stoneway.md" });
		app.fileManager._setFrontmatter(file.path, seedFrontmatter());
		vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((p) => (p === file.path ? file : null));

		app.vault._trigger("rename", folder, "30 Canon/31 Characters");

		expect(shownPath(view)).toBe("30 Canon/Heroes/Mara Stoneway.md");
	});

	it("does not mistake a sibling folder sharing a name prefix for a parent", async () => {
		const app = new App();
		seedVault(app);
		const view = await openPane(app);
		const folder = Object.assign(new TFolder(), { path: "30 Canon/Other", name: "Other" });

		app.vault._trigger("rename", folder, "30 Canon/31 Char");

		expect(shownPath(view)).toBe(mara.path);
	});

	it("stops listening once the view unloads", async () => {
		const app = new App();
		seedVault(app);
		const view = await openPane(app);
		const file = createMockTFile({ basename: "Mara Ironwright", path: "30 Canon/31 Characters/Mara Ironwright.md" });
		view.unload();

		app.vault._trigger("rename", file, mara.path);

		expect(shownPath(view)).toBe(mara.path);
	});
});
