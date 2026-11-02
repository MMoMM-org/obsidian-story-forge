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
import { closePanes, draftInto, FC_CHARACTER, inputIn, mara, openPane, seedFrontmatter, seedVault } from "../helpers/paneFixture";

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

	describe("when the folder's event arrives before its file carries the new path", () => {
		const moved = "30 Canon/31 Renamed/Mara Stoneway.md";

		async function folderEventFirst(): Promise<{ app: App; view: Awaited<ReturnType<typeof openPane>>; file: TFile }> {
			const app = new App();
			seedVault(app);
			const view = await openPane(app);
			const file = createMockTFile({ basename: mara.basename, path: mara.path });
			vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((p) => (p === mara.path ? file : null));
			const folder = createMockTFile({ path: "30 Canon/31 Renamed" });
			app.vault._trigger("rename", folder, "30 Canon/31 Characters");
			return { app, view, file };
		}

		it("shows the fields once the file's own event follows, with no further click", async () => {
			const { app, view, file } = await folderEventFirst();
			expect(view.contentEl.querySelector('[data-sf-ed-field="name"]')).toBeNull();

			const oldPath = moveTo(app, file, moved);
			vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((p) => (p === moved ? file : null));
			app.vault._trigger("rename", file, oldPath);

			expect(inputIn(view.contentEl, "name").value).toBe("Mara Stoneway");
		});

		it("shows the fields when no file event follows at all", async () => {
			vi.useFakeTimers();
			const { app, view, file } = await folderEventFirst();

			moveTo(app, file, moved);
			vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((p) => (p === moved ? file : null));
			await vi.runAllTimersAsync();
			vi.useRealTimers();

			expect(inputIn(view.contentEl, "name").value).toBe("Mara Stoneway");
		});
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

describe("renaming the note while a pane field holds an uncommitted draft", () => {
	const NEW_PATH = "30 Canon/31 Characters/Mara Ironwright.md";

	async function renameWithDraft(): Promise<{ app: App; view: Awaited<ReturnType<typeof openPane>>; box: HTMLInputElement }> {
		const app = new App();
		seedVault(app);
		const view = await openPane(app);
		const file = createMockTFile({ basename: mara.basename, path: mara.path });
		vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((p) => (p === mara.path ? file : null));
		// The pane must hold the very TFile that Obsidian will rename in place.
		view.inspect(file);
		const box = draftInto(view.contentEl, "level", "5");
		const oldPath = moveTo(app, file, NEW_PATH);
		app.vault._trigger("rename", file, oldPath);
		return { app, view, box };
	}

	it("keeps the draft box, its text and its focus", async () => {
		const { view, box } = await renameWithDraft();
		await vi.runAllTimersAsync();

		expect(inputIn(view.contentEl, "level")).toBe(box);
		expect(box.value).toBe("5");
		expect(document.activeElement).toBe(box);
	});

	it("commits the draft to the renamed note, then shows the new path", async () => {
		const { app, view, box } = await renameWithDraft();

		box.dispatchEvent(new Event("change", { bubbles: true }));
		await vi.runAllTimersAsync();
		box.blur();
		await vi.runAllTimersAsync();

		expect(app.fileManager._getFrontmatter(NEW_PATH)["level"]).toBe(5);
		expect(app.fileManager._getFrontmatter(mara.path)["level"]).not.toBe(5);
		expect(shownPath(view)).toBe(NEW_PATH);
	});

	it("shows the new path once focus leaves, with no write to trigger it", async () => {
		const { view, box } = await renameWithDraft();
		await vi.runAllTimersAsync();
		expect(shownPath(view)).toBe(mara.path);

		box.blur();

		expect(shownPath(view)).toBe(NEW_PATH);
	});
});
