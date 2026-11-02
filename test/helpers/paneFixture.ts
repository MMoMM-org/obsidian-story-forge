/**
 * paneFixture.ts — a vault with one FileClass and two editable notes, and a
 * real `AnvilView` with the editor pane open on the first.
 *
 * The metadata cache READS BACK the writer's own store, so a committed value
 * round-trips as it does in Obsidian; an "external" edit is the store written
 * directly followed by a `changed` trigger.
 */

import { vi } from "vitest";
import {
	App,
	WorkspaceLeaf,
	createMockCachedMetadata,
	createMockTFile,
	type TFile,
} from "obsidian";
import { AnvilView } from "anvil/AnvilView";

function fcField(id: string, name: string, type: string, values?: string[]): Record<string, unknown> {
	const def: Record<string, unknown> = { id, name, type };
	if (values) def["options"] = { valuesList: Object.fromEntries(values.map((v, i) => [String(i + 1), v])) };
	return def;
}

export const FC_CHARACTER: Record<string, unknown> = {
	fieldsOrder: ["f-name", "f-role", "f-level", "f-active", "f-allies", "f-portrait", "f-born"],
	fields: [
		fcField("f-name", "name", "Input"),
		fcField("f-role", "role", "Select", ["protagonist", "supporting"]),
		fcField("f-level", "level", "Number"),
		fcField("f-active", "active", "Boolean"),
		fcField("f-allies", "allies", "MultiFile"),
		fcField("f-portrait", "portrait", "Media"),
		fcField("f-born", "born", "Date"),
	],
};

export function seedFrontmatter(): Record<string, unknown> {
	return {
		tags: ["canon/character"],
		fileClass: "fc-character",
		name: "Mara Stoneway",
		role: "protagonist",
		level: 3,
		active: true,
		allies: [],
		portrait: "[[mara.png]]",
	};
}

export const mara = createMockTFile({ basename: "Mara Stoneway", path: "30 Canon/31 Characters/Mara Stoneway.md" });
export const elke = createMockTFile({ basename: "Elke Stoneway", path: "30 Canon/31 Characters/Elke Stoneway.md" });
export const fcFile = createMockTFile({ basename: "fc-character", path: "00 Meta/FileClasses/fc-character.md" });

export function seedVault(app: App): void {
	app.fileManager._setFrontmatter(mara.path, seedFrontmatter());
	app.fileManager._setFrontmatter(elke.path, { ...seedFrontmatter(), name: "Elke Stoneway" });
	const byPath = new Map<string, TFile>([mara, elke, fcFile].map((f) => [f.path, f]));
	vi.mocked(app.metadataCache.getFileCache).mockImplementation((file) => {
		if (file.path === mara.path || file.path === elke.path) {
			return createMockCachedMetadata({ frontmatter: app.fileManager._getFrontmatter(file.path) });
		}
		if (file.path === fcFile.path) return createMockCachedMetadata({ frontmatter: FC_CHARACTER });
		return createMockCachedMetadata({ frontmatter: {} });
	});
	vi.mocked(app.vault.getMarkdownFiles).mockReturnValue([mara, elke, fcFile]);
	vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((p) => byPath.get(p) ?? null);
	app.workspace.getActiveFile = vi.fn(() => null);
	app.workspace.openLinkText = vi.fn(async () => {});
}

const opened: AnvilView[] = [];

/** Open a real AnvilView attached to the document, pane open on Mara. */
export async function openPane(app: App): Promise<AnvilView> {
	const leaf = new WorkspaceLeaf();
	(leaf as unknown as { app: App }).app = app;
	const view: AnvilView = new AnvilView(leaf, {
		drill: (f) => { view.inspect(f); },
		editor: { getDock: () => "bottom" },
	});
	opened.push(view);
	await view.onOpen();
	document.body.appendChild(view.contentEl);
	view.inspect(mara);
	return view;
}

/** Close every view opened by `openPane`; call from `afterEach`. */
export async function closePanes(): Promise<void> {
	while (opened.length > 0) {
		const view = opened.pop();
		view?.contentEl.remove();
		await view?.onClose();
	}
}

export function cellIn(host: HTMLElement, name: string): HTMLElement {
	const cell = host.querySelector<HTMLElement>(`[data-sf-ed-field="${name}"]`);
	if (!cell) throw new Error(`no control cell for ${name}`);
	return cell;
}

export function inputIn(host: HTMLElement, name: string): HTMLInputElement {
	const el = cellIn(host, name).querySelector<HTMLInputElement>("input");
	if (!el) throw new Error(`no input for ${name}`);
	return el;
}

/** Type a value and leave the box: `input` per keystroke, then `change`. */
export function typeInto(host: HTMLElement, name: string, value: string): void {
	const el = inputIn(host, name);
	el.value = value;
	el.dispatchEvent(new Event("input", { bubbles: true }));
	el.dispatchEvent(new Event("change", { bubbles: true }));
}

/** Type without settling: no `change`, so the box holds a draft. */
export function draftInto(host: HTMLElement, name: string, value: string): HTMLInputElement {
	const el = inputIn(host, name);
	el.focus();
	el.value = value;
	el.dispatchEvent(new Event("input", { bubbles: true }));
	return el;
}
