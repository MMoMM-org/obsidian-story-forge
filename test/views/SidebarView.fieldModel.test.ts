/**
 * The Workbench editor takes its fields from the FieldModel (T6.3): a real
 * `SidebarView` in edit mode over a vault of FileClasses, so the whole route from
 * `getFileClassesFolder` to the rendered rows is exercised.
 *
 * @ref docs/XDD/adr/0002-fileclass-driven-editor.md — the three tiers
 * @ref docs/XDD/specs/008-codex-surface/plan/phase-6.md — T6.3
 */

import { describe, expect, it, vi } from "vitest";
import {
	App,
	WorkspaceLeaf,
	createMockCachedMetadata,
	createMockTFile,
	type TFile,
} from "obsidian";
import type { ConsentGate } from "consent/ConsentGate";
import type { NativeScopingEngine } from "engines/NativeScopingEngine";
import type { EngineRegistry } from "engines/QueryEngine";
import { SIDEBAR_VIEW_TYPE } from "pluginConstants";
import type { EntityKind, NoteContext } from "scoping/NoteContext";
import { DEFAULT_FILE_CLASSES_FOLDER } from "types/index";
import { SidebarView } from "views/SidebarView";

type Fm = Record<string, unknown>;

interface PrivateView {
	currentRecord: null;
	_editMode: boolean;
	_renderResolved(body: HTMLElement, ctx: NoteContext): Promise<void>;
}

const FC_CHARACTER: Fm = {
	tagNames: ["canon/character"],
	fieldsOrder: ["f-type", "f-name", "f-age"],
	fields: [
		{ id: "f-type", name: "type", type: "Select", options: { valuesList: { "1": "character" } } },
		{ id: "f-name", name: "name", type: "Input", options: {} },
		{ id: "f-age", name: "age", type: "Number", options: {} },
	],
};

const FC_ISEKAI: Fm = {
	extends: "fc-character",
	fieldsOrder: ["u-level"],
	fields: [{ id: "u-level", name: "level", type: "Number", options: {} }],
};

const note = createMockTFile({ basename: "Mara", path: "30 Canon/Mara.md" });

interface World {
	app: App;
	nativeEngine: NativeScopingEngine & { render: ReturnType<typeof vi.fn> };
}

function world(frontmatter: Fm, fileClasses: Record<string, Fm> = {}, folder = DEFAULT_FILE_CLASSES_FOLDER): World {
	const app = new App();
	const files = new Map(
		Object.keys(fileClasses).map((name) => [name, createMockTFile({ basename: name, path: `${folder}/${name}.md` })]),
	);
	const byPath = new Map<string, TFile>([...files.values()].map((file) => [file.path, file]));
	app.fileManager._setFrontmatter(note.path, frontmatter);
	vi.mocked(app.metadataCache.getFileCache).mockImplementation((file) => {
		if (file === note) return createMockCachedMetadata({ frontmatter: app.fileManager._getFrontmatter(note.path) });
		const declared = fileClasses[file.basename];
		return declared ? createMockCachedMetadata({ frontmatter: declared }) : null;
	});
	vi.mocked(app.vault.getMarkdownFiles).mockReturnValue([...files.values(), note]);
	vi.mocked(app.vault.getAbstractFileByPath).mockImplementation((path) => byPath.get(path) ?? null);
	const nativeEngine = { kind: "native", teardown: vi.fn(), render: vi.fn(async () => {}) };
	return { app, nativeEngine: nativeEngine as unknown as World["nativeEngine"] };
}

async function open(w: World, getFolder?: () => string, editMode = true, kind: EntityKind = "character"): Promise<HTMLElement> {
	const leaf = new WorkspaceLeaf();
	leaf.app = w.app;
	leaf.view.getViewType = vi.fn(() => SIDEBAR_VIEW_TYPE);
	const registry = { get: vi.fn() } as unknown as EngineRegistry;
	const gate = { evaluate: vi.fn() } as unknown as ConsentGate;
	const view = new SidebarView(leaf, registry, gate, w.nativeEngine, undefined, undefined, undefined, getFolder);
	await view.onOpen();
	const body = view.contentEl.querySelector(".sf-body") as HTMLElement;
	const ctx: NoteContext = {
		activeFile: note,
		activeKind: kind,
		entities: [],
		backlinks: [],
		frontmatter: w.app.fileManager._getFrontmatter(note.path),
		resolvedAt: 0,
	};
	const internals = view as unknown as PrivateView;
	internals.currentRecord = null;
	internals._editMode = editMode;
	await internals._renderResolved(body, ctx);
	return body;
}

function labels(body: HTMLElement): (string | null)[] {
	return Array.from(body.querySelectorAll("[data-sf-inspector-field-label]")).map((label) => label.textContent);
}

function control(body: HTMLElement, name: string): HTMLInputElement | null {
	return body.querySelector<HTMLInputElement>(`[data-sf-inspector-input="${name}"]`);
}

describe("the Workbench editor reads the FileClass chain (T6.3)", () => {
	const tagged = { tags: ["canon/character"], fileClass: "fc-character", type: "character", name: "Mara" };

	it("renders the fields the note's chain declares, including ones the old list never knew", async () => {
		const w = world({ ...tagged, fileClass: "fc-isekai", level: 3 }, { "fc-character": FC_CHARACTER, "fc-isekai": FC_ISEKAI });
		const body = await open(w);

		expect(labels(body)).toEqual(["type", "name", "age", "level"]);
		expect(control(body, "level")?.value).toBe("3");
	});

	it("reads the folder through the getter", async () => {
		const w = world({ ...tagged, fileClass: "fc-isekai" }, { "fc-character": FC_CHARACTER, "fc-isekai": FC_ISEKAI }, "90 Elsewhere");
		const body = await open(w, () => "90 Elsewhere");

		expect(labels(body)).toContain("level");
	});

	it("never shows tags or fileClass, in either tier", async () => {
		const declared = await open(world(tagged, { "fc-character": FC_CHARACTER }));
		const undeclared = await open(world(tagged));

		expect(labels(declared)).not.toContain("tags");
		expect(labels(declared)).not.toContain("fileClass");
		expect(labels(undeclared)).not.toContain("tags");
		expect(labels(undeclared)).not.toContain("fileClass");
	});

	it("keeps type fixed where it is declared, where it is undeclared, and with no FileClass", async () => {
		const noType: Fm = { fieldsOrder: ["f-name"], fields: [{ id: "f-name", name: "name", type: "Input", options: {} }] };
		const declared = await open(world(tagged, { "fc-character": FC_CHARACTER }));
		const undeclared = await open(world(tagged, { "fc-character": noType }));
		const tier2 = await open(world(tagged));

		for (const body of [declared, undeclared, tier2]) {
			expect(labels(body)).toContain("type");
			expect(control(body, "type")).toBeNull();
		}
	});
});

describe("undeclared keys in the Workbench editor (T6.3)", () => {
	const declaredNote = { fileClass: "fc-character", type: "character", name: "Mara" };

	it("lists them after the declared fields, under an Other properties heading", async () => {
		const body = await open(world({ ...declaredNote, scratch: "note" }, { "fc-character": FC_CHARACTER }));

		expect(labels(body)).toEqual(["type", "name", "age", "scratch"]);
		const heading = body.querySelector(".sf-inspector-section");
		expect(heading?.textContent).toBe("Other properties");
		const row = body.querySelector('[data-sf-inspector-field-label="scratch"]')?.closest(".sf-inspector-field");
		expect(row?.previousElementSibling).toBe(heading);
	});

	it("draws no heading when nothing is undeclared", async () => {
		const body = await open(world(declaredNote, { "fc-character": FC_CHARACTER }));

		expect(body.querySelector(".sf-inspector-section")).toBeNull();
	});

	it("edits a string as text and a number as a number", async () => {
		const w = world({ ...declaredNote, scratch: "note", rank: 4 }, { "fc-character": FC_CHARACTER });
		const body = await open(w);

		const rank = control(body, "rank");
		if (!rank) throw new Error("no rank control");
		rank.value = "5";
		rank.dispatchEvent(new Event("input", { bubbles: true }));
		body.querySelector<HTMLElement>('[data-sf-inspector-commit="rank"]')?.click();

		await vi.waitFor(() => { expect(w.app.fileManager._getFrontmatter(note.path)["rank"]).toBe(5); }, { interval: 1 });
		expect(control(body, "scratch")?.value).toBe("note");
	});

	it("edits a boolean as a real boolean, never the string \"true\"", async () => {
		const w = world({ ...declaredNote, awakened: false }, { "fc-character": FC_CHARACTER });
		const body = await open(w);

		const box = control(body, "awakened");
		expect(box?.type).toBe("checkbox");
		expect(box?.checked).toBe(false);
		if (!box) throw new Error("no checkbox");
		// `input` by hand: jsdom runs no activation behaviour on a detached checkbox.
		box.checked = true;
		box.dispatchEvent(new Event("input", { bubbles: true }));
		body.querySelector<HTMLElement>('[data-sf-inspector-commit="awakened"]')?.click();

		await vi.waitFor(() => { expect(w.app.fileManager._getFrontmatter(note.path)["awakened"]).toBe(true); }, { interval: 1 });
	});

	it("shows a list as read-only chips and a nested map as read-only text", async () => {
		const body = await open(world({ ...declaredNote, skills: ["sword", "shield"], stats: { hp: 1 } }, { "fc-character": FC_CHARACTER }));

		expect(body.querySelectorAll(".sf-inspector-chip")).toHaveLength(2);
		expect(control(body, "skills")).toBeNull();
		expect(control(body, "stats")).toBeNull();
		expect(labels(body)).toContain("stats");
	});

	it("shows a list of non-strings read-only, even in a declared text field", async () => {
		const fc: Fm = { fieldsOrder: ["f-nick"], fields: [{ id: "f-nick", name: "nick", type: "Input", options: {} }] };
		const body = await open(world({ fileClass: "fc-character", nick: [1, 2] }, { "fc-character": fc }));

		expect(control(body, "nick")).toBeNull();
		expect(body.textContent).toContain("1, 2");
	});
});

describe("the edit affordance without a FileClass (T6.3)", () => {
	it("shows the note's own keys, typed by value", async () => {
		const w = world({ name: "Mara", age: 30 });
		const body = await open(w);

		expect(labels(body)).toEqual(["name", "age"]);
		expect(control(body, "age")?.getAttribute("data-sf-field-type")).toBe("number");
		expect(w.nativeEngine.render).not.toHaveBeenCalled();
	});

	it("falls back to the read view when there is nothing to edit", async () => {
		const w = world({});
		const body = await open(w);

		expect(body.querySelector(".sf-inspector-host")).toBeNull();
		expect(w.nativeEngine.render).toHaveBeenCalledOnce();
	});

	it("falls back to the read view when the only keys are classifiers", async () => {
		const w = world({ tags: ["canon/character"] });
		const body = await open(w);

		expect(body.querySelector(".sf-inspector-host")).toBeNull();
		expect(w.nativeEngine.render).toHaveBeenCalledOnce();
	});

	it("still refuses a note of an unknown kind", async () => {
		const w = world({ name: "Mara" });
		const body = await open(w, undefined, true, "unknown");

		expect(body.querySelector(".sf-inspector-host")).toBeNull();
		expect(w.nativeEngine.render).toHaveBeenCalledOnce();
	});
});

describe("the cost of a render (T6.3)", () => {
	const claimedByTag = { tags: ["canon/character"], name: "Mara" };

	it("scans the FileClasses at most once per edit-mode render", async () => {
		const w = world(claimedByTag, { "fc-character": FC_CHARACTER });
		await open(w);

		expect(vi.mocked(w.app.vault.getMarkdownFiles).mock.calls.length).toBeLessThanOrEqual(1);
	});

	it("does not scan at all in read mode", async () => {
		const w = world(claimedByTag, { "fc-character": FC_CHARACTER });
		await open(w, undefined, false);

		expect(vi.mocked(w.app.vault.getMarkdownFiles)).not.toHaveBeenCalled();
		expect(vi.mocked(w.app.vault.getAbstractFileByPath)).not.toHaveBeenCalled();
	});
});
